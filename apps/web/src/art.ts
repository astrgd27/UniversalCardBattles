// Card art: user-supplied images (IndexedDB) > package assets > procedural SVG generated from the card id.
import type { CardDef } from '#engine';
import { hash, rand, randInt, seedRng } from '#engine';

// ---------- custom art stored in the browser ----------
const DB = 'ucb-art';
const STORE = 'art';
export const MAX_ART_BYTES = 3 << 20;
export const ART_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const custom = new Map<string, string>(); // "module/card" -> object URL

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fail) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/** Loads all custom art of a module into object URLs. Silently does nothing if IndexedDB is unavailable. */
export async function loadCustomArt(moduleId: string): Promise<void> {
  try {
    const keys = (await tx('readonly', (s) => s.getAllKeys())) as string[];
    for (const k of keys.filter((x) => x.startsWith(`${moduleId}/`))) {
      const blob = (await tx('readonly', (s) => s.get(k))) as Blob | undefined;
      if (blob) { const old = custom.get(k); if (old) URL.revokeObjectURL(old); custom.set(k, URL.createObjectURL(blob)); }
    }
  } catch { /* private mode or blocked storage: procedural art only */ }
}
export async function setCustomArt(moduleId: string, cardId: string, file: File): Promise<void> {
  if (!ART_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG, WebP or GIF image.');
  if (file.size > MAX_ART_BYTES) throw new Error(`Images must be under ${MAX_ART_BYTES >> 20} MB.`);
  const k = `${moduleId}/${cardId}`;
  await tx('readwrite', (s) => s.put(file.slice(0, file.size, file.type), k));
  const old = custom.get(k);
  if (old) URL.revokeObjectURL(old);
  custom.set(k, URL.createObjectURL(file));
}
export async function clearCustomArt(moduleId: string, cardId: string): Promise<void> {
  const k = `${moduleId}/${cardId}`;
  await tx('readwrite', (s) => s.delete(k));
  const old = custom.get(k);
  if (old) URL.revokeObjectURL(old);
  custom.delete(k);
}
export const customArt = (moduleId: string, cardId: string) => custom.get(`${moduleId}/${cardId}`);

// ---------- procedural art ----------
const cache = new Map<string, string>();
export const hueOf = (s: string) => parseInt(hash(s).slice(0, 6), 16) % 360;

/** A deterministic, original SVG illustration for a card: a lit backdrop, a motif chosen by the id, and the type glyph. */
export function procArt(def: CardDef, glyph: string): string {
  const key = `${def.id}|${glyph}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = seedRng(parseInt(hash(def.id), 16));
  const f = () => rand(r);
  const h = hueOf(def.id);
  const h2 = (h + 25 + Math.floor(f() * 70)) % 360;
  const p = (n: number) => n.toFixed(1);
  const layers: string[] = [];
  const variant = randInt(r, 3);
  if (variant === 0) {
    for (let i = 0; i < 3; i++) {
      const base = 38 + i * 11;
      let d = `M0 70 L0 ${p(base + f() * 8)}`;
      for (let x = 10; x <= 100; x += 10) d += ` L${x} ${p(base - f() * (16 - i * 4))}`;
      layers.push(`<path d="${d} L100 70 Z" fill="hsl(${h2} ${45 - i * 8}% ${26 - i * 6}%)" opacity="${0.75 + i * 0.1}"/>`);
    }
  } else if (variant === 1) {
    const cx = 30 + f() * 40;
    const cy = 30 + f() * 15;
    for (let i = 6; i > 0; i--) layers.push(`<circle cx="${p(cx)}" cy="${p(cy)}" r="${i * 7}" fill="none" stroke="hsl(${(h2 + i * 12) % 360} 80% ${45 + i * 4}%)" stroke-width="${p(1 + f() * 2.5)}" opacity="${p(0.25 + i * 0.08)}"/>`);
  } else {
    for (let i = 0; i < 9; i++) {
      const x = f() * 100;
      const y = 20 + f() * 50;
      const s = 8 + f() * 18;
      layers.push(`<path d="M${p(x)} ${p(y - s)} L${p(x + s * 0.6)} ${p(y + s * 0.4)} L${p(x - s * 0.6)} ${p(y + s * 0.4)} Z" fill="hsl(${(h2 + i * 9) % 360} 70% ${30 + f() * 30}%)" opacity="${p(0.45 + f() * 0.4)}"/>`);
    }
  }
  const stars = Array.from({ length: 14 }, () => `<circle cx="${p(f() * 100)}" cy="${p(f() * 40)}" r="${p(0.3 + f() * 0.8)}" fill="#fff" opacity="${p(0.3 + f() * 0.6)}"/>`).join('');
  const sun = `<circle cx="${p(15 + f() * 70)}" cy="${p(10 + f() * 18)}" r="${p(8 + f() * 8)}" fill="url(#s)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 60%)"/><stop offset="1" stop-color="hsl(${h2} 60% 20%)"/></linearGradient>`
    + `<radialGradient id="s"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>`
    + `<rect width="100" height="70" fill="url(#g)"/>${stars}${sun}${layers.join('')}`
    + `<text x="50" y="47" font-size="26" text-anchor="middle" fill="#fff" opacity=".93" font-family="system-ui, sans-serif" stroke="rgba(0,0,0,.35)" stroke-width=".8">${glyph}</text>`
    + `<rect width="100" height="70" fill="url(#v)"/></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}
