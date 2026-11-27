// Crystal Circuit (default module; mechanics reference: Magic: The Gathering). Checks the shipped files match the Workshop
// blueprint and decks are legal, then plays set-piece boards: mass combat (trample over a deathtouch blocker, double strike,
// flying), attacking an Operator, the legend rule, a counterspell on the stack, the London mulligan; and AI games that
// use every system (crew, station, flashback, cycling, kicker, ward, equip, loyalty, dual crystals).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, listActions, replay, submitDecision } from '#engine';
import { makeAgent, randomAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'crystal-circuit');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('crystal-circuit');
const ids = Object.keys(mod.decks!);

test('crystal-circuit: shipped files are the compiled Workshop blueprint; decks are legal', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  assert.ok(build(structuredClone(bp)).mod);
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
});

type Pick = (pd: { prompt: string; options: string[]; player: string; min: number; max: number }, g: Match) => string[] | undefined;
/** Answers pending decisions with `pick` (default: the minimum), and passes priority until `stop` holds. */
function drive(g: Match, stop: (g: Match) => boolean, pick: Pick = () => undefined, max = 400): Match {
  for (let i = 0; i < max && !stop(g) && !g.s.result; i++) {
    const pd = g.s.pending;
    if (pd) { const sel = pick(pd as any, g) ?? pd.options.slice(0, pd.min); g = submitDecision(g, pd.player, pd.id, sel); continue; }
    const p = g.s.priority ?? g.s.players[g.s.turn.active].id;
    g = commitAction(g, p, { action: 'pass' });
  }
  return g;
}
const keep: Pick = (pd) => (pd.options.includes('Keep') ? ['Keep'] : undefined);
const phase = (g: Match) => g.m.rules.phases[g.s.turn.phase]?.id;
const byCard = (g: Match, p: string, z: string, card: string) => (g.s.zones[`${p}:${z}`] ?? []).filter((o) => g.s.objects[o].card === card);
/** A match where p0 goes first, after mulligans, with a scenario board. */
function board(setup: unknown[]): Match {
  for (let seed = 1; seed < 40; seed++) {
    let g = createMatch(mod, { decks: [structuredClone(mod.decks![ids[0]]), structuredClone(mod.decks![ids[1]])], seed, scenario: { setup: setup as any } });
    g = drive(g, (m) => !m.s.pending && phase(m) === 'main', keep);
    if (g.s.turn.active === 0) return g;
  }
  throw new Error('no seed with p0 first');
}

test('crystal-circuit: mass combat — trample over deathtouch, double strike, flying', () => {
  let g = board([['create', 'furnace-ex', 'p0', 'field'], ['create', 'ember-berserker', 'p0', 'field'], ['create', 'halo-interceptor', 'p0', 'field'],
    ['create', 'rust-leech', 'p1', 'field'], ['create', 'moss-drone', 'p1', 'field']]);
  g = drive(g, (m) => phase(m) === 'combat' && m.s.priority === 'p0' && !m.s.pending);
  const leech = byCard(g, 'p1', 'field', 'rust-leech')[0], furnace = byCard(g, 'p0', 'field', 'furnace-ex')[0];
  g = commitAction(g, 'p0', { action: 'attack' });
  const blockOptions: string[][] = [];
  g = drive(g, (m) => !m.s.windows.length && m.s.events.some((e) => e.type === 'windowClosed'), (pd, m) => {
    if (pd.prompt.startsWith('Attack with')) return pd.options;
    if (pd.prompt.startsWith('Block')) { blockOptions.push(pd.options); const last = [...m.s.events].reverse().find((e) => e.type === 'blockAsk'); return m.s.objects[last!.a]?.card === 'furnace-ex' ? [leech] : []; }
    return undefined;
  });
  assert.equal(blockOptions.length, 2, 'the flyer cannot be blocked (no flying or reach), so only two block prompts');
  assert.equal(g.s.players[1].vars.life, 20 - 3 - 4 - 2, 'trample 3 past the 1-toughness blocker, double strike 2+2, flyer 2');
  assert.ok(!g.s.objects[furnace], 'deathtouch destroyed the trampler');
  assert.ok(!g.s.objects[leech], 'the blocker died');
});

test('crystal-circuit: attacking an Operator removes loyalty and destroys it', () => {
  let g = board([['create', 'slag-golem', 'p0', 'field'], ['create', 'commander-lyra-7', 'p1', 'support', { as: '$w' }], ['set', '$w', 'loy', 4]]);
  g = drive(g, (m) => phase(m) === 'combat' && m.s.priority === 'p0' && !m.s.pending);
  const walker = byCard(g, 'p1', 'support', 'commander-lyra-7')[0];
  g = commitAction(g, 'p0', { action: 'attack' });
  g = drive(g, (m) => !m.s.windows.length && m.s.events.some((e) => e.type === 'windowClosed'), (pd) => (pd.prompt.startsWith('Attack with') ? pd.options : pd.prompt.startsWith('Attack the') ? [walker] : undefined));
  assert.equal(g.s.players[1].vars.life, 20, 'the player took no damage');
  assert.ok(g.s.events.some((e) => e.type === 'walkerHit') && g.s.events.some((e) => e.type === 'walkerDown'));
  assert.equal(byCard(g, 'p1', 'support', 'commander-lyra-7').length, 0);
});

test('crystal-circuit: legend rule and a counterspell on the stack', () => {
  let g = board([['create', 'bastion-r-12', 'p0', 'field'], ['create', 'bastion-r-12', 'p0', 'hand'], ...[1, 2, 3].map(() => ['create', 'quartz-crystal-array', 'p0', 'resources']),
    ['create', 'plasma-bolt', 'p0', 'hand'], ['create', 'ruby-crystal-reactor', 'p0', 'resources'], ['create', 'signal-jammer', 'p1', 'hand'], ['gain', 'p1', 'mana', { azure: 2 }]]);
  const hand = byCard(g, 'p0', 'hand', 'bastion-r-12')[0];
  g = commitAction(g, 'p0', { action: 'summon', source: hand });
  g = drive(g, (m) => !m.s.stack.length && !m.s.pending);
  assert.equal(byCard(g, 'p0', 'field', 'bastion-r-12').length, 1, 'only one Bastion R-12 stays');
  assert.ok(g.s.events.some((e) => e.type === 'legendRule'));
  const bolt = byCard(g, 'p0', 'hand', 'plasma-bolt')[0];
  g = commitAction(g, 'p0', { action: 'quick', source: bolt });
  g = drive(g, (m) => m.s.priority === 'p1' && m.s.stack.length > 0 && !m.s.pending, (pd) => pd.options.includes('p1') ? ['p1'] : undefined);
  const jam = byCard(g, 'p1', 'hand', 'signal-jammer')[0];
  assert.ok(listActions(g, 'p1').some((a) => a.action === 'quick' && a.source === jam), 'the opponent can respond with a Protocol');
  g = commitAction(g, 'p1', { action: 'quick', source: jam });
  g = drive(g, (m) => !m.s.stack.length && !m.s.pending);
  assert.ok(g.s.events.some((e) => e.type === 'countered'), 'the bolt was countered');
  assert.equal(g.s.players[1].vars.life, 20);
});

test('crystal-circuit: London mulligan bottoms one card per mulligan', () => {
  let g = createMatch(mod, { decks: [structuredClone(mod.decks![ids[0]]), structuredClone(mod.decks![ids[1]])], seed: 7 });
  let mulls = 0;
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'phase'), (pd) => {
    if (pd.player === 'p0' && pd.options.includes('Mulligan')) return [mulls++ < 2 ? 'Mulligan' : 'Keep'];
    if (pd.options.includes('Keep')) return ['Keep'];
    return undefined;
  });
  assert.equal(g.s.events.filter((e) => e.type === 'mulligan' && e.p === 'p0').length, 2);
  assert.equal(g.s.zones['p0:hand'].length, 5, 'drew 7 after the second mulligan, then put 2 on the bottom');
});

test('crystal-circuit: AI games use every system and replay identically', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const g = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![ids[i % 4]]), structuredClone(mod.decks![ids[(i + 1) % 4]])], seed: 500 + i }),
      i % 2 ? [randomAgent(500 + i), randomAgent(501 + i)] : [makeAgent('heuristic', 500 + i), makeAgent('heuristic', 507 + i)]);
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result, `game ${i} ends`);
    for (const e of g.s.events) { const k = e.type === 'action' ? `action:${String(e.action).split('#')[0]}` : e.type; seen[k] = (seen[k] ?? 0) + 1; }
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['action:attack', 'blocked', 'action:resource', 'action:deploy', 'action:act', 'action:equip', 'action:crew', 'action:station', 'action:summon', 'action:quick', 'action:cast'])
    assert.ok(seen[t] > 0, `${t} happens`);
});
