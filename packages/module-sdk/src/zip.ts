// Minimal, defensive ZIP reader/writer (stored + deflate). Browser-safe: uses (De)CompressionStream.
export interface ZipLimits { maxEntries: number; maxTotal: number; maxFile: number; maxRatio: number }
export const ZIP_LIMITS: ZipLimits = { maxEntries: 2000, maxTotal: 64 << 20, maxFile: 8 << 20, maxRatio: 100 };

export class PackageError extends Error {
  errors: string[];
  constructor(errors: string[]) { super(errors.join('\n')); this.errors = errors; }
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Returns a reason if a package path is unsafe, else null. */
export function checkPath(name: string): string | null {
  if (!name || name.length > 255) return 'bad path length';
  if (name.includes('\\')) return 'backslash in path';
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return 'absolute path';
  if (/[\x00-\x1f\x7f]/.test(name)) return 'control character in path';
  if (name.replace(/\/$/, '').split('/').some((p) => p === '' || p === '.' || p === '..')) return 'path traversal or empty segment';
  return null;
}

function concat(chunks: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Pipes bytes through a (de)compression stream, aborting once the output exceeds `limit`. */
async function transform(data: Uint8Array, ts: { writable: WritableStream<any>; readable: ReadableStream<any> }, limit: number, what: string): Promise<Uint8Array> {
  const w = ts.writable.getWriter();
  w.write(data).catch(() => {});
  w.close().catch(() => {});
  const reader = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > limit) {
      await reader.cancel().catch(() => {});
      throw new PackageError([`${what}: inflates beyond its declared size`]);
    }
    chunks.push(value);
  }
  return concat(chunks, n);
}

export async function readZip(bytes: Uint8Array, limits: Partial<ZipLimits> = {}): Promise<Map<string, Uint8Array>> {
  const L = { ...ZIP_LIMITS, ...limits };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (m: string): never => { throw new PackageError([m]); };
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fail('not a ZIP file');
  if (dv.getUint16(eocd + 4, true) || dv.getUint16(eocd + 6, true)) fail('multi-disk ZIP files are not supported');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) fail('ZIP64 is not supported');
  if (count > L.maxEntries) fail(`too many entries (${count} > ${L.maxEntries})`);
  if (cdOff + cdSize > eocd) fail('corrupt central directory');
  const td = new TextDecoder('utf-8', { fatal: true });
  const out = new Map<string, Uint8Array>();
  const errors: string[] = [];
  let total = 0;
  let p = cdOff;
  for (let k = 0; k < count; k++) {
    if (p + 46 > eocd || dv.getUint32(p, true) !== 0x02014b50) fail('corrupt central directory');
    const madeBy = dv.getUint16(p + 4, true);
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true);
    const ext = dv.getUint32(p + 38, true);
    const loff = dv.getUint32(p + 42, true);
    let name = '';
    try { name = td.decode(bytes.subarray(p + 46, p + 46 + nl)); } catch { fail('entry name is not valid UTF-8'); }
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    const what = `"${name}"`;
    const bad = checkPath(name);
    if (bad) { errors.push(`${what}: ${bad}`); continue; }
    if (madeBy >> 8 === 3 && ((ext >>> 16) & 0o170000) === 0o120000) { errors.push(`${what}: symbolic links are not allowed`); continue; }
    if (name.endsWith('/')) continue;
    if (flags & 1) { errors.push(`${what}: encrypted entries are not allowed`); continue; }
    if (method !== 0 && method !== 8) { errors.push(`${what}: unsupported compression method ${method}`); continue; }
    if (out.has(name)) { errors.push(`${what}: duplicate entry`); continue; }
    if (usize > L.maxFile) { errors.push(`${what}: ${usize} bytes exceeds the per-file limit of ${L.maxFile}`); continue; }
    total += usize;
    if (total > L.maxTotal) fail(`package exceeds ${L.maxTotal} bytes uncompressed`);
    if (usize > 1 << 20 && usize > csize * L.maxRatio) { errors.push(`${what}: compression ratio too high (possible zip bomb)`); continue; }
    if (loff + 30 > bytes.length || dv.getUint32(loff, true) !== 0x04034b50) { errors.push(`${what}: corrupt local header`); continue; }
    const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    if (start + csize > bytes.length) { errors.push(`${what}: truncated data`); continue; }
    const raw = bytes.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) {
      if (csize !== usize) { errors.push(`${what}: stored size mismatch`); continue; }
      data = raw.slice();
    } else {
      try {
        data = await transform(raw, new DecompressionStream('deflate-raw'), usize, what);
      } catch (e) {
        errors.push(e instanceof PackageError ? e.errors[0] : `${what}: corrupt compressed data`);
        continue;
      }
    }
    if (data.length !== usize) { errors.push(`${what}: size mismatch`); continue; }
    if (crc32(data) !== crc) { errors.push(`${what}: CRC mismatch`); continue; }
    out.set(name, data);
  }
  if (errors.length) throw new PackageError(errors);
  return out;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  deflate?: boolean; // default true (kept only if smaller)
  // Test hooks for building hostile archives:
  unixMode?: number;
  flags?: number;
  method?: number;
  declaredSize?: number;
}

export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const te = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const e of entries) {
    const name = te.encode(e.name);
    let body = e.data;
    let method = 0;
    if (e.deflate !== false) {
      const z = await transform(e.data, new CompressionStream('deflate-raw'), Infinity, e.name);
      if (z.length < e.data.length) { body = z; method = 8; }
    }
    if (e.method !== undefined) method = e.method;
    const flags = e.flags ?? 0x0800; // UTF-8 names
    const crc = crc32(e.data);
    const usize = e.declaredSize ?? e.data.length;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, usize, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, e.unixMode ? (3 << 8) | 20 : 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, usize, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(38, e.unixMode ? (e.unixMode * 65536) >>> 0 : 0, true);
    cv.setUint32(42, off, true);
    ch.set(name, 46);
    parts.push(lh, body);
    central.push(ch);
    off += lh.length + body.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, off, true);
  const all = [...parts, ...central, end];
  return concat(all, all.reduce((a, c) => a + c.length, 0));
}
