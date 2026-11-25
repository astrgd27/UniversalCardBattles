// Card spreadsheets: export a blueprint's cards as CSV, and import a CSV to add or update cards in bulk.
// Columns: id, name, type, cost, color, keywords (space-separated, "resist:2" for valued), text, flavor, then one column per stat.
// Abilities are not in the sheet; an imported row keeps the abilities of an existing card with the same id.
import type { Blueprint, CardBP } from './blueprint.ts';
import { slug } from './compile.ts';

const esc = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function costCell(c: CardBP): string {
  if (typeof c.cost === 'object') return Object.entries(c.cost).map(([k, n]) => `${k}:${n}`).join(' ');
  return c.cost === undefined ? '' : String(c.cost);
}
export function cardsToCsv(bp: Blueprint): string {
  const head = ['id', 'name', 'type', 'cost', 'color', 'keywords', 'text', 'flavor', ...bp.stats.map((s) => s.id)];
  const rows = bp.cards.map((c) => [c.id, c.name, c.type, costCell(c), c.color ?? '', c.keywords.map((k) => (c.kwv?.[k] !== undefined ? `${k}:${c.kwv[k]}` : k)).join(' '),
    c.text ?? '', c.flavor ?? '', ...bp.stats.map((s) => c.stats[s.id] ?? '')]);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
/** Adds or updates cards from CSV text. Returns how many were added/updated and any row problems. */
export function cardsFromCsv(bp: Blueprint, text: string): { added: number; updated: number; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { added: 0, updated: 0, errors: ['The file is empty.'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (col('name') < 0 || col('type') < 0) return { added: 0, updated: 0, errors: ['The first row must name the columns, including "name" and "type".'] };
  const typeIds = new Map(bp.types.flatMap((t) => [[t.id.toLowerCase(), t.id], [t.name.toLowerCase(), t.id]] as [string, string][]));
  let added = 0, updated = 0;
  rows.slice(1).forEach((r, i) => {
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
    const name = get('name');
    if (!name) return;
    const type = typeIds.get(get('type').toLowerCase());
    if (!type) { errors.push(`Row ${i + 2} (${name}): unknown type "${get('type')}".`); return; }
    const id = slug(get('id') || name);
    const costRaw = get('cost');
    const cost: CardBP['cost'] = /:/.test(costRaw) ? Object.fromEntries(costRaw.split(/\s+/).filter(Boolean).map((p) => { const [k, n] = p.split(':'); return [k, Number(n) || 0]; })) : costRaw === '' ? 0 : Number(costRaw) || 0;
    const kws: string[] = [];
    const kwv: Record<string, number> = {};
    for (const tok of get('keywords').split(/\s+/).filter(Boolean)) {
      const [k, v] = tok.split(':');
      const kid = bp.keywords.find((w) => w.id === k || w.name.toLowerCase() === k.toLowerCase())?.id;
      if (!kid) { errors.push(`Row ${i + 2} (${name}): unknown keyword "${k}".`); continue; }
      kws.push(kid);
      if (v !== undefined) kwv[kid] = Number(v) || 0;
    }
    const stats: Record<string, number> = {};
    for (const s of bp.stats) { const v = get(s.id.toLowerCase()); if (v !== '' && !Number.isNaN(Number(v))) stats[s.id] = Number(v); }
    const old = bp.cards.find((c) => c.id === id);
    const next: CardBP = { ...(old ?? { abilities: [] }), id, name, type, cost, stats, keywords: kws, ...(Object.keys(kwv).length ? { kwv } : {}),
      color: get('color') || undefined, text: get('text') || undefined, flavor: get('flavor') || undefined } as CardBP;
    if (old) { Object.assign(old, next); updated++; } else { bp.cards.push(next); added++; }
  });
  return { added, updated, errors };
}
