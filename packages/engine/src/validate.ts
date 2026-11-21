// Static module validation and deck legality. Returns human-readable error strings ("path: problem").
import type { Mod, ModuleDef, SlotDef } from './types.ts';
import { EFFECT_OPS } from './effects.ts';
import { EXPR_OPS } from './expr.ts';

export const ENGINE_API = '0.1.0';

export function validateModule(def: ModuleDef): string[] {
  const errs: string[] = [];
  const err = (path: string, msg: string) => errs.push(`${path}: ${msg}`);
  const R = def.rules;
  const mf = def.manifest;
  if (!mf?.moduleId || !mf.semanticVersion || !mf.displayName) err('manifest', 'moduleId, displayName and semanticVersion are required');
  if (!R) return [...errs, 'rules: missing'];
  const zones = new Set<string>();
  for (const z of R.zones ?? []) {
    if (zones.has(z.id)) err(`rules.zones.${z.id}`, 'duplicate zone');
    zones.add(z.id);
    if (!['public', 'owner', 'hidden'].includes(z.vis)) err(`rules.zones.${z.id}`, `bad vis "${z.vis}"`);
  }
  for (const k of ['deckZone', 'handZone', 'graveZone'] as const) if (!zones.has(R[k])) err(`rules.${k}`, `unknown zone "${R[k]}"`);
  const phases = new Set((R.phases ?? []).map((p) => p.id));
  if (!phases.size) err('rules.phases', 'at least one phase required');

  const zoneLit = (x: unknown, path: string) => {
    if (typeof x === 'string' && x[0] !== '$' && !zones.has(x)) err(path, `unknown zone "${x}"`);
  };
  const expr = (e: unknown, path: string): void => {
    if (!Array.isArray(e)) return;
    if (typeof e[0] !== 'string') { e.forEach((x, i) => expr(x, `${path}[${i}]`)); return; }
    if (e[0] === 'lit') return;
    if (!EXPR_OPS.has(e[0])) { err(path, `unknown expression op "${e[0]}"`); return; }
    if ((e[0] === 'cards' || e[0] === 'top') && typeof e[2] === 'string') zoneLit(e[2], path);
    e.slice(1).forEach((x, i) => expr(x, `${path}[${i + 1}]`));
  };
  const effects = (l: unknown, path: string): void => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(path, 'effect list must be an array'); return; }
    l.forEach((eff, i) => {
      const p = `${path}[${i}]`;
      if (!Array.isArray(eff) || typeof eff[0] !== 'string') { err(p, 'effect must be ["op", ...args]'); return; }
      const op = eff[0];
      if (!EFFECT_OPS.has(op)) { err(p, `unknown effect op "${op}"`); return; }
      switch (op) {
        case 'if': expr(eff[1], p); effects(eff[2], `${p}.then`); effects(eff[3], `${p}.else`); return;
        case 'each':
          expr(eff[1], p);
          if (typeof eff[2] !== 'string' || eff[2][0] !== '$') err(p, 'each needs a $variable name');
          effects(eff[3], `${p}.body`);
          return;
        case 'let': if (typeof eff[1] !== 'string' || eff[1][0] !== '$') err(p, 'let needs a $variable name'); expr(eff[2], p); return;
        case 'choose': {
          const o = eff[1] as any;
          if (!o || typeof o !== 'object' || !o.from || typeof o.as !== 'string') { err(p, 'choose needs {from, as}'); return; }
          expr(o.from, p); expr(o.who, p);
          return;
        }
        case 'move': expr(eff[1], p); zoneLit(eff[2], p); expr(eff[2], p); if (eff[3]) expr((eff[3] as any).player, p); return;
        case 'shuffle': expr(eff[1], p); zoneLit(eff[2], p); return;
        case 'run': expr(eff[1], p); if (typeof eff[2] !== 'string') err(p, 'run needs a card field name'); return;
        case 'emit': if (typeof eff[1] !== 'string') err(p, 'emit needs an event type'); Object.values((eff[2] ?? {}) as object).forEach((v) => expr(v, p)); return;
        default: eff.slice(1).forEach((x, j) => expr(x, `${p}[${j + 1}]`));
      }
    });
  };
  const slots = (sl: SlotDef[] | undefined, path: string) => sl?.forEach((d, i) => {
    if (typeof d.as !== 'string' || d.as[0] !== '$') err(`${path}[${i}]`, 'slot needs "as": "$name"');
    expr(d.from, `${path}[${i}].from`);
  });

  effects(R.setup, 'rules.setup');
  effects(R.stateChecks, 'rules.stateChecks');
  (R.phases ?? []).forEach((ph) => effects(ph.do, `rules.phases.${ph.id}`));
  (R.triggers ?? []).forEach((t, i) => { expr(t.if, `rules.triggers[${i}].if`); effects(t.do, `rules.triggers[${i}].do`); });
  for (const [name, a] of Object.entries(R.actions ?? {})) {
    const p = `rules.actions.${name}`;
    if (name === 'pass') err(p, '"pass" is reserved');
    a.phases?.forEach((ph) => { if (!phases.has(ph)) err(p, `unknown phase "${ph}"`); });
    expr(a.source, `${p}.source`);
    a.req?.forEach((q, i) => expr(q.if, `${p}.req[${i}]`));
    slots(a.targets, `${p}.targets`);
    effects(a.cost, `${p}.cost`);
    effects(a.do, `${p}.do`);
  }
  const ids = new Set<string>();
  for (const c of def.cards ?? []) {
    const p = `cards.${c.id}`;
    if (!c.id || !c.name || !c.type) err(p, 'id, name and type are required');
    if (ids.has(c.id)) err(p, 'duplicate card id');
    ids.add(c.id);
    slots(c.targets, `${p}.targets`);
    effects(c.effects, `${p}.effects`);
    c.abilities?.forEach((ab, i) => {
      if (!ab.on) err(`${p}.abilities[${i}]`, 'missing "on"');
      ab.zones?.forEach((z) => zoneLit(z, `${p}.abilities[${i}].zones`));
      expr(ab.if, `${p}.abilities[${i}].if`);
      effects(ab.do, `${p}.abilities[${i}].do`);
    });
  }
  for (const [name, d] of Object.entries(def.decks ?? {})) {
    for (const c of d) if (!ids.has(c)) err(`decks.${name}`, `unknown card "${c}"`);
  }
  return errs;
}

export function deckErrors(m: Mod, deck: string[]): string[] {
  const f = m.rules.format;
  const errs: string[] = [];
  if (deck.length < f.deckMin || deck.length > f.deckMax) errs.push(`deck has ${deck.length} cards (needs ${f.deckMin}-${f.deckMax})`);
  const counts = new Map<string, number>();
  for (const c of deck) {
    if (!m.card.has(c)) errs.push(`unknown card "${c}"`);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const [c, n] of counts) if (n > f.maxCopies) errs.push(`${n} copies of "${c}" (max ${f.maxCopies})`);
  return errs;
}
