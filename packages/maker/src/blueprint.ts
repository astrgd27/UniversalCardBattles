// Game Maker blueprints: a friendly, form-shaped description of a whole card game. compile.ts turns one into an
// engine module (rules, cards, decks, manifest, AI hints). Everything is plain JSON so projects save, export and diff.
// The vocabulary is small on purpose: zones (arenas), counters, keywords (optionally with a number and an ability
// bundle), and When → If → Do ability blocks whose targets take filters and whose activations take cost blocks.

export type Role = 'unit' | 'spell' | 'fast' | 'permanent' | 'attachment' | 'resource' | 'trap' | 'leader' | 'evolution' | 'extra' | 'token' | 'attack' | 'battlefield';
export type Pos = 'tl' | 'tr' | 'bl' | 'br' | 'line';
export type PhaseKind = 'ready' | 'draw' | 'resource' | 'main' | 'combat' | 'end' | 'custom';
export type When = 'play' | 'leave' | 'attack' | 'hit' | 'quest' | 'startTurn' | 'endTurn' | 'activated' | 'static' | 'opAttack' | 'conquer' | 'hold';
export type TargetKind =
  | 'self' | 'enemyUnit' | 'anyUnit' | 'ownUnit' | 'otherOwnUnit' | 'enemyAny' | 'opponent' | 'you' | 'eachPlayer'
  | 'allEnemyUnits' | 'allUnits' | 'allOwnUnits' | 'randomEnemyUnit' | 'attacker' | 'battleTarget';
export type EffectKind =
  | 'draw' | 'damage' | 'heal' | 'buff' | 'destroy' | 'bounce' | 'exhaust' | 'ready' | 'token' | 'gain' | 'discard' | 'mill'
  | 'search' | 'recover' | 'counter' | 'lifeGain' | 'lifeLoss' | 'score' | 'addLife' | 'aura' | 'win' | 'raw'
  | 'addCounter' | 'removeCounter' | 'strike' | 'deploy'
  | 'restrict' | 'prevent' | 'costMod' | 'insteadDestroy' | 'moveTo' | 'scry';
export type KeywordRule = 'none' | 'haste' | 'guard' | 'blocker' | 'flying' | 'vigilance' | 'lifesteal' | 'deadly' | 'shield' | 'double' | 'overflow' | 'ward'
  | 'firstStrike' | 'resist' | 'challenger' | 'saboteur' | 'goAgain' | 'trigger' | 'song'
  | 'noAttack' | 'noBlock' | 'noBeAttacked' | 'unblockable' | 'entersExhausted'
  | 'tank' | 'bulwark' | 'accelerate' | 'ganking' | 'temporary' | 'banish';

export interface StatDef { id: string; name: string; icon?: string }
export interface Color { id: string; name: string; hex: string; icon?: string }
export interface Counter { id: string; name: string; icon?: string; adds?: Record<string, number>; stops?: ('attack' | 'block')[]; expires?: boolean } // expires: removed at the end of its controller's turn // +1/+1: adds {power: 1, health: 1}; sleep: stops attack
export interface CustomZone { id: string; name: string; vis: 'public' | 'owner' | 'hidden'; size: number; inPlay: boolean; global?: boolean } // size 0 = unlimited; global: a new card replaces the one in either player's zone
export interface Arena { id: string; name: string; size: number; attack: boolean } // a board area units are played into; `attack`: units here can attack/block
export interface StatSlot { stat: string; pos: Pos; icon?: string; label?: string }
export interface FrameDef { base: string; cost: 'tl' | 'tr' | 'none'; stats: StatSlot[]; art: number; level?: string; text: boolean; layout?: 'portrait' | 'landscape' }
export interface CardType { id: string; name: string; role: Role; frame: FrameDef; icon?: string; zone?: string; playTo?: string } // zone: the arena its units enter; playTo: a custom zone permanents go to
export interface Keyword { id: string; name: string; rule: KeywordRule; text: string; valued?: boolean; abilities?: Ability[] }
export interface Phase { id: string; name: string; kind: PhaseKind; n?: number; raw?: unknown[]; each?: boolean; drawTo?: number; alternate?: boolean }

export interface Resource {
  mode: 'ramp' | 'cards' | 'anycard' | 'deck' | 'attach' | 'pitch' | 'none';
  name: string; icon: string;
  start: number; perTurn: number; max: number; // ramp: capacity; deck: cards revealed per turn (start = first player's first turn)
  deckSize: number; // deck mode: size of the resource deck section
  boost: number; // > 0: spend 1 resource for +boost power until end of turn
  summonsPerTurn: number; // 0 = unlimited
  tribute: { level: number; n: number }[]; // units with stat `level` >= level need n tributes
  faceDown?: boolean; // anycard: resources are placed face down (and make generic resource)
  onlyKeyword?: string; // anycard: only cards with this keyword can become resources
  levelGate?: string; // a card can be played only if its value of this stat <= the resources you have in play
  need?: { stat: string; gen: string } | null; // a card needs the sum of `gen` on your units >= its `stat` (not spent)
  actions?: number; // action points per turn (0 = off): non-quick cards cost 1, Go again gives it back
  pitchStat?: string; // pitch mode: the stat a card is worth when pitched from hand
  recycle?: boolean; // deck mode: each resource gives 1 generic; colored costs are paid by recycling resources of that color to the bottom of the resource deck
  secondBonus?: number; // deck mode: extra resources the second player reveals on their first turn
  give?: boolean; // boost becomes "give": in your main phase, attach 1 unspent resource to your leader or a unit for +boost power this turn (counted for 'attached' conditions; returns at your next turn)
}
export interface Combat {
  mode: 'block' | 'target' | 'duel' | 'lanes' | 'cards' | 'none';
  power: string; health: string | null; defense: string | null; // stat ids
  damage: 'heal' | 'persist'; // marked damage heals at end of turn, or stays
  sickness: boolean; firstTurnAttack: boolean;
  targetUnits: 'any' | 'exhausted' | 'none'; directOnlyIfEmpty: boolean; leaderDefends: boolean; leaderAttacks: boolean;
  compare: { ties: 'defender' | 'both' | 'none'; loser: boolean; overflow: boolean };
  positions: boolean; counterStep: boolean;
  fieldSize: number; benchSize: number; attackEndsTurn: boolean; weakness: number;
  lanes: string[];
  arenas?: Arena[]; // replaces the single board with named areas (ground/space, front line/energy line)
  direct?: 'always' | 'ifEmpty' | 'never'; // may attackers hit the player/leader directly?
  sameArena?: boolean; // attackers only target units in their own arena
  quest?: string | null; // a stat: units may exhaust to score that many points instead of attacking
  maxBlockers?: number; // block mode: how many units may block one attacker
  blockStat?: string | null; // cards mode: the stat that blocks when a card is discarded from hand to defend
  conquest?: boolean; // lanes: units enter exhausted and move in groups; moving into an enemy battlefield opens a showdown (response window), then a fight (Tank first, lethal damage, survivors heal, attackers recalled on a tie)
  firstTurnEach?: boolean; // with firstTurnAttack off: neither player attacks on their own first turn (not just turn 1)
  finalPoint?: boolean; // lanes: a conquest can't win the game unless you scored every battlefield this turn (draw a card instead)
}
export interface Win { life: number; lifeCards: number; prizes: number; points: number; deckOut: boolean; noUnits: boolean; lifeTriggers?: boolean }
export interface Setup { hand: number; mulligan: boolean; handLimit: number; deckMin: number; deckMax: number; maxCopies: number; skipFirstDraw: boolean; leader: boolean; extraMax: number; turnLimit: number;
  mulliganN?: number; // > 0: mulligan by setting aside up to N cards (to the bottom) and drawing that many
  champion?: boolean; // each deck names a champion unit that starts in a champion zone and can be played from there
  leaderColors?: boolean; // every card must match one of the leader's two colors
  sites?: number; // lanes: battlefield cards per deck; one is chosen at random for each player's battlefield
}

export interface Cond { k: 'units' | 'life' | 'hand' | 'yourTurn' | 'res' | 'counter' | 'zone' | 'played' | 'attached' | 'raw'; n?: number; counter?: string; zone?: string; raw?: unknown }
export interface Filter { type?: string; color?: string; keyword?: string; stat?: string; op?: 'le' | 'ge'; val?: number; exhausted?: boolean; zone?: string; name?: string }
export interface Effect { k: EffectKind; n?: number; kw?: string; target?: TargetKind; filter?: Filter; stat?: string; until?: 'turn' | 'forever'; who?: 'me' | 'opp' | 'each'; card?: string; type?: string; rule?: KeywordRule; to?: 'hand' | 'deck'; zone?: string; raw?: unknown[] }
export interface Ability {
  when: When; if?: Cond; do: Effect[]; once?: boolean | 'game'; label?: string;
  cost?: number; tap?: boolean; discard?: number; sacrifice?: boolean; life?: number; uncount?: { id: string; n: number }; banish?: number; returnRes?: number; // activation costs
}
export interface Move { name: string; cost: Record<string, number>; damage: number; do?: Effect[] }
export interface CardBP {
  id: string; name: string; type: string;
  cost?: number | Record<string, number>;
  stats: Record<string, number>;
  color?: string; color2?: string; keywords: string[]; abilities: Ability[];
  kwv?: Record<string, number>; // numbers for valued keywords (Resist 2)
  family?: string; // a shared base name (evolution/shift onto any card of this family)
  text?: string; flavor?: string; art?: string;
  moves?: Move[]; evolvesFrom?: string; materials?: number; weakness?: string; retreat?: number;
  bonus?: Record<string, number>; // attachments: stat bonus to the bearer
  raw?: Record<string, unknown>; // advanced: merged over the compiled card
}
export interface DeckBP { id: string; name: string; main: Record<string, number>; leader?: string; champion?: string; sites?: string[]; extra?: Record<string, number>; res?: Record<string, number> }

export interface Blueprint {
  v: 1;
  id: string; name: string; tagline: string; author?: string; blueprint?: string;
  look: { accent: string; accent2: string; glyph: string };
  colors: Color[];
  stats: StatDef[];
  counters?: Counter[];
  zones?: CustomZone[];
  types: CardType[];
  keywords: Keyword[];
  turn: Phase[];
  timing: 'simple' | 'stack' | 'chain';
  resource: Resource;
  combat: Combat;
  win: Win;
  setup: Setup;
  zoneNames: Record<string, string>;
  cards: CardBP[];
  decks: DeckBP[];
  recipes?: string[]; // mechanic recipes applied from the shelf
  advanced?: { rules?: Record<string, unknown>; functions?: Record<string, unknown>; procedures?: Record<string, unknown>; triggers?: unknown[]; ai?: Record<string, unknown> };
}

/** Fills fields added after a blueprint was saved, so older projects keep loading. */
export function normalize(bp: Blueprint): Blueprint {
  bp.counters ??= [];
  const c = bp.combat;
  c.direct ??= c.directOnlyIfEmpty ? 'ifEmpty' : 'always';
  c.maxBlockers ??= 1;
  c.sameArena ??= false;
  c.quest ??= null;
  c.blockStat ??= null;
  bp.resource.actions ??= 0;
  bp.resource.need ??= null;
  bp.win.lifeTriggers ??= false;
  for (const k of bp.cards) { k.keywords ??= []; k.abilities ??= []; k.stats ??= {}; }
  return bp;
}

/** Rules every keyword can carry: the label is what the Maker shows; the game reads only the rule. */
export const KEYWORD_RULES: Record<KeywordRule, { label: string; text: string; valued?: boolean }> = {
  none: { label: 'Just a name (or its own abilities)', text: '' },
  haste: { label: 'Attacks right away', text: 'Can attack the turn it is played.' },
  guard: { label: 'Must be attacked first', text: 'Enemies must attack this before anything else.' },
  blocker: { label: 'Can jump in front of an attack', text: 'When an enemy attacks, you may exhaust this to become the target.' },
  flying: { label: 'Evasive (only its kind can block or attack it)', text: 'Only units with this keyword can block it or attack it.' },
  vigilance: { label: "Doesn't exhaust to attack", text: 'Attacking does not exhaust it.' },
  lifesteal: { label: 'Heals you as it hits', text: 'Combat damage it deals is gained as life.' },
  deadly: { label: 'Any damage destroys', text: 'Any combat damage it deals to a unit destroys that unit.' },
  shield: { label: 'Ignores the first hit', text: 'The first time it would be damaged or destroyed, prevent that.' },
  double: { label: 'Hits twice as hard', text: 'Deals double damage to players (two life cards).' },
  overflow: { label: 'Excess damage spills over', text: 'Damage beyond what destroys the unit it fights hits the player.' },
  ward: { label: "Opponents can't target it", text: "Can't be chosen by an opponent's effects." },
  firstStrike: { label: 'Strikes first in combat', text: 'Deals combat damage before units without this keyword.' },
  resist: { label: 'Takes N less damage', text: 'Damage dealt to it is reduced by N.', valued: true },
  challenger: { label: '+N power while attacking', text: 'Gets +N power while attacking.', valued: true },
  saboteur: { label: 'Ignores "must be attacked first"', text: 'Can attack past units that must be attacked first.' },
  goAgain: { label: 'Go again (refunds its action point)', text: 'Gives back the action point it used.' },
  trigger: { label: 'Life-card trigger', text: 'When this is taken from your life cards, you may use it for free.' },
  song: { label: 'Song (a unit can sing it instead of paying)', text: 'Instead of paying, exhaust one of your units whose cost is at least this card\'s cost.' },
  noAttack: { label: "Can't attack", text: "Can't attack (or quest)." },
  noBlock: { label: "Can't block", text: "Can't block or intercept attacks." },
  noBeAttacked: { label: "Can't be attacked", text: "Enemies can't choose it as an attack target." },
  unblockable: { label: "Can't be blocked", text: "Can't be blocked." },
  entersExhausted: { label: 'Enters exhausted', text: 'Enters play exhausted (tapped).' },
  tank: { label: 'Takes the hits first', text: 'In a fight, enemies must deal lethal damage to this before other units.' },
  bulwark: { label: '+N power while defending', text: 'Gets +N power while defending a battlefield.', valued: true },
  accelerate: { label: 'Pay extra to enter ready', text: 'As you play it, you may pay 1 more and 1 more of its color to have it enter ready.' },
  ganking: { label: 'Moves between battlefields', text: 'Can move from one battlefield straight to another.' },
  temporary: { label: 'Leaves at your next turn', text: 'At the start of your next turn, destroy it.' },
  banish: { label: 'Its hits trash life cards', text: 'Life cards it takes go to the discard pile instead of the hand (no triggers).' },
};

export const ROLES: Record<Role, { label: string; hint: string }> = {
  unit: { label: 'Unit', hint: 'Goes onto the board and fights.' },
  spell: { label: 'Spell', hint: 'One-shot effect on your turn, then it is discarded.' },
  fast: { label: 'Quick spell', hint: 'One-shot effect you can play during battles and on the opponent\'s turn.' },
  attack: { label: 'Attack card', hint: 'Played from hand to attack with its own power; the defender blocks with cards from hand.' },
  permanent: { label: 'Permanent', hint: 'Stays on the board with an ongoing effect (items, equipment, weapons, locations).' },
  attachment: { label: 'Attachment', hint: 'Attaches to one of your units and boosts it (gear, pilots, tools).' },
  resource: { label: 'Resource', hint: 'Pays for other cards (lands, energy, runes...).' },
  trap: { label: 'Trap', hint: 'Set face down, then spring it on a later turn.' },
  leader: { label: 'Leader', hint: 'Starts in play; your champion. Its life stat can set your life cards.' },
  evolution: { label: 'Evolution', hint: 'Played on top of a named unit (or a family), keeping its damage and attachments.' },
  extra: { label: 'Extra-deck unit', hint: 'Waits in a separate deck; summon it by giving up units.' },
  token: { label: 'Token', hint: 'Made by effects; never in a deck.' },
  battlefield: { label: 'Battlefield', hint: 'A place to fight over. Each deck brings some; one is chosen for each player. Gives its effects to whoever conquers or holds it.' },
};
