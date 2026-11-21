// Usage: npm run -s sim <module-id> -- [--games=200] [--seed=1] [--decks=a,b]
import { randomAgent } from '#ai';
import { createMatch } from '#engine';
import { deckOpts, invariantErrors, loadRef, playMatch } from '#harness';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'spark-duel';
const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const games = +flag('games', '200');
const seed0 = +flag('seed', '1');
const m = loadRef(id);
const deckNames = flag('decks', Object.keys(m.decks ?? {}).slice(0, 2).join(',')).split(',');
const tally: Record<string, number> = {};
let turns = 0, cmds = 0, errors = 0;
for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  try {
    const end = playMatch(createMatch(m, deckOpts(m, deckNames, seed)), [randomAgent(seed * 7 + 1), randomAgent(seed * 7 + 2)]);
    const inv = invariantErrors(end);
    if (inv.length) throw new Error(inv.join('; '));
    const key = end.s.result!.winners.join('+') || end.s.result!.reason;
    tally[key] = (tally[key] ?? 0) + 1;
    turns += end.s.turn.n;
    cmds += end.s.cmds.length;
  } catch (e) {
    if (errors++ < 3) console.log(`seed ${seed}: ${(e as Error).message}`);
  }
}
const ok = games - errors;
console.log(`${id} [${deckNames}] games=${games} errors=${errors} results=${JSON.stringify(tally)} avgTurns=${(turns / ok).toFixed(1)} avgCmds=${(cmds / ok).toFixed(1)}`);
process.exitCode = errors ? 1 : 0;
