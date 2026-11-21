import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ModuleDef } from '#engine';
import { commitAction, compileModule, createMatch, isRange, restore, satisfies, ScriptError, serialize } from '#engine';
import { loadPackage, PackageError, packFiles, readZip, writeZip } from '#sdk';
import { readDirFiles } from '#sdk/node';
import { loadRef, readModuleDir, REF_DIR } from '#harness';
import { place } from './helpers.ts';

const te = new TextEncoder();
const td = new TextDecoder();
const enc = (o: unknown) => te.encode(typeof o === 'string' ? o : JSON.stringify(o, null, 2));
const spark = () => readDirFiles(`${REF_DIR}/spark-duel`);
const rejects = (p: Promise<unknown>, re: RegExp) =>
  assert.rejects(p, (e: unknown) => e instanceof PackageError && re.test(e.errors.join('\n')) || assert.fail(String(e)));
const withFile = (files: Map<string, Uint8Array>, name: string, data: unknown) => new Map(files).set(name, enc(data));
const editText = (files: Map<string, Uint8Array>, name: string, from: string, to: string) => {
  const t = td.decode(files.get(name)!);
  assert.ok(t.includes(from), `${name} contains ${from}`);
  return withFile(files, name, t.replace(from, to));
};

test('semver ranges', () => {
  assert.ok(satisfies('0.3.1', '^0.3.0') && !satisfies('0.4.0', '^0.3.0'));
  assert.ok(satisfies('1.9.0', '^1.0.0') && !satisfies('2.0.0', '^1.0.0'));
  assert.ok(satisfies('1.2.9', '~1.2.0') && !satisfies('1.3.0', '~1.2.0'));
  assert.ok(satisfies('1.0.0', '>=0.5.0 <2.0.0') && !satisfies('2.0.0', '>=0.5.0 <2.0.0'));
  assert.ok(!isRange('^x') && isRange('*'));
});

test('reference modules round-trip: folder -> pack -> zip -> load', async () => {
  for (const id of ['spark-duel', 'arcane-duel']) {
    const zip = await packFiles(await readDirFiles(`${REF_DIR}/${id}`));
    const pkg = await loadPackage(await readZip(zip));
    const src = readModuleDir(`${REF_DIR}/${id}`);
    assert.deepEqual([pkg.def.rules, pkg.def.cards, pkg.def.decks], [src.rules, src.cards, src.decks]);
    assert.equal(pkg.mod.hash, loadRef(id).hash);
    assert.deepEqual(pkg.warnings, []);
    assert.equal(Object.keys(pkg.def.manifest.contentHashes!).length, 3);
  }
  assert.match((await loadPackage(await spark())).warnings.join(), /no contentHashes/);
});

test('hostile archives are rejected', async () => {
  const d = enc('{}');
  const zip = (e: Parameters<typeof writeZip>[0]) => writeZip(e);
  await rejects(readZip(await zip([{ name: '../evil.json', data: d }])), /path traversal/);
  await rejects(readZip(await zip([{ name: '/etc/passwd', data: d }])), /absolute path/);
  await rejects(readZip(await zip([{ name: 'a\\b.json', data: d }])), /backslash/);
  await rejects(readZip(await zip([{ name: 'rules.json', data: enc('/etc/passwd'), unixMode: 0o120777 }])), /symbolic links/);
  await rejects(readZip(await zip([{ name: 'rules.json', data: d, flags: 0x0801 }])), /encrypted/);
  await rejects(readZip(await zip([{ name: 'rules.json', data: d, deflate: false, method: 12 }])), /unsupported compression method 12/);
  await rejects(readZip(await zip([{ name: 'cards.json', data: new Uint8Array(4 << 20) }])), /zip bomb/);
  await rejects(readZip(await zip([{ name: 'cards.json', data: new Uint8Array(200_000), declaredSize: 1000 }])), /beyond its declared size/);
  await rejects(readZip(await zip([0, 1, 2].map((i) => ({ name: `cards/${i}.json`, data: new Uint8Array(600_000) }))), { maxTotal: 1 << 20, maxRatio: 1e9 }), /exceeds 1048576 bytes/);
  await rejects(readZip(await zip([0, 1, 2].map((i) => ({ name: `cards/${i}.json`, data: d }))), { maxEntries: 2 }), /too many entries/);
  const ok = await zip([{ name: 'rules.json', data: enc('{"a": 1}'), deflate: false }]);
  ok[30 + 'rules.json'.length + 2] ^= 0xff;
  await rejects(readZip(ok), /CRC mismatch/);
  await rejects(readZip(te.encode('definitely not a zip file, just text padding padding')), /not a ZIP/);
});

test('package rules: layout, engine range, capabilities, hashes, assets, unsafe JSON', async () => {
  const f = await spark();
  const mf = JSON.parse(td.decode(f.get('manifest.json')!));
  await rejects(loadPackage(withFile(f, 'evil.exe', 'x')), /"evil.exe": unexpected file/);
  const noMf = new Map(f);
  noMf.delete('manifest.json');
  await rejects(loadPackage(noMf), /manifest.json is missing/);
  await rejects(loadPackage(withFile(f, 'manifest.json', { ...mf, engineApiRange: '^9.0.0' })), /requires engine \^9.0.0/);
  await rejects(loadPackage(withFile(f, 'manifest.json', { ...mf, requiredCapabilities: ['teleportation'] })), /unknown capability "teleportation"/);
  const packed = await readZip(await packFiles(f));
  await rejects(loadPackage(editText(packed, 'cards.json', '"power": 2', '"power": 9')), /"cards.json": content hash mismatch/);
  await rejects(loadPackage(withFile(packed, 'cards/extra.json', [])), /"cards\/extra.json": not covered/);
  await rejects(loadPackage(withFile(f, 'assets/x.svg', '<svg/>')), /not an allowed asset type/);
  await rejects(loadPackage(withFile(f, 'assets/x.png', 'pngpngpng'), { limits: { maxAsset: 4 } }), /exceeds the asset limit/);
  await rejects(loadPackage(editText(f, 'cards.json', '"id": "ember-pup",', '"id": "ember-pup", "art": "assets/pup.png",')), /missing asset "assets\/pup.png"/);
  await rejects(loadPackage(editText(f, 'rules.json', '"turnLimit": 80,', '"turnLimit": 80, "__proto__": {"x": 1},')), /forbidden key "__proto__"/);
  await rejects(loadPackage(editText(f, 'rules.json', '"turnLimit": 80,', '"turnLimit": 80, "turnLimit": 9,')), /duplicate key "turnLimit"/);
  const art = editText(withFile(f, 'assets/pup.png', 'png'), 'cards.json', '"id": "ember-pup",', '"id": "ember-pup", "art": "assets/pup.png",');
  assert.equal((await loadPackage(art)).assets.get('assets/pup.png')!.mime, 'image/png');
});

test('errors point at file:line:col, including split card files and JSON syntax', async () => {
  const f = await spark();
  const bad = editText(f, 'rules.json', '"do": [["move", "$self", "board"]]', '"do": [["teleport", "$self", "board"]]');
  const text = td.decode(bad.get('rules.json')!);
  const at = text.indexOf('"teleport"');
  const line = text.slice(0, at).split('\n').length;
  const col = at - text.lastIndexOf('\n', at - 1);
  await rejects(loadPackage(bad), new RegExp(`^rules\\.json:${line}:${col}: unknown effect op "teleport"$`, 'm'));
  const cards = JSON.parse(td.decode(f.get('cards.json')!));
  const split = new Map(f);
  split.delete('cards.json');
  split.set('cards/a.json', enc(cards.slice(0, 10)));
  split.set('cards/b.json', enc([...cards.slice(10), { id: 'broken', name: 'Broken' }]));
  await rejects(loadPackage(split), /^cards\/b\.json:\d+:\d+: broken: id, name and type are required strings$/m);
  split.set('cards/b.json', enc(cards.slice(10)));
  assert.equal((await loadPackage(split)).def.cards.length, 19);
  await rejects(loadPackage(editText(f, 'rules.json', '"turnLimit": 80,', '"turnLimit": 80,,')), /^rules\.json:\d+:\d+: invalid JSON \(expected a property name\)$/m);
});

test('scripts: functions and procedures from scripts/*.json, arity checks, gas and depth limits', async () => {
  const f = await spark();
  const scripts = {
    functions: { twice: { params: ['$x'], body: ['*', '$x', 2] } },
    procedures: { zap: { params: ['$t', '$n'], do: [['damage', '$t', ['call', 'twice', '$n'], '$self']] } },
  };
  const boltFx = '"effects": [["damage", "$t", 2, "$self"]]';
  const pkg = await loadPackage(editText(withFile(f, 'scripts/zap.json', scripts), 'cards.json', boltFx, '"effects": [["call", "zap", "$t", 2]]'));
  let g = createMatch(pkg.mod, { decks: [(pkg.def.decks!['ember-rush'] as string[]), (pkg.def.decks!['stone-ward'] as string[])], seed: 3 });
  g.s.players[0].vars.energy = 5;
  const bolt = place(g, 'p0', 'spark-bolt', 'hand');
  g = commitAction(g, 'p0', { action: 'cast', source: bolt, targets: { $t: ['p1'] } });
  assert.equal(g.s.players[1].vars.life, 16);
  await rejects(loadPackage(editText(withFile(f, 'scripts/zap.json', scripts), 'cards.json', boltFx, '"effects": [["call", "zap", "$t"]]')),
    /cards\.json:\d+:\d+: spark-bolt: procedure "zap" takes 2 argument\(s\), got 1/);
  await rejects(loadPackage(editText(f, 'cards.json', boltFx, '"effects": [["call", "nope"]]')), /unknown procedure "nope"/);

  const base = readModuleDir(`${REF_DIR}/spark-duel`);
  const run = (fns: Record<string, unknown>, expr: unknown) => {
    const d: ModuleDef = structuredClone(base);
    d.rules.functions = fns as any;
    d.cards.find((c) => c.id === 'spark-bolt')!.effects = [['damage', '$t', expr, '$self']];
    const M = compileModule(d);
    const m0 = createMatch(M, { decks: [(d.decks!['ember-rush'] as string[]), (d.decks!['stone-ward'] as string[])], seed: 3 });
    m0.s.players[0].vars.energy = 5;
    const b = place(m0, 'p0', 'spark-bolt', 'hand');
    const before = serialize(m0);
    assert.throws(() => commitAction(m0, 'p0', { action: 'cast', source: b, targets: { $t: ['p1'] } }), ScriptError);
    assert.equal(serialize(m0), before, 'failed script leaves the match unchanged');
  };
  run({ deep: { params: ['$n'], body: ['call', 'deep', ['+', '$n', 1]] } }, ['call', 'deep', 0]);
  run({ fib: { params: ['$n'], body: ['?', ['<', '$n', 2], '$n', ['+', ['call', 'fib', ['-', '$n', 1]], ['call', 'fib', ['-', '$n', 2]]]] } }, ['call', 'fib', 30]);
});

test('expansions extend a base module; saves are pinned to the rules hash', async () => {
  const base = readModuleDir(`${REF_DIR}/spark-duel`);
  const deck = [...(base.decks!['ember-rush'] as string[]).slice(1), 'kindle-imp'];
  const exp = new Map<string, Uint8Array>([
    ['manifest.json', enc({ moduleId: 'spark-embers', displayName: 'Spark Duel: Embers', semanticVersion: '0.1.0', engineApiRange: '^0.3.0', extends: { moduleId: 'spark-duel', range: '^0.1.0' } })],
    ['cards.json', enc([{ id: 'kindle-imp', name: 'Kindle Imp', type: 'unit', cost: 1, power: 1, health: 2 }])],
    ['decks.json', enc({ 'imp-rush': deck })],
  ]);
  const pkg = await loadPackage(exp, { base });
  assert.ok(pkg.mod.card.has('kindle-imp') && pkg.mod.card.has('ember-pup'));
  assert.ok(createMatch(pkg.mod, { decks: [deck, (base.decks!['stone-ward'] as string[])], seed: 1 }).s.zones['p0:hand'].length === 4);
  await rejects(loadPackage(exp), /requires base module spark-duel@\^0.1.0/);
  await rejects(loadPackage(exp, { base: { ...base, manifest: { ...base.manifest, semanticVersion: '0.2.0' } } }), /got spark-duel@0.2.0/);
  await rejects(loadPackage(withFile(exp, 'cards.json', [{ id: 'ember-pup', name: 'Dupe', type: 'unit' }]), { base }), /^cards\.json:\d+:\d+: ember-pup: duplicate card id$/m);
  await rejects(loadPackage(withFile(exp, 'rules.json', {}), { base }), /an expansion cannot contain rules/);

  const M = loadRef('spark-duel');
  const save = serialize(createMatch(M, { decks: [(base.decks!['ember-rush'] as string[]), (base.decks!['stone-ward'] as string[])], seed: 1 }));
  const changed = structuredClone(base);
  changed.cards[0].power = 9;
  assert.throws(() => restore(compileModule(changed), save), /hash mismatch/);
  assert.ok(restore(M, save));
});
