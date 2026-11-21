// Reference modules bundled at build time; more can be loaded from .zip packages at runtime.
import type { Mod } from '#engine';
import { compileModule } from '#engine';
import { loadPackage, readZip } from '#sdk';

const files = import.meta.glob(['../../../packages/reference-games/*/*.json', '../../../packages/reference-games/*/ai/ai.json'], { eager: true, import: 'default' }) as Record<string, any>;
export const MODULES = new Map<string, Mod>();
const byId: Record<string, Record<string, any>> = {};
for (const [path, data] of Object.entries(files)) {
  const m = path.match(/reference-games\/([^/]+)\/(?:ai\/)?([a-z]+)\.json$/);
  if (m) (byId[m[1]] ??= {})[m[2]] = data;
}
for (const [id, d] of Object.entries(byId)) {
  MODULES.set(id, compileModule({ manifest: d.manifest, rules: d.rules, cards: d.cards, decks: d.decks ?? {}, ...(d.ai ? { ai: d.ai } : {}) }));
}

/** Loads a module package (.zip) chosen by the user. Throws PackageError with file:line:col messages. */
export async function loadZipModule(file: File): Promise<Mod> {
  const pkg = await loadPackage(await readZip(new Uint8Array(await file.arrayBuffer())));
  MODULES.set(pkg.mod.manifest.moduleId, pkg.mod);
  return pkg.mod;
}
