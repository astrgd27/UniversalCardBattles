// Node-only helpers: read a module folder or .zip from disk.
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPackage, packFiles, PackageError, readZip, type LoadOptions } from '#sdk';

export async function readDirFiles(dir: string): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const walk = async (rel: string) => {
    for (const ent of await readdir(join(dir, rel))) {
      if (ent.startsWith('.')) continue;
      const r = rel ? `${rel}/${ent}` : ent;
      const st = await lstat(join(dir, r));
      if (st.isSymbolicLink()) throw new PackageError([`"${r}": symbolic links are not allowed`]);
      if (st.isDirectory()) await walk(r);
      else out.set(r, new Uint8Array(await readFile(join(dir, r))));
    }
  };
  await walk('');
  return out;
}
export const readAny = async (path: string) => (path.endsWith('.zip') ? readZip(new Uint8Array(await readFile(path))) : readDirFiles(path));
export const loadAny = async (path: string, opts?: LoadOptions) => loadPackage(await readAny(path), opts);
export const packDir = async (dir: string) => packFiles(await readDirFiles(dir));
