// NIGHTFALL playtest analytics: AI-vs-AI games across faction pairings, with per-game stats.
//   node tools/nightfall/playtest.ts [--games=4] [--agents=heuristic|random] [--log=deckA,deckB,seed]
import { createMatch, eventsFor, listActions, observe } from '#engine';
import { makeAgent } from '#ai';
import { deckOpts, loadRef, playMatch } from '#harness';
const args = process.argv.slice(2);
const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const N = +flag('games', '4');
const kind = flag('agents', 'heuristic');
const M = loadRef('nightfall');
const D = Object.keys(M.decks!);
const FAC: Record<number, string> = { 1: 'cabal', 2: 'harvest', 3: 'zombie', 4: 'slasher', 5: 'devil' };
const how = (g: any) => {
  const r = g.s.result; if (!r) return 'unfinished';
  const ev = (t: string) => g.s.events.some((e: any) => e.type === t);
  if (ev('dawn')) return 'dawn'; if (ev('prophecy')) return 'prophecy';
  if (g.s.players.some((p: any) => (p.vars.bodycount ?? 0) >= +(process.env.NF_BODYCOUNT_WIN ?? 11))) return 'bodycount';
  if (g.s.players.some((p: any) => p.vars.claims >= 3)) return 'city';
  if (g.s.players.some((p: any) => p.vars.essence <= 0)) return 'ruin';
  return r.reason;
};
const logArg = flag('log', '');
if (logArg) {
  const [a, b, seed] = logArg.split(',');
  const decks = [a, b];
  const agents = decks.map((_, i) => makeAgent(kind as any, +seed * 7 + i));
  const g = playMatch(createMatch(M, deckOpts(M, decks, +seed)), agents);
  const name = (id: string) => (id ? M.card.get(id)?.name ?? id : '?');
  let line = '';
  for (const e of g.s.events as any[]) {
    if (e.type === 'phase' && e.phase === 'night') { console.log(line); line = `T${e.turn} ${e.active} |`; }
    if (e.type === 'action') line += ` ${e.player}:${e.action}(${name(e.card)})`;
    if (e.type === 'claimed') line += ` [CLAIM ${e.player} ${name(e.district)}]`;
    if (e.type === 'took') line += ` took@${e.x}`;
    if (e.type === 'dying') line += ` ✝${name(e.card)}`;
    if (e.type === 'damage' && typeof e.target === 'string' && e.target.startsWith('p')) line += ` dmg${e.target}:${e.amount}`;
    if (e.type === 'frenzy') line += ' FRENZY';
    if (e.type === 'gameOver') line += ` GAMEOVER ${JSON.stringify(e)}`;
  }
  console.log(line);
  console.log('final', g.s.players.map((p: any) => JSON.stringify(p.vars)), 'city', g.s.zones['shared:city'].map((id: string) => `${name(g.s.objects[id].card)}:${g.s.objects[id].vars.cit}/${g.s.objects[id].vars.claim}`).join(' '));
  process.exit(0);
}
const stats: Record<string, any> = { matrix: {}, sig: {}, end: {}, reasons: {}, winsByFac: {}, gamesByFac: {}, turns: [], claims: [], actions: {}, endRes: {}, endHand: {}, citLeft: [], ess: {} };
const t0 = Date.now();
for (let i = 0; i < D.length; i++) for (let j = 0; j < D.length; j++) if (i !== j) for (let s = 1; s <= N; s++) {
  const decks = [D[i], D[j]];
  const g = playMatch(createMatch(M, deckOpts(M, decks, s * 101 + i * 7 + j)), decks.map((_, k) => makeAgent(kind as any, s * 31 + k)));
  const r = how(g); stats.reasons[r] = (stats.reasons[r] ?? 0) + 1;
  const wf = g.s.result?.winners.length === 1 ? FAC[g.s.players[+g.s.result.winners[0].slice(1)].vars.faction] : 'draw';
  const pair = [FAC[g.s.players[0].vars.faction], FAC[g.s.players[1].vars.faction]].join(' v ');
  (stats.matrix[pair] ??= []).push(`${wf}/${r}`);
  for (const p of g.s.players) {
    const f = FAC[p.vars.faction]; stats.gamesByFac[f] = (stats.gamesByFac[f] ?? 0) + 1;
    if (g.s.result?.winners.includes(p.id)) stats.winsByFac[f] = (stats.winsByFac[f] ?? 0) + 1;
    const rn = ['vitae', 'bounty', 'biomass', 'terror', 'sin'][p.vars.faction - 1];
    (stats.endRes[f] ??= []).push(p.vars[rn] ?? 0);
    (stats.endHand[f] ??= []).push(g.s.zones[`${p.id}:hand`].length);
    (stats.ess[f] ??= []).push(p.vars.essence);
  }
  stats.turns.push(g.s.turn.n);
  stats.claims.push(g.s.players.map((p: any) => p.vars.claims).join('-'));
  stats.citLeft.push(g.s.zones['shared:city'].reduce((a: number, id: string) => a + Math.max(0, g.s.objects[id].vars.cit), 0));
  for (const e of g.s.events as any[]) if (['fulfilled', 'nativity', 'prophecy', 'awakened', 'dominated', 'overrun', 'sequel', 'sprung', 'frenzy', 'exposed', 'cancelled'].includes(e.type)) stats.sig[e.type] = (stats.sig[e.type] ?? 0) + 1;
  for (const p of g.s.players) { const f = FAC[p.vars.faction]; for (const v of ['gestation', 'bodycount', 'barrow', 'thralls', 'souls']) if (p.vars[v] !== undefined) (stats.end[`${f}.${v}`] ??= []).push(p.vars[v]); }
  for (const e of g.s.events as any[]) if (e.type === 'action') { const f = FAC[g.s.players[+e.player.slice(1)].vars.faction]; const k = `${f}:${e.action.split('#')[0]}`; stats.actions[k] = (stats.actions[k] ?? 0) + 1; }
}
const avg = (l: number[]) => (l.reduce((a, b) => a + b, 0) / l.length).toFixed(1);
const games = stats.turns.length;
console.log(`${games} games (${kind}), ${((Date.now() - t0) / games).toFixed(0)} ms/game`);
console.log('how games end:', JSON.stringify(stats.reasons));
console.log('win rate by faction:', Object.keys(stats.gamesByFac).map((f) => `${f} ${Math.round(100 * (stats.winsByFac[f] ?? 0) / stats.gamesByFac[f])}%`).join(', '));
console.log('avg turns', avg(stats.turns), '| avg citizens left on board', avg(stats.citLeft), '| claims (p0-p1) sample', stats.claims.slice(0, 12).join(' '));
console.log('avg unspent resource at end:', Object.entries(stats.endRes).map(([f, l]: any) => `${f} ${avg(l)}`).join(', '));
console.log('avg hand at end:', Object.entries(stats.endHand).map(([f, l]: any) => `${f} ${avg(l)}`).join(', '));
console.log('avg essence at end:', Object.entries(stats.ess).map(([f, l]: any) => `${f} ${avg(l)}`).join(', '));
for (const [k, l] of Object.entries(stats.matrix)) console.log(`  ${k}: ${(l as string[]).join(' ')}`);
console.log('signature events (total):', JSON.stringify(stats.sig));
console.log('faction counters at end (avg):', Object.entries(stats.end).map(([k, l]: any) => `${k} ${avg(l)}`).join(', '));
const byFac: Record<string, string[]> = {};
for (const [k, n] of Object.entries(stats.actions)) { const [f, a] = k.split(':'); (byFac[f] ??= []).push(`${a} ${(n as number / games * 5 / 2).toFixed(1)}`); }
console.log('actions per game per faction-seat:'); for (const [f, l] of Object.entries(byFac)) console.log(`  ${f}: ${l.join(', ')}`);
