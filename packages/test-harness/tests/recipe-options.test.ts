// Mix-and-match sub-options: every option of every recipe changes the blueprint, and every value still builds and plays.
// Plus the "new ideas" mechanics that exist in no source game (world clock, heat, aging, comeback).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mod } from '#engine';
import { createMatch, eventsFor } from '#engine';
import { makeAgent } from '#ai';
import { playMatch } from '#harness';
import { RECIPES, applyRecipe, build, compileBlueprint, fromBlueprint, setRecipeOpt } from '#maker';

const key = (v: unknown) => JSON.stringify(v ?? null);
const decks = (mod: Mod) => { const ids = Object.keys(mod.decks!); return [ids[0], ids[1 % ids.length]].map((d) => structuredClone(mod.decks![d])); };
const play = (mod: Mod, seed: number) => playMatch(createMatch(mod, { decks: decks(mod), seed }), [makeAgent('heuristic', seed), makeAgent('heuristic', seed + 1)]);
const withRecipes = (ids: string[]) => { const bp = fromBlueprint('blank'); for (const r of ids) applyRecipe(bp, r); return bp; };

test('recipe options: every recipe offers options, each value sticks, changes the compiled game, builds and plays', () => {
  const none = RECIPES.filter((r) => !r.opts?.length).map((r) => r.id);
  assert.deepEqual(none, [], 'recipes without options');
  for (const r of RECIPES) for (const o of r.opts!) {
    const compiled = new Set<string>();
    for (const v of o.values) {
      const bp = withRecipes([r.id]);
      setRecipeOpt(bp, o, v);
      assert.equal(key(o.get(bp)), key(v), `${r.id} / ${o.id}: set ${key(v)} but reads ${key(o.get(bp))}`);
      const { mod, problems } = build(bp);
      assert.ok(mod, `${r.id} / ${o.id} = ${key(v)}: ${problems.map((p) => p.text).join('; ')}`);
      compiled.add(JSON.stringify(compileBlueprint(bp)));
      let end; try { end = play(mod!, 3); } catch (e) { throw new Error(`${r.id} / ${o.id} = ${key(v)}: ${(e as Error).message}`); }
      assert.ok(end.s.result, `${r.id} / ${o.id} = ${key(v)} did not finish`);
    }
    assert.ok(compiled.size > 1, `${r.id} / ${o.id}: no value changes the compiled game`);
  }
});

test('new ideas: world clock turns and its last time boosts units', () => {
  const bp = withRecipes(['worldClock']);
  bp.clock!.every = 1;
  const { mod } = build(bp);
  const g = play(mod!, 5);
  const ticks = eventsFor(g, 'clock');
  assert.ok(ticks.length > 2, 'clock events');
  assert.ok(new Set(ticks.map((e: any) => e.n ?? e.data?.n ?? JSON.stringify(e))).size > 1, 'the clock moves between times');
  const def = compileBlueprint(bp) as any;
  assert.deepEqual(def.manifest.theme.clock, bp.clock!.names);
});

test('new ideas: heat overheats and applies its penalty', () => {
  for (const penalty of ['damage', 'discard', 'exhaust'] as const) {
    const bp = withRecipes(['heat']);
    Object.assign(bp.heat!, { limit: 2, per: 'card', penalty, cool: 0 });
    const { mod } = build(bp);
    const g = play(mod!, 7);
    assert.ok(eventsFor(g, 'overheat').length > 0, `${penalty}: overheats`);
  }
});

test('new ideas: aging destroys old units and comeback helps the trailing player', () => {
  const a = withRecipes(['aging']);
  a.aging = { dies: 2 };
  const ga = play(build(a).mod!, 9);
  assert.ok(eventsFor(ga, 'aged').length > 0, 'units crumble with age');
  const c = withRecipes(['comeback']);
  Object.assign(c.comeback!, { gap: 1, bonus: 'draw', n: 1 });
  const gc = play(build(c).mod!, 11);
  assert.ok(eventsFor(gc, 'comeback').length > 0, 'comeback bonus');
});
