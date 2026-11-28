// Shop and campaign: compiles the blueprint's economy (currencies, boosters, shop items, campaign encounters) into the
// module's campaign data (see packages/campaign). Both parts are optional; a game with neither gets no campaign at all.
import type { Blueprint, CardBP, EncounterBP, Rarity } from './blueprint.ts';

const NON_COLLECTIBLE = ['token', 'leader', 'resource'];
const roleOf = (bp: Blueprint, c: CardBP) => bp.types.find((t) => t.id === c.type)?.role ?? 'unit';
export const shopOn = (bp: Blueprint) => !!bp.economy?.shop?.enabled;
export const campaignOn = (bp: Blueprint) => !!bp.economy?.campaign?.enabled;

/** The cards a booster slot can give (collectible cards matching its rarity, type and color, or its card list). */
export function slotPool(bp: Blueprint, s: { rarity?: Rarity; type?: string; color?: string; cards?: string[] }): string[] {
  if (s.cards?.length) return s.cards.filter((id) => bp.cards.some((c) => c.id === id));
  return bp.cards.filter((c) => !NON_COLLECTIBLE.includes(roleOf(bp, c)) && (!s.rarity || (c.rarity ?? 'common') === s.rarity) && (!s.type || c.type === s.type) && (!s.color || c.color === s.color)).map((c) => c.id);
}

/** Module campaign data, or undefined when neither the shop nor the campaign is enabled. */
export function compileEconomy(bp: Blueprint, decks: Record<string, unknown>): Record<string, unknown> | undefined {
  const eco = bp.economy;
  if (!eco || (!shopOn(bp) && !campaignOn(bp))) return undefined;
  const cur = eco.currencies.length ? eco.currencies.slice(0, 5) : [{ id: 'gold', name: 'Gold', start: 0 }];
  const main = cur[0].id;
  const deckName = (id: string) => bp.decks.find((d) => d.id === id)?.name ?? id;
  const starter = eco.starterDecks.filter((id) => decks[id]);
  const collection: Record<string, number> = {};
  for (const id of starter) for (const c of Object.values(decks[id] as Record<string, string[]>).flat()) collection[c] = (collection[c] ?? 0) + 1;
  const coins = (r?: Record<string, number>, packs?: string[]) => {
    const out: Record<string, unknown> = {};
    if (r?.[main]) out.currency = r[main];
    const other = Object.fromEntries(Object.entries(r ?? {}).filter(([k, v]) => k !== main && v > 0 && cur.some((c) => c.id === k)));
    if (Object.keys(other).length) out.coins = other;
    if (packs?.length) out.packs = packs;
    return Object.keys(out).length ? out : undefined;
  };
  const camp = campaignOn(bp) ? eco.campaign! : undefined;
  const encs: EncounterBP[] = camp?.encounters.filter((e) => decks[e.deck]) ?? [];
  const usedPacks = new Set([...encs.flatMap((e) => e.packs ?? []), ...(shopOn(bp) ? eco.shop!.items.filter((i) => i.kind === 'booster').map((i) => i.ref) : [])]);
  const boosters = Object.fromEntries((eco.shop?.boosters ?? []).filter((b) => usedPacks.has(b.id)).map((b) => [b.id, { name: b.name,
    slots: b.slots.map((s) => ({ count: s.count, pool: slotPool(bp, s) })).filter((s) => s.count > 0 && s.pool.length) }]).filter(([, b]) => (b as any).slots.length));
  const won = new Set(encs.map((e) => e.id));
  const shop = shopOn(bp) ? eco.shop!.items.filter((i) => (i.kind === 'deck' ? !!decks[i.ref] : !!boosters[i.ref])).map((i) => ({
    id: i.id, name: i.name, price: i.price, ...(i.currency && i.currency !== main ? { currency: i.currency } : {}),
    ...(i.kind === 'deck' ? { deck: i.ref } : { booster: i.ref }), ...(i.repeat === 'once' ? { stock: 1 } : typeof i.repeat === 'number' ? { stock: i.repeat } : {}),
    ...(i.group ? { group: i.group } : {}), ...(i.firstPrice !== undefined ? { firstPrice: i.firstPrice } : {}), ...(i.badge ? { badge: i.badge } : {}), ...(i.text ? { text: i.text } : {}),
    ...(i.requires?.filter((r) => won.has(r)).length ? { requires: i.requires.filter((r) => won.has(r)) } : {}) })) : [];
  const tiers = camp?.tiers.length ? camp.tiers : ['Chapter 1'];
  const maxTier = Math.max(1, ...encs.map((e) => e.tier));
  return {
    name: camp?.name || bp.name,
    ...(camp?.intro?.length ? { intro: camp.intro } : {}),
    currency: { name: cur[0].name, start: cur[0].start },
    currencies: cur.map((c) => ({ id: c.id, name: c.name, start: c.start, ...(c.icon ? { icon: c.icon } : {}) })),
    starter: { collection, decks: Object.fromEntries(starter.map((id) => [deckName(id), decks[id]])) },
    chapters: Array.from({ length: Math.max(tiers.length, maxTier) }, (_, i) => ({ id: `tier${i + 1}`, name: tiers[i] ?? `Chapter ${i + 1}`, nodes: encs.filter((e) => (e.tier || 1) === i + 1).map((e) => e.id) })).filter((ch) => ch.nodes.length),
    encounters: Object.fromEntries(encs.map((e) => [e.id, { name: e.name, opponent: e.opponent, ...(e.portrait ? { portrait: e.portrait } : {}), deck: e.deck, ai: { kind: e.ai },
      ...(e.before?.length ? { intro: e.before } : {}), ...(e.win?.length ? { outro: e.win } : {}), ...(e.lose?.length ? { defeat: e.lose } : {}),
      rewards: Object.fromEntries(Object.entries({ first: coins(e.first, e.packs?.filter((p) => boosters[p])), repeat: coins(e.repeat), loss: coins(e.loss) }).filter(([, v]) => v)),
      repeatable: e.repeatable ?? true, ...(e.requires?.filter((r) => won.has(r)).length ? { requires: e.requires.filter((r) => won.has(r)) } : {}) }])),
    ...(Object.keys(boosters).length ? { boosters } : {}),
    ...(shop.length ? { shop } : {}),
  };
}

/** A ready-made economy: one currency, a free "choose your starter" from the game's decks, a booster pack and three battles. */
export function starterEconomy(bp: Blueprint): NonNullable<Blueprint['economy']> {
  const decks = bp.decks.map((d) => d.id);
  const foe = (i: number) => decks[(i + 1) % Math.max(1, decks.length)] ?? decks[0] ?? '';
  return {
    currencies: [{ id: 'gold', name: 'Gold', icon: '◆', start: 100 }, { id: 'gems', name: 'Gems', icon: '💎', start: 0 }],
    starterDecks: [],
    shop: { enabled: true,
      boosters: [{ id: 'core', name: `${bp.name} Booster`, slots: [{ count: 4, rarity: 'common' }, { count: 1, rarity: 'uncommon' }, { count: 1, rarity: 'rare' }] }],
      items: [
        ...decks.slice(0, 3).map((id, i) => ({ id: `starter-${i + 1}`, name: bp.decks.find((d) => d.id === id)!.name, kind: 'deck' as const, ref: id, price: 0, repeat: 'once' as const, group: 'starter', badge: 'Starter', text: 'Free: choose one to begin.' })),
        { id: 'pack', name: `${bp.name} Booster`, kind: 'booster' as const, ref: 'core', price: 50, repeat: 'forever' as const, firstPrice: 0, badge: 'First one free' },
        ...(decks.length ? [{ id: 'champ-deck', name: 'The Champion\'s Deck', kind: 'deck' as const, ref: foe(2), price: 150, repeat: 'once' as const, requires: ['champion'], badge: 'Unlocked by the Title Match' }] : []),
        { id: 'gem-pack', name: 'Gem Booster', kind: 'booster' as const, ref: 'core', price: 1, currency: 'gems', repeat: 'forever' as const },
      ] },
    campaign: { enabled: true, name: `${bp.name}: The Gauntlet`, tiers: ['Rookie Circuit', 'Champions'],
      encounters: [
        { id: 'rookie', name: 'First Steps', opponent: 'The Trainee', portrait: '🙂', deck: foe(0), ai: 'random', tier: 1, before: [{ speaker: 'The Trainee', text: 'Go easy on me!' }],
          win: [{ speaker: 'The Trainee', text: 'You learn fast.' }], lose: [{ speaker: 'The Trainee', text: 'Beginner\'s luck… for me!' }], first: { gold: 60, gems: 1 }, repeat: { gold: 15 }, loss: { gold: 5 }, packs: ['core'] },
        { id: 'rival', name: 'The Rival', opponent: 'A Rival', portrait: '😏', deck: foe(1), ai: 'heuristic', tier: 1, before: [{ speaker: 'A Rival', text: 'Think you can keep up?' }],
          win: [{ speaker: 'A Rival', text: 'This isn\'t over.' }], lose: [{ speaker: 'A Rival', text: 'Back to practice.' }], first: { gold: 100, gems: 2 }, repeat: { gold: 25 } },
        { id: 'champion', name: 'Title Match', opponent: 'The Champion', portrait: '👑', deck: foe(2), ai: 'planner', tier: 2, requires: ['rookie', 'rival'], before: [{ speaker: 'The Champion', text: 'Only the best reach me.' }],
          win: [{ speaker: 'The Champion', text: 'A new champion rises.' }], lose: [{ speaker: 'The Champion', text: 'Come back stronger.' }], first: { gold: 200, gems: 5 }, repeat: { gold: 40, gems: 1 } },
      ] },
  };
}
