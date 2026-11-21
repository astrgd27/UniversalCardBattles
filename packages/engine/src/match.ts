// Match lifecycle, timing protocols (immediate / stack / chain) and the public engine API.
// All entry points are pure: they return a new Match and never mutate the one passed in.
import type {
  ActionCmd, Cmd, Ctx, Match, MatchOpts, Mod, Reason, SlotDef, SlotOpts, State, Template, Timing,
} from './types.ts';
import { apply, emit, triggerList } from './effects.ts';
import { ev } from './expr.ts';
import { hash, seedRng } from './rng.ts';
import { CostError, EngineError, activeId, baseCtx, list, masks, nextPlayer, num, objViewers, one, player, uniq } from './util.ts';
import { deckErrors, deckSections } from './validate.ts';

export class IllegalAction extends EngineError {
  reason: Reason;
  constructor(r: Reason) { super(r.msg); this.reason = r; }
}

const SETTLE_BUDGET = 200_000;
const IMMEDIATE: Timing = { mode: 'immediate' };
export const timingOf = (m: Mod, s: State): Timing => m.rules.phases[s.turn.phase].timing ?? m.rules.timing ?? IMMEDIATE;
const alive = (s: State) => s.players.filter((p) => !p.lost);

export function createMatch(m: Mod, opts: MatchOpts): Match {
  const R = m.rules;
  const n = opts.decks.length;
  if (n < R.players.min || n > R.players.max) throw new EngineError(`Needs ${R.players.min}-${R.players.max} players, got ${n}`);
  opts.decks.forEach((d, i) => {
    const errs = deckErrors(m, d);
    if (errs.length) throw new EngineError(`Deck ${i}: ${errs.join('; ')}`);
  });
  const s: State = {
    moduleId: m.manifest.moduleId, version: m.manifest.semanticVersion, rulesHash: m.hash, opts: structuredClone(opts),
    rng: seedRng(opts.seed), players: [], vars: { ...(R.gameVars ?? {}) }, objects: {}, zones: {}, turn: { n: 1, active: 0, phase: 0 },
    phaseState: 'enter', priority: null, holder: null, passes: 0, resolving: false, stack: [], effects: [], exec: [],
    triggers: [], nextTrig: null, dirty: false, pending: null, events: [], cmds: [], nextId: 1, nextDecision: 1, result: null,
  };
  for (let i = 0; i < n; i++) s.players.push({ id: `p${i}`, vars: { ...R.playerVars }, lost: false });
  for (const z of R.zones) {
    if (z.shared) s.zones[`shared:${z.id}`] = [];
    else for (const p of s.players) s.zones[`${p.id}:${z.id}`] = [];
  }
  let inst = 1;
  const make = (card: string, owner: string, key: string) => {
    const id = `o${s.nextId++}`;
    s.objects[id] = { id, inst: `i${inst++}`, card, owner, controller: owner, zone: key, vars: { ...(R.objectVars ?? {}) } };
    s.zones[key].push(id);
  };
  opts.decks.forEach((deck, i) => {
    for (const [zone, cards] of Object.entries(deckSections(m, deck))) for (const c of cards) make(c, `p${i}`, `p${i}:${zone}`);
  });
  for (const [zone, cards] of Object.entries(R.sharedDecks ?? {})) for (const c of cards) make(c, 'shared', `shared:${zone}`);
  if (R.setup?.length) s.exec.push({ list: R.setup, i: 0, ctx: baseCtx(s, 'p0') });
  settle(m, s);
  return { m, s };
}

// ---------- automatic advancement ----------
function endCheck(m: Mod, s: State): boolean {
  if (s.result) return true;
  const a = alive(s);
  if (s.players.length > 1 && a.length <= 1) {
    s.result = { winners: a.map((p) => p.id), reason: a.length ? 'lastStanding' : 'draw' };
    emit(m, s, { type: 'gameOver', ...s.result });
    return true;
  }
  return false;
}

function nextPhase(m: Mod, s: State) {
  s.priority = null;
  s.holder = null;
  s.passes = 0;
  s.phaseState = 'enter';
  if (++s.turn.phase < m.rules.phases.length) return;
  s.turn.phase = 0;
  s.turn.n++;
  s.turn.active = s.players.findIndex((p) => p.id === nextPlayer(s, activeId(s)));
  const keep = s.effects.filter((e) => e.until !== 'turn' && e.targets.some((t) => s.objects[t]));
  if (keep.length !== s.effects.length) {
    s.effects = keep;
    emit(m, s, { type: 'expired' });
  }
  if (m.rules.turnLimit && s.turn.n > m.rules.turnLimit) {
    s.result = { winners: [], reason: 'turnLimit' };
    emit(m, s, { type: 'gameOver', ...s.result });
  }
}

/** Takes the next trigger (rules first, then APNAP; a player orders their own). False = waiting on a decision. */
function takeTrigger(m: Mod, s: State, tm: Timing): boolean {
  let t = s.triggers.find((x) => x.ref.startsWith('rule:'));
  if (!t) {
    let ctrl = activeId(s);
    for (let k = 0; k < s.players.length && !s.triggers.some((x) => x.ctrl === ctrl); k++) ctrl = nextPlayer(s, ctrl);
    if (!s.triggers.some((x) => x.ctrl === ctrl)) ctrl = s.triggers[0].ctrl;
    const mine = s.triggers.filter((x) => x.ctrl === ctrl);
    t = mine.find((x) => x.id === s.nextTrig);
    if (!t) {
      if (mine.length > 1 && new Set(mine.map((x) => x.ref)).size > 1) {
        s.pending = {
          id: `d${s.nextDecision++}`, kind: 'order', player: ctrl, options: mine.map((x) => x.id), min: 1, max: 1, as: '',
          single: true,
          prompt: tm.mode === 'immediate' ? 'Choose which ability resolves next' : 'Choose which ability goes on the stack next (it resolves later)',
          labels: Object.fromEntries(mine.map((x) => [x.id, x.label])),
        };
        return false;
      }
      t = mine[0];
    }
  }
  s.nextTrig = null;
  s.triggers.splice(s.triggers.indexOf(t), 1);
  const effects = triggerList(m, t.ref);
  if (tm.mode === 'immediate' || !t.stack) {
    s.exec.push({ list: effects, i: 0, ctx: t.ctx });
    return true;
  }
  const src = t.ctx.$self && s.objects[t.ctx.$self] ? (t.ctx.$self as string) : null;
  const id = `k${s.nextId++}`;
  s.stack.push({
    id, kind: 'trigger', ctrl: t.ctrl, label: t.label, card: src ? s.objects[src].card : null, source: src, list: effects,
    ctx: t.ctx, slots: [], speed: t.speed,
  });
  emit(m, s, { type: 'stacked', item: id, kind: 'trigger', ctrl: t.ctrl, label: t.label });
  s.holder = activeId(s);
  s.passes = 0;
  return true;
}

function resolveTop(m: Mod, s: State, tm: Timing) {
  const it = s.stack.pop()!;
  if (tm.mode !== 'chain') { s.holder = activeId(s); s.passes = 0; }
  for (const sl of it.slots) {
    const rc = sl.recheck ?? true;
    const bound = list(it.ctx[sl.as]);
    if (rc === false || !bound.length) continue;
    const opts: string[] = rc === 'exists' ? [] : list(ev(m, s, sl.from, it.ctx)).map(String);
    const legal = bound.filter((t) => (rc === 'exists' ? t in s.objects || (player(s, t) && !player(s, t)!.lost) : opts.includes(t)));
    if (!legal.length) {
      emit(m, s, { type: 'fizzled', item: it.id, card: it.card });
      if (it.countered?.length) s.exec.push({ list: it.countered, i: 0, ctx: it.ctx });
      return;
    }
    it.ctx[sl.as] = Array.isArray(it.ctx[sl.as]) ? legal : legal[0];
  }
  emit(m, s, { type: 'resolve', item: it.id, card: it.card });
  s.exec.push({ list: it.list, i: 0, ctx: it.ctx });
}

/** Runs effects, state checks, triggers, stack resolution and automatic phases until a player must act. */
export function settle(m: Mod, s: State, budget = SETTLE_BUDGET) {
  while (budget-- > 0) {
    if (s.result || s.pending) return;
    if (s.exec.length) {
      const f = s.exec[s.exec.length - 1];
      if (f.i >= f.list.length) s.exec.pop();
      else apply(m, s, f.list[f.i++], f);
      continue;
    }
    if (s.dirty) {
      s.dirty = false;
      if (m.rules.stateChecks?.length) s.exec.push({ list: m.rules.stateChecks, i: 0, ctx: baseCtx(s, activeId(s)) });
      continue;
    }
    if (endCheck(m, s)) return;
    const tm = timingOf(m, s);
    if (s.triggers.length && !(s.resolving && tm.mode === 'chain')) {
      if (takeTrigger(m, s, tm)) continue;
      return;
    }
    if (s.resolving) {
      if (s.stack.length) { resolveTop(m, s, tm); continue; }
      s.resolving = false;
      s.holder = activeId(s);
      s.passes = 0;
      continue;
    }
    const ph = m.rules.phases[s.turn.phase];
    if (s.phaseState === 'enter') {
      s.phaseState = 'run';
      emit(m, s, { type: 'phase', turn: s.turn.n, active: activeId(s), phase: ph.id });
      if (ph.do?.length) s.exec.push({ list: ph.do, i: 0, ctx: baseCtx(s, activeId(s)) });
      continue;
    }
    if (s.phaseState === 'ended' || (ph.auto && !s.stack.length)) { nextPhase(m, s); continue; }
    if (!s.holder && tm.first !== undefined) s.holder = one(ev(m, s, tm.first, baseCtx(s, activeId(s))));
    const h = s.holder && player(s, s.holder) && !player(s, s.holder)!.lost ? s.holder : activeId(s);
    s.priority = tm.mode === 'immediate' ? activeId(s) : h;
    return;
  }
  throw new EngineError('Settle budget exceeded (unbounded loop in rules?)');
}

// ---------- actions ----------
const ok = (msg: string, children?: Reason[]): Reason => ({ ok: true, code: 'ok', msg, children });
const no = (code: string, msg: string, children?: Reason[]): Reason => ({ ok: false, code, msg, children });

function gate(s: State, p: string): Reason | null {
  if (s.result) return no('over', 'The game is over.');
  if (s.pending) return no('pending', s.pending.player === p ? 'Answer the pending decision first.' : 'Waiting for another player to decide.');
  if (s.priority !== p) return no('priority', 'You do not have priority.');
  return null;
}

function slotDefs(m: Mod, s: State, name: string, src: string | null): SlotDef[] {
  const a = m.rules.actions[name];
  return [...(a.targets ?? []), ...(a.cardTargets && src ? (m.card.get(s.objects[src].card)?.targets ?? []) : [])];
}

function evalAction(m: Mod, s: State, p: string, name: string, src: string | null): { r: Reason; slots: SlotOpts[]; ctx: Ctx } {
  const base = baseCtx(s, p);
  const fail = (r: Reason) => ({ r, slots: [], ctx: base });
  const g = gate(s, p);
  if (g) return fail(g);
  if (name === 'pass') return { r: ok('Pass'), slots: [], ctx: base };
  const a = m.rules.actions[name];
  if (!a) return fail(no('unknown', `Unknown action "${name}".`));
  const label = a.label ?? name;
  const phase = m.rules.phases[s.turn.phase].id;
  if (a.phases && !a.phases.includes(phase)) return fail(no('phase', `${label} is not allowed during the ${phase} phase.`));
  const tm = timingOf(m, s);
  const speed = a.speed ?? 1;
  const minR = tm.minResponse ?? 2;
  if (s.stack.length) {
    const need = tm.mode === 'chain' ? Math.max(minR, s.stack[s.stack.length - 1].speed) : minR;
    if (speed < need) return fail(no('speed', `${label} is too slow to respond now (needs speed ${need}).`));
  } else if (tm.mode !== 'alternate' && speed < minR && p !== activeId(s)) {
    return fail(no('speed', `${label} can only be used on your own turn.`));
  }
  if (a.source) {
    if (!src || !list(ev(m, s, a.source, base)).includes(src)) return fail(no('source', `That card cannot be used to ${label} right now.`));
  } else if (src) return fail(no('source', `${label} does not take a source card.`));
  const ctx = { ...base, $self: src };
  const checks = (a.req ?? []).map((q) => (ev(m, s, q.if, ctx) ? ok(q.why) : no('req', q.why)));
  if (checks.some((c) => !c.ok)) return fail(no('req', `${label}: requirements not met.`, checks));
  const slots: SlotOpts[] = [];
  for (const d of slotDefs(m, s, name, src)) {
    const options = uniq(list(ev(m, s, d.from, ctx)).map(String));
    const min = num(ev(m, s, d.min ?? 1, ctx));
    const prompt = d.prompt ?? 'target';
    if (options.length < min) return fail(no('targets', `${label}: no legal ${prompt}.`));
    slots.push({ as: d.as, options, min, max: Math.min(num(ev(m, s, d.max ?? 1, ctx)), options.length), prompt });
  }
  return { r: ok(label, checks), slots, ctx };
}

export function listActions({ m, s }: Match, p: string): Template[] {
  if (gate(s, p)) return [];
  const out: Template[] = [];
  for (const [name, a] of Object.entries(m.rules.actions)) {
    const srcs: (string | null)[] = a.source ? list(ev(m, s, a.source, baseCtx(s, p))) : [null];
    for (const src of srcs) {
      const { r, slots } = evalAction(m, s, p, name, src);
      if (r.ok) out.push({ action: name, label: a.label ?? name, source: src, slots });
    }
  }
  const tm = timingOf(m, s);
  const label = tm.mode === 'immediate' ? 'End phase' : s.stack.length ? 'Pass (let it resolve)' : 'Pass priority';
  out.push({ action: 'pass', label, source: null, slots: [] });
  return out;
}

function bindSlots(ctx: Ctx, slots: SlotOpts[], targets?: Record<string, string[]>) {
  for (const sl of slots) {
    const sel = targets?.[sl.as] ?? [];
    ctx[sl.as] = sl.max === 1 && sl.min <= 1 ? (sel[0] ?? null) : sel;
  }
}

/** Validates an action without changing anything. Rejections carry an explanation tree. */
export function proposeAction({ m, s }: Match, p: string, cmd: ActionCmd): Reason {
  const { r, slots, ctx } = evalAction(m, s, p, cmd.action, cmd.source ?? null);
  if (!r.ok) return r;
  for (const sl of slots) {
    const sel = cmd.targets?.[sl.as] ?? [];
    if (new Set(sel).size !== sel.length) return no('targets', `Duplicate ${sl.prompt}.`);
    if (sel.length < sl.min || sel.length > sl.max) return no('targets', `Choose ${sl.min === sl.max ? sl.min : `${sl.min}-${sl.max}`} ${sl.prompt}.`);
    if (sel.some((t) => !sl.options.includes(t))) return no('targets', `Illegal ${sl.prompt}.`);
  }
  const a = m.rules.actions[cmd.action];
  if (a?.check?.length) {
    const c = { ...ctx };
    bindSlots(c, slots, cmd.targets);
    const checks = a.check.map((q) => (ev(m, s, q.if, c) ? ok(q.why) : no('check', q.why)));
    if (checks.some((x) => !x.ok)) return no('check', `${a.label ?? cmd.action}: the chosen targets do not qualify.`, checks);
  }
  return r;
}
export const explainLegality = proposeAction;

/** Settles a cloned state; a cost that cannot be paid rejects the whole command (atomicity). */
function settleOrReject(m: Mod, s: State) {
  try {
    settle(m, s);
  } catch (e) {
    if (e instanceof CostError) throw new IllegalAction(no('cost', e.message));
    throw e;
  }
}

export function commitAction(match: Match, p: string, cmd: ActionCmd): Match {
  const r = proposeAction(match, p, cmd);
  if (!r.ok) throw new IllegalAction(r);
  const { m } = match;
  const s = structuredClone(match.s);
  const source = cmd.source ?? null;
  const { slots, ctx } = evalAction(m, s, p, cmd.action, source);
  const tm = timingOf(m, s);
  s.cmds.push({ t: 'act', p, action: cmd.action, source, targets: cmd.targets ?? {} });
  s.priority = null;
  if (cmd.action === 'pass') {
    emit(m, s, { type: 'pass', player: p });
    if (tm.mode === 'immediate') s.phaseState = 'ended';
    else if (++s.passes >= alive(s).length) {
      s.passes = 0;
      if (!s.stack.length) s.phaseState = 'ended';
      else if (tm.mode === 'chain') s.resolving = true;
      else resolveTop(m, s, tm);
    } else s.holder = nextPlayer(s, p);
  } else {
    bindSlots(ctx, slots, cmd.targets);
    const a = m.rules.actions[cmd.action];
    const vis = source ? objViewers(m, s.objects[source]) : null;
    emit(m, s, {
      type: 'action', player: p, action: cmd.action, source, card: source ? s.objects[source].card : null,
      targets: cmd.targets ?? {},
      ...masks([vis, ['source', 'card']], [Object.values(cmd.targets ?? {}).flat().some((t) => s.objects[t] && objViewers(m, s.objects[t]) !== null) ? [p] : null, ['targets']]),
    });
    const stacked = (tm.mode === 'stack' || tm.mode === 'chain') && a.stack !== false;
    s.passes = 0;
    s.holder = tm.mode === 'alternate' || (stacked && !(tm.retain ?? tm.mode === 'stack')) ? nextPlayer(s, p) : p;
    const tail = stacked ? [['@stack', cmd.action, slotDefs(m, s, cmd.action, source)]] : a.do;
    s.exec.push({ list: [...(a.cost ?? []), ...tail], i: 0, ctx });
  }
  settleOrReject(m, s);
  return { m, s };
}

export function submitDecision(match: Match, p: string, id: string, sel: string[]): Match {
  const pd = match.s.pending;
  const fail = (msg: string): never => { throw new IllegalAction(no('decision', msg)); };
  if (!pd || pd.id !== id) return fail('There is no such pending decision.');
  if (pd.player !== p) fail('This decision belongs to another player.');
  if (new Set(sel).size !== sel.length || sel.length < pd.min || sel.length > pd.max) fail(`Choose ${pd.min}-${pd.max}.`);
  if (sel.some((x) => !pd.options.includes(x))) fail('Illegal choice.');
  const { m } = match;
  const s = structuredClone(match.s);
  s.cmds.push({ t: 'dec', p, id, sel });
  s.pending = null;
  if (pd.kind === 'order') s.nextTrig = sel[0];
  else s.exec[s.exec.length - 1].ctx[pd.as] = pd.single ? sel[0] : sel;
  const hidden = !!pd.secret || pd.options.some((o) => s.objects[o] && objViewers(m, s.objects[o]) !== null);
  emit(m, s, { type: 'chose', player: p, decision: id, sel, ...masks([hidden ? [p] : null, ['sel']]) });
  settleOrReject(m, s);
  return { m, s };
}

// ---------- persistence & replay ----------
export const eventHash = (s: State) => hash(JSON.stringify(s.events));
export const serialize = ({ s }: Match) => JSON.stringify(s);
export function restore(m: Mod, json: string): Match {
  const s = JSON.parse(json) as State;
  if (s.moduleId !== m.manifest.moduleId || s.version !== m.manifest.semanticVersion) {
    throw new EngineError(`Save is for ${s.moduleId}@${s.version}, module is ${m.manifest.moduleId}@${m.manifest.semanticVersion}`);
  }
  if (s.rulesHash !== m.hash) throw new EngineError('Save was made with different rules or cards (hash mismatch)');
  return { m, s };
}
export function applyCmd(match: Match, c: Cmd): Match {
  return c.t === 'act' ? commitAction(match, c.p, c) : submitDecision(match, c.p, c.id, c.sel);
}
export function replay(m: Mod, opts: MatchOpts, cmds: Cmd[]): { match: Match; hash: string } {
  let match = createMatch(m, opts);
  for (const c of cmds) match = applyCmd(match, c);
  return { match, hash: eventHash(match.s) };
}
