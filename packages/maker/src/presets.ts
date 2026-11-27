// Starter blueprints for the Game Maker: a blank canvas (default modules live in packages/modules), plus the helpers
// recipes use to build cards, types and keywords.
import type { Ability, Blueprint, CardBP, CardType, Combat, Effect, FrameDef, Keyword, Phase, Resource, Setup, Win } from './blueprint.ts';
import { slug } from './compile.ts';

export const frame = (base: string, cost: FrameDef['cost'], stats: FrameDef['stats'] = [], o: Partial<FrameDef> = {}): FrameDef => ({ base, cost, stats, art: 48, text: true, ...o });
export const type = (id: string, name: string, role: CardType['role'], f: FrameDef, icon = ''): CardType => ({ id, name, role, frame: f, icon });
export const kw = (id: string, name: string, rule: Keyword['rule'], text: string): Keyword => ({ id, name, rule, text });
export const ph = (id: string, name: string, kind: Phase['kind'], n?: number): Phase => ({ id, name, kind, ...(n ? { n } : {}) });
export const fx = (k: Effect['k'], o: Partial<Effect> = {}): Effect => ({ k, ...o });
export const on = (when: Ability['when'], d: Effect[], o: Partial<Ability> = {}): Ability => ({ when, do: d, ...o });
export function card(name: string, t: string, cost: CardBP['cost'], stats: Record<string, number> = {}, o: Partial<CardBP> = {}): CardBP {
  return { id: slug(name), name, type: t, cost, stats, keywords: [], abilities: [], ...o };
}
export const deck = (id: string, name: string, main: Record<string, number>, o: Partial<Blueprint['decks'][number]> = {}) => ({ id, name, main, ...o });

export const RESOURCE0: Resource = { mode: 'ramp', name: 'Energy', icon: '◆', start: 1, perTurn: 1, max: 10, deckSize: 10, boost: 0, summonsPerTurn: 0, tribute: [] };
export const COMBAT0: Combat = {
  mode: 'target', power: 'power', health: 'health', defense: null, damage: 'persist', sickness: true, firstTurnAttack: true,
  targetUnits: 'any', directOnlyIfEmpty: false, leaderDefends: false, leaderAttacks: false, compare: { ties: 'both', loser: true, overflow: false },
  positions: false, counterStep: false, fieldSize: 6, benchSize: 5, attackEndsTurn: false, weakness: 2, lanes: ['Left Flank', 'Right Flank'],
};
export const WIN0: Win = { life: 20, lifeCards: 0, prizes: 0, points: 0, deckOut: true, noUnits: false };
export const SETUP0: Setup = { hand: 4, mulligan: true, handLimit: 8, deckMin: 20, deckMax: 40, maxCopies: 3, skipFirstDraw: true, leader: false, extraMax: 15, turnLimit: 80 };
const STD_TURN = [ph('ready', 'Ready', 'ready'), ph('draw', 'Draw', 'draw', 1), ph('main', 'Main', 'main'), ph('end', 'End', 'end')];

export function base(o: Partial<Blueprint>): Blueprint {
  return structuredClone({
    v: 1, id: 'my-game', name: 'My Game', tagline: '', look: { accent: '#7c5cff', accent2: '#38bdf8', glyph: '✦' }, colors: [],
    stats: [{ id: 'power', name: 'Power', icon: '⚔' }, { id: 'health', name: 'Health', icon: '♥' }],
    types: [], keywords: [], turn: STD_TURN, timing: 'simple', resource: { ...RESOURCE0 }, combat: { ...COMBAT0, compare: { ...COMBAT0.compare } },
    win: { ...WIN0 }, setup: { ...SETUP0 }, zoneNames: {}, cards: [], decks: [], ...o,
  });
}

// ================================================================ blank
export function blank(): Blueprint {
  return base({
    id: 'my-game', name: 'My Card Game', tagline: 'A brand-new game.', blueprint: 'blank',
    types: [type('unit', 'Unit', 'unit', frame('skirmisher', 'tl', [{ stat: 'power', pos: 'bl', icon: '⚔' }, { stat: 'health', pos: 'br', icon: '♥' }])),
      type('spell', 'Spell', 'spell', frame('spell', 'tr'))],
    keywords: [kw('haste', 'Haste', 'haste', 'Can attack the turn it is played.'), kw('guard', 'Guard', 'guard', 'Enemies must attack this first.')],
    cards: [card('Squire', 'unit', 1, { power: 1, health: 2 }), card('Scout', 'unit', 1, { power: 2, health: 1 }, { keywords: ['haste'] }),
      card('Knight', 'unit', 3, { power: 3, health: 3 }, { keywords: ['guard'] }), card('Giant', 'unit', 5, { power: 5, health: 6 }),
      card('Spark', 'spell', 1, {}, { abilities: [on('play', [fx('damage', { n: 2, target: 'enemyAny' })])] })],
    decks: [deck('starter', 'Starter', { squire: 4, scout: 4, knight: 4, giant: 4, spark: 4 })],
    setup: { ...SETUP0, maxCopies: 4 },
  });
}

/** The blueprint picker: what each starting point is about (no real game is named or copied). */
export const BLUEPRINTS: { id: string; name: string; icon: string; pitch: string; systems: string[]; make: () => Blueprint }[] = [
  { id: 'blank', name: 'Blank Canvas', icon: '✦', pitch: 'A tiny game with growing energy, units and spells. Build anything from here.', systems: ['Ramp energy', 'Units & spells', 'Life 20'], make: blank },
];
export const fromBlueprint = (id: string): Blueprint => (BLUEPRINTS.find((b) => b.id === id) ?? BLUEPRINTS[BLUEPRINTS.length - 1]).make();
