// Expression evaluator for the S-expression DSL. See docs/DSL.md.
import type { Ctx, Mod, State } from './types.ts';
import { chars } from './layers.ts';
import { cardNow, defNow } from './identity.ts';
import { redact } from './view.ts';
import { EngineError, ScriptError, curPhase, freeSlots, inSlot, list, nextPlayer, num, one, player, slotsOf, topWin, zkey, zoneIdOf } from './util.ts';

export const EXPR_OPS = new Set([
  'lit', '+', '-', '*', '/', 'neg', 'min', 'max', '=', '!=', '<', '<=', '>', '>=', 'and', 'or', 'not', '?',
  'get', 'has', 'players', 'opp', 'cards', 'top', 'count', 'concat', 'list', 'first', 'filter', 'any', 'all',
  'sum', 'in', 'isPlayer', 'isObj', 'stack', 'linked', 'call', 'let', 'map', 'range', 'mod', 'abs', 'sortBy', 'maxBy', 'minBy',
  'slice', 'reverse', 'nth', 'at', 'keys', 'values', 'same', 'cell', 'cx', 'cy', 'cellOf', 'dist', 'near', 'ext',
  'allies', 'enemies', 'layer', 'def', 'tally', 'distinct', 'meets', 'canPay', 'pool', 'slots', 'inSlot', 'freeSlots', 'adjSlots', 'adjacent', 'uses',
]);

/** Script limits: evaluation steps per outermost function call, and call depth. */
export const GAS = 100_000;
export const MAX_DEPTH = 64;
let depth = 0;
let gas = 0;
/** Context visible inside scripts: the caller's $me/$opp/$self/$e plus the declared parameters. */
export function scriptCtx(ctx: Ctx, params: string[], args: unknown[]): Ctx {
  const c: Ctx = {};
  for (const k of ['$me', '$opp', '$self', '$e']) if (k in ctx) c[k] = ctx[k];
  params.forEach((p, i) => { c[p] = args[i]; });
  return c;
}

export function lookup(m: Mod, s: State, ctx: Ctx, name: string): any {
  const parts = name.split('.');
  const h = parts[0];
  let v: any;
  if (h in ctx) v = ctx[h];
  else if (h === '$turn') v = s.turn.n;
  else if (h === '$active') v = s.players[s.turn.active].id;
  else if (h === '$phase') v = curPhase(m, s).id;
  else if (h === '$last') v = lastEvent(s, ctx.$me);
  else if (h === '$win') v = topWin(s)?.data ?? null;
  else if (h === '$window') v = topWin(s)?.id ?? null;
  else throw new EngineError(`Unbound variable ${h}`);
  for (let i = 1; i < parts.length; i++) v = v == null ? undefined : v[parts[i]];
  return v;
}

/**
 * Property of a player, game object or stack item. Objects: special names, then relationships,
 * then computed stats (rules.stats), then vars, then card-definition fields.
 */
export function getProp(m: Mod, s: State, ref: any, name: string): any {
  const r = one(ref);
  if (r == null) return undefined;
  if (r === 'game') return s.vars[name] ?? 0;
  const p = player(s, r);
  if (p) return name === 'id' ? p.id : name === 'lost' ? p.lost : name === 'seat' ? s.players.indexOf(p) : (p.vars[name] ?? 0);
  const o = s.objects[r];
  if (!o) {
    const it = s.stack.find((x) => x.id === r);
    if (!it) return undefined;
    return name === 'controller' ? it.ctrl : (it as any)[name];
  }
  switch (name) {
    case 'id': return o.id;
    case 'owner': return o.owner;
    case 'controller': return o.controller;
    case 'zone': return zoneIdOf(o.zone);
    case 'card': return cardNow(m, s, o);
    case 'printed': return o.card;
    case 'faceDown': return !!o.fd;
    case 'slot': return o.slot ?? null;
  }
  if (o.rel && name in o.rel) return o.rel[name];
  if (m.rules.stats?.includes(name)) return chars(m, s)!.get(r)!.stats[name];
  if (name in o.vars) return o.vars[name];
  return (defNow(m, s, o) as any)?.[name] ?? 0;
}

const eq = (a: any, b: any) => (a === b ? true : JSON.stringify(a) === JSON.stringify(b));

export function cardsIn(m: Mod, s: State, who: any, zone: string): string[] {
  const zd = m.zone.get(zone);
  if (!zd) throw new EngineError(`Unknown zone ${zone}`);
  if (zd.shared) return [...(s.zones[`shared:${zone}`] ?? [])];
  if (who === '*') return s.players.flatMap((p) => s.zones[`${p.id}:${zone}`] ?? []);
  return [...(s.zones[`${one(who)}:${zone}`] ?? [])];
}

export function ev(m: Mod, s: State, e: any, ctx: Ctx): any {
  if (depth > 0 && --gas < 0) throw new ScriptError(`Script gas limit (${GAS} steps) exceeded`);
  if (typeof e === 'string') return e.charCodeAt(0) === 36 ? lookup(m, s, ctx, e) : e;
  if (!Array.isArray(e) || typeof e[0] !== 'string') return e;
  const A = (i: number) => ev(m, s, e[i], ctx);
  const each = (fn: (it: any) => any) => list(A(1)).map((it) => fn(it));
  const pred = (it: any) => ev(m, s, e[2], { ...ctx, $it: it });
  switch (e[0]) {
    case 'lit': return e[1];
    case '+': { let t = 0; for (let i = 1; i < e.length; i++) t += num(A(i)); return t; }
    case '-': return num(A(1)) - num(A(2));
    case '*': return num(A(1)) * num(A(2));
    case '/': return Math.floor(num(A(1)) / num(A(2)));
    case 'neg': return -num(A(1));
    case 'min': return Math.min(num(A(1)), num(A(2)));
    case 'max': return Math.max(num(A(1)), num(A(2)));
    case '=': return eq(one(A(1)), one(A(2)));
    case '!=': return !eq(one(A(1)), one(A(2)));
    case '<': return num(A(1)) < num(A(2));
    case '<=': return num(A(1)) <= num(A(2));
    case '>': return num(A(1)) > num(A(2));
    case '>=': return num(A(1)) >= num(A(2));
    case 'and': for (let i = 1; i < e.length; i++) if (!A(i)) return false; return true;
    case 'or': for (let i = 1; i < e.length; i++) if (A(i)) return true; return false;
    case 'not': return !A(1);
    case '?': return A(1) ? A(2) : A(3);
    case 'get': return getProp(m, s, A(1), A(2));
    case 'has': {
      const o = s.objects[one(A(1))];
      if (!o) return false;
      const k = A(2);
      const ch = chars(m, s);
      if (ch) return ch.get(o.id)!.kw.has(k);
      return (defNow(m, s, o)?.keywords ?? []).includes(k) || (o.vars[`kw:${k}`] ?? 0) > 0;
    }
    case 'players': return s.players.filter((p) => !p.lost).map((p) => p.id);
    case 'opp': return nextPlayer(s, one(A(1)));
    case 'cards': return cardsIn(m, s, A(1), A(2));
    case 'top': return cardsIn(m, s, A(1), A(2)).slice(0, num(A(3)));
    case 'count': return list(A(1)).length;
    case 'concat': { const out: any[] = []; for (let i = 1; i < e.length; i++) out.push(...list(A(i))); return out; }
    case 'list': return e.slice(1).map((_: any, i: number) => A(i + 1));
    case 'first': return list(A(1))[0] ?? null;
    case 'filter': return list(A(1)).filter(pred);
    case 'any': return list(A(1)).some(pred);
    case 'all': return list(A(1)).every(pred);
    case 'sum': return each((it) => num(ev(m, s, e[2], { ...ctx, $it: it }))).reduce((a: number, b: number) => a + b, 0);
    case 'in': return list(A(2)).includes(one(A(1)));
    case 'isPlayer': return !!player(s, one(A(1)));
    case 'isObj': return one(A(1)) in s.objects;
    case 'stack': return s.stack.map((x) => x.id).reverse(); // top first
    case 'linked': { const t = one(A(1)); const n = A(2); return Object.values(s.objects).filter((o) => o.rel?.[n] === t).map((o) => o.id); }
    case 'call': {
      const fn = m.rules.functions?.[e[1]];
      if (!fn) throw new EngineError(`Unknown function ${e[1]}`);
      const args = e.slice(2).map((_: any, i: number) => A(i + 2));
      if (depth === 0) gas = GAS;
      if (depth >= MAX_DEPTH) throw new ScriptError(`Script recursion deeper than ${MAX_DEPTH}`);
      depth++;
      try {
        return ev(m, s, fn.body, scriptCtx(ctx, fn.params, args));
      } finally {
        depth--;
      }
    }
    case 'let': return ev(m, s, e[3], { ...ctx, [e[1]]: A(2) });
    case 'map': return list(A(1)).map((it) => ev(m, s, e[2], { ...ctx, $it: it }));
    case 'range': {
      const n = num(A(1));
      if (n > 10_000) throw new ScriptError('range larger than 10000');
      return Array.from({ length: Math.max(0, n) }, (_, i) => i);
    }
    case 'mod': { const b = num(A(2)); return b ? ((num(A(1)) % b) + b) % b : 0; }
    case 'abs': return Math.abs(num(A(1)));
    case 'sortBy': {
      const keyed = list(A(1)).map((it, i) => ({ it, i, k: ev(m, s, e[2], { ...ctx, $it: it }) }));
      keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i));
      return keyed.map((x) => x.it);
    }
    case 'maxBy':
    case 'minBy': {
      let best: any = null;
      let bk: any;
      for (const it of list(A(1))) {
        const k = ev(m, s, e[2], { ...ctx, $it: it });
        if (best === null || (e[0] === 'maxBy' ? k > bk : k < bk)) { best = it; bk = k; }
      }
      return best;
    }
    case 'slice': return list(A(1)).slice(num(A(2)), e.length > 3 ? num(A(3)) : undefined);
    case 'reverse': return [...list(A(1))].reverse();
    case 'nth': return list(A(1))[num(A(2))] ?? null;
    case 'at': { const x = A(1); const k = one(A(2)); return x == null ? null : (x[k] ?? null); }
    case 'keys': { const x = A(1); return x && typeof x === 'object' ? Object.keys(x) : []; }
    case 'values': { const x = A(1); return x && typeof x === 'object' ? Object.values(x) : []; }
    case 'same': return JSON.stringify(A(1)) === JSON.stringify(A(2));
    case 'cell': return `${num(A(1))},${num(A(2))}`;
    case 'cx': return xy(m, s, A(1))[0];
    case 'cy': return xy(m, s, A(1))[1];
    case 'cellOf': { const [x, y] = xy(m, s, A(1)); return `${x},${y}`; }
    case 'dist': { const a = xy(m, s, A(1)); const b = xy(m, s, A(2)); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }
    case 'near': {
      const g = m.rules.grid;
      if (!g) throw new EngineError('near needs rules.grid');
      const [x, y] = xy(m, s, A(1));
      const r = num(A(2));
      const out: string[] = [];
      for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
        const d = Math.abs(i - x) + Math.abs(j - y);
        if (d >= 1 && d <= r) out.push(`${i},${j}`);
      }
      return out;
    }
    case 'ext': return s.ext[String(A(1))] ?? null;
    case 'allies':
    case 'enemies': {
      // Living players on the same / another team (player var `team`); without teams: yourself / everyone else.
      const me = player(s, one(A(1)));
      const same = (q: { id: string; vars: Record<string, number> }) => (me?.vars.team === undefined ? q.id === me?.id : q.vars.team === me.vars.team);
      return s.players.filter((q) => !q.lost && same(q) === (e[0] === 'allies')).map((q) => q.id);
    }
    case 'layer': { const ls = m.rules.grid?.layers ?? []; return ls[num(getProp(m, s, A(1), 'z'))] ?? null; }
    case 'def': { const r = one(A(1)); const c = s.objects?.[r] ? cardNow(m, s, s.objects[r]) : r; return (m.card.get(c) as any)?.[A(2)] ?? null; }
    case 'tally': {
      const out: Record<string, number> = {};
      for (const it of list(A(1))) {
        const k = e.length > 2 ? ev(m, s, e[2], { ...ctx, $it: it }) : it;
        if (k && typeof k === 'object' && !Array.isArray(k)) for (const [kk, v] of Object.entries(k)) out[kk] = (out[kk] ?? 0) + num(v);
        else for (const kk of list(k)) out[String(kk)] = (out[String(kk)] ?? 0) + 1;
      }
      return out;
    }
    case 'distinct': { const seen = new Set<string>(); return list(A(1)).filter((x) => { const k = JSON.stringify(x); return seen.has(k) ? false : (seen.add(k), true); }); }
    case 'meets': { const have = A(1) ?? {}; const need = A(2) ?? {}; return Object.entries(need).every(([k, v]) => num(have[k]) >= num(v)); }
    case 'canPay': return payPlan(m, s, one(A(1)), String(A(2)), A(3)) !== null;
    case 'pool': { const r = resDef(m, String(A(2))); const p = one(A(1)); return Object.fromEntries(r.types.map((t) => [t, num(player(s, p)?.vars[`${A(2)}:${t}`])])); }
    case 'slots': { const tag = e.length > 2 ? A(2) : null; return slotsOf(m, A(1)).filter((sp) => tag === null || sp.tags?.includes(tag)).map((sp) => sp.id); }
    case 'inSlot': return inSlot(s, zkey(m, one(A(1)), A(2)), A(3));
    case 'freeSlots': {
      const c = e.length > 3 ? one(A(3)) : undefined;
      return freeSlots(m, s, zkey(m, one(A(1)), A(2)), c === undefined ? undefined : (s.objects[c]?.card ?? c));
    }
    case 'adjSlots': return slotsOf(m, A(1)).find((sp) => sp.id === A(2))?.adj ?? [];
    case 'adjacent': {
      const o = s.objects[one(A(1))];
      if (!o?.slot) return [];
      const adj = slotsOf(m, zoneIdOf(o.zone)).find((sp) => sp.id === o.slot)?.adj ?? [];
      return s.zones[o.zone].filter((id) => id !== o.id && adj.includes(s.objects[id].slot!));
    }
    case 'uses': return s.uses[`${A(2)}|${A(1)}|${e.length > 3 ? one(A(3)) : ctx.$me}`] ?? 0;
  }
  throw new EngineError(`Unknown expression op ${e[0]}`);
}

/** Grid coordinates of a "x,y" cell string or of an object (its vars x, y). */
function xy(m: Mod, s: State, v: any): [number, number] {
  const r = one(v);
  if (typeof r === 'string' && r.includes(',')) { const [a, b] = r.split(','); return [Number(a) || 0, Number(b) || 0]; }
  return [num(getProp(m, s, r, 'x')), num(getProp(m, s, r, 'y'))];
}

const resDef = (m: Mod, id: string) => {
  const r = m.rules.resources?.[id];
  if (!r) throw new EngineError(`Unknown resource ${id}`);
  return r;
};
/**
 * How player p pays `cost` from typed pool `res`: specific types first, then the generic part from whatever is most
 * plentiful (ties: declared type order). A number is an all-generic cost. Returns the amounts per type, or null.
 */
export function payPlan(m: Mod, s: State, p: string, res: string, cost: any): Record<string, number> | null {
  const r = resDef(m, res);
  const g = r.generic ?? 'any';
  const pl = player(s, p);
  if (!pl) return null;
  const c: Record<string, any> = typeof cost === 'number' ? { [g]: cost } : (cost ?? {});
  const left: Record<string, number> = Object.fromEntries(r.types.map((t) => [t, num(pl.vars[`${res}:${t}`])]));
  const paid: Record<string, number> = Object.fromEntries(r.types.map((t) => [t, 0]));
  for (const [k, v] of Object.entries(c)) {
    if (k === g) continue;
    if (!(k in left) || left[k] < num(v)) return null;
    left[k] -= num(v);
    paid[k] += num(v);
  }
  for (let n = num(c[g]); n > 0; n--) {
    let best: string | null = null;
    for (const t of r.types) if (left[t] > 0 && (best === null || left[t] > left[best])) best = t;
    if (best === null) return null;
    left[best]--;
    paid[best]++;
  }
  return paid;
}

/** Event types that never count as "something happening" ($last, and `last` triggers missing their timing). */
export const QUIET = new Set(['log', 'stacked', 'chose', 'replaced', 'step', 'windowOpened', 'phase', 'pass', 'missed', 'expired']);
/** The most recent meaningful event, redacted for the viewer (legality must not leak hidden information). */
function lastEvent(s: State, me: unknown): any {
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i];
    if (!QUIET.has(e.type)) return typeof me === 'string' ? redact(e, me) : e;
  }
  return null;
}
