// Script Lab import/export: bundles round-trip, merge and replace behave, bad files are rejected with a reason.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, exportScripts, fromBlueprint, importScripts, readScripts } from '#maker';

const scripted = () => {
  const bp = fromBlueprint('blank');
  bp.advanced = {
    rules: { turnLimit: 90, gameVars: { doom: 0 } },
    triggers: [{ on: 'turnStart', if: ['>=', '$turn', 3], do: [['inc', 'game', 'doom', 1]] }],
    functions: { double: { params: ['$x'], body: ['*', '$x', 2] } },
    procedures: { chaos: { params: [], do: [['each', ['players'], '$p', [['draw', '$p', 1]]]] } },
  };
  bp.cards[0].raw = { text: 'Patched.' };
  return bp;
};

test('scripts: export then import into a fresh game reproduces every part and still builds', () => {
  const src = scripted();
  const file = JSON.parse(JSON.stringify(exportScripts(src)));
  assert.equal(file.format, 'ucb-script');
  const dst = fromBlueprint('blank');
  const report = importScripts(dst, readScripts(file));
  assert.deepEqual(dst.advanced, src.advanced);
  assert.deepEqual(dst.cards[0].raw, { text: 'Patched.' });
  assert.ok(report.some((l) => /1 trigger added/.test(l)), report.join('\n'));
  assert.ok(build(dst).mod, build(dst).problems.map((p) => p.text).join('; '));
  assert.deepEqual(Object.keys(exportScripts(src, ['triggers']).advanced), ['triggers']);
});

test('scripts: merge adds and deep-merges, skips duplicate triggers; replace swaps only the parts in the file', () => {
  const dst = scripted();
  const extra = readScripts({ rules: { gameVars: { hope: 1 } }, triggers: [dst.advanced!.triggers![0], { on: 'turnEnd', do: [] }], functions: { double: { params: ['$x'], body: ['+', '$x', '$x'] }, half: { params: ['$x'], body: ['/', '$x', 2] } }, cards: { nope: { text: 'x' } } });
  const report = importScripts(dst, extra, 'merge');
  assert.deepEqual((dst.advanced!.rules as any).gameVars, { doom: 0, hope: 1 });
  assert.equal((dst.advanced!.rules as any).turnLimit, 90);
  assert.equal(dst.advanced!.triggers!.length, 2);
  assert.deepEqual(Object.keys(dst.advanced!.functions!).sort(), ['double', 'half']);
  assert.ok(report.some((l) => /1 already there/.test(l)) && report.some((l) => /replaced \(double\)/.test(l)) && report.some((l) => /nope/.test(l)), report.join('\n'));
  const rep = scripted();
  importScripts(rep, readScripts({ triggers: [{ on: 'turnEnd', do: [] }] }), 'replace');
  assert.deepEqual(rep.advanced!.triggers, [{ on: 'turnEnd', do: [] }]);
  assert.ok(rep.advanced!.functions?.double, 'parts missing from the file are kept');
});

test('scripts: bad files are rejected with a readable reason', () => {
  for (const [bad, why] of [[[], /JSON object/], [{ hello: 1 }, /not a Script Lab file/], [{ triggers: [{ do: [] }] }, /needs "on"/], [{ functions: { f: { params: [] } } }, /needs "body"/],
    [{ format: 'ucb-script', v: 2, advanced: {} }, /newer/], [{ rules: [] }, /"rules" must be an object/]] as const)
    assert.throws(() => readScripts(bad), why as RegExp);
});

test('script library: every starter script is valid, builds on a blank game and plays to a finish; entries describe their parts', async () => {
  const { STARTER_SCRIPTS, libraryEntry } = await import('#maker');
  const { createMatch } = await import('#engine');
  const { makeAgent } = await import('#ai');
  const { playMatch } = await import('#harness');
  for (const s of STARTER_SCRIPTS) {
    const bp = fromBlueprint('blank');
    importScripts(bp, readScripts(JSON.parse(JSON.stringify(s.bundle))));
    const { mod, problems } = build(bp);
    assert.ok(mod, `${s.id}: ${problems.map((p) => p.text).join('; ')}`);
    const ids = Object.keys(mod!.decks!);
    const g = playMatch(createMatch(mod!, { decks: [ids[0], ids[1 % ids.length]].map((d) => structuredClone(mod!.decks![d])), seed: 2 }), [makeAgent('heuristic', 2), makeAgent('heuristic', 3)]);
    assert.ok(g.s.result, `${s.id} finishes`);
  }
  const e = libraryEntry('My Rules!', exportScripts(scripted()), new Date(0));
  assert.equal(e.id, 'my-rules-0');
  assert.match(e.desc, /rules patch, 1 trigger\(s\), functions, procedures, card patches/);
});
