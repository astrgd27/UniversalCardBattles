// Static module validation and deck legality. Every issue carries a JSON pointer into the module definition
// (manifest / rules / cards / decks), which the SDK maps back to file:line:col.
import type { Mod, ModuleDef } from './types.ts';
import { EFFECT_OPS } from './effects.ts';
import { EXPR_OPS } from './expr.ts';
import { isRange, isSemver } from './semver.ts';

export const ENGINE_API = '0.3.0';
/** Engine features a module may list in manifest.requiredCapabilities. */
export const CAPABILITIES = [
  'timing.immediate', 'timing.stack', 'timing.chain', 'replacements', 'layers', 'relationships', 'decisions', 'scripts',
];
const REPLACEABLE = ['draw', 'move', 'destroy', 'damage', 'lose'];

export interface Issue { where: 'manifest' | 'rules' | 'cards' | 'decks'; ptr: string; msg: string }
export const issueText = (i: Issue) => `${i.where}${i.ptr}: ${i.msg}`;
type Err = (ptr: string, msg: string) => void;
const isRec = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const isVar = (x: unknown) => typeof x === 'string' && x.length > 1 && x[0] === '$';
const esc = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');

export const validateModule = (def: ModuleDef): string[] => validateIssues(def).map(issueText);

export function validateIssues(def: ModuleDef): Issue[] {
  const out: Issue[] = [];
  const at = (where: Issue['where']): Err => (ptr, msg) => { out.push({ where, ptr, msg }); };
  const eM = at('manifest');
  const eR = at('rules');
  const eD = at('decks');

  // ---- manifest ----
  const mf = def?.manifest as any;
  if (!isRec(mf)) eM('', 'must be an object');
  else {
    if (typeof mf.moduleId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(mf.moduleId)) eM('/moduleId', 'must be 2-64 lowercase letters, digits or dashes');
    if (typeof mf.displayName !== 'string' || !mf.displayName.trim()) eM('/displayName', 'required');
    if (!isSemver(mf.semanticVersion)) eM('/semanticVersion', 'must be a version like 1.2.3');
    if (!isRange(mf.engineApiRange)) eM('/engineApiRange', 'must be a version range like ^0.3.0');
    if (mf.requiredCapabilities !== undefined && !(Array.isArray(mf.requiredCapabilities) && mf.requiredCapabilities.every((c: unknown) => typeof c === 'string'))) {
      eM('/requiredCapabilities', 'must be an array of strings');
    }
    if (mf.extends !== undefined && !(isRec(mf.extends) && typeof mf.extends.moduleId === 'string' && isRange(mf.extends.range))) {
      eM('/extends', 'must be {moduleId, range}');
    }
  }

  // ---- rules: structure first (later checks rely on it) ----
  const R = def?.rules as any;
  if (!isRec(R)) { eR('', 'must be an object'); return out; }
  const P = R.players;
  if (!isRec(P) || !Number.isInteger(P.min) || !Number.isInteger(P.max) || P.min < 1 || P.max > 16 || P.min > P.max) {
    eR('/players', 'needs integers {min, max} with 1 <= min <= max <= 16');
  }
  const numMap = (x: unknown, ptr: string, required: boolean) => {
    if (x === undefined && !required) return;
    if (!isRec(x) || Object.values(x).some((v) => typeof v !== 'number')) eR(ptr, 'must be an object of numbers');
  };
  numMap(R.playerVars, '/playerVars', true);
  numMap(R.objectVars, '/objectVars', false);
  const F = R.format;
  if (!isRec(F) || ![F.deckMin, F.deckMax, F.maxCopies].every(Number.isInteger) || F.deckMin > F.deckMax) eR('/format', 'needs integers {deckMin, deckMax, maxCopies}');
  const strList = (x: unknown, ptr: string) => {
    if (x !== undefined && !(Array.isArray(x) && x.every((v) => typeof v === 'string'))) eR(ptr, 'must be an array of strings');
  };
  strList(R.stats, '/stats');
  strList(R.layers, '/layers');
  if (!Array.isArray(R.zones) || !R.zones.every(isRec)) { eR('/zones', 'must be an array of zone objects'); return out; }
  if (!Array.isArray(R.phases) || !R.phases.length || !R.phases.every(isRec)) { eR('/phases', 'must be a non-empty array of phase objects'); return out; }
  if (!isRec(R.actions)) { eR('/actions', 'must be an object'); return out; }

  const zones = new Set<string>();
  R.zones.forEach((z: any, i: number) => {
    if (typeof z.id !== 'string') eR(`/zones/${i}/id`, 'required');
    if (zones.has(z.id)) eR(`/zones/${i}/id`, `duplicate zone "${z.id}"`);
    zones.add(z.id);
    if (!['public', 'owner', 'hidden'].includes(z.vis)) eR(`/zones/${i}/vis`, `must be public, owner or hidden (got "${z.vis}")`);
  });
  for (const k of ['deckZone', 'handZone', 'graveZone']) if (!zones.has(R[k])) eR(`/${k}`, `unknown zone "${R[k]}"`);
  const phases = new Set<string>();
  R.phases.forEach((ph: any, i: number) => {
    if (typeof ph.id !== 'string' || phases.has(ph.id)) eR(`/phases/${i}/id`, 'phase ids must be unique strings');
    phases.add(ph.id);
  });
  const layers = new Set<string>(Array.isArray(R.layers) ? R.layers : []);
  const stats = new Set<string>(Array.isArray(R.stats) ? R.stats : []);
  const fns: Record<string, any> = isRec(R.functions) ? R.functions : {};
  const procs: Record<string, any> = isRec(R.procedures) ? R.procedures : {};
  if (R.functions !== undefined && !isRec(R.functions)) eR('/functions', 'must be an object');
  if (R.procedures !== undefined && !isRec(R.procedures)) eR('/procedures', 'must be an object');

  // ---- walkers ----
  const zoneLit = (x: unknown, ptr: string, err: Err) => {
    if (typeof x === 'string' && x[0] !== '$' && !zones.has(x)) err(ptr, `unknown zone "${x}"`);
  };
  const callCheck = (e: any[], ptr: string, err: Err, table: Record<string, any>, kind: string) => {
    const fn = table[e[1]];
    if (typeof e[1] !== 'string' || !isRec(fn)) { err(`${ptr}/1`, `unknown ${kind} "${e[1]}"`); return; }
    const n = Array.isArray(fn.params) ? fn.params.length : 0;
    if (e.length - 2 !== n) err(ptr, `${kind} "${e[1]}" takes ${n} argument(s), got ${e.length - 2}`);
  };
  const expr = (e: unknown, ptr: string, err: Err): void => {
    if (!Array.isArray(e)) return;
    if (typeof e[0] !== 'string') { e.forEach((x, i) => expr(x, `${ptr}/${i}`, err)); return; }
    const op = e[0];
    if (op === 'lit') return;
    if (!EXPR_OPS.has(op)) { err(`${ptr}/0`, `unknown expression op "${op}"`); return; }
    if ((op === 'cards' || op === 'top') && typeof e[2] === 'string') zoneLit(e[2], `${ptr}/2`, err);
    if (op === 'call') callCheck(e, ptr, err, fns, 'function');
    if (op === 'let' && !isVar(e[1])) err(`${ptr}/1`, 'let needs a $variable name');
    e.forEach((x, i) => { if (i > 0 && !(op === 'call' && i === 1)) expr(x, `${ptr}/${i}`, err); });
  };
  const mod = (md: any, ptr: string, err: Err) => {
    if (!isRec(md) || !['set', 'add', 'grant', 'remove'].includes(md.op)) { err(ptr, `bad mod op "${md?.op}" (set, add, grant, remove)`); return; }
    if (md.op === 'grant' || md.op === 'remove') { if (typeof md.kw !== 'string') err(ptr, `${md.op} needs "kw"`); }
    else if (!stats.has(md.stat)) err(`${ptr}/stat`, `"${md.stat}" is not in rules.stats`);
    expr(md.value, `${ptr}/value`, err);
  };
  const effects = (l: unknown, ptr: string, err: Err): void => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(ptr, 'effect list must be an array'); return; }
    l.forEach((eff, i) => {
      const p = `${ptr}/${i}`;
      if (!Array.isArray(eff) || typeof eff[0] !== 'string') { err(p, 'effect must be ["op", ...args]'); return; }
      const op = eff[0];
      if (!EFFECT_OPS.has(op)) { err(`${p}/0`, `unknown effect op "${op}"`); return; }
      const X = (j: number) => expr(eff[j], `${p}/${j}`, err);
      switch (op) {
        case 'if': X(1); effects(eff[2], `${p}/2`, err); effects(eff[3], `${p}/3`, err); return;
        case 'each': X(1); if (!isVar(eff[2])) err(`${p}/2`, 'each needs a $variable name'); effects(eff[3], `${p}/3`, err); return;
        case 'let': if (!isVar(eff[1])) err(`${p}/1`, 'let needs a $variable name'); X(2); return;
        case 'choose': {
          const o = eff[1] as any;
          if (!isRec(o) || o.from === undefined || !isVar(o.as)) { err(`${p}/1`, 'choose needs {from, as: "$name"}'); return; }
          expr(o.from, `${p}/1/from`, err);
          expr(o.who, `${p}/1/who`, err);
          return;
        }
        case 'move': X(1); zoneLit(eff[2], `${p}/2`, err); X(2); if (isRec(eff[3])) expr(eff[3].player, `${p}/3/player`, err); return;
        case 'shuffle': X(1); zoneLit(eff[2], `${p}/2`, err); return;
        case 'run': X(1); if (typeof eff[2] !== 'string') err(`${p}/2`, 'run needs a card field name'); return;
        case 'emit':
          if (typeof eff[1] !== 'string') err(`${p}/1`, 'emit needs an event type');
          if (isRec(eff[2])) for (const [k, v] of Object.entries(eff[2])) expr(v, `${p}/2/${esc(k)}`, err);
          return;
        case 'modify': {
          X(1);
          const sp = eff[2] as any;
          if (!isRec(sp) || !layers.has(sp.layer)) { err(`${p}/2`, `modify needs a layer from rules.layers (got "${sp?.layer}")`); return; }
          if (sp.until !== undefined && sp.until !== 'turn' && sp.until !== null) err(`${p}/2/until`, 'until must be "turn" or null');
          (Array.isArray(sp.mods) ? sp.mods : []).forEach((md: any, j: number) => mod(md, `${p}/2/mods/${j}`, err));
          return;
        }
        case 'link': X(1); if (typeof eff[2] !== 'string') err(`${p}/2`, 'link needs a relation name'); X(3); return;
        case 'unlink': X(1); if (typeof eff[2] !== 'string') err(`${p}/2`, 'unlink needs a relation name'); return;
        case 'call': callCheck(eff, p, err, procs, 'procedure'); eff.slice(2).forEach((_, j) => X(j + 2)); return;
        default: eff.forEach((_, j) => { if (j > 0) X(j); });
      }
    });
  };
  const timing = (t: any, ptr: string) => {
    if (t !== undefined && !(isRec(t) && ['immediate', 'stack', 'chain'].includes(t.mode))) eR(ptr, 'timing.mode must be immediate, stack or chain');
  };
  const statics = (l: unknown, ptr: string, err: Err) => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(ptr, 'must be an array'); return; }
    l.forEach((d: any, i: number) => {
      const p = `${ptr}/${i}`;
      if (!layers.has(d?.layer)) err(`${p}/layer`, `unknown layer "${d?.layer}"`);
      expr(d?.affects, `${p}/affects`, err);
      expr(d?.if, `${p}/if`, err);
      (Array.isArray(d?.mods) ? d.mods : []).forEach((md: any, j: number) => mod(md, `${p}/mods/${j}`, err));
    });
  };
  const repls = (l: unknown, ptr: string, err: Err) => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(ptr, 'must be an array'); return; }
    l.forEach((d: any, i: number) => {
      const p = `${ptr}/${i}`;
      if (!REPLACEABLE.includes(d?.replace)) err(`${p}/replace`, `cannot replace "${d?.replace}" (replaceable: ${REPLACEABLE.join(', ')})`);
      if (!d?.instead === !d?.modify) err(p, 'needs exactly one of "instead" or "modify"');
      expr(d?.if, `${p}/if`, err);
      effects(d?.instead, `${p}/instead`, err);
      if (isRec(d?.modify)) for (const [k, v] of Object.entries(d.modify)) expr(v, `${p}/modify/${esc(k)}`, err);
    });
  };
  const slots = (l: unknown, ptr: string, err: Err) => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(ptr, 'must be an array'); return; }
    l.forEach((d: any, i: number) => {
      if (!isVar(d?.as)) err(`${ptr}/${i}/as`, 'slot needs "as": "$name"');
      expr(d?.from, `${ptr}/${i}/from`, err);
    });
  };
  const abilities = (l: unknown, ptr: string, err: Err) => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(ptr, 'must be an array'); return; }
    l.forEach((ab: any, i: number) => {
      const p = `${ptr}/${i}`;
      if (typeof ab?.on !== 'string') err(`${p}/on`, 'missing "on"');
      (ab?.zones ?? []).forEach((z: unknown, j: number) => zoneLit(z, `${p}/zones/${j}`, err));
      expr(ab?.if, `${p}/if`, err);
      effects(ab?.do, `${p}/do`, err);
    });
  };
  const params = (x: unknown, ptr: string) => {
    if (!Array.isArray(x) || !x.every(isVar) || new Set(x).size !== x.length) eR(ptr, 'params must be unique "$name" strings');
  };

  // ---- rules content ----
  timing(R.timing, '/timing');
  for (const [name, fn] of Object.entries(fns)) { params(fn?.params, `/functions/${esc(name)}/params`); expr(fn?.body, `/functions/${esc(name)}/body`, eR); }
  for (const [name, pr] of Object.entries(procs)) { params(pr?.params, `/procedures/${esc(name)}/params`); effects(pr?.do, `/procedures/${esc(name)}/do`, eR); }
  statics(R.statics, '/statics', eR);
  repls(R.replacements, '/replacements', eR);
  abilities(R.triggers, '/triggers', eR);
  effects(R.setup, '/setup', eR);
  effects(R.stateChecks, '/stateChecks', eR);
  R.phases.forEach((ph: any, i: number) => { timing(ph.timing, `/phases/${i}/timing`); effects(ph.do, `/phases/${i}/do`, eR); });
  for (const [name, a] of Object.entries<any>(R.actions)) {
    const p = `/actions/${esc(name)}`;
    if (name === 'pass') eR(p, '"pass" is reserved');
    if (!isRec(a)) { eR(p, 'must be an object'); continue; }
    (a.phases ?? []).forEach((ph: string, j: number) => { if (!phases.has(ph)) eR(`${p}/phases/${j}`, `unknown phase "${ph}"`); });
    if (a.speed !== undefined && !(Number.isInteger(a.speed) && a.speed >= 1)) eR(`${p}/speed`, 'must be an integer >= 1');
    expr(a.source, `${p}/source`, eR);
    (a.req ?? []).forEach((q: any, j: number) => expr(q?.if, `${p}/req/${j}/if`, eR));
    slots(a.targets, `${p}/targets`, eR);
    for (const k of ['cost', 'do', 'countered']) effects(a[k], `${p}/${k}`, eR);
    if (!Array.isArray(a.do)) eR(`${p}/do`, 'required');
  }

  // ---- cards ----
  const ids = new Set<string>();
  if (!Array.isArray(def.cards)) at('cards')('', 'must be an array');
  else def.cards.forEach((c: any, i: number) => {
    const err: Err = (ptr, msg) => out.push({ where: 'cards', ptr: `/${i}${ptr}`, msg: `${c?.id ?? '?'}: ${msg}` });
    if (!isRec(c)) { err('', 'card must be an object'); return; }
    if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.type !== 'string') err('', 'id, name and type are required strings');
    if (ids.has(c.id)) err('/id', 'duplicate card id');
    ids.add(c.id);
    slots(c.targets, '/targets', err);
    abilities(c.abilities, '/abilities', err);
    statics(c.statics, '/statics', err);
    repls(c.replacements, '/replacements', err);
    for (const [k, v] of Object.entries(c)) {
      if (Array.isArray(v) && Array.isArray(v[0]) && !['targets', 'abilities', 'statics', 'replacements'].includes(k)) effects(v, `/${esc(k)}`, err);
    }
  });

  // ---- decks ----
  if (def.decks !== undefined && !isRec(def.decks)) eD('', 'must be an object of card-id arrays');
  else for (const [name, d] of Object.entries(def.decks ?? {})) {
    if (!Array.isArray(d)) { eD(`/${esc(name)}`, 'must be an array of card ids'); continue; }
    d.forEach((c, j) => { if (!ids.has(c)) eD(`/${esc(name)}/${j}`, `unknown card "${c}"`); });
  }
  return out;
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
