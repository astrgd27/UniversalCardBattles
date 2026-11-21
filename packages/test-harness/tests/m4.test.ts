import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventsFor, listActions, observe, proposeAction, submitDecision } from '#engine';
import { deckOpts, loadRef } from '#harness';
import { cardsIn, place } from './helpers.ts';

const act = (g: Match, p: string, action: string, source: string | null = null, targets: Record<string, string[]> = {}) =>
  commitAction(g, p, { action, source, targets });
const passRound = (g: Match) => {
  for (let i = g.s.players.filter((p) => !p.lost).length; i > 0; i--) g = act(g, g.s.priority!, 'pass');
  return g;
};
const view = (g: Match, p: string, id: string) => observe(g, p).zones[g.s.objects[id].zone].cards!.find((c) => c.id === id)!;

test('tri-lane: secret simultaneous deploys, lanes, adjacency statics, alternating maneuvers', () => {
  const T = loadRef('tri-lane');
  let g: Match | undefined;
  for (let seed = 1; seed < 50 && !g; seed++) {
    const c = createMatch(T, deckOpts(T, ['vanguard', 'outriders'], seed));
    if (c.s.pending?.player === 'p0' && c.s.pending.options.length) g = c;
  }
  assert.ok(g);
  let pd = g.s.pending!;
  assert.equal(pd.secret, true);
  assert.deepEqual(observe(g, 'p1').pending, { player: 'p0', prompt: pd.prompt });
  const inst = g.s.objects[pd.options[0]].inst;
  g = submitDecision(g, 'p0', pd.id, [pd.options[0]]);
  assert.equal(eventsFor(g, 'p1').filter((e) => e.type === 'chose').at(-1)!.sel, undefined, 'secret pick is masked');
  if (g.s.pending!.player === 'p1' && g.s.pending!.min === 0) g = submitDecision(g, 'p1', g.s.pending!.id, []);
  pd = g.s.pending!;
  assert.equal(pd.player, 'p0');
  assert.deepEqual(pd.options, ['1', '2', '3']);
  assert.ok(!g.s.events.some((e) => e.type === 'revealed'), 'nothing is revealed until every lane is chosen');
  g = submitDecision(g, 'p0', pd.id, ['2']);
  g = submitDecision(g, 'p1', g.s.pending!.id, ['3']);
  assert.ok(eventsFor(g, 'p1').some((e) => e.type === 'revealed'));
  const unit = g.s.zones['p0:board'].find((id) => g!.s.objects[id].inst === inst)!;
  assert.equal(g.s.objects[unit].vars.lane, 2);
  assert.equal(observe(g, 'p0').phase, 'maneuver');
  assert.equal(g.s.priority, 'p0');
  g = act(g, 'p0', 'pass');
  assert.equal(g.s.priority, 'p1', 'alternate timing hands the turn to the next player');

  const h = createMatch(T, deckOpts(T, ['vanguard', 'outriders'], 2));
  const spot = place(h, 'p1', 'spotter', 'board', { lane: 2 });
  const scout = place(h, 'p1', 'scout', 'board', { lane: 1 });
  assert.equal(view(h, 'p0', scout).stats!.power, 2, 'spotter buffs the adjacent lane');
  assert.equal(view(h, 'p0', spot).stats!.power, 1);
});

test('relic-chain: face-down traps, fusion recipes, chain responses', () => {
  const R = loadRef('relic-chain');
  let g = createMatch(R, deckOpts(R, ['blaze-pack', 'bulwark-pack'], 3));
  g = act(g, 'p0', 'set', place(g, 'p0', 'mirror-ward', 'hand'));
  const trap = g.s.zones['p0:traps'][0];
  assert.deepEqual([view(g, 'p1', trap).card, view(g, 'p1', trap).faceDown], ['', true]);
  assert.equal(view(g, 'p0', trap).card, 'mirror-ward');
  assert.ok(!listActions(g, 'p0').some((t) => t.action === 'spring'), 'cannot spring on the turn it was set');

  const hound = place(g, 'p0', 'ash-hound', 'hand');
  const knight = place(g, 'p0', 'rune-knight', 'hand');
  const fang = place(g, 'p0', 'twin-fang', 'hand');
  const extra = g.s.zones['p0:extra'][0];
  assert.equal(proposeAction(g, 'p0', { action: 'fuse', source: extra, targets: { $mats: [hound, knight] } }).code, 'check');
  g = act(g, 'p0', 'fuse', extra, { $mats: [hound, fang] });
  assert.equal(g.s.priority, 'p1', 'chain timing: the opponent may respond');
  g = passRound(g);
  const wh = g.s.zones['p0:board'].find((id) => g.s.objects[id].card === 'ashen-warhound')!;
  assert.equal(view(g, 'p1', wh).stats!.atk, 6);
  assert.deepEqual(cardsIn(g, 'p0:grave').sort(), ['ash-hound', 'twin-fang']);

  g = passRound(g); // end p0's turn
  assert.equal(g.s.priority, 'p1');
  const rk = place(g, 'p1', 'rune-knight', 'board', { ready: 1, pos: 1 });
  g = act(g, 'p1', 'attack', rk, { $t: [wh] });
  assert.equal(g.s.priority, 'p0');
  const attack = g.s.stack[0].id;
  assert.deepEqual(listActions(g, 'p0').find((t) => t.action === 'spring')!.slots[0].options, [attack]);
  g = act(g, 'p0', 'spring', trap, { $t: [attack] });
  g = passRound(g);
  assert.ok(g.s.events.some((e) => e.type === 'countered' && e.item === attack));
  assert.ok(g.s.objects[wh] && g.s.objects[rk], 'the attack was negated');
  assert.ok(cardsIn(g, 'p0:grave').includes('mirror-ward'));
  assert.ok(eventsFor(g, 'p1').some((e) => e.type === 'flipped' && e.card === 'mirror-ward'));

  const bad = { deck: (R.decks!['blaze-pack'] as Record<string, string[]>).deck.slice(0, 14).concat('ashen-warhound'), extra: [] };
  assert.match(deckErrors(R, bad).join(), /"ashen-warhound" \(fusion\) cannot go in the deck section/);
});

test('tidewardens: resource deck, life cards with surge, evolution stacks, pitching', () => {
  const W = loadRef('tidewardens');
  let g = createMatch(W, deckOpts(W, ['reef-school', 'kelp-bastion'], 4));
  assert.deepEqual([g.s.zones['p0:life'].length, g.s.zones['p0:pool'].length, g.s.zones['p0:tides'].length], [4, 1, 7]);
  g = act(g, 'p0', 'pitch', place(g, 'p0', 'ebb', 'hand'));
  assert.equal(g.s.players[0].vars.float, 2);

  const pup = place(g, 'p0', 'reef-pup', 'board', { dmg: 1 });
  const hunter = place(g, 'p0', 'reef-hunter', 'hand');
  g.s.players[0].vars.float = 9;
  g = act(g, 'p0', 'evolve', hunter, { $t: [pup] });
  const top = g.s.zones['p0:board'].find((id) => g.s.objects[id].card === 'reef-hunter')!;
  const under = g.s.zones['p0:under'][0];
  assert.equal(g.s.objects[under].rel!.under, top);
  assert.equal(g.s.objects[top].vars.dmg, 1, 'evolution keeps damage');
  assert.equal(view(g, 'p1', top).stats!.power, 4, '+1 per card under it');

  const life = g.s.zones['p1:life'];
  const wall = place(g, 'p1', 'coral-wall', 'life');
  life.splice(life.indexOf(wall), 1);
  life.unshift(wall);
  const rider = place(g, 'p0', 'current-rider', 'board', { ready: 1 });
  const lifeBefore = life.length;
  g = act(g, 'p0', 'attack', rider, { $t: ['p1'] });
  assert.equal(g.s.zones['p1:life'].length, lifeBefore - 1, 'damage breaks a life card instead');
  assert.ok(g.s.events.some((e) => e.type === 'replaced' && e.event === 'damage'));
  assert.ok(cardsIn(g, 'p1:board').includes('coral-wall'), 'surge put the broken card onto the board');

  g = act(g, 'p0', 'cast', place(g, 'p0', 'tidal-strike', 'hand'), { $t: [top] });
  assert.equal(g.s.zones['p0:under'].length, 0, 'cards under a destroyed unit go to the grave');
  assert.ok(['reef-pup', 'reef-hunter'].every((c) => cardsIn(g, 'p0:grave').includes(c)));
});

test('ember-council: shared market, dice, alternating council with initiative, secret weighted vote, elimination', () => {
  const C = loadRef('ember-council');
  let g = createMatch(C, deckOpts(C, ['starter', 'starter', 'starter'], 5));
  assert.deepEqual([g.s.zones['shared:market'].length, g.s.zones['shared:supply'].length], [4, 14]);
  const face = g.s.objects[g.s.zones['shared:table'][0]].vars.face;
  assert.ok(face >= 1 && face <= 6);

  g.s.players[0].vars.gold = 10;
  const card = g.s.zones['shared:market'][0];
  const cardId = g.s.objects[card].card;
  g = act(g, 'p0', 'buy', card);
  assert.equal(g.s.zones['p0:grave'].map((id) => g.s.objects[id]).find((o) => o.card === cardId)!.owner, 'p0');
  assert.equal(g.s.zones['shared:market'].length, 4, 'market refilled');

  g.s.vars.vote = 1;
  g.s.players[0].vars.influence = 1;
  g = act(g, 'p0', 'pass');
  assert.deepEqual([observe(g, 'p0').phase, g.s.priority], ['council', 'p0'], 'initiative holder acts first');
  g = act(g, 'p0', 'lobby');
  assert.equal(g.s.priority, 'p1');
  g = act(g, 'p1', 'pass'); // first to pass claims initiative
  g = act(act(g, 'p2', 'pass'), 'p0', 'pass');
  assert.deepEqual(g.s.players.map((p) => p.vars.initiative), [0, 1, 0]);
  const pd = g.s.pending!;
  assert.deepEqual(observe(g, 'p1').pending, { player: 'p0', prompt: pd.prompt });
  g = submitDecision(g, 'p0', pd.id, ['p2']);
  g = submitDecision(g, 'p1', g.s.pending!.id, ['p2']);
  g = submitDecision(g, 'p2', g.s.pending!.id, ['p0']);
  assert.deepEqual(g.s.events.filter((e) => e.type === 'censured').map((e) => [e.player, e.votes]), [['p2', 3]], 'p0 lobbied: 2 + 1');
  assert.equal(g.s.players[2].vars.life, 8);

  assert.equal(g.s.priority, 'p1');
  g.s.players[2].vars.life = 2;
  g.s.players[1].vars.power = 3;
  g = act(g, 'p1', 'strike', null, { $t: ['p2'] });
  assert.ok(g.s.players[2].lost && !g.s.result, 'directed elimination; the game goes on');
  g = act(g, 'p1', 'pass');
  while (g.s.pending || observe(g, g.s.priority!).phase === 'council') {
    g = g.s.pending ? submitDecision(g, g.s.pending.player, g.s.pending.id, [g.s.pending.options[0]]) : act(g, g.s.priority!, 'pass');
  }
  assert.deepEqual([g.s.turn.n, g.s.priority], [3, 'p0'], 'turn order skips the eliminated player');
});
