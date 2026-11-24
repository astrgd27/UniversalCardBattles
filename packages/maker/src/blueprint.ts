// Game Maker blueprints: a friendly, form-shaped description of a whole card game. compile.ts turns one into an
// engine module (rules, cards, decks, manifest, AI hints). Everything is plain JSON so projects save, export and diff.

export type Role = 'unit' | 'spell' | 'fast' | 'permanent' | 'attachment' | 'resource' | 'trap' | 'leader' | 'evolution' | 'extra' | 'token';
export type Pos = 'tl' | 'tr' | 'bl' | 'br' | 'line';
export type PhaseKind = 'ready' | 'draw' | 'resource' | 'main' | 'combat' | 'end' | 'custom';
export type When = 'play' | 'leave' | 'attack' | 'hit' | 'startTurn' | 'endTurn' | 'activated' | 'static' | 'opAttack';
export type TargetKind =
  | 'self' | 'enemyUnit' | 'anyUnit' | 'ownUnit' | 'otherOwnUnit' | 'enemyAny' | 'opponent' | 'you' | 'eachPlayer'
  | 'allEnemyUnits' | 'allUnits' | 'allOwnUnits' | 'randomEnemyUnit' | 'attacker' | 'battleTarget';
export type EffectKind =
  | 'draw' | 'damage' | 'heal' | 'buff' | 'destroy' | 'bounce' | 'exhaust' | 'ready' | 'token' | 'gain' | 'discard' | 'mill'
  | 'search' | 'recover' | 'counter' | 'lifeGain' | 'lifeLoss' | 'score' | 'addLife' | 'aura' | 'win' | 'raw';
export type KeywordRule = 'none' | 'haste' | 'guard' | 'blocker' | 'flying' | 'vigilance' | 'lifesteal' | 'deadly' | 'shield' | 'double' | 'overflow' | 'ward';

export interface StatDef { id: string; name: string; icon?: string }
export interface Color { id: string; name: string; hex: string; icon?: string }
export interface StatSlot { stat: string; pos: Pos; icon?: string; label?: string }
export interface FrameDef { base: string; cost: 'tl' | 'tr' | 'none'; stats: StatSlot[]; art: number; level?: string; text: boolean; layout?: 'portrait' | 'landscape' }
export interface CardType { id: string; name: string; role: Role; frame: FrameDef; icon?: string }
export interface Keyword { id: string; name: string; rule: KeywordRule; text: string }
export interface Phase { id: string; name: string; kind: PhaseKind; n?: number; raw?: unknown[] }

export interface Resource {
  mode: 'ramp' | 'cards' | 'anycard' | 'deck' | 'attach' | 'none';
  name: string; icon: string;
  start: number; perTurn: number; max: number; // ramp: capacity; deck: cards revealed per turn (start = first player's first turn)
  deckSize: number; // deck mode: size of the resource deck section
  boost: number; // > 0: spend 1 resource for +boost power until end of turn
  summonsPerTurn: number; // 0 = unlimited
  tribute: { level: number; n: number }[]; // units with stat `level` >= level need n tributes
}
export interface Combat {
  mode: 'block' | 'target' | 'duel' | 'lanes' | 'none';
  power: string; health: string | null; defense: string | null; // stat ids
  damage: 'heal' | 'persist'; // marked damage heals at end of turn, or stays
  sickness: boolean; firstTurnAttack: boolean;
  targetUnits: 'any' | 'exhausted' | 'none'; directOnlyIfEmpty: boolean; leaderDefends: boolean; leaderAttacks: boolean;
  compare: { ties: 'defender' | 'both' | 'none'; loser: boolean; overflow: boolean };
  positions: boolean; counterStep: boolean;
  fieldSize: number; benchSize: number; attackEndsTurn: boolean; weakness: number;
  lanes: string[];
}
export interface Win { life: number; lifeCards: number; prizes: number; points: number; deckOut: boolean; noUnits: boolean }
export interface Setup { hand: number; mulligan: boolean; handLimit: number; deckMin: number; deckMax: number; maxCopies: number; skipFirstDraw: boolean; leader: boolean; extraMax: number; turnLimit: number }

export interface Cond { k: 'units' | 'life' | 'hand' | 'yourTurn' | 'raw'; n?: number; raw?: unknown }
export interface Effect { k: EffectKind; n?: number; target?: TargetKind; stat?: string; until?: 'turn' | 'forever'; who?: 'me' | 'opp' | 'each'; card?: string; type?: string; raw?: unknown[] }
export interface Ability { when: When; if?: Cond; do: Effect[]; once?: boolean | 'game'; cost?: number; tap?: boolean; label?: string }
export interface Move { name: string; cost: Record<string, number>; damage: number; do?: Effect[] }
export interface CardBP {
  id: string; name: string; type: string;
  cost?: number | Record<string, number>;
  stats: Record<string, number>;
  color?: string; keywords: string[]; abilities: Ability[];
  text?: string; flavor?: string; art?: string;
  moves?: Move[]; evolvesFrom?: string; materials?: number; weakness?: string; retreat?: number;
  bonus?: Record<string, number>; // attachments: stat bonus to the bearer
  raw?: Record<string, unknown>; // advanced: merged over the compiled card
}
export interface DeckBP { id: string; name: string; main: Record<string, number>; leader?: string; extra?: Record<string, number>; res?: Record<string, number> }

export interface Blueprint {
  v: 1;
  id: string; name: string; tagline: string; author?: string; blueprint?: string;
  look: { accent: string; accent2: string; glyph: string };
  colors: Color[];
  stats: StatDef[];
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
  advanced?: { rules?: Record<string, unknown>; functions?: Record<string, unknown>; procedures?: Record<string, unknown>; triggers?: unknown[]; ai?: Record<string, unknown> };
}

/** Rules every keyword can carry: the label is what the Maker shows; the game reads only the rule. */
export const KEYWORD_RULES: Record<KeywordRule, { label: string; text: string }> = {
  none: { label: 'Just a name (no built-in rule)', text: '' },
  haste: { label: 'Attacks right away', text: 'Can attack the turn it is played.' },
  guard: { label: 'Must be attacked first', text: 'Enemies must attack this before anything else.' },
  blocker: { label: 'Can jump in front of an attack', text: 'When an enemy attacks, you may exhaust this to become the target.' },
  flying: { label: 'Only fliers can block it', text: 'Can only be blocked by units with this keyword.' },
  vigilance: { label: "Doesn't exhaust to attack", text: 'Attacking does not exhaust it.' },
  lifesteal: { label: 'Heals you as it hits', text: 'Combat damage it deals is gained as life.' },
  deadly: { label: 'Any damage destroys', text: 'Any combat damage it deals to a unit destroys that unit.' },
  shield: { label: 'Ignores the first hit', text: 'The first time it would be damaged or destroyed, prevent that.' },
  double: { label: 'Hits twice as hard', text: 'Deals double damage to players (two life cards).' },
  overflow: { label: 'Excess damage spills over', text: 'Damage beyond what kills a blocker hits the player.' },
  ward: { label: "Opponents can't target it", text: "Can't be chosen by an opponent's effects." },
};

export const ROLES: Record<Role, { label: string; hint: string }> = {
  unit: { label: 'Unit', hint: 'Goes onto the board and fights.' },
  spell: { label: 'Spell', hint: 'One-shot effect on your turn, then it is discarded.' },
  fast: { label: 'Quick spell', hint: 'One-shot effect you can play during battles and on the opponent\'s turn.' },
  permanent: { label: 'Permanent', hint: 'Stays on the board with an ongoing effect.' },
  attachment: { label: 'Attachment', hint: 'Attaches to one of your units and boosts it.' },
  resource: { label: 'Resource', hint: 'Pays for other cards (lands, energy, runes...).' },
  trap: { label: 'Trap', hint: 'Set face down, then spring it on a later turn.' },
  leader: { label: 'Leader', hint: 'Starts in play; your champion. Its health can be your life.' },
  evolution: { label: 'Evolution', hint: 'Played on top of a named unit, keeping its damage and attachments.' },
  extra: { label: 'Extra-deck unit', hint: 'Waits in a separate deck; summon it by giving up units.' },
  token: { label: 'Token', hint: 'Made by effects; never in a deck.' },
};
