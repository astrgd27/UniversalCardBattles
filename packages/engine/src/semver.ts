// Minimal semver: x.y.z versions; ranges "^x.y.z", "~x.y.z", ">=x.y.z", "<x.y.z", "x.y.z", "*", space-separated = AND.
const RE = /^(\d+)\.(\d+)\.(\d+)$/;
export const isSemver = (v: unknown): v is string => typeof v === 'string' && RE.test(v);
const parse = (v: string) => v.match(RE)!.slice(1).map(Number) as [number, number, number];
const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function satisfies(version: string, range: string): boolean {
  if (!isSemver(version)) return false;
  const v = parse(version);
  return range.trim().split(/\s+/).every((part) => {
    if (part === '*') return true;
    const m = part.match(/^(\^|~|>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/);
    if (!m) return false;
    const r = parse(m[2]);
    const c = cmp(v, r);
    switch (m[1] ?? '=') {
      case '^': return c >= 0 && (r[0] > 0 ? v[0] === r[0] : r[1] > 0 ? v[0] === 0 && v[1] === r[1] : cmp(v, r) === 0);
      case '~': return c >= 0 && v[0] === r[0] && v[1] === r[1];
      case '>=': return c >= 0;
      case '<=': return c <= 0;
      case '>': return c > 0;
      case '<': return c < 0;
      default: return c === 0;
    }
  });
}
export const isRange = (r: unknown): r is string => typeof r === 'string' && r.trim().split(/\s+/).every((p) => p === '*' || /^(\^|~|>=|<=|>|<|=)?\d+\.\d+\.\d+$/.test(p));
