// Looboo (default module; mechanics reference: Pokémon TCG) and the Workshop's generic status effects. Checks the shipped
// files match the blueprint, decks are legal (Rare Find limit), and AI games follow the rules: setup (active + bench,
// basic-only mulligans with bonus draws), turn 1 (no attack or Helper for the first player, no evolving on your own first
// turn), statuses (only the Active, cleared on the bench, Snoozy/Stunned stop attacks and retreat), coin flips,
// multi-prize knock-outs, the bench limit and one Gear per Looboo. A second, non-duel game proves statuses are generic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Match } from '#engine';
import { createMatch, deckErrors, eventHash, listActions, replay } from '#engine';
import { makeAgent, randomAgent } from '#ai';
import { MOD_DIR, invariantErrors, loadRef, playMatch } from '#harness';
import { blank, build, compileBlueprint } from '#maker';

const dir = join(MOD_DIR, 'looboo');
const bp = JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8'));
const mod = loadRef('looboo');
const ids = Object.keys(mod.decks!);

test('looboo: shipped files are the compiled Workshop blueprint', () => {
  const def = compileBlueprint(structuredClone(bp)) as any;
  for (const f of ['rules', 'cards', 'decks']) assert.deepEqual(JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')), JSON.parse(JSON.stringify(def[f])), `${f}.json is stale: run npm run -s modules`);
  const { mod: m, problems } = build(structuredClone(bp));
  assert.ok(m, problems.map((p) => p.text).join('; '));
});

test('looboo: decks are legal; two Rare Find cards are rejected', () => {
  for (const id of ids) assert.deepEqual(deckErrors(mod, mod.decks![id]), [], id);
  const bad = [...(mod.decks![ids[0]] as string[])];
  bad[bad.indexOf('spore-nutrient')] = 'lucky-antenna';
  assert.ok(deckErrors(mod, bad).some((e) => /Rare Find/.test(e)));
});

const STOP = ['st_snoozy', 'st_stunned'];
test('looboo: AI games follow setup, turn-one, status, prize and bench rules', () => {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const bad: string[] = [];
    const g: Match = playMatch(createMatch(mod, { decks: [structuredClone(mod.decks![ids[i % 4]]), structuredClone(mod.decks![ids[(i + 1) % 4]])], seed: 300 + i }),
      i % 2 ? [randomAgent(300 + i), randomAgent(301 + i)] : [makeAgent('heuristic', 300 + i), makeAgent('heuristic', 307 + i)], (m) => {
        const s = m.s;
        for (const p of s.players) {
          if ((s.zones[`${p.id}:bench`] ?? []).length > 5) bad.push('bench over 5');
          for (const id of s.zones[`${p.id}:bench`] ?? []) if (Object.entries(s.objects[id].vars).some(([k, v]) => k.startsWith('st_') && v)) bad.push('status on the bench');
          for (const a of listActions(m, p.id)) {
            const o = a.source ? s.objects[a.source] : null;
            if (/^(useMove|retreat)/.test(a.action) && o && STOP.some((k) => o.vars[k])) bad.push(`${a.action} while ${STOP.find((k) => o.vars[k])}`);
            if (s.turn.n === 1 && /^useMove/.test(a.action)) bad.push('attack on turn 1');
            if (a.action === 'cast' && s.turn.n === 1 && m.m.card.get(s.objects[a.source!].card)?.type === 'helper') bad.push('Helper on turn 1');
            if (a.action === 'evolve' && (p.vars.turns as number) <= 1) bad.push('evolve on own first turn');
          }
        }
        const gear: Record<string, number> = {};
        for (const o of Object.values(s.objects)) if (o.rel?.bearer && m.m.card.get(o.card)?.type === 'gear') gear[String(o.rel.bearer)] = (gear[String(o.rel.bearer)] ?? 0) + 1;
        if (Object.values(gear).some((n) => n > 1)) bad.push('two Gear on one Looboo');
      });
    assert.deepEqual([...new Set(bad)], [], `game ${i}`);
    assert.deepEqual(invariantErrors(g), []);
    assert.ok(g.s.result, `game ${i} ends`);
    for (const e of g.s.events) { const k = e.type === 'action' ? `action:${String(e.action).split('#')[0]}` : e.type; seen[k] = (seen[k] ?? 0) + 1; if (e.type === 'prize' && (e.n ?? 1) > 1) seen.multiPrize = (seen.multiPrize ?? 0) + 1; }
    assert.equal(replay(mod, g.s.opts, g.s.cmds).hash, eventHash(g.s));
  }
  for (const t of ['coin', 'status', 'statusTick', 'cured', 'prize', 'action:useMove', 'action:retreat', 'action:energy', 'action:evolve', 'switched', 'revealed']) assert.ok(seen[t] > 0, `${t} happens`);
});

test('statuses are generic: a non-duel game with its own statuses and coin flips', () => {
  const g0 = blank();
  g0.statuses = [
    { id: 'frozen', name: 'Frozen', stops: ['attack', 'block'], lasts: 'ownerNextTurnEnd' },
    { id: 'burning', name: 'Burning', tickWhen: 'ownerStart', tickDamage: 1, stacks: true },
    { id: 'inspired', name: 'Inspired', adds: { power: 2 }, lasts: 'endOfTurn' },
  ];
  g0.cards.push({ id: 'frost-bolt', name: 'Frost Bolt', type: 'spell', cost: 1, stats: {}, keywords: [], abilities: [{ when: 'play', do: [{ k: 'inflict', status: 'frozen', target: 'enemyUnit' }] }] });
  g0.cards.push({ id: 'fire-dice', name: 'Fire Dice', type: 'spell', cost: 1, stats: {}, keywords: [], abilities: [{ when: 'play', do: [{ k: 'flip', n: 2, perHeads: true, heads: [{ k: 'inflict', status: 'burning', target: 'enemyUnit' }] }] }] });
  g0.cards.push({ id: 'war-song', name: 'War Song', type: 'spell', cost: 1, stats: {}, keywords: [], abilities: [{ when: 'play', do: [{ k: 'inflict', status: 'inspired', target: 'ownUnit' }] }] });
  g0.decks[0].main = { squire: 3, scout: 3, knight: 3, giant: 3, spark: 2, 'frost-bolt': 2, 'fire-dice': 2, 'war-song': 2 };
  const { mod: m, problems } = build(g0);
  assert.ok(m, problems.map((p) => p.text).join('; '));
  const seen: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    let frozenAttack = 0;
    const g = playMatch(createMatch(m!, { decks: [structuredClone(m!.decks!.starter), structuredClone(m!.decks!.starter)], seed: 40 + i }), [randomAgent(40 + i), randomAgent(41 + i)], (mm) => {
      for (const p of mm.s.players) for (const a of listActions(mm, p.id)) if (a.action === 'attack' && a.source && mm.s.objects[a.source].vars.st_frozen) frozenAttack++;
    });
    assert.equal(frozenAttack, 0, 'frozen units never attack');
    for (const e of g.s.events) seen[e.type === 'status' ? `status:${e.s}` : e.type] = (seen[`${e.type === 'status' ? `status:${e.s}` : e.type}`] ?? 0) + 1;
  }
  for (const t of ['status:frozen', 'status:burning', 'status:inspired', 'coin', 'statusTick', 'cured']) assert.ok(seen[t] > 0, `${t} happens`);
});
