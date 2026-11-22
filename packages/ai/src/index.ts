// Agents see only a View, the legal action templates and (optionally) possible worlds built by `determinize`.
// They never read the real match state, so they cannot use hidden information.
import type { ActionCmd, Match, Mod, Template, View } from '#engine';
import { IllegalAction, commitAction, rand, randInt, sample, scoreFor, seedRng, submitDecision } from '#engine';

export interface AgentInfo {
  player: string;
  mod: Mod;
  /** A possible world consistent with this player's information (see engine determinize). */
  sample(seed: number): Match;
}
export interface Agent {
  act(view: View, actions: Template[], info?: AgentInfo): ActionCmd;
  decide(view: View, info?: AgentInfo): string[];
}
type Pending = { id: string; options: string[]; min: number; max: number; player: string; kind?: string; each?: number };

/** Uniformly random legal play; passes with probability `passRate` when anything else is legal. */
export function randomAgent(seed: number, passRate = 0.15): Agent {
  const st = seedRng(seed);
  const between = (min: number, max: number) => min + randInt(st, max - min + 1);
  return {
    act(_view, actions) {
      const other = actions.filter((a) => a.action !== 'pass');
      const pass = actions.find((a) => a.action === 'pass');
      const t = other.length && (!pass || rand(st) >= passRate) ? other[randInt(st, other.length)] : (pass ?? actions[0]);
      const targets: Record<string, string[]> = {};
      for (const sl of t.slots) targets[sl.as] = sample(st, sl.options, between(sl.min, sl.max));
      return { action: t.action, source: t.source, targets };
    },
    decide(view) {
      const pd = view.pending as Pending;
      if (pd.kind === 'divide') return divisions(pd, st, 1)[0];
      return sample(st, pd.options, between(pd.min, pd.max));
    },
  };
}

export interface HeuristicOpts {
  samples?: number; // possible worlds per candidate (default: module ai.samples or 2)
  maxCandidates?: number; // candidate commands considered per decision
  bias?: Record<string, number>; // per-action score bonus (added to module ai.bias)
  horizon?: 'action' | 'pass'; // default: module ai.horizon or 'action'
}

/**
 * One-ply search: every candidate command is simulated on a few possible worlds, the stack is allowed to resolve
 * (assuming no responses) and the resulting position is scored with the module's ai.eval (see scoreFor).
 * Deterministic for a given seed; the simulation count, not wall-clock time, is the budget.
 */
export function heuristicAgent(seed: number, opts: HeuristicOpts = {}): Agent {
  const st = seedRng(seed);
  const fallback = randomAgent((seed ^ 0x2545f491) >>> 0, 0);
  const cap = opts.maxCandidates ?? 24;

  const selections = (options: string[], min: number, max: number, limit: number): string[][] => {
    if (max <= 1) return (min === 0 ? [[]] as string[][] : []).concat(options.slice(0, limit).map((o) => [o]));
    const out: string[][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < limit * 3 && out.length < limit; i++) {
      const pick = sample(st, options, min + randInt(st, max - min + 1)).sort();
      const k = pick.join(',');
      if (!seen.has(k)) { seen.add(k); out.push(pick); }
    }
    return out;
  };
  const candidates = (tpls: Template[]): ActionCmd[] => {
    const out: ActionCmd[] = [];
    for (const t of tpls) {
      let combos: Record<string, string[]>[] = [{}];
      for (const sl of t.slots) {
        const picks = selections(sl.options, sl.min, sl.max, 6);
        combos = combos.flatMap((c) => picks.map((p) => ({ ...c, [sl.as]: p }))).slice(0, 8);
      }
      for (const targets of combos) out.push({ action: t.action, source: t.source, targets });
    }
    if (out.length <= cap) return out;
    const keep = out.filter((c) => c.action === 'pass');
    return [...keep, ...sample(st, out.filter((c) => c.action !== 'pass'), cap - keep.length)];
  };

  /** Let pending decisions and stack/chain items resolve: everyone passes, pending choices are guessed at random. */
  const settleOut = (g: Match, p: string): Match => {
    for (let i = 0; i < 40 && !g.s.result; i++) {
      const pd = g.s.pending;
      if (pd) {
        // Our own follow-up choices and other players' (hidden, so unknowable) picks are guessed at random.
        g = submitDecision(g, pd.player, pd.id, fallback.decide({ pending: pd } as unknown as View));
        continue;
      }
      if (!g.s.stack.length || !g.s.priority) break;
      g = commitAction(g, g.s.priority, { action: 'pass' });
    }
    return g;
  };
  const evaluate = (info: AgentInfo, run: (g: Match) => Match, n: number, base: number): number => {
    let total = 0;
    for (let k = 0; k < n; k++) {
      try {
        total += scoreFor(settleOut(run(info.sample(base + k)), info.player), info.player);
      } catch (e) {
        if (e instanceof IllegalAction) return -Infinity;
        return -1e9; // the simulation hit an engine error in this world: avoid the line
      }
    }
    return total / n;
  };
  const pickBest = <T>(items: T[], score: (x: T, base: number) => number): T => {
    const base = randInt(st, 1 << 30);
    let best = items[0];
    let bs = -Infinity;
    for (const it of items) {
      const sc = score(it, base) + rand(st) * 1e-3; // tiny noise breaks ties without favouring list order
      if (sc > bs) { bs = sc; best = it; }
    }
    return best;
  };

  return {
    act(view, tpls, info) {
      if (!info || tpls.length <= 1) return fallback.act(view, tpls);
      const n = opts.samples ?? info.mod.ai?.samples ?? 2;
      const bias = { ...(info.mod.ai?.bias ?? {}), ...(opts.bias ?? {}) };
      // horizon "pass": a non-pass candidate is scored after the agent then passes too, so every line is compared at
      // the same point and passing is not penalised for whatever the end of the step brings.
      const thenPass = (opts.horizon ?? info.mod.ai?.horizon) === 'pass';
      const run = (cmd: ActionCmd) => (g: Match) => {
        let r = commitAction(g, info.player, cmd);
        if (!thenPass || cmd.action === 'pass') return r;
        r = settleOut(r, info.player);
        if (r.s.result || r.s.pending || r.s.priority !== info.player) return r;
        try { return commitAction(r, info.player, { action: 'pass' }); } catch { return r; }
      };
      return pickBest(candidates(tpls), (cmd, base) => evaluate(info, run(cmd), n, base) + (bias[cmd.action] ?? 0));
    },
    decide(view, info) {
      const pd = view.pending as Pending;
      if (!info || pd.options.length <= 1) return fallback.decide(view);
      const n = opts.samples ?? info.mod.ai?.samples ?? 2;
      return pickBest(pd.kind === 'divide' ? divisions(pd, st, 10) : selections(pd.options, pd.min, pd.max, 10), (sel, base) =>
        evaluate(info, (g) => submitDecision(g, info.player, pd.id, sel), n, base));
    },
  };
}

/**
 * Scripted policy (bosses, tutorials): the script may propose a command; if it is not among the legal templates
 * the agent falls back to `inner` and records the divergence.
 */
export function scriptedAgent(script: (view: View, actions: Template[]) => ActionCmd | null, inner: Agent): Agent & { divergences: string[] } {
  const divergences: string[] = [];
  const legal = (cmd: ActionCmd, tpls: Template[]) => tpls.some((t) => t.action === cmd.action && t.source === (cmd.source ?? null)
    && t.slots.every((sl) => { const sel = cmd.targets?.[sl.as] ?? []; return sel.length >= sl.min && sel.length <= sl.max && sel.every((x) => sl.options.includes(x)); }));
  const agent: Agent & { divergences: string[] } = {
    divergences,
    act(view, tpls, info) {
      const cmd = script(view, tpls);
      if (cmd && legal(cmd, tpls)) return cmd;
      if (cmd) divergences.push(`turn ${view.turn}: scripted ${cmd.action} was not legal`);
      return inner.act(view, tpls, info);
    },
    decide: (view, info) => inner.decide(view, info),
  };
  return agent;
}

/** Agent kinds by name (CLI, UI, tournaments). */
export function makeAgent(kind: string, seed: number): Agent {
  if (kind === 'random') return randomAgent(seed);
  if (kind === 'heuristic') return heuristicAgent(seed);
  throw new Error(`Unknown agent "${kind}" (random, heuristic)`);
}

/**
 * Candidate answers to a `divide` decision (sel repeats an id once per point): everything on one recipient (after
 * each recipient's minimum), then random spreads. The first candidate for a random agent is a random spread.
 */
export function divisions(pd: Pending, st: number[], limit: number): string[][] {
  const base = pd.options.flatMap((o) => Array(pd.each ?? 0).fill(o));
  const rest = pd.min - base.length;
  const spread = () => [...base, ...Array.from({ length: rest }, () => pd.options[randInt(st, pd.options.length)])].sort();
  if (limit === 1) return [spread()];
  const out = pd.options.map((o) => [...base, ...Array(rest).fill(o)].sort());
  const seen = new Set(out.map((x) => x.join()));
  for (let i = 0; i < limit * 3 && out.length < limit; i++) { const x = spread(); if (!seen.has(x.join())) { seen.add(x.join()); out.push(x); } }
  return out.slice(0, Math.max(limit, pd.options.length));
}
