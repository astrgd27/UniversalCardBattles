// Usage: npm run -s bench — large-board timings (100+ objects, many continuous effects).
import { commitAction, createMatch, invalidate, listActions, observe } from '#engine';
import { loadRef } from '#harness';

const m = loadRef('arcane-duel');
const deck = (m.decks!['grove-host'] as string[]);
const big = (n: number) => Array.from({ length: n }, (_, i) => deck[i % deck.length]);
// 2 x 80-card decks (format bypassed for the benchmark).
const g = createMatch({ ...m, rules: { ...m.rules, format: { ...m.rules.format, deckMin: 0, deckMax: 999, maxCopies: 99 } } }, { decks: [big(80), big(80)], seed: 1 });
for (const p of ['p0', 'p1']) {
  const ids = g.s.zones[`${p}:deck`].splice(0, 50);
  for (const id of ids) { g.s.objects[id].zone = `${p}:board`; g.s.objects[id].vars.ready = 1; g.s.objects[id].vars.growth = 1; }
  g.s.zones[`${p}:board`].push(...ids);
  g.s.players[+p.slice(1)].vars.mana = 99;
}
invalidate(g.s);
const time = (label: string, n: number, fn: () => void) => {
  const t = performance.now();
  for (let i = 0; i < n; i++) fn();
  console.log(`${label}: ${((performance.now() - t) / n).toFixed(1)} ms`);
};
const statics = Object.values(g.s.objects).filter((o) => o.zone.endsWith(':board') && m.card.get(o.card)?.statics).length;
console.log(`objects=${Object.keys(g.s.objects).length} on board=${g.s.zones['p0:board'].length + g.s.zones['p1:board'].length} statics=${statics}`);
time('observe', 20, () => { invalidate(g.s); observe(g, 'p0'); });
time('listActions', 5, () => listActions(g, 'p0'));
const atk = listActions(g, 'p0').find((t) => t.action === 'attack')!;
time('commit attack + resolve', 3, () => {
  let x = commitAction(g, 'p0', { action: 'attack', source: atk.source, targets: { $t: [atk.slots[0].options[0]] } });
  x = commitAction(x, 'p0', { action: 'pass' });
  commitAction(x, 'p1', { action: 'pass' });
});
