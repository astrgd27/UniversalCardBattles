import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match, Mod } from '#engine';
import { applyCmd, createMatch, eventHash, eventsFor, listActions, observe, replay, restore, serialize } from '#engine';
import { randomAgent } from '#ai';
import { deckOpts, invariantErrors, playMatch } from '#harness';
import { arcane, m } from './helpers.ts';

const GAMES: [string, Mod, string[]][] = [
  ['spark-duel', m, ['ember-rush', 'stone-ward']],
  ['arcane-duel', arcane, ['storm-circle', 'grove-host']],
];

for (const [name, mod, decks] of GAMES) {
  const play = (seed: number, onStep?: (g: Match) => void) =>
    playMatch(createMatch(mod, deckOpts(mod, decks, seed)), [randomAgent(seed), randomAgent(seed + 1000)], onStep);

  test(`${name}: replay of the command log reproduces the event hash`, () => {
    for (let seed = 1; seed <= 10; seed++) {
      const end = play(seed);
      assert.equal(replay(mod, end.s.opts, end.s.cmds).hash, eventHash(end.s), `seed ${seed}`);
    }
    assert.notEqual(eventHash(play(1).s), eventHash(play(2).s));
  });

  test(`${name}: restore from a mid-game checkpoint continues identically`, () => {
    const end = play(42);
    const k = Math.floor(end.s.cmds.length / 2);
    let g = restore(mod, serialize(replay(mod, end.s.opts, end.s.cmds.slice(0, k)).match));
    for (const c of end.s.cmds.slice(k)) g = applyCmd(g, c);
    assert.equal(eventHash(g.s), eventHash(end.s));
  });

  test(`${name}: hidden information never reaches the other player`, () => {
    for (let seed = 1; seed <= 15; seed++) {
      play(seed, (g) => {
        for (const p of ['p0', 'p1']) {
          const q = p === 'p0' ? 'p1' : 'p0';
          const hidden = [...g.s.zones[`${q}:hand`], ...g.s.zones['p0:deck'], ...g.s.zones['p1:deck']];
          const seen = JSON.stringify([observe(g, p), listActions(g, p), eventsFor(g, p)]);
          for (const id of hidden) assert.ok(!seen.includes(`"${id}"`), `seed ${seed}: ${p} can see ${id}`);
        }
      });
    }
  });

  test(`${name}: random games terminate with conserved cards`, () => {
    for (let seed = 100; seed < 140; seed++) {
      const end = play(seed, seed < 105 ? (g) => assert.deepEqual(invariantErrors(g), []) : undefined);
      assert.ok(end.s.result);
      assert.deepEqual(invariantErrors(end), []);
    }
  });
}
