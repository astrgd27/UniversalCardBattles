// Effect primitives, the replacement pipeline, event emission and trigger detection. See docs/DSL.md.
import type { Ability, Ctx, Effect, EffectList, Frame, GEvent, Mod, Replacement, SlotDef, State } from './types.ts';
import { ev, scriptCtx } from './expr.ts';
import { rawVal, tsOf } from './layers.ts';
import { shuffle } from './rng.ts';
import {
  CostError, EngineError, activeId, baseCtx, list, masks, num, one, player, unionViewers, uniq, viewers, zkey, zoneIdOf,
  zoneOwnerOf,
} from './util.ts';

export const EFFECT_OPS = new Set([
  'draw', 'move', 'shuffle', 'set', 'inc', 'damage', 'destroy', 'lose', 'win', 'if', 'each', 'let', 'choose', 'run',
  'endPhase', 'emit', 'log', 'counter', 'modify', 'link', 'unlink', 'call',
]);

export function emit(m: Mod, s: State, e: { type: string; [k: string]: any }): GEvent {
  const event = { seq: s.events.length, ...e } as GEvent;
  s.events.push(event);
  s.dirty = true;
  collectTriggers(m, s, event);
  return event;
}

const push = (s: State, l: EffectList | undefined, ctx: Ctx) => {
  if (l?.length) s.exec.push({ list: l, i: 0, ctx });
};
const isActive = (m: Mod, zid: string, zones?: string[]) => (zones ? zones.includes(zid) : !!m.zone.get(zid)?.abilities);

// ---------- triggers ----------
const LKI_ON: Record<string, string> = { leave: 'moved', destroyed: 'destroyed' };

function collectTriggers(m: Mod, s: State, e: GEvent) {
  let k = 0;
  const queue = (ref: string, ab: Ability, ctx: Ctx, ctrl: string, name: string, rule: boolean) => {
    if (ab.if !== undefined && !ev(m, s, ab.if, ctx)) return;
    s.triggers.push({
      id: `t${e.seq}.${k++}`, ref, ctrl, ctx, label: `${name}: ${ab.text ?? ab.on}`, stack: ab.stack ?? !rule, speed: ab.speed ?? 1,
    });
  };
  const act = activeId(s);
  (m.rules.triggers ?? []).forEach((ab, i) => {
    if (ab.on === e.type) queue(`rule:${i}`, ab, { ...baseCtx(s, act), $e: e }, act, 'Rule', true);
  });
  for (const key in s.zones) {
    const zid = zoneIdOf(key);
    for (const id of s.zones[key]) {
      const o = s.objects[id];
      const d = m.card.get(o.card);
      d?.abilities?.forEach((ab, i) => {
        if (LKI_ON[ab.on] || !isActive(m, zid, ab.zones)) return;
        if (ab.on === 'enter' ? !(e.type === 'moved' && e.newObj === id) : ab.on !== e.type) return;
        queue(`card:${o.card}:${i}`, ab, { ...baseCtx(s, o.controller), $self: id, $e: e }, o.controller, d.name, false);
      });
    }
  }
  // Leave-play abilities use last-known information carried on the event.
  if (e.card && (e.type === 'moved' || e.type === 'destroyed')) {
    const d = m.card.get(e.card);
    d?.abilities?.forEach((ab, i) => {
      if (LKI_ON[ab.on] !== e.type || !isActive(m, e.from, ab.zones)) return;
      queue(`card:${e.card}:${i}`, ab, { ...baseCtx(s, e.controller), $self: e.newObj, $e: e }, e.controller, d.name, false);
    });
  }
}

export function triggerList(m: Mod, ref: string): EffectList {
  if (ref.startsWith('rule:')) return m.rules.triggers![+ref.slice(5)].do;
  const k = ref.lastIndexOf(':');
  return m.card.get(ref.slice(5, k))!.abilities![+ref.slice(k + 1)].do;
}

// ---------- replacement pipeline ----------
interface Cand { key: string; ts: number; def: Replacement; ctx: Ctx; name: string }

function replacementsFor(m: Mod, s: State, pe: any): Cand[] {
  const out: Cand[] = [];
  const consider = (key: string, ts: number, def: Replacement, ctx: Ctx, name: string) => {
    if (def.replace !== pe.type) return;
    const c = { ...ctx, $e: pe };
    if (def.if === undefined || ev(m, s, def.if, c)) out.push({ key, ts, def, ctx: c, name });
  };
  (m.rules.replacements ?? []).forEach((d, i) => consider(`rule:${i}`, 0, d, baseCtx(s, activeId(s)), 'Rule'));
  for (const key in s.zones) {
    const zid = zoneIdOf(key);
    for (const id of s.zones[key]) {
      const o = s.objects[id];
      const d = m.card.get(o.card);
      d?.replacements?.forEach((r, i) => {
        if (isActive(m, zid, r.zones)) consider(`${id}:${i}`, tsOf(id), r, { ...baseCtx(s, o.controller), $self: id }, d.name);
      });
    }
  }
  return out.sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0) || a.ts - b.ts || (a.key < b.key ? -1 : 1));
}

/**
 * Proposed event -> each applicable replacement once, in (order, timestamp) order -> commit.
 * Returns the commit result, or null if the event was replaced or no longer applies.
 */
function propose(m: Mod, s: State, ctx: Ctx, pe: any): any {
  const applied: string[] = [...(ctx.$$applied ?? [])];
  for (;;) {
    const r = replacementsFor(m, s, pe).find((c) => !applied.includes(c.key));
    if (!r) return commit(m, s, ctx, pe);
    applied.push(r.key);
    emit(m, s, { type: 'replaced', event: pe.type, by: r.name, how: r.def.instead ? 'instead' : 'modify' });
    if (r.def.instead) {
      push(s, r.def.instead, { ...r.ctx, $$applied: applied });
      return null;
    }
    const next = { ...pe };
    for (const [k, v] of Object.entries(r.def.modify ?? {})) next[k] = ev(m, s, v, r.ctx);
    pe = next;
  }
}

function commit(m: Mod, s: State, ctx: Ctx, pe: any): any {
  const R = m.rules;
  switch (pe.type) {
    case 'draw': {
      const deck = s.zones[zkey(m, pe.player, R.deckZone)];
      if (!deck.length) { emit(m, s, { type: 'drawFail', player: pe.player }); return 'fail'; }
      return propose(m, s, ctx, { type: 'move', obj: deck[0], to: R.handZone, player: pe.player, cause: 'draw' });
    }
    case 'move':
      return s.objects[pe.obj] ? moveObj(m, s, pe.obj, pe.to, pe.player ?? s.objects[pe.obj].owner, pe.pos) : null;
    case 'destroy': {
      const o = s.objects[pe.obj];
      if (!o) return null;
      const nid = propose(m, s, ctx, { type: 'move', obj: o.id, to: R.graveZone, player: o.owner, cause: 'destroy' });
      emit(m, s, { type: 'destroyed', obj: o.id, newObj: nid, card: o.card, owner: o.owner, controller: o.controller, from: zoneIdOf(o.zone) });
      return nid;
    }
    case 'damage': {
      const amt = num(pe.amount);
      const t = pe.target;
      const isP = !!player(s, t);
      if (amt <= 0 || (!isP && !s.objects[t])) return null;
      const cfg = R.damage ?? { player: 'life', object: 'dmg' };
      const v = isP ? cfg.player : cfg.object;
      setVar(m, s, t, v, rawVal(m, s, t, v) + (isP ? -amt : amt));
      emit(m, s, { type: 'damage', target: t, amount: amt, source: pe.source ?? null });
      return amt;
    }
    case 'lose': {
      const pl = player(s, pe.player);
      if (!pl || pl.lost) return null;
      pl.lost = true;
      emit(m, s, { type: 'lost', player: pl.id });
      return pl.id;
    }
  }
  throw new EngineError(`Cannot commit ${pe.type}`);
}

// ---------- primitives ----------
export function moveObj(m: Mod, s: State, id: string, zone: string, toPlayer: string, pos?: string): string {
  const o = s.objects[id];
  const fromKey = o.zone;
  const toKey = zkey(m, toPlayer, zone);
  const from = s.zones[fromKey];
  from.splice(from.indexOf(id), 1);
  delete s.objects[id];
  const nid = `o${s.nextId++}`;
  const owner = zoneOwnerOf(toKey);
  s.objects[nid] = {
    id: nid, inst: o.inst, card: o.card, owner: o.owner,
    controller: owner === 'shared' ? o.owner : owner, zone: toKey, vars: { ...(m.rules.objectVars ?? {}) },
  };
  if (pos === 'top') s.zones[toKey].unshift(nid);
  else s.zones[toKey].push(nid);
  const vf = viewers(m, fromKey);
  const vt = viewers(m, toKey);
  emit(m, s, {
    type: 'moved', obj: id, newObj: nid, card: o.card, owner: o.owner, controller: o.controller,
    from: zoneIdOf(fromKey), to: zone, fromPlayer: zoneOwnerOf(fromKey), toPlayer: owner,
    ...masks([vf, ['obj']], [vt, ['newObj']], [unionViewers(vf, vt), ['card']]),
  });
  return nid;
}

export function setVar(m: Mod, s: State, ref: any, name: string, val: number) {
  const p = player(s, ref);
  const o = p ? null : s.objects[ref];
  const vars = p ? p.vars : o?.vars;
  if (!vars) return;
  const old = rawVal(m, s, ref, name);
  if (old === val) return;
  vars[name] = val;
  emit(m, s, { type: 'changed', ref, name, from: old, to: val, ...masks([o ? viewers(m, o.zone) : null, ['ref', 'from', 'to']]) });
}

function choose(m: Mod, s: State, o: any, ctx: Ctx) {
  const single = (o.max ?? 1) === 1;
  const options = uniq(list(ev(m, s, o.from, ctx)).map(String));
  if (o.required && options.length < (o.min ?? 1)) throw new CostError(`Cannot pay: no ${o.prompt ?? 'choice'} available.`);
  const max = Math.min(o.max ?? 1, options.length);
  const min = Math.min(o.min ?? 1, max);
  if (max === 0) { ctx[o.as] = single ? null : []; return; }
  if (min === options.length) { ctx[o.as] = single ? options[0] : options; return; } // forced: no real choice
  s.pending = {
    id: `d${s.nextDecision++}`, kind: 'choose', player: one(ev(m, s, o.who ?? '$me', ctx)), options, min, max, as: o.as,
    single, prompt: o.prompt ?? 'Choose',
  };
}

/** Internal: puts an announced action on the stack (cost already paid). */
function stackAction(m: Mod, s: State, eff: Effect, ctx: Ctx) {
  const a = m.rules.actions[eff[1] as string];
  const src = ctx.$self && s.objects[ctx.$self] ? ctx.$self : null;
  const card = src ? s.objects[src].card : null;
  const id = `k${s.nextId++}`;
  s.stack.push({
    id, kind: 'action', ctrl: ctx.$me, label: card ? m.card.get(card)!.name : (a.label ?? (eff[1] as string)), card, source: src,
    list: a.do, ctx: { ...ctx }, slots: eff[2] as SlotDef[], speed: a.speed ?? 1, countered: a.countered,
  });
  emit(m, s, { type: 'stacked', item: id, kind: 'action', ctrl: ctx.$me, card });
}

export function apply(m: Mod, s: State, eff: Effect, f: Frame) {
  const ctx = f.ctx;
  const A = (i: number) => ev(m, s, eff[i], ctx);
  const each = (i: number, fn: (x: any) => any) => list(A(i)).map(fn);
  switch (eff[0]) {
    case 'draw': {
      const p = one(A(1));
      const n = eff.length > 2 ? num(A(2)) : 1;
      for (let i = 0; i < n; i++) if (propose(m, s, ctx, { type: 'draw', player: p }) === 'fail') break;
      return;
    }
    case 'move': {
      const opts = (eff[3] ?? {}) as any;
      const ids = A(1);
      const zone = A(2);
      const out: (string | null)[] = list(ids).map((id: string) => {
        if (!s.objects[id]) return null;
        const to = opts.player !== undefined ? one(ev(m, s, opts.player, ctx)) : s.objects[id].owner;
        return propose(m, s, ctx, { type: 'move', obj: id, to: zone, player: to, pos: opts.pos });
      });
      if (opts.as) ctx[opts.as] = Array.isArray(ids) ? out.filter(Boolean) : (out[0] ?? null);
      return;
    }
    case 'shuffle': {
      const key = zkey(m, one(A(1)), A(2));
      shuffle(s.rng, s.zones[key]);
      emit(m, s, { type: 'shuffled', zone: key });
      return;
    }
    case 'set': each(1, (r) => setVar(m, s, r, A(2), num(A(3)))); return;
    case 'inc': each(1, (r) => setVar(m, s, r, A(2), rawVal(m, s, r, A(2)) + num(A(3)))); return;
    case 'damage': {
      const amt = num(A(2));
      const src = eff.length > 3 ? one(A(3)) : null;
      if (amt > 0) each(1, (t) => propose(m, s, ctx, { type: 'damage', target: t, amount: amt, source: src }));
      return;
    }
    case 'destroy': each(1, (id) => propose(m, s, ctx, { type: 'destroy', obj: id })); return;
    case 'lose': each(1, (p) => propose(m, s, ctx, { type: 'lose', player: p })); return;
    case 'win': {
      const w = list(A(1));
      for (const pl of s.players) if (!w.includes(pl.id) && !pl.lost) propose(m, s, ctx, { type: 'lose', player: pl.id });
      return;
    }
    case 'if': push(s, (A(1) ? eff[2] : eff[3]) as EffectList, { ...ctx }); return;
    case 'each': {
      const items = list(A(1));
      for (let i = items.length - 1; i >= 0; i--) push(s, eff[3] as EffectList, { ...ctx, [eff[2] as string]: items[i] });
      return;
    }
    case 'let': ctx[eff[1] as string] = A(2); return;
    case 'choose': choose(m, s, eff[1], ctx); return;
    case 'run': {
      const o = s.objects[one(A(1))];
      if (!o) return;
      push(s, m.card.get(o.card)?.[eff[2] as string] as EffectList | undefined, { ...ctx, ...baseCtx(s, o.controller), $self: o.id });
      return;
    }
    case 'endPhase': s.phaseState = 'ended'; return;
    case 'emit': {
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries((eff[2] ?? {}) as object)) data[k] = ev(m, s, v, ctx);
      emit(m, s, { ...data, type: String(eff[1]) });
      return;
    }
    case 'log': emit(m, s, { type: 'log', msg: A(1) }); return;
    case 'counter':
      each(1, (id) => {
        const i = s.stack.findIndex((x) => x.id === id);
        if (i < 0) return;
        const [it] = s.stack.splice(i, 1);
        emit(m, s, { type: 'countered', item: it.id, card: it.card });
        push(s, it.countered, it.ctx);
      });
      return;
    case 'modify': {
      const spec = eff[2] as any;
      const targets = list(A(1)).filter((t) => s.objects[t]);
      if (!targets.length) return;
      const mods = (spec.mods ?? []).map((md: any) => ({ ...md, value: md.value === undefined ? undefined : ev(m, s, md.value, ctx) }));
      const ts = s.nextId++;
      s.effects.push({ id: `c${ts}`, ts, layer: spec.layer, targets, mods, until: spec.until ?? null });
      emit(m, s, { type: 'modified', id: `c${ts}`, targets });
      return;
    }
    case 'link':
    case 'unlink': {
      const name = eff[2] as string;
      const target = eff[0] === 'link' ? one(A(3)) : null;
      each(1, (id) => {
        const o = s.objects[id];
        if (!o) return;
        if (target === null) { if (!o.rel?.[name]) return; delete o.rel[name]; } else o.rel = { ...o.rel, [name]: target };
        emit(m, s, { type: eff[0] === 'link' ? 'linked' : 'unlinked', obj: id, name, target, ...masks([viewers(m, o.zone), ['obj', 'target']]) });
      });
      return;
    }
    case 'call': {
      const pr = m.rules.procedures?.[eff[1] as string];
      if (!pr) throw new EngineError(`Unknown procedure ${eff[1]}`);
      const c = scriptCtx(ctx, pr.params, eff.slice(2).map((_, i) => A(i + 2)));
      if (ctx.$$applied) c.$$applied = ctx.$$applied;
      push(s, pr.do, c);
      return;
    }
    case '@stack': stackAction(m, s, eff, ctx); return;
  }
  throw new EngineError(`Unknown effect op ${eff[0]}`);
}
