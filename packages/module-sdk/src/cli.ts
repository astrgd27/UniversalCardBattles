// npm run -s validate <dir|zip> [--base <dir|zip>]     npm run -s pack <dir> [out.zip]
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { PackageError } from '#sdk';
import { loadAny, packDir } from '#sdk/node';

const [cmd, path, ...rest] = process.argv.slice(2);
const flag = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
try {
  if (cmd === 'validate' && path) {
    const b = flag('--base');
    const base = b ? (await loadAny(b)).def : undefined;
    const p = await loadAny(path, { base });
    const mf = p.def.manifest;
    console.log(`OK ${mf.moduleId}@${mf.semanticVersion} cards=${p.def.cards.length} decks=${Object.keys(p.def.decks ?? {}).length} assets=${p.assets.size} hash=${p.hash.slice(0, 16)}`);
    for (const w of p.warnings) console.log(`warning: ${w}`);
  } else if (cmd === 'pack' && path) {
    const zip = await packDir(path);
    const out = rest[0] && !rest[0].startsWith('--') ? rest[0] : `${basename(path.replace(/\/$/, ''))}.zip`;
    await writeFile(out, zip);
    const p = await loadAny(out);
    console.log(`packed ${out} (${zip.length} bytes, ${p.files.length} files) hash=${p.hash.slice(0, 16)}`);
  } else {
    console.log('usage: validate <dir|zip> [--base <dir|zip>] | pack <dir> [out.zip]');
    process.exitCode = 2;
  }
} catch (e) {
  if (!(e instanceof PackageError)) throw e;
  for (const x of e.errors) console.log(x);
  process.exitCode = 1;
}
