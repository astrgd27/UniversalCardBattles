// Ringworld Rumble (default module; mechanics reference: One Piece Card Game). Checks the shipped files match the Workshop
// blueprint, decks are legal, and AI games show the rules: Hype!! deck (1 on the first player's first turn, then 2),
// giving Hype!! for power, no attacks on either player's first turn, life cards from the Headliner, counters, Run-In.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { createMatch, deckErrors, eventHash, replay } from '#engine';
import { makeAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'ringworld-rumble');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('ringworld-rumble');
const ids = Object.keys(mod.decks!);

test('ringworld-rumble: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test('ringworld-rumble: decks are legal; off-style cards are rejected', () => {
  assert.equal(ids.length, 4);
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
  const bad = structuredClone(mod.decks![ids[0]]) as any; // High-Flyers + Grapplers
  bad.deck[0] = 'hardcore-lich-king';
  assert.ok(deckErrors(mod, bad).some((e) => /leader's two colors/.test(e)));
});

test('ringworld-rumble: AI games follow the turn, Hype!! and battle rules', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const hype: number[] = [];
    let earlyAttacks = -1;
    const g: Match = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![ids[i]]), structuredClone(mod.decks![ids[(i + 1) % ids.length]])], seed: 200 + i }),
      [makeAgent('heuristic', 200 + i), makeAgent('heuristic', 207 + i)], (m) => {
        const s = m.s, ph = m.m.rules.phases[s.turn.phase]?.id;
        if (s.turn.n <= 2 && ph === 'main' && hype.length < s.turn.n) hype.push((s.zones[`${s.players[s.turn.active].id}:resources`] ?? []).length);
        if (s.turn.n === 3 && earlyAttacks < 0) earlyAttacks = s.events.filter((e) => e.type === 'attack').length;
      });
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result?.winners?.length === 1, `game ${i} has a winner`);
    assert.deepEqual(hype, [1, 2], 'the first player gets 1 Hype!! on turn 1, the second player 2');
    assert.equal(earlyAttacks, 0, 'nobody attacks on their own first turn');
    for (const e of g.s.events) { const k = e.type === 'action' ? `action:${String(e.action).split('#')[0]}` : e.type; seen[k] = (seen[k] ?? 0) + 1; }
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['given', 'attack', 'lifeLost', 'action:counterCard', 'action:quick', 'destroyed']) assert.ok(seen[t] > 0, `${t} happens`);
});
