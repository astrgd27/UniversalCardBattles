// Shadow Earth (official module): setup, Influence, the mission sequence, defense, Responses, rewards, damage, Agendas and the win.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventsFor, invalidate, listActions, observe, submitDecision } from '#engine';
import { deckOpts, loadRef } from '#harness';
import { place } from './helpers.ts';

const S = loadRef('shadow-earth');
const DK = { psy: 'psylist-starter', pren: 'prendick-starter', dawn: 'dawnstar-starter', illu: 'illuminati-starter', child: 'children-starter' };
type F = keyof typeof DK;
/** p0 to act in Development of its first turn; both players keep their opening hands. */
function start(a: F, b: F, seed = 1): Match {
  let g = createMatch(S, deckOpts(S, [DK[a], DK[b]], seed));
  while (g.s.turn.active !== 0) g = createMatch(S, deckOpts(S, [DK[a], DK[b]], ++seed));
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, ['Keep']);
  return g;
}
const vars = (g: Match, p: string) => g.s.players[+p.slice(1)].vars;
const setVars = (g: Match, p: string, v: Record<string, number>) => { Object.assign(vars(g, p), v); invalidate(g.s); };
const put = (g: Match, p: string, card: string, zone = 'ops', v: Record<string, number> = {}) => place(g, p, card, zone, { ex: 0, ...v });
const act = (g: Match, p: string, action: string, source: string | null, targets: Record<string, string[]> = {}) => commitAction(g, p, { action, source, targets });
type Answer = (pd: NonNullable<Match['s']['pending']>) => string[] | undefined;
/** Passes and answers decisions (default: the minimum) until no window is open and nothing is pending. */
function settle(g: Match, answer: Answer = () => undefined): Match {
  for (let i = 0; i < 200 && !g.s.result && (g.s.pending || g.s.windows.length); i++) {
    const pd = g.s.pending;
    if (pd) { g = submitDecision(g, pd.player, pd.id, answer(pd) ?? pd.options.slice(0, pd.min)); continue; }
    g = act(g, g.s.priority!, 'pass', null);
  }
  return g;
}
const toOps = (g: Match) => (observe(g, 'p0').phase === 'development' ? act(g, 'p0', 'pass', null) : g);

test('shadow-earth: setup (Headquarters, Agenda, faction, Influence capacity 2 after the first Refresh, five cards plus the draw)', () => {
  const g = start('psy', 'pren');
  for (const d of Object.values(DK)) assert.deepEqual(deckErrors(S, S.decks![d]), [], d);
  assert.equal(g.s.zones['p0:hq'].length, 1);
  assert.equal(g.s.zones['p0:agenda'].length, 1);
  assert.deepEqual([vars(g, 'p0').faction, vars(g, 'p1').faction], [1, 2]);
  assert.deepEqual([vars(g, 'p0').cap, vars(g, 'p0').inf], [2, 2]);
  assert.equal(g.s.zones['p0:hand'].length, 6);
  assert.equal(observe(g, 'p0').phase, 'development');
});

test('shadow-earth: a Strike beats an unstaffed Headquarters (Security 2) only with a strictly greater total', () => {
  let g = toOps(start('psy', 'pren'));
  const trooper = put(g, 'p0', 'psychic-shock-trooper');
  const recruit = put(g, 'p0', 'telekinetic-recruit');
  const inf = vars(g, 'p0').inf;
  g = settle(act(g, 'p0', 'strike', null, { $t: ['p1'], $team: [recruit] }));
  assert.equal(vars(g, 'p0').dom ?? 0, 0, 'Force 2 ties Security 2: the mission fails');
  assert.equal(vars(g, 'p0').inf, inf - 1, 'a basic mission costs 1 Influence');
  assert.equal(g.s.objects[recruit].vars.ex, 1, 'attackers are exhausted');
  setVars(g, 'p0', { inf: 2 });
  g = settle(act(g, 'p0', 'strike', null, { $t: ['p1'], $team: [trooper] }));
  assert.equal(vars(g, 'p0').dom, 1, 'Force 3 beats Security 2: +1 Dominance');
  assert.ok(!listActions(g, 'p0').some((t) => t.action === 'strike'), 'two mission attempts per turn');
});

test('shadow-earth: defenders, a tie is a successful defense, and a Strike on an operative deals 3 damage (durability 2 + Force)', () => {
  let g = toOps(start('psy', 'pren'));
  const recruit = put(g, 'p0', 'telekinetic-recruit');
  const trooper = put(g, 'p0', 'psychic-shock-trooper');
  const hound = put(g, 'p1', 'security-hound-9');
  g = settle(act(g, 'p0', 'strike', null, { $t: ['p1'], $team: [recruit] }), (pd) => (pd.player === 'p1' && /defenders/.test(pd.prompt) ? [hound] : undefined));
  assert.equal(vars(g, 'p1').defended, 1, 'Force 2 vs a Force 2 defender: the defense holds');
  assert.equal(g.s.objects[hound].vars.ex, 1, 'defenders are exhausted');
  const lab = put(g, 'p1', 'human-passing-duplicate');
  g = settle(act(g, 'p0', 'strike', null, { $t: [lab], $team: [trooper] }), (pd) => (pd.options.includes('3 damage') ? ['3 damage'] : undefined));
  assert.ok(!g.s.objects[lab], 'Force 1 means durability 3: three damage eliminates it');
  assert.ok(g.s.zones['p1:grave'].some((id) => g.s.objects[id].card === 'human-passing-duplicate'));
});

test('shadow-earth: Responses in the mission window (the defender acts first) change the outcome', () => {
  let g = toOps(start('psy', 'pren'));
  const viewer = put(g, 'p0', 'remote-viewer');
  const tip = place(g, 'p0', 'inside-tip', 'hand');
  setVars(g, 'p0', { inf: 2 });
  g = act(g, 'p0', 'infiltrate', null, { $t: ['p1'], $team: [viewer] });
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, []);
  assert.equal(g.s.priority, 'p1', 'the defender has the first Response priority');
  g = act(g, 'p1', 'pass', null);
  const t = listActions(g, 'p0').find((x) => x.action.startsWith('respond') && x.source === tip)!;
  assert.ok(t, 'Inside Tip is playable in your Infiltrate');
  g = settle(act(g, 'p0', t.action, tip));
  assert.equal(vars(g, 'p0').dom, 1, 'Tradecraft 2 + 2 beats Security 2');
  assert.ok(g.s.zones['p0:grave'].some((id) => g.s.objects[id].card === 'inside-tip'));
});

test('shadow-earth: an Agenda completes once its conditions hold (Immediate effect), and 20 Dominance wins at once', () => {
  let g = start('psy', 'pren');
  for (const c of ['remote-viewer', 'probability-analyst', 'untrained-sensitive']) put(g, 'p0', c);
  setVars(g, 'p0', { stI: 1, sucI: 1 });
  const hand = g.s.zones['p0:hand'].length;
  const t = listActions(g, 'p0').find((x) => x.action.startsWith('complete'));
  assert.ok(t, 'The Listening World can be completed');
  g = settle(act(g, 'p0', t!.action, t!.source));
  assert.equal(g.s.zones['p0:hand'].length, hand + 2, 'Immediate: draw two');
  assert.ok(g.s.events.some((e) => e.type === 'agendaCompleted'));
  g = toOps(g);
  const trooper = put(g, 'p0', 'psychic-shock-trooper');
  setVars(g, 'p0', { dom: 19 });
  g = settle(act(g, 'p0', 'strike', null, { $t: ['p1'], $team: [trooper] }));
  assert.deepEqual(g.s.result?.winners, ['p0']);
});

test('shadow-earth: private looks stay private (a peek is masked for the opponent)', () => {
  let g = start('psy', 'pren');
  const rv = place(g, 'p0', 'remote-viewer', 'hand');
  g = settle(act(g, 'p0', 'deploy', rv));
  const mine = eventsFor(g, 'p0').find((e: any) => e.type === 'peeked') as any;
  const theirs = eventsFor(g, 'p1').find((e: any) => e.type === 'peeked') as any;
  assert.ok(mine?.card, 'the looker sees the card');
  assert.equal(theirs?.card, undefined, 'the opponent does not');
});
