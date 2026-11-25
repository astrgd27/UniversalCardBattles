// Game Maker: every starter blueprint compiles to a valid module, plays to the end under the heuristic AI, keeps hidden
// information hidden and replays identically; each one's signature mechanics actually fire; lint catches design bugs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match, Mod } from '#engine';
import { createMatch, eventHash, eventsFor, listActions, observe, replay } from '#engine';
import { makeAgent, randomAgent } from '#ai';
import { invariantErrors, playMatch } from '#harness';
import { BLUEPRINTS, blank, build, compileBlueprint, fromBlueprint, lint } from '#maker';

function modOf(id: string): Mod {
  const { mod, problems } = build(fromBlueprint(id));
  assert.ok(mod, `${id}: ${problems.map((p) => p.text).join('; ')}`);
  return mod!;
}
const decksOf = (mod: Mod, seed: number) => { const ids = Object.keys(mod.decks!); const o = seed % 2 ? [ids[0], ids[1 % ids.length]] : [ids[1 % ids.length], ids[0]]; return o.map((d) => structuredClone(mod.decks![d])); };
const play = (mod: Mod, seed: number, ai: 'heuristic' | 'random' = 'heuristic', onStep?: (g: Match) => void) =>
  playMatch(createMatch(mod, { decks: decksOf(mod, seed), seed }), ai === 'random' ? [randomAgent(seed * 13), randomAgent(seed * 13 + 1)] : [makeAgent('heuristic', seed), makeAgent('heuristic', seed + 9)], onStep);

function hiddenFrom(g: Match, p: string): string[] {
  const out: string[] = [];
  for (const [key, ids] of Object.entries(g.s.zones)) {
    const [owner, zid] = key.split(':');
    const zd = g.m.zone.get(zid)!;
    if (!(zd.vis === 'public' || (zd.vis === 'owner' && !zd.shared && owner === p))) out.push(...ids);
  }
  return out;
}

/** Events or actions each blueprint must produce across a few AI games (its signature systems). */
const SIGNATURE: Record<string, string[]> = {
  stack: ['stacked', 'blocked', 'hit', 'action:resource', 'action:quick'],
  lanes: ['showdownFight', 'conquer', 'hold', 'action:march', 'action:act#0'],
  duel: ['prize', 'linked', 'action:energy', 'action:useMove#0', 'action:summon'],
  chain: ['flipped', 'action:spring', 'action:position', 'action:setUnit', 'countered'],
  leaderLife: ['lifeLost', 'action:boost', 'action:counterCard', 'blocked'],
  leaderEnergy: ['lifeLost', 'action:resource', 'action:quick', 'action:act#0'],
  blank: ['hit', 'action:cast'],
};

for (const b of BLUEPRINTS) {
  test(`maker ${b.name}: builds with no bugs, legal decks, and signature mechanics fire in AI games`, () => {
    const mod = modOf(b.id);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const end = play(mod, seed);
      assert.ok(end.s.result, `${b.id} seed ${seed} unfinished`);
      assert.notEqual(end.s.result!.reason, 'turnLimit', `${b.id} seed ${seed} hit the turn limit`);
      for (const e of end.s.events as any[]) { seen.add(e.type); if (e.type === 'action') seen.add(`action:${e.action}`); }
    }
    for (const k of SIGNATURE[b.id] ?? []) assert.ok(seen.has(k), `${b.id}: never saw ${k}`);
  });

  test(`maker ${b.name}: replays identically, hides hidden cards, conserves cards`, () => {
    const mod = modOf(b.id);
    for (let seed = 1; seed <= 3; seed++) {
      const end = play(mod, seed, 'random', (g) => {
        for (const pl of g.s.players) {
          const seenTxt = JSON.stringify([observe(g, pl.id), listActions(g, pl.id), eventsFor(g, pl.id)]);
          for (const h of hiddenFrom(g, pl.id)) assert.ok(!seenTxt.includes(`"${h}"`), `${b.id} seed ${seed}: ${pl.id} can see ${h}`);
        }
      });
      assert.equal(replay(mod, end.s.opts, end.s.cmds).hash, eventHash(end.s));
      assert.deepEqual(invariantErrors(end), []);
    }
  });
}

test('maker: lint finds design bugs in plain language', () => {
  const bp = blank();
  bp.win = { ...bp.win, life: 0 };
  bp.cards[4].abilities.push({ when: 'play', do: [{ k: 'token', card: 'squire' }] });
  bp.decks[0].main['ghost'] = 2;
  const texts = lint(bp).filter((p) => p.level === 'bug').map((p) => p.text).join('\n');
  assert.match(texts, /Nobody can win/);
  assert.match(texts, /isn't a Token card/);
  assert.match(texts, /no longer exists/);
  assert.equal(build(bp).mod, null);
});

test('maker: rules text writes itself from the ability blocks; advanced patches reach the rules', () => {
  const bp = blank();
  const def = compileBlueprint(bp) as any;
  assert.equal(def.cards.find((c: any) => c.id === 'spark').text, 'Deal 2 damage to an enemy unit or the opponent.');
  bp.advanced = { rules: { turnLimit: 33 }, triggers: [{ on: 'turnStart', do: [['log', 'custom trigger']] }] };
  const d2 = compileBlueprint(bp) as any;
  assert.equal(d2.rules.turnLimit, 33);
  assert.ok(d2.rules.triggers.some((t: any) => t.on === 'turnStart'));
  assert.ok(build(bp).mod);
});

test('maker: end of turn discards down to the hand limit (choose with expression counts)', () => {
  const bp = blank();
  bp.setup = { ...bp.setup, hand: 9, handLimit: 3, mulligan: false };
  const mod = build(bp).mod!;
  let g = createMatch(mod, { decks: decksOf(mod, 1), seed: 3 });
  try { playMatch(g, [randomAgent(1), randomAgent(2)], (x) => { g = x; }, 60); } catch { /* stop after 60 steps */ }
  const discards = (g.s.events as any[]).filter((e) => e.type === 'moved' && e.from === 'hand' && e.to === 'grave').length;
  assert.ok(discards >= 6, `expected end-of-turn discards, saw ${discards}`);
});

// ---------------------------------------------------------------- mechanic recipes (mix and match)
import { RECIPES, applyRecipe } from '#maker';
const COMBOS: [string, string[]][] = [
  ['blank', ['inkwell', 'quest', 'songs', 'evolution', 'keywordKit']],
  ['blank', ['manaZone', 'shields', 'compare', 'keywordKit']],
  ['blank', ['resDeck', 'levelGate', 'gear', 'lifeTriggers']],
  ['blank', ['hiddenResources', 'twinArenas', 'deployLeader', 'alternate', 'restore']],
  ['blank', ['pitch', 'actionPoints', 'drawTo', 'items']],
  ['blank', ['ramp', 'lines', 'energyNeed', 'lifeCards', 'lifeTriggers']],
  ['chain', ['traps', 'positions', 'tribute', 'extraDeck']],
  ['leaderLife', ['counterStep', 'boost']],
];
const withRecipes = (base: string, ids: string[]) => { const bp = fromBlueprint(base); for (const r of ids) applyRecipe(bp, r); return bp; };

test('maker recipes: every recipe builds on a blank game and plays to the end', () => {
  for (const r of RECIPES) {
    const { mod, problems } = build(withRecipes('blank', [r.id]));
    assert.ok(mod, `${r.id}: ${problems.map((p) => p.text).join('; ')}`);
    for (let seed = 1; seed <= 2; seed++) assert.ok(play(mod!, seed).s.result, `${r.id} seed ${seed}`);
  }
});

test('maker recipes: mixed combinations build, finish, replay identically and keep hidden cards hidden', () => {
  for (const [base, ids] of COMBOS) {
    const label = `${base}+${ids.join('+')}`;
    const { mod, problems } = build(withRecipes(base, ids));
    assert.ok(mod, `${label}: ${problems.map((p) => p.text).join('; ')}`);
    assert.ok(play(mod!, 1).s.result, label);
    const end = play(mod!, 2, 'random', (g) => {
      for (const pl of g.s.players) {
        const txt = JSON.stringify([observe(g, pl.id), listActions(g, pl.id), eventsFor(g, pl.id)]);
        for (const hdn of hiddenFrom(g, pl.id)) assert.ok(!txt.includes(`"${hdn}"`), `${label}: ${pl.id} can see ${hdn}`);
      }
    });
    assert.equal(replay(mod!, end.s.opts, end.s.cmds).hash, eventHash(end.s), label);
    assert.deepEqual(invariantErrors(end), [], label);
  }
});

test('maker recipes: signature mechanics fire (questing, pitching, arenas, inkwell, shields, multiple blockers)', () => {
  const seen = (base: string, ids: string[], seeds = 4) => {
    const mod = build(withRecipes(base, ids)).mod!;
    const s = new Set<string>();
    for (let seed = 1; seed <= seeds; seed++) for (const e of play(mod, seed).s.events as any[]) { s.add(e.type); if (e.type === 'action') s.add(`action:${e.action.split('#')[0]}`); }
    return s;
  };
  const ink = seen('blank', ['inkwell', 'quest']);
  assert.ok(ink.has('action:quest') && ink.has('action:resource') && ink.has('quest'), 'inkwell + questing');
  const pitch = seen('blank', ['pitch']);
  assert.ok(pitch.has('action:attackCard') && pitch.has('hit'), 'pitch + attack cards');
  const lines = seen('blank', ['lines']);
  assert.ok(lines.has('action:advance'), 'front line & reserve');
  const sh = seen('blank', ['shields']);
  assert.ok(sh.has('lifeLost'), 'shields break');
  const bl = seen('stack', ['block']);
  assert.ok(bl.has('blocked'), 'blocking with up to two units');
});

test('maker blocks: filters, cost blocks, counters and valued keywords compile to working rules', () => {
  const bp = blank();
  bp.counters = [{ id: 'growth', name: 'Growth', adds: { power: 1, health: 1 } }];
  bp.keywords.push({ id: 'resist', name: 'Resist', rule: 'resist', text: '', valued: true });
  bp.cards.push({ id: 'oak', name: 'Old Oak', type: 'unit', cost: 2, stats: { power: 1, health: 4 }, keywords: ['resist'], kwv: { resist: 2 },
    abilities: [{ when: 'activated', tap: true, discard: 1, do: [{ k: 'addCounter', card: 'growth', n: 1, target: 'self' }] }] });
  bp.cards.push({ id: 'snipe', name: 'Snipe', type: 'spell', cost: 1, stats: {}, keywords: [], abilities: [{ when: 'play', do: [{ k: 'destroy', target: 'enemyUnit', filter: { stat: 'power', op: 'le', val: 2 } }] }] });
  bp.decks[0].main.oak = 3; bp.decks[0].main.snipe = 3;
  const def = compileBlueprint(bp) as any;
  const oak = def.cards.find((c: any) => c.id === 'oak');
  assert.equal(oak.kw_resist, 2);
  assert.match(oak.text, /Resist 2/);
  assert.match(oak.text, /Exhaust, discard 1: Put 1 Growth counter on this/);
  assert.match(def.cards.find((c: any) => c.id === 'snipe').text, /with 2 or less Power/);
  assert.ok(def.rules.replacements.some((r: any) => r.text === 'Resist'));
  assert.ok(def.rules.statics.some((s: any) => s.text === 'Growth'));
  const { mod, problems } = build(bp);
  assert.ok(mod, problems.map((p) => p.text).join('; '));
  assert.ok(play(mod!, 3).s.result);
});

// ---------------------------------------------------------------- "instead" and "can't" blocks, cost reducers
import { place } from './helpers.ts';
import { commitAction, submitDecision } from '#engine';
function maker(ids: string[], seed = 5) {
  const mod = build(withRecipes('blank', ids)).mod!;
  let g = createMatch(mod, { decks: decksOf(mod, 1), seed });
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, g.s.pending.options.slice(0, Math.max(1, g.s.pending.min)));
  return { mod, g, me: `p${g.s.turn.active}` };
}
const attackers = (g: Match, p: string) => listActions(g, p).filter((a: any) => a.action === 'attack').map((a: any) => a.source);

test('maker blocks: Defender cannot attack, a stunned unit cannot attack, and the stun wears off at the end of its controller\'s turn', () => {
  const { g, me } = maker(['restrictions', 'conditions']);
  const wall = place(g, me, 'stone-rampart', 'field', { newT: -1 });
  const squire = place(g, me, 'squire', 'field', { newT: -1 });
  g.s.turn.n = 3;
  assert.ok(!attackers(g, me).includes(wall), 'Defender is not offered as an attacker');
  assert.ok(attackers(g, me).includes(squire), 'a normal unit can attack');
  g.s.objects[squire].vars.c_stun = 1;
  assert.ok(!attackers(g, me).includes(squire), 'stunned: no attack');
  const def = compileBlueprint(withRecipes('blank', ['conditions'])) as any;
  assert.ok(JSON.stringify(def.rules.phases.find((p: any) => p.id === 'end')).includes('c_stun'), 'stun is cleared at end of turn');
});

test('maker blocks: a cost reducer makes cards cheaper; prevention and "instead of destroyed" compile to replacements', () => {
  const bp = withRecipes('blank', ['costReducer', 'prevention']);
  const def = compileBlueprint(bp) as any;
  assert.equal(def.cards.find((c: any) => c.id === 'guild-charter').cmN, -1);
  assert.match(def.cards.find((c: any) => c.id === 'guild-charter').text, /Your Units cost 1 less/);
  assert.ok(def.cards.find((c: any) => c.id === 'aegis-totem').replacements.some((r: any) => r.replace === 'damage'));
  assert.ok(def.cards.find((c: any) => c.id === 'ember-phoenix').replacements.some((r: any) => r.replace === 'destroy'));
  const { g, me } = maker(['costReducer']);
  const giant = place(g, me, 'giant', 'hand');
  const pl = g.s.players.find((x) => x.id === me)!;
  pl.vars['mana:c'] = 4; // Giant costs 5
  const canSummon = () => listActions(g, me).some((a: any) => a.action === 'summon' && a.source === giant);
  assert.ok(!canSummon(), '4 energy is not enough for a 5-cost unit');
  place(g, me, 'guild-charter', 'support');
  assert.ok(canSummon(), 'with Guild Charter in play it costs 4');
  const g2 = commitAction(g, me, { action: 'summon', source: giant, targets: {} });
  assert.equal(g2.s.players.find((x) => x.id === me)!.vars['mana:c'] ?? 0, 0, 'paid the reduced cost');
});

test('maker: "Surprise me" mash-ups always build and play to a finish', async () => {
  const { surpriseRecipes } = await import('#maker');
  for (let seed = 1; seed <= 8; seed++) {
    const ids = surpriseRecipes(seed);
    const { mod, problems } = build(withRecipes('blank', ids));
    assert.ok(mod, `${ids.join('+')}: ${problems.map((p) => p.text).join('; ')}`);
    const end = play(mod!, seed);
    assert.ok(end.s.result && end.s.result.reason !== 'turnLimit', ids.join('+'));
  }
});

test('maker zones: a shared Stadium replaces the one in play; banishing moves cards to the banished pile; zone filters and costs compile', () => {
  const bp = withRecipes('blank', ['stadium', 'banish']);
  const def = compileBlueprint(bp) as any;
  assert.ok(def.rules.zones.some((z: any) => z.id === 'stadium' && z.abilities));
  assert.ok(def.rules.zones.some((z: any) => z.id === 'banished'));
  assert.match(def.cards.find((c: any) => c.id === 'void-exile').text, /Banish an enemy unit/);
  assert.match(def.cards.find((c: any) => c.id === 'grave-feaster').text, /Banish 2 from your discard pile/);
  const { mod, problems } = build(bp);
  assert.ok(mod, problems.map((p) => p.text).join('; '));
  let g = createMatch(mod!, { decks: decksOf(mod!, 1), seed: 4 });
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, g.s.pending.options.slice(0, Math.max(1, g.s.pending.min)));
  const me = g.s.players[g.s.turn.active].id, opp = g.s.players[1 - g.s.turn.active].id;
  place(g, opp, 'roaring-coliseum', 'stadium');
  const mine = place(g, me, 'quiet-sanctuary', 'hand');
  g.s.players.find((x) => x.id === me)!.vars['mana:c'] = 5;
  g = commitAction(g, me, { action: 'deploy', source: mine, targets: {} });
  assert.deepEqual(g.s.zones[`${opp}:stadium`], [], 'the old Stadium is gone');
  assert.equal(g.s.zones[`${me}:stadium`].length, 1, 'the new one is in play');
  const bad = blank();
  bad.cards[4].abilities[0].do[0] = { k: 'destroy', target: 'enemyUnit', filter: { zone: 'deck' } };
  assert.match(lint(bad).map((p) => p.text).join(' '), /hidden zone/);
});
