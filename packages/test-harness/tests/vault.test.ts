import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match } from '#engine';
import { IllegalAction, commitAction, createMatch, eventHash, listActions, observe, replay, setExternal } from '#engine';
import { deckOpts, loadRef } from '#harness';
import { place } from './helpers.ts';

const V = loadRef('vault-breach');
const fresh = (external?: Record<string, string>) => createMatch(V, { ...deckOpts(V, ['raider-crew', 'warden-garrison'], 1), ...(external ? { external } : {}) });
const opts = (g: Match, p: string, action: string, src: string) => listActions(g, p).find((t) => t.action === action && t.source === src)?.slots[0].options;
const pass = (g: Match) => commitAction(g, g.s.priority!, { action: 'pass' });

test('vault-breach: grid movement around terrain; role-specific entry rows', () => {
  const g = fresh();
  const u = place(g, 'p0', 'runner', 'field', { x: 1, y: 1, ready: 1 });
  assert.deepEqual(opts(g, 'p0', 'move', u), ['1,0', '0,1', '2,1'], 'the wall at 1,2 blocks the move');
  assert.deepEqual(listActions(g, 'p0').find((t) => t.action === 'deploy')!.slots[0].options, ['0,0', '1,0', '2,0', '3,0', '4,0']);
  assert.ok(!listActions(g, 'p0').some((t) => t.action === 'zap' || t.action === 'strike' || t.action === 'fortify'), 'raider has no warden actions');
  const h = pass(g);
  assert.equal(h.s.priority, 'p1');
  const wardenEntry = listActions(h, 'p1').find((t) => t.action === 'deploy')?.slots[0].options ?? [];
  assert.ok(wardenEntry.every((c) => +c.split(',')[1] >= 3) && !wardenEntry.includes('2,4'), 'warden enters rows 3-4, not onto vaults');
});

test('vault-breach: external input changes sentry range and replays deterministically', () => {
  assert.throws(() => fresh({ lights: 'dim' }), /lights=dim is not one of on, off/);
  assert.throws(() => fresh({ weather: 'rain' }), /Unknown external input weather/);
  let g = pass(fresh());
  const r = place(g, 'p0', 'runner', 'field', { x: 2, y: 1 });
  const s = place(g, 'p1', 'sentry', 'field', { x: 2, y: 3, ready: 1 });
  assert.deepEqual(opts(g, 'p1', 'zap', s), [r], 'lights on: range 2');
  g = setExternal(g, 'lights', 'off');
  assert.equal(observe(g, 'p0').ext.lights, 'off');
  assert.equal(opts(g, 'p1', 'zap', s), undefined, 'lights off: range 1');
  assert.throws(() => setExternal(g, 'lights', 'strobe'), IllegalAction);
  const clean = setExternal(commitAction(fresh(), 'p0', { action: 'pass' }), 'lights', 'off');
  const done = commitAction(clean, 'p1', { action: 'pass' });
  assert.equal(replay(V, done.s.opts, done.s.cmds).hash, eventHash(done.s), 'external changes are part of the command log');
});

test('vault-breach: the shared alarm ends the raider turn early', () => {
  let g = fresh();
  const u = place(g, 'p0', 'runner', 'field', { x: 0, y: 0, ready: 1 });
  g.s.vars.alarm = 7;
  g = commitAction(g, 'p0', { action: 'move', source: u, targets: { $c: ['0,1'] } });
  assert.ok(g.s.events.some((e) => e.type === 'alarm'));
  assert.deepEqual([g.s.turn.n, g.s.priority], [2, 'p1']);
});

test('vault-breach: breach runs through hidden barriers (nested encounter)', () => {
  let g = fresh();
  const barrier = g.s.zones['p1:vaultcore'][1];
  assert.equal(observe(g, 'p0').zones['p1:vaultcore'].cards!.find((c) => c.id === barrier)!.card, '', 'barriers are hidden from the raider');
  assert.notEqual(observe(g, 'p1').zones['p1:vaultcore'].cards!.find((c) => c.id === barrier)!.card, '');
  const vault = g.s.zones['p1:field'].find((id) => g.s.objects[id].vars.x === 2)!;
  const u = place(g, 'p0', 'bruiser', 'field', { x: 2, y: 3, ready: 1 });
  g.s.players[0].vars.tools = 0;
  const fail = commitAction(g, 'p0', { action: 'breach', source: u, targets: { $v: [vault] } });
  assert.ok(fail.s.events.some((e) => e.type === 'repelled') && fail.s.players[0].vars.score === 0, 'no tools: repelled');
  g.s.players[0].vars.tools = 10;
  const ok = commitAction(g, 'p0', { action: 'breach', source: u, targets: { $v: [vault] } });
  assert.equal(ok.s.players[0].vars.score, 1);
  assert.equal(ok.s.zones['p0:loot'].length, 1);
  assert.ok(ok.s.events.some((e) => e.type === 'flipped'), 'barriers are revealed as they are encountered');
});
