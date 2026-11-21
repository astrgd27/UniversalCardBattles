// Object identity: which card definition an object currently uses, and whether it has lost all its abilities.
// Copies apply first (by timestamp), then ability loss, regardless of order (copy before ability-removing layers).
// Identity statics on cards are read from the source's printed card, so identity changes never depend on each other.
import type { CardDef, Mod, Obj, State } from './types.ts';
import { ev } from './expr.ts';
import { activeId, baseCtx, list, one, zoneIdOf } from './util.ts';

export interface Ident { card: string; blank: boolean }
const cache = new WeakMap<State, { ver: number; map: Map<string, Ident> }>();
const blanked = new WeakMap<CardDef, CardDef>();

const has = (s: State) => s.idfx?.length || null;
/** Identities of objects that differ from their printed card (others are implied). */
export function idents(m: Mod, s: State): Map<string, Ident> {
  const ver = s.events.length;
  const hit = cache.get(s);
  if (hit && hit.ver === ver) return hit.map;
  const map = new Map<string, Ident>();
  const entry = { ver, map };
  cache.set(s, entry);
  if (!has(s) && !m.idStatics) return map;
  const copies: [number, string[], string][] = [];
  const blanks: string[] = [];
  const fromStatic = (def: any, ctx: any, ts: number) => {
    if (def.if !== undefined && !ev(m, s, def.if, ctx)) return;
    const targets = list(ev(m, s, def.affects, ctx)).filter((t: string) => s.objects[t]);
    if (def.identity.copy !== undefined) { const c = cardOf(s, one(ev(m, s, def.identity.copy, ctx))); if (c && m.card.has(c)) copies.push([ts, targets, c]); }
    if (def.identity.blank) blanks.push(...targets);
  };
  if (m.idStatics) {
    (m.rules.statics ?? []).forEach((def) => { if (def.identity) fromStatic(def, baseCtx(s, activeId(s)), 0); });
    for (const key in s.zones) {
      const zid = zoneIdOf(key);
      const zd = m.zone.get(zid)!;
      for (const id of s.zones[key]) {
        const o = s.objects[id];
        if (o.fd) continue;
        m.card.get(o.card)?.statics?.forEach((def) => {
          if (def.identity && (def.zones ? def.zones.includes(zid) : zd.abilities)) fromStatic(def, { ...baseCtx(s, o.controller), $self: id }, +id.slice(1));
        });
      }
    }
  }
  for (const f of s.idfx ?? []) {
    if (f.copy) copies.push([f.ts, f.targets, f.copy]);
    if (f.blank) blanks.push(...f.targets);
  }
  copies.sort((a, b) => a[0] - b[0]);
  for (const [, targets, c] of copies) for (const t of targets) if (s.objects[t]) map.set(t, { card: c, blank: false });
  for (const t of blanks) if (s.objects[t]) map.set(t, { card: map.get(t)?.card ?? s.objects[t].card, blank: true });
  return map;
}
const cardOf = (s: State, r: any): string | null => (r == null ? null : s.objects?.[r]?.card ?? String(r));

/** The card an object is now (a copy reports the copied card). */
export const cardNow = (m: Mod, s: State, o: Obj): string => (has(s) || m.idStatics ? idents(m, s).get(o.id)?.card ?? o.card : o.card);
/** The definition an object uses now: copied card, and with no abilities, keywords or activated abilities if blanked. */
export function defNow(m: Mod, s: State, o: Obj): CardDef | undefined {
  if (!has(s) && !m.idStatics) return m.card.get(o.card);
  const id = idents(m, s).get(o.id);
  const d = m.card.get(id?.card ?? o.card);
  if (!d || !id?.blank) return d;
  let b = blanked.get(d);
  if (!b) {
    b = { ...d, abilities: [], statics: [], replacements: [], keywords: [] };
    for (const a of Object.values(m.rules.actions)) if (a.activated) (b as any)[a.activated] = [];
    blanked.set(d, b);
  }
  return b;
}
export const isBlank = (m: Mod, s: State, o: Obj) => (has(s) || m.idStatics ? !!idents(m, s).get(o.id)?.blank : false);
