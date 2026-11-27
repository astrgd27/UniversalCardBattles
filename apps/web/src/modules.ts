// Default modules (packages/modules) bundled at build time; more can be loaded from .zip packages at runtime.
import type { Mod } from '#engine';
import { compileModule } from '#engine';
import { loadPackage, readZip } from '#sdk';

const files = import.meta.glob(['../../../packages/modules/*/*.json', '../../../packages/modules/*/ai/ai.json', '../../../packages/modules/*/campaign/campaign.json'], { eager: true, import: 'default' }) as Record<string, any>;
// Images bundled with the built-in modules (packages/modules/<id>/assets/**), served as hashed files.
const images = import.meta.glob('../../../packages/modules/*/assets/**/*.{png,jpg,jpeg,webp,avif}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const MODULES = new Map<string, Mod>();
/** Asset URLs by module: moduleId -> package path ("assets/...") -> url. Bundled modules and loaded packages alike. */
export const ASSETS = new Map<string, Map<string, string>>();
for (const [path, url] of Object.entries(images)) {
  const m = path.match(/modules\/([^/]+)\/(assets\/.+)$/);
  if (m) { if (!ASSETS.has(m[1])) ASSETS.set(m[1], new Map()); ASSETS.get(m[1])!.set(m[2], url); }
}
const IMG = ['webp', 'png', 'jpg', 'jpeg', 'avif'];
/** An asset by explicit path, or by convention ("assets/cards/<card id>.<ext>", "assets/back.<ext>"). */
export function assetUrl(moduleId: string, path: string | undefined, conventional?: string): string | undefined {
  const a = ASSETS.get(moduleId);
  if (!a) return undefined;
  if (path && a.has(path)) return a.get(path);
  if (conventional) for (const e of IMG) { const u = a.get(`${conventional}.${e}`); if (u) return u; }
  return undefined;
}
const byId: Record<string, Record<string, any>> = {};
for (const [path, data] of Object.entries(files)) {
  const m = path.match(/modules\/([^/]+)\/(?:ai\/|campaign\/)?([a-z]+)\.json$/);
  if (m) (byId[m[1]] ??= {})[m[2]] = data;
}
for (const [id, d] of Object.entries(byId)) {
  MODULES.set(id, compileModule({ manifest: d.manifest, rules: d.rules, cards: d.cards, decks: d.decks ?? {}, ...(d.ai ? { ai: d.ai } : {}), ...(d.campaign ? { campaign: d.campaign } : {}) }));
}

/** Loads a module package (.zip) chosen by the user. Throws PackageError with file:line:col messages. */
export async function loadZipModule(file: File): Promise<Mod> {
  const pkg = await loadPackage(await readZip(new Uint8Array(await file.arrayBuffer())));
  MODULES.set(pkg.mod.manifest.moduleId, pkg.mod);
  ASSETS.set(pkg.mod.manifest.moduleId, new Map([...pkg.assets].map(([p, a]) => [p, URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime }))])));
  return pkg.mod;
}
