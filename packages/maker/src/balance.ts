// Balance assistant: estimates what each card is worth, fits the game's own cost curve (value against cost, separately for
// units and for spells), and flags cards far off it. With AI-lab play data it also flags cards that win (or lose) far more
// often than average when played. Every note says why, and most carry a suggested cost.
import type { Ability, Blueprint, CardBP, Effect } from './blueprint.ts';

export interface BalanceNote { id: string; name: string; level: 'strong' | 'weak'; text: string; cost: number; suggest?: number; value: number; confidence: 'curve' | 'play' | 'both' }
export interface PlayStat { id: string; games: number; wins: number }

const costNum = (c: CardBP) => (typeof c.cost === 'number' ? c.cost : Object.values(c.cost ?? {}).reduce((a, b) => a + b, 0));
const roleOf = (bp: Blueprint, c: CardBP) => bp.types.find((t) => t.id === c.type)?.role ?? 'unit';
const MANY = new Set(['allEnemyUnits', 'allUnits', 'allOwnUnits', 'eachPlayer']);
const HURTS_ME = new Set(['you', 'self', 'ownUnit', 'allOwnUnits', 'otherOwnUnit', 'ownLeader', 'ownAny']);

/** Rough worth of one effect, in "stat points" (one point of power or health). */
export function effectValue(bp: Blueprint, e: Effect): number {
  const n = e.amount ? 2 : Math.abs(e.n ?? 1); // X amounts count as about 2
  const tg = e.pick ? (e.pick.how === 'all' ? 'allUnits' : e.pick.side === 'own' ? 'ownUnit' : 'enemyUnit') : e.target ?? 'enemyUnit';
  const wide = MANY.has(tg) ? 2.5 : 1;
  const mine = HURTS_ME.has(tg);
  const times = Math.max(1, e.repeat ?? 1) * Math.max(1, e.count ?? e.pick?.n ?? 1);
  const v = ((): number => {
    switch (e.k) {
      case 'draw': return e.who === 'opp' ? -1.5 * n : e.who === 'each' ? 0.5 * n : 2 * n;
      case 'damage': return (mine ? -0.6 : 1) * n * wide;
      case 'destroy': return (mine ? -2 : 4) * wide;
      case 'bounce': return (mine ? 0.5 : 2) * wide;
      case 'exhaust': return (mine ? -0.5 : 1) * wide;
      case 'ready': return 1 * wide;
      case 'heal': return 0.6 * n * wide;
      case 'buff': return (mine || tg === 'self' ? 1 : -1) * n * (e.until === 'forever' ? 1.2 : 0.6) * wide;
      case 'aura': return n * 1.2 * (MANY.has(tg) || tg === 'otherOwnUnit' ? 2.5 : 1);
      case 'token': { const t = bp.cards.find((k) => k.id === e.card); return n * (t ? Object.values(t.stats).reduce((a, b) => a + b, 0) * 0.8 : 2); }
      case 'gain': case 'addRes': case 'readyRes': return 1.5 * n;
      case 'discard': return e.who === 'opp' ? 1.5 * n : e.who === 'each' ? 0 : -1 * n;
      case 'mill': return 0.3 * n;
      case 'scry': case 'surveil': return 0.5 * n;
      case 'dig': case 'tutor': case 'search': return 2;
      case 'recover': return 1.5;
      case 'counter': return 3;
      case 'lifeGain': return 0.4 * n;
      case 'lifeLoss': return (e.who === 'opp' ? 0.8 : e.who === 'each' ? 0 : -0.6) * n;
      case 'score': return 2.5 * n;
      case 'addCounter': return 0.8 * n * wide;
      case 'removeCounter': return 0.5 * n;
      case 'steal': return 6;
      case 'copy': return 4;
      case 'restrict': return 1 * wide;
      case 'prevent': return 0.8 * n * wide;
      case 'costMod': return 1.5 * n;
      case 'insteadDestroy': return 2;
      case 'inflict': return 1.5 * wide;
      case 'cure': return 0.5;
      case 'putIntoPlay': return 3;
      case 'strike': return n;
      case 'win': return 20;
      case 'meter': return 0.5 * n;
      case 'choose': return Math.max(0, ...(e.modes ?? []).map((md) => (md.do ?? []).reduce((a, q) => a + effectValue(bp, q), 0))) + 0.5;
      case 'later': return 0.8 * (e.do ?? []).reduce((a, q) => a + effectValue(bp, q), 0);
      case 'flip': return 0.5 * ((e.heads ?? []).reduce((a, q) => a + effectValue(bp, q), 0) + (e.tails ?? []).reduce((a, q) => a + effectValue(bp, q), 0));
      default: return 1;
    }
  })();
  return v * times;
}
const WHEN_X: Record<string, number> = { static: 1.2, play: 1, activated: 0.8, startTurn: 1.5, endTurn: 1.3, attack: 1, hit: 0.8, leave: 0.6, quest: 1, block: 0.6, event: 0.8 };
export function abilityValue(bp: Blueprint, a: Ability): number {
  let v = a.do.reduce((s, e) => s + effectValue(bp, e), 0) * (WHEN_X[a.when] ?? 0.7);
  if (a.if) v *= 0.7;
  if (a.once === 'game') v *= 0.6;
  if (a.when === 'activated' && (a.cost || a.discard || a.sacrifice || a.sacSelf)) v *= 0.6;
  return v;
}
/** A card's estimated worth in stat points: its stats (units), keywords and abilities. */
export function cardValue(bp: Blueprint, c: CardBP): number {
  const role = roleOf(bp, c);
  const unit = ['unit', 'evolution', 'extra'].includes(role);
  const statV = unit ? (c.stats[bp.combat.power] ?? 0) + (bp.combat.health ? c.stats[bp.combat.health] ?? 0 : 0) + (bp.combat.defense ? (c.stats[bp.combat.defense] ?? 0) * 0.7 : 0) : 0;
  const kwV = c.keywords.reduce((s, k) => s + (bp.keywords.find((q) => q.id === k)?.valued ? (c.kwv?.[k] ?? 1) : 1.5), 0);
  return statV + kwV + c.abilities.reduce((s, a) => s + abilityValue(bp, a), 0);
}

/** Least-squares line value = a·cost + b over (cost, value) points; null when the costs don't spread enough to fit. */
function fit(pts: [number, number][]): { a: number; b: number; sd: number } | null {
  if (pts.length < 4 || new Set(pts.map((p) => p[0])).size < 3) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const a = sxy / sxx;
  if (!(a > 0.05)) return null; // value doesn't rise with cost: no usable curve
  const b = my - a * mx;
  const sd = Math.sqrt(pts.reduce((s, p) => s + (p[1] - (a * p[0] + b)) ** 2, 0) / pts.length);
  return { a, b, sd };
}

/** The balance report: curve outliers (from the cards themselves) and, with lab data, cards whose win rate stands out. */
export function balanceReport(bp: Blueprint, play: PlayStat[] = []): BalanceNote[] {
  const notes = new Map<string, BalanceNote>();
  const groups: [string, (r: string) => boolean][] = [['units', (r) => r === 'unit' || r === 'evolution'], ['spells', (r) => ['spell', 'fast', 'trap', 'permanent', 'attachment'].includes(r)]];
  for (const [, inGroup] of groups) {
    const cs = bp.cards.filter((c) => inGroup(roleOf(bp, c)));
    const pts = cs.map((c) => [costNum(c), cardValue(bp, c)] as [number, number]);
    const f = fit(pts);
    if (!f) continue;
    cs.forEach((c, i) => {
      const [cost, v] = pts[i];
      const expected = (v - f.b) / f.a; // the cost a card this strong usually has in this game
      const delta = expected - cost;
      const off = Math.abs(v - (f.a * cost + f.b)) > Math.max(1, 1.5 * f.sd);
      if (Math.abs(delta) < 1 || !off) return;
      const top = Math.max(...pts.map((q) => q[0]));
      const raw = Math.round(expected);
      const suggest = Math.max(0, Math.min(raw, cost + 3, top + 1), cost - 3); // at most 3 away, and within the game's own range
      const capped = suggest !== raw;
      notes.set(c.id, { id: c.id, name: c.name, cost, value: Math.round(v * 10) / 10, suggest: suggest !== cost ? suggest : undefined, confidence: 'curve', level: delta > 0 ? 'strong' : 'weak',
        text: delta > 0 ? (capped ? `is far above the curve for cost ${cost}` : `plays like a ${raw}-cost card at cost ${cost}`) : (capped ? `is far below the curve for cost ${cost}` : `is only worth about a ${raw}-cost card at cost ${cost}`) });
    });
  }
  const games = play.reduce((s, p) => s + p.games, 0);
  if (games) for (const p of play) {
    if (p.games < 8) continue;
    const rate = p.wins / p.games;
    if (rate < 0.7 && rate > 0.3) continue;
    const c = bp.cards.find((k) => k.id === p.id);
    if (!c || ['resource', 'token', 'leader'].includes(roleOf(bp, c))) continue;
    const level = rate >= 0.7 ? 'strong' : 'weak';
    const was = notes.get(c.id);
    const txt = `won ${Math.round(rate * 100)}% of the ${p.games} AI games it was played in`;
    if (was && was.level === level) { was.confidence = 'both'; was.text += `, and ${txt}`; }
    else if (!was) notes.set(c.id, { id: c.id, name: c.name, cost: costNum(c), value: Math.round(cardValue(bp, c) * 10) / 10, level, confidence: 'play', text: txt,
      suggest: level === 'strong' ? costNum(c) + 1 : Math.max(0, costNum(c) - 1) });
  }
  const rank = { both: 0, curve: 1, play: 2 };
  return [...notes.values()].sort((a, b) => rank[a.confidence] - rank[b.confidence] || (a.level === b.level ? 0 : a.level === 'strong' ? -1 : 1));
}

/** Sets a card's cost to n (typed costs keep their colored part and change the generic part). */
export function setCardCost(c: CardBP, n: number) {
  if (typeof c.cost !== 'object' || !c.cost) { c.cost = n; return; }
  const colored = Object.entries(c.cost).filter(([t]) => t !== 'any').reduce((a, [, v]) => a + v, 0);
  if (n >= colored) c.cost = { ...c.cost, any: n - colored }; else c.cost = n;
  if (typeof c.cost === 'object' && c.cost.any === 0) { const { any: _, ...rest } = c.cost; c.cost = Object.keys(rest).length ? rest : 0; }
}
