// Module packages: layout rules, manifest/engine/capability checks, content hashes, assets, expansions,
// and validation errors mapped back to file:line:col.
import type { Issue, Mod, ModuleDef } from '#engine';
import { CAPABILITIES, ENGINE_API, compileModule, satisfies, validateIssues } from '#engine';
import { lineCol, parseJson, type Parsed } from './json.ts';
import { PackageError, ZIP_LIMITS, checkPath, writeZip, type ZipLimits } from './zip.ts';

export interface PackageLimits extends ZipLimits { maxAsset: number }
export const PACKAGE_LIMITS: PackageLimits = { ...ZIP_LIMITS, maxAsset: 4 << 20 };
export const ASSET_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', woff2: 'font/woff2', txt: 'text/plain', json: 'application/json',
};
const ROOT = /^(manifest|rules|cards|decks)\.json$|^(LICENSE|README)[^/]*$/;
const SPLIT = /^(cards|decks|scripts)\/[^/]+\.json$/;
const RESERVED = /^(assets|ai|campaign|tests)\//; // assets now; ai/campaign/tests are reserved for later milestones

export interface LoadedPackage {
  def: ModuleDef;
  mod: Mod;
  hash: string; // sha256 over every file's path and sha256
  files: string[];
  assets: Map<string, { data: Uint8Array; mime: string }>;
  warnings: string[];
}
export interface LoadOptions { limits?: Partial<PackageLimits>; base?: ModuleDef }
interface Origin { file: string; ptr: string }

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (d: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', d as Uint8Array<ArrayBuffer>));
const esc = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');
const unesc = (k: string) => k.replace(/~1/g, '/').replace(/~0/g, '~');
const isRec = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);

export async function loadPackage(files: Map<string, Uint8Array>, opts: LoadOptions = {}): Promise<LoadedPackage> {
  const L = { ...PACKAGE_LIMITS, ...opts.limits };
  const names = [...files.keys()].sort();
  const errors: string[] = [];
  const warnings: string[] = [];
  const done = () => { if (errors.length) throw new PackageError(errors); };

  for (const n of names) {
    const bad = checkPath(n);
    if (bad) errors.push(`"${n}": ${bad}`);
    else if (!ROOT.test(n) && !SPLIT.test(n) && !RESERVED.test(n)) {
      errors.push(`"${n}": unexpected file (allowed: manifest/rules/cards/decks.json, cards|decks|scripts/*.json, assets/, ai/, campaign/, tests/, LICENSE, README)`);
    }
  }
  if (!files.has('manifest.json')) errors.push('manifest.json is missing');
  done();

  const td = new TextDecoder('utf-8', { fatal: true });
  const parsed = new Map<string, Parsed>();
  const json = (f: string): any => {
    if (!parsed.has(f)) {
      let text: string;
      try { text = td.decode(files.get(f)!); } catch { throw new PackageError([`${f}: not valid UTF-8`]); }
      parsed.set(f, parseJson(text, f));
    }
    return parsed.get(f)!.value;
  };
  const tryJson = (f: string): any => {
    try { return json(f); } catch (e) { if (e instanceof PackageError) { errors.push(...e.errors); return undefined; } throw e; }
  };

  // ---- manifest, engine compatibility, integrity ----
  const mf = tryJson('manifest.json');
  done();
  if (!isRec(mf)) throw new PackageError(['manifest.json: must be an object']);
  if (typeof mf.engineApiRange === 'string' && !satisfies(ENGINE_API, mf.engineApiRange)) {
    errors.push(`manifest.json: requires engine ${mf.engineApiRange}, this engine is ${ENGINE_API}`);
  }
  for (const c of Array.isArray(mf.requiredCapabilities) ? mf.requiredCapabilities : []) {
    if (!CAPABILITIES.includes(c)) errors.push(`manifest.json: unknown capability "${c}" (supported: ${CAPABILITIES.join(', ')})`);
  }
  const digests = new Map<string, string>();
  for (const n of names) digests.set(n, await sha256(files.get(n)!));
  if (isRec(mf.contentHashes)) {
    for (const [f, h] of Object.entries(mf.contentHashes)) {
      if (!files.has(f)) errors.push(`manifest.json: contentHashes lists missing file "${f}"`);
      else if (digests.get(f) !== h) errors.push(`"${f}": content hash mismatch`);
    }
    for (const n of names) if (n !== 'manifest.json' && !(n in mf.contentHashes)) errors.push(`"${n}": not covered by manifest contentHashes`);
  } else warnings.push('manifest has no contentHashes: file integrity is not verified (use `npm run pack`)');
  const pkgHash = await sha256(new TextEncoder().encode(names.map((n) => `${n}\n${digests.get(n)}\n`).join('')));

  // ---- assemble the definition ----
  const ext = mf.extends;
  const base = opts.base;
  const origins: { cards: Origin[]; decks: Record<string, Origin>; scripts: Record<string, Origin> } = { cards: [], decks: {}, scripts: {} };
  let rules: any;
  const cards: any[] = [];
  const decks: Record<string, string[]> = {};
  if (ext) {
    if (files.has('rules.json')) errors.push('rules.json: an expansion cannot contain rules (it extends its base module)');
    if (names.some((n) => n.startsWith('scripts/'))) errors.push('scripts/: an expansion cannot contain scripts');
    if (!base || base.manifest.moduleId !== ext.moduleId || !satisfies(base.manifest.semanticVersion, ext.range)) {
      errors.push(`manifest.json: requires base module ${ext.moduleId}@${ext.range}${base ? ` (got ${base.manifest.moduleId}@${base.manifest.semanticVersion})` : ''}`);
      done();
    }
    rules = base!.rules;
    base!.cards.forEach((c, i) => { cards.push(c); origins.cards.push({ file: `(base ${base!.manifest.moduleId})`, ptr: `/${i}` }); });
    Object.assign(decks, base!.decks ?? {});
  } else {
    if (!files.has('rules.json')) errors.push('rules.json is missing');
    rules = tryJson('rules.json');
  }
  const split = (kind: string) => [`${kind}.json`, ...names.filter((n) => n.startsWith(`${kind}/`))].filter((n) => files.has(n));
  for (const f of split('cards')) {
    const v = tryJson(f);
    if (v === undefined) continue;
    if (!Array.isArray(v)) { errors.push(`${f}: must be an array of cards`); continue; }
    v.forEach((c, j) => { cards.push(c); origins.cards.push({ file: f, ptr: `/${j}` }); });
  }
  for (const f of split('decks')) {
    const v = tryJson(f);
    if (v === undefined) continue;
    if (!isRec(v)) { errors.push(`${f}: must be an object of decks`); continue; }
    for (const [k, d] of Object.entries(v)) {
      if (k in decks && origins.decks[k]) errors.push(`${f}: duplicate deck "${k}"`);
      decks[k] = d as string[];
      origins.decks[k] = { file: f, ptr: `/${esc(k)}` };
    }
  }
  const scriptFiles = split('scripts');
  if (scriptFiles.length && isRec(rules)) {
    rules = { ...rules, functions: { ...rules.functions }, procedures: { ...rules.procedures } };
    for (const f of scriptFiles) {
      const v = tryJson(f);
      if (v === undefined) continue;
      if (!isRec(v)) { errors.push(`${f}: must be {functions?, procedures?}`); continue; }
      for (const kind of ['functions', 'procedures'] as const) {
        for (const [k, d] of Object.entries(isRec(v[kind]) ? v[kind] : {})) {
          if (k in rules[kind]) errors.push(`${f}: duplicate ${kind.slice(0, -1)} "${k}"`);
          rules[kind][k] = d;
          origins.scripts[`${kind}/${k}`] = { file: f, ptr: `/${kind}/${esc(k)}` };
        }
      }
    }
  }
  done();
  const ai = files.has('ai/ai.json') ? tryJson('ai/ai.json') : ext ? base!.ai : undefined;
  done();
  const def: ModuleDef = { manifest: mf as ModuleDef['manifest'], rules, cards, decks, ...(ai !== undefined ? { ai } : {}) };

  // ---- validation, mapped to file:line:col ----
  const locate = (i: Issue): string => {
    let file = 'rules.json';
    let ptr = i.ptr;
    let m: RegExpMatchArray | null;
    if (i.where === 'manifest') file = 'manifest.json';
    else if (i.where === 'cards' && (m = i.ptr.match(/^\/(\d+)(.*)$/)) && origins.cards[+m[1]]) {
      ({ file } = origins.cards[+m[1]]);
      ptr = origins.cards[+m[1]].ptr + m[2];
    } else if (i.where === 'decks' && (m = i.ptr.match(/^\/([^/]*)(.*)$/)) && origins.decks[unesc(m[1])]) {
      ({ file } = origins.decks[unesc(m[1])]);
      ptr = origins.decks[unesc(m[1])].ptr + m[2];
    } else if (i.where === 'rules' && (m = i.ptr.match(/^\/(functions|procedures)\/([^/]*)(.*)$/)) && origins.scripts[`${m[1]}/${unesc(m[2])}`]) {
      const o = origins.scripts[`${m[1]}/${unesc(m[2])}`];
      file = o.file;
      ptr = o.ptr + m[3];
    } else if (i.where === 'ai') file = 'ai/ai.json';
    else if (i.where !== 'rules') file = `${i.where}`;
    const pz = parsed.get(file);
    if (!pz) return `${file}${ptr}: ${i.msg}`;
    let p = ptr;
    while (p && !pz.pos.has(p)) p = p.slice(0, p.lastIndexOf('/'));
    const [l, c] = lineCol(pz.text, pz.pos.get(p) ?? 0);
    return `${file}:${l}:${c}: ${i.msg}`;
  };
  for (const issue of validateIssues(def)) errors.push(locate(issue));

  // ---- assets ----
  const assets = new Map<string, { data: Uint8Array; mime: string }>();
  for (const n of names.filter((x) => x.startsWith('assets/'))) {
    const mime = ASSET_TYPES[n.slice(n.lastIndexOf('.') + 1).toLowerCase()];
    const data = files.get(n)!;
    if (!mime) errors.push(`"${n}": not an allowed asset type (${Object.keys(ASSET_TYPES).join(', ')})`);
    else if (data.length > L.maxAsset) errors.push(`"${n}": ${data.length} bytes exceeds the asset limit of ${L.maxAsset}`);
    else assets.set(n, { data, mime });
  }
  cards.forEach((c, i) => {
    if (isRec(c) && typeof c.art === 'string' && !assets.has(c.art) && !origins.cards[i].file.startsWith('(base')) {
      errors.push(locate({ where: 'cards', ptr: `/${i}/art`, msg: `${c.id}: missing asset "${c.art}"` }));
    }
  });
  done();
  return { def, mod: compileModule(def), hash: pkgHash, files: names, assets, warnings };
}

/** Builds a ZIP with manifest.contentHashes covering every other file (deterministic order). */
export async function packFiles(files: Map<string, Uint8Array>): Promise<Uint8Array> {
  const names = [...files.keys()].filter((n) => n !== 'manifest.json').sort();
  const mfBytes = files.get('manifest.json');
  if (!mfBytes) throw new PackageError(['manifest.json is missing']);
  const mf = parseJson(new TextDecoder().decode(mfBytes), 'manifest.json').value;
  mf.contentHashes = {};
  for (const n of names) mf.contentHashes[n] = await sha256(files.get(n)!);
  const manifest = new TextEncoder().encode(`${JSON.stringify(mf, null, 2)}\n`);
  return writeZip([{ name: 'manifest.json', data: manifest }, ...names.map((n) => ({ name: n, data: files.get(n)! }))]);
}
