// Effect primitives, event emission and trigger detection. See docs/DSL.md.
import type { Ability, Ctx, Effect, EffectList, Frame, GEvent, Mod, State } from './types.ts';
import { ev, getProp } from './expr.ts';
import { shuffle } from './rng.ts';
import {
  EngineError, activeId, baseCtx, list, masks, num, one, player, unionViewers, uniq, viewers, zkey, zoneIdOf, zoneOwnerOf,
} from './util.ts';

export const EFFECT_OPS = new Set([
  'draw', 'move', 'shuffle', 'set', 'inc', 'damage', 'destroy', 'lose', 'win', 'if', 'each', 'let', 'choose', 'run',
  'endPhase', 'emit', 'log',
]);

export function emit(m: Mod, s: State, e: { type: string; [k: string]: any }): GEvent {
  const event = { seq: s.events.length, ...e } as GEvent;
  s.events.push(event);
  s.dirty = true;
  collectTriggers(m, s, event);
  return event;
}

const push = (s: State, list: EffectList | undefined, ctx: Ctx) => {
  if (list?.length) s.exec.push({ list, i: 0, ctx });
};

// ---------- triggers ----------
function queue(m: Mod, s: State, ref: string, ab: Ability, ctx: Ctx, ctrl: string) {
  if (ab.if !== undefined && !ev(m, s, ab.if, ctx)) return;
  s.triggers.push({ ref, ctrl, ctx });
}
const LKI_ON: Record<string, string> = { leave: 'moved', destroyed: 'destroyed' };

function collectTriggers(m: Mod, s: State, e: GEvent) {
  const act = activeId(s);
  (m.rules.triggers ?? []).forEach((ab, i) => {
    if (ab.on === e.type) queue(m, s, `rule:${i}`, ab, { ...baseCtx(s, act), $e: e }, act);
  });
  for (const key in s.zones) {
    const zid = zoneIdOf(key);
    const zd = m.zone.get(zid)!;
    for (const id of s.zones[key]) {
      const o = s.objects[id];
      m.card.get(o.card)?.abilities?.forEach((ab, i) => {
        if (LKI_ON[ab.on]) return;
        if (!(ab.zones ? ab.zones.includes(zid) : zd.abilities)) return;
        if (ab.on === 'enter' ? !(e.type === 'moved' && e.newObj === id) : ab.on !== e.type) return;
        queue(m, s, `card:${o.card}:${i}`, ab, { ...baseCtx(s, o.controller), $self: id, $e: e }, o.controller);
      });
    }
  }
  // Leave-play abilities use last-known information carried on the event.
  if (e.card && (e.type === 'moved' || e.type === 'destroyed')) {
    const zd = m.zone.get(e.from);
    m.card.get(e.card)?.abilities?.forEach((ab, i) => {
      if (LKI_ON[ab.on] !== e.type) return;
      if (!(ab.zones ? ab.zones.includes(e.from) : zd?.abilities)) return;
      queue(m, s, `card:${e.card}:${i}`, ab, { ...baseCtx(s, e.controller), $self: e.newObj, $e: e }, e.controller);
    });
  }
}

export function triggerList(m: Mod, ref: string): EffectList {
  if (ref.startsWith('rule:')) return m.rules.triggers![+ref.slice(5)].do;
  const k = ref.lastIndexOf(':');
  return m.card.get(ref.slice(5, k))!.abilities![+ref.slice(k + 1)].do;
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
  const old = p ? (vars[name] ?? 0) : num(getProp(m, s, ref, name));
  if (old === val) return;
  vars[name] = val;
  emit(m, s, { type: 'changed', ref, name, from: old, to: val, ...masks([o ? viewers(m, o.zone) : null, ['ref', 'from', 'to']]) });
}

function choose(m: Mod, s: State, o: any, ctx: Ctx) {
  const single = (o.max ?? 1) === 1;
  const options = uniq(list(ev(m, s, o.from, ctx)).map(String));
  const max = Math.min(o.max ?? 1, options.length);
  const min = Math.min(o.min ?? 1, max);
  if (max === 0) { ctx[o.as] = single ? null : []; return; }
  if (min === options.length) { ctx[o.as] = single ? options[0] : options; return; } // forced: no real choice
  s.pending = {
    id: `d${s.nextDecision++}`, player: one(ev(m, s, o.who ?? '$me', ctx)), options, min, max, as: o.as, single,
    prompt: o.prompt ?? 'Choose',
  };
}

export function apply(m: Mod, s: State, eff: Effect, f: Frame) {
  const ctx = f.ctx;
  const A = (i: number) => ev(m, s, eff[i], ctx);
  const R = m.rules;
  switch (eff[0]) {
    case 'draw': {
      const p = one(A(1));
      const n = eff.length > 2 ? num(A(2)) : 1;
      for (let i = 0; i < n; i++) {
        const deck = s.zones[zkey(m, p, R.deckZone)];
        if (!deck.length) { emit(m, s, { type: 'drawFail', player: p }); break; }
        moveObj(m, s, deck[0], R.handZone, p);
      }
      return;
    }
    case 'move': {
      const opts = (eff[3] ?? {}) as any;
      const ids = list(A(1));
      const out: string[] = [];
      for (const id of ids) {
        if (!s.objects[id]) continue;
        const to = opts.player !== undefined ? one(ev(m, s, opts.player, ctx)) : s.objects[id].owner;
        out.push(moveObj(m, s, id, A(2), to, opts.pos));
      }
      if (opts.as) ctx[opts.as] = Array.isArray(A(1)) ? out : (out[0] ?? null);
      return;
    }
    case 'shuffle': {
      const key = zkey(m, one(A(1)), A(2));
      shuffle(s.rng, s.zones[key]);
      emit(m, s, { type: 'shuffled', zone: key });
      return;
    }
    case 'set': for (const r of list(A(1))) setVar(m, s, r, A(2), num(A(3))); return;
    case 'inc': for (const r of list(A(1))) setVar(m, s, r, A(2), num(getProp(m, s, r, A(2))) + num(A(3))); return;
    case 'damage': {
      const amt = num(A(2));
      if (amt <= 0) return;
      const src = eff.length > 3 ? one(A(3)) : null;
      const cfg = R.damage ?? { player: 'life', object: 'dmg' };
      for (const t of list(A(1))) {
        const isP = !!player(s, t);
        if (!isP && !s.objects[t]) continue;
        const v = isP ? cfg.player : cfg.object;
        setVar(m, s, t, v, num(getProp(m, s, t, v)) + (isP ? -amt : amt));
        emit(m, s, { type: 'damage', target: t, amount: amt, source: src });
      }
      return;
    }
    case 'destroy':
      for (const id of list(A(1))) {
        const o = s.objects[id];
        if (!o) continue;
        const nid = moveObj(m, s, id, R.graveZone, o.owner);
        emit(m, s, { type: 'destroyed', obj: id, newObj: nid, card: o.card, owner: o.owner, controller: o.controller, from: zoneIdOf(o.zone) });
      }
      return;
    case 'lose':
      for (const p of list(A(1))) {
        const pl = player(s, p);
        if (pl && !pl.lost) { pl.lost = true; emit(m, s, { type: 'lost', player: p }); }
      }
      return;
    case 'win': {
      const w = list(A(1));
      for (const pl of s.players) if (!w.includes(pl.id) && !pl.lost) { pl.lost = true; emit(m, s, { type: 'lost', player: pl.id }); }
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
      const l = m.card.get(o.card)?.[eff[2] as string] as EffectList | undefined;
      push(s, l, { ...ctx, ...baseCtx(s, o.controller), $self: o.id });
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
  }
  throw new EngineError(`Unknown effect op ${eff[0]}`);
}
