// Script Lab bundles: export a game's scripts (rules patch, triggers, functions, procedures, AI hints and per-card patches)
// as one JSON file, and import one into another game, either merged into its scripts or replacing them.
import type { Blueprint } from './blueprint.ts';

export const SCRIPT_FORMAT = 'ucb-script';
type Advanced = NonNullable<Blueprint['advanced']>;
export interface ScriptBundle { format: typeof SCRIPT_FORMAT; v: 1; from?: string; advanced: Advanced; cards?: Record<string, Record<string, unknown>> }
export type ScriptPart = 'rules' | 'triggers' | 'functions' | 'procedures' | 'ai' | 'log' | 'cards';
export const SCRIPT_PARTS: ScriptPart[] = ['rules', 'triggers', 'functions', 'procedures', 'ai', 'log', 'cards'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const empty = (v: unknown) => v === undefined || (Array.isArray(v) ? !v.length : isObj(v) && !Object.keys(v).length);
/** Objects merge key by key (recursively); anything else is replaced. The same rule the Rules patch uses. */
function deepMerge(a: unknown, b: unknown): unknown {
  if (!isObj(a) || !isObj(b)) return structuredClone(b);
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : structuredClone(v);
  return out;
}

/** The scripts of a game as a bundle (only the parts asked for, default all). */
export function exportScripts(bp: Blueprint, parts: ScriptPart[] = SCRIPT_PARTS): ScriptBundle {
  const adv = bp.advanced ?? {};
  const advanced: Advanced = {};
  for (const p of parts) if (p !== 'cards' && !empty(adv[p])) (advanced as any)[p] = structuredClone(adv[p]);
  const cards = parts.includes('cards') ? Object.fromEntries(bp.cards.filter((c) => !empty(c.raw)).map((c) => [c.id, structuredClone(c.raw!)])) : {};
  return { format: SCRIPT_FORMAT, v: 1, from: bp.name, advanced, ...(Object.keys(cards).length ? { cards } : {}) };
}

/** Reads a bundle from parsed JSON. Also accepts a bare Script Lab object ({rules?, triggers?, ...}). Throws a readable error. */
export function readScripts(data: unknown): ScriptBundle {
  if (!isObj(data)) throw new Error('A script file must be a JSON object.');
  const b: ScriptBundle = data.format === SCRIPT_FORMAT ? (data as unknown as ScriptBundle)
    : Object.keys(data).length && Object.keys(data).every((k) => SCRIPT_PARTS.includes(k as ScriptPart))
      ? { format: SCRIPT_FORMAT, v: 1, advanced: Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'cards')) as Advanced, ...(isObj(data.cards) ? { cards: data.cards as any } : {}) }
      : (() => { throw new Error('This is not a Script Lab file (expected "format": "ucb-script", or the keys rules, triggers, functions, procedures, ai, log, cards).'); })();
  if (b.v !== undefined && b.v !== 1) throw new Error(`Script file version ${b.v} is newer than this app understands.`);
  const a = b.advanced ?? {};
  if (!isObj(a)) throw new Error('"advanced" must be an object.');
  for (const k of ['rules', 'functions', 'procedures', 'ai', 'log'] as const) if (a[k] !== undefined && !isObj(a[k])) throw new Error(`"${k}" must be an object.`);
  if (a.triggers !== undefined && !Array.isArray(a.triggers)) throw new Error('"triggers" must be a list.');
  for (const [i, t] of (a.triggers ?? []).entries()) if (!isObj(t) || typeof t.on !== 'string' || !Array.isArray(t.do)) throw new Error(`Trigger ${i + 1} needs "on" (an event name) and "do" (a list of effects).`);
  for (const [t, line] of Object.entries(a.log ?? {})) if (typeof line !== 'string') throw new Error(`The message for event "${t}" must be text.`);
  for (const k of ['functions', 'procedures'] as const) for (const [n, f] of Object.entries(a[k] ?? {}))
    if (!isObj(f) || (k === 'functions' ? !('body' in f) : !Array.isArray(f.do))) throw new Error(`${k === 'functions' ? 'Function' : 'Procedure'} "${n}" needs ${k === 'functions' ? '"body"' : '"do" (a list)'}.`);
  if (b.cards !== undefined && !isObj(b.cards)) throw new Error('"cards" must map card ids to patches.');
  for (const [id, r] of Object.entries(b.cards ?? {})) if (!isObj(r)) throw new Error(`The patch for card "${id}" must be an object.`);
  return { format: SCRIPT_FORMAT, v: 1, from: b.from, advanced: a, ...(b.cards ? { cards: b.cards } : {}) };
}

/** Puts a bundle's scripts into a game. merge: rules merge deeply, triggers are added (skipping exact duplicates), functions,
 *  procedures and AI hints are added or replaced by name, card patches merge into matching cards. replace: each part in the
 *  bundle replaces that part of the game (parts the bundle lacks are kept). Returns a line per change for the user. */
export function importScripts(bp: Blueprint, bundle: ScriptBundle, mode: 'merge' | 'replace' = 'merge'): string[] {
  const report: string[] = [];
  const a = bundle.advanced;
  const adv = (bp.advanced ??= {});
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (a.rules) { adv.rules = (mode === 'merge' ? deepMerge(adv.rules ?? {}, a.rules) : structuredClone(a.rules)) as Record<string, unknown>; report.push(`Rules patch ${mode === 'merge' ? 'merged' : 'replaced'} (${plural(Object.keys(a.rules).length, 'key')})`); }
  if (a.triggers) {
    if (mode === 'replace') { adv.triggers = structuredClone(a.triggers); report.push(`Triggers replaced (${plural(a.triggers.length, 'trigger')})`); }
    else {
      const have = new Set((adv.triggers ?? []).map((t) => JSON.stringify(t)));
      const add = a.triggers.filter((t) => !have.has(JSON.stringify(t)));
      adv.triggers = [...(adv.triggers ?? []), ...structuredClone(add)];
      report.push(`${plural(add.length, 'trigger')} added${add.length < a.triggers.length ? ` (${a.triggers.length - add.length} already there)` : ''}`);
    }
  }
  for (const k of ['functions', 'procedures', 'ai', 'log'] as const) {
    const inc = a[k];
    if (!inc) continue;
    const before = adv[k] ?? {};
    const clash = Object.keys(inc).filter((n) => n in before);
    (adv as any)[k] = mode === 'merge' ? { ...before, ...structuredClone(inc) } : structuredClone(inc);
    const what = k === 'ai' ? 'AI hint' : k === 'log' ? 'event message' : k.slice(0, -1);
    report.push(mode === 'merge' ? `${plural(Object.keys(inc).length - clash.length, what)} added${clash.length ? `, ${clash.length} replaced (${clash.join(', ')})` : ''}` : `${k === 'ai' ? 'AI hints' : k === 'log' ? 'Event messages' : k[0].toUpperCase() + k.slice(1)} replaced (${plural(Object.keys(inc).length, what)})`);
  }
  if (bundle.cards) {
    let n = 0;
    const missing: string[] = [];
    for (const [id, raw] of Object.entries(bundle.cards)) {
      const c = bp.cards.find((x) => x.id === id);
      if (!c) { missing.push(id); continue; }
      c.raw = mode === 'merge' ? deepMerge(c.raw ?? {}, raw) as Record<string, unknown> : structuredClone(raw);
      n++;
    }
    if (n) report.push(`${n} card patch${n === 1 ? '' : 'es'} applied`);
    if (missing.length) report.push(`Skipped patches for cards this game doesn't have: ${missing.join(', ')}`);
  }
  for (const k of Object.keys(adv) as (keyof Advanced)[]) if (empty(adv[k])) delete adv[k];
  if (!report.length) report.push('The file had no scripts in it.');
  return report;
}
