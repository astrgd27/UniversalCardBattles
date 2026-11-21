// Expression evaluator for the S-expression DSL. See docs/DSL.md.
import type { Ctx, Mod, State } from './types.ts';
import { chars } from './layers.ts';
import { EngineError, ScriptError, list, nextPlayer, num, one, player, zoneIdOf } from './util.ts';

export const EXPR_OPS = new Set([
  'lit', '+', '-', '*', '/', 'neg', 'min', 'max', '=', '!=', '<', '<=', '>', '>=', 'and', 'or', 'not', '?',
  'get', 'has', 'players', 'opp', 'cards', 'top', 'count', 'concat', 'list', 'first', 'filter', 'any', 'all',
  'sum', 'in', 'isPlayer', 'isObj', 'stack', 'linked', 'call', 'let', 'map', 'range', 'mod', 'abs', 'sortBy', 'maxBy', 'minBy',
  'slice', 'reverse', 'nth',
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

export function lookup(s: State, ctx: Ctx, name: string): any {
  const parts = name.split('.');
  const h = parts[0];
  let v: any;
  if (h in ctx) v = ctx[h];
  else if (h === '$turn') v = s.turn.n;
  else if (h === '$active') v = s.players[s.turn.active].id;
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
  const p = player(s, r);
  if (p) return name === 'id' ? p.id : name === 'lost' ? p.lost : (p.vars[name] ?? 0);
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
    case 'card': return o.card;
  }
  if (o.rel && name in o.rel) return o.rel[name];
  if (m.rules.stats?.includes(name)) return chars(m, s)!.get(r)!.stats[name];
  if (name in o.vars) return o.vars[name];
  return (m.card.get(o.card) as any)?.[name] ?? 0;
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
  if (typeof e === 'string') return e.charCodeAt(0) === 36 ? lookup(s, ctx, e) : e;
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
      return (m.card.get(o.card)?.keywords ?? []).includes(k) || (o.vars[`kw:${k}`] ?? 0) > 0;
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
  }
  throw new EngineError(`Unknown expression op ${e[0]}`);
}
