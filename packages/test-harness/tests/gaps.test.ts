// Engine primitives for common TCG structures: timing windows, slotted zones, typed resources, deck rules, usage limits.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Deck, Match, ModuleDef } from '#engine';
import { applyCmd, commitAction, createMatch, deckErrors, eventHash, invalidate, listActions, observe, proposeAction, restore, serialize, validateModule } from '#engine';
import { deckOpts, loadRef } from '#harness';
import { place } from './helpers.ts';

const B = loadRef('bastion-clash');
const fresh = (decks = ['dusk-tide', 'dawn-vanguard'], scenario?: any) => createMatch(B, { ...deckOpts(B, decks, 5), ...(scenario ? { scenario } : {}) });
const pool = (g: Match, p: string, sun: number, moon: number) => { Object.assign(g.s.players[+p.slice(1)].vars, { 'aether:sun': sun, 'aether:moon': moon }); invalidate(g.s); };
const slotted = (g: Match, p: string, card: string, zone: string, slot: string) => { const id = place(g, p, card, zone); g.s.objects[id].slot = slot; return id; };
const tpl = (g: Match, p: string, action: string, src?: string) => listActions(g, p).find((t) => t.action === action && (src === undefined || t.source === src));
const act = (g: Match, p: string, action: string, source?: string, targets?: Record<string, string[]>) => commitAction(g, p, { action, source, targets });
const pass = (g: Match) => act(g, g.s.priority!, 'pass');
const newest = (g: Match, card: string, zone: string) => g.s.zones[zone].filter((id) => g.s.objects[id].card === card).at(-1)!;

test('timing window: combat steps run mid-turn with their own actions and priority, then the attack effect resumes', () => {
  let g = fresh();
  const a = slotted(g, 'p0', 'ember-squire', 'field', 'front-mid');
  slotted(g, 'p0', 'lantern-page', 'field', 'back-mid'); // supports the unit in front of it
  const archer = slotted(g, 'p0', 'moonlit-archer', 'field', 'back-left');
  slotted(g, 'p1', 'iron-helm', 'gear', 'head');
  const parry = place(g, 'p1', 'parry', 'hand');
  const attackers = listActions(g, 'p0').filter((t) => t.action === 'attack').map((t) => t.source);
  assert.deepEqual(attackers.sort(), [a, archer].sort(), 'front row attacks; the back row only with reach');
  assert.ok(!tpl(g, 'p0', 'guard'), 'guard cards only work in the block step');

  g = act(g, 'p0', 'attack', a, { $t: ['p1'] });
  const v = observe(g, 'p0');
  assert.deepEqual([v.window?.id, v.window?.step, v.phase], ['combat', 'block', 'block']);
  assert.equal(g.s.priority, 'p1', 'the step timing gives the defender the first action');
  const mid = restore(B, serialize(g));
  g = act(g, 'p1', 'guard', parry);
  assert.equal(g.s.priority, 'p0', 'alternate timing inside the step');
  assert.equal(g.s.windows[0].data.guard, 1);
  g = pass(pass(g));
  assert.equal(g.s.windows.length, 0);
  assert.equal(g.s.players[1].vars.life, 19, '2 power + 1 support - 1 guard - 1 armor');
  assert.equal(observe(g, 'p0').phase, 'main');
  assert.equal(g.s.priority, 'p0');
  const types = g.s.events.map((e) => (e.type === 'log' ? e.msg : e.type));
  assert.ok(types.lastIndexOf('windowClosed') < types.lastIndexOf('The clash is over'), 'the opening effect resumes after the window');
  assert.deepEqual(types.filter((t) => t === 'step').length, 3);
  const r = proposeAction(g, 'p0', { action: 'attack', source: a, targets: { $t: ['p1'] } });
  assert.equal(r.code, 'limit', 'each unit attacks once per turn');

  // A save made inside the window continues identically.
  let h = mid;
  for (const c of g.s.cmds.slice(mid.s.cmds.length)) h = applyCmd(h, c);
  assert.equal(eventHash(h.s), eventHash(g.s));
});

test('slotted zones: chosen positions, room checks, adjacency, swaps and full slots', () => {
  let g = fresh();
  pool(g, 'p0', 5, 5);
  const s1 = place(g, 'p0', 'ember-squire', 'hand');
  const s2 = place(g, 'p0', 'ember-squire', 'hand');
  assert.deepEqual(tpl(g, 'p0', 'deploy', s1)!.slots[0].options, ['front-left', 'front-mid', 'front-right', 'back-left', 'back-mid', 'back-right']);
  g = act(g, 'p0', 'deploy', s1, { $pos: ['front-left'] });
  const u1 = newest(g, 'ember-squire', 'p0:field');
  assert.equal(observe(g, 'p1').zones['p0:field'].cards!.find((o) => o.id === u1)!.slot, 'front-left');
  assert.ok(!tpl(g, 'p0', 'deploy', s2)!.slots[0].options.includes('front-left'), 'an occupied slot is not offered');
  g = act(g, 'p0', 'deploy', s2, { $pos: ['front-mid'] });
  const u2 = newest(g, 'ember-squire', 'p0:field');
  g = act(g, 'p0', 'reposition', u1, { $to: ['front-mid'] });
  assert.deepEqual([g.s.objects[u1].slot, g.s.objects[u2].slot], ['front-mid', 'front-left'], 'moving into a full slot swaps');
  assert.equal(proposeAction(g, 'p0', { action: 'reposition', source: u1, targets: { $to: ['back-mid'] } }).code, 'limit', 'once per turn per unit');
  assert.ok(tpl(g, 'p0', 'reposition', u2), 'the swapped unit keeps its own allowance');

  const full = fresh(undefined, { setup: [
    ['each', ['range', 7], '$i', [['create', 'ember-squire', 'p0', 'field']]],
    ['create', 'iron-helm', 'p0', 'gear', { as: '$h1' }], ['create', 'iron-helm', 'p0', 'gear', { as: '$h2' }], ['create', 'sunplate', 'p0', 'gear', { slot: 'head' }],
  ] });
  assert.equal(full.s.zones['p0:field'].length, 6, 'six slots, the seventh unit has no room');
  assert.deepEqual(full.s.zones['p0:gear'].map((id) => full.s.objects[id].slot), ['head'], 'one head slot; body armor cannot take the head slot');
  assert.equal(full.s.events.filter((e) => e.type === 'slotFull').length, 3);
  pool(full, 'p0', 9, 9);
  place(full, 'p0', 'lantern-page', 'hand');
  assert.ok(!tpl(full, 'p0', 'deploy'), 'no free slot: nothing to deploy');
});

test('typed resources: specific then generic payment, thresholds, expiry and atomic failure', () => {
  let g = fresh();
  pool(g, 'p0', 3, 1);
  const pal = place(g, 'p0', 'twin-star-paladin', 'hand');
  g = act(g, 'p0', 'deploy', pal, { $pos: ['front-mid'] });
  assert.deepEqual([g.s.players[0].vars['aether:sun'], g.s.players[0].vars['aether:moon']], [1, 0], 'generic paid from the larger pool');
  const paid = g.s.events.find((e) => e.type === 'paid')!;
  assert.deepEqual(paid.paid, { sun: 2, moon: 1 });

  let t = fresh();
  pool(t, 'p0', 0, 6);
  const golem = place(t, 'p0', 'tide-golem', 'hand');
  place(t, 'p0', 'moon-well', 'wells');
  assert.ok(!tpl(t, 'p0', 'deploy', golem), 'needs two moon wells in play (a threshold, not a payment)');
  place(t, 'p0', 'twilight-well', 'wells');
  assert.ok(tpl(t, 'p0', 'deploy', golem));
  pool(t, 'p0', 1, 1);
  assert.ok(!tpl(t, 'p0', 'deploy', golem), 'threshold met but the cost is not');

  pool(g, 'p0', 3, 2);
  g = pass(g);
  assert.deepEqual([g.s.players[0].vars['aether:sun'], g.s.players[0].vars['aether:moon']], [0, 0], 'pools empty at end of turn');
  assert.throws(() => fresh(undefined, { setup: [['pay', 'p0', 'aether', { moon: 1 }]] }), /not enough aether/);
});

test('deck construction rules as expressions, copies by name, per-section structure', () => {
  const base = B.decks!['dawn-vanguard'] as Record<string, string[]>;
  const with_ = (f: (d: string[]) => string[], hero = base.hero): Deck => ({ hero, deck: f([...base.deck]) });
  assert.deepEqual(deckErrors(B, base), []);
  assert.deepEqual(deckErrors(B, B.decks!['dusk-tide']), []);
  assert.deepEqual(deckErrors(B, with_((d) => [...d, 'moon-well'])), ['Every card must be neutral or share an aspect with your hero']);
  assert.ok(deckErrors(B, with_((d) => [...d, 'iron-helm', 'sunplate'])).includes('At most 3 gear cards'));
  assert.ok(deckErrors(B, with_((d) => [...d, 'sun-well-gilded'])).includes('9 copies of "Sun Well" (max 8)'), 'two printings, one name');
  assert.ok(deckErrors(B, with_((d) => d.filter((c) => !c.startsWith('sun-well')).concat('sun-well', 'sun-well', 'sun-well'))).includes('At least 8 wells'));
  assert.ok(deckErrors(B, with_((d) => d, [])).includes('hero section has 0 cards (needs 1-1)'));
  assert.ok(deckErrors(B, { hero: ['tide-seer'], deck: [...(B.decks!['dusk-tide'] as any).deck, 'twilight-well'] }).includes('2 copies of "Twilight Well" (max 1)'));
});

test('usage limits: per turn by group, by card name, and on triggered abilities', () => {
  let g = fresh();
  const w1 = place(g, 'p0', 'sun-well', 'hand');
  const w2 = place(g, 'p0', 'sun-well', 'hand');
  g = act(g, 'p0', 'playWell', w1);
  assert.equal(g.s.players[0].vars['aether:sun'], 1, 'a new well yields at once');
  const r = proposeAction(g, 'p0', { action: 'playWell', source: w2 });
  assert.deepEqual([r.code, r.msg], ['limit', 'Raise well can only be used once per turn.']);
  g = pass(pass(g));
  assert.equal(g.s.turn.n, 3);
  assert.ok(tpl(g, 'p0', 'playWell', w2), 'the allowance resets each turn');

  pool(g, 'p0', 0, 4);
  const hero = g.s.zones['p0:hero'][0];
  const hand = () => g.s.zones['p0:hand'].length;
  const n = hand();
  g = act(g, 'p0', 'heroPower', hero);
  assert.equal(hand(), n + 1);
  assert.equal(proposeAction(g, 'p0', { action: 'heroPower', source: hero }).code, 'limit');

  const p1 = place(g, 'p0', 'lantern-page', 'hand');
  const p2 = place(g, 'p0', 'lantern-page', 'hand');
  const before = hand();
  g = act(g, 'p0', 'deploy', p1, { $pos: ['front-left'] });
  assert.equal(hand(), before, 'played one, drew one');
  g = act(g, 'p0', 'deploy', p2, { $pos: ['front-right'] });
  assert.equal(hand(), before - 1, 'the enter ability is limited to once per turn');
});

test('validation catches bad windows, slots, resources and limits', () => {
  const def = structuredClone({ manifest: B.manifest, rules: B.rules, cards: B.cards, decks: B.decks, ai: B.ai }) as ModuleDef;
  const R = def.rules as any;
  R.windows.combat.steps.push({ id: 'block' });
  R.zones.find((z: any) => z.id === 'gear').slots[0].adj = ['nowhere'];
  R.actions.attack.limit = { per: 'round' };
  R.actions.equip.cost = [['pay', '$me', 'mana', 1]];
  R.actions.deploy.do.push(['openWindow', 'duel']);
  R.actions.guard.phases = ['parley'];
  R.resources.aether.types.push('any');
  R.format.rules.push({ if: ['bogus'], why: 'x' });
  const errs = validateModule(def).join('\n');
  for (const want of ['step ids must be unique', 'unknown slot "nowhere"', 'limit needs {per', 'unknown resource "mana"', 'unknown window "duel"',
    'unknown phase or window step "parley"', 'cannot also be a type', 'unknown expression op "bogus"']) assert.match(errs, new RegExp(want.replace(/[{(]/g, '\\$&')));
});
