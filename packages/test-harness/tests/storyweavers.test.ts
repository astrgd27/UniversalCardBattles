// Storyweavers (default module; mechanics reference: Lorcana). Checks the shipped files match the Workshop blueprint,
// decks are legal (two colors at most), AI games are won by questing to 20 lore, and set pieces for the signature rules:
// challenging only exhausted characters, Elusive/Watchful, Steadfast, Shift, rhymes (Songbird, Round), Headstrong and
// Wanderlust, places (move cost, lore at the start of the turn, "here" bonuses, being challenged), Fleeting, Bookmark,
// Late Bloomer, saved Wonder and losing by ending a turn with an empty deck.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, listActions, replay, submitDecision } from '#engine';
import { makeAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'storyweavers');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('storyweavers');
const ids = Object.keys(mod.decks!);

test('storyweavers: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test('storyweavers: decks are legal; a third color is rejected', () => {
  assert.equal(ids.length, 4);
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
  const bad = structuredClone(mod.decks!['rhymes-and-shields']) as any;
  (Array.isArray(bad) ? bad : bad.deck)[0] = 'anansi-web-of-stories';
  assert.ok(deckErrors(mod, bad).some((e) => /at most 2 colors/.test(e)));
});

test('storyweavers: AI games are won by questing to 20 lore; replays match', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const g = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![ids[i]]), structuredClone(mod.decks![ids[(i + 1) % 4]])], seed: 300 + i }), [makeAgent('heuristic', i), makeAgent('heuristic', i + 9)]);
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result?.winners?.length === 1, `game ${i} has a winner (${g.s.result?.reason})`);
    const w = g.s.players.find((p) => p.id === g.s.result!.winners![0])!;
    assert.ok((w.vars.score as number) >= 20, `won on lore (${w.vars.score})`);
    for (const e of g.s.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['quest', 'attack', 'destroyed']) assert.ok(seen[t] > 0, `${t} happens`);
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
const ink = (p: string, n: number) => Array.from({ length: n }, () => ['create', 'goldilocks-porridge-critic', p, 'resources']);
function board(setup: unknown[]): Match {
  for (let seed = 1; seed < 40; seed++) {
    let g = createMatch(mod, { decks: [structuredClone(mod.decks![ids[0]]), structuredClone(mod.decks![ids[1]])], seed, scenario: { setup: setup as any } });
    g = drive(g, (m) => !m.s.pending && phase(m) === 'main' && m.s.priority === 'p0');
    if (g.s.turn.active === 0 && g.s.turn.n === 1) return g;
  }
  throw new Error('no seed with p0 first');
}
const acts = (g: Match, action: string, src?: string) => listActions(g, 'p0').filter((a) => a.action === action && (!src || a.source === src));
const opts = (g: Match, action: string, src: string) => acts(g, action, src)[0]?.slots[0]?.options ?? [];
const answer = (g: Match, pick: Pick) => drive(g, (m) => !m.s.pending, pick, 20);

test('storyweavers: challenges hit only exhausted characters; Elusive needs Elusive or Watchful; Steadfast must be challenged first', () => {
  let g = board([['create', 'jack-giant-killer', 'p0', 'field', { as: '$j' }], ['create', 'sir-gawain-green-knights-challenger', 'p0', 'field'],
    ['create', 'goldilocks-porridge-critic', 'p1', 'field', { as: '$a' }], ['set', '$a', 'ex', 1], ['create', 'puss-in-boots-booted-schemer', 'p1', 'field', { as: '$b' }], ['set', '$b', 'ex', 1],
    ['create', 'clay-golem-city-guardian', 'p1', 'field']]);
  const jack = one(g, 'p0', 'field', 'jack-giant-killer'), gawain = one(g, 'p0', 'field', 'sir-gawain-green-knights-challenger');
  const cardsOf = (l: string[]) => l.map((o) => g.s.objects[o].card).sort();
  assert.deepEqual(cardsOf(opts(g, 'attack', jack)), ['goldilocks-porridge-critic'], 'ready Golem and Elusive Puss are out of reach');
  assert.deepEqual(cardsOf(opts(g, 'attack', gawain)), ['goldilocks-porridge-critic', 'puss-in-boots-booted-schemer'], 'Watchful reaches Elusive');
  let g2 = board([['create', 'jack-giant-killer', 'p0', 'field'], ['create', 'goldilocks-porridge-critic', 'p1', 'field', { as: '$a' }], ['set', '$a', 'ex', 1],
    ['create', 'tin-soldier-steadfast-sentry', 'p1', 'field', { as: '$t' }], ['set', '$t', 'ex', 1]]);
  g = g2;
  assert.deepEqual(cardsOf(opts(g2, 'attack', one(g2, 'p0', 'field', 'jack-giant-killer'))), ['tin-soldier-steadfast-sentry'], 'Steadfast first');
  g2 = commitAction(g2, 'p0', { action: 'attack', source: one(g2, 'p0', 'field', 'jack-giant-killer'), targets: { $t: [one(g2, 'p1', 'field', 'tin-soldier-steadfast-sentry')] } });
  g2 = drive(g2, (m) => !m.s.windows.length && !m.s.pending, undefined, 30);
  assert.equal(objs(g2, 'p1', 'grave', 'tin-soldier-steadfast-sentry').length, 1, 'Brave +3 while challenging: 2 + 3 >= willpower 4');
  assert.equal(g2.s.objects[one(g2, 'p0', 'field', 'jack-giant-killer')].vars.dmg, 1, 'damage goes both ways');
});

test('storyweavers: Shift keeps damage and dry state and tucks the old card under; when it leaves, the stack goes to the discard', () => {
  let g = board([...ink('p0', 2), ['create', 'little-mermaid-seas-daughter', 'p0', 'field', { as: '$m' }], ['set', '$m', 'dmg', 1], ['create', 'little-mermaid-voice-for-legs', 'p0', 'hand']]);
  const base = one(g, 'p0', 'field', 'little-mermaid-seas-daughter');
  g = commitAction(g, 'p0', { action: 'shift', source: one(g, 'p0', 'hand', 'little-mermaid-voice-for-legs'), targets: { $b: [base] } });
  g = answer(g, () => undefined);
  const top = one(g, 'p0', 'field', 'little-mermaid-voice-for-legs');
  assert.equal(g.s.objects[top].vars.dmg, 1, 'damage carried over');
  assert.equal(objs(g, 'p0', 'under', 'little-mermaid-seas-daughter').length, 1, 'the old card is under it');
  assert.ok(acts(g, 'quest', top).length, 'can quest right away: the old card was dry');
  assert.ok(g.s.events.some((e) => e.type === 'shifted'));
  const g2 = { ...g, s: structuredClone(g.s) } as Match;
  g2.s.objects[top].vars.dmg = 9;
  const g3 = commitAction(g2, 'p0', { action: 'quest', source: objs(g2, 'p0', 'field', 'goldilocks-porridge-critic')[0] ?? top });
  assert.equal(objs(g3, 'p0', 'under').length, 0, 'under cards follow it to the discard');
  assert.equal(objs(g3, 'p0', 'grave', 'little-mermaid-seas-daughter').length, 1);
});

test('storyweavers: rhymes are recited by exhausting a character; Songbird counts higher; Round needs costs adding up', () => {
  let g = board([['create', 'mother-goose-keeper-of-rhymes', 'p0', 'field'], ['create', 'london-bridge', 'p0', 'hand'], ['create', 'clay-golem-city-guardian', 'p1', 'field'],
    ['create', 'goldilocks-porridge-critic', 'p0', 'field'], ['create', 'cinderella-hearth-sweeper', 'p0', 'field'], ['create', 'ring-around-the-rosie', 'p0', 'hand']]);
  const goose = one(g, 'p0', 'field', 'mother-goose-keeper-of-rhymes');
  const bridge = one(g, 'p0', 'hand', 'london-bridge');
  assert.deepEqual(opts(g, 'sing', bridge).map((o) => g.s.objects[o].card).sort(), ['cinderella-hearth-sweeper', 'mother-goose-keeper-of-rhymes'], 'Songbird 5 and Songbird 4 recite a cost-4 rhyme; Goldilocks (cost 1) cannot');
  g = commitAction(g, 'p0', { action: 'sing', source: bridge, targets: { $sg: [goose] } });
  g = answer(g, () => undefined);
  assert.equal(g.s.objects[goose].vars.ex, 1);
  assert.equal(g.s.objects[one(g, 'p1', 'field', 'clay-golem-city-guardian')].vars.dmg, 2, '3 damage, Sturdy +1');
  const rosie = one(g, 'p0', 'hand', 'ring-around-the-rosie');
  assert.equal(acts(g, 'singTogether', rosie).length, 0, 'Goldilocks (1) + Cinderella (2) = 3 < Round 6 (Mother Goose already sang)');
  const g2 = board([['create', 'goldilocks-porridge-critic', 'p0', 'field'], ['create', 'cinderella-hearth-sweeper', 'p0', 'field'], ['create', 'fairy-godmother-midnight-tailor', 'p0', 'field'],
    ['create', 'ring-around-the-rosie', 'p0', 'hand']]);
  let g3 = commitAction(g2, 'p0', { action: 'singTogether', source: one(g2, 'p0', 'hand', 'ring-around-the-rosie') });
  g3 = answer(g3, (pd) => (pd.prompt.startsWith('Sing together') ? [pd.options[0]] : undefined));
  assert.equal(g3.s.players[0].vars.score, 2, 'the Round resolved');
  assert.ok(objs(g3, 'p0', 'field').every((o) => g3.s.objects[o].vars.ex === 1), 'all three sang (1 + 2 + 4 >= 6)');
});

test("storyweavers: Headstrong must challenge and can't quest; Wanderlust must quest and can't challenge", () => {
  let g = board([['create', 'hare-overconfident-sprinter', 'p0', 'field'], ['create', 'goldilocks-porridge-critic', 'p1', 'field', { as: '$a' }], ['set', '$a', 'ex', 1]]);
  const hare = one(g, 'p0', 'field', 'hare-overconfident-sprinter');
  assert.ok(!listActions(g, 'p0').some((a) => a.action === 'pass'), "can't end the turn yet");
  assert.throws(() => commitAction(g, 'p0', { action: 'pass' }));
  assert.equal(acts(g, 'quest', hare).length, 0);
  g = commitAction(g, 'p0', { action: 'attack', source: hare, targets: { $t: [one(g, 'p1', 'field', 'goldilocks-porridge-critic')] } });
  g = drive(g, (m) => !m.s.windows.length && !m.s.pending, undefined, 30);
  assert.ok(listActions(g, 'p0').some((a) => a.action === 'pass'));
  let t = board([['create', 'tortoise-slow-and-steady', 'p0', 'field'], ['create', 'goldilocks-porridge-critic', 'p1', 'field', { as: '$a' }], ['set', '$a', 'ex', 1]]);
  const tort = one(t, 'p0', 'field', 'tortoise-slow-and-steady');
  assert.equal(acts(t, 'attack', tort).length, 0);
  assert.ok(!listActions(t, 'p0').some((a) => a.action === 'pass'));
  t = commitAction(t, 'p0', { action: 'quest', source: tort });
  assert.ok(listActions(t, 'p0').some((a) => a.action === 'pass'));
});

test('storyweavers: places — move for the move cost, "here" bonuses, lore at the start of your turn, and they can be challenged', () => {
  let g = board([...ink('p0', 1), ['create', 'treasure-cave', 'p0', 'locations'], ['create', 'wishing-fish-golden-flounder', 'p0', 'field'],
    ['create', 'sherwood-glade', 'p1', 'locations'], ['create', 'paul-bunyan-lumber-giant', 'p0', 'field']]);
  const fish = one(g, 'p0', 'field', 'wishing-fish-golden-flounder');
  const cave = one(g, 'p0', 'locations', 'treasure-cave');
  const before = g.s.players[0].vars.score as number;
  assert.ok(before >= 1, 'the cave scored at the start of the turn');
  g = commitAction(g, 'p0', { action: 'moveLoc', source: fish, targets: { $lc: [cave] } });
  assert.equal(acts(g, 'moveLoc', fish).length, 0, 'no Wonder left (move cost 1)');
  g = commitAction(g, 'p0', { action: 'quest', source: fish });
  assert.equal((g.s.players[0].vars.score as number) - before, 2, 'lore 1 + 1 while at the Treasure Cave');
  const paul = one(g, 'p0', 'field', 'paul-bunyan-lumber-giant');
  const glade = one(g, 'p1', 'locations', 'sherwood-glade');
  assert.ok(opts(g, 'attack', paul).includes(glade), 'ready places can be challenged');
  g = commitAction(g, 'p0', { action: 'attack', source: paul, targets: { $t: [glade] } });
  g = drive(g, (m) => !m.s.windows.length && !m.s.pending, undefined, 30);
  assert.equal(objs(g, 'p1', 'locations').length, 0, '5 + Brave 2 >= willpower 6');
  assert.equal(g.s.objects[paul].vars.dmg, 0, 'places deal no damage back');
});

test('storyweavers: Fleeting, Bookmark, Late Bloomer, saved Wonder', () => {
  let g = board([...ink('p0', 3), ['create', 'will-o-the-wisp-marsh-lantern', 'p1', 'field'], ['create', 'rock-a-bye-baby', 'p0', 'hand'], ['create', 'genie-of-the-lamp-bound-wish-granter', 'p0', 'field'],
    ['create', 'cinderella-hearth-sweeper', 'p1', 'hand'], ['create', 'goldilocks-porridge-critic', 'p1', 'resources']]);
  g = commitAction(g, 'p0', { action: 'cast', source: one(g, 'p0', 'hand', 'rock-a-bye-baby') });
  g = answer(g, () => undefined);
  assert.ok(g.s.events.some((e) => e.type === 'vanished'), 'Fleeting: banished when chosen');
  assert.equal(objs(g, 'p1', 'field', 'will-o-the-wisp-marsh-lantern').length, 0);
  // Bookmark 2 with the 1 Wonder left is not affordable; give one more and boost
  assert.equal(acts(g, 'boostUnder').length, 0);
  const g1 = { ...g, s: structuredClone(g.s) } as Match;
  g1.s.players[0].vars['mana:c'] = 2;
  const genie = one(g1, 'p0', 'field', 'genie-of-the-lamp-bound-wish-granter');
  let g2 = commitAction(g1, 'p0', { action: 'boostUnder', source: genie });
  assert.equal(objs(g2, 'p0', 'under').length, 1);
  const s0 = g2.s.players[0].vars.score as number;
  g2 = commitAction(g2, 'p0', { action: 'quest', source: genie });
  assert.equal((g2.s.players[0].vars.score as number) - s0, 4, 'lore 2 + 2 with a card under it');
  // p1's first turn: Late Bloomer costs 1 with 1 Wonder
  g2 = drive(g2, (m) => m.s.turn.active === 1 && phase(m) === 'main' && !m.s.pending && m.s.priority === 'p1');
  assert.ok(listActions(g2, 'p1').some((a) => a.action === 'summon' && g2.s.objects[a.source!].card === 'cinderella-hearth-sweeper'), 'Late Bloomer: 2 - 1 = 1');
  // saved Wonder
  let w = board([...ink('p0', 1), ['create', 'row-row-row-your-boat', 'p0', 'hand'], ['create', 'little-mermaid-seas-daughter', 'p0', 'hand']]);
  w = commitAction(w, 'p0', { action: 'cast', source: one(w, 'p0', 'hand', 'row-row-row-your-boat') });
  w = answer(w, () => undefined);
  assert.equal(w.s.players[0].vars.drops, 2);
  assert.equal(acts(w, 'summon').length, 0, 'no Wonder in the well');
  w = commitAction(w, 'p0', { action: 'useDrop' });
  w = commitAction(w, 'p0', { action: 'useDrop' });
  assert.ok(acts(w, 'summon').some((a) => w.s.objects[a.source!].card === 'little-mermaid-seas-daughter'), 'two saved Wonder pay for a cost-2 character');
});

test('storyweavers: ending your turn with an empty deck loses', () => {
  let g = board([['each', ['cards', 'p0', 'deck'], '$c', [['move', '$c', 'grave']]]]);
  g = drive(g, (m) => !!m.s.result, undefined, 20);
  assert.deepEqual(g.s.result?.winners, ['p1']);
  assert.ok(g.s.events.some((e) => e.type === 'emptyDeck'));
});
