// Browser storage for saves: IndexedDB behind a synchronous in-memory cache (UI code reads and writes synchronously,
// writes reach IndexedDB in order in the background). Falls back to localStorage when IndexedDB is unavailable.
// Also: a "sync file" (File System Access API) that mirrors every save into a file the player picks, e.g. in a
// Dropbox / OneDrive / iCloud folder, which gives cloud sync without a server.

const DB = 'ucb';
const KV = 'kv';
const META = 'meta';
type Backend = 'indexeddb' | 'localStorage' | 'memory';

const cache = new Map<string, unknown>();
let db: IDBDatabase | null = null;
let backend: Backend = 'memory';
let chain: Promise<unknown> = Promise.resolve();
let onError: (msg: string) => void = () => {};
const listeners = new Set<() => void>();

const req = <T>(r: IDBRequest<T>) => new Promise<T>((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
function tx(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<void> {
  return new Promise((ok, no) => {
    const t = db!.transaction(store, mode);
    fn(t.objectStore(store));
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
    t.onabort = () => no(t.error);
  });
}
function lsKeys(): string[] {
  const out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith('ucb-')) out.push(k); } } catch { /* unavailable */ }
  return out;
}

/** Opens storage and loads everything into memory. Moves old localStorage saves into IndexedDB once. */
export async function openStore(errors: (msg: string) => void): Promise<Backend> {
  onError = errors;
  try {
    if (!('indexedDB' in globalThis)) throw new Error('no IndexedDB');
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(KV); r.result.createObjectStore(META); };
    db = await req(r);
    const t = db.transaction(KV, 'readonly').objectStore(KV);
    const [keys, vals] = await Promise.all([req(t.getAllKeys()), req(t.getAll())]);
    keys.forEach((k, i) => cache.set(String(k), vals[i]));
    const old = lsKeys().filter((k) => !cache.has(k));
    if (old.length) {
      for (const k of old) { try { cache.set(k, JSON.parse(localStorage.getItem(k)!)); } catch { /* skip damaged */ } }
      await tx(KV, 'readwrite', (s) => { for (const k of old) if (cache.has(k)) s.put(cache.get(k), k); });
      for (const k of old) localStorage.removeItem(k);
    }
    backend = 'indexeddb';
  } catch {
    db = null;
    try {
      for (const k of lsKeys()) cache.set(k, JSON.parse(localStorage.getItem(k)!));
      backend = 'localStorage';
    } catch { backend = 'memory'; }
  }
  return backend;
}

function persistWrite(k: string, v: unknown | undefined) {
  if (backend === 'indexeddb') {
    chain = chain.then(() => tx(KV, 'readwrite', (s) => (v === undefined ? s.delete(k) : s.put(v, k))))
      .catch((e) => onError(`Could not write to browser storage: ${e?.message ?? e}`));
  } else if (backend === 'localStorage') {
    try { if (v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { onError(`Browser storage is full or unavailable: ${(e as Error).message}`); return false; }
  }
  for (const f of listeners) f();
  return true;
}

export const store = {
  get<T>(k: string, d: T): T { return cache.has(k) ? (structuredClone(cache.get(k)) as T) : d; },
  set(k: string, v: unknown): boolean { const c = JSON.parse(JSON.stringify(v)); cache.set(k, c); return persistWrite(k, c); },
  del(k: string) { if (cache.delete(k)) persistWrite(k, undefined); },
  keys(prefix = 'ucb-'): string[] { return [...cache.keys()].filter((k) => k.startsWith(prefix)).sort(); },
  all(): Record<string, unknown> { return Object.fromEntries(store.keys().map((k) => [k, store.get(k, null)])); },
  /** Resolves when every write so far has reached storage. */
  flush: () => chain.then(() => undefined),
  onChange(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  backend: () => backend,
};

/** Asks the browser not to evict our data under storage pressure. */
export async function persistStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false); } catch { return false; }
}
export async function usage(): Promise<{ used: number; quota: number } | null> {
  try { const e = await navigator.storage?.estimate?.(); return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null; } catch { return null; }
}

// ---------- sync file ----------
export const syncSupported = () => typeof (globalThis as any).showSaveFilePicker === 'function' && backend === 'indexeddb';
export interface SyncState { name: string | null; status: 'off' | 'connected' | 'reconnect' | 'error'; at: string | null; msg?: string }
export const sync: SyncState = { name: null, status: 'off', at: null };
let handle: any = null;
let debounce: ReturnType<typeof setTimeout> | undefined;
let backupText: () => string = () => '{}';

const metaGet = async (k: string) => (db ? req(db.transaction(META, 'readonly').objectStore(META).get(k)) : undefined);
const metaSet = (k: string, v: unknown) => (db ? tx(META, 'readwrite', (s) => (v === undefined ? s.delete(k) : s.put(v, k))) : Promise.resolve());

async function writeFile(): Promise<void> {
  if (!handle) return;
  try {
    const w = await handle.createWritable();
    await w.write(backupText());
    await w.close();
    Object.assign(sync, { status: 'connected', at: new Date().toISOString(), msg: undefined });
  } catch (e) {
    Object.assign(sync, { status: 'error', msg: (e as Error).message });
  }
}

/** Restores a linked sync file from a previous visit; writing needs the player's permission again on most browsers. */
export async function initSync(makeBackup: () => string, redraw: () => void) {
  backupText = makeBackup;
  store.onChange(() => {
    if (sync.status !== 'connected') return;
    clearTimeout(debounce);
    debounce = setTimeout(() => { writeFile().then(redraw); }, 1500);
  });
  if (!syncSupported()) return;
  handle = await metaGet('syncHandle').catch(() => undefined);
  if (!handle) return;
  sync.name = handle.name;
  const p = await handle.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt');
  sync.status = p === 'granted' ? 'connected' : 'reconnect';
  redraw();
}

/**
 * Links a sync file (pick = new file) or reconnects the saved one. If the file already holds saves, the player
 * chooses: load them into this browser, or overwrite the file with this browser's saves.
 */
export async function connectSync(pick: boolean, load: (text: string) => Promise<boolean>): Promise<string> {
  if (pick || !handle) {
    handle = await (globalThis as any).showSaveFilePicker({ suggestedName: 'ucb-saves.json', types: [{ description: 'Card Battles saves', accept: { 'application/json': ['.json'] } }] });
    await metaSet('syncHandle', handle);
  } else if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
    sync.status = 'reconnect';
    return 'Permission to write the sync file was not given.';
  }
  sync.name = handle.name;
  const text = await (await handle.getFile()).text();
  let loaded = false;
  if (text.trim()) loaded = await load(text);
  sync.status = 'connected';
  await writeFile();
  return loaded ? `Loaded saves from ${handle.name}; it now stays in sync.` : `Saves now sync to ${handle.name}.`;
}

export async function unlinkSync() {
  handle = null;
  Object.assign(sync, { name: null, status: 'off', at: null, msg: undefined });
  await metaSet('syncHandle', undefined);
}
