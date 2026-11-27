// Generation Wars (default module; mechanics reference: Riftbound). Checks that the shipped files match the Workshop
// blueprint, the decks are legal, and AI games show the conquest rules: runes (2 per turn, 3 for the second player's
// first turn, power by recycling), group moves, showdown fights, conquer/hold scoring and the 8-point win.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, listActions, observe, replay, submitDecision } from '#engine';
import { makeAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'generation-wars');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('generation-wars');
const ids = Object.keys(mod.decks!);

test('generation-wars: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test('generation-wars: decks are legal; off-generation cards are rejected', () => {
  assert.equal(ids.length, 5);
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
  const bad = structuredClone(mod.decks![ids[0]]) as any; // The Establishment (Silent + Boomers)
  bad.deck[0] = 'hypebeast';
  assert.ok(deckErrors(mod, bad).some((e) => /leader's two colors/.test(e)));
});

function game(seed: number, a: string, b: string, onStep?: (g: Match) => void): Match {
  return playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![a]), structuredClone(mod.decks![b])], seed }), [makeAgent('heuristic', seed), makeAgent('heuristic', seed + 7)], onStep);
}

test('generation-wars: AI games are won on points through conquest, with runes paid as energy and power', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const runesT1: number[] = [];
    const g = game(100 + i, ids[i], ids[(i + 1) % ids.length], (m) => {
      const s = m.s, ph = m.m.rules.phases[s.turn.phase]?.id;
      if (s.turn.n <= 2 && ph === 'main' && runesT1.length < s.turn.n) runesT1.push((s.zones[`${s.players[s.turn.active].id}:resources`] ?? []).length);
    });
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result && g.s.result.winners?.length === 1, `game ${i} has a winner`);
    const w = g.s.players.find((p) => p.id === g.s.result!.winners![0])!;
    assert.ok((w.vars.score as number) >= 8 || g.s.turn.n >= 60, `won on points (${w.vars.score})`);
    assert.deepEqual(runesT1.slice(0, 2), [2, 3], 'first player channels 2 runes, the second player 3');
    for (const e of g.s.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['conquer', 'hold', 'showdownFight', 'marched', 'paid', 'peek']) assert.ok(seen[t] > 0, `${t} happens`);
  assert.ok((seen.moved ?? 0) > 0);
});

// ---- set-piece boards for the fidelity pass
type Pick = (pd: { prompt: string; options: string[]; player: string; min: number; max: number }, g: Match) => string[] | undefined;
function drive(g: Match, stop: (g: Match) => boolean, pick: Pick = () => undefined, max = 300): Match {
  for (let i = 0; i < max && !stop(g) && !g.s.result; i++) {
    const pd = g.s.pending;
    if (pd) { g = submitDecision(g, pd.player, pd.id, pick(pd as any, g) ?? pd.options.slice(0, pd.min)); continue; }
    g = commitAction(g, g.s.priority ?? g.s.players[g.s.turn.active].id, { action: 'pass' });
  }
  return g;
}
const phase = (g: Match) => g.m.rules.phases[g.s.turn.phase]?.id;
const objs = (g: Match, p: string, z: string, card?: string) => (g.s.zones[`${p}:${z}`] ?? []).filter((o) => !card || g.s.objects[o].card === card);
function board(setup: unknown[]): Match {
  for (let seed = 1; seed < 40; seed++) {
    let g = createMatch(mod, { decks: [structuredClone(mod.decks![ids[0]]), structuredClone(mod.decks![ids[1]])], seed, scenario: { setup: setup as any } });
    g = drive(g, (m) => !m.s.pending && phase(m) === 'main' && m.s.priority === 'p0');
    if (g.s.turn.active === 0) return g;
  }
  throw new Error('no seed with p0 first');
}
const runes = (n: number) => Array.from({ length: n }, () => ['create', 'rune-of-equity', 'p0', 'resources']);

test('generation-wars: play units to a battlefield you control; hidden cards; losing control trashes them', () => {
  let g = board([...runes(4), ['set', 'game', 'c1', 1], ['create', 'grunge-bassist', 'p0', 'lane1'], ['create', 'lawn-inspector', 'p0', 'hand'], ['create', 'basement-hacker', 'p0', 'hand']]);
  let where: string[] = [];
  g = commitAction(g, 'p0', { action: 'summon', source: objs(g, 'p0', 'hand', 'lawn-inspector')[0] });
  g = drive(g, (m) => !m.s.pending && !m.s.stack.length, (pd) => { if (pd.prompt.startsWith('Play it where')) { where = pd.options; return ['North Front']; } return undefined; });
  assert.deepEqual([...where].sort(), ['Base', 'North Front'], 'only base and the battlefield I control');
  assert.equal(objs(g, 'p0', 'lane1', 'lawn-inspector').length, 1);
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  g = commitAction(g, 'p0', { action: 'hide', source: objs(g, 'p0', 'hand', 'basement-hacker')[0] });
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'hidden'));
  assert.equal(objs(g, 'p0', 'hid1').length, 1, 'hidden at North Front');
  assert.ok(!listActions(g, 'p0').some((a) => a.action === 'playHidden'), 'not playable the turn it was hidden');
  g = drive(g, (m) => m.s.turn.n >= 3 && phase(m) === 'main' && m.s.priority === 'p0' && !m.s.pending);
  assert.ok(listActions(g, 'p0').some((a) => a.action === 'playHidden'), 'playable from the next turn');
  g = drive(g, (m) => m.s.turn.active === 1 && !m.s.pending && m.s.priority === 'p1');
  const g2 = { ...g, s: structuredClone(g.s) } as Match;
  g2.s.vars.c1 = 2; // the opponent takes North Front
  const after = drive(commitAction(g2, 'p1', { action: 'pass' }), (m) => m.s.events.some((e) => e.type === 'hiddenLost'), undefined, 20);
  assert.ok(after.s.events.some((e) => e.type === 'hiddenLost'), 'losing the battlefield trashes the hidden card');
});

test('generation-wars: focus goes to the mover; damage is assigned with Tank first; stunned units deal none', () => {
  let g = board([...runes(3), ['create', 'grunge-bassist', 'p0', 'base'], ['create', 'skate-park-nihilist', 'p0', 'base'],
    ['create', 'iron-lung-veteran', 'p1', 'lane1'], ['create', 'iron-lung-veteran', 'p1', 'lane1'], ['create', 'victory-gardener', 'p1', 'lane1', { as: '$vg' }], ['set', 'game', 'c1', 2], ['set', '$vg', 'st_stun', 1]]);
  const bass = objs(g, 'p0', 'base', 'grunge-bassist')[0];
  g = commitAction(g, 'p0', { action: 'march', source: bass });
  let assignOpts: string[] = [];
  const pick: Pick = (pd, m) => {
    if (pd.prompt === 'Move to where?') return ['North Front'];
    if (pd.prompt.startsWith('Move any other')) return pd.options;
    if (pd.prompt.startsWith('Assign lethal') && pd.player === 'p0' && !assignOpts.length) { assignOpts = pd.options.map((o) => m.s.objects[o].card); return undefined; }
    return undefined;
  };
  g = drive(g, (m) => !m.s.pending && m.s.windows.length > 0 && observe(m, 'p0').phase === 'respond' && m.s.priority !== null, pick);
  const focus = g.s.priority;
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'showdownFight') && !m.s.windows.length, pick);
  const fight = g.s.events.find((e) => e.type === 'showdownFight')!;
  assert.deepEqual(assignOpts, ['iron-lung-veteran', 'iron-lung-veteran'], 'only Tanks may receive lethal damage first (not the Gardener)');
  assert.equal(fight.b, (3 + 1) * 2, 'defenders: two Iron Lungs (3 + Shield 1); the stunned Gardener adds nothing');
  assert.equal(focus, 'p0', 'the mover has focus first');
});

test('generation-wars: burn out gives the opponent a point and reshuffles the trash', () => {
  let g = board([['each', ['cards', 'p0', 'deck'], '$c', [['move', '$c', 'grave']]]]);
  g = drive(g, (m) => m.s.events.some((e) => e.type === 'burnOut'), undefined, 200);
  const e = g.s.events.find((x) => x.type === 'burnOut')!;
  assert.equal(e.p, 'p0');
  assert.ok((g.s.players[1].vars.score as number) >= 1, 'the opponent scored');
  assert.ok(g.s.zones['p0:deck'].length > 0, 'the trash became the new deck');
});

test('generation-wars: deflect makes opponents pay power to target the unit', () => {
  let g = board([...runes(3), ['create', 'neighborhood-watch-captain', 'p1', 'lane2'], ['create', 'back-in-my-day', 'p0', 'hand']]);
  const before = objs(g, 'p0', 'resources').length;
  let asked = false;
  g = commitAction(g, 'p0', { action: 'quick', source: objs(g, 'p0', 'hand', 'back-in-my-day')[0] });
  g = drive(g, (m) => !m.s.pending && !m.s.stack.length && m.s.events.some((e) => e.type === 'resolve' || e.type === 'warded'), (pd) => {
    if (pd.prompt.startsWith('That target has deflect')) { asked = true; return ['Pay the deflect cost']; }
    return undefined;
  });
  assert.ok(asked, 'the deflect cost was asked for');
  assert.equal(objs(g, 'p0', 'resources').length, before - 1, 'one rune recycled to pay it');
});
