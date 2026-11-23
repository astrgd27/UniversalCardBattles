// Golden event hashes: fixed seeds, random agents. `npm run -s golden` rewrites tests/golden.json after an intended change.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomAgent } from '#ai';
import { createMatch, eventHash } from '#engine';
import { REF_DIR, deckOpts, defaultDecks, loadRef, playMatch } from '#harness';

export const GOLDEN_SEEDS = [1, 2, 3];
export const GAME_IDS = ['spark-duel', 'arcane-duel', 'tri-lane', 'relic-chain', 'tidewardens', 'ember-council', 'vault-breach', 'bastion-clash', 'nightfall', 'shadow-earth'];
export const goldenPath = join(REF_DIR, '../test-harness/tests/golden.json');

export function goldenHashes(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of GAME_IDS) {
    const m = loadRef(id);
    const d = defaultDecks(m);
    out[id] = GOLDEN_SEEDS.map((seed) => eventHash(playMatch(createMatch(m, deckOpts(m, d, seed)), d.map((_, i) => randomAgent(seed * 7 + i + 1))).s));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(goldenPath, `${JSON.stringify(goldenHashes(), null, 2)}\n`);
  console.log(`wrote ${goldenPath}`);
}
