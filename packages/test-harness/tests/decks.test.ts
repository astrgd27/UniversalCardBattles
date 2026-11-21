import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Deck } from '#engine';
import { TEMPLATE_BASES, deckErrors, validateModule } from '#engine';
import { REF_DIR, readModuleDir } from '#harness';
import { loadRef } from '#harness';
import { cardMatches, deckFromText, deckToText, facets, parseQuery, toggleToken } from '../../../apps/web/src/search.ts';
import { BUILTIN, inferTemplate, templateFor } from '../../../apps/web/src/templates.ts';
import { GAME_IDS } from '../src/golden.ts';

const sectionsOf = (d: Deck, main: string) => (Array.isArray(d) ? { [main]: [...d] } : structuredClone(d));

test('every game enforces its own deck rules in the builder (engine deckErrors)', () => {
  for (const id of GAME_IDS) {
    const m = loadRef(id);
    const F = m.rules.format;
    for (const [name, d] of Object.entries(m.decks ?? {})) assert.deepEqual(deckErrors(m, d), [], `${id}/${name} starter deck is legal`);
    const d0 = Object.values(m.decks!)[0];
    const secs = sectionsOf(d0, m.rules.deckZone);
    const main = Object.keys(secs)[0];
    const short = structuredClone(secs);
    short[main].pop();
    assert.match(deckErrors(m, short).join(), /has \d+ cards \(needs/, `${id}: size enforced`);
    const greedy = structuredClone(secs);
    const pick = greedy[main].find((c) => ((m.card.get(c)?.maxCopies as number | undefined) ?? F.maxCopies) === F.maxCopies)!;
    greedy[main] = [...greedy[main].slice(0, greedy[main].length - (F.maxCopies + 1)), ...Array(F.maxCopies + 1).fill(pick)];
    const key = F.copiesBy ? String((m.card.get(pick) as any)[F.copiesBy]) : pick; // copies may be counted by name
    assert.match(deckErrors(m, greedy).join(), new RegExp(`copies of "${key}" \\(max ${F.maxCopies}\\)`), `${id}: copy limit enforced`);
    const token = m.cards.find((c) => c.maxCopies === 0);
    if (token) {
      const t = structuredClone(secs);
      t[main][0] = token.id;
      assert.match(deckErrors(m, t).join(), new RegExp(`1 copies of "${token.id}" \\(max 0\\)`), `${id}: token-only cards rejected`);
    }
    if (F.zones?.some((z) => z.types)) {
      const z = F.zones.find((x) => x.types)!;
      const wrong = m.cards.find((c) => !z.types!.includes(c.type) && c.maxCopies !== 0)!;
      const w = structuredClone(secs);
      w[z.zone] = [...(w[z.zone] ?? []).slice(1), wrong.id];
      assert.match(deckErrors(m, w).join(), /cannot go in the .* section/, `${id}: section card types enforced`);
    }
  }
});

test('search language: types, keywords, numbers, phrases, negation, tokens', () => {
  const m = loadRef('spark-duel');
  const q = (s: string) => m.cards.filter((c) => cardMatches(c, parseQuery(s))).map((c) => c.id).sort();
  assert.deepEqual(q('t:spell cost<=1'), ['mend', 'spark-bolt']);
  assert.deepEqual(q('k:guard -t:token'), ['brook-sentinel', 'moss-golem', 'tin-squire']);
  assert.deepEqual(q('is:token'), ['brass-bulwark', 'clockwork-sentry', 'signal-beacon']);
  assert.deepEqual(q('"draw a card"'), ['hollow-knight', 'lantern-moth']);
  assert.deepEqual(q('power>=5'), ['cinder-drake']);
  assert.deepEqual(q('n:drake'), ['cinder-drake']);
  assert.deepEqual(q('nosuchfield>1'), []);
  const f = facets(m.cards);
  assert.deepEqual(f.types.map((x) => x[0]).sort(), ['spell', 'token', 'unit']);
  assert.ok(f.words.some(([w]) => w === 'guard'));
  assert.equal(toggleToken(toggleToken('cost<=2', 't:unit'), 't:unit'), 'cost<=2');
});

test('deck text export and import round-trip, with sections and errors', () => {
  for (const id of ['spark-duel', 'relic-chain', 'tidewardens']) {
    const m = loadRef(id);
    const secs = m.rules.format.zones?.map((z) => z.zone) ?? [m.rules.deckZone];
    const d = sectionsOf(Object.values(m.decks!)[0], m.rules.deckZone);
    for (const z of secs) d[z] ??= [];
    const back = deckFromText(m, deckToText(m, d, secs), secs);
    assert.deepEqual(back.errors, []);
    for (const z of secs) assert.deepEqual([...back.deck[z]].sort(), [...d[z]].sort(), `${id}/${z}`);
  }
  const m = loadRef('spark-duel');
  const r = deckFromText(m, '3x Mend\nember-pup x2\nWhat Is This\n# extra', ['deck']);
  assert.deepEqual(r.deck.deck, ['mend', 'mend', 'mend', 'ember-pup', 'ember-pup']);
  assert.deepEqual(r.errors, ['line 3: unknown card "What Is This"', 'line 4: unknown section "extra" (deck)']);
});

test('card templates: several formats per game and between games', () => {
  assert.deepEqual(Object.keys(BUILTIN).sort(), [...TEMPLATE_BASES].sort());
  const spark = loadRef('spark-duel');
  const relic = loadRef('relic-chain');
  const council = loadRef('ember-council');
  const vault = loadRef('vault-breach');
  const T = (m: typeof spark, id: string) => templateFor(m, m.card.get(id)!);
  assert.deepEqual([T(spark, 'ember-pup').base, T(spark, 'spark-bolt').base, T(spark, 'brass-bulwark').base], ['classic', 'spell', 'token']);
  assert.equal(T(relic, 'ash-hound').level, 'level');
  assert.deepEqual(T(relic, 'ash-hound').stats.map((s) => s.pos), ['line', 'line']);
  assert.equal(T(relic, 'ashen-warhound').label, 'Fusion — ranked frame with a recipe line');
  assert.deepEqual([T(council, 'copper-mark').base, T(council, 'copper-mark').stats[0].field], ['resource', 'gold']);
  assert.deepEqual([T(vault, 'vault').layout, T(vault, 'barrier-maze').stats[0].field], ['landscape', 'strength']);
  const tide = loadRef('tidewardens').card.get('tide-stone')!;
  assert.equal(inferTemplate(tide), 'resource');
  assert.equal(inferTemplate(relic.card.get('rune-knight')!), 'monster');
  assert.equal(inferTemplate(spark.card.get('signal-beacon')!), 'token');
  const bad = readModuleDir(`${REF_DIR}/vault-breach`);
  bad.manifest.presentation = { templates: { x: { base: 'hologram', layout: 'diagonal' as any } }, byType: { unit: 'nope' } };
  const errs = validateModule(bad).join('\n');
  assert.match(errs, /unknown base "hologram"/);
  assert.match(errs, /must be portrait or landscape/);
  assert.match(errs, /unknown template "nope"/);
});
