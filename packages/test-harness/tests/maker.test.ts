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
