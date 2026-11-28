// The Game Wizard: an optional, guided tour of every system a card game can have. Each step offers preset choices (and a
// few customisable fields); every step can be skipped (its first option is the default). `wizardBuild` turns the answers
// into a playable blueprint: theme and colours, a generated starter set and decks, then the chosen systems applied as
// Mechanics Shelf recipes (which adapt the starter cards), keywords spread over the units, and the deck and win settings.
import type { Blueprint, CardBP, Color, KeywordRule } from './blueprint.ts';
import { KEYWORD_RULES, normalize } from './blueprint.ts';
import { blank, card, fx, on } from './presets.ts';
import { applyRecipe } from './recipes.ts';
import { slug } from './compile.ts';

export interface WizAnswers { picks: Record<string, string[]>; vals: Record<string, string | number> }
export interface WizOption { id: string; name: string; icon: string; desc: string; when?: (a: WizAnswers) => boolean }
export interface WizField { id: string; label: string; kind: 'num' | 'text' | 'select'; def: string | number; min?: number; max?: number; choices?: [string, string][]; when?: (a: WizAnswers) => boolean }
export interface WizStep { id: string; title: string; icon: string; help: string; multi?: boolean; options: WizOption[]; fields?: WizField[] }

const pick = (a: WizAnswers, step: string) => a.picks[step] ?? [];
const one = (a: WizAnswers, step: string, def: string) => pick(a, step)[0] ?? def;
const val = (a: WizAnswers, id: string, def: string | number) => a.vals[id] ?? def;
const num = (a: WizAnswers, id: string, def: number) => { const v = Number(a.vals[id]); return Number.isFinite(v) && a.vals[id] !== '' && a.vals[id] !== undefined ? v : def; };
const combatOf = (a: WizAnswers) => (one(a, 'resources', 'ramp') === 'pitch' ? 'cards' : one(a, 'combat', 'target'));

/** Theme packs: colours, an emblem and names for the generated starter cards. */
export const THEMES: Record<string, { name: string; glyph: string; accent: string; accent2: string; colors: Color[]; nouns: string[]; spells: [string, string, string] }> = {
  fantasy: { name: 'Fantasy realms', glyph: '⚔', accent: '#7c5cff', accent2: '#f59e0b',
    colors: [{ id: 'ember', name: 'Ember', hex: '#e8553a', icon: '🔥' }, { id: 'tide', name: 'Tide', hex: '#3a8de8', icon: '💧' }, { id: 'grove', name: 'Grove', hex: '#3aa860', icon: '🌿' },
      { id: 'storm', name: 'Storm', hex: '#e8c33a', icon: '⚡' }, { id: 'shade', name: 'Shade', hex: '#8a4ae8', icon: '🌙' }],
    nouns: ['Squire', 'Scout', 'Archer', 'Knight', 'Mage', 'Griffin', 'Golem', 'Wyvern', 'Warden', 'Champion', 'Titan', 'Dragon', 'Oracle', 'Sentinel'], spells: ['Bolt', 'Insight', 'Rally'] },
  scifi: { name: 'Sci-fi frontier', glyph: '🚀', accent: '#22d3ee', accent2: '#f43f5e',
    colors: [{ id: 'plasma', name: 'Plasma', hex: '#f43f5e', icon: '☄' }, { id: 'cyber', name: 'Cyber', hex: '#22d3ee', icon: '💾' }, { id: 'bio', name: 'Bio', hex: '#84cc16', icon: '🧬' },
      { id: 'solar', name: 'Solar', hex: '#f59e0b', icon: '☀' }, { id: 'void', name: 'Void', hex: '#a855f7', icon: '🕳' }],
    nouns: ['Drone', 'Cadet', 'Sniper', 'Mech', 'Hacker', 'Cruiser', 'Sentinel', 'Titan', 'Medic', 'Admiral', 'Juggernaut', 'Dreadnought', 'Pilot', 'Android'], spells: ['Laser', 'Data Leak', 'Overdrive'] },
  critters: { name: 'Critter kingdoms', glyph: '🐾', accent: '#22c55e', accent2: '#f472b6',
    colors: [{ id: 'fur', name: 'Fur', hex: '#d97706', icon: '🦊' }, { id: 'fin', name: 'Fin', hex: '#0ea5e9', icon: '🐟' }, { id: 'feather', name: 'Feather', hex: '#eab308', icon: '🪶' },
      { id: 'scale', name: 'Scale', hex: '#16a34a', icon: '🦎' }, { id: 'shell', name: 'Shell', hex: '#a855f7', icon: '🐚' }],
    nouns: ['Pup', 'Kit', 'Hopper', 'Hound', 'Owl', 'Badger', 'Stag', 'Bear', 'Elk', 'Matriarch', 'Wolf King', 'Leviathan', 'Burrower', 'Guardian'], spells: ['Pounce', 'Forage', 'Howl'] },
  plain: { name: 'Plain and simple', glyph: '✦', accent: '#7c5cff', accent2: '#38bdf8',
    colors: [{ id: 'red', name: 'Red', hex: '#ef4444', icon: '🔴' }, { id: 'blue', name: 'Blue', hex: '#3b82f6', icon: '🔵' }, { id: 'green', name: 'Green', hex: '#22c55e', icon: '🟢' },
      { id: 'yellow', name: 'Yellow', hex: '#eab308', icon: '🟡' }, { id: 'purple', name: 'Purple', hex: '#a855f7', icon: '🟣' }],
    nouns: ['Recruit', 'Runner', 'Fighter', 'Guard', 'Veteran', 'Brute', 'Captain', 'Hero', 'Giant', 'Legend', 'Colossus', 'Monarch', 'Adept', 'Defender'], spells: ['Strike', 'Study', 'Rally'] },
};

const KW_LIB: [string, string, KeywordRule][] = [
  ['haste', 'Haste', 'haste'], ['guard', 'Guard', 'guard'], ['flying', 'Flying', 'flying'], ['lifesteal', 'Lifesteal', 'lifesteal'], ['deadly', 'Deadly', 'deadly'],
  ['shield', 'Shield', 'shield'], ['firstStrike', 'First Strike', 'firstStrike'], ['trample', 'Trample', 'overflow'], ['untargetable', 'Untargetable', 'ward'],
  ['vigilance', 'Vigilance', 'vigilance'], ['armor', 'Armor', 'resist'], ['charge', 'Charge', 'challenger'], ['blocker', 'Blocker', 'blocker'], ['unblockable', 'Sneaky', 'unblockable'],
];

export const WIZARD: WizStep[] = [
  { id: 'theme', title: 'Theme & colours', icon: '🎨', help: 'Pick a look and how many colours (factions) your game has. Colours split cards into families that decks combine. You can rename everything later.',
    options: Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, icon: t.glyph, desc: t.colors.map((c) => c.name).join(', ') })),
    fields: [{ id: 'name', label: 'Game name', kind: 'text', def: 'My Card Game' }, { id: 'tagline', label: 'Tagline', kind: 'text', def: 'A brand-new card game.' },
      { id: 'colors', label: 'Colours', kind: 'select', def: '2', choices: [['0', 'None (colourless)'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']] }] },
  { id: 'starter', title: 'Starter cards', icon: '🃏', help: 'The wizard can write a starter set for you: units on a cost curve and a few spells for every colour, named after your theme. Keep it small to start, add more later.',
    options: [
      { id: 'medium', name: 'Starter set (10 per colour)', icon: '🃏', desc: '7 units and 3 spells per colour.' },
      { id: 'small', name: 'Tiny set (6 per colour)', icon: '🂠', desc: '4 units and 2 spells per colour: the quickest start.' },
      { id: 'large', name: 'Big set (14 per colour)', icon: '📚', desc: '10 units and 4 spells per colour.' },
      { id: 'none', name: 'Only the example cards', icon: '✏', desc: 'Keep the five blank-canvas cards plus whatever the systems you pick add.' }] },
  { id: 'resources', title: 'Paying for cards', icon: '💰', help: 'How do players afford their cards? This choice shapes the pace of the whole game.',
    options: [
      { id: 'ramp', name: 'Growing energy', icon: '📈', desc: 'Energy refills and grows by one each turn. Simple and smooth.' },
      { id: 'lands', name: 'Resource cards (lands)', icon: '⛰', desc: 'Play one resource card a turn; they make coloured mana.' },
      { id: 'inkwell', name: 'Inkwell', icon: '◈', desc: 'Put a marked card face down as a resource: play it or ink it.' },
      { id: 'manaZone', name: 'Any card as mana', icon: '🔄', desc: 'Once a turn, any card from hand becomes mana of its colour.' },
      { id: 'resDeck', name: 'Resource deck', icon: '🪙', desc: 'A separate small deck feeds you resources every turn.' },
      { id: 'attachEnergy', name: 'Attach energy to units', icon: '🔋', desc: 'Attach an energy card to a unit each turn; attacks cost energy.' },
      { id: 'pitch', name: 'Pitch cards from hand', icon: '◆', desc: 'Pay by discarding cards worth 1–3. Comes with attack cards and blocking from hand.' },
      { id: 'skillChecks', name: 'Skill checks', icon: '🎯', desc: 'No resources: turn over your top card to see if you pull the card off. Each card played makes the next harder; a failed check ends your turn.' },
      { id: 'free', name: 'Free (one summon a turn)', icon: '∅', desc: 'Cards cost nothing; you may summon one unit per turn.' }],
    fields: [{ id: 'rampMax', label: 'Energy maximum', kind: 'num', def: 10, min: 3, max: 20, when: (a) => one(a, 'resources', 'ramp') === 'ramp' }] },
  { id: 'resExtras', title: 'Resource extras', icon: '➕', multi: true, help: 'Optional twists on paying for cards. Skip if unsure.',
    options: [
      { id: 'boost', name: 'Power boosts', icon: '💪', desc: 'Spend 1 resource to give a unit +1 power this turn.', when: (a) => ['ramp', 'lands', 'manaZone', 'resDeck', 'inkwell'].includes(one(a, 'resources', 'ramp')) },
      { id: 'actionPoints', name: 'Action points', icon: '🎯', desc: 'Each turn you get a few actions; most cards use one.' },
      { id: 'levelGate', name: 'Level requirement', icon: '📶', desc: "Cards can't be played until you have enough resources in play." }] },
  { id: 'combat', title: 'Board & combat', icon: '⚔', help: 'How do units fight? This is the biggest choice after resources.',
    options: [
      { id: 'target', name: 'Pick a target', icon: '🎯', desc: 'Attack an enemy unit or the opponent directly. Damage stays.', when: (a) => one(a, 'resources', 'ramp') !== 'pitch' },
      { id: 'block', name: 'Attack & block', icon: '🛡', desc: 'Attackers hit the player; the defender may block with a unit.', when: (a) => one(a, 'resources', 'ramp') !== 'pitch' },
      { id: 'compare', name: 'Power duels', icon: '⚖', desc: 'No health: the stronger unit wins; ties destroy both.', when: (a) => one(a, 'resources', 'ramp') !== 'pitch' },
      { id: 'positions', name: 'Attack & defense positions', icon: '🔃', desc: 'Units have ATK and DEF, can be set face down and switch positions.', when: (a) => one(a, 'resources', 'ramp') !== 'pitch' },
      { id: 'duel', name: 'Active & bench', icon: '✪', desc: 'One active unit fights with printed attacks; the rest wait on the bench.', when: (a) => !['pitch', 'attachEnergy'].includes(one(a, 'resources', 'ramp')) || one(a, 'resources', 'ramp') === 'attachEnergy' },
      { id: 'lanes', name: 'Battlefields', icon: '⟁', desc: 'Move units onto shared battlefields; conquer and hold them for points.', when: (a) => one(a, 'resources', 'ramp') !== 'pitch' },
      { id: 'cards', name: 'Attack cards', icon: '🗡', desc: 'Attack with cards from hand; defenders block with cards from hand.', when: (a) => one(a, 'resources', 'ramp') === 'pitch' }] },
  { id: 'combatExtras', title: 'Combat extras', icon: '➕', multi: true, help: 'Optional combat rules. Skip any you do not want.',
    options: [
      { id: 'mass', name: 'All attackers at once', icon: '🪖', desc: 'Declare every attacker together; the defender assigns blockers; first-strike step.', when: (a) => combatOf(a) === 'block' },
      { id: 'grid', name: 'Board grid', icon: '▦', desc: 'Units go in numbered columns the player picks; enables "next to" and "facing" effects.', when: (a) => ['block', 'target', 'positions', 'compare'].includes(combatOf(a)) },
      { id: 'counterStep', name: 'Counter step', icon: '✋', desc: 'Defenders can discard cards with a counter value to power up.', when: (a) => ['target', 'compare', 'positions'].includes(combatOf(a)) },
      { id: 'quest', name: 'Questing', icon: '◆', desc: 'Units exhaust to score points instead of attacking; first to 20 wins.', when: (a) => ['target', 'block'].includes(combatOf(a)) },
      { id: 'lines', name: 'Front line & reserve', icon: '🏰', desc: 'Two rows: only the front line attacks and blocks.', when: (a) => ['target', 'block'].includes(combatOf(a)) },
      { id: 'twinArenas', name: 'Twin arenas', icon: '🌌', desc: 'Two separate arenas (ground and sky); units fight in their own.', when: (a) => ['target', 'block'].includes(combatOf(a)) },
      { id: 'conquest', name: 'Showdowns & conquest', icon: '🏴', desc: 'Group moves, response windows before fights, Tank, recall on a tie.', when: (a) => combatOf(a) === 'lanes' }] },
  { id: 'timing', title: 'Turns & timing', icon: '⏱', help: 'Can players answer each other mid-turn? More interaction means more depth (and more decisions).',
    options: [
      { id: 'simple', name: 'Take turns', icon: '▶', desc: 'Things happen right away; no responses outside battles.' },
      { id: 'stack', name: 'Stack & responses', icon: '📚', desc: 'Quick spells can answer anything; the last one played resolves first.' },
      { id: 'chain', name: 'Chains with speeds', icon: '⛓', desc: 'Responses build a chain; faster cards answer slower ones.' },
      { id: 'alternate', name: 'Alternating actions', icon: '🔁', desc: 'Players take one action each in turn until both pass.' }] },
  { id: 'turnExtras', title: 'Turn extras', icon: '➕', multi: true, help: 'Optional turn rules.',
    options: [
      { id: 'combatPhase', name: 'Separate combat phase', icon: '⚔', desc: 'Attacks happen in their own phase, between two main phases.', when: (a) => !['lanes', 'duel'].includes(combatOf(a)) },
      { id: 'drawTo', name: 'Draw up to a hand size', icon: '🖐', desc: 'At the end of your turn, draw until you hold a set number of cards.', when: (a) => one(a, 'resources', 'ramp') !== 'pitch' }],
    fields: [{ id: 'refill', label: 'Refill hand to', kind: 'num', def: 5, min: 2, max: 10, when: (a) => pick(a, 'turnExtras').includes('drawTo') }] },
  { id: 'win', title: 'How to win', icon: '🏆', help: 'What does a player need to do to win?',
    options: [
      { id: 'life', name: 'Life total', icon: '❤', desc: 'Reduce the opponent to 0 life.', when: (a) => !['lanes'].includes(combatOf(a)) && !pick(a, 'combatExtras').includes('quest') },
      { id: 'lifeCards', name: 'Life cards', icon: '🂡', desc: 'Each hit takes a face-down life card into hand; a hit with none left wins.', when: (a) => !['lanes', 'duel', 'cards'].includes(combatOf(a)) && !pick(a, 'combatExtras').includes('quest') },
      { id: 'shields', name: 'Shields with triggers', icon: '🛡', desc: 'Like life cards, and broken shields with Trigger can be cast for free.', when: (a) => !['lanes', 'duel', 'cards'].includes(combatOf(a)) && !pick(a, 'combatExtras').includes('quest') },
      { id: 'prizes', name: 'Prize cards', icon: '🎁', desc: 'Take a prize for each enemy unit destroyed; take them all to win.', when: (a) => !['lanes', 'cards'].includes(combatOf(a)) && !pick(a, 'combatExtras').includes('quest') },
      { id: 'points', name: 'Points', icon: '⭐', desc: 'First to the target score wins (from battlefields or questing).', when: (a) => combatOf(a) === 'lanes' || pick(a, 'combatExtras').includes('quest') }],
    fields: [{ id: 'life', label: 'Starting life', kind: 'num', def: 20, min: 1, max: 100000, when: (a) => one(a, 'win', '') === 'life' || one(a, 'win', '') === '' },
      { id: 'lifeCards', label: 'Life cards', kind: 'num', def: 5, min: 1, max: 10, when: (a) => ['lifeCards', 'shields'].includes(one(a, 'win', '')) },
      { id: 'prizes', label: 'Prize cards', kind: 'num', def: 4, min: 1, max: 8, when: (a) => one(a, 'win', '') === 'prizes' },
      { id: 'points', label: 'Points to win', kind: 'num', def: 8, min: 1, max: 50, when: (a) => one(a, 'win', '') === 'points' }] },
  { id: 'winExtras', title: 'More ways to win or lose', icon: '➕', multi: true, help: 'Optional extra end conditions.',
    options: [
      { id: 'burnOut', name: 'Burn out instead of deck-out', icon: '🔥', desc: 'An empty deck gives the opponent a point and reshuffles your discard pile.', when: (a) => one(a, 'win', '') === 'points' || combatOf(a) === 'lanes' },
      { id: 'noDeckOut', name: 'No deck-out loss', icon: '♾', desc: 'Running out of cards does not lose the game.' },
      { id: 'noUnits', name: 'No units left loses', icon: '💀', desc: 'A player with no units in play (after the first turn) loses.' }] },
  { id: 'deck', title: 'Decks & hands', icon: '🗂', help: 'Deck size, copies and the opening hand. Smaller decks make faster, more consistent games.',
    options: [
      { id: 'standard', name: 'Standard (40 cards, 3 copies)', icon: '🗂', desc: 'A good middle ground.' },
      { id: 'small', name: 'Small (30 cards, 2 copies)', icon: '📦', desc: 'Quick to build, quick to play.' },
      { id: 'large', name: 'Large (60 cards, 4 copies)', icon: '📚', desc: 'Classic big-deck feel.' }],
    fields: [{ id: 'hand', label: 'Opening hand', kind: 'num', def: 5, min: 1, max: 10 }, { id: 'handLimit', label: 'Hand limit', kind: 'num', def: 8, min: 3, max: 99 },
      { id: 'mulligan', label: 'Mulligan', kind: 'select', def: 'free', choices: [['none', 'No mulligan'], ['free', 'Redraw the whole hand once'], ['partial', 'Set aside up to 2 and redraw'], ['london', 'London (redraw, bottom 1 per mulligan)']] },
      { id: 'firstDraw', label: 'First player', kind: 'select', def: 'skip', choices: [['skip', 'skips the first draw'], ['draw', 'draws as normal']] }] },
  { id: 'leader', title: 'Leaders', icon: '👑', help: 'Optional: every deck can have a leader card that starts in play.',
    options: [
      { id: 'none', name: 'No leader', icon: '∅', desc: 'Just decks.' },
      { id: 'leader', name: 'Leader', icon: '👑', desc: 'A leader card starts in play with an ability.', when: (a) => !['lanes', 'duel', 'cards'].includes(combatOf(a)) },
      { id: 'deployLeader', name: 'Deployable leader', icon: '🛡', desc: 'The leader starts aside and can enter the board as a unit later.', when: (a) => !['lanes', 'duel', 'cards'].includes(combatOf(a)) }] },
  { id: 'types', title: 'Card types', icon: '🗃', multi: true, help: 'Units and spells are always in. Add any of these for variety; each adds example cards.',
    options: [
      { id: 'quick', name: 'Quick spells', icon: '⚡', desc: 'Spells you can play on the opponent\'s turn or in battles.' },
      { id: 'items', name: 'Items & locations', icon: '🏛', desc: 'Permanents with ongoing effects.' },
      { id: 'gear', name: 'Gear', icon: '⚙', desc: 'Attach equipment to units for bonuses.', when: (a) => one(a, 'resources', 'ramp') !== 'skillChecks' },
      { id: 'traps', name: 'Traps', icon: '🪤', desc: 'Set face down; spring them when an enemy attacks.', when: (a) => one(a, 'resources', 'ramp') !== 'skillChecks' },
      { id: 'tokens', name: 'Tokens', icon: '🪙', desc: 'Small units created by effects.' },
      { id: 'evolution', name: 'Evolutions', icon: '🦋', desc: 'Upgrade a unit by playing its evolved form on top.', when: (a) => one(a, 'resources', 'ramp') !== 'skillChecks' },
      { id: 'extraDeck', name: 'Fusion deck', icon: '🌀', desc: 'A side deck of big units summoned by combining others.', when: (a) => !['duel', 'lanes', 'cards'].includes(combatOf(a)) && one(a, 'resources', 'ramp') !== 'skillChecks' },
      { id: 'tribute', name: 'Tribute summons', icon: '🗿', desc: 'Big units need other units sacrificed.', when: (a) => one(a, 'resources', 'ramp') === 'free' },
      { id: 'songs', name: 'Songs', icon: '🎵', desc: 'Spells a unit can sing for free instead of paying.', when: (a) => !['free', 'pitch', 'skillChecks'].includes(one(a, 'resources', 'ramp')) }] },
  { id: 'keywords', title: 'Keywords', icon: '✨', multi: true, help: 'Short words on cards with a rule behind them. Pick a handful; the wizard spreads them over your starter units.',
    options: KW_LIB.map(([id, name, rule]) => ({ id, name, icon: '✦', desc: KEYWORD_RULES[rule].text })) },
  { id: 'systems', title: 'Optional systems', icon: '🧩', multi: true, help: 'Extra layers. Each is optional and adds example cards you can edit or delete.',
    options: [
      { id: 'growth', name: '+1/+1 counters', icon: '⬆', desc: 'Counters that permanently grow units.' },
      { id: 'conditions', name: 'Stun & sleep', icon: '💤', desc: 'Conditions that stop units attacking for a while.' },
      { id: 'restrictions', name: "Can't-attack / can't-block", icon: '🚫', desc: 'Defender, Elusive and similar restriction keywords.' },
      { id: 'costReducer', name: 'Cost reducers', icon: '🏷', desc: 'Cards that make other cards cheaper.', when: (a) => ['ramp', 'free', 'resDeck'].includes(one(a, 'resources', 'ramp')) },
      { id: 'prevention', name: 'Damage prevention', icon: '🛡', desc: 'Shields and second chances.' },
      { id: 'banish', name: 'Banished pile', icon: '🕳', desc: 'Effects that remove cards for good.' },
      { id: 'stadium', name: 'Shared stadium', icon: '🏟', desc: 'One shared location card both players play into.' },
      { id: 'places', name: 'Places (locations)', icon: '🏰', desc: 'Location cards units move to for bonuses (and lore, with questing).', when: (a) => ['target', 'block', 'compare'].includes(combatOf(a)) && !['pitch', 'free', 'attachEnergy', 'skillChecks'].includes(one(a, 'resources', 'ramp')) },
      { id: 'shift', name: 'Shift (upgraded versions)', icon: '⇪', desc: 'Legendary versions you can play on top of a unit for a shift cost.', when: (a) => !['pitch', 'free', 'attachEnergy', 'skillChecks'].includes(one(a, 'resources', 'ramp')) && combatOf(a) !== 'duel' },
      { id: 'chance', name: 'Coins & dice', icon: '🎲', desc: 'Cards that flip coins or roll dice.' },
      { id: 'worldClock', name: 'World clock (new idea)', icon: '🌗', desc: 'Day and night (or seasons) turn as the game goes on; some times change every unit.', when: (a) => combatOf(a) !== 'cards' },
      { id: 'heat', name: 'Heat (new idea)', icon: '🔥', desc: 'Every card you play builds heat; too much and you overheat and pay a price.' },
      { id: 'aging', name: 'Aging (new idea)', icon: '⌛', desc: 'Units grow older each turn and crumble at a set age.', when: (a) => combatOf(a) !== 'cards' },
      { id: 'comeback', name: 'Comeback (new idea)', icon: '🔄', desc: 'A player who falls behind gets a bonus each turn until they catch up.' }] },
  { id: 'review', title: 'Review & create', icon: '✅', help: 'Here is your game. Create it, then playtest straight away or keep shaping it in the Workshop.', options: [] },
];

/** Options of a step that fit the answers so far. */
export const optionsFor = (step: WizStep, a: WizAnswers) => step.options.filter((o) => !o.when || o.when(a));

/** Builds the blueprint the answers describe (every unanswered step uses its first valid option). */
export function wizardBuild(a0: WizAnswers): Blueprint {
  const a: WizAnswers = { picks: { ...a0.picks }, vals: { ...a0.vals } };
  for (const st of WIZARD) if (!st.multi && st.options.length) { const ok = optionsFor(st, a); if (!ok.some((o) => o.id === a.picks[st.id]?.[0])) a.picks[st.id] = ok[0] ? [ok[0].id] : []; }
  for (const st of WIZARD) if (st.multi) a.picks[st.id] = pick(a, st.id).filter((id) => optionsFor(st, a).some((o) => o.id === id));
  const bp = blank();
  const theme = THEMES[one(a, 'theme', 'fantasy')] ?? THEMES.fantasy;
  const nColors = Math.max(0, Math.min(5, Number(val(a, 'colors', 2))));
  bp.name = String(val(a, 'name', 'My Card Game')) || 'My Card Game';
  bp.tagline = String(val(a, 'tagline', 'A brand-new card game.'));
  bp.id = slug(bp.name) || 'my-card-game';
  bp.look = { accent: theme.accent, accent2: theme.accent2, glyph: theme.glyph };
  bp.colors = structuredClone(theme.colors.slice(0, nColors === 1 ? 2 : nColors));
  bp.blueprint = 'wizard';

  // ---- starter set and decks (before the systems, which adapt existing cards)
  const size = one(a, 'starter', 'medium');
  if (size !== 'none') {
    const [nu, ns] = size === 'small' ? [4, 2] : size === 'large' ? [10, 4] : [7, 3];
    bp.cards = [];
    const groups: (Color | null)[] = bp.colors.length ? bp.colors : [null];
    const curve = [1, 2, 2, 3, 3, 4, 5, 6, 2, 4, 3, 5, 1, 6];
    for (const col of groups) {
      const pre = col ? `${col.name} ` : '';
      for (let i = 0; i < nu; i++) {
        const c = curve[i % curve.length];
        bp.cards.push(card(`${pre}${theme.nouns[i % theme.nouns.length]}`, 'unit', c, { power: Math.max(1, c + (i % 3 === 0 ? 1 : 0)), health: Math.max(1, c + (i % 3 === 1 ? 1 : 0)) }, col ? { color: col.id } : {}));
      }
      const [s1, s2, s3] = theme.spells;
      const spells: CardBP[] = [
        card(`${pre}${s1}`, 'spell', 2, {}, { abilities: [on('play', [fx('damage', { n: 2, target: 'enemyAny' })])] }),
        card(`${pre}${s2}`, 'spell', 3, {}, { abilities: [on('play', [fx('draw', { n: 2 })])] }),
        card(`${pre}${s3}`, 'spell', 2, {}, { abilities: [on('play', [fx('buff', { n: 1, target: 'allOwnUnits' })])] }),
        card(`${pre}Last Stand`, 'spell', 4, {}, { abilities: [on('play', [fx('destroy', { target: 'enemyUnit' })])] }),
      ];
      for (const s of spells.slice(0, ns)) bp.cards.push(col ? { ...s, color: col.id } : s);
    }
    const ids = (cols: (string | null)[]) => bp.cards.filter((k) => cols.includes(k.color ?? null)).map((k) => k.id);
    const pairs: (string | null)[][] = bp.colors.length >= 2 ? bp.colors.map((c, i) => [c.id, bp.colors[(i + 1) % bp.colors.length].id]).slice(0, bp.colors.length === 2 ? 1 : 4) : [[null]];
    bp.decks = pairs.map((p) => ({ id: slug(p.map((x) => x ?? 'starter').join('-')), name: p.every(Boolean) ? p.map((x) => bp.colors.find((c) => c.id === x)!.name).join(' & ') : 'Starter', main: Object.fromEntries(ids(p).map((id) => [id, 2])) }));
  }

  // ---- systems, in dependency order
  const res = one(a, 'resources', 'ramp');
  if (res === 'free') Object.assign(bp.resource, { mode: 'none', name: 'None', summonsPerTurn: 1 });
  else applyRecipe(bp, res);
  if (res === 'pitch') { // attack-card games: the starter units become attack cards (cheaper, harder-hitting, with a defense value)
    bp.cards.forEach((k, i) => { if (k.type !== 'unit') return;
      const c = typeof k.cost === 'number' ? k.cost : 1;
      Object.assign(k, { type: 'attack', cost: Math.max(0, c - 1), stats: { [bp.combat.power]: c + 2, defense: 2 + (i % 2), pitch: 1 + (i % 3) } });
      if (i % 3 === 0) k.keywords.push('go-again'); });
  }
  if (res === 'ramp') bp.resource.max = num(a, 'rampMax', 10);
  for (const r of pick(a, 'resExtras')) applyRecipe(bp, r);
  const cm = combatOf(a);
  if (cm !== 'cards') applyRecipe(bp, cm);
  for (const r of pick(a, 'combatExtras')) {
    if (r === 'mass') bp.combat.mass = true;
    else if (r === 'grid') bp.combat.grid = true;
    else if (r === 'conquest') Object.assign(bp.combat, { conquest: true, finalPoint: true });
    else applyRecipe(bp, r);
  }
  const tm = one(a, 'timing', 'simple');
  if (tm !== 'simple') applyRecipe(bp, tm);
  for (const r of pick(a, 'turnExtras')) applyRecipe(bp, r);
  const win = one(a, 'win', 'life');
  if (win === 'life') { applyRecipe(bp, 'lifeTotal'); bp.win.life = num(a, 'life', 20); }
  else if (win === 'lifeCards') { applyRecipe(bp, 'lifeCards'); bp.win.lifeCards = num(a, 'lifeCards', 5); }
  else if (win === 'shields') { applyRecipe(bp, 'shields'); bp.win.lifeCards = num(a, 'lifeCards', 5); }
  else if (win === 'prizes') { applyRecipe(bp, 'prizes'); bp.win.prizes = num(a, 'prizes', 4); }
  else if (win === 'points') bp.win.points = num(a, 'points', bp.win.points || 8);
  const we = pick(a, 'winExtras');
  if (we.includes('burnOut')) Object.assign(bp.win, { burnOut: true, deckOut: false });
  if (we.includes('noDeckOut')) bp.win.deckOut = false;
  if (we.includes('noUnits')) bp.win.noUnits = true;
  const ld = one(a, 'leader', 'none');
  if (ld !== 'none') applyRecipe(bp, ld);
  for (const t of pick(a, 'types')) {
    if (t === 'quick') {
      if (!bp.types.some((x) => x.role === 'fast')) bp.types.push({ id: 'quick', name: 'Quick spell', role: 'fast', icon: '⚡', frame: { base: 'spell', cost: 'tr', stats: [], art: 48, text: true } });
      const qt = bp.types.find((x) => x.role === 'fast')!.id;
      const q = card('Quick Reflexes', qt, 1, {}, { abilities: [on('play', [fx('buff', { n: 2, target: 'ownUnit' })])] });
      bp.cards.push(q); for (const d of bp.decks) d.main[q.id] = 2;
    } else if (t === 'tokens') {
      if (!bp.types.some((x) => x.role === 'token')) bp.types.push({ id: 'token', name: 'Token', role: 'token', icon: '•', frame: { base: 'token', cost: 'none', stats: [{ stat: bp.combat.power, pos: 'bl' }, ...(bp.combat.health ? [{ stat: bp.combat.health, pos: 'br' as const }] : [])], art: 48, text: true } });
      const tt = bp.types.find((x) => x.role === 'token')!.id;
      if (!bp.cards.some((k) => k.id === 'sprout')) bp.cards.push(card('Sprout', tt, 0, { [bp.combat.power]: 1, ...(bp.combat.health ? { [bp.combat.health]: 1 } : {}) }));
      const s = card('Call Reinforcements', 'spell', 2, {}, { abilities: [on('play', [fx('token', { card: 'sprout', n: 2 })])] });
      bp.cards.push(s); for (const d of bp.decks) d.main[s.id] = 2;
    } else applyRecipe(bp, t);
  }
  // keywords, spread over the units
  const units = () => bp.cards.filter((k) => bp.types.find((t) => t.id === k.type)?.role === 'unit');
  pick(a, 'keywords').forEach((id, i) => {
    const lib = KW_LIB.find(([k]) => k === id)!;
    let kw = bp.keywords.find((k) => k.rule === lib[2]);
    if (!kw) { kw = { id: lib[0], name: lib[1], rule: lib[2], text: `${lib[1]}: ${KEYWORD_RULES[lib[2]].text}`, ...(KEYWORD_RULES[lib[2]].valued ? { valued: true } : {}) }; bp.keywords.push(kw); }
    const us = units();
    for (let j = i; j < us.length; j += Math.max(3, pick(a, 'keywords').length + 1)) if (!us[j].keywords.includes(kw.id)) { us[j].keywords.push(kw.id); if (kw.valued) (us[j].kwv ??= {})[kw.id] = 1; }
  });
  for (const r of pick(a, 'systems')) {
    if (r !== 'chance') { applyRecipe(bp, r); continue; }
    const coin = card('Lucky Coin', 'spell', 1, {}, { abilities: [on('play', [fx('flip', { n: 1, heads: [fx('draw', { n: 2 })], tails: [fx('draw', { n: 1 })] })])] });
    const dice = card('Loaded Dice', 'spell', 2, {}, { abilities: [on('play', [fx('roll', { n: 1, sides: 6, ranges: [{ min: 1, max: 3, do: [fx('damage', { n: 1, target: 'enemyAny' })] }, { min: 4, max: 6, do: [fx('damage', { n: 3, target: 'enemyAny' })] }] })])] });
    bp.cards.push(coin, dice); for (const d of bp.decks) { d.main[coin.id] = 2; d.main[dice.id] = 2; }
  }
  // typed costs when resource cards make coloured mana
  if (['cards'].includes(bp.resource.mode) && bp.colors.length) for (const k of bp.cards) {
    const role = bp.types.find((t) => t.id === k.type)?.role;
    if (k.color && typeof k.cost === 'number' && k.cost > 0 && !['resource', 'token', 'leader'].includes(role ?? '')) k.cost = k.cost > 1 ? { any: k.cost - 1, [k.color]: 1 } : { [k.color]: 1 };
  }

  // ---- decks and hands
  const dk = one(a, 'deck', 'standard');
  const [dMin, copies] = dk === 'small' ? [30, 2] : dk === 'large' ? [60, 4] : [40, 3];
  Object.assign(bp.setup, { deckMin: dMin, deckMax: Math.max(dMin, bp.setup.deckMax), maxCopies: Math.max(copies, bp.setup.maxCopies), hand: num(a, 'hand', 5), handLimit: num(a, 'handLimit', 8),
    skipFirstDraw: val(a, 'firstDraw', 'skip') !== 'draw' });
  if (bp.combat.mode === 'duel') bp.setup.hand = Math.max(bp.setup.hand, 7);
  for (const ph of bp.turn) if (ph.drawTo) ph.drawTo = Math.max(ph.drawTo, num(a, 'refill', bp.setup.hand));
  const mull = String(val(a, 'mulligan', 'free'));
  bp.setup.mulligan = mull !== 'none';
  bp.setup.mulliganN = mull === 'partial' ? 2 : 0;
  bp.setup.london = mull === 'london';
  fitDecks(bp);
  return normalize(bp);
}

/** Every deck reaches the chosen size: copies of its spells and units are spread evenly (1 to the copy limit) and, in
 *  resource-card games, about 40% of the deck is lands of the deck's own colours. */
function fitDecks(bp: Blueprint) {
  const roleOf = (id: string) => bp.types.find((t) => t.id === bp.cards.find((c) => c.id === id)?.type)?.role;
  const colorOf = (id: string) => bp.cards.find((c) => c.id === id)?.color;
  const lands = bp.resource.mode === 'cards';
  for (const d of bp.decks) {
    for (const id of Object.keys(d.main)) if (!bp.cards.some((c) => c.id === id)) delete d.main[id];
    const ids = Object.keys(d.main);
    const play = ids.filter((id) => !['token', 'leader', 'extra', 'resource', 'battlefield'].includes(roleOf(id) ?? ''));
    const res = ids.filter((id) => roleOf(id) === 'resource');
    const target = lands && res.length ? Math.round(bp.setup.deckMin * 0.6) : bp.setup.deckMin;
    const each = Math.max(1, Math.min(bp.setup.maxCopies, Math.floor(target / Math.max(1, play.length))));
    for (const id of play) d.main[id] = each;
    let n = play.length * each;
    for (let k = 0; n < target && k < play.length * bp.setup.maxCopies; k++) { const id = play[k % play.length]; if (d.main[id] < bp.setup.maxCopies) { d.main[id]++; n++; } }
    if (lands && res.length) {
      const cols = new Set(play.map(colorOf).filter(Boolean));
      let keep = res.filter((id) => !colorOf(id) || cols.has(colorOf(id)));
      if (!keep.length) keep = res;
      for (const id of res) delete d.main[id];
      const want = Math.round((n * 2) / 3);
      keep.forEach((id, i) => { d.main[id] = Math.floor(want / keep.length) + (i < want % keep.length ? 1 : 0); });
    }
    const total = Object.entries(d.main).filter(([id]) => !['token', 'leader', 'extra', 'battlefield'].includes(roleOf(id) ?? '')).reduce((t, [, c]) => t + c, 0);
    bp.setup.deckMin = Math.max(5, Math.min(bp.setup.deckMin, total));
    bp.setup.deckMax = Math.max(bp.setup.deckMax, total);
  }
}

/** Random valid answers (tests and "surprise me inside the wizard"). */
export function randomAnswers(seed: number): WizAnswers {
  let x = (seed >>> 0) || 1;
  const rnd = (n: number) => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % n; };
  const a: WizAnswers = { picks: {}, vals: { colors: String([0, 2, 3, 4, 5][rnd(5)]) } };
  for (const st of WIZARD) {
    const ok = optionsFor(st, a);
    if (!ok.length) continue;
    a.picks[st.id] = st.multi ? ok.filter(() => rnd(3) === 0).map((o) => o.id) : [ok[rnd(ok.length)].id];
  }
  return a;
}
