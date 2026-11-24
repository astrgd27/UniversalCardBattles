// Starter blueprints for the Game Maker. Each is an original game built to show off one family of mechanics, so a
// designer can start from the closest one and reshape it. Names, cards and text are original.
import type { Ability, Blueprint, CardBP, CardType, Combat, Effect, FrameDef, Keyword, Phase, Resource, Setup, Win } from './blueprint.ts';
import { slug } from './compile.ts';

const frame = (base: string, cost: FrameDef['cost'], stats: FrameDef['stats'] = [], o: Partial<FrameDef> = {}): FrameDef => ({ base, cost, stats, art: 48, text: true, ...o });
const type = (id: string, name: string, role: CardType['role'], f: FrameDef, icon = ''): CardType => ({ id, name, role, frame: f, icon });
const kw = (id: string, name: string, rule: Keyword['rule'], text: string): Keyword => ({ id, name, rule, text });
const ph = (id: string, name: string, kind: Phase['kind'], n?: number): Phase => ({ id, name, kind, ...(n ? { n } : {}) });
const fx = (k: Effect['k'], o: Partial<Effect> = {}): Effect => ({ k, ...o });
const on = (when: Ability['when'], d: Effect[], o: Partial<Ability> = {}): Ability => ({ when, do: d, ...o });
function card(name: string, t: string, cost: CardBP['cost'], stats: Record<string, number> = {}, o: Partial<CardBP> = {}): CardBP {
  return { id: slug(name), name, type: t, cost, stats, keywords: [], abilities: [], ...o };
}
const deck = (id: string, name: string, main: Record<string, number>, o: Partial<Blueprint['decks'][number]> = {}) => ({ id, name, main, ...o });

export const RESOURCE0: Resource = { mode: 'ramp', name: 'Energy', icon: '◆', start: 1, perTurn: 1, max: 10, deckSize: 10, boost: 0, summonsPerTurn: 0, tribute: [] };
export const COMBAT0: Combat = {
  mode: 'target', power: 'power', health: 'health', defense: null, damage: 'persist', sickness: true, firstTurnAttack: true,
  targetUnits: 'any', directOnlyIfEmpty: false, leaderDefends: false, leaderAttacks: false, compare: { ties: 'both', loser: true, overflow: false },
  positions: false, counterStep: false, fieldSize: 6, benchSize: 5, attackEndsTurn: false, weakness: 2, lanes: ['Left Flank', 'Right Flank'],
};
export const WIN0: Win = { life: 20, lifeCards: 0, prizes: 0, points: 0, deckOut: true, noUnits: false };
export const SETUP0: Setup = { hand: 4, mulligan: true, handLimit: 8, deckMin: 20, deckMax: 40, maxCopies: 3, skipFirstDraw: true, leader: false, extraMax: 15, turnLimit: 80 };
const STD_TURN = [ph('ready', 'Ready', 'ready'), ph('draw', 'Draw', 'draw', 1), ph('main', 'Main', 'main'), ph('end', 'End', 'end')];

function base(o: Partial<Blueprint>): Blueprint {
  return {
    v: 1, id: 'my-game', name: 'My Game', tagline: '', look: { accent: '#7c5cff', accent2: '#38bdf8', glyph: '✦' }, colors: [],
    stats: [{ id: 'power', name: 'Power', icon: '⚔' }, { id: 'health', name: 'Health', icon: '♥' }],
    types: [], keywords: [], turn: STD_TURN, timing: 'simple', resource: { ...RESOURCE0 }, combat: { ...COMBAT0, compare: { ...COMBAT0.compare } },
    win: { ...WIN0 }, setup: { ...SETUP0 }, zoneNames: {}, cards: [], decks: [], ...o,
  };
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

// ================================================================ 1. Arcane Clash: lands, colors, the stack, blocking
function arcaneClash(): Blueprint {
  const colors = [{ id: 'ember', name: 'Ember', hex: '#e8553a', icon: '🔥' }, { id: 'tide', name: 'Tide', hex: '#3a8de8', icon: '💧' }, { id: 'grove', name: 'Grove', hex: '#3fae5a', icon: '🌿' }];
  const C = 'creature';
  return base({
    id: 'arcane-clash', name: 'Arcane Clash', tagline: 'Tap the land, cast the spell, block the beast. Responses on the stack.', blueprint: 'stack',
    look: { accent: '#c2410c', accent2: '#facc15', glyph: '✺' }, colors,
    stats: [{ id: 'power', name: 'Power', icon: '⚔' }, { id: 'toughness', name: 'Toughness', icon: '⛨' }],
    types: [
      type('land', 'Land', 'resource', frame('resource', 'none', [], { text: false, art: 70 }), '⛰'),
      type(C, 'Creature', 'unit', frame('classic', 'tr', [{ stat: 'power', pos: 'br', label: 'P/T' }, { stat: 'toughness', pos: 'br' }]), '⚔'),
      type('sorcery', 'Sorcery', 'spell', frame('spell', 'tr')), type('instant', 'Instant', 'fast', frame('spell', 'tr')),
      type('enchantment', 'Enchantment', 'permanent', frame('spell', 'tr')), type('relic', 'Relic', 'attachment', frame('spell', 'tr')),
      type('beast-token', 'Token', 'token', frame('token', 'none', [{ stat: 'power', pos: 'bl' }, { stat: 'toughness', pos: 'br' }]))],
    keywords: [kw('flying', 'Flying', 'flying', 'Can only be blocked by Flying creatures.'), kw('haste', 'Haste', 'haste', 'Can attack the turn it arrives.'),
      kw('vigilance', 'Vigilance', 'vigilance', 'Attacking does not tap it.'), kw('drain', 'Drain', 'lifesteal', 'Damage it deals in combat is gained as life.'),
      kw('venom', 'Venom', 'deadly', 'Any combat damage it deals destroys.'), kw('overrun', 'Overrun', 'overflow', 'Extra damage beyond a blocker hits the player.'),
      kw('warded', 'Warded', 'ward', "Can't be chosen by the opponent's effects.")],
    turn: [ph('untap', 'Untap', 'ready'), ph('draw', 'Draw', 'draw', 1), ph('main', 'First Main', 'main'), ph('combat', 'Combat', 'combat'), ph('main2', 'Second Main', 'main'), ph('end', 'End', 'end')],
    timing: 'stack',
    resource: { ...RESOURCE0, mode: 'cards', name: 'Mana', icon: '◈' },
    combat: { ...COMBAT0, mode: 'block', power: 'power', health: 'toughness', damage: 'heal', fieldSize: 8 },
    win: { ...WIN0, life: 20 },
    setup: { ...SETUP0, hand: 7, handLimit: 7, deckMin: 40, deckMax: 60, maxCopies: 4 },
    zoneNames: { field: 'Battlefield', resources: 'Lands', grave: 'Graveyard', support: 'Enchantments & Relics', limbo: 'The Stack' },
    cards: [
      card('Cinder Peaks', 'land', 0, {}, { color: 'ember', text: 'Taps for Ember mana.' }),
      card('Glass Shoals', 'land', 0, {}, { color: 'tide', text: 'Taps for Tide mana.' }),
      card('Mossdeep Hollow', 'land', 0, {}, { color: 'grove', text: 'Taps for Grove mana.' }),
      card('Ashfang Raider', C, { ember: 1 }, { power: 2, toughness: 1 }, { color: 'ember', keywords: ['haste'], flavor: 'First through the gate, first into the fire.' }),
      card('Kiln Brute', C, { ember: 1, any: 2 }, { power: 4, toughness: 3 }, { color: 'ember', keywords: ['overrun'] }),
      card('Pyre Drake', C, { ember: 2, any: 3 }, { power: 5, toughness: 4 }, { color: 'ember', keywords: ['flying'], abilities: [on('play', [fx('damage', { n: 2, target: 'enemyAny' })])] }),
      card('Ember Bolt', 'instant', { ember: 1 }, {}, { color: 'ember', abilities: [on('play', [fx('damage', { n: 3, target: 'enemyAny' })])], flavor: 'Point. Release. Apologize later.' }),
      card('Wildfire', 'sorcery', { ember: 2, any: 2 }, {}, { color: 'ember', abilities: [on('play', [fx('damage', { n: 2, target: 'allEnemyUnits' })])] }),
      card('Reef Sentinel', C, { tide: 1, any: 1 }, { power: 1, toughness: 4 }, { color: 'tide', keywords: ['vigilance'] }),
      card('Gull Courier', C, { tide: 1, any: 1 }, { power: 2, toughness: 2 }, { color: 'tide', keywords: ['flying'], abilities: [on('play', [fx('draw', { n: 1 })])] }),
      card('Tidecaller Sage', C, { tide: 2, any: 2 }, { power: 3, toughness: 3 }, { color: 'tide', keywords: ['warded'], abilities: [on('startTurn', [fx('draw', { n: 1 })])] }),
      card('Undertow', 'instant', { tide: 1, any: 1 }, {}, { color: 'tide', abilities: [on('play', [fx('counter')])], flavor: 'The sea keeps what it is given.' }),
      card('Riptide', 'instant', { tide: 1 }, {}, { color: 'tide', abilities: [on('play', [fx('bounce', { target: 'anyUnit' })])] }),
      card('Foresight', 'sorcery', { tide: 1, any: 1 }, {}, { color: 'tide', abilities: [on('play', [fx('draw', { n: 2 })])] }),
      card('Thornback Boar', C, { grove: 1, any: 1 }, { power: 3, toughness: 2 }, { color: 'grove' }),
      card('Hollow Oak Elder', C, { grove: 2, any: 3 }, { power: 5, toughness: 6 }, { color: 'grove', keywords: ['overrun'] }),
      card('Bloodmoss Stalker', C, { grove: 1 }, { power: 1, toughness: 1 }, { color: 'grove', keywords: ['venom'] }),
      card('Verdant Mother', C, { grove: 1, any: 2 }, { power: 2, toughness: 3 }, { color: 'grove', keywords: ['drain'], abilities: [on('play', [fx('token', { n: 1, card: 'sapling' })])] }),
      card('Sapling', 'beast-token', 0, { power: 1, toughness: 1 }, { color: 'grove' }),
      card('Wild Growth', 'instant', { grove: 1 }, {}, { color: 'grove', abilities: [on('play', [fx('buff', { n: 3, stat: 'power', target: 'ownUnit' })])] }),
      card('Banner of the Pack', 'enchantment', { grove: 1, any: 2 }, {}, { color: 'grove', abilities: [on('static', [fx('aura', { n: 1, stat: 'power', target: 'allOwnUnits' })])] }),
      card('Runed Blade', 'relic', { any: 2 }, {}, { bonus: { power: 2 }, flavor: 'It remembers every hand that held it.' }),
    ],
    decks: [
      deck('ember-grove', 'Ember & Grove', { 'cinder-peaks': 9, 'mossdeep-hollow': 8, 'ashfang-raider': 4, 'kiln-brute': 3, 'pyre-drake': 2, 'ember-bolt': 3, wildfire: 1, 'thornback-boar': 3, 'hollow-oak-elder': 2, 'bloodmoss-stalker': 2, 'verdant-mother': 2, 'wild-growth': 1 }),
      deck('tide-ember', 'Tide & Ember', { 'glass-shoals': 9, 'cinder-peaks': 8, 'reef-sentinel': 3, 'gull-courier': 4, 'tidecaller-sage': 2, undertow: 2, riptide: 2, foresight: 2, 'ashfang-raider': 3, 'kiln-brute': 2, 'ember-bolt': 3 }),
    ],
  });
}

// ================================================================ 2. Riftfront: battlefields, rune deck, points
function riftfront(): Blueprint {
  const colors = [{ id: 'fury', name: 'Fury', hex: '#ef4444', icon: '▲' }, { id: 'calm', name: 'Calm', hex: '#22d3ee', icon: '●' }];
  return base({
    id: 'riftfront', name: 'Riftfront', tagline: 'Two battlefields, one rune deck. Conquer and hold to reach 8 points.', blueprint: 'lanes',
    look: { accent: '#9333ea', accent2: '#f59e0b', glyph: '⟁' }, colors,
    types: [
      type('rune', 'Rune', 'resource', frame('resource', 'none', [], { text: false, art: 70 })),
      type('unit', 'Unit', 'unit', frame('skirmisher', 'tl', [{ stat: 'power', pos: 'bl', icon: '⚔' }, { stat: 'health', pos: 'br', icon: '♥' }])),
      type('spell', 'Spell', 'spell', frame('spell', 'tl')), type('reaction', 'Reaction', 'fast', frame('spell', 'tl')),
      type('gear', 'Gear', 'attachment', frame('spell', 'tl')),
      type('champion', 'Champion', 'leader', frame('leader', 'none', [{ stat: 'power', pos: 'bl', icon: '⚔' }])),
      type('pup-token', 'Token', 'token', frame('token', 'none', [{ stat: 'power', pos: 'bl' }, { stat: 'health', pos: 'br' }])),
    ],
    keywords: [kw('swift', 'Swift', 'haste', 'Can move the turn it is played.'), kw('sturdy', 'Sturdy', 'shield', 'The first damage it would take is prevented.')],
    turn: [ph('awaken', 'Awaken', 'ready'), ph('channel', 'Channel', 'resource'), ph('draw', 'Draw', 'draw', 1), ph('action', 'Action', 'main'), ph('end', 'End', 'end')],
    resource: { ...RESOURCE0, mode: 'deck', name: 'Runes', icon: '⟁', start: 2, perTurn: 2, deckSize: 12 },
    combat: { ...COMBAT0, mode: 'lanes', damage: 'heal', fieldSize: 7, lanes: ['Sunken Shrine', 'Ashen Gate'] },
    win: { ...WIN0, life: 0, points: 8 },
    setup: { ...SETUP0, hand: 4, deckMin: 40, deckMax: 40, leader: true, handLimit: 8, maxCopies: 4 },
    zoneNames: { base: 'Base', resources: 'Channeled Runes', resdeck: 'Rune Deck', leader: 'Champion' },
    cards: [
      card('Fury Rune', 'rune', 0, {}, { color: 'fury' }), card('Calm Rune', 'rune', 0, {}, { color: 'calm' }),
      card('Warlord Kesh', 'champion', 0, { power: 0 }, { color: 'fury', abilities: [on('activated', [fx('buff', { n: 2, stat: 'power', target: 'ownUnit' })], { tap: true, label: 'Exhaust: a unit gets +2 Power' })], flavor: 'She has never retreated. She has relocated forward.' }),
      card('Sage Ulmira', 'champion', 0, { power: 0 }, { color: 'calm', abilities: [on('activated', [fx('heal', { n: 3, target: 'ownUnit' }), fx('draw', { n: 1 })], { tap: true, cost: 2, label: 'Exhaust, pay 2: heal 3, draw' })] }),
      card('Rift Skirmisher', 'unit', { fury: 1 }, { power: 2, health: 2 }, { color: 'fury', keywords: ['swift'] }),
      card('Ember Lancer', 'unit', { fury: 1, any: 1 }, { power: 3, health: 2 }, { color: 'fury' }),
      card('Gatebreaker', 'unit', { fury: 2, any: 2 }, { power: 5, health: 5 }, { color: 'fury', abilities: [on('play', [fx('damage', { n: 2, target: 'enemyUnit' })])] }),
      card('Bloodhowl Pack', 'unit', { fury: 1, any: 2 }, { power: 3, health: 3 }, { color: 'fury', abilities: [on('play', [fx('token', { n: 1, card: 'howl-pup' })])] }),
      card('Howl Pup', 'pup-token', 0, { power: 1, health: 1 }, { color: 'fury' }),
      card('Shrine Warden', 'unit', { calm: 1, any: 1 }, { power: 1, health: 4 }, { color: 'calm', keywords: ['sturdy'] }),
      card('Mistweaver', 'unit', { calm: 1, any: 1 }, { power: 2, health: 3 }, { color: 'calm', abilities: [on('play', [fx('draw', { n: 1 })])] }),
      card('Tidal Colossus', 'unit', { calm: 2, any: 3 }, { power: 5, health: 7 }, { color: 'calm' }),
      card('Riverguard Adept', 'unit', { calm: 1 }, { power: 2, health: 2 }, { color: 'calm', abilities: [on('startTurn', [fx('heal', { n: 1, target: 'ownUnit' })])] }),
      card('Rally the Rift', 'spell', { fury: 1, any: 1 }, {}, { color: 'fury', abilities: [on('play', [fx('buff', { n: 2, stat: 'power', target: 'allOwnUnits' })])] }),
      card('Searing Rift', 'spell', { fury: 1, any: 1 }, {}, { color: 'fury', abilities: [on('play', [fx('damage', { n: 3, target: 'enemyUnit' })])] }),
      card('Stillwater', 'reaction', { calm: 1 }, {}, { color: 'calm', abilities: [on('play', [fx('exhaust', { target: 'enemyUnit' })])] }),
      card('Recall', 'reaction', { calm: 1, any: 1 }, {}, { color: 'calm', abilities: [on('play', [fx('bounce', { target: 'enemyUnit' })])] }),
      card('Rune Blade', 'gear', { any: 2 }, {}, { bonus: { power: 2 } }),
      card('Wardstone Plate', 'gear', { any: 1 }, {}, { bonus: { health: 3 } }),
    ],
    decks: [
      deck('fury', 'Fury Vanguard', { 'rift-skirmisher': 4, 'ember-lancer': 4, gatebreaker: 3, 'bloodhowl-pack': 3, 'rally-the-rift': 3, 'searing-rift': 4, 'shrine-warden': 3, mistweaver: 3, stillwater: 3, 'rune-blade': 3, 'wardstone-plate': 3, 'tidal-colossus': 1, 'riverguard-adept': 3 },
        { leader: 'warlord-kesh', res: { 'fury-rune': 8, 'calm-rune': 4 } }),
      deck('calm', 'Calm Tide', { 'shrine-warden': 4, mistweaver: 4, 'tidal-colossus': 2, 'riverguard-adept': 4, stillwater: 3, recall: 3, 'wardstone-plate': 3, 'rift-skirmisher': 3, 'ember-lancer': 4, gatebreaker: 2, 'searing-rift': 3, 'rune-blade': 2, 'rally-the-rift': 3 },
        { leader: 'sage-ulmira', res: { 'calm-rune': 8, 'fury-rune': 4 } }),
    ],
  });
}

// ================================================================ 3. Pocket Wilds: active and bench, attached energy, evolution, prizes
function pocketWilds(): Blueprint {
  const colors = [{ id: 'blaze', name: 'Blaze', hex: '#f97316', icon: '🔥' }, { id: 'wave', name: 'Wave', hex: '#0ea5e9', icon: '🌊' }, { id: 'leaf', name: 'Leaf', hex: '#22c55e', icon: '🍃' }];
  const mv = (name: string, cost: Record<string, number>, damage: number, d?: Effect[]) => ({ name, cost, damage, ...(d ? { do: d } : {}) });
  const W = 'wildling', EV = 'evolved';
  return base({
    id: 'pocket-wilds', name: 'Pocket Wilds', tagline: 'Attach energy, evolve your wildlings, take every prize.', blueprint: 'duel',
    look: { accent: '#eab308', accent2: '#ef4444', glyph: '✪' }, colors,
    stats: [{ id: 'hp', name: 'HP', icon: '♥' }],
    types: [
      type('energy', 'Energy', 'resource', frame('resource', 'none', [], { text: false, art: 70 })),
      type(W, 'Wildling', 'unit', frame('vital', 'none', [{ stat: 'hp', pos: 'tr', label: 'HP' }])),
      type(EV, 'Evolved Wildling', 'evolution', frame('vital', 'none', [{ stat: 'hp', pos: 'tr', label: 'HP' }])),
      type('item', 'Item', 'spell', frame('spell', 'none')), type('tool', 'Tool', 'attachment', frame('spell', 'none')), type('arena', 'Arena', 'permanent', frame('location', 'none', [], { layout: 'landscape' })),
    ],
    keywords: [],
    turn: [ph('start', 'Start', 'ready'), ph('draw', 'Draw', 'draw', 1), ph('main', 'Main', 'main'), ph('end', 'End', 'end')],
    resource: { ...RESOURCE0, mode: 'attach', name: 'Energy', icon: '⚡' },
    combat: { ...COMBAT0, mode: 'duel', power: 'hp', health: 'hp', damage: 'persist', sickness: false, firstTurnAttack: false, attackEndsTurn: true, benchSize: 5, weakness: 2 },
    win: { ...WIN0, life: 0, prizes: 4, noUnits: true },
    setup: { ...SETUP0, hand: 7, handLimit: 99, deckMin: 40, deckMax: 40, maxCopies: 4, skipFirstDraw: false },
    zoneNames: { active: 'Active', bench: 'Bench', prizes: 'Prize cards', support: 'Attached & Arena' },
    cards: [
      card('Blaze Energy', 'energy', 0, {}, { color: 'blaze' }), card('Wave Energy', 'energy', 0, {}, { color: 'wave' }), card('Leaf Energy', 'energy', 0, {}, { color: 'leaf' }),
      card('Cindercub', W, 0, { hp: 60 }, { color: 'blaze', weakness: 'wave', retreat: 1, moves: [mv('Ember Nip', { blaze: 1 }, 20), mv('Flare Pounce', { blaze: 1, any: 1 }, 40)], flavor: 'Its tail is warm enough to toast bread.' }),
      card('Pyrolyx', EV, 0, { hp: 120 }, { color: 'blaze', weakness: 'wave', retreat: 2, evolvesFrom: 'Cindercub', moves: [mv('Inferno Coil', { blaze: 2, any: 1 }, 90)] }),
      card('Puddlefin', W, 0, { hp: 70 }, { color: 'wave', weakness: 'leaf', retreat: 1, moves: [mv('Splash', { wave: 1 }, 20), mv('Bubble Jet', { wave: 1, any: 1 }, 40)] }),
      card('Torrentail', EV, 0, { hp: 130 }, { color: 'wave', weakness: 'leaf', retreat: 2, evolvesFrom: 'Puddlefin', moves: [mv('Riptide Slam', { wave: 2, any: 1 }, 80, [fx('draw', { n: 1 })])] }),
      card('Sproutling', W, 0, { hp: 60 }, { color: 'leaf', weakness: 'blaze', retreat: 1, moves: [mv('Vine Lash', { leaf: 1 }, 20), mv('Leech Seed', { leaf: 1, any: 1 }, 30, [fx('heal', { n: 30, target: 'self' })])] }),
      card('Thornwarden', EV, 0, { hp: 140 }, { color: 'leaf', weakness: 'blaze', retreat: 3, evolvesFrom: 'Sproutling', moves: [mv('Bramble Crush', { leaf: 2, any: 2 }, 100)] }),
      card('Pebblepup', W, 0, { hp: 80 }, { retreat: 2, moves: [mv('Tackle', { any: 2 }, 30)] }),
      card('Field Ration', 'item', 0, {}, { abilities: [on('play', [fx('heal', { n: 40, target: 'ownUnit' })])] }),
      card("Scout's Map", 'item', 0, {}, { abilities: [on('play', [fx('draw', { n: 2 })])] }),
      card('Lure Whistle', 'item', 0, {}, { abilities: [on('play', [fx('search', { type: W })])], text: 'Put a Wildling from your deck into your hand, then shuffle.' }),
      card('Iron Shell', 'tool', 0, {}, { bonus: { hp: 30 } }),
      card('Sunlit Meadow', 'arena', 0, {}, { abilities: [on('startTurn', [fx('heal', { n: 10, target: 'allOwnUnits' })])] }),
    ],
    decks: [
      deck('blaze-leaf', 'Blaze & Leaf', { 'blaze-energy': 9, 'leaf-energy': 7, cindercub: 4, pyrolyx: 3, sproutling: 4, thornwarden: 2, pebblepup: 2, 'field-ration': 3, 'scouts-map': 3, 'lure-whistle': 2, 'iron-shell': 1 }),
      deck('wave-blaze', 'Wave & Blaze', { 'wave-energy': 9, 'blaze-energy': 7, puddlefin: 4, torrentail: 3, cindercub: 4, pyrolyx: 2, pebblepup: 2, 'field-ration': 3, 'scouts-map': 3, 'lure-whistle': 2, 'sunlit-meadow': 1 }),
    ],
  });
}

// ================================================================ 4. Crypt Duel: tribute summons, positions, traps, chains, fusion
function cryptDuel(): Blueprint {
  const M = 'fiend';
  const mon = (name: string, level: number, atk: number, dfn: number, o: Partial<CardBP> = {}) => card(name, M, 0, { level, atk, def: dfn }, o);
  return base({
    id: 'crypt-duel', name: 'Crypt Duel', tagline: 'Summon, set, spring the trap. 8000 life points and a chain of answers.', blueprint: 'chain',
    look: { accent: '#7c3aed', accent2: '#d4af37', glyph: '☥' },
    stats: [{ id: 'level', name: 'Level', icon: '★' }, { id: 'atk', name: 'ATK' }, { id: 'def', name: 'DEF' }],
    types: [
      type(M, 'Fiend', 'unit', frame('monster', 'none', [{ stat: 'atk', pos: 'line', label: 'ATK' }, { stat: 'def', pos: 'line', label: 'DEF' }], { level: 'level' })),
      type('rite', 'Rite', 'spell', frame('spell', 'none')), type('swift-rite', 'Swift Rite', 'fast', frame('spell', 'none')),
      type('snare', 'Snare', 'trap', frame('spell', 'none')),
      type('fusion', 'Fusion', 'extra', frame('monster', 'none', [{ stat: 'atk', pos: 'line', label: 'ATK' }, { stat: 'def', pos: 'line', label: 'DEF' }], { level: 'level' })),
    ],
    keywords: [kw('piercing', 'Piercing', 'overflow', 'Battle damage goes through.')],
    turn: [ph('draw', 'Draw', 'draw', 1), ph('standby', 'Standby', 'ready'), ph('main', 'Main 1', 'main'), ph('battle', 'Battle', 'combat'), ph('main2', 'Main 2', 'main'), ph('end', 'End', 'end')],
    timing: 'chain',
    resource: { ...RESOURCE0, mode: 'none', name: 'None', summonsPerTurn: 1, tribute: [{ level: 5, n: 1 }, { level: 7, n: 2 }] },
    combat: { ...COMBAT0, mode: 'target', power: 'atk', health: null, defense: 'def', sickness: false, firstTurnAttack: false, directOnlyIfEmpty: true, positions: true,
      compare: { ties: 'both', loser: true, overflow: true }, fieldSize: 5 },
    win: { ...WIN0, life: 8000 },
    setup: { ...SETUP0, hand: 5, handLimit: 6, deckMin: 40, deckMax: 60, maxCopies: 3 },
    zoneNames: { field: 'Fiend Zones', support: 'Rite & Snare Zones', extra: 'Fusion Deck', grave: 'Crypt' },
    cards: [
      mon('Bone Lantern', 2, 800, 1200, { flavor: 'It lights the way down. Never up.' }),
      mon('Crypt Hound', 3, 1400, 1000),
      mon('Gravewing Bat', 4, 1700, 900),
      mon('Hollow Squire', 4, 1500, 1600, { abilities: [on('leave', [fx('draw', { n: 1 })])] }),
      mon('Ossuary Guard', 4, 1000, 2000),
      mon('Mourning Shade', 3, 1200, 800, { abilities: [on('play', [fx('lifeLoss', { n: 300, who: 'opp' })])] }),
      mon('Lich of the Seventh Bell', 6, 2400, 2000, { abilities: [on('play', [fx('destroy', { target: 'enemyUnit' })])] }),
      mon('Ancient Ossuarch', 8, 3000, 2500, { keywords: ['piercing'] }),
      card('Twin-Skull Revenant', 'fusion', 0, { level: 7, atk: 2800, def: 2200 }, { materials: 2, keywords: ['piercing'] }),
      card('Graveflood', 'rite', 0, {}, { abilities: [on('play', [fx('destroy', { target: 'allUnits' })])], flavor: 'The crypt floods. Everyone drowns.' }),
      card('Unearthed Ledger', 'rite', 0, {}, { abilities: [on('play', [fx('draw', { n: 2 })])] }),
      card('Raise the Fallen', 'rite', 0, {}, { abilities: [on('play', [fx('recover', { type: M })])] }),
      card('Soul Siphon', 'rite', 0, {}, { abilities: [on('play', [fx('lifeGain', { n: 1000 })])] }),
      card('Bone Armor', 'swift-rite', 0, {}, { abilities: [on('play', [fx('buff', { n: 700, stat: 'atk', target: 'ownUnit' })])] }),
      card('Mirror Snare', 'snare', 0, {}, { abilities: [on('opAttack', [fx('destroy', { target: 'attacker' })])], flavor: 'You attacked your reflection. It attacked back.' }),
      card('Chain of Silence', 'snare', 0, {}, { abilities: [on('play', [fx('counter')])] }),
      card('Ashen Toll', 'snare', 0, {}, { abilities: [on('opAttack', [fx('lifeLoss', { n: 800, who: 'opp' })])] }),
    ],
    decks: [
      deck('crypt-a', 'Lich Lord', { 'bone-lantern': 3, 'crypt-hound': 3, 'gravewing-bat': 3, 'hollow-squire': 3, 'ossuary-guard': 3, 'mourning-shade': 3, 'lich-of-the-seventh-bell': 2, 'ancient-ossuarch': 2, graveflood: 1, 'unearthed-ledger': 2, 'raise-the-fallen': 2, 'soul-siphon': 2, 'bone-armor': 3, 'mirror-snare': 3, 'chain-of-silence': 2, 'ashen-toll': 3 }, { extra: { 'twin-skull-revenant': 2 } }),
      deck('crypt-b', 'Bell Ringers', { 'bone-lantern': 3, 'crypt-hound': 3, 'gravewing-bat': 3, 'hollow-squire': 3, 'ossuary-guard': 2, 'mourning-shade': 3, 'lich-of-the-seventh-bell': 2, 'ancient-ossuarch': 2, graveflood: 1, 'unearthed-ledger': 2, 'raise-the-fallen': 2, 'soul-siphon': 2, 'bone-armor': 3, 'mirror-snare': 3, 'chain-of-silence': 3, 'ashen-toll': 3 }, { extra: { 'twin-skull-revenant': 2 } }),
    ],
  });
}

// ================================================================ 5. Crownfall: leader with life cards, a resource deck you attach for power, counters
function crownfall(): Blueprint {
  const colors = [{ id: 'crimson', name: 'Crimson', hex: '#dc2626' }, { id: 'azure', name: 'Azure', hex: '#2563eb' }];
  const CH = 'crew';
  return base({
    id: 'crownfall', name: 'Crownfall', tagline: 'Captains, crews and a deck of doubloons. Break their life, protect your own.', blueprint: 'leaderLife',
    look: { accent: '#dc2626', accent2: '#fbbf24', glyph: '⚓' }, colors,
    stats: [{ id: 'power', name: 'Power', icon: '⚔' }, { id: 'counter', name: 'Counter', icon: '⛉' }, { id: 'life', name: 'Life', icon: '♥' }],
    types: [
      type('captain', 'Captain', 'leader', frame('leader', 'none', [{ stat: 'life', pos: 'tr', icon: '♥' }, { stat: 'power', pos: 'bl', icon: '⚔' }])),
      type(CH, 'Crew', 'unit', frame('classic', 'tl', [{ stat: 'power', pos: 'br', icon: '⚔' }, { stat: 'counter', pos: 'bl', icon: '⛉' }])),
      type('order', 'Order', 'spell', frame('spell', 'tl')), type('countermove', 'Counter Order', 'fast', frame('spell', 'tl')),
      type('vessel', 'Vessel', 'permanent', frame('location', 'tl', [], { layout: 'landscape' })),
      type('doubloon', 'Doubloon', 'resource', frame('resource', 'none', [], { text: false, art: 70 })),
    ],
    keywords: [kw('rush', 'Rush', 'haste', 'Can attack the turn it is played.'), kw('blocker', 'Blocker', 'blocker', 'When an enemy attacks, you may rest this to become the target.'),
      kw('double-attack', 'Double Attack', 'double', 'Deals 2 damage to a Captain.'), kw('banish', 'Banish', 'none', 'Flavor keyword.')],
    turn: [ph('refresh', 'Refresh', 'ready'), ph('draw', 'Draw', 'draw', 1), ph('doubloons', 'Doubloons', 'resource'), ph('main', 'Main', 'main'), ph('end', 'End', 'end')],
    resource: { ...RESOURCE0, mode: 'deck', name: 'Doubloons', icon: '◎', start: 1, perTurn: 2, deckSize: 10, boost: 1000 },
    combat: { ...COMBAT0, mode: 'target', power: 'power', health: null, defense: null, sickness: true, firstTurnAttack: false, targetUnits: 'exhausted', leaderDefends: true, leaderAttacks: true,
      compare: { ties: 'defender', loser: false, overflow: false }, counterStep: true, fieldSize: 5 },
    win: { ...WIN0, life: 0, lifeCards: 5 },
    setup: { ...SETUP0, hand: 5, handLimit: 99, deckMin: 40, deckMax: 50, maxCopies: 4, leader: true },
    zoneNames: { field: 'Crew', leader: 'Captain', life: 'Life', resources: 'Doubloons', resdeck: 'Doubloon Deck', support: 'Vessel' },
    cards: [
      card('Doubloon', 'doubloon', 0, {}, { text: 'Spend it, or give it to a crew member for +1000 Power this turn.' }),
      card('Captain Mireille Vane', 'captain', 0, { power: 5000, life: 5 }, { color: 'crimson', abilities: [on('activated', [fx('buff', { n: 1000, stat: 'power', target: 'ownUnit' })], { cost: 1, once: true, label: 'Pay 1: a Crew gets +1000' })], flavor: 'She took the crown at sea. She means to keep it.' }),
      card('Admiral Oskar Thorne', 'captain', 0, { power: 5000, life: 4 }, { color: 'azure', abilities: [on('startTurn', [fx('draw', { n: 1 })], { if: { k: 'hand', n: 2 } })] }),
      card('Deckhand Pell', CH, 1, { power: 2000, counter: 1000 }, { color: 'crimson' }),
      card('Rigging Monkey', CH, 1, { power: 1000, counter: 2000 }, { color: 'crimson', keywords: ['blocker'] }),
      card('Cutlass Duelist', CH, 2, { power: 3000, counter: 1000 }, { color: 'crimson', keywords: ['rush'] }),
      card('Powder Boy Tibs', CH, 2, { power: 2000, counter: 1000 }, { color: 'crimson', abilities: [on('play', [fx('draw', { n: 1 })])] }),
      card('Boatswain Grend', CH, 3, { power: 4000, counter: 1000 }, { color: 'crimson', keywords: ['blocker'] }),
      card('Red Sabre Rhea', CH, 4, { power: 5000, counter: 1000 }, { color: 'crimson', keywords: ['double-attack'] }),
      card('Iron-Jaw Brutus', CH, 6, { power: 7000, counter: 0 }, { color: 'crimson', abilities: [on('play', [fx('destroy', { target: 'enemyUnit' })])] }),
      card('Navy Cadet', CH, 1, { power: 2000, counter: 1000 }, { color: 'azure' }),
      card('Signal Officer', CH, 2, { power: 2000, counter: 2000 }, { color: 'azure', abilities: [on('play', [fx('exhaust', { target: 'enemyUnit' })])] }),
      card('Harbor Marshal', CH, 4, { power: 5000, counter: 1000 }, { color: 'azure', keywords: ['blocker'] }),
      card('Vice Admiral Corra', CH, 5, { power: 6000, counter: 1000 }, { color: 'azure', abilities: [on('attack', [fx('bounce', { target: 'enemyUnit' })])] }),
      card('Broadside', 'order', 2, {}, { abilities: [on('play', [fx('destroy', { target: 'enemyUnit' })])], text: 'Sink an enemy Crew.' }),
      card('Plunder', 'order', 1, {}, { abilities: [on('play', [fx('draw', { n: 2 }), fx('discard', { n: 1 })])] }),
      card('Parry!', 'countermove', 1, {}, { abilities: [on('play', [fx('buff', { n: 4000, stat: 'power', target: 'battleTarget' })])], text: 'During a battle: the defender gets +4000 Power this turn.' }),
      card('Smoke Screen', 'countermove', 2, {}, { abilities: [on('play', [fx('exhaust', { target: 'attacker' }), fx('buff', { n: -3000, stat: 'power', target: 'attacker' })])] }),
      card('The Crimson Gale', 'vessel', 2, {}, { abilities: [on('static', [fx('aura', { n: 1000, stat: 'power', target: 'allOwnUnits' })], { if: { k: 'yourTurn' } })] }),
    ],
    decks: [
      deck('crimson', 'Crimson Raiders', { 'deckhand-pell': 4, 'rigging-monkey': 4, 'cutlass-duelist': 4, 'powder-boy-tibs': 4, 'boatswain-grend': 4, 'red-sabre-rhea': 3, 'iron-jaw-brutus': 2, broadside: 3, plunder: 3, 'parry': 4, 'smoke-screen': 3, 'the-crimson-gale': 2 }, { leader: 'captain-mireille-vane', res: { doubloon: 10 } }),
      deck('azure', 'Azure Navy', { 'navy-cadet': 4, 'signal-officer': 4, 'harbor-marshal': 4, 'vice-admiral-corra': 3, 'deckhand-pell': 4, 'rigging-monkey': 4, 'cutlass-duelist': 3, 'boatswain-grend': 3, broadside: 3, plunder: 3, 'parry': 3, 'smoke-screen': 2 }, { leader: 'admiral-oskar-thorne', res: { doubloon: 10 } }),
    ],
  });
}

// ================================================================ 6. Ki Clash: leader awakening, energy from any card, life cards, combos
function kiClash(): Blueprint {
  const colors = [{ id: 'solar', name: 'Solar', hex: '#f59e0b', icon: '☀' }, { id: 'void', name: 'Void', hex: '#6366f1', icon: '☾' }];
  const B = 'fighter';
  return base({
    id: 'ki-clash', name: 'Ki Clash', tagline: 'Charge energy from your hand, awaken your hero, shatter eight life.', blueprint: 'leaderEnergy',
    look: { accent: '#f59e0b', accent2: '#6366f1', glyph: '✹' }, colors,
    stats: [{ id: 'power', name: 'Power', icon: '⚡' }, { id: 'life', name: 'Life', icon: '♥' }],
    types: [
      type('hero', 'Hero', 'leader', frame('leader', 'none', [{ stat: 'life', pos: 'tr', icon: '♥' }, { stat: 'power', pos: 'bl', icon: '⚡' }])),
      type(B, 'Fighter', 'unit', frame('skirmisher', 'tl', [{ stat: 'power', pos: 'br', icon: '⚡' }])),
      type('technique', 'Technique', 'spell', frame('spell', 'tl')), type('counter', 'Counter', 'fast', frame('spell', 'tl')),
      type('relic', 'Relic', 'attachment', frame('spell', 'tl')),
    ],
    keywords: [kw('blocker', 'Blocker', 'blocker', 'When an enemy attacks, you may rest this to become the target.'), kw('double-strike', 'Double Strike', 'double', 'Removes 2 life when it hits.'),
      kw('barrier', 'Barrier', 'ward', "Can't be chosen by the opponent's effects."), kw('dash', 'Dash', 'haste', 'Can attack the turn it is played.')],
    turn: [ph('charge-up', 'Charge Up', 'ready'), ph('draw', 'Draw', 'draw', 2), ph('main', 'Main', 'main'), ph('end', 'End', 'end')],
    resource: { ...RESOURCE0, mode: 'anycard', name: 'Energy', icon: '✹' },
    combat: { ...COMBAT0, mode: 'target', power: 'power', health: null, defense: null, sickness: true, firstTurnAttack: false, targetUnits: 'exhausted', leaderDefends: true, leaderAttacks: true,
      compare: { ties: 'defender', loser: false, overflow: false }, counterStep: false, fieldSize: 6 },
    win: { ...WIN0, life: 0, lifeCards: 8 },
    setup: { ...SETUP0, hand: 6, handLimit: 99, deckMin: 40, deckMax: 50, maxCopies: 4, leader: true, skipFirstDraw: true },
    zoneNames: { field: 'Battle Area', leader: 'Hero', life: 'Life', resources: 'Energy Area', grave: 'Drop Area' },
    cards: [
      card('Kaito, Dawn Striker', 'hero', 0, { power: 10000, life: 8 }, { color: 'solar',
        abilities: [on('activated', [fx('buff', { n: 5000, stat: 'power', target: 'self', until: 'forever' }), fx('draw', { n: 2 })], { if: { k: 'life', n: 4 }, once: 'game', label: 'Awaken (4 or less life): +5000 Power, draw 2' })],
        flavor: 'He was a delivery boy. Then the sky cracked.' }),
      card('Umbra Queen Selis', 'hero', 0, { power: 10000, life: 8 }, { color: 'void', abilities: [on('activated', [fx('damage', { n: 1, target: 'opponent' })], { tap: true, cost: 3, label: 'Exhaust, pay 3: remove 1 enemy life' })] }),
      card('Solar Trainee', B, { solar: 1 }, { power: 5000 }, { color: 'solar' }),
      card('Flare Monk', B, { solar: 1, any: 1 }, { power: 10000 }, { color: 'solar', keywords: ['dash'] }),
      card('Sunfist Brawler', B, { solar: 1, any: 2 }, { power: 15000 }, { color: 'solar', keywords: ['double-strike'] }),
      card('Radiant Guardian', B, { solar: 1, any: 1 }, { power: 10000 }, { color: 'solar', keywords: ['blocker'] }),
      card('Daybreak Titan', B, { solar: 2, any: 3 }, { power: 25000 }, { color: 'solar', abilities: [on('play', [fx('destroy', { target: 'enemyUnit' })])] }),
      card('Void Acolyte', B, { void: 1 }, { power: 5000 }, { color: 'void', abilities: [on('play', [fx('draw', { n: 1 })])] }),
      card('Gloom Stalker', B, { void: 1, any: 1 }, { power: 10000 }, { color: 'void', keywords: ['barrier'] }),
      card('Eclipse Knight', B, { void: 1, any: 2 }, { power: 15000 }, { color: 'void', keywords: ['blocker'] }),
      card('Night Devourer', B, { void: 2, any: 3 }, { power: 20000 }, { color: 'void', abilities: [on('hit', [fx('discard', { n: 2, who: 'opp' })])] }),
      card('Ki Burst', 'technique', { solar: 1 }, {}, { color: 'solar', abilities: [on('play', [fx('buff', { n: 10000, stat: 'power', target: 'ownUnit' })])] }),
      card('Shadow Bind', 'technique', { void: 1, any: 1 }, {}, { color: 'void', abilities: [on('play', [fx('exhaust', { target: 'enemyUnit' }), fx('draw', { n: 1 })])] }),
      card('Last Stand', 'counter', { any: 1 }, {}, { abilities: [on('play', [fx('buff', { n: 10000, stat: 'power', target: 'battleTarget' })])] }),
      card('Void Rebuke', 'counter', { void: 1, any: 1 }, {}, { color: 'void', abilities: [on('play', [fx('destroy', { target: 'attacker' })])] }),
      card('Sage Bracers', 'relic', { any: 1 }, {}, { bonus: { power: 5000 } }),
    ],
    decks: [
      deck('solar', 'Solar Dawn', { 'solar-trainee': 4, 'flare-monk': 4, 'sunfist-brawler': 4, 'radiant-guardian': 4, 'daybreak-titan': 2, 'ki-burst': 4, 'last-stand': 4, 'sage-bracers': 3, 'void-acolyte': 4, 'gloom-stalker': 3, 'eclipse-knight': 4 }, { leader: 'kaito-dawn-striker' }),
      deck('void', 'Void Eclipse', { 'void-acolyte': 4, 'gloom-stalker': 4, 'eclipse-knight': 4, 'night-devourer': 3, 'shadow-bind': 4, 'void-rebuke': 3, 'last-stand': 3, 'solar-trainee': 4, 'flare-monk': 4, 'radiant-guardian': 4, 'sage-bracers': 3 }, { leader: 'umbra-queen-selis' }),
    ],
  });
}

/** The blueprint picker: what each starting point is about (no real game is named or copied). */
export const BLUEPRINTS: { id: string; name: string; icon: string; pitch: string; systems: string[]; make: () => Blueprint }[] = [
  { id: 'stack', name: 'Arcane Clash', icon: '✺', pitch: 'Play one land a turn, tap it for colored mana, and answer spells on the stack. Attackers charge, defenders block.', systems: ['Colored lands', 'Stack & instants', 'Declare blockers', 'Life 20'], make: arcaneClash },
  { id: 'lanes', name: 'Riftfront', icon: '⟁', pitch: 'Channel runes from a second deck, march units onto shared battlefields, conquer and hold them for points.', systems: ['Rune deck', 'Battlefields', 'Points to win', 'Champion'], make: riftfront },
  { id: 'duel', name: 'Pocket Wilds', icon: '✪', pitch: 'One active wildling, a bench behind it. Attach energy, evolve, use attacks, take prize cards.', systems: ['Active & bench', 'Attached energy', 'Evolution', 'Prizes'], make: pocketWilds },
  { id: 'chain', name: 'Crypt Duel', icon: '☥', pitch: 'Free summons with tributes, attack or defense positions, face-down snares and a chain of responses.', systems: ['Tributes', 'Positions', 'Traps & chain', 'Fusion deck'], make: cryptDuel },
  { id: 'leaderLife', name: 'Crownfall', icon: '⚓', pitch: 'A captain leads; your life is a stack of cards. A doubloon deck pays costs or powers up attacks. Counter from your hand.', systems: ['Leader & life cards', 'Resource deck', 'Power boosts', 'Counters & blockers'], make: crownfall },
  { id: 'leaderEnergy', name: 'Ki Clash', icon: '✹', pitch: 'Turn any card into energy, awaken your hero when the pressure is on, and break eight life cards.', systems: ['Any card as energy', 'Awakening hero', 'Life cards', 'Counter cards'], make: kiClash },
  { id: 'blank', name: 'Blank Canvas', icon: '✦', pitch: 'A tiny game with growing energy, units and spells. Build anything from here.', systems: ['Ramp energy', 'Units & spells', 'Life 20'], make: blank },
];
export const fromBlueprint = (id: string): Blueprint => (BLUEPRINTS.find((b) => b.id === id) ?? BLUEPRINTS[BLUEPRINTS.length - 1]).make();
