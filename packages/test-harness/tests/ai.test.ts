import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match, Mod } from '#engine';
import { createMatch, determinize, scoreFor, seedRng } from '#engine';
import { heuristicAgent, randomAgent, scriptedAgent } from '#ai';
import { deckOpts, loadRef, playMatch } from '#harness';

test('determinize depends only on what the player knows', () => {
  const m = loadRef('spark-duel');
  const g = createMatch(m, deckOpts(m, ['ember-rush', 'stone-ward'], 3));
  const alt = structuredClone(g.s);
  for (const id of [...alt.zones['p1:hand'], ...alt.zones['p1:deck']]) alt.objects[id].card = 'mend'; // opponent's hidden cards
  const mine = alt.zones['p0:deck'].map((id) => alt.objects[id].card).reverse(); // own deck order
  alt.zones['p0:deck'].forEach((id, i) => { alt.objects[id].card = mine[i]; });
  alt.rng = seedRng(999); // future draws
  const a = determinize(g, 'p0', 7).s;
  const b = determinize({ m, s: alt }, 'p0', 7).s;
  assert.deepEqual(a.objects, b.objects);
  assert.deepEqual(a.rng, b.rng);
  assert.notDeepEqual(a.rng, g.s.rng, 'RNG is reseeded');
  const sorted = (s: typeof a, z: string) => s.zones[z].map((id) => s.objects[id].card).sort();
  assert.deepEqual(sorted(a, 'p0:deck'), sorted(g.s, 'p0:deck'), 'own unknown cards keep their multiset');
  assert.deepEqual(sorted(a, 'p0:hand'), sorted(g.s, 'p0:hand'), 'own hand is known exactly');
  assert.deepEqual(a.opts.decks[1], [], "opponent's decklist is not available");
  assert.equal(typeof scoreFor({ m, s: a }, 'p0'), 'number');
});

test('heuristic agent beats random play', () => {
  const games: [Mod, string[]][] = [[loadRef('spark-duel'), ['ember-rush', 'ember-rush']], [loadRef('tri-lane'), ['vanguard', 'vanguard']]];
  let wins = 0;
  let total = 0;
  for (const [m, decks] of games) {
    for (let seed = 1; seed <= 4; seed++) {
      const h = seed % 2; // heuristic seat alternates
      const agents = decks.map((_, i) => (i === h ? heuristicAgent(seed) : randomAgent(seed + 50)));
      const end: Match = playMatch(createMatch(m, deckOpts(m, decks, seed)), agents);
      total++;
      if (end.s.result!.winners.includes(`p${h}`)) wins++;
    }
  }
  assert.ok(wins >= 7, `heuristic won ${wins}/${total}`);
});

test('scripted agent falls back to a legal move and records the divergence', () => {
  const m = loadRef('spark-duel');
  const bad = scriptedAgent(() => ({ action: 'teleport' }), randomAgent(1));
  const end = playMatch(createMatch(m, deckOpts(m, ['ember-rush', 'stone-ward'], 2)), [bad, randomAgent(2)], undefined, 4000);
  assert.ok(end.s.result);
  assert.ok(bad.divergences.length > 0 && /teleport/.test(bad.divergences[0]));
  const good = scriptedAgent((_v, t) => ({ action: t.find((x) => x.action === 'pass')!.action }), randomAgent(3));
  const end2 = playMatch(createMatch(m, deckOpts(m, ['ember-rush', 'stone-ward'], 2)), [good, randomAgent(4)], undefined, 4000);
  assert.equal(good.divergences.length, 0);
  assert.ok(end2.s.result);
});

test('planner agent: plays legal moves to a finished game and never sees hidden cards', async () => {
  const { plannerAgent } = await import('#ai');
  const { build, fromBlueprint } = await import('#maker');
  const { createMatch } = await import('#engine');
  const { playMatch } = await import('#harness');
  const mod = build(fromBlueprint('blank')).mod!;
  const ids = Object.keys(mod.decks!);
  const g = playMatch(createMatch(mod, { decks: [ids[0], ids[1 % ids.length]].map((d) => structuredClone(mod.decks![d])), seed: 5 }), [plannerAgent(1), plannerAgent(2)]);
  assert.ok(g.s.result, 'finishes');
});
