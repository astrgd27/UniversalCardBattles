// Usage: npm run -s tourney <game> -- [--games=20] [--agents=heuristic,random] [--decks=a,b] [--seed=1]
// Seats rotate every game so each agent plays every seat equally often.
import { makeAgent } from '#ai';
import { createMatch } from '#engine';
import { deckOpts, defaultDecks, loadRef, playMatch } from '#harness';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'spark-duel';
const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const m = loadRef(id);
const decks = flag('decks', defaultDecks(m).join(',')).split(',');
const kinds = flag('agents', 'heuristic,random').split(',');
const games = +flag('games', '20');
const seed0 = +flag('seed', '1');
const n = decks.length;
const wins: Record<string, number> = {};
let draws = 0;
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const seat = (i: number) => kinds[(i + g) % kinds.length]; // agent kind in seat i this game
  const seed = seed0 + g;
  const end = playMatch(createMatch(m, deckOpts(m, decks, seed)), Array.from({ length: n }, (_, i) => makeAgent(seat(i), seed * 31 + i)));
  const w = end.s.result!.winners;
  if (!w.length) draws++;
  for (const p of w) { const k = `${seat(+p.slice(1))}@${decks[+p.slice(1)]}`; wins[k] = (wins[k] ?? 0) + 1; }
}
console.log(`${id} [${decks}] agents=${kinds} games=${games} draws=${draws} wins=${JSON.stringify(wins)} (${((Date.now() - t0) / games).toFixed(0)} ms/game)`);
