import type { Match } from '#engine';
import { createMatch } from '#engine';
import { deckOpts, loadRef } from '#harness';

export const m = loadRef('spark-duel');
export const fresh = (seed = 3, decks = ['ember-rush', 'stone-ward']) => createMatch(m, deckOpts(m, decks, seed));

/** Test fixture only: teleports a card (from deck or hand) into a zone without events, then returns its id. */
export function place(match: Match, owner: string, card: string, zone: string, vars: Record<string, number> = {}): string {
  const { s } = match;
  const o = Object.values(s.objects).find((x) => x.owner === owner && x.card === card && /:(deck|hand)$/.test(x.zone) && !x.zone.endsWith(`:${zone}`));
  if (!o) throw new Error(`no ${card} for ${owner}`);
  const from = s.zones[o.zone];
  from.splice(from.indexOf(o.id), 1);
  o.zone = `${owner}:${zone}`;
  s.zones[o.zone].push(o.id);
  Object.assign(o.vars, vars);
  return o.id;
}
export const zone = (match: Match, key: string) => match.s.zones[key];
