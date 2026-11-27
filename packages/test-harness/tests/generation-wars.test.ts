// Generation Wars (default module; mechanics reference: Riftbound). Checks that the shipped files match the Workshop
// blueprint, the decks are legal, and AI games show the conquest rules: runes (2 per turn, 3 for the second player's
// first turn, power by recycling), group moves, showdown fights, conquer/hold scoring and the 8-point win.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { createMatch, deckErrors, eventHash, replay } from '#engine';
import { makeAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'generation-wars');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('generation-wars');
const ids = Object.keys(mod.decks!);

test('generation-wars: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test('generation-wars: decks are legal; off-generation cards are rejected', () => {
  assert.equal(ids.length, 5);
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
  const bad = structuredClone(mod.decks![ids[0]]) as any; // The Establishment (Silent + Boomers)
  bad.deck[0] = 'hypebeast';
  assert.ok(deckErrors(mod, bad).some((e) => /leader's two colors/.test(e)));
});

function game(seed: number, a: string, b: string, onStep?: (g: Match) => void): Match {
  return playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![a]), structuredClone(mod.decks![b])], seed }), [makeAgent('heuristic', seed), makeAgent('heuristic', seed + 7)], onStep);
}

test('generation-wars: AI games are won on points through conquest, with runes paid as energy and power', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const runesT1: number[] = [];
    const g = game(100 + i, ids[i], ids[(i + 1) % ids.length], (m) => {
      const s = m.s, ph = m.m.rules.phases[s.turn.phase]?.id;
      if (s.turn.n <= 2 && ph === 'main' && runesT1.length < s.turn.n) runesT1.push((s.zones[`${s.players[s.turn.active].id}:resources`] ?? []).length);
    });
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result && g.s.result.winners?.length === 1, `game ${i} has a winner`);
    const w = g.s.players.find((p) => p.id === g.s.result!.winners![0])!;
    assert.ok((w.vars.score as number) >= 8 || g.s.turn.n >= 60, `won on points (${w.vars.score})`);
    assert.deepEqual(runesT1.slice(0, 2), [2, 3], 'first player channels 2 runes, the second player 3');
    for (const e of g.s.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['conquer', 'hold', 'showdownFight', 'marched', 'paid', 'peek']) assert.ok(seen[t] > 0, `${t} happens`);
  assert.ok((seen.moved ?? 0) > 0);
});
