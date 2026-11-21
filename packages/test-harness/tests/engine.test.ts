import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitAction, createMatch, deckErrors, eventsFor, IllegalAction, listActions, observe, proposeAction, restore, serialize, submitDecision, validateModule } from '#engine';
import { readModuleDir, REF_DIR } from '#harness';
import { fresh, m, place, zone } from './helpers.ts';

test('module validates; bad ops and zones are reported', () => {
  const def = readModuleDir(`${REF_DIR}/spark-duel`);
  assert.deepEqual(validateModule(def), []);
  const bad = structuredClone(def);
  bad.rules.actions.summon.do = [['teleport', '$self']];
  bad.cards[0].effects = [['move', '$self', 'limbo']];
  bad.cards[1].effects = [['draw', ['cardz', '$me', 'hand']]];
  const errs = validateModule(bad).join('\n');
  assert.match(errs, /unknown effect op "teleport"/);
  assert.match(errs, /unknown zone "limbo"/);
  assert.match(errs, /unknown expression op "cardz"/);
});

test('deck construction rules', () => {
  assert.match(deckErrors(m, ['ember-pup']).join(), /deck has 1 cards/);
  const tooMany = [...(m.decks!['ember-rush'] as string[]).slice(0, 17), 'mend', 'mend', 'mend'];
  assert.match(deckErrors(m, tooMany).join(), /3 copies of "mend"/);
  assert.throws(() => createMatch(m, { decks: [['nope'], (m.decks!['ember-rush'] as string[])], seed: 1 }), /Deck 0/);
});

test('setup, phases and turn handoff', () => {
  let g = fresh();
  assert.equal(zone(g, 'p0:hand').length, 4);
  assert.equal(zone(g, 'p0:deck').length, 16);
  assert.equal(g.s.priority, 'p0');
  assert.equal(observe(g, 'p0').phase, 'main');
  assert.equal(g.s.players[0].vars.energy, 1);
  g = commitAction(g, 'p0', { action: 'pass' });
  assert.equal(g.s.priority, 'p1');
  assert.equal(g.s.turn.n, 2);
  assert.equal(zone(g, 'p1:hand').length, 5);
  assert.equal(g.s.players[1].vars.energy, 1);
});

test('rejected actions carry an explanation tree', () => {
  const g = fresh();
  const drake = place(g, 'p0', 'cinder-drake', 'hand');
  const r = proposeAction(g, 'p0', { action: 'summon', source: drake });
  assert.equal(r.ok, false);
  assert.ok(r.children!.some((c) => !c.ok && c.msg === 'Not enough energy.'));
  assert.equal(proposeAction(g, 'p1', { action: 'pass' }).code, 'priority');
  assert.throws(() => commitAction(g, 'p0', { action: 'summon', source: drake }), IllegalAction);
});

test('enter trigger asks for a choice; the decision survives save/restore', () => {
  let g = fresh();
  g.s.players[0].vars.energy = 10;
  const drake = place(g, 'p0', 'cinder-drake', 'hand');
  g = commitAction(g, 'p0', { action: 'summon', source: drake });
  const pd = g.s.pending!;
  assert.equal(pd.player, 'p0');
  assert.ok(pd.options.includes('p1'));
  assert.deepEqual(observe(g, 'p1').pending, { player: 'p0', prompt: 'Deal 2 damage to' });
  assert.deepEqual(listActions(g, 'p0'), []);
  g = restore(m, serialize(g));
  g = submitDecision(g, 'p0', pd.id, ['p1']);
  assert.equal(g.s.players[1].vars.life, 18);
  assert.equal(g.s.priority, 'p0');
});

test('guard restricts attack targets; combat damage is simultaneous', () => {
  let g = fresh();
  const golem = place(g, 'p1', 'moss-golem', 'board');
  const brute = place(g, 'p0', 'quarry-brute', 'board', { ready: 1 });
  const atk = listActions(g, 'p0').find((t) => t.action === 'attack' && t.source === brute)!;
  assert.deepEqual(atk.slots[0].options, [golem]);
  assert.equal(proposeAction(g, 'p0', { action: 'attack', source: brute, targets: { $t: ['p1'] } }).code, 'targets');
  g = commitAction(g, 'p0', { action: 'attack', source: brute, targets: { $t: [golem] } });
  assert.equal(g.s.objects[golem].vars.dmg, 3);
  assert.equal(g.s.objects[brute], undefined, 'brute took 3 and was destroyed');
  assert.equal(zone(g, 'p0:grave').length, 1);
});

test('opponent makes a hidden choice (Pry)', () => {
  let g = fresh();
  g.s.players[0].vars.energy = 10;
  const pry = place(g, 'p0', 'pry', 'hand');
  g = commitAction(g, 'p0', { action: 'cast', source: pry });
  const pd = g.s.pending!;
  assert.equal(pd.player, 'p1');
  assert.deepEqual([...pd.options].sort(), [...zone(g, 'p1:hand')].sort());
  assert.throws(() => submitDecision(g, 'p0', pd.id, [pd.options[0]]), /another player/);
  g = submitDecision(g, 'p1', pd.id, [pd.options[0]]);
  assert.equal(zone(g, 'p1:grave').length, 1);
  assert.equal(zone(g, 'p1:hand').length, 3);
  const chose = eventsFor(g, 'p0').find((e) => e.type === 'chose')!;
  assert.equal(chose.sel, undefined);
});

test('leave-play trigger uses last-known information; zone change makes a new object', () => {
  const deck = (m.decks!['ember-rush'] as string[]).map((c) => (c === 'lantern-moth' ? 'collapse' : c));
  let g = createMatch(m, { decks: [deck, (m.decks!['stone-ward'] as string[])], seed: 5 });
  g.s.players[0].vars.energy = 10;
  const knight = place(g, 'p0', 'hollow-knight', 'board');
  const col = place(g, 'p0', 'collapse', 'hand');
  const hand = zone(g, 'p0:hand').length;
  g = commitAction(g, 'p0', { action: 'cast', source: col, targets: { $t: [knight] } });
  const d = g.s.events.find((e) => e.type === 'destroyed')!;
  assert.equal(d.obj, knight);
  assert.notEqual(d.newObj, knight);
  assert.equal(g.s.objects[d.newObj].inst, d.newObj && g.s.objects[d.newObj].inst);
  assert.equal(zone(g, 'p0:hand').length, hand, 'collapse left hand, knight drew one');
});

test('death trigger, haste rule trigger, and state-based loss', () => {
  let g = fresh();
  g.s.players[0].vars.energy = 10;
  const wisp = place(g, 'p0', 'spark-wisp', 'board');
  const bolt = place(g, 'p0', 'spark-bolt', 'hand');
  g = commitAction(g, 'p0', { action: 'cast', source: bolt, targets: { $t: [wisp] } });
  assert.equal(g.s.players[1].vars.life, 19);
  const runner = place(g, 'p0', 'gale-runner', 'hand');
  g = commitAction(g, 'p0', { action: 'summon', source: runner });
  const onBoard = zone(g, 'p0:board').find((id) => g.s.objects[id].card === 'gale-runner')!;
  assert.equal(g.s.objects[onBoard].vars.ready, 1);
  g.s.players[1].vars.life = 2;
  g = commitAction(g, 'p0', { action: 'attack', source: onBoard, targets: { $t: ['p1'] } });
  assert.deepEqual(g.s.result, { winners: ['p0'], reason: 'lastStanding' });
  assert.deepEqual(listActions(g, 'p0'), []);
});
