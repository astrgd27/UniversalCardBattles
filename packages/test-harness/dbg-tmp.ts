import { createMatch, listActions, commitAction, submitDecision } from '#engine';
import { loadRef } from '#harness';
const mod = loadRef('arcade-showdown');
const stack = (p: string, top: string[]) => [['each', ['cards', p, 'deck'], '$c', [['move', '$c', 'grave']]], ...[...top, ...Array(20).fill('low-sweep')].map((c) => ['create', c, p, 'deck'])];
let g = createMatch(mod, { decks: [structuredClone(mod.decks!['ronins-path']), structuredClone(mod.decks!['holy-knuckles'])], seed: 1, scenario: { setup: [...stack('p0', ['ember-jab']), ['create', 'code-of-honor', 'p0', 'hand']] as any } });
for (let i = 0; i < 60 && !(g.m.rules.phases[g.s.turn.phase]?.id === 'combat' && !g.s.pending); i++) { if (g.s.pending) { g = submitDecision(g, g.s.pending.player, g.s.pending.id, g.s.pending.options.slice(0, g.s.pending.min)); continue; } g = commitAction(g, g.s.priority!, { action: 'pass' }); }
console.log('turn', g.s.turn.n, 'active', g.s.turn.active, 'deck', g.s.zones['p0:deck'].slice(0, 3).map((o) => g.s.objects[o].card), 'hand', g.s.zones['p0:hand'].map((o) => g.s.objects[o].card).join(','));
console.log('pool', g.s.zones['p0:pool'].map((o) => g.s.objects[o].card), 'support', g.s.zones['p0:support'].length, 'grave', g.s.zones['p0:grave'].length);
