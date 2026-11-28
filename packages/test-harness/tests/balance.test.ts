// Balance assistant: cost-curve outliers, AI-lab play data, cost fixes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceReport, cardValue, fromBlueprint, setCardCost } from '#maker';

const curveGame = () => {
  const bp = fromBlueprint('blank');
  const t = bp.cards.find((c) => bp.types.find((x) => x.id === c.type)?.role === 'unit')!.type;
  const pw = bp.combat.power, hp = bp.combat.health!;
  bp.cards = bp.cards.filter((c) => c.type !== t);
  for (let cost = 1; cost <= 6; cost++) for (const k of [0, 1]) bp.cards.push({ id: `u${cost}${k}`, name: `Unit ${cost}${k}`, type: t, cost, stats: { [pw]: cost + k, [hp]: cost + 1 - k }, keywords: [], abilities: [] });
  bp.cards.push({ id: 'giant', name: 'Bargain Giant', type: t, cost: 1, stats: { [pw]: 7, [hp]: 7 }, keywords: [], abilities: [] });
  bp.cards.push({ id: 'dud', name: 'Overpriced Dud', type: t, cost: 6, stats: { [pw]: 1, [hp]: 1 }, keywords: [], abilities: [] });
  return bp;
};

test('balance: cards far off the cost curve are flagged with a suggested cost', () => {
  const bp = curveGame();
  const notes = balanceReport(bp);
  const giant = notes.find((n) => n.id === 'giant'), dud = notes.find((n) => n.id === 'dud');
  assert.equal(giant?.level, 'strong');
  assert.ok(giant!.suggest! > 1 && giant!.suggest! <= 4, `suggests a higher cost (${giant?.suggest})`);
  assert.equal(dud?.level, 'weak');
  assert.ok(dud!.suggest! < 6);
  assert.ok(!notes.some((n) => /^u\d/.test(n.id)), 'cards on the curve are not flagged');
  assert.ok(cardValue(bp, bp.cards.find((c) => c.id === 'giant')!) > cardValue(bp, bp.cards.find((c) => c.id === 'u10')!));
});

test('balance: AI-lab win rates add notes, and agreeing evidence is marked as both', () => {
  const bp = curveGame();
  const notes = balanceReport(bp, [{ id: 'giant', games: 20, wins: 17 }, { id: 'u31', games: 12, wins: 2 }, { id: 'u21', games: 4, wins: 4 }]);
  assert.equal(notes.find((n) => n.id === 'giant')?.confidence, 'both');
  assert.equal(notes.find((n) => n.id === 'u31')?.level, 'weak');
  assert.ok(!notes.some((n) => n.id === 'u21'), 'too few games to judge');
});

test('balance: setting a cost keeps the colored part of a typed cost', () => {
  const c: any = { id: 'x', name: 'X', type: 'unit', cost: { any: 2, ember: 1 }, stats: {}, keywords: [], abilities: [] };
  setCardCost(c, 5); assert.deepEqual(c.cost, { any: 4, ember: 1 });
  setCardCost(c, 1); assert.deepEqual(c.cost, { ember: 1 });
  const d: any = { cost: 3 }; setCardCost(d, 2); assert.equal(d.cost, 2);
});
