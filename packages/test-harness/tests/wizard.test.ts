// The Game Wizard: every combination of answers builds a module with no bugs, and AI games of it run cleanly to a
// result. Unanswered steps use their defaults; options that do not fit earlier answers are dropped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMatch, deckErrors } from '#engine';
import { makeAgent } from '#ai';
import { invariantErrors, playMatch } from '#harness';
import { WIZARD, build, optionsFor, randomAnswers, wizardBuild } from '#maker';

test('wizard: skipping every step gives a playable default game', () => {
  const bp = wizardBuild({ picks: {}, vals: {} });
  assert.equal(bp.name, 'My Card Game');
  assert.equal(bp.colors.length, 2);
  assert.equal(bp.setup.deckMin, 40);
  const { mod, problems } = build(bp);
  assert.ok(mod, problems.map((p) => p.text).join('; '));
  for (const d of Object.values(mod!.decks!)) assert.deepEqual(deckErrors(mod!, d), []);
});

test('wizard: answers shape the game (resources, combat, win, deck, keywords)', () => {
  const bp = wizardBuild({ picks: { theme: ['scifi'], resources: ['lands'], combat: ['block'], win: ['shields'], deck: ['large'], keywords: ['flying', 'lifesteal'], types: ['traps'], systems: ['chance'] },
    vals: { name: 'Star Lanes', colors: '3', lifeCards: 6, hand: 6, mulligan: 'london' } });
  assert.equal(bp.id, 'star-lanes');
  assert.equal(bp.colors.length, 3);
  assert.equal(bp.resource.mode, 'cards');
  assert.equal(bp.combat.mode, 'block');
  assert.equal(bp.win.lifeCards, 6);
  assert.equal(bp.setup.hand, 6);
  assert.equal(bp.setup.london, true);
  assert.ok(bp.keywords.some((k) => k.rule === 'flying') && bp.cards.some((c) => c.keywords.includes('flying')));
  assert.ok(bp.types.some((t) => t.role === 'trap'));
  assert.ok(bp.cards.some((c) => c.abilities.some((a) => a.do.some((e) => e.k === 'roll'))));
  const { mod, problems } = build(bp);
  assert.ok(mod, problems.map((p) => p.text).join('; '));
  for (const d of Object.values(mod!.decks!)) {
    assert.deepEqual(deckErrors(mod!, d), []);
    const main = (Array.isArray(d) ? d : (d as any).deck) as string[];
    const lands = main.filter((id) => id.endsWith('-land')).length;
    assert.ok(lands / main.length > 0.3 && lands / main.length < 0.5, `about 40% lands (${lands}/${main.length})`);
  }
});

test('wizard: options only appear when they fit earlier answers', () => {
  const step = (id: string) => WIZARD.find((s) => s.id === id)!;
  const pitch = { picks: { resources: ['pitch'] }, vals: {} };
  assert.deepEqual(optionsFor(step('combat'), pitch).map((o) => o.id), ['cards']);
  assert.deepEqual(optionsFor(step('win'), pitch).map((o) => o.id), ['life']);
  assert.ok(optionsFor(step('win'), { picks: { combat: ['lanes'] }, vals: {} }).every((o) => o.id === 'points'));
});

test('wizard: random answer sets all build and play AI games without rule errors', () => {
  let finished = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const a = randomAnswers(seed);
    const desc = Object.entries(a.picks).map(([k, v]) => `${k}=${v.join('+')}`).join(' ');
    const { mod, problems } = build(wizardBuild(a));
    assert.ok(mod && !problems.some((p) => p.level === 'bug'), `${desc}: ${problems.map((p) => p.text).join('; ')}`);
    const ds = Object.keys(mod!.decks!);
    for (const id of ds) assert.deepEqual(deckErrors(mod!, mod!.decks![id]), [], `${desc}: deck ${id}`);
    const g = playMatch(createMatch(mod!, { decks: [structuredClone(mod!.decks![ds[0]]), structuredClone(mod!.decks![ds[ds.length > 1 ? 1 : 0]])], seed }), [makeAgent('heuristic', seed), makeAgent('heuristic', seed + 3)]);
    assert.deepEqual(invariantErrors(g), [], desc);
    assert.ok(g.s.result, desc);
    if (g.s.result!.reason !== 'turnLimit') finished++;
  }
  assert.ok(finished >= N * 0.9, `${finished}/${N} games reach a real win`);
});
