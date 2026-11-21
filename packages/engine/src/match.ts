// Match lifecycle and the public engine API. All entry points are pure: they return a new Match.
import type {
  ActionCmd, Cmd, Ctx, Match, MatchOpts, Mod, Reason, SlotOpts, State, Template,
} from './types.ts';
import { apply, emit, triggerList } from './effects.ts';
import { ev } from './expr.ts';
import { hash, seedRng } from './rng.ts';
import { EngineError, activeId, baseCtx, list, masks, nextPlayer, uniq, viewers } from './util.ts';
import { deckErrors } from './validate.ts';

export class IllegalAction extends EngineError {
  reason: Reason;
  constructor(r: Reason) { super(r.msg); this.reason = r; }
}

const SETTLE_BUDGET = 200_000;

export function createMatch(m: Mod, opts: MatchOpts): Match {
  const R = m.rules;
  const n = opts.decks.length;
  if (n < R.players.min || n > R.players.max) throw new EngineError(`Needs ${R.players.min}-${R.players.max} players, got ${n}`);
  opts.decks.forEach((d, i) => {
    const errs = deckErrors(m, d);
    if (errs.length) throw new EngineError(`Deck ${i}: ${errs.join('; ')}`);
  });
  const s: State = {
    moduleId: m.manifest.moduleId, version: m.manifest.semanticVersion, opts: structuredClone(opts),
    rng: seedRng(opts.seed), players: [], objects: {}, zones: {}, turn: { n: 1, active: 0, phase: 0 },
    phaseState: 'enter', priority: null, exec: [], triggers: [], dirty: false, pending: null, events: [], cmds: [],
    nextId: 1, nextDecision: 1, result: null,
  };
  for (let i = 0; i < n; i++) s.players.push({ id: `p${i}`, vars: { ...R.playerVars }, lost: false });
  for (const z of R.zones) {
    if (z.shared) s.zones[`shared:${z.id}`] = [];
    else for (const p of s.players) s.zones[`${p.id}:${z.id}`] = [];
  }
  let inst = 1;
  opts.decks.forEach((deck, i) => {
    const key = `p${i}:${R.deckZone}`;
    for (const card of deck) {
      const id = `o${s.nextId++}`;
      s.objects[id] = { id, inst: `i${inst++}`, card, owner: `p${i}`, controller: `p${i}`, zone: key, vars: { ...(R.objectVars ?? {}) } };
      s.zones[key].push(id);
    }
  });
  if (R.setup?.length) s.exec.push({ list: R.setup, i: 0, ctx: baseCtx(s, 'p0') });
  settle(m, s);
  return { m, s };
}

// ---------- automatic advancement ----------
function endCheck(m: Mod, s: State): boolean {
  if (s.result) return true;
  const alive = s.players.filter((p) => !p.lost);
  if (s.players.length > 1 && alive.length <= 1) {
    s.result = { winners: alive.map((p) => p.id), reason: alive.length ? 'lastStanding' : 'draw' };
    emit(m, s, { type: 'gameOver', ...s.result });
    return true;
  }
  return false;
}

function nextPhase(m: Mod, s: State) {
  s.priority = null;
  s.phaseState = 'enter';
  if (++s.turn.phase < m.rules.phases.length) return;
  s.turn.phase = 0;
  s.turn.n++;
  s.turn.active = s.players.findIndex((p) => p.id === nextPlayer(s, activeId(s)));
  if (m.rules.turnLimit && s.turn.n > m.rules.turnLimit) {
    s.result = { winners: [], reason: 'turnLimit' };
    emit(m, s, { type: 'gameOver', ...s.result });
  }
}

/** Runs effects, state checks, triggers and automatic phases until a player must act. */
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
    if (s.triggers.length) {
      const act = activeId(s);
      const k = Math.max(0, s.triggers.findIndex((t) => t.ctrl === act)); // APNAP: active player's first
      const t = s.triggers.splice(k, 1)[0];
      s.exec.push({ list: triggerList(m, t.ref), i: 0, ctx: t.ctx });
      continue;
    }
    const ph = m.rules.phases[s.turn.phase];
    if (s.phaseState === 'enter') {
      s.phaseState = 'run';
      emit(m, s, { type: 'phase', turn: s.turn.n, active: activeId(s), phase: ph.id });
      if (ph.do?.length) s.exec.push({ list: ph.do, i: 0, ctx: baseCtx(s, activeId(s)) });
      continue;
    }
    if (s.phaseState === 'ended' || ph.auto) { nextPhase(m, s); continue; }
    s.priority = activeId(s);
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
  if (s.priority !== p) return no('priority', 'It is not your turn to act.');
  return null;
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
  if (a.source) {
    if (!src || !list(ev(m, s, a.source, base)).includes(src)) return fail(no('source', `That card cannot be used to ${label} right now.`));
  } else if (src) return fail(no('source', `${label} does not take a source card.`));
  const ctx = { ...base, $self: src };
  const checks = (a.req ?? []).map((q) => (ev(m, s, q.if, ctx) ? ok(q.why) : no('req', q.why)));
  if (checks.some((c) => !c.ok)) return fail(no('req', `${label}: requirements not met.`, checks));
  const defs = [...(a.targets ?? []), ...(a.cardTargets && src ? (m.card.get(s.objects[src].card)?.targets ?? []) : [])];
  const slots: SlotOpts[] = [];
  for (const d of defs) {
    const options = uniq(list(ev(m, s, d.from, ctx)).map(String));
    const min = d.min ?? 1;
    const prompt = d.prompt ?? 'target';
    if (options.length < min) return fail(no('targets', `${label}: no legal ${prompt}.`));
    slots.push({ as: d.as, options, min, max: Math.min(d.max ?? 1, options.length), prompt });
  }
  return { r: ok(label, checks), slots, ctx };
}

export function listActions({ m, s }: Match, p: string): Template[] {
  if (gate(s, p)) return [];
  const out: Template[] = [];
  const phase = m.rules.phases[s.turn.phase].id;
  for (const [name, a] of Object.entries(m.rules.actions)) {
    if (a.phases && !a.phases.includes(phase)) continue;
    const srcs: (string | null)[] = a.source ? list(ev(m, s, a.source, baseCtx(s, p))) : [null];
    for (const src of srcs) {
      const { r, slots } = evalAction(m, s, p, name, src);
      if (r.ok) out.push({ action: name, label: a.label ?? name, source: src, slots });
    }
  }
  out.push({ action: 'pass', label: 'End phase', source: null, slots: [] });
  return out;
}

/** Validates an action without changing anything. Rejections carry an explanation tree. */
export function proposeAction({ m, s }: Match, p: string, cmd: ActionCmd): Reason {
  const { r, slots } = evalAction(m, s, p, cmd.action, cmd.source ?? null);
  if (!r.ok) return r;
  for (const sl of slots) {
    const sel = cmd.targets?.[sl.as] ?? [];
    if (new Set(sel).size !== sel.length) return no('targets', `Duplicate ${sl.prompt}.`);
    if (sel.length < sl.min || sel.length > sl.max) return no('targets', `Choose ${sl.min === sl.max ? sl.min : `${sl.min}-${sl.max}`} ${sl.prompt}.`);
    if (sel.some((t) => !sl.options.includes(t))) return no('targets', `Illegal ${sl.prompt}.`);
  }
  return r;
}
export const explainLegality = proposeAction;

export function commitAction(match: Match, p: string, cmd: ActionCmd): Match {
  const r = proposeAction(match, p, cmd);
  if (!r.ok) throw new IllegalAction(r);
  const { m } = match;
  const s = structuredClone(match.s);
  const source = cmd.source ?? null;
  s.cmds.push({ t: 'act', p, action: cmd.action, source, targets: cmd.targets ?? {} });
  const { slots, ctx } = evalAction(m, s, p, cmd.action, source);
  s.priority = null;
  if (cmd.action === 'pass') {
    emit(m, s, { type: 'pass', player: p });
    s.phaseState = 'ended';
  } else {
    for (const sl of slots) {
      const sel = cmd.targets?.[sl.as] ?? [];
      ctx[sl.as] = sl.max === 1 && sl.min <= 1 ? (sel[0] ?? null) : sel;
    }
    const a = m.rules.actions[cmd.action];
    const vis = source ? viewers(m, s.objects[source].zone) : null;
    emit(m, s, {
      type: 'action', player: p, action: cmd.action, source, card: source ? s.objects[source].card : null,
      targets: cmd.targets ?? {}, ...masks([vis, ['source', 'card']]),
    });
    s.exec.push({ list: [...(a.cost ?? []), ...a.do], i: 0, ctx });
  }
  settle(m, s);
  return { m, s };
}

export function submitDecision(match: Match, p: string, id: string, sel: string[]): Match {
  const pd = match.s.pending;
  const fail = (code: string, msg: string) => { throw new IllegalAction(no(code, msg)); };
  if (!pd || pd.id !== id) fail('decision', 'There is no such pending decision.');
  if (pd!.player !== p) fail('decision', 'This decision belongs to another player.');
  if (new Set(sel).size !== sel.length || sel.length < pd!.min || sel.length > pd!.max) fail('decision', `Choose ${pd!.min}-${pd!.max}.`);
  if (sel.some((x) => !pd!.options.includes(x))) fail('decision', 'Illegal choice.');
  const { m } = match;
  const s = structuredClone(match.s);
  s.cmds.push({ t: 'dec', p, id, sel });
  s.exec[s.exec.length - 1].ctx[pd!.as] = pd!.single ? sel[0] : sel;
  s.pending = null;
  const hidden = pd!.options.some((o) => s.objects[o] && viewers(m, s.objects[o].zone) !== null);
  emit(m, s, { type: 'chose', player: p, decision: id, sel, ...masks([hidden ? [p] : null, ['sel']]) });
  settle(m, s);
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
