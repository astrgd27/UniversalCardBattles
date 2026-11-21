// sfc32: small, fast, fully serializable (state = 4 uint32 in an array).
export function seedRng(seed: number): number[] {
  const st = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 15; i++) rand(st);
  return st;
}
export function rand(st: number[]): number {
  const [a, b, c, d] = st;
  const t = (((a + b) >>> 0) + d) >>> 0;
  st[3] = (d + 1) >>> 0;
  st[0] = (b ^ (b >>> 9)) >>> 0;
  st[1] = (c + (c << 3)) >>> 0;
  st[2] = (((c << 21) | (c >>> 11)) + t) >>> 0;
  return t / 4294967296;
}
export const randInt = (st: number[], n: number) => Math.floor(rand(st) * n);
export function shuffle<T>(st: number[], a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(st, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
}
export function sample<T>(st: number[], a: T[], k: number): T[] {
  const c = a.slice();
  shuffle(st, c);
  return c.slice(0, k);
}
/** FNV-1a 32-bit, hex. */
export function hash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
