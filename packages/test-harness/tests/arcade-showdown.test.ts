// Arcade Showdown (default module; mechanics reference: UniVersus). Checks the shipped files match the Workshop blueprint,
// decks follow their fighter's two styles, AI games end in knockouts, and set pieces for the signature rules: skill checks
// with progressive difficulty and foundations, a failed check ending the turn, the card pool sorting at the end of the
// turn, zone blocks (full and half), Breaker, the enhance step (EX, Stun, fighter abilities), Flash, Combo and momentum.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, listActions, replay, submitDecision } from '#engine';
import { makeAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'arcade-showdown');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('arcade-showdown');
const ids = Object.keys(mod.decks!);

test('arcade-showdown: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test("arcade-showdown: decks are legal; cards outside the fighter's styles are rejected", () => {
  assert.equal(ids.length, 4);
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
  const bad = structuredClone(mod.decks!['ronins-path']) as any;
  bad.deck[0] = 'spirit-palm';
  assert.ok(deckErrors(mod, bad).some((e) => /leader's two colors/.test(e)));
});

test('arcade-showdown: fighters set vitality and hand size; AI games end in knockouts; replays match', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    let start: number[] = [];
    const g = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![ids[i]]), structuredClone(mod.decks![ids[(i + 1) % 4]])], seed: 40 + i }), [makeAgent('heuristic', i), makeAgent('heuristic', i + 3)],
      (m) => { if (!start.length && m.s.vars.started === 1) start = m.s.players.map((p) => p.vars.life as number); });
    assert.deepEqual(invariantErrors(g), []);
    const vit = (p: number) => (mod.card.get(g.s.objects[g.s.zones[`p${p}:leader`][0]].card) as any).vitality;
    assert.deepEqual(start, [vit(0), vit(1)], 'life starts at the fighter\'s vitality');
    assert.ok(g.s.result?.winners?.length === 1, `game ${i}: ${g.s.result?.reason}`);
    const loser = g.s.players.find((p) => p.id !== g.s.result!.winners![0])!;
    assert.ok((loser.vars.life as number) <= 0 || g.s.events.some((e) => e.type === 'emptyDeck'), 'knocked out');
    for (const e of g.s.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['checked', 'checkFail', 'attack', 'hit', 'momentum']) assert.ok(seen[t] > 0, `${t} happens`);
});

// ---- set pieces
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
const one = (g: Match, p: string, z: string, card: string) => { const o = objs(g, p, z, card)[0]; assert.ok(o, `${card} in ${p}:${z}`); return o; };
/** Replace a player's deck with these cards, top first (then 20 filler cards underneath). */
const stack = (p: string, top: string[]) => [['each', ['cards', p, 'deck'], '$c', [['move', '$c', 'grave']]], ...[...top, ...Array(20).fill('low-sweep')].map((c) => ['create', c, p, 'deck'])];
const hand = (p: string, list: string[]) => list.map((c) => ['create', c, p, 'hand']);
function board(setup: unknown[], turn = 1): Match {
  for (let seed = 1; seed < 40; seed++) {
    let g = createMatch(mod, { decks: [structuredClone(mod.decks!['ronins-path']), structuredClone(mod.decks!['holy-knuckles'])], seed, scenario: { setup: setup as any } });
    g = drive(g, (m) => !m.s.pending && phase(m) === 'combat' && m.s.priority === 'p0');
    if (g.s.turn.active !== 0 || g.s.turn.n !== 1) continue;
    if (turn > 1) g = drive(g, (m) => m.s.turn.n === turn && !m.s.pending && phase(m) === 'combat' && m.s.priority === 'p0');
    return g;
  }
  throw new Error('no seed with p0 first');
}
const play = (g: Match, card: string) => commitAction(g, 'p0', { action: 'play', source: one(g, 'p0', 'hand', card) });

test('arcade-showdown: checks get harder with every card in the pool; foundations cover the gap; a failed check ends the turn', () => {
  let g = board([...stack('p0', ['ember-jab', 'molten-hammer', 'inferno-finisher']), ...hand('p0', ['code-of-honor', 'ancestral-blade', 'disciplined-footwork'])]);
  g = play(g, 'code-of-honor'); // need 1 + 0, check 5
  assert.equal(objs(g, 'p0', 'pool', 'code-of-honor').length, 1);
  const checked = () => g.s.events.filter((e) => e.type === 'checked');
  assert.deepEqual([checked().at(-1)!.v, checked().at(-1)!.need, checked().at(-1)!.ok], [5, 1, 1]);
  g = play(g, 'ancestral-blade'); // need 2 + 1 = 3, check 2: commit Code of Honor
  g = drive(g, (m) => !m.s.pending, (pd) => (pd.prompt.startsWith('Check failed') ? ['Commit foundations to pass'] : undefined), 10);
  assert.equal(objs(g, 'p0', 'pool', 'ancestral-blade').length, 1, 'passed by committing a foundation');
  assert.equal(g.s.objects[one(g, 'p0', 'pool', 'code-of-honor')].vars.ex, 1);
  const inGrave = objs(g, 'p0', 'grave', 'disciplined-footwork').length;
  g = play(g, 'disciplined-footwork'); // need 2 + 2 = 4, check 1, only 1 ready foundation: fails
  g = drive(g, (m) => !m.s.pending, undefined, 10);
  assert.ok(g.s.events.some((e) => e.type === 'checkFail'));
  assert.equal(objs(g, 'p0', 'grave', 'disciplined-footwork').length, inGrave + 1, 'the failed card is discarded');
  g = drive(g, (m) => m.s.turn.active === 1, undefined, 10);
  assert.equal(objs(g, 'p0', 'pool').length, 0, 'the pool is sorted at the end of the turn');
  assert.equal(objs(g, 'p0', 'support').length, 2, 'foundations are built onto the stage');
});

test('arcade-showdown: blocks — same zone stops it, a neighbouring zone halves it; Breaker makes the next check harder', () => {
  const setup = (blocker: string) => [...stack('p0', ['ember-jab', 'ember-jab', 'ember-jab', 'low-sweep']), ...hand('p0', ['crescent-cut']), ...stack('p1', ['ember-jab', 'ember-jab']), ...hand('p1', [blocker])];
  const blockWith = (card: string): Pick => (pd, m) => (pd.prompt.startsWith('Block with') ? pd.options.filter((o) => m.s.objects[o].card === card).slice(0, 1) : undefined);
  let g = board(setup('stubborn-jab'), 3);
  const life0 = g.s.players[1].vars.life as number;
  g = play(g, 'crescent-cut'); // Mid, speed 4, damage 4
  g = drive(g, (m) => !m.s.windows.length && !m.s.pending, blockWith('stubborn-jab'), 40);
  assert.ok(g.s.events.some((e) => e.type === 'blocked' && e.full), 'Mid blocks Mid');
  assert.equal(g.s.players[1].vars.life, life0, 'no damage');
  assert.equal(g.s.players[0].vars.pen, 2, 'Breaker 2');
  let h = board(setup('low-sweep'), 3);
  const life1 = h.s.players[1].vars.life as number;
  h = play(h, 'crescent-cut');
  h = drive(h, (m) => !m.s.windows.length && !m.s.pending, blockWith('low-sweep'), 40);
  assert.ok(h.s.events.some((e) => e.type === 'blocked' && !e.full));
  assert.equal(life1 - (h.s.players[1].vars.life as number), 2, 'half of 4');
});

test('arcade-showdown: the enhance step — EX spends momentum for speed, Stun commits foundations, the fighter helps', () => {
  let g = board([...stack('p0', ['ember-jab', 'ember-jab', 'ember-jab']), ...hand('p0', ['rage-rush', 'ember-jab']), ['create', 'blazing-uppercut', 'p0', 'momentum'],
    ...stack('p1', ['ember-jab']), ['create', 'iron-will', 'p1', 'support']], 3);
  g = play(g, 'rage-rush');
  g = drive(g, (m) => !m.s.pending && m.s.windows.length > 0 && m.s.priority === 'p0' && listActions(m, 'p0').some((a) => a.action === 'exEnh'), undefined, 20);
  const rush = one(g, 'p0', 'pool', 'rage-rush');
  assert.ok(listActions(g, 'p0').some((a) => a.action.startsWith('actQ') && a.source === g.s.zones['p0:leader'][0]), 'Kaito can enhance');
  g = commitAction(g, 'p0', { action: 'exEnh', source: rush });
  assert.equal(objs(g, 'p0', 'momentum').length, 0, 'momentum spent');
  assert.ok(g.s.events.some((e) => e.type === 'enhanced' && e.what === 'speed'));
  g = drive(g, (m) => !m.s.windows.length && !m.s.pending, undefined, 40);
  assert.equal(objs(g, 'p0', 'pool', 'rage-rush').length, 1);
  let s = board([...stack('p0', ['ember-jab', 'ember-jab']), ...hand('p0', ['spirit-palm']), ...stack('p1', ['ember-jab']), ['create', 'iron-will', 'p1', 'support']], 3);
  s = play(s, 'spirit-palm');
  s = drive(s, (m) => !m.s.pending && m.s.windows.length > 0 && m.s.priority === 'p0' && listActions(m, 'p0').some((a) => a.action === 'stunEnh'), undefined, 20);
  s = commitAction(s, 'p0', { action: 'stunEnh', source: one(s, 'p0', 'pool', 'spirit-palm') });
  s = drive(s, (m) => !m.s.pending, undefined, 5);
  assert.equal(s.s.objects[one(s, 'p1', 'support', 'iron-will')].vars.ex, 1, 'Stun 1: the rival commits a foundation');
});

test('arcade-showdown: Flash skips the enhance step; Combo needs the right card before it; hits become momentum', () => {
  let g = board([...stack('p0', ['ember-jab', 'ember-jab', 'ember-jab']), ...hand('p0', ['iaido-draw', 'final-oath-strike', 'crescent-cut']), ...stack('p1', ['ember-jab'])], 3);
  const can = (m: Match, card: string) => listActions(m, 'p0').some((a) => a.action === 'play' && m.s.objects[a.source!].card === card);
  assert.ok(!can(g, 'final-oath-strike'), 'Combo (Slash): nothing in the pool yet');
  g = play(g, 'iaido-draw');
  let sawRespond = false;
  g = drive(g, (m) => !m.s.windows.length && !m.s.pending, () => undefined, 40);
  for (const e of g.s.events) if (e.type === 'step' && e.id === 'respond') sawRespond = true;
  assert.ok(!sawRespond, 'Flash: no enhance step');
  assert.ok(can(g, 'final-oath-strike'), 'Combo (Slash): right after a Slash');
  g = play(g, 'crescent-cut');
  g = drive(g, (m) => !m.s.windows.length && !m.s.pending, undefined, 40);
  const hits = g.s.events.filter((e) => e.type === 'hit').length;
  g = drive(g, (m) => m.s.turn.active === 1, undefined, 20);
  assert.equal(objs(g, 'p0', 'momentum').length, hits, 'attacks that dealt damage became momentum');
});
