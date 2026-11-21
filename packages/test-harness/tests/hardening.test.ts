import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ModuleDef } from '#engine';
import { compileModule, createMatch, invalidate, observe, rand, randInt, seedRng, validateIssues } from '#engine';
import { type Campaign, CampaignError, campaignOf, migrateProfile, newProfile, validateCampaign } from '#campaign';
import { PackageError, loadPackage, packFiles, parseJson, readZip } from '#sdk';
import { readDirFiles } from '#sdk/node';
import { REF_DIR, loadRef, readModuleDir } from '#harness';
import { makeBackup, readBackup } from '../../../apps/web/src/backup.ts';

const rng = seedRng(20261121);
const pick = <T>(a: T[]) => a[randInt(rng, a.length)];
const JUNK: unknown[] = [null, 0, -1, 1e309, 'x', '', '$me', true, [], {}, [['draw']], ['cards', '*', 'nope'], { as: 7 }, [null], NaN];
const onlyThrows = (fn: () => unknown, ok: (e: unknown) => boolean, what: string) => {
  try { fn(); } catch (e) { assert.ok(ok(e), `${what}: unexpected ${String(e)}`); }
};
/** Replaces one random node of a JSON-like value with junk. */
function mutate(v: any, depth = 0): any {
  if (depth > 8 || v === null || typeof v !== 'object' || rand(rng) < 0.12) return pick(JUNK);
  const c: any = Array.isArray(v) ? [...v] : { ...v };
  const keys = Object.keys(c);
  if (!keys.length) return pick(JUNK);
  const k = pick(keys);
  c[k] = mutate(c[k], depth + 1);
  return c;
}

test('fuzz: the JSON parser only ever throws PackageError', () => {
  const text = readFileSync(`${REF_DIR}/arcane-duel/rules.json`, 'utf8');
  for (let i = 0; i < 400; i++) {
    let t = text;
    for (let k = 0; k < 1 + randInt(rng, 4); k++) {
      const at = randInt(rng, t.length);
      t = t.slice(0, at) + pick(['', '{', '}', '[', '"', ',', ':', '\\', '\u0000', 'tru', '-', '1e', '__proto__', '\n']) + t.slice(at + randInt(rng, 3));
    }
    onlyThrows(() => parseJson(t, 'f.json'), (e) => e instanceof PackageError, 'parseJson');
  }
  assert.throws(() => parseJson('['.repeat(5000), 'deep.json'), /nesting too deep/);
});

test('fuzz: the validator never crashes on malformed modules', () => {
  const base = readModuleDir(`${REF_DIR}/relic-chain`);
  for (let i = 0; i < 600; i++) {
    const def = mutate(base) as ModuleDef;
    const issues = validateIssues(def);
    assert.ok(Array.isArray(issues));
  }
});

test('fuzz: corrupted ZIPs and packages fail cleanly', async () => {
  const zip = await packFiles(await readDirFiles(`${REF_DIR}/spark-duel`));
  for (let i = 0; i < 150; i++) {
    const z = zip.slice();
    for (let k = 0; k < 1 + randInt(rng, 6); k++) z[randInt(rng, z.length)] = randInt(rng, 256);
    try {
      await loadPackage(await readZip(z));
    } catch (e) {
      assert.ok(e instanceof PackageError, `zip: unexpected ${String(e)}`);
    }
  }
  const files = await readDirFiles(`${REF_DIR}/spark-duel`);
  const camp = JSON.parse(new TextDecoder().decode(files.get('campaign/campaign.json')!));
  for (let i = 0; i < 150; i++) {
    const f = new Map(files).set('campaign/campaign.json', new TextEncoder().encode(JSON.stringify(mutate(camp))));
    try { await loadPackage(f); } catch (e) { assert.ok(e instanceof PackageError, `campaign: unexpected ${String(e)}`); }
  }
});

test('fuzz: campaign validation and profile migration fail cleanly', () => {
  const m = loadRef('spark-duel');
  const c = campaignOf(m) as Campaign;
  for (let i = 0; i < 400; i++) assert.ok(Array.isArray(validateCampaign(m, mutate(c))));
  const p = newProfile(m, c, 1);
  for (let i = 0; i < 400; i++) onlyThrows(() => migrateProfile(mutate(p)), (e) => e instanceof CampaignError, 'migrateProfile');
  const { v: _v, bought: _b, active: _a, ...old } = p;
  assert.deepEqual(migrateProfile(old), p, 'unversioned profiles are upgraded');
  assert.throws(() => migrateProfile({ ...p, v: 99 }), /unsupported profile version 99/);
});

test('save backups: round trip, whitelist, validation, fuzzing', () => {
  const m = loadRef('spark-duel');
  const p = newProfile(m, campaignOf(m) as Campaign, 3);
  const save = { seats: ['human', 'heuristic'], decks: ['a', 'b'], state: JSON.stringify({ moduleId: 'spark-duel', rulesHash: 'x' }) };
  const b = makeBackup({ 'ucb-profile:spark-duel': p, 'ucb-decks:spark-duel': { Mine: ['mend'] }, 'ucb-save:spark-duel': save, 'ucb-theme': 'light', 'other-app': 1 });
  assert.deepEqual(Object.keys(b.entries).sort(), ['ucb-decks:spark-duel', 'ucb-profile:spark-duel', 'ucb-save:spark-duel', 'ucb-theme']);
  const r = readBackup(JSON.stringify(b));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.entries, b.entries);
  const evil = JSON.stringify({ ...b, entries: { ...b.entries, 'ucb-profile:x': { ...p, currency: -5 }, 'ucb-../etc': 1, 'ucb-decks:y': { D: [1] } } });
  const r2 = readBackup(evil);
  assert.equal(Object.keys(r2.entries).length, 4);
  assert.equal(r2.problems.length, 3);
  assert.match(readBackup('{"app": "other"}').problems.join(), /not a Universal Card Battles save backup/);
  assert.match(readBackup('{"__proto__": {}}').problems.join(), /forbidden key/);
  assert.match(readBackup('x'.repeat((5 << 20) + 1)).problems.join(), /larger than 5 MB/);
  const text = JSON.stringify(b);
  for (let i = 0; i < 300; i++) {
    const at = randInt(rng, text.length);
    const t = text.slice(0, at) + pick(['"', '{', '1', ']', ',', 'null']) + text.slice(at + 1);
    const out = readBackup(t);
    assert.ok(Array.isArray(out.problems));
  }
  for (let i = 0; i < 200; i++) assert.ok(Array.isArray(readBackup(JSON.stringify(mutate(b))).problems));
});

test('performance: a 160-object board with 48 statics stays interactive', () => {
  const m = loadRef('arcane-duel');
  const deck = m.decks!['grove-host'] as string[];
  const big = Array.from({ length: 80 }, (_, i) => deck[i % deck.length]);
  const M = compileModule({ ...m, rules: { ...m.rules, format: { ...m.rules.format, deckMin: 0, deckMax: 999, maxCopies: 99 } } });
  const g = createMatch(M, { decks: [big, [...big]], seed: 1 });
  for (const p of ['p0', 'p1']) {
    const ids = g.s.zones[`${p}:deck`].splice(0, 50);
    for (const id of ids) { g.s.objects[id].zone = `${p}:board`; g.s.objects[id].vars.growth = 1; }
    g.s.zones[`${p}:board`].push(...ids);
  }
  invalidate(g.s);
  const t = performance.now();
  for (let i = 0; i < 5; i++) { invalidate(g.s); observe(g, 'p0'); }
  const ms = (performance.now() - t) / 5;
  assert.ok(ms < 250, `observe took ${ms.toFixed(0)} ms`);
});
