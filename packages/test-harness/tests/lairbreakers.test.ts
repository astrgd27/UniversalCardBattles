// Lairbreakers (default module; mechanics reference: Android: Netrunner). Checks the shipped files match the Workshop
// blueprint, decks keep to their identity's side, AI games run cleanly, and set pieces for the asymmetric rules: the
// Dark Lord goes first with 3 actions and a mandatory draw, the party has 4; no ending a turn with actions left; ICE
// install tax and hidden installs; advancing and scoring schemes; runs (rez on approach, break or fire subroutines,
// jack out, access, steal, trash); wounds and flatline; tags; memory; the Dark Lord losing on an empty deck.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, listActions, observe, replay, submitDecision } from '#engine';
import { makeAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'lairbreakers');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('lairbreakers');
const lords = ['the-lich-lair', 'dragons-hoard', 'goblin-warren', 'infernal-court'], parties = ['grimhold-company', 'shadow-guild', 'arcane-circle'];

test('lairbreakers: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test("lairbreakers: decks are legal; a party card in a Dark Lord's deck is rejected", () => {
  assert.equal(Object.keys(mod.decks!).length, 7);
  for (const [id, d] of Object.entries(mod.decks!)) assert.deepEqual(deckErrors(mod, d), [], id);
  const bad = structuredClone(mod.decks!['the-lich-lair']) as any;
  bad.deck[0] = 'treasure-hunt';
  assert.ok(deckErrors(mod, bad).some((e) => /identity's side/.test(e)));
});

test('lairbreakers: AI games between every Dark Lord and party run cleanly to a result; replays match', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const g = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![lords[i]]), structuredClone(mod.decks![parties[i % 3]])], seed: 70 + i }), [makeAgent('heuristic', i), makeAgent('heuristic', i + 2)]);
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result?.winners?.length === 1, `game ${i}: ${g.s.result?.reason}`);
    for (const e of g.s.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['installed', 'run', 'accessed', 'advanced']) assert.ok(seen[t] > 0, `${t} happens`);
});

// ---- set pieces (p0 is the Lich, p1 Grimhold Company)
type Pick = (pd: { prompt: string; options: string[]; player: string; min: number; max: number }, g: Match) => string[] | undefined;
const phase = (g: Match) => g.m.rules.phases[g.s.turn.phase]?.id;
/** Answer decisions; when it is someone's move, pass, or take 1 gold if all actions must be spent first. */
function drive(g: Match, stop: (g: Match) => boolean, pick: Pick = () => undefined, max = 400): Match {
  for (let i = 0; i < max && !stop(g) && !g.s.result; i++) {
    const pd = g.s.pending;
    if (pd) { g = submitDecision(g, pd.player, pd.id, pick(pd as any, g) ?? pd.options.slice(0, pd.min)); continue; }
    const p = g.s.priority ?? g.s.players[g.s.turn.active].id;
    const acts = listActions(g, p);
    g = commitAction(g, p, acts.some((a) => a.action === 'pass') ? { action: 'pass' } : { action: 'takeOne' });
  }
  return g;
}
const objs = (g: Match, p: string, z: string, card?: string) => (g.s.zones[`${p}:${z}`] ?? []).filter((o) => !card || g.s.objects[o].card === card);
const one = (g: Match, p: string, z: string, card: string) => { const o = objs(g, p, z, card)[0]; assert.ok(o, `${card} in ${p}:${z}`); return o; };
const acts = (g: Match, p: string, action: string) => listActions(g, p).filter((a) => a.action === action);
function board(setup: unknown[], who: 'p0' | 'p1' = 'p0'): Match {
  let g = createMatch(mod, { decks: [structuredClone(mod.decks!['the-lich-lair']), structuredClone(mod.decks!['grimhold-company'])], seed: 5, scenario: { setup: setup as any } });
  return drive(g, (m) => !m.s.pending && phase(m) === 'main' && m.s.priority === who && m.s.turn.active === (who === 'p0' ? 0 : 1));
}
const answers = (map: Record<string, string | ((pd: any, g: Match) => string[])>): Pick => (pd, g) => {
  for (const [k, v] of Object.entries(map)) if (pd.prompt.startsWith(k)) return typeof v === 'function' ? v(pd, g) : [v];
  return undefined;
};
const settle = (g: Match, pick: Pick) => drive(g, (m) => !m.s.pending && m.s.windows.length === 0, pick, 60);

test('lairbreakers: the Dark Lord goes first with 3 actions and draws each turn; the party has 4; actions must be spent', () => {
  let g = board([]);
  assert.equal(g.s.turn.active, 0);
  assert.equal(g.s.players[0].vars.ap, 3);
  assert.equal(g.s.players[0].vars['mana:c'], 5);
  assert.equal(objs(g, 'p0', 'hand').length, 6, '5 + the mandatory draw');
  assert.ok(!acts(g, 'p0', 'pass').length, "can't end the turn with actions left");
  for (let i = 0; i < 3; i++) g = commitAction(g, 'p0', { action: 'takeOne' });
  assert.equal(g.s.players[0].vars['mana:c'], 8);
  g = drive(g, (m) => m.s.turn.active === 1 && phase(m) === 'main' && !m.s.pending);
  assert.equal(g.s.players[1].vars.ap, 4);
  assert.equal(objs(g, 'p1', 'hand').length, 5, 'the party does not draw automatically');
  assert.ok(!acts(g, 'p1', 'installC').length && !acts(g, 'p0', 'run').length);
});

test('lairbreakers: installing ICE costs 1 per guardian already there; installs are hidden from the party', () => {
  let g = board([['create', 'wall-of-thorns', 'p0', 'ice_hq', { faceDown: true }], ['create', 'bone-wall', 'p0', 'hand'], ['create', 'raise-the-dead-army', 'p0', 'hand']]);
  g = commitAction(g, 'p0', { action: 'installC', source: one(g, 'p0', 'hand', 'bone-wall') });
  g = settle(g, answers({ 'Install it in front': 'Throne Room' }));
  assert.equal(g.s.players[0].vars['mana:c'], 4, 'paid 1 (one guardian already there)');
  assert.equal(objs(g, 'p0', 'ice_hq').length, 2);
  g = commitAction(g, 'p0', { action: 'installC', source: one(g, 'p0', 'hand', 'raise-the-dead-army') });
  g = settle(g, answers({ 'Install it in which remote': 'Dungeon I' }));
  const view = observe(g, 'p1') as any;
  const seen = view.zones['p0:srv1'].cards[0];
  assert.ok(seen.faceDown && !seen.card, 'the party sees only a face-down card');
});

test('lairbreakers: schemes are advanced (1 action + 1 gold each) and scored when they reach their requirement', () => {
  let g = board([['create', 'raise-the-dead-army', 'p0', 'srv1', { faceDown: true, as: '$a' }], ['set', '$a', 'adv', 4]]);
  const ag = one(g, 'p0', 'srv1', 'raise-the-dead-army');
  assert.equal(acts(g, 'p0', 'scoreAg').length, 0, '4 of 5');
  g = commitAction(g, 'p0', { action: 'advance', source: ag });
  assert.equal(g.s.players[0].vars['mana:c'], 4);
  g = commitAction(g, 'p0', { action: 'scoreAg', source: ag });
  assert.equal(g.s.players[0].vars.score, 3);
  assert.equal(objs(g, 'p0', 'scored').length, 1);
});

test('lairbreakers: runs — rez on approach, let subroutines fire (end the run) or break them, then access and steal', () => {
  const setup = (extra: unknown[]) => [['create', 'wall-of-thorns', 'p0', 'ice_r1', { faceDown: true }], ['create', 'raise-the-dead-army', 'p0', 'srv1', { faceDown: true }], ...extra];
  // 1. the Lord leaves it unrezzed: the party walks past and steals the scheme
  let g = board(setup([]), 'p1');
  g = commitAction(g, 'p1', { action: 'run' });
  g = settle(g, answers({ 'Run which server': 'Dungeon I', 'Raiders approach': 'Leave it' }));
  assert.equal(g.s.players[1].vars.score, 3, 'stole 3 points');
  assert.equal(objs(g, 'p1', 'scored').length, 1);
  // 2. rezzed Wall of Thorns, no breaker: the subroutine ends the run
  let h = board(setup([]), 'p1');
  h = commitAction(h, 'p1', { action: 'run' });
  h = settle(h, answers({ 'Run which server': 'Dungeon I', 'Raiders approach': 'Rez it', Encounter: 'Let it fire' }));
  assert.ok(h.s.events.some((e) => e.type === 'runEnded'));
  assert.equal(h.s.players[1].vars.score, 0);
  // 3. with Battleaxe Berserker (strength 2 vs 3: +1 for 1, break 1 subroutine for 1) the run gets through
  let k = board(setup([['create', 'battleaxe-berserker', 'p1', 'support']]), 'p1');
  const gold = k.s.players[1].vars['mana:c'] as number;
  k = commitAction(k, 'p1', { action: 'run' });
  k = settle(k, answers({ 'Run which server': 'Dungeon I', 'Raiders approach': 'Rez it', Encounter: (pd, m) => pd.options.filter((o: string) => m.s.objects[o]?.card === 'battleaxe-berserker') }));
  assert.ok(k.s.events.some((e) => e.type === 'broken'));
  assert.equal(gold - (k.s.players[1].vars['mana:c'] as number), 2);
  assert.equal(k.s.players[1].vars.score, 3);
});

test('lairbreakers: access — HQ at random, the top of the Scheme Vault, trash costs, and traps that wound', () => {
  let g = board([['create', 'tithe-collector', 'p0', 'srv2', { faceDown: true }], ['create', 'haunted-ossuary', 'p0', 'srv3', { faceDown: true }]], 'p1');
  g = commitAction(g, 'p1', { action: 'run' });
  g = settle(g, answers({ 'Run which server': 'Dungeon II', 'Pay its trash cost': 'Trash it' }));
  assert.equal(objs(g, 'p0', 'srv2').length, 0, 'trashed for 3 gold');
  const hand0 = objs(g, 'p1', 'hand').length;
  g = commitAction(g, 'p1', { action: 'run' });
  g = settle(g, answers({ 'Run which server': 'Dungeon III' }));
  assert.ok(g.s.events.some((e) => e.type === 'wounded'), 'the Ossuary bites');
  assert.equal(hand0 - objs(g, 'p1', 'hand').length, 2);
  g = commitAction(g, 'p1', { action: 'run' });
  g = settle(g, answers({ 'Run which server': 'Scheme Vault' }));
  const acc = g.s.events.filter((e) => e.type === 'accessed').at(-1)!;
  assert.equal(acc.o !== undefined, true);
});

test('lairbreakers: wounds flatline a party with too few cards; tags let the Lord trash allies; the party removes tags', () => {
  let g = board([['create', 'wailing-banshee', 'p0', 'ice_hq'], ['each', ['cards', 'p1', 'hand'], '$c', [['move', '$c', 'grave']]], ['create', 'war-cry', 'p1', 'hand']], 'p1');
  g = commitAction(g, 'p1', { action: 'run' });
  g = settle(g, answers({ 'Run which server': 'Throne Room', Encounter: 'Let it fire' }));
  assert.deepEqual(g.s.result?.winners, ['p0'], '2 wounds with 1 card in hand: flatlined');
  let t = board([['create', 'goblin-lookout', 'p0', 'ice_hq'], ['create', 'tavern-contacts', 'p1', 'support']], 'p1');
  t = commitAction(t, 'p1', { action: 'run' });
  t = settle(t, answers({ 'Run which server': 'Throne Room', Encounter: 'Let it fire' }));
  assert.equal(t.s.players[1].vars.tags, 1);
  assert.ok(acts(t, 'p1', 'untag').length, 'the party can pay to remove it');
  t = drive(t, (m) => m.s.turn.active === 0 && phase(m) === 'main' && !m.s.pending);
  assert.ok(acts(t, 'p0', 'trashTagged').length, 'the Lord can trash a tagged party\'s ally');
  t = commitAction(t, 'p0', { action: 'trashTagged', source: one(t, 'p1', 'support', 'tavern-contacts') });
  assert.equal(objs(t, 'p1', 'support', 'tavern-contacts').length, 0);
});

test('lairbreakers: programs need memory (4, more with gear); an empty Scheme Vault loses the Lord the game', () => {
  let g = board([...['hireling-sellsword', 'street-rat-picklock', 'monster-hunter', 'battleaxe-berserker'].map((c) => ['create', c, 'p1', 'support']),
    ['create', 'wandering-bard', 'p1', 'hand'], ['create', 'bag-of-holding', 'p1', 'hand'], ['set', 'p1', 'mana:c', 20]], 'p1');
  const bard = one(g, 'p1', 'hand', 'wandering-bard');
  assert.ok(!acts(g, 'p1', 'deploy').some((a) => a.source === bard), 'no memory left');
  g = commitAction(g, 'p1', { action: 'deploy', source: one(g, 'p1', 'hand', 'bag-of-holding') });
  assert.ok(acts(g, 'p1', 'deploy').some((a) => a.source === bard), 'the Bag of Holding adds 1');
  let d = board([['each', ['cards', 'p0', 'deck'], '$c', [['move', '$c', 'grave']]]], 'p1');
  d = drive(d, (m) => !!m.s.result, undefined, 60);
  assert.deepEqual(d.s.result?.winners, ['p1']);
});
