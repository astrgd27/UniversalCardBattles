// Continuous effects: computed characteristics (rules.stats + keywords) by layer, timestamp and dependency.
import type { Ctx, Mod, State, StaticDef } from './types.ts';
import { ev } from './expr.ts';
import { EngineError, activeId, baseCtx, list, num, zoneIdOf } from './util.ts';
import { cardNow, defNow } from './identity.ts';

export interface Chars { stats: Record<string, any>; kw: Set<string> }
type CMap = Map<string, Chars>;
interface Entry { ver: number; map: CMap }
interface CE { key: string; ts: number; layer: number; st?: { def: StaticDef; ctx: Ctx }; targets?: string[]; mods?: any[]; rw: RW }
/** What an effect reads and writes: stat names and "kw:<keyword>"; "*" = unknown (script calls). */
interface RW { reads: Set<string>; writes: Set<string> }
const rwCache = new WeakMap<object, RW>();
function scan(e: unknown, out: Set<string>) {
  if (!Array.isArray(e)) return;
  if (e[0] === 'get' && typeof e[2] === 'string') out.add(e[2]);
  else if (e[0] === 'has' && typeof e[2] === 'string') out.add(`kw:${e[2]}`);
  else if (e[0] === 'has' || e[0] === 'get' || e[0] === 'call') out.add('*');
  for (const x of e) scan(x, out);
}
const writesOf = (mods: { op: string; stat?: string; kw?: string }[] = []) => new Set(mods.map((md) => (md.kw !== undefined ? `kw:${md.kw}` : md.stat!)));
function rwStatic(def: StaticDef): RW {
  let rw = rwCache.get(def);
  if (!rw) {
    const reads = new Set<string>();
    scan(def.affects, reads); scan(def.if, reads); (def.mods ?? []).forEach((md) => scan(md.value, reads));
    rw = { reads, writes: writesOf(def.mods) };
    rwCache.set(def, rw);
  }
  return rw;
}
type Res = [string, any[]][];

const cache = new WeakMap<State, Entry>();
/** Drop cached characteristics (only needed after mutating state outside the engine, e.g. test fixtures). */
export const invalidate = (s: State) => cache.delete(s);
export const tsOf = (id: string) => +id.slice(1);
export const computes = (m: Mod) => !!(m.rules.stats?.length || m.rules.layers?.length);

/** Base value: object var if set, else card definition field. Players: their var. */
export function rawVal(m: Mod, s: State, ref: string, name: string): number {
  if (ref === 'game') return s.vars[name] ?? 0;
  const p = s.players.find((x) => x.id === ref);
  if (p) return p.vars[name] ?? 0;
  const o = s.objects[ref];
  if (!o) return 0;
  return name in o.vars ? o.vars[name] : num((m.card.get(cardNow(m, s, o)) as any)?.[name]);
}

function collect(m: Mod, s: State): CE[] {
  const L = m.rules.layers ?? [];
  const li = (n: string) => {
    const i = L.indexOf(n);
    if (i < 0) throw new EngineError(`Unknown layer ${n}`);
    return i;
  };
  const out: CE[] = [];
  (m.rules.statics ?? []).forEach((def, i) => def.identity || out.push({ key: `rule:${i}`, ts: 0, layer: li(def.layer!), st: { def, ctx: baseCtx(s, activeId(s)) }, rw: rwStatic(def) }));
  for (const key in s.zones) {
    const zid = zoneIdOf(key);
    const zd = m.zone.get(zid)!;
    for (const id of s.zones[key]) {
      const o = s.objects[id];
      if (o.fd) continue;
      defNow(m, s, o)?.statics?.forEach((def, i) => {
        if (def.identity || !(def.zones ? def.zones.includes(zid) : zd.abilities)) return;
        out.push({ key: `${id}:${i}`, ts: tsOf(id), layer: li(def.layer!), st: { def, ctx: { ...baseCtx(s, o.controller), $self: id } }, rw: rwStatic(def) });
      });
    }
  }
  for (const e of s.effects) out.push({ key: e.id, ts: e.ts, layer: li(e.layer), targets: e.targets, mods: e.mods, rw: { reads: new Set(), writes: writesOf(e.mods) } });
  return out;
}

function resolve(m: Mod, s: State, ce: CE): Res {
  if (!ce.st) return ce.targets!.filter((t) => s.objects[t]).map((t) => [t, ce.mods!]);
  const { def, ctx } = ce.st;
  if (def.if !== undefined && !ev(m, s, def.if, ctx)) return [];
  return list(ev(m, s, def.affects, ctx))
    .filter((t) => s.objects[t])
    .map((t) => [t, def.mods!.map((md) => ({ ...md, value: md.value === undefined ? undefined : ev(m, s, md.value, { ...ctx, $it: t }) }))]);
}

function applyRes(map: CMap, res: Res) {
  for (const [t, mods] of res) {
    const c = map.get(t);
    if (!c) continue;
    for (const md of mods) {
      if (md.op === 'grant') c.kw.add(md.kw);
      else if (md.op === 'remove') c.kw.delete(md.kw);
      else if (md.op === 'set') c.stats[md.stat] = md.value;
      else if (md.op === 'add') c.stats[md.stat] = num(c.stats[md.stat]) + num(md.value);
    }
  }
}

/** Copy-on-write: a shallow copy of the map where only the entries `res` touches are cloned. */
function withApplied(map: CMap, res: Res): CMap {
  const out = new Map(map);
  for (const [t] of res) { const c = map.get(t); if (c) out.set(t, { stats: { ...c.stats }, kw: new Set(c.kw) }); }
  applyRes(out, res);
  return out;
}

/** a depends on b if applying b first changes what a affects or what it does. */
function dependsOn(m: Mod, s: State, entry: Entry, a: CE, b: CE): boolean {
  if (!a.st) return false;
  // Cheap pre-check: a can only depend on b if a reads something b writes.
  if (!a.rw.reads.has('*') && ![...b.rw.writes].some((w) => a.rw.reads.has(w))) return false;
  const before = JSON.stringify(resolve(m, s, a));
  const saved = entry.map;
  entry.map = withApplied(saved, resolve(m, s, b));
  const after = JSON.stringify(resolve(m, s, a));
  entry.map = saved;
  return before !== after;
}

/** Characteristics of every object, cached per state version (event count). Null if the module computes none. */
export function chars(m: Mod, s: State): CMap | null {
  if (!computes(m)) return null;
  const ver = s.events.length;
  const hit = cache.get(s);
  if (hit && hit.ver === ver) return hit.map;
  const map: CMap = new Map();
  for (const id in s.objects) {
    const o = s.objects[id];
    const stats: Record<string, any> = {};
    for (const st of m.rules.stats ?? []) stats[st] = rawVal(m, s, id, st);
    const kw = new Set(defNow(m, s, o)?.keywords ?? []);
    for (const k in o.vars) if (k.startsWith('kw:') && o.vars[k] > 0) kw.add(k.slice(3));
    map.set(id, { stats, kw });
  }
  const entry: Entry = { ver, map };
  cache.set(s, entry); // recursive reads during computation see the partial (current-layer) values
  try {
    layered(m, s, entry);
  } catch (e) {
    cache.delete(s);
    throw e;
  }
  return entry.map;
}

function layered(m: Mod, s: State, entry: Entry) {
  const ces = collect(m, s);
  for (let l = 0; l < (m.rules.layers ?? []).length; l++) {
    const memo = new Map<string, boolean>();
    const group = ces.filter((c) => c.layer === l).sort((a, b) => a.ts - b.ts || (a.key < b.key ? -1 : 1));
    while (group.length) {
      let pick = 0;
      if (group.length > 1 && group.some((g) => g.st)) {
        // Dependencies are evaluated once per pair per layer pass (memoised).
        const dep = (a: CE, b: CE) => {
          const k = `${a.key}|${b.key}`;
          if (!memo.has(k)) memo.set(k, dependsOn(m, s, entry, a, b));
          return memo.get(k)!;
        };
        const i = group.findIndex((a) => !group.some((b) => b !== a && dep(a, b)));
        pick = i < 0 ? 0 : i; // dependency cycle: fall back to timestamp order
      }
      applyRes(entry.map, resolve(m, s, group.splice(pick, 1)[0]));
    }
  }
}
