import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, compileModule, IllegalAction, listActions, observe, proposeAction, serialize, submitDecision, validateModule } from '#engine';
import { readModuleDir, REF_DIR } from '#harness';
import { arcane as A, cardsIn, place, zone } from './helpers.ts';
import { createMatch } from '#engine';

const def = readModuleDir(`${REF_DIR}/arcane-duel`);
const D = A.decks!;
// Grove deck variant: Mantle Warden listed before Banner Bearer (older timestamps), plus a few spells for tests.
const groveX = ['mantle-warden', 'mantle-warden', 'banner-bearer', 'banner-bearer', 'seedling', 'arc-bolt', 'grove-hulk', 'grove-hulk',
  'swiftblade', 'swiftblade', 'wardstone-golem', 'unmake', 'grove-herald', 'grove-herald', 'storm-drake', 'storm-drake', 'pacify', 'pacify',
  'hexing-gaze', 'growth-surge'];
function start(decks: string[][], mod = A, seed = 3): Match {
  const g = createMatch(mod, { decks, seed });
  for (const p of g.s.players) p.vars.mana = 10;
  return g;
}
const act = (g: Match, p: string, action: string, source: string | null = null, t?: string[]) =>
  commitAction(g, p, { action, source, targets: t ? { $t: t } : {} });
const passBoth = (g: Match) => act(act(g, g.s.priority!, 'pass'), g.s.priority === 'p0' ? 'p1' : 'p0', 'pass');
const stat = (g: Match, id: string) => {
  const v = observe(g, 'p0').zones[g.s.objects[id].zone].cards!.find((c) => c.id === id)!;
  return { stats: v.stats!, keywords: v.keywords! };
};

test('arcane-duel validates; new constructs are checked', () => {
  assert.deepEqual(validateModule(def), []);
  const bad = structuredClone(def);
  bad.cards.find((c) => c.id === 'wither')!.effects = [['modify', '$t', { layer: 'nope', mods: [] }]];
  bad.cards.find((c) => c.id === 'mirror-sentinel')!.replacements![0].replace = 'explode';
  bad.cards.find((c) => c.id === 'banner-bearer')!.statics![0].mods[0].stat = 'speed';
  const errs = validateModule(bad).join('\n');
  assert.match(errs, /modify needs a layer/);
  assert.match(errs, /cannot replace "explode"/);
  assert.match(errs, /"speed" is not in rules.stats/);
});

test('stack: priority passing, speed limits, counter', () => {
  let g = start([D['grove-host'], D['storm-circle']]);
  const hulk = place(g, 'p0', 'grove-hulk', 'hand');
  const hush = place(g, 'p1', 'hush', 'hand');
  const sent = place(g, 'p1', 'mirror-sentinel', 'hand');
  g = act(g, 'p0', 'summon', hulk);
  assert.equal(g.s.stack.length, 1);
  assert.equal(g.s.priority, 'p0', 'stack timing: caster keeps priority');
  assert.deepEqual(listActions(g, 'p1'), []);
  g = act(g, 'p0', 'pass');
  assert.equal(g.s.priority, 'p1');
  assert.equal(proposeAction(g, 'p1', { action: 'summon', source: sent }).code, 'speed');
  const item = g.s.stack[0].id;
  assert.deepEqual(listActions(g, 'p1').find((t) => t.source === hush)!.slots[0].options, [item]);
  g = act(g, 'p1', 'flash', hush, [item]);
  assert.equal(g.s.stack.length, 2);
  g = passBoth(g);
  assert.equal(g.s.stack.length, 0);
  assert.deepEqual(cardsIn(g, 'p0:grave'), ['grove-hulk']);
  assert.deepEqual(cardsIn(g, 'p1:grave'), ['hush']);
  assert.equal(g.s.players[1].vars.charge, 1);
  assert.equal(g.s.priority, 'p0');
});

test('targets are rechecked on resolution: a spell with no legal target fizzles', () => {
  let g = start([D['storm-circle'], D['grove-host']]);
  const blade = place(g, 'p1', 'swiftblade', 'board');
  const b1 = place(g, 'p0', 'arc-bolt', 'hand');
  const b2 = place(g, 'p0', 'arc-bolt', 'hand');
  g = act(act(g, 'p0', 'flash', b1, [blade]), 'p0', 'flash', b2, [blade]);
  g = passBoth(g);
  assert.equal(g.s.objects[blade], undefined);
  g = passBoth(g);
  assert.equal(g.s.events.filter((e) => e.type === 'fizzled').length, 1);
  assert.deepEqual(cardsIn(g, 'p0:grave'), ['arc-bolt', 'arc-bolt']);
});

test('replacement (ward) and prevention (damage reduction)', () => {
  let g = start([groveX, D['storm-circle']]);
  const adept = place(g, 'p1', 'ember-adept', 'board', { ward: 1 });
  const un = place(g, 'p0', 'unmake', 'hand');
  g = passBoth(act(g, 'p0', 'cast', un, [adept]));
  assert.ok(g.s.objects[adept], 'ward replaced the destruction');
  assert.equal(g.s.objects[adept].vars.ward, 0);
  assert.ok(g.s.events.some((e) => e.type === 'replaced' && e.event === 'destroy'));
  const sent = place(g, 'p1', 'mirror-sentinel', 'board');
  const bolt = place(g, 'p0', 'arc-bolt', 'hand');
  g = passBoth(act(g, 'p0', 'flash', bolt, [sent]));
  assert.equal(g.s.objects[sent].vars.dmg, 1);
});

test('layers: dependency beats timestamp, set before add, counters last, effects expire', () => {
  for (const order of ['mantle-first', 'banner-first']) {
    const deck = order === 'mantle-first' ? groveX : [...groveX.slice(2, 4), ...groveX.slice(0, 2), ...groveX.slice(4)];
    let g = start([deck, D['storm-circle']]);
    const mantle = place(g, 'p0', 'mantle-warden', 'board');
    const banner = place(g, 'p0', 'banner-bearer', 'board');
    const blade = place(g, 'p0', 'swiftblade', 'board');
    assert.deepEqual(stat(g, blade).stats, { power: 3, health: 2, cost: 2 }, order);
    assert.deepEqual(stat(g, mantle).stats, { power: 3, health: 4, cost: 3 }, order);
    assert.deepEqual(stat(g, banner).stats, { power: 1, health: 2, cost: 2 }, order);
    if (order === 'banner-first') continue;
    const hulk = place(g, 'p0', 'grove-hulk', 'board');
    const gaze = place(g, 'p0', 'hexing-gaze', 'hand');
    g = passBoth(act(g, 'p0', 'cast', gaze, [hulk]));
    assert.equal(stat(g, hulk).stats.power, 2, 'set 1, then +1 banner');
    assert.ok(!stat(g, hulk).keywords.includes('guard'));
    const surge = place(g, 'p0', 'growth-surge', 'hand');
    g = passBoth(act(g, 'p0', 'flash', surge, [hulk]));
    assert.deepEqual(stat(g, hulk).stats, { power: 4, health: 7, cost: 4 }, 'set 1, +1 banner, +2 growth; mantle sees power 2 in its layer, so health 5+2');
    g = act(act(g, 'p0', 'pass'), 'p1', 'pass'); // end p0's turn
    assert.equal(stat(g, hulk).stats.power, 6, 'gaze expired: 3 +1 +2');
    assert.ok(stat(g, hulk).keywords.includes('guard'));
  }
});

test('aura: link relationship, granted restriction, falls off when its host leaves', () => {
  let g = start([groveX, D['storm-circle']]);
  const adept = place(g, 'p1', 'ember-adept', 'board', { ready: 1 });
  const pac = place(g, 'p0', 'pacify', 'hand');
  g = passBoth(act(g, 'p0', 'cast', pac, [adept]));
  const aura = zone(g, 'p0:board').find((id) => g.s.objects[id].card === 'pacify')!;
  assert.equal(g.s.objects[aura].rel!.bound, adept);
  assert.ok(stat(g, adept).keywords.includes('pacified'));
  const bolt = place(g, 'p0', 'arc-bolt', 'hand');
  g = passBoth(act(g, 'p0', 'flash', bolt, [adept]));
  assert.equal(g.s.objects[aura], undefined, 'state check sent the unbound aura to the grave');
  assert.ok(cardsIn(g, 'p0:grave').includes('pacify'));
});

test('simultaneous triggers: controller orders them; enter choice on resolution', () => {
  let g = start([groveX, D['storm-circle']]);
  place(g, 'p0', 'grove-herald', 'board');
  const seed = place(g, 'p0', 'seedling', 'hand');
  g = passBoth(act(g, 'p0', 'summon', seed));
  const pd = g.s.pending!;
  assert.equal(pd.kind, 'order');
  assert.deepEqual(Object.values(pd.labels!).sort(), ['Grove Herald: gain 1 life', 'Seedling: growth counter']);
  const heraldT = Object.keys(pd.labels!).find((k) => pd.labels![k].startsWith('Grove'))!;
  g = submitDecision(g, 'p0', pd.id, [heraldT]); // herald goes on the stack first, resolves last
  assert.deepEqual(g.s.stack.map((x) => x.label), ['Grove Herald: gain 1 life', 'Seedling: growth counter']);
  g = passBoth(g);
  const choose = g.s.pending!;
  assert.equal(choose.kind, 'choose');
  const onBoard = zone(g, 'p0:board').find((id) => g.s.objects[id].card === 'seedling')!;
  g = submitDecision(g, 'p0', choose.id, [onBoard]);
  assert.equal(g.s.objects[onBoard].vars.growth, 1);
  const life = g.s.players[0].vars.life;
  g = passBoth(g);
  assert.equal(g.s.players[0].vars.life, life + 1);
});

test('chain timing: no priority retention, speed ladder, links resolve back to back', () => {
  const chainDef = structuredClone(def);
  chainDef.rules.timing = { mode: 'chain' };
  const C = compileModule(chainDef);
  let g = start([groveX, D['storm-circle']], C);
  const blade = place(g, 'p0', 'swiftblade', 'hand');
  const extra = place(g, 'p0', 'grove-hulk', 'hand');
  const bolt = place(g, 'p1', 'arc-bolt', 'hand');
  g = act(g, 'p0', 'summon', blade);
  assert.equal(g.s.priority, 'p1', 'chain timing passes priority to the opponent');
  g = act(g, 'p1', 'flash', bolt, ['p0']);
  assert.equal(g.s.priority, 'p0');
  assert.equal(proposeAction(g, 'p0', { action: 'summon', source: extra }).code, 'speed');
  g = passBoth(g);
  assert.equal(g.s.stack.length, 0, 'both links resolved without further passes');
  assert.equal(g.s.players[0].vars.life, 20 - 2);
  assert.ok(cardsIn(g, 'p0:board').includes('swiftblade'));
  assert.equal(g.s.priority, 'p0');
});

test('costs are atomic: an unpayable cost rejects the action and changes nothing', () => {
  const d = structuredClone(def);
  d.rules.actions.offer = {
    label: 'Offer', phases: ['main'], speed: 1, stack: false,
    cost: [['choose', { from: ['filter', ['cards', '$me', 'board'], ['=', ['get', '$it', 'type'], 'unit']], as: '$x', required: true, prompt: 'unit to offer' }],
      ['inc', '$me', 'mana', -1], ['destroy', '$x']],
    do: [['inc', '$me', 'life', 5]],
  };
  const O = compileModule(d);
  let g = start([groveX, D['storm-circle']], O);
  const before = serialize(g);
  assert.throws(() => act(g, 'p0', 'offer'), (e: unknown) => e instanceof IllegalAction && e.reason.code === 'cost');
  assert.equal(serialize(g), before);
  place(g, 'p0', 'swiftblade', 'board');
  g = act(g, 'p0', 'offer');
  assert.equal(g.s.players[0].vars.life, 25);
  assert.equal(g.s.players[0].vars.mana, 9);
  assert.deepEqual(cardsIn(g, 'p0:grave'), ['swiftblade']);
});
