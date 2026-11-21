import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitAction, createMatch, eventHash, replay } from '#engine';
import { randomAgent } from '#ai';
import { type Campaign, CampaignError, buy, campaignOf, encounterAgent, finishEncounter, newProfile, nodeState, openBooster, startEncounter, validateCampaign } from '#campaign';
import { loadRef, playMatch } from '#harness';
import { place } from './helpers.ts';
import { seedRng } from '#engine';

const m = loadRef('spark-duel');
const c = campaignOf(m) as Campaign;
const fresh = () => newProfile(m, c, 42);

test('campaign data validates; broken references are reported', () => {
  assert.deepEqual(validateCampaign(m, c), []);
  const bad = structuredClone(c);
  bad.encounters.raiders.deck = 'nope';
  bad.encounters.champion.scenario!.setup = [['teleport']];
  bad.shop![0].booster = 'missing';
  bad.starter.collection['tin-squire'] = 1;
  const errs = validateCampaign(m, bad).join('\n');
  assert.match(errs, /raiders: unknown deck "nope"/);
  assert.match(errs, /champion\/scenario\/setup\/0\/0: unknown effect op "teleport"/);
  assert.match(errs, /unknown booster "missing"/);
  assert.match(errs, /needs 2× tin-squire, you own 1/);
});

test('progression: nodes unlock in order; decks must be legal and owned', () => {
  let p = fresh();
  assert.deepEqual(['training', 'raiders', 'champion'].map((n) => nodeState(c, p, n)), ['open', 'locked', 'locked']);
  assert.throws(() => startEncounter(m, c, p, 'raiders', 'Ward of the Road', 1), (e: unknown) => e instanceof CampaignError && /locked/.test(e.message));
  p.decks.Cheat = [...(m.decks!['ember-rush'] as string[])];
  assert.throws(() => startEncounter(m, c, p, 'training', 'Cheat', 1), /you own 0/);
  const s = startEncounter(m, c, p, 'training', 'Ward of the Road', 1);
  assert.deepEqual(s.profile.active, { encounter: 'training', seq: 1 });
  p = finishEncounter(c, s.profile, 'training', 1, { winners: ['p0'], reason: 'lastStanding' }).profile;
  assert.equal(nodeState(c, p, 'raiders'), 'open');
});

test('rewards are applied exactly once per attempt (reload-safe); repeat rewards differ', () => {
  const s = startEncounter(m, c, fresh(), 'training', 'Ward of the Road', 1);
  const win = { winners: ['p0'], reason: 'lastStanding' };
  const a = finishEncounter(c, s.profile, 'training', 1, win);
  assert.equal(a.profile.currency, 60 + 40);
  assert.equal(a.granted!.packs[0].cards.length, 5);
  const again = finishEncounter(c, a.profile, 'training', 1, win);
  assert.equal(again.granted, null);
  assert.equal(again.profile, a.profile, 'second application is a no-op');
  const s2 = startEncounter(m, c, a.profile, 'training', 'Ward of the Road', 2);
  const b = finishEncounter(c, s2.profile, 'training', s2.profile.active!.seq, win);
  assert.equal(b.profile.currency, 100 + 10, 'repeat reward');
  const lost = finishEncounter(c, startEncounter(m, c, b.profile, 'raiders', 'Ward of the Road', 3).profile, 'raiders', 3, { winners: ['p1'], reason: 'lastStanding' });
  assert.equal(lost.won, false);
  assert.equal(lost.profile.currency, 110);
});

test('shop: prices, stock, deterministic boosters with slot pools', () => {
  let p = fresh();
  const r = buy(c, p, 'ember-pack');
  assert.equal(r.profile.currency, 10);
  assert.equal(r.cards.length, 5);
  assert.ok(c.boosters!.ember.slots[1].pool.includes(r.cards[4]), 'last slot comes from the rare pool');
  assert.deepEqual(buy(c, p, 'ember-pack').cards, r.cards, 'same profile state gives the same pack');
  assert.throws(() => buy(c, r.profile, 'ember-pack'), /not enough Sparks/);
  p = { ...fresh(), currency: 500 };
  p = buy(c, p, 'buy-cinder-drake').profile;
  assert.equal(p.collection['cinder-drake'], 1);
  assert.throws(() => buy(c, p, 'buy-cinder-drake'), /sold out/);
  const many = Array.from({ length: 200 }, (_, i) => openBooster(c, 'ember', seedRng(i))[4]);
  assert.ok(many.filter((x) => x === 'cinder-drake').length < many.filter((x) => x === 'moss-golem').length, 'weights matter');
});

test('boss scenario: setup, once-only overdrive with reinforcements and AI phase, objective loss', () => {
  let p = fresh();
  p.wins = { training: 1, raiders: 1 };
  const { opts } = startEncounter(m, c, p, 'champion', 'Ward of the Road', 7);
  let g = createMatch(m, opts);
  assert.equal(g.s.players[1].vars.life, 30);
  assert.equal(g.s.vars.bossPhase, 1);
  const cardsOn = (z: string) => g.s.zones[z].map((id) => g.s.objects[id].card);
  assert.ok(cardsOn('p1:board').includes('brass-bulwark') && cardsOn('p0:board').includes('signal-beacon'));

  g.s.players[1].vars.life = 16;
  g.s.players[0].vars.energy = 9;
  const collapse = place(g, 'p0', 'collapse', 'hand');
  const bulwark = g.s.zones['p1:board'][0];
  g = commitAction(g, 'p0', { action: 'cast', source: collapse, targets: { $t: [bulwark] } });
  g.s.players[1].vars.life = 16;
  // Drop the boss below 15 through the engine (Spark Bolt is not in the Ward deck, so a fixture unit attacks).
  const brute = place(g, 'p0', 'quarry-brute', 'board', { ready: 1 });
  g = commitAction(g, 'p0', { action: 'attack', source: brute, targets: { $t: ['p1'] } });
  assert.equal(g.s.players[1].vars.life, 13);
  assert.equal(g.s.vars.bossPhase, 2);
  assert.equal(cardsOn('p1:board').filter((x) => x === 'clockwork-sentry').length, 2);
  assert.ok(g.s.events.some((e) => e.type === 'dialogue' && /OVERDRIVE/.test(e.text)));
  g.s.players[1].vars.life = 14; // a later change below 15 must not fire again
  const b2 = place(g, 'p0', 'tin-squire', 'board', { ready: 1 });
  const sentry = g.s.zones['p1:board'].find((id) => g.s.objects[id].card === 'clockwork-sentry')!;
  g = commitAction(g, 'p0', { action: 'attack', source: b2, targets: { $t: [sentry] } });
  assert.equal(cardsOn('p1:board').filter((x) => x === 'clockwork-sentry').length, 2, 'overdrive fired once');

  const beacon = g.s.zones['p0:board'].find((id) => g.s.objects[id].card === 'signal-beacon')!;
  const col2 = place(g, 'p0', 'collapse', 'hand');
  g = commitAction(g, 'p0', { action: 'cast', source: col2, targets: { $t: [beacon] } });
  assert.deepEqual(g.s.result, { winners: ['p1'], reason: 'lastStanding' }, 'losing the objective loses the match');
});

test('a full boss match plays out with the phased encounter agent', () => {
  let p = fresh();
  p.wins = { training: 1, raiders: 1 };
  const { opts } = startEncounter(m, c, p, 'champion', 'Ward of the Road', 11);
  const end = playMatch(createMatch(m, opts), [randomAgent(3), encounterAgent(c.encounters.champion, 5)]);
  assert.ok(end.s.result);
  assert.equal(replay(m, end.s.opts, end.s.cmds).hash, eventHash(end.s), 'scenarios replay deterministically');
});
