// Static module validation and deck legality. Every issue carries a JSON pointer into the module definition
// (manifest / rules / cards / decks), which the SDK maps back to file:line:col.
import type { Deck, Mod, ModuleDef, Scenario, State } from './types.ts';
import { EFFECT_OPS } from './effects.ts';
import { EXPR_OPS, ev } from './expr.ts';
import { isRange, isSemver } from './semver.ts';

export const ENGINE_API = '0.3.1';
/** Engine features a module may list in manifest.requiredCapabilities. */
export const CAPABILITIES = [
  'timing.immediate', 'timing.stack', 'timing.chain', 'timing.alternate', 'replacements', 'layers', 'relationships', 'decisions',
  'scripts', 'commit', 'faceDown', 'random', 'multiDeck', 'sharedDecks', 'gameVars', 'grid', 'external',
  'windows', 'slots', 'resources', 'deckRules', 'limits', 'activated', 'targeting', 'control', 'teams',
];
const REPLACEABLE = ['draw', 'move', 'destroy', 'damage', 'lose'];
/** Built-in card template families a module may use or extend (presentation; rendered by apps/web). */
export const TEMPLATE_BASES = ['classic', 'skirmisher', 'monster', 'vital', 'leader', 'spell', 'resource', 'location', 'token'];

export interface Issue { where: 'manifest' | 'rules' | 'cards' | 'decks' | 'ai'; ptr: string; msg: string }
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
    const pr = mf.presentation;
    if (pr !== undefined) {
      if (!isRec(pr)) eM('/presentation', 'must be an object');
      else {
        const own = isRec(pr.templates) ? pr.templates : {};
        if (pr.templates !== undefined && !isRec(pr.templates)) eM('/presentation/templates', 'must be an object');
        for (const [name, t] of Object.entries<any>(own)) {
          const p = `/presentation/templates/${esc(name)}`;
          if (!isRec(t)) { eM(p, 'must be an object'); continue; }
          if (t.base !== undefined && !TEMPLATE_BASES.includes(t.base)) eM(`${p}/base`, `unknown base "${t.base}" (${TEMPLATE_BASES.join(', ')})`);
          if (t.layout !== undefined && !['portrait', 'landscape'].includes(t.layout)) eM(`${p}/layout`, 'must be portrait or landscape');
          if (t.cost !== undefined && !['tl', 'tr', 'none'].includes(t.cost)) eM(`${p}/cost`, 'must be tl, tr or none');
          if (t.stats !== undefined && !(Array.isArray(t.stats) && t.stats.every((s: any) => isRec(s) && typeof s.field === 'string' && ['tl', 'tr', 'bl', 'br', 'line'].includes(s.pos)))) eM(`${p}/stats`, 'must be [{field, pos: tl|tr|bl|br|line, icon?, label?}]');
        }
        for (const [type, name] of Object.entries<any>(isRec(pr.byType) ? pr.byType : {})) {
          if (!(name in own) && !TEMPLATE_BASES.includes(name)) eM(`/presentation/byType/${esc(type)}`, `unknown template "${name}"`);
        }
      }
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
  numMap(R.gameVars, '/gameVars', false);
  if (R.grid !== undefined && !(isRec(R.grid) && Number.isInteger(R.grid.cols) && Number.isInteger(R.grid.rows) && R.grid.cols > 0 && R.grid.rows > 0 && R.grid.cols * R.grid.rows <= 400)) eR('/grid', 'needs integers {cols, rows} (at most 400 cells)');
  if (R.external !== undefined && !(isRec(R.external) && Object.values(R.external).every((d) => Array.isArray(d) && d.length > 0 && d.every((v) => typeof v === 'string' || typeof v === 'number')))) eR('/external', 'must map names to non-empty lists of allowed values');
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
    if (z.slots !== undefined) {
      if (!Array.isArray(z.slots) || !z.slots.length || !z.slots.every((sp: any) => isRec(sp) && typeof sp.id === 'string')) { eR(`/zones/${i}/slots`, 'must be a non-empty array of {id, types?, kinds?, cap?, tags?, adj?}'); return; }
      const sids = new Set<string>();
      z.slots.forEach((sp: any, j: number) => {
        const p = `/zones/${i}/slots/${j}`;
        if (sids.has(sp.id)) eR(`${p}/id`, `duplicate slot "${sp.id}"`);
        sids.add(sp.id);
        if (sp.cap !== undefined && !(Number.isInteger(sp.cap) && sp.cap >= 1)) eR(`${p}/cap`, 'must be an integer >= 1');
        for (const k of ['types', 'kinds', 'tags', 'adj']) if (sp[k] !== undefined && !(Array.isArray(sp[k]) && sp[k].every((x: unknown) => typeof x === 'string'))) eR(`${p}/${k}`, 'must be an array of strings');
      });
      z.slots.forEach((sp: any, j: number) => (sp.adj ?? []).forEach((a: string, k: number) => { if (!sids.has(a)) eR(`/zones/${i}/slots/${j}/adj/${k}`, `unknown slot "${a}"`); }));
    }
  });
  for (const k of ['deckZone', 'handZone', 'graveZone']) if (!zones.has(R[k])) eR(`/${k}`, `unknown zone "${R[k]}"`);
  const phases = new Set<string>();
  if (isRec(R.grid)) (R.grid.zones ?? []).forEach((z: unknown, i: number) => { if (typeof z !== 'string' || !zones.has(z)) eR(`/grid/zones/${i}`, `unknown zone "${z}"`); });
  R.phases.forEach((ph: any, i: number) => {
    if (typeof ph.id !== 'string' || phases.has(ph.id)) eR(`/phases/${i}/id`, 'phase ids must be unique strings');
    phases.add(ph.id);
  });
  const wins: Record<string, any> = isRec(R.windows) ? R.windows : {};
  if (R.windows !== undefined && !isRec(R.windows)) eR('/windows', 'must be an object of {steps, timing?}');
  const steps = new Set<string>();
  for (const [wid, w] of Object.entries(wins)) {
    const p = `/windows/${esc(wid)}`;
    if (!isRec(w) || !Array.isArray(w.steps) || !w.steps.length || !w.steps.every(isRec)) { eR(`${p}/steps`, 'a window needs a non-empty array of steps'); continue; }
    const own = new Set<string>();
    w.steps.forEach((st: any, i: number) => {
      if (typeof st.id !== 'string' || own.has(st.id)) eR(`${p}/steps/${i}/id`, 'step ids must be unique strings');
      own.add(st.id);
      steps.add(st.id);
    });
  }
  const res: Record<string, any> = isRec(R.resources) ? R.resources : {};
  if (R.resources !== undefined && !isRec(R.resources)) eR('/resources', 'must be an object of {types, generic?, expire?}');
  for (const [rid, r] of Object.entries(res)) {
    const p = `/resources/${esc(rid)}`;
    if (!isRec(r) || !Array.isArray(r.types) || !r.types.length || !r.types.every((x: unknown) => typeof x === 'string')) eR(`${p}/types`, 'needs a non-empty array of type names');
    else if (r.types.includes(r.generic ?? 'any')) eR(`${p}/generic`, `the generic key "${r.generic ?? 'any'}" cannot also be a type`);
    if (isRec(r) && r.expire !== undefined && !['phase', 'turn'].includes(r.expire)) eR(`${p}/expire`, 'must be "phase" or "turn"');
  }
  const cardIds = new Set<string>(Array.isArray(def.cards) ? def.cards.map((c: any) => c?.id) : []);
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
  const slotZone = (x: string, ptr: string, err: Err) => {
    if (x[0] === '$') return;
    const z = R.zones.find((zz: any) => zz.id === x);
    if (!z) err(ptr, `unknown zone "${x}"`);
    else if (!Array.isArray(z.slots)) err(ptr, `zone "${x}" has no slots`);
  };
  const resLit = (x: unknown, ptr: string, err: Err) => { if (typeof x === 'string' && x[0] !== '$' && !(x in res)) err(ptr, `unknown resource "${x}"`); };
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
    if (op === 'near' && !isRec(R.grid)) err(`${ptr}/0`, 'near needs rules.grid');
    if (op === 'ext' && typeof e[1] === 'string' && !(isRec(R.external) && e[1] in R.external)) err(`${ptr}/1`, `unknown external input "${e[1]}"`);
    if (op === 'call') callCheck(e, ptr, err, fns, 'function');
    if ((op === 'canPay' || op === 'pool') && typeof e[2] === 'string' && !(e[2] in res)) err(`${ptr}/2`, `unknown resource "${e[2]}"`);
    if ((op === 'inSlot' || op === 'freeSlots') && typeof e[2] === 'string') slotZone(e[2], `${ptr}/2`, err);
    if ((op === 'slots' || op === 'adjSlots') && typeof e[1] === 'string') slotZone(e[1], `${ptr}/1`, err);
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
        case 'move': X(1); zoneLit(eff[2], `${p}/2`, err); X(2); if (isRec(eff[3])) { expr(eff[3].player, `${p}/3/player`, err); expr(eff[3].slot, `${p}/3/slot`, err); } return;
        case 'openWindow':
          if (typeof eff[1] !== 'string' || !(eff[1] in wins)) err(`${p}/1`, `unknown window "${eff[1]}"`);
          if (eff[2] !== undefined && !(isRec(eff[2]) && (eff[2].data === undefined || isRec(eff[2].data)))) err(`${p}/2`, 'options must be {data?: {key: expr}}');
          else if (isRec(eff[2]?.data)) for (const [k, v] of Object.entries(eff[2].data)) expr(v, `${p}/2/data/${esc(k)}`, err);
          return;
        case 'winSet': if (typeof eff[1] !== 'string') err(`${p}/1`, 'winSet needs a key'); X(2); return;
        case 'pay': case 'gain': case 'empty': X(1); resLit(eff[2], `${p}/2`, err); X(3); return;
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
        case 'commit': {
          const o = eff[1] as any;
          if (!isRec(o) || o.from === undefined || !isVar(o.as)) { err(`${p}/1`, 'commit needs {from, as: "$name"} (who defaults to all players)'); return; }
          for (const k of ['who', 'from', 'min', 'max']) expr(o[k], `${p}/1/${k}`, err);
          return;
        }
        case 'gotoPhase': if (typeof eff[1] === 'string' && !phases.has(eff[1]) && !steps.has(eff[1])) err(`${p}/1`, `unknown phase or step "${eff[1]}"`); return;
        case 'create':
          X(1); X(2); zoneLit(eff[3], `${p}/3`, err);
          if (typeof eff[1] === 'string' && eff[1][0] !== '$' && !cardIds.has(eff[1])) err(`${p}/1`, `unknown card "${eff[1]}"`);
          return;
        case 'random': {
          const o = eff[1] as any;
          if (!isRec(o) || !isVar(o.as) || (o.from === undefined && o.max === undefined)) { err(`${p}/1`, 'random needs {min?, max, as} or {from, n?, as}'); return; }
          for (const k of ['from', 'n', 'min', 'max']) expr(o[k], `${p}/1/${k}`, err);
          return;
        }
        default: eff.forEach((_, j) => { if (j > 0) X(j); });
      }
    });
  };
  const timing = (t: any, ptr: string) => {
    if (t !== undefined && !(isRec(t) && ['immediate', 'stack', 'chain', 'alternate'].includes(t.mode))) eR(ptr, 'timing.mode must be immediate, stack, chain or alternate');
    else if (t?.first !== undefined) expr(t.first, `${ptr}/first`, eR);
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
      for (const k of ['from', 'min', 'max']) expr(d?.[k], `${ptr}/${i}/${k}`, err);
    });
  };
  const limit = (x: any, ptr: string, err: Err) => {
    if (x === undefined) return;
    if (!isRec(x) || !['turn', 'phase', 'game'].includes(x.per)) { err(ptr, 'limit needs {per: turn|phase|game, n?, by?, group?}'); return; }
    if (x.n !== undefined && !(Number.isInteger(x.n) && x.n >= 1)) err(`${ptr}/n`, 'must be an integer >= 1');
    if (x.by !== undefined && !['player', 'source', 'card', 'name', 'inst'].includes(x.by)) err(`${ptr}/by`, 'must be player, source, card, name or inst');
    if (x.group !== undefined && typeof x.group !== 'string') err(`${ptr}/group`, 'must be a string');
  };
  const abilities = (l: unknown, ptr: string, err: Err) => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(ptr, 'must be an array'); return; }
    l.forEach((ab: any, i: number) => {
      const p = `${ptr}/${i}`;
      if (typeof ab?.on !== 'string') err(`${p}/on`, 'missing "on"');
      (ab?.zones ?? []).forEach((z: unknown, j: number) => zoneLit(z, `${p}/zones/${j}`, err));
      expr(ab?.if, `${p}/if`, err);
      limit(ab?.limit, `${p}/limit`, err);
      effects(ab?.do, `${p}/do`, err);
    });
  };
  const params = (x: unknown, ptr: string) => {
    if (!Array.isArray(x) || !x.every(isVar) || new Set(x).size !== x.length) eR(ptr, 'params must be unique "$name" strings');
  };

  const activatedFields = new Set<string>();
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
  for (const [wid, w] of Object.entries<any>(wins)) {
    if (!isRec(w) || !Array.isArray(w.steps)) continue;
    timing(w.timing, `/windows/${esc(wid)}/timing`);
    w.steps.forEach((st: any, i: number) => { if (isRec(st)) { timing(st.timing, `/windows/${esc(wid)}/steps/${i}/timing`); effects(st.do, `/windows/${esc(wid)}/steps/${i}/do`, eR); } });
  }
  for (const [name, a] of Object.entries<any>(R.actions)) {
    const p = `/actions/${esc(name)}`;
    if (name === 'pass') eR(p, '"pass" is reserved');
    if (name.includes('#')) eR(p, '"#" is reserved for activated abilities (name#index)');
    if (!isRec(a)) { eR(p, 'must be an object'); continue; }
    (a.phases ?? []).forEach((ph: string, j: number) => { if (!phases.has(ph) && !steps.has(ph)) eR(`${p}/phases/${j}`, `unknown phase or window step "${ph}"`); });
    limit(a.limit, `${p}/limit`, eR);
    if (a.speed !== undefined && !(Number.isInteger(a.speed) && a.speed >= 1)) eR(`${p}/speed`, 'must be an integer >= 1');
    expr(a.source, `${p}/source`, eR);
    for (const k of ['req', 'check']) (a[k] ?? []).forEach((q: any, j: number) => expr(q?.if, `${p}/${k}/${j}/if`, eR));
    slots(a.targets, `${p}/targets`, eR);
    for (const k of ['cost', 'do', 'countered']) effects(a[k], `${p}/${k}`, eR);
    if (!Array.isArray(a.do)) eR(`${p}/do`, 'required');
    if (a.activated !== undefined) {
      if (typeof a.activated !== 'string' || ['targets', 'abilities', 'statics', 'replacements'].includes(a.activated)) eR(`${p}/activated`, 'must name a card field holding a list of abilities');
      else activatedFields.add(a.activated);
    }
  }
  if (R.targeting !== undefined) { if (!isRec(R.targeting) || R.targeting.deny === undefined) eR('/targeting', 'needs {deny: expr}'); else expr(R.targeting.deny, '/targeting/deny', eR); }
  if (R.teams !== undefined && typeof R.teams !== 'boolean') eR('/teams', 'must be true or false');

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
      if (activatedFields.has(k)) {
        if (!Array.isArray(v) || !v.every(isRec)) { err(`/${esc(k)}`, 'activated abilities must be an array of {label?, req?, targets?, cost?, do, limit?}'); continue; }
        v.forEach((ab: any, j: number) => {
          const q = `/${esc(k)}/${j}`;
          if (!Array.isArray(ab.do)) err(`${q}/do`, 'required');
          (ab.phases ?? []).forEach((ph: string, n: number) => { if (!phases.has(ph) && !steps.has(ph)) err(`${q}/phases/${n}`, `unknown phase or window step "${ph}"`); });
          for (const kk of ['req', 'check']) (ab[kk] ?? []).forEach((r: any, n: number) => expr(r?.if, `${q}/${kk}/${n}/if`, err));
          slots(ab.targets, `${q}/targets`, err);
          limit(ab.limit, `${q}/limit`, err);
          for (const kk of ['cost', 'do', 'countered']) effects(ab[kk], `${q}/${kk}`, err);
        });
      } else if (Array.isArray(v) && Array.isArray(v[0]) && !['targets', 'abilities', 'statics', 'replacements'].includes(k)) effects(v, `/${esc(k)}`, err);
    }
  });

  // ---- AI hints ----
  if (def.ai !== undefined) {
    const eA = at('ai');
    if (!isRec(def.ai)) eA('', 'must be an object');
    else {
      expr(def.ai.eval, '/eval', eA);
      if (def.ai.bias !== undefined && (!isRec(def.ai.bias) || Object.values(def.ai.bias).some((v) => typeof v !== 'number'))) eA('/bias', 'must be an object of numbers');
      if (def.ai.samples !== undefined && !(Number.isInteger(def.ai.samples) && def.ai.samples >= 1 && def.ai.samples <= 16)) eA('/samples', 'must be an integer 1-16');
    }
  }

  // ---- decks, deck formats, shared decks ----
  const fz = isRec(F) ? F.zones : undefined;
  if (fz !== undefined) {
    if (!Array.isArray(fz)) eR('/format/zones', 'must be an array');
    else fz.forEach((z: any, i: number) => {
      if (!isRec(z) || !zones.has(z.zone) || !Number.isInteger(z.min) || !Number.isInteger(z.max)) eR(`/format/zones/${i}`, 'needs {zone (a known zone), min, max, types?, maxCopies?}');
      else if (z.maxCopies !== undefined && !(Number.isInteger(z.maxCopies) && z.maxCopies >= 1)) eR(`/format/zones/${i}/maxCopies`, 'must be an integer >= 1');
    });
  }
  if (isRec(F)) {
    if (F.copiesBy !== undefined && typeof F.copiesBy !== 'string') eR('/format/copiesBy', 'must be a card field name');
    if (F.rules !== undefined) {
      if (!Array.isArray(F.rules)) eR('/format/rules', 'must be an array of {if, why}');
      else F.rules.forEach((q: any, i: number) => {
        if (!isRec(q) || typeof q.why !== 'string' || q.if === undefined) eR(`/format/rules/${i}`, 'needs {if: expr, why: text}');
        else expr(q.if, `/format/rules/${i}/if`, eR);
      });
    }
  }
  const cardList = (l: unknown, ptr: string, err: Err) => {
    if (!Array.isArray(l)) { err(ptr, 'must be an array of card ids'); return; }
    l.forEach((c, j) => { if (!ids.has(c as string)) err(`${ptr}/${j}`, `unknown card "${c}"`); });
  };
  if (R.sharedDecks !== undefined) {
    if (!isRec(R.sharedDecks)) eR('/sharedDecks', 'must be an object of zone -> card ids');
    else for (const [z, l] of Object.entries(R.sharedDecks)) {
      if (!R.zones.some((x: any) => x.id === z && x.shared)) eR(`/sharedDecks/${esc(z)}`, `"${z}" is not a shared zone`);
      cardList(l, `/sharedDecks/${esc(z)}`, (ptr, msg) => eR(ptr, msg));
    }
  }
  if (def.decks !== undefined && !isRec(def.decks)) eD('', 'must be an object of decks');
  else for (const [name, d] of Object.entries(def.decks ?? {})) {
    const p = `/${esc(name)}`;
    if (Array.isArray(d)) cardList(d, p, eD);
    else if (isRec(d)) for (const [z, l] of Object.entries(d)) {
      if (!Array.isArray(fz) || !fz.some((x: any) => x?.zone === z)) eD(`${p}/${esc(z)}`, `"${z}" is not a deck section in rules.format.zones`);
      cardList(l, `${p}/${esc(z)}`, eD);
    } else eD(p, 'must be a card list or {zone: card list}');
  }
  return out;
}

/** A deck as {zone: card ids}; a plain list is the main deck. */
export const deckSections = (m: Mod, deck: Deck): Record<string, string[]> =>
  (Array.isArray(deck) ? { [m.rules.deckZone]: deck } : deck);

export function deckErrors(m: Mod, deck: Deck): string[] {
  const f = m.rules.format;
  const errs: string[] = [];
  if (!Array.isArray(deck) && (!deck || typeof deck !== 'object')) return ['deck must be a card list or {zone: card list}'];
  const parts = deckSections(m, deck);
  const specs = f.zones ?? [{ zone: m.rules.deckZone, min: f.deckMin, max: f.deckMax }];
  for (const z of Object.keys(parts)) if (!specs.some((sp) => sp.zone === z)) errs.push(`unexpected deck section "${z}"`);
  // Copies are grouped by card id, or by a shared card field (copiesBy, e.g. "name").
  const keyOf = (c: string) => (f.copiesBy ? String((m.card.get(c) as any)?.[f.copiesBy] ?? c) : c);
  const counts = new Map<string, { n: number; max: number }>();
  for (const sp of specs) {
    const l = parts[sp.zone] ?? [];
    const label = f.zones ? `${sp.zone} section` : 'deck';
    if (!Array.isArray(l)) { errs.push(`${label} must be a card list`); continue; }
    if (l.length < sp.min || l.length > sp.max) errs.push(`${label} has ${l.length} cards (needs ${sp.min}-${sp.max})`);
    const local = new Map<string, number>();
    for (const c of l) {
      const card = m.card.get(c);
      if (!card) { errs.push(`unknown card "${c}"`); continue; }
      if (sp.types && !sp.types.includes(card.type)) errs.push(`"${c}" (${card.type}) cannot go in the ${sp.zone} section`);
      const k = keyOf(c);
      const prev = counts.get(k);
      const max = Math.min(prev?.max ?? Infinity, (card.maxCopies as number | undefined) ?? f.maxCopies);
      counts.set(k, { n: (prev?.n ?? 0) + 1, max });
      local.set(k, (local.get(k) ?? 0) + 1);
    }
    if (sp.maxCopies !== undefined) for (const [k, n] of local) if (n > sp.maxCopies) errs.push(`${n} copies of "${k}" in the ${sp.zone} section (max ${sp.maxCopies})`);
  }
  for (const [k, { n, max }] of counts) if (n > max) errs.push(`${n} copies of "${k}" (max ${max})`);
  if (f.rules?.length && !errs.some((e) => e.startsWith('unknown card'))) {
    const ctx = { $deck: Object.values(parts).flat(), $sections: Object.fromEntries(specs.map((sp) => [sp.zone, parts[sp.zone] ?? []])) };
    for (const q of f.rules) {
      try {
        if (!ev(m, DECK_STATE, q.if, ctx)) errs.push(q.why);
      } catch (e) {
        errs.push(`${q.why} (could not be checked: ${(e as Error).message})`);
      }
    }
  }
  return errs;
}

/** Deck rules run before any match exists: an empty state (no players, objects or zones). */
const DECK_STATE = {
  players: [], objects: {}, zones: {}, vars: {}, ext: {}, stack: [], windows: [], uses: {}, turn: { n: 0, active: 0, phase: 0 },
} as unknown as State;

/** Validates a scenario against a module with the module's own walkers. Issues read "scenario/setup/0/...". */
export function validateScenario(def: ModuleDef, sc: Scenario): string[] {
  if (!sc || typeof sc !== 'object') return ['scenario: must be an object'];
  const errs: string[] = [];
  if (sc.vars !== undefined && (typeof sc.vars !== 'object' || Object.values(sc.vars).some((v) => typeof v !== 'number'))) errs.push('scenario/vars: must be an object of numbers');
  const probe: ModuleDef = { ...def, rules: { ...def.rules, setup: sc.setup ?? [], triggers: sc.triggers ?? [] } };
  for (const i of validateIssues(probe)) {
    if (i.where === 'rules' && (i.ptr.startsWith('/setup') || i.ptr.startsWith('/triggers'))) errs.push(`scenario${i.ptr}: ${i.msg}`);
  }
  return errs;
}
