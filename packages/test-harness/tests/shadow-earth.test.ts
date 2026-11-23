// Shadow Earth 2.0 (official module): the Agenda row, missions, Bloodshed, Master Plans, Responses and the 7 Dominance win.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventsFor, invalidate, listActions, observe, submitDecision } from '#engine';
import { deckOpts, loadRef } from '#harness';
import { place } from './helpers.ts';

const S = loadRef('shadow-earth');
const DK = { psy: 'psylist-starter', pren: 'prendick-starter', dawn: 'dawnstar-starter', illu: 'illuminati-starter', child: 'children-starter' };
type F = keyof typeof DK;
function start(a: F, b: F, seed = 1): Match {
  let g = createMatch(S, deckOpts(S, [DK[a], DK[b]], seed));
  while (g.s.turn.active !== 0) g = createMatch(S, deckOpts(S, [DK[a], DK[b]], ++seed));
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, ['Keep']);
  return g;
}
const vars = (g: Match, p: string) => g.s.players[+p.slice(1)].vars;
const setVars = (g: Match, p: string, v: Record<string, number>) => { Object.assign(vars(g, p), v); invalidate(g.s); };
/** Puts a card into play as an old (non-new) operative or permanent. */
const put = (g: Match, p: string, card: string, zone = 'ops', v: Record<string, number> = {}) => place(g, p, card, zone, { ex: 0, newT: -1, ...v });
const act = (g: Match, p: string, action: string, source: string | null, targets: Record<string, string[]> = {}) => commitAction(g, p, { action, source, targets });
type Answer = (pd: NonNullable<Match['s']['pending']>) => string[] | undefined;
function settle(g: Match, answer: Answer = () => undefined): Match {
  for (let i = 0; i < 200 && !g.s.result && (g.s.pending || g.s.windows.length); i++) {
    const pd = g.s.pending;
    if (pd) { g = submitDecision(g, pd.player, pd.id, answer(pd) ?? pd.options.slice(0, Math.max(pd.min, 1)).slice(0, pd.max || 1)); continue; }
    g = act(g, g.s.priority!, 'pass', null);
  }
  return g;
}
const row = (g: Match) => g.s.zones['shared:agendas'];
const card = (g: Match, id: string) => S.card.get(g.s.objects[id].card) as any;
/** An Agenda in the row with the given attribute (1 F, 2 T, 3 W), rigged to need `need` progress and resist `res`. */
function rig(g: Match, attr: number, need = 3, res = 2): string {
  const a = row(g)[0];
  const o = g.s.objects[a];
  o.card = (S.cards.find((c: any) => c.type === 'agenda' && c.mattr === attr && c.need === need) as any).id;
  invalidate(g.s);
  assert.equal(card(g, a).res, need, 'Agenda Resistance equals its progress threshold');
  void res;
  return a;
}

test('shadow-earth 2.0: setup (Headquarters, Master Plan, three Conspiracy Agendas, Influence 2 on turn one, legal starters)', () => {
  const g = start('psy', 'pren');
  for (const d of Object.values(DK)) assert.deepEqual(deckErrors(S, S.decks![d]), [], d);
  assert.equal(g.s.zones['p0:hq'].length, 1);
  assert.equal(g.s.zones['p0:plan'].length, 1);
  assert.equal(row(g).length, 3);
  assert.equal(g.s.zones['shared:agdeck'].length, 9);
  assert.deepEqual([vars(g, 'p0').cap, vars(g, 'p0').inf], [2, 2]);
  assert.equal(observe(g, 'p0').phase, 'main');
});

test('shadow-earth 2.0: a mission on an Agenda adds progress (decisive +2); at its threshold the Agenda scores, and a new one is revealed', () => {
  let g = start('pren', 'psy');
  const a = rig(g, 1, 3);
  const r1 = put(g, 'p0', 'razorback-hybrid'); // Force 3
  const r2 = put(g, 'p0', 'razorback-hybrid');
  g = settle(act(g, 'p0', 'mission', null, { $t: [a], $team: [r1] }));
  assert.equal(vars(g, 'p0').dom ?? 0, 0, 'Force 3 vs Resistance 3: a tie fails');
  g = settle(act(g, 'p0', 'mission', null, { $t: [a], $team: [r2, put(g, 'p0', 'security-hound-9')] }));
  assert.equal(g.s.objects[a].vars.pr0, 1, 'Force 3 + 2 = 5 beats 3 (not by 3): +1 progress');
  const big = [put(g, 'p0', 'alpha-predator'), put(g, 'p0', 'alpha-predator'), put(g, 'p0', 'razorback-hybrid')];
  const dom0 = vars(g, 'p0').dom ?? 0;
  g = settle(act(g, 'p0', 'mission', null, { $t: [a], $team: big }));
  assert.ok(!g.s.objects[a], 'Force 10 vs 3 is decisive (+2): 3 progress scores the Agenda');
  assert.equal(vars(g, 'p0').dom, dom0 + 2);
  assert.equal(row(g).length, 3, 'a new Agenda is revealed');
  assert.equal(g.s.zones['p0:scored'].length, 1);
  assert.equal(g.s.objects[g.s.zones['p0:plan'][0]].vars.prog, 1, 'scoring an Agenda advances your Master Plan');
});

test('shadow-earth 2.0: Bloodshed - each side deals its highest Force to an opposing participant; Wetwork targets defend themselves', () => {
  let g = start('pren', 'psy');
  const beast = put(g, 'p0', 'alpha-predator'); // 4/1/1, Health 4; Bloodshed +1
  const viewer = put(g, 'p1', 'remote-viewer', 'ops', { ex: 1 }); // 0/2/2, Health 3, exhausted
  g = settle(act(g, 'p0', 'mission', null, { $t: [viewer], $team: [beast] }));
  assert.ok(!g.s.objects[viewer], 'an exhausted Wetwork target still defends itself, and Bloodshed (4 + 1) kills it');
  assert.ok(g.s.events.some((e: any) => e.type === 'bloodshed'));
});

test('shadow-earth 2.0: Master Plans advance by missions and by scoring Agendas, and enact at 4 for 3 Dominance', () => {
  let g = start('child', 'psy');
  const pl = g.s.zones['p0:plan'][0];
  g.s.objects[pl].vars.prog = 3;
  invalidate(g.s);
  const c1 = put(g, 'p0', 'cell-organizer'); // 1/2/3
  g = settle(act(g, 'p0', 'mission', null, { $t: [pl], $team: [c1] }), (pd) => (/defenders/.test(pd.prompt) ? [] : undefined));
  assert.equal(g.s.objects[pl].vars.done, 1, 'Will 3 beats Resistance 2: the 4th progress enacts The Great Arrival');
  assert.equal(vars(g, 'p0').dom, 3);
  assert.ok(g.s.zones['p0:ops'].some((id) => g.s.objects[id].card === 'high-one-manifestation'));
});

test('shadow-earth 2.0: 7 Dominance wins at once; the player behind gains 1 temporary Influence each turn', () => {
  let g = start('pren', 'psy');
  setVars(g, 'p1', { dom: 2 });
  g = act(g, 'p0', 'pass', null);
  g = settle(g);
  assert.ok((vars(g, 'p0').tmp ?? 0) === 0);
  g = act(g, 'p1', 'pass', null); g = settle(g);
  assert.equal(vars(g, 'p0').tmp, 1, 'behind on Dominance: +1 temporary Influence');
  setVars(g, 'p0', { dom: 6 });
  const a = rig(g, 1, 2);
  g.s.objects[a].vars.pr0 = 1;
  const r = put(g, 'p0', 'razorback-hybrid');
  g = settle(act(g, 'p0', 'mission', null, { $t: [a], $team: [r] }));
  assert.deepEqual(g.s.result?.winners, ['p0']);
});

test('shadow-earth 2.0: Responses in the mission window, defender first; private looks stay private', () => {
  let g = start('psy', 'pren');
  const a = rig(g, 2, 3);
  const v = put(g, 'p0', 'precog-analyst'); // Tradecraft 3
  const tip = place(g, 'p0', 'remote-viewer', 'hand');
  g = settle(act(g, 'p0', 'deploy', tip));
  const mine = eventsFor(g, 'p0').find((e: any) => e.type === 'peeked') as any;
  const theirs = eventsFor(g, 'p1').find((e: any) => e.type === 'peeked') as any;
  assert.ok(mine?.card);
  assert.equal(theirs?.card, undefined);
  g = act(g, 'p0', 'mission', null, { $t: [a], $team: [v] });
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, []);
  assert.equal(g.s.priority, 'p1', 'the defender has the first Response priority');
  void listActions;
});
