import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Match } from '#engine';
import { applyCmd, createMatch, eventHash, eventsFor, listActions, observe, replay, restore, serialize } from '#engine';
import { randomAgent } from '#ai';
import { deckOpts, defaultDecks, invariantErrors, loadRef, playMatch } from '#harness';
import { GAME_IDS, goldenHashes, goldenPath } from '../src/golden.ts';

/** Ids a player must not see: contents of zones hidden from them. */
function hiddenFrom(g: Match, p: string): string[] {
  const out: string[] = [];
  for (const [key, ids] of Object.entries(g.s.zones)) {
    const [owner, zid] = key.split(':');
    const zd = g.m.zone.get(zid)!;
    const visible = zd.vis === 'public' || (zd.vis === 'owner' && !zd.shared && owner === p);
    if (!visible) out.push(...ids);
  }
  return out;
}

for (const id of GAME_IDS) {
  const mod = loadRef(id);
  const decks = defaultDecks(mod);
  const play = (seed: number, onStep?: (g: Match) => void) =>
    playMatch(createMatch(mod, deckOpts(mod, decks, seed)), decks.map((_, i) => randomAgent(seed * 13 + i)), onStep);

  test(`${id}: replay of the command log reproduces the event hash`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const end = play(seed);
      assert.equal(replay(mod, end.s.opts, end.s.cmds).hash, eventHash(end.s), `seed ${seed}`);
    }
    assert.notEqual(eventHash(play(1).s), eventHash(play(2).s));
  });

  test(`${id}: restore from a mid-game checkpoint continues identically`, () => {
    const end = play(42);
    const k = Math.floor(end.s.cmds.length / 2);
    let g = restore(mod, serialize(replay(mod, end.s.opts, end.s.cmds.slice(0, k)).match));
    for (const c of end.s.cmds.slice(k)) g = applyCmd(g, c);
    assert.equal(eventHash(g.s), eventHash(end.s));
  });

  test(`${id}: hidden information never reaches other players`, () => {
    for (let seed = 1; seed <= 8; seed++) {
      play(seed, (g) => {
        for (const pl of g.s.players) {
          const p = pl.id;
          const view = observe(g, p);
          const seen = JSON.stringify([view, listActions(g, p), eventsFor(g, p)]);
          for (const h of hiddenFrom(g, p)) assert.ok(!seen.includes(`"${h}"`), `${id} seed ${seed}: ${p} can see ${h}`);
          for (const o of Object.values(g.s.objects)) {
            if (!o.fd || o.controller === p) continue;
            const v = view.zones[o.zone].cards!.find((c) => c.id === o.id)!;
            assert.equal(v.card, '', `${p} sees face-down ${o.id}`);
            assert.ok(!eventsFor(g, p).some((e) => e.newObj === o.id && 'card' in e), `${p} saw face-down ${o.id} in an event`);
          }
        }
      });
    }
  });

  test(`${id}: random games terminate with conserved cards`, () => {
    for (let seed = 100; seed < 125; seed++) {
      const end = play(seed, seed < 103 ? (g) => assert.deepEqual(invariantErrors(g), []) : undefined);
      assert.ok(end.s.result);
      assert.deepEqual(invariantErrors(end), []);
    }
  });
}

test('golden event hashes are unchanged (run `npm run -s golden` after an intended change)', () => {
  assert.deepEqual(goldenHashes(), JSON.parse(readFileSync(goldenPath, 'utf8')));
});
