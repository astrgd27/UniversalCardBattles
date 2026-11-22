// Scripted tutorials: every tutorial of every module plays through exactly as the app runs it (learner moves are
// enforced, the scripted opponent plays its moves), each expected move is legal when its step comes, and the
// final step is reached. Rewards are granted once.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match, Mod } from '#engine';
import { commitAction, createMatch, observe, submitDecision } from '#engine';
import type { Tutorial } from '#campaign';
import { allowedOptions, campaignOf, expectedCommand, finishTutorial, isExpected, newProfile, readShowing, stepKind, tutorialAgent, tutorialDone } from '#campaign';
import { loadRef } from '#harness';
import { GAME_IDS } from '../src/golden.ts';

/** Plays a tutorial like the app: returns the final match and the trace of steps. */
export function runTutorial(m: Mod, t: Tutorial): { g: Match; reached: number; log: string[] } {
  const c = campaignOf(m)!;
  const decks = { ...(m.decks ?? {}), ...(c.decks ?? {}) } as Record<string, any>;
  let g = createMatch(m, { decks: [structuredClone(decks[t.deck]), structuredClone(decks[t.opponentDeck])], seed: t.seed ?? 1, ...(t.scenario ? { scenario: t.scenario } : {}) });
  const ai = tutorialAgent(t);
  const log: string[] = [];
  let i = 0;
  for (let guard = 0; i < t.steps.length && guard < 2000; guard++) {
    const st = t.steps[i];
    const kind = stepKind(st)!;
    if (kind === 'read' && readShowing(g, 'p0', st)) { log.push(`${i} read`); i++; continue; }
    if (g.s.result) throw new Error(`step ${i} (${kind}): the game ended first (${JSON.stringify(g.s.result)})`);
    const actor = g.s.pending ? g.s.pending.player : g.s.priority;
    if (actor !== 'p0') {
      const v = observe(g, actor!);
      g = g.s.pending ? submitDecision(g, actor!, g.s.pending.id, ai.decide(v)) : commitAction(g, actor!, ai.act(v, (globalThis as any).__noop ?? listFor(g, actor!)));
      continue;
    }
    if (g.s.pending) {
      if (kind !== 'decide') throw new Error(`step ${i} (${kind}): the learner faces an unscripted decision "${g.s.pending.prompt}"`);
      const pd = g.s.pending;
      g = submitDecision(g, 'p0', pd.id, allowedOptions(g, st, pd).slice(0, Math.max(1, pd.min)));
      log.push(`${i} decide`); i++;
      continue;
    }
    if (kind !== 'move' && kind !== 'pass') throw new Error(`step ${i} (${kind}): the learner has priority but the step expects ${kind}`);
    const cmd = kind === 'pass' ? { action: 'pass' } : expectedCommand(g, 'p0', st);
    if (!cmd) throw new Error(`step ${i}: expected move ${JSON.stringify(st.do)} is not legal now (phase ${observe(g, 'p0').phase})`);
    assert.ok(isExpected(g, 'p0', st, cmd));
    g = commitAction(g, 'p0', cmd);
    log.push(`${i} ${cmd.action}`); i++;
  }
  return { g, reached: i, log };
}
import { listActions } from '#engine';
const listFor = (g: Match, p: string) => listActions(g, p);

const ev = (g: Match, ty: string) => g.s.events.some((e) => e.type === ty);
/** What each lesson must actually achieve, not just reach its last line. */
const OUTCOME: Record<string, (g: Match) => boolean> = {
  'nightfall/basics': (g) => ev(g, 'intercept') && g.s.players[0].vars.claims === 1,
  'nightfall/cabal': (g) => ev(g, 'dominated') && ev(g, 'cancelled'),
  'nightfall/harvest': (g) => ev(g, 'awakened') && g.s.players[0].vars.claims === 1,
  'nightfall/zombie': (g) => ev(g, 'overrun'),
  'nightfall/slasher': (g) => ev(g, 'sprung') && g.s.result?.winners[0] === 'p0' && g.s.players[0].vars.bodycount === 13,
  'nightfall/devil': (g) => ev(g, 'nativity') && g.s.result?.winners[0] === 'p0',
};

for (const id of GAME_IDS) {
  const m = loadRef(id);
  const c = campaignOf(m);
  for (const t of c?.tutorials ?? []) {
    test(`${id} tutorial "${t.name}" plays through`, () => {
      const r = runTutorial(m, t);
      assert.equal(r.reached, t.steps.length, r.log.join(' | '));
      const want = OUTCOME[`${id}/${t.id}`];
      if (want) assert.ok(want(r.g), `${t.id}: the lesson's outcome happened`);
    });
  }
}

test('tutorial rewards are paid once', () => {
  const m = loadRef('nightfall');
  const c = campaignOf(m)!;
  let p = newProfile(m, c, 5);
  assert.equal(c.tutorials!.length, 6);
  const a = finishTutorial(c, p, 'basics');
  assert.equal(a.profile.currency, 10);
  assert.ok(tutorialDone(a.profile, 'basics'));
  const b = finishTutorial(c, a.profile, 'basics');
  assert.equal(b.granted, null);
  assert.equal(b.profile.currency, 10);
  p = b.profile;
  for (const t of c.tutorials!) p = finishTutorial(c, p, t.id).profile;
  assert.equal(p.currency, 60, '10 Marks for each of the six tutorials');
});
