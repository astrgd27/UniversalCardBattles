import type { Match, Mod } from '#engine';
import { createMatch, invalidate } from '#engine';
import { deckOpts, loadRef } from '#harness';

export const m = loadRef('spark-duel');
export const arcane = loadRef('arcane-duel');
export const fresh = (seed = 3, decks = ['ember-rush', 'stone-ward'], mod: Mod = m) => createMatch(mod, deckOpts(mod, decks, seed));

const used = new WeakMap<object, Set<string>>();
/** Test fixture only: moves an unused copy of a card (from deck or hand) into a zone without events. */
export function place(match: Match, owner: string, card: string, zone: string, vars: Record<string, number> = {}): string {
  const { s } = match;
  const taken = used.get(s) ?? new Set<string>();
  used.set(s, taken);
  const pool = Object.values(s.objects).filter((x) => x.owner === owner && x.card === card && /:(deck|hand)$/.test(x.zone) && !taken.has(x.id));
  const o = pool.find((x) => x.zone.endsWith(':deck')) ?? pool[0];
  if (!o) throw new Error(`no ${card} for ${owner}`);
  taken.add(o.id);
  const from = s.zones[o.zone];
  from.splice(from.indexOf(o.id), 1);
  o.zone = `${owner}:${zone}`;
  s.zones[o.zone].push(o.id);
  Object.assign(o.vars, vars);
  invalidate(s);
  return o.id;
}
export const zone = (match: Match, key: string) => match.s.zones[key];
export const cardsIn = (match: Match, key: string) => match.s.zones[key].map((id) => match.s.objects[id].card);
