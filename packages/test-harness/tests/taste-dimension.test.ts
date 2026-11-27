// Taste Dimension (default module; mechanics reference: Yu-Gi-Oh!). Set-piece boards check the positional rules (columns,
// shared extra zones, link arrows) and every summon method; AI games check everything is used and replays match.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, listActions, observe, replay, submitDecision } from '#engine';
import { makeAgent, randomAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'taste-dimension');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('taste-dimension');
const ids = Object.keys(mod.decks!);

test('taste-dimension: shipped files are the compiled blueprint; decks are legal', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  assert.ok(build(structuredClone(bp)).mod, build(structuredClone(bp)).problems.map((p) => p.text).join('; '));
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
});

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
/** p0 to move in Main 1 with a set-piece board (cards created in given zones/slots). */
function board(setup: unknown[]): Match {
  for (let seed = 1; seed < 40; seed++) {
    let g = createMatch(mod, { decks: [structuredClone(mod.decks![ids[0]]), structuredClone(mod.decks![ids[1]])], seed, scenario: { setup: setup as any } });
    g = drive(g, (m) => !m.s.pending && phase(m) === 'main' && m.s.priority === 'p0');
    if (g.s.turn.active === 0) return g;
  }
  throw new Error('no seed with p0 first');
}
const mk = (card: string, p: string, zone: string, slot?: string) => ['create', card, p, zone, slot ? { slot } : {}];

test('taste-dimension: extra zones are shared and link arrows decide where links go', () => {
  let g = board([mk('dumpling-golem', 'p0', 'field', 'm1'), mk('bao-bun-sentry', 'p0', 'field', 'm2'), mk('har-gow-scout', 'p0', 'field', 'm4'),
    mk('dumpling-golem', 'p1', 'emz', 'R'), mk('dim-sum-cart', 'p0', 'extra'), mk('tea-house-matron', 'p0', 'extra')]);
  const cart = objs(g, 'p0', 'extra', 'dim-sum-cart')[0];
  g = commitAction(g, 'p0', { action: 'linkSum', source: cart });
  let zoneOpts: string[] = [];
  g = drive(g, (m) => !m.s.pending && objs(m, 'p0', 'emz').length > 0, (pd) => {
    if (pd.prompt.startsWith('Choose the link')) return pd.options.filter((o) => ['dumpling-golem', 'bao-bun-sentry'].includes(g.s.objects[o]?.card));
    if (pd.prompt === 'Which zone?') { zoneOpts = pd.options; return ['R']; }
    return undefined;
  });
  assert.ok(!zoneOpts.includes('L'), "the opponent's right extra zone is my left: L is never offered");
  assert.equal(g.s.objects[objs(g, 'p0', 'emz')[0]].slot, 'R');
  // a second link must go where my link points (Cart in my right extra zone points BL -> m3, BR -> m5)
  const mat = objs(g, 'p0', 'field', 'har-gow-scout')[0];
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  g = commitAction(g, 'p0', { action: 'linkSum', source: objs(g, 'p0', 'extra', 'tea-house-matron')[0] });
  zoneOpts = [];
  g = drive(g, (m) => zoneOpts.length > 0 || (!m.s.pending && objs(m, 'p0', 'extra', 'tea-house-matron').length === 0), (pd) => {
    if (pd.prompt.startsWith('Choose the link')) return [mat];
    if (pd.prompt === 'Which zone?') { zoneOpts = [...pd.options].sort(); return [pd.options[0]]; }
    return undefined;
  });
  assert.deepEqual(zoneOpts, ['m3', 'm5'], 'only the zones the Cart points to (BL, BR)');
  g = drive(g, (m) => !m.s.pending);
  const matron = objs(g, 'p0', 'field', 'tea-house-matron')[0];
  const cartObj = objs(g, 'p0', 'emz', 'dim-sum-cart')[0];
  assert.ok(matron, 'the second link is on the board');
  assert.ok(cartObj);
  const view = observe(g, 'p1');
  const stat = (o: string) => view.zones[g.s.objects[o].zone].cards!.find((c) => c.id === o)!.stats!.atk;
  assert.equal(stat(matron), 800 + 300, "the Cart's arrow points at the Matron: +300 ATK");
  assert.equal(stat(cartObj), 1800, 'the Cart itself is not pointed at (the Matron has only a B arrow): no bonus');
});

test('taste-dimension: synchro levels add up exactly; xyz materials attach and detach', () => {
  let g = board([mk('chili-garnish', 'p0', 'field', 'm1'), mk('dumpling-golem', 'p0', 'field', 'm2'), mk('har-gow-scout', 'p0', 'field', 'm3'), mk('bao-bun-sentry', 'p0', 'field', 'm4'),
    mk('inferno-noodle-hydra', 'p0', 'extra'), mk('dumpling-emperor', 'p0', 'extra'), mk('ramen-ronin', 'p1', 'field', 'm1')]);
  const hydra = objs(g, 'p0', 'extra', 'inferno-noodle-hydra')[0];
  assert.ok(listActions(g, 'p0').some((a) => a.action === 'synchro' && a.source === hydra), 'Garnish (2) + a level 4 makes 6');
  let offered: string[][] = [];
  g = commitAction(g, 'p0', { action: 'synchro', source: hydra });
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'placed'), (pd) => {
    if (pd.prompt.startsWith('Choose a non-Tuner')) { offered.push(pd.options.map((o) => g.s.objects[o].card).sort()); return [pd.options.find((o) => g.s.objects[o].card === 'dumpling-golem')!]; }
    return undefined;
  });
  assert.deepEqual(offered[0], ['bao-bun-sentry', 'dumpling-golem'], 'the level 3 is not offered: 2 + 3 cannot make 6');
  assert.equal(objs(g, 'p0', 'grave').length, 2, 'tuner and non-tuner went to the scrap bin');
  // xyz: two level 4s -> rank 4 emperor; here only one level 4 remains, so add one
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  assert.ok(!listActions(g, 'p0').some((a) => a.action === 'xyz'), 'one level 4 is not enough');
});

test('taste-dimension: xyz detach, pendulum between the scales, ritual', () => {
  let g = board([mk('dumpling-golem', 'p0', 'field', 'm1'), mk('bao-bun-sentry', 'p0', 'field', 'm2'), mk('dumpling-emperor', 'p0', 'extra'), mk('udon-brute', 'p1', 'field', 'm3'),
    mk('saffron-scale-keeper', 'p0', 'support', 's1'), mk('cardamom-conjurer', 'p0', 'support', 's5'), mk('turmeric-tamer', 'p0', 'hand'), mk('cupcake-knight', 'p0', 'hand'), mk('fondant-fiend', 'p0', 'hand'),
    mk('wedding-cake-empress', 'p0', 'hand'), mk('grand-banquet-ceremony', 'p0', 'hand')]);
  g = commitAction(g, 'p0', { action: 'xyz', source: objs(g, 'p0', 'extra', 'dumpling-emperor')[0] });
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'placed'), (pd) => (pd.prompt.startsWith('Choose the materials') ? pd.options : undefined));
  const emp = [...objs(g, 'p0', 'field', 'dumpling-emperor'), ...objs(g, 'p0', 'emz', 'dumpling-emperor')][0];
  assert.ok(emp, 'the emperor is summoned');
  assert.equal(objs(g, 'p0', 'overlay').length, 2, 'both materials sit under it');
  assert.ok(objs(g, 'p0', 'overlay').every((o) => g.s.objects[o].rel?.bearer === emp));
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  g = commitAction(g, 'p0', { action: 'act#0', source: emp });
  g = drive(g, (m) => !m.s.pending && !m.s.stack?.length && m.s.priority === 'p0');
  assert.equal(objs(g, 'p0', 'overlay').length, 1, 'detached one');
  assert.equal(objs(g, 'p1', 'field', 'udon-brute').length, 0, 'and destroyed the enemy dish');
  // pendulum: scales 1 and 8 -> levels 2..7 from hand (turmeric 4, cupcake 3, fondant 6; the empress (8, ritual) is not offered)
  const pend = listActions(g, 'p0').find((a) => a.action === 'pendulum');
  assert.ok(pend, 'pendulum summon is available');
  let offered: string[] = [];
  g = commitAction(g, 'p0', { action: 'pendulum' });
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'pendulum'), (pd) => { if (pd.prompt.startsWith('Pendulum')) { offered = pd.options.map((o) => g.s.objects[o].card).sort(); return [pd.options.find((o) => g.s.objects[o].card === 'turmeric-tamer')!]; } return undefined; });
  for (const c of ['cupcake-knight', 'fondant-fiend', 'turmeric-tamer']) assert.ok(offered.includes(c), c);
  assert.ok(!offered.includes('wedding-cake-empress') && !offered.includes('cardamom-conjurer'), 'level 8 and ritual dishes are not offered');
  assert.ok(offered.every((c) => { const l = (mod.card.get(c) as any).level; return l > 1 && l < 8; }), 'every offer is strictly between the scales');
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  assert.equal(objs(g, 'p0', 'field', 'turmeric-tamer').length, 1);
  // ritual: tribute cupcake (3) + fondant (6) >= 8 for the empress
  g = commitAction(g, 'p0', { action: 'cast', source: objs(g, 'p0', 'hand', 'grand-banquet-ceremony')[0] });
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'ritual'), (pd) => (pd.prompt.startsWith('Ritual summon') ? [pd.options.find((o) => g.s.objects[o].card === 'wedding-cake-empress')!] : undefined));
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  assert.equal(objs(g, 'p0', 'field', 'wedding-cake-empress').length, 1, 'the ritual dish is on the board');
});

test('taste-dimension: fusion from hand and board with named materials', () => {
  let g = board([mk('cupcake-knight', 'p0', 'field', 'm2'), mk('macaron-mage', 'p0', 'hand'), mk('master-stock', 'p0', 'hand'), mk('mille-feuille-paladin', 'p0', 'extra')]);
  g = commitAction(g, 'p0', { action: 'cast', source: objs(g, 'p0', 'hand', 'master-stock')[0] });
  g = drive(g, (m) => !m.s.pending && m.s.events.some((e) => e.type === 'fusion'), (pd) => (pd.prompt.startsWith('Fusion summon') ? [pd.options.find((o) => g.s.objects[o].card === 'mille-feuille-paladin')!] : undefined));
  g = drive(g, (m) => !m.s.pending && m.s.priority === 'p0');
  assert.equal([...objs(g, 'p0', 'field', 'mille-feuille-paladin'), ...objs(g, 'p0', 'emz', 'mille-feuille-paladin')].length, 1, 'fused');
  assert.ok(objs(g, 'p0', 'grave', 'cupcake-knight').length === 1 && objs(g, 'p0', 'grave', 'macaron-mage').length === 1, 'both named materials used');
});

test('taste-dimension: AI games use every system and replay identically', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const g = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![ids[i % 4]]), structuredClone(mod.decks![ids[(i + 2) % 4]])], seed: 700 + i }),
      i % 2 ? [randomAgent(700 + i), randomAgent(701 + i)] : [makeAgent('heuristic', 700 + i), makeAgent('heuristic', 707 + i)]);
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result, `game ${i} ends`);
    for (const e of g.s.events) { const k = e.type === 'action' ? `action:${String(e.action).split('#')[0]}` : e.type; seen[k] = (seen[k] ?? 0) + 1; }
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['action:summon', 'action:setUnit', 'action:setTrap', 'action:attack', 'placed']) assert.ok(seen[t] > 0, `${t} happens`);
});
