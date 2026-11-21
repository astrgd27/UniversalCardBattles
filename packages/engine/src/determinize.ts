// AI support: a "possible world" for one player (hidden identities re-sampled, RNG reseeded) and a position score.
import type { Ctx, Match, State } from './types.ts';
import { ev } from './expr.ts';
import { randInt, seedRng, shuffle } from './rng.ts';
import { baseCtx, num, objViewers, zoneIdOf } from './util.ts';
import { redact } from './view.ts';

/**
 * A copy of the match consistent with everything `p` knows and nothing more:
 * - objects whose identity p cannot see are re-sampled: p's own and shared ones are shuffled among themselves
 *   (p knows that multiset), other players' are drawn from the module's public card pool;
 * - the RNG is reseeded (no peeking at future draws), logs and other players' decklists are dropped,
 *   other players' committed secret picks are cleared, and stored events are redacted for p.
 * The result depends only on p's information: changing hidden identities never changes it.
 */
export function determinize({ m, s }: Match, p: string, seed: number): Match {
  const { events: _e, cmds: _c, ...rest } = s;
  const d = structuredClone(rest) as State;
  d.events = [];
  d.cmds = [];
  d.rng = seedRng(seed);
  d.opts = { ...d.opts, decks: d.opts.decks.map((x, i) => (`p${i}` === p ? x : [])) };
  const rng = seedRng((seed ^ 0x5bd1e995) >>> 0);
  const pool = m.cards.map((c) => c.id);
  const groups = new Map<string, string[]>();
  for (const o of Object.values(d.objects)) {
    const v = objViewers(m, o);
    if (v === null || v.includes(p)) continue;
    if (o.owner === p || o.owner === 'shared') groups.set(o.owner, [...(groups.get(o.owner) ?? []), o.id]);
    else o.card = pool[randInt(rng, pool.length)];
  }
  for (const ids of groups.values()) {
    const cards = ids.map((id) => d.objects[id].card).sort(); // sorted first: the real hidden order must not matter
    shuffle(rng, cards);
    ids.forEach((id, i) => { d.objects[id].card = cards[i]; });
  }
  const scrub = (ctx: Ctx) => {
    for (const k of Object.keys(ctx)) {
      const mm = k.match(/^\$\$commit\d+_(.+)$/);
      if (mm && mm[1] !== p) ctx[k] = null;
    }
    if (ctx.$e) ctx.$e = redact(ctx.$e, p);
  };
  d.exec.forEach((f) => scrub(f.ctx));
  d.triggers.forEach((t) => scrub(t.ctx));
  d.stack.forEach((it) => scrub(it.ctx));
  for (const w of d.windows ?? []) { w.saved.exec.forEach((f) => scrub(f.ctx)); w.saved.stack.forEach((it) => scrub(it.ctx)); }
  return { m, s: d };
}

/** Position value for p: terminal results dominate; otherwise the module's ai.eval, else a generic material count. */
export function scoreFor({ m, s }: Match, p: string): number {
  const me = s.players.find((x) => x.id === p);
  if (s.result) return s.result.winners.includes(p) ? 1e6 : s.result.winners.length ? -1e6 : 0;
  if (me?.lost) return -1e6;
  if (m.ai?.eval !== undefined) return num(ev(m, s, m.ai.eval, baseCtx(s, p)));
  let score = 0;
  for (const o of Object.values(s.objects)) {
    if (!m.zone.get(zoneIdOf(o.zone))?.abilities) continue;
    score += o.controller === p ? 1 : -1 / Math.max(1, s.players.length - 1);
  }
  return score + 0.3 * (s.zones[`${p}:${m.rules.handZone}`]?.length ?? 0);
}
