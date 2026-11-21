// Expression evaluator for the S-expression DSL. See docs/DSL.md.
import type { Ctx, Mod, State } from './types.ts';
import { EngineError, list, nextPlayer, num, one, player, zoneIdOf } from './util.ts';

export const EXPR_OPS = new Set([
  'lit', '+', '-', '*', '/', 'neg', 'min', 'max', '=', '!=', '<', '<=', '>', '>=', 'and', 'or', 'not', '?',
  'get', 'has', 'players', 'opp', 'cards', 'top', 'count', 'concat', 'list', 'first', 'filter', 'any', 'all',
  'sum', 'in', 'isPlayer', 'isObj',
]);

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

/** Property of a player or game object. Object vars override card-definition fields. */
export function getProp(m: Mod, s: State, ref: any, name: string): any {
  const r = one(ref);
  if (r == null) return undefined;
  const p = player(s, r);
  if (p) return name === 'id' ? p.id : name === 'lost' ? p.lost : (p.vars[name] ?? 0);
  const o = s.objects[r];
  if (!o) return undefined;
  switch (name) {
    case 'id': return o.id;
    case 'owner': return o.owner;
    case 'controller': return o.controller;
    case 'zone': return zoneIdOf(o.zone);
    case 'card': return o.card;
  }
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
  }
  throw new EngineError(`Unknown expression op ${e[0]}`);
}
