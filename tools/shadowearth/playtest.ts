// Shadow Earth playtest analytics: AI-vs-AI games across every faction pairing.
//   cp tools/shadowearth/playtest.ts packages/test-harness/tests/_sept.ts && node packages/test-harness/tests/_sept.ts [--games=1] [--agents=heuristic]
import { compileModule, createMatch } from '#engine';
import { makeAgent } from '#ai';
import { deckOpts, loadRef, playMatch, readModuleDir } from '#harness';
const args = process.argv.slice(2);
const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const N = +flag('games', '1');
const kind = flag('agents', 'heuristic') as any;
const M = process.env.SE_OUT ? compileModule(readModuleDir(process.env.SE_OUT)) : loadRef('shadow-earth');
const D = Object.keys(M.decks!);
const F = (d: string) => d.replace('-starter', '');
const wins: Record<string, [number, number]> = {};
const how: Record<string, number> = {};
let turns = 0, games = 0, missions = 0, ok = 0, agendas = 0, domLoser = 0;
const lines: string[] = [];
for (const a of D) for (const b of D) {
  if (a === b) continue;
  for (let s = 1; s <= N; s++) {
    const g = playMatch(createMatch(M, deckOpts(M, [a, b], s)), [makeAgent(kind, s * 7), makeAgent(kind, s * 7 + 1)]);
    const r = g.s.result!;
    const w = r.winners[0];
    const doms = g.s.players.map((p: any) => p.vars.dom ?? 0);
    const end = r.reason === 'turnLimit' ? 'turnLimit' : doms.some((d: number) => d >= 20) ? 'dominance' : 'deck-out';
    how[end] = (how[end] ?? 0) + 1;
    for (const [i, d] of [a, b].entries()) { wins[F(d)] ??= [0, 0]; wins[F(d)][1]++; if (w === `p${i}`) wins[F(d)][0]++; }
    turns += g.s.turn.n; games++;
    for (const e of g.s.events as any[]) {
      if (e.type === 'missionResult') { missions++; ok += e.ok; }
      if (e.type === 'agendaCompleted') agendas++;
    }
    domLoser += Math.min(...doms);
    lines.push(`  ${F(a)} v ${F(b)}: ${w ? F([a, b][+w.slice(1)]) : 'draw'} by ${end}, turn ${g.s.turn.n}, Dominance ${doms.join('-')}`);
  }
}
console.log(`${games} games (${kind})`);
console.log('how games end:', JSON.stringify(how));
console.log('win rate by faction:', Object.entries(wins).map(([f, [w, n]]) => `${f} ${Math.round((100 * w) / n)}%`).join(', '));
console.log(`avg turns ${(turns / games).toFixed(1)} | missions per game ${(missions / games).toFixed(1)} (${Math.round((100 * ok) / missions)}% succeed) | Agendas completed per game ${(agendas / games).toFixed(2)} | loser's Dominance ${(domLoser / games).toFixed(1)}`);
console.log(lines.join('\n'));
