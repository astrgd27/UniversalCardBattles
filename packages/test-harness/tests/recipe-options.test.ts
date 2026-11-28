// Mix-and-match sub-options: every option of every recipe changes the blueprint, and every value still builds and plays.
// Plus the "new ideas" mechanics that exist in no source game (world clock, heat, aging, comeback).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mod } from '#engine';
import { createMatch } from '#engine';
import { makeAgent } from '#ai';
import { playMatch } from '#harness';
import { RECIPES, applyRecipe, build, compileBlueprint, fromBlueprint, setRecipeOpt } from '#maker';


const key = (v: unknown) => JSON.stringify(v ?? null);
const decks = (mod: Mod) => { const ids = Object.keys(mod.decks!); return [ids[0], ids[1 % ids.length]].map((d) => structuredClone(mod.decks![d])); };
const play = (mod: Mod, seed: number) => playMatch(createMatch(mod, { decks: decks(mod), seed }), [makeAgent('heuristic', seed), makeAgent('heuristic', seed + 1)]);
const withRecipes = (ids: string[]) => { const bp = fromBlueprint('blank'); for (const r of ids) applyRecipe(bp, r); return bp; };

test('recipe options: every recipe offers options, each value sticks, changes the compiled game, builds and plays', () => {
  const few = RECIPES.filter((r) => (r.opts?.length ?? 0) < 2).map((r) => r.id);
  assert.deepEqual(few, [], 'every recipe has at least two options');
  for (const r of RECIPES) for (const o of r.opts!) {
    const compiled = new Set<string>();
    for (const v of o.values) {
      const bp = withRecipes([r.id]);
      setRecipeOpt(bp, o, v);
      assert.equal(key(o.get(bp)), key(v), `${r.id} / ${o.id}: set ${key(v)} but reads ${key(o.get(bp))}`);
      const { mod, problems } = build(bp);
      assert.ok(mod, `${r.id} / ${o.id} = ${key(v)}: ${problems.map((p) => p.text).join('; ')}`);
      compiled.add(JSON.stringify(compileBlueprint(bp)));
      if (v !== o.values[o.values.length - 1]) continue; // every value builds; one AI game per option keeps the suite fast
      let end; try { end = play(mod!, 3); } catch (e) { throw new Error(`${r.id} / ${o.id} = ${key(v)}: ${(e as Error).message}`); }
      assert.ok(end.s.result, `${r.id} / ${o.id} = ${key(v)} did not finish`);
    }
    assert.ok(compiled.size > 1, `${r.id} / ${o.id}: no value changes the compiled game`);
  }
});

const meter = (bp: ReturnType<typeof withRecipes>, id: string) => bp.meters!.find((m) => m.id === id)!;

test('meters: the world clock cycles through its names, announces each, and its last time boosts units', () => {
  const bp = withRecipes(['worldClock']);
  const def = compileBlueprint(bp) as any;
  assert.deepEqual(def.manifest.theme.meters, [{ v: 'm_clock', name: 'Time', icon: '🌗', names: ['Day', 'Night'] }]);
  assert.match(def.manifest.theme.log.mv_clock_1, /Night/);
  assert.match(def.cards.find((c: any) => c.id === 'night-prowler').text, /while it is Night/i);
  const g = play(build(bp).mod!, 5);
  const seen = new Set(g.s.events.filter((e: any) => /^mv_clock_/.test(e.type)).map((e: any) => e.type));
  assert.deepEqual([...seen].sort(), ['mv_clock_0', 'mv_clock_1'], 'both times come round');
});

test('meters: heat overheats with each penalty; Cool Down sets it to 0', () => {
  for (const penalty of ['damage', 'discard', 'exhaust']) {
    const bp = withRecipes(['heat']);
    const o = RECIPES.find((r) => r.id === 'heat')!.opts!;
    setRecipeOpt(bp, o.find((q) => q.id === 'meter.heat.penalty')!, penalty);
    setRecipeOpt(bp, o.find((q) => q.id === 'meter.heat.limit')!, 3);
    meter(bp, 'heat').decay = 0;
    const g = play(build(bp).mod!, 7);
    assert.ok(g.s.events.some((e: any) => e.type === 'mt_heat_0'), `${penalty}: overheats`);
  }
  assert.match((compileBlueprint(withRecipes(['heat'])) as any).cards.find((c: any) => c.id === 'cool-down').text, /set your Heat to 0/i);
});

test('meters: aging destroys old units, rage pays off, comeback helps the trailing player', () => {
  const a = withRecipes(['aging']);
  a.meters![0].steps![0].n = 2;
  assert.ok(play(build(a).mod!, 9).s.events.some((e: any) => e.type === 'mt_age_0'), 'units crumble with age');
  const r = withRecipes(['rage']);
  r.meters![0].steps![0].n = 2;
  assert.ok(play(build(r).mod!, 4).s.events.some((e: any) => e.type === 'mt_rage_0'), 'rage fills and pays off');
  const c = withRecipes(['comeback']);
  Object.assign(c.comeback!, { gap: 1, bonus: 'draw', n: 1 });
  assert.ok(play(build(c).mod!, 11).s.events.some((e: any) => e.type === 'comeback'), 'comeback bonus');
});

test('meters: a hand-built game meter with every gain kind, decay, cap, per-point and aura still builds and plays', () => {
  const bp = fromBlueprint('blank');
  const pw = bp.combat.power;
  bp.meters = [
    { id: 'doom', name: 'Doom', on: 'game', gain: [{ on: 'play' }, { on: 'attack' }, { on: 'destroyed' }, { on: 'damaged' }, { on: 'turnEnd' }], max: 6, decay: 1,
      steps: [{ n: 5, reset: true, do: [{ k: 'damage', n: 1, target: 'allUnits' }] }], aura: { at: 3, stat: pw, n: 1 } },
    { id: 'focus', name: 'Focus', on: 'unit', gain: [{ on: 'attack' }, { on: 'damaged' }, { on: 'turnEnd' }], max: 3, per: { stat: pw, n: 1 } },
  ];
  bp.cards[0].abilities.push({ when: 'static', if: { k: 'all', of: [{ k: 'meter', meter: 'doom', n: 2 }, { k: 'not', of: [{ k: 'yourTurn' }] }] }, do: [{ k: 'aura', n: 1, target: 'self' }] });
  const { mod, problems } = build(bp);
  assert.ok(mod, problems.map((p) => p.text).join('; '));
  assert.match((compileBlueprint(bp) as any).cards.find((c: any) => c.id === bp.cards[0].id).text, /if the Doom is 2 or more and not during your turn/i);
  const g = play(mod!, 2);
  assert.ok(g.s.result && g.s.events.some((e: any) => e.type === 'mt_doom_0'), 'doom fills');
});

test('tags: options still find the cards a recipe added after they are renamed and re-ided', () => {
  const bp = withRecipes(['costReducer']);
  const c = bp.cards.find((k) => k.tag === 'costReducer:guild-charter')!;
  assert.ok(c, 'the recipe tags its card');
  c.name = 'Merchant Writ'; c.id = 'merchant-writ';
  for (const d of bp.decks) if (d.main['guild-charter']) { d.main['merchant-writ'] = d.main['guild-charter']; delete d.main['guild-charter']; }
  const o = RECIPES.find((r) => r.id === 'costReducer')!.opts![0];
  setRecipeOpt(bp, o, 2);
  assert.equal(o.get(bp), 2);
  assert.equal((c.abilities[0].do[0] as any).n, 2);
});

test('event messages: a game\'s own log lines (Script Lab) reach the theme and override built-in ones', () => {
  const bp = withRecipes(['comeback']);
  bp.advanced = { log: { doom: '{p} feel{s} the doom ({n})', comeback: '{p} rally!' } };
  const log = (compileBlueprint(bp) as any).manifest.theme.log;
  assert.equal(log.doom, '{p} feel{s} the doom ({n})');
  assert.equal(log.comeback, '{p} rally!');
});

test('fits: one needs/clashes table drives the shelf, the wizard and Surprise me; every mechanic that fits a real game builds there', async () => {
  const { FITS, featuresOf, fitIssues, fits, answerFeatures, optionsFor, WIZARD } = await import('#maker');
  const fs = await import('node:fs');
  for (const id of Object.keys(FITS)) assert.ok(RECIPES.some((r) => r.id === id), `FITS names a recipe that doesn't exist: ${id}`);
  const blank = fromBlueprint('blank');
  assert.ok(featuresOf(blank).has('units'));
  // the shelf: a combat style needs units; swapping a core system warns when the game has scripted cards
  const runs = JSON.parse(fs.readFileSync('packages/modules/lairbreakers/blueprint.json', 'utf8'));
  assert.ok(!fits('block', featuresOf(runs)) && /Unit type/.test(fitIssues('block', featuresOf(runs))[0].text));
  // the wizard: with pitch & attack cards, no other combat style or songs are offered
  const a = { picks: { resources: ['pitch'] }, vals: {} };
  assert.ok(answerFeatures(a).has('res:pitch'));
  const combat = optionsFor(WIZARD.find((s) => s.id === 'combat')!, a).map((o) => o.id);
  assert.ok(!combat.includes('target') && !combat.includes('lanes'), combat.join(','));
  assert.ok(!optionsFor(WIZARD.find((s) => s.id === 'types')!, a).some((o) => o.id === 'songs'));
  // every recipe the table allows on these games builds without new bugs
  for (const [name, make] of [['blank', () => fromBlueprint('blank')], ...['lairbreakers', 'looboo', 'generation-wars'].map((m) => [m, () => JSON.parse(fs.readFileSync(`packages/modules/${m}/blueprint.json`, 'utf8'))])] as [string, () => any][]) {
    for (const r of RECIPES) {
      const bp = make();
      if (!fits(r.id, featuresOf(bp))) continue;
      applyRecipe(bp, r.id);
      const { mod, problems } = build(bp);
      assert.ok(mod, `${name} + ${r.id}: ${problems.filter((p) => p.level === 'bug').map((p) => p.text).join('; ').slice(0, 300)}`);
    }
  }
});

test('generalized blocks: X amounts, comparisons on every number, event triggers, comeback effects and AI meter values', async () => {
  const { amountText, COND_OP } = await import('#maker');
  const bp = withRecipes(['heat', 'comeback']);
  const pw = bp.combat.power;
  const u = bp.cards.find((c) => bp.types.find((t) => t.id === c.type)?.role === 'unit')!;
  // X = your units (+1); an aura that counts cards in hand
  u.abilities.push({ when: 'play', do: [{ k: 'damage', amount: { of: 'units', plus: 1 }, target: 'enemyAny' }] });
  u.abilities.push({ when: 'static', do: [{ k: 'aura', amount: { of: 'hand', times: 0.5 }, stat: pw, target: 'self' }] });
  // comparisons: exactly / at most on kinds that used to be fixed
  u.abilities.push({ when: 'startTurn', if: { k: 'units', op: 'eq', n: 2 }, do: [{ k: 'draw', n: 1 }] });
  u.abilities.push({ when: 'startTurn', if: { k: 'hand', op: 'ge', n: 5 }, do: [{ k: 'discard', n: 1 }] });
  // whenever you overheat (a meter step) and on a script event
  u.abilities.push({ when: 'event', event: 'mt_heat_0', eventWho: 'me', do: [{ k: 'draw', n: 1 }] });
  bp.meters!.push({ id: 'zeal', name: 'Zeal', on: 'player', gain: [{ on: 'event', event: 'mt_heat_0', n: 2 }], ai: 5, steps: [{ n: 4, reset: true, do: [{ k: 'draw', n: 1 }] }] });
  Object.assign(bp.comeback!, { by: 'hand', gap: 1, bonus: 'effects', do: [{ k: 'draw', n: 1 }, { k: 'meter', meter: 'zeal', n: 1 }] });
  meter(bp, 'heat').steps![0].n = 2;
  const def = compileBlueprint(bp) as any;
  const text = def.cards.find((c: any) => c.id === u.id).text;
  assert.match(text, /where X is the number of units you control plus 1/);
  assert.match(text, /where X is half the number of cards in your hand/);
  assert.match(text, /if you control exactly 2 units/i);
  assert.match(text, /if you have 5 or more cards in hand/i);
  assert.match(text, /Whenever Heat reaches 2 \(yours\)/);
  assert.match(def.manifest.theme.log.comeback, /draw a card, then raise your Zeal by 1/);
  assert.equal(amountText({ of: 'meter', meter: 'heat', times: 2 }, bp), '2 times your Heat');
  assert.equal(COND_OP.life, 'le');
  assert.ok(JSON.stringify(def.ai).includes('m_zeal') && JSON.stringify(def.ai).includes('m_heat'), 'the AI weighs meters with a value');
  const { mod, problems } = build(bp);
  assert.ok(mod, problems.map((p) => p.text).join('; '));
  const g = play(mod!, 6);
  assert.ok(g.s.result, 'finishes');
  assert.ok(g.s.events.some((e: any) => e.type === 'mt_heat_0'), 'overheats');
  assert.ok(g.s.events.some((e: any) => e.type === 'comeback'), 'comeback with custom effects');
});
