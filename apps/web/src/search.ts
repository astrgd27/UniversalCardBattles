// Deckbuilder logic without DOM: card search queries, facets, deck text import/export. Tested in node.
import type { CardDef, Mod } from '#engine';

/**
 * Query syntax (case-insensitive), terms are ANDed, "-" negates:
 *   bolt                 name, type, keywords, tags or text contains "bolt"
 *   "draw a card"        quoted phrase
 *   t:unit  type:spell   type equals
 *   k:guard  kw:haste    keyword or tag equals
 *   tag:aggro            tag or keyword equals
 *   n:drake  x:damage    name contains / rules text contains
 *   cost<=2  power>=3    numeric comparison on any card field (<, <=, >, >=, =, :)
 *   is:token             maxCopies 0 (not deckable)
 *   -k:guard             negation
 */
export interface Term { neg: boolean; key: string | null; op: string | null; value: string }

const KEYS: Record<string, string> = { t: 'type', type: 'type', k: 'kw', kw: 'kw', keyword: 'kw', tag: 'tag', n: 'name', name: 'name', x: 'text', o: 'text', text: 'text', is: 'is' };

export function parseQuery(q: string): Term[] {
  const out: Term[] = [];
  const re = /(-?)(?:([a-z][\w-]*)(<=|>=|:|=|<|>))?(?:"([^"]*)"|(\S+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const value = (m[4] ?? m[5] ?? '').toLowerCase();
    if (!value && !m[2]) continue;
    out.push({ neg: m[1] === '-', key: m[2]?.toLowerCase() ?? null, op: m[3] ?? null, value });
  }
  return out;
}

const words = (c: CardDef) => [...(c.keywords ?? []), ...((c.tags as string[] | undefined) ?? [])].map((x) => String(x).toLowerCase());

function test(c: CardDef, t: Term): boolean {
  const key = t.key ? KEYS[t.key] ?? t.key : null;
  const v = t.value;
  if (!key) return `${c.name} ${c.type} ${words(c).join(' ')} ${c.text ?? ''}`.toLowerCase().includes(v);
  switch (key) {
    case 'type': return c.type.toLowerCase() === v || (t.op === ':' && c.type.toLowerCase().startsWith(v));
    case 'kw': case 'tag': return words(c).includes(v);
    case 'name': return c.name.toLowerCase().includes(v);
    case 'text': return (c.text ?? '').toLowerCase().includes(v);
    case 'is': return v === 'token' ? c.maxCopies === 0 : words(c).includes(v) || c.type.toLowerCase() === v;
  }
  const field = (c as any)[key];
  if (field === undefined) return false;
  const n = Number(v);
  if (typeof field === 'number' && !Number.isNaN(n)) {
    switch (t.op) {
      case '<': return field < n;
      case '<=': return field <= n;
      case '>': return field > n;
      case '>=': return field >= n;
      default: return field === n;
    }
  }
  return String(field).toLowerCase() === v;
}

export const cardMatches = (c: CardDef, terms: Term[]) => terms.every((t) => test(c, t) !== t.neg);

/** Filter chips derived from the game's own cards: types, keywords/tags and costs present in the pool. */
export function facets(cards: CardDef[]): { types: [string, number][]; words: [string, number][]; costs: number[] } {
  const types = new Map<string, number>();
  const ws = new Map<string, number>();
  const costs = new Set<number>();
  for (const c of cards) {
    types.set(c.type, (types.get(c.type) ?? 0) + 1);
    for (const w of words(c)) ws.set(w, (ws.get(w) ?? 0) + 1);
    if (typeof c.cost === 'number') costs.add(c.cost);
  }
  const sorted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { types: sorted(types), words: sorted(ws), costs: [...costs].sort((a, b) => a - b) };
}

/** Adds the token to the query, or removes it if it is already there. */
export function toggleToken(q: string, token: string): string {
  const parts = q.split(/\s+/).filter(Boolean);
  const i = parts.findIndex((p) => p.toLowerCase() === token.toLowerCase());
  if (i >= 0) parts.splice(i, 1);
  else parts.push(token);
  return parts.join(' ');
}
export const hasToken = (q: string, token: string) => q.split(/\s+/).some((p) => p.toLowerCase() === token.toLowerCase());

export type SortKey = 'cost' | 'name' | 'type';
export function sortCards(cards: CardDef[], key: SortKey): CardDef[] {
  const cost = (c: CardDef) => (typeof c.cost === 'number' ? c.cost : 99);
  return [...cards].sort((a, b) => (key === 'name' ? 0 : key === 'type' ? a.type.localeCompare(b.type) : cost(a) - cost(b)) || cost(a) - cost(b) || a.name.localeCompare(b.name));
}

/** Plain-text deck list: "# section" headers when the game has several sections, then "N Card Name" lines. */
export function deckToText(m: Mod, deck: Record<string, string[]>, secs: string[]): string {
  const out: string[] = [];
  for (const z of secs) {
    const counts = new Map<string, number>();
    for (const c of deck[z] ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    if (secs.length > 1) out.push(`# ${z}`);
    for (const [id, n] of counts) out.push(`${n} ${m.card.get(id)?.name ?? id}`);
  }
  return out.join('\n');
}

/** Parses "N name", "Nx name", "name xN" or a bare name per line (card name or id). Unknown cards are reported. */
export function deckFromText(m: Mod, text: string, secs: string[]): { deck: Record<string, string[]>; errors: string[] } {
  const deck: Record<string, string[]> = Object.fromEntries(secs.map((z) => [z, []]));
  const errors: string[] = [];
  const byName = new Map<string, string>();
  for (const c of m.cards) { byName.set(c.name.toLowerCase(), c.id); byName.set(c.id.toLowerCase(), c.id); }
  let sec = secs[0];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const head = line.match(/^#\s*(.+?)\s*:?$|^(.+?):$/);
    if (head) {
      const z = (head[1] ?? head[2]).toLowerCase();
      if (secs.includes(z)) sec = z;
      else errors.push(`line ${i + 1}: unknown section "${z}" (${secs.join(', ')})`);
      return;
    }
    const a = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const b = line.match(/^(.+?)\s+x(\d+)$/i);
    let n = 1;
    let name = line;
    if (a) { n = +a[1]; name = a[2]; } else if (b) { n = +b[2]; name = b[1]; }
    const id = byName.get(name.trim().toLowerCase());
    if (!id) { errors.push(`line ${i + 1}: unknown card "${name.trim()}"`); return; }
    if (n > 99) { errors.push(`line ${i + 1}: too many copies`); return; }
    for (let k = 0; k < n; k++) deck[sec].push(id);
  });
  return { deck, errors };
}

/** Cost curve: counts per cost (last bucket is "max+"). */
export function curve(m: Mod, ids: string[], max = 7): number[] {
  const out = Array.from({ length: max + 1 }, () => 0);
  for (const id of ids) {
    const c = m.card.get(id)?.cost;
    if (typeof c === 'number') out[Math.min(max, Math.max(0, c))]++;
  }
  return out;
}
