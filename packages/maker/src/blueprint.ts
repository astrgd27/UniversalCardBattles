// Game Maker blueprints: a friendly, form-shaped description of a whole card game. compile.ts turns one into an
// engine module (rules, cards, decks, manifest, AI hints). Everything is plain JSON so projects save, export and diff.
// The vocabulary is small on purpose: zones (arenas), counters, keywords (optionally with a number and an ability
// bundle), and When → If → Do ability blocks whose targets take filters and whose activations take cost blocks.

export type Role = 'unit' | 'spell' | 'fast' | 'permanent' | 'attachment' | 'resource' | 'trap' | 'leader' | 'evolution' | 'extra' | 'token' | 'attack' | 'battlefield' | 'walker' | 'location' | 'ice' | 'agenda';
export type Pos = 'tl' | 'tr' | 'bl' | 'br' | 'line';
export type PhaseKind = 'ready' | 'draw' | 'resource' | 'main' | 'combat' | 'end' | 'custom';
export type When = 'play' | 'leave' | 'attack' | 'hit' | 'quest' | 'startTurn' | 'endTurn' | 'activated' | 'static' | 'opAttack' | 'conquer' | 'hold' | 'block' | 'castSpell' | 'landfall' | 'flip' | 'access' | 'event'; // event: whenever a named event happens (see Ability.event)
export type TargetKind =
  | 'self' | 'enemyUnit' | 'anyUnit' | 'ownUnit' | 'otherOwnUnit' | 'enemyAny' | 'opponent' | 'you' | 'eachPlayer'
  | 'allEnemyUnits' | 'allUnits' | 'allOwnUnits' | 'randomEnemyUnit' | 'attacker' | 'battleTarget' | 'ownLeader' | 'ownAny';
export type EffectKind =
  | 'draw' | 'damage' | 'heal' | 'buff' | 'destroy' | 'bounce' | 'exhaust' | 'ready' | 'token' | 'gain' | 'discard' | 'mill'
  | 'search' | 'recover' | 'counter' | 'lifeGain' | 'lifeLoss' | 'score' | 'addLife' | 'aura' | 'win' | 'raw'
  | 'addCounter' | 'removeCounter' | 'strike' | 'deploy'
  | 'restrict' | 'prevent' | 'costMod' | 'insteadDestroy' | 'moveTo' | 'scry'
  | 'dig' | 'putIntoPlay' | 'addRes' | 'readyRes' | 'giveRes' | 'lifeToHand' | 'handToLife'
  | 'inflict' | 'cure' | 'flip' | 'switch' | 'tutor' | 'attachFrom' | 'drawTo' | 'skipEvolve' | 'fight' | 'surveil' | 'roll' | 'fusion' | 'ritual' | 'drops' | 'endRun' | 'wound' | 'tag' | 'meter';
export type KeywordRule = 'none' | 'haste' | 'guard' | 'blocker' | 'flying' | 'vigilance' | 'lifesteal' | 'deadly' | 'shield' | 'double' | 'overflow' | 'ward'
  | 'firstStrike' | 'resist' | 'challenger' | 'saboteur' | 'goAgain' | 'trigger' | 'song'
  | 'noAttack' | 'noBlock' | 'noBeAttacked' | 'unblockable' | 'entersExhausted'
  | 'tank' | 'bulwark' | 'accelerate' | 'ganking' | 'temporary' | 'banish' | 'rushUnits' | 'noKO'
  | 'reach' | 'doubleStrike' | 'menace' | 'indestructible' | 'flash' | 'wardTax' | 'legendary'
  | 'tuner' | 'directAttack' | 'extraAttack' | 'hidden' | 'deflect'
  | 'ex' | 'powerful' | 'stun' | 'breaker' | 'flashAtk'
  | 'bodyguard' | 'support' | 'reckless' | 'adventurous' | 'vanish' | 'boost' | 'underdog' | 'singer' | 'singTogether';

/** How the battle table draws the board (Workshop: Name & Look → Board & layout). */
export interface BoardLook {
  layout?: 'auto' | 'free' | 'mat' | 'lanes'; // auto: a duel mat for slot boards, a battlefield strip for battlefields, free-form zones otherwise; free: always free-form
  labels?: 'top' | 'side' | 'hidden'; // zone names: small on top (default), vertical on the side, or hidden
  scale?: number; // board card size multiplier (0.7-1.4)
  slotNames?: boolean; // show slot names (M1, S1...) in empty slots (default true)
  used?: 'tilt' | 'dim' | 'badge' | 'none'; // cards that attacked, exhausted or used an ability this turn: tilt sideways (tap), dim, a small badge, or no change
  defenseSideways?: boolean; // games with positions: draw defense position sideways (default true)
  corners?: { lm?: string; ls?: string; rm?: string; rs?: string }; // duel mat corner piles: left of monsters, left of spells, right of monsters, right of spells
}
/** New mechanics (not from any one game). */
/** A meter: a number kept on each player, each unit or the whole game. Things raise it, it can decay, cap or cycle, its values
 *  can have names (Day, Night…), crossing a step runs effects, and while it holds a value it can change units' stats.
 *  World clocks, heat, aging, rage, doom tracks and combo counters are all meters. Stored as var m_<id>. */
export interface Meter {
  id: string; name: string; icon?: string;
  on: 'player' | 'unit' | 'game';
  gain: MeterGain[];
  every?: number; // turn-based gains happen only every N turns
  decay?: number; // lost at the start of its owner's turn (each turn for a game meter)
  max?: number; // it can't go above this; with wrap, reaching it starts again from 0 (a cycle)
  wrap?: boolean;
  names?: string[]; // a name for each value, e.g. Day / Night; shown instead of the number
  steps?: MeterStep[]; // when it reaches n: run effects, optionally reset to 0
  aura?: { at: number; op?: 'eq' | 'ge'; stat: string; n: number }; // while the meter is (at least) `at`: units get +n stat (game: all units; player: their units; unit: that unit)
  per?: { stat: string; n: number }; // +n stat for each point (unit meters: that unit; player meters: their units)
  hidden?: boolean; // not shown on the battle screen
  ai?: number; // how much the computer player values each point for its owner (negative: it avoids it, like heat). Default 0
}
export type MeterTrigger = 'play' | 'turnStart' | 'turnEnd' | 'damaged' | 'attack' | 'destroyed' | 'event';
/** play: a card is played (player: by them; unit: by its controller; game: by anyone); turnStart/turnEnd: its owner's turn (game: every turn);
 *  damaged: the player or unit takes damage; attack: the player or unit attacks; destroyed: a unit of the player dies (game: any unit). */
export interface MeterGain { on: MeterTrigger; n?: number; cost?: boolean; event?: string } // event: any named event (player meters go to its player, unit meters to its card) // cost: gain the played card's cost instead of n
export interface MeterStep { n: number; do: Effect[]; reset?: boolean; say?: string } // say: the battle log line ({p} the player, {o} the unit, {s} verb ending)
export interface Comeback { by: 'life' | 'points' | 'units' | 'hand' | 'meter'; meter?: string; gap: number; bonus: 'draw' | 'resource' | 'heal' | 'effects'; n: number;
  do?: Effect[] } // bonus 'effects': run these ability blocks instead (for the trailing player); by 'meter': behind = lower on that player meter // at the start of your turn, if you trail by `gap` or more, get the bonus
export interface StatDef { id: string; name: string; icon?: string }
export interface Color { id: string; name: string; hex: string; icon?: string }
export interface Counter { id: string; name: string; icon?: string; adds?: Record<string, number>; stops?: ('attack' | 'block')[]; expires?: boolean; max?: number } // expires: removed at the end of its controller's turn // +1/+1: adds {power: 1, health: 1}; sleep: stops attack
/** A status effect a game defines (asleep, poisoned, stunned, burning, frozen, inspired...). Stored on a unit as var st_<id> (its level). */
export interface Status {
  id: string; name: string; icon?: string;
  group?: string; // statuses in the same group replace each other
  activeOnly?: boolean; // active-duel games: only the active unit can have it, and moving to the bench clears it
  stops?: ('attack' | 'block' | 'retreat' | 'abilities')[];
  adds?: Record<string, number>; // stat change per level while it has it
  stacks?: boolean; // inflicting it again raises its level (tick damage and stat changes scale)
  tickWhen?: 'betweenTurns' | 'ownerStart' | 'ownerEnd'; // when it ticks (default: between turns)
  tickDamage?: number; // damage to the unit each tick (times its level)
  tickFlip?: boolean; // after the tick damage, flip a coin: heads cures it
  lasts?: 'untilCured' | 'ownerNextTurnEnd' | 'endOfTurn';
  attackFlip?: number; // when it attacks, flip a coin: tails = the attack fails and it takes this much damage
  noDamage?: boolean; // deals no damage in fights (battlefield fights and mass combat)
}
export interface CustomZone { id: string; name: string; vis: 'public' | 'owner' | 'hidden'; size: number; inPlay: boolean; global?: boolean } // size 0 = unlimited; global: a new card replaces the one in either player's zone
export interface Arena { id: string; name: string; size: number; attack: boolean } // a board area units are played into; `attack`: units here can attack/block
export interface StatSlot { stat: string; pos: Pos; icon?: string; label?: string }
export interface FrameDef { base: string; cost: 'tl' | 'tr' | 'none'; stats: StatSlot[]; art: number; level?: string; text: boolean; layout?: 'portrait' | 'landscape' }
export interface CardType { id: string; name: string; role: Role; frame: FrameDef; icon?: string; zone?: string; playTo?: string; perTurn?: number; notFirstTurn?: boolean; perUnit?: number; anyUnit?: boolean; equipment?: boolean;
  method?: 'materials' | 'fusion' | 'synchro' | 'xyz' | 'link'; ritual?: boolean; foundation?: boolean;
  side?: 0 | 1; memory?: boolean; tagTarget?: boolean; showdown?: boolean; settable?: boolean; speed3?: boolean; continuous?: boolean }
// side (asymmetric games): the side that uses this type; memory: programs that use memory; tagTarget: the opponent may trash it while you have tags
// method (extra-deck types): how it is summoned; ritual: summoned only by a ritual effect; settable (quick spells): can be set and used from the next turn;
// speed3 (traps): responds to anything; continuous (traps): stays face up after it is sprung
// anyUnit (attachments): may go on any unit, yours or the opponent's (auras, curses); equipment: stays when its unit leaves and can be moved with equipCost
// perTurn: at most N of this type per turn; notFirstTurn: not on the first turn of the game; perUnit (attachments): at most N on one unit // zone: the arena its units enter; playTo: a custom zone permanents go to
export interface Keyword { id: string; name: string; rule: KeywordRule; text: string; valued?: boolean; abilities?: Ability[]; deckMax?: number } // deckMax: at most N cards with it per deck
export interface Phase { id: string; name: string; kind: PhaseKind; side?: 0 | 1; n?: number; raw?: unknown[]; each?: boolean; drawTo?: number; alternate?: boolean }

export interface Resource {
  mode: 'ramp' | 'cards' | 'anycard' | 'deck' | 'attach' | 'pitch' | 'check' | 'bank' | 'none'; // bank: credits carry over; start with `start`
  actionsStat?: string; spendAll?: boolean; basicActions?: boolean; // actions per turn from the leader's stat; no ending the turn with actions left; 'draw a card' and 'take 1' actions // check: play cards by passing a skill check (top card's check value vs difficulty + cards already played this turn); foundations help
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
  plays?: number; // resource cards you may place per turn (lands, inkwell, energy attachments; default 1)
  checkStep?: number; failEnds?: boolean; // check mode: difficulty added per card already in your pool (default 1); a failed check ends your turn (default true)
  songAny?: boolean; // songs: any ready unit may sing them, whatever its cost
  checkStat?: string; // check mode: the stat on every card used as its check value (default 'check')
  pitchStat?: string; // pitch mode: the stat a card is worth when pitched from hand
  recycle?: boolean; // deck mode: each resource gives 1 generic; colored costs are paid by recycling resources of that color to the bottom of the resource deck
  secondBonus?: number; // deck mode: extra resources the second player reveals on their first turn
  give?: boolean; // boost becomes "give": in your main phase, attach 1 unspent resource to your leader or a unit for +boost power this turn (counted for 'attached' conditions; returns at your next turn)
}
export interface Combat {
  mode: 'block' | 'target' | 'duel' | 'lanes' | 'cards' | 'runs' | 'none'; // runs: asymmetric server raids (see docs)
  remotes?: number; memory?: number; // runs: remote servers per defender, memory for the raider's programs
  power: string; health: string | null; defense: string | null; // stat ids
  damage: 'heal' | 'persist'; // marked damage heals at end of turn, or stays
  sickness: boolean; firstTurnAttack: boolean;
  targetUnits: 'any' | 'exhausted' | 'none'; directOnlyIfEmpty: boolean; leaderDefends: boolean; leaderAttacks: boolean;
  compare: { ties: 'defender' | 'both' | 'none'; loser: boolean; overflow: boolean };
  positions: boolean; counterStep: boolean;
  fieldSize: number; benchSize: number; attackEndsTurn: boolean; weakness: number; resistance?: number; counterSize?: number; // counterSize: damage per 'damage counter' (attack bonuses count counters)
  lanes: string[];
  arenas?: Arena[]; // replaces the single board with named areas (ground/space, front line/energy line)
  direct?: 'always' | 'ifEmpty' | 'never'; // may attackers hit the player/leader directly?
  sameArena?: boolean; // attackers only target units in their own arena
  quest?: string | null; // a stat: units may exhaust to score that many points instead of attacking
  maxBlockers?: number; // block mode: how many units may block one attacker
  blockStat?: string | null; // cards mode: the stat that blocks when a card is discarded from hand to defend
  conquest?: boolean; // lanes: units enter exhausted and move in groups; moving into an enemy battlefield opens a showdown (response window), then a fight (Tank first, lethal damage, survivors heal, attackers recalled on a tie)
  counterOnly?: boolean; // quick spells can be played only while defending (in the response step)
  replaceFull?: boolean; // with a full board, playing a unit first trashes one of yours
  grid?: boolean; // units occupy numbered columns (the player picks one), support has 5 slots; enables adjacent/opposite filters
  emz?: boolean; // grid: two shared extra zones above the board (one per player); link and extra-deck pendulum summons go there or where your link arrows point
  nearBlock?: 'half' | 'full' | 'none'; momentum?: boolean; // zone combat: what a block from the neighbouring zone does (default half damage); attacks that hit become momentum (default true)
  placeLore?: boolean; // places with lore score it at the start of their owner's turn (default true)
  zones?: boolean; // cards mode: attacks have a zone (stat azone: 1 low, 2 mid, 3 high), speed and damage; defenders block from hand with a check (speed + the block card's bmod); same zone blocks it all, a neighbouring zone half; an enhance step comes first; attacks that hit become momentum
  mass?: boolean; // block mode: declare all attackers at once (at the player or a walker), assign blockers (several per attacker), first-strike and regular damage steps
  firstTurnEach?: boolean; // with firstTurnAttack off: neither player attacks on their own first turn (not just turn 1)
  finalPoint?: boolean;
  playToControlled?: boolean; // conquest: units may be played straight to a battlefield you control
  assignDamage?: boolean; // conquest: each side chooses which enemy gets lethal damage next (Tank first) // lanes: a conquest can't win the game unless you scored every battlefield this turn (draw a card instead)
}
export interface Win { life: number; lifeCards: number; prizes: number; points: number; deckOut: boolean; noUnits: boolean; lifeTriggers?: boolean; burnOut?: boolean; emptyEnd?: boolean } // emptyEnd: a player who ends their turn with an empty deck loses // burnOut: drawing from an empty deck gives the opponent a point and shuffles the discard pile back
export interface Setup { hand: number; mulligan: boolean; handLimit: number; deckMin: number; deckMax: number; maxCopies: number; skipFirstDraw: boolean; leader: boolean; extraMax: number; turnLimit: number;
  sides?: [string, string]; // asymmetric game: side names; each deck's leader (identity) type decides its side, side 0 goes first
  maxColors?: number;
  leaderLife?: string; leaderHand?: string; // the leader's stats that set your starting life and your hand size (draw-up-to) // a deck may use at most this many colors
  mulliganN?: number; // > 0: mulligan by setting aside up to N cards (to the bottom) and drawing that many
  champion?: boolean; // each deck names a champion unit that starts in a champion zone and can be played from there
  leaderColors?: boolean; // every card must match one of the leader's two colors
  sites?: number; // lanes: battlefield cards per deck; one is chosen at random for each player's battlefield
  benchSetup?: boolean; // active-duel: also put basic units on the bench during setup
  mulliganBonus?: boolean; // mulligans happen only without a basic unit, and the opponent draws 1 per mulligan
  noEvolveFirstTurn?: boolean; // nobody evolves on their own first turn
  london?: boolean; // mulligan: shuffle and draw a full hand again, then put 1 card on the bottom per mulligan
}

export interface Cond { k: 'units' | 'life' | 'hand' | 'yourTurn' | 'res' | 'counter' | 'zone' | 'played' | 'attached' | 'oppTurn' | 'oppLife' | 'status' | 'kicked' | 'charged' | 'linked' | 'under' | 'here' | 'attacking' | 'defending' | 'meter' | 'all' | 'any' | 'not' | 'raw'; n?: number; counter?: string; zone?: string; status?: string; raw?: unknown;
  meter?: string; op?: 'ge' | 'le' | 'eq'; // meter: compare the meter (this unit's, your, or the game's) with n (default at least)
  of?: Cond[] } // all / any / not: combine other conditions (not uses the first)
export interface Filter { type?: string; color?: string; keyword?: string; notKeyword?: string; stat?: string; op?: 'le' | 'ge' | 'eq'; val?: number; exhausted?: boolean; // exhausted false: ready ones only
  damaged?: boolean; counter?: string; meter?: string; meterN?: number; // damaged; has a counter of this kind; a unit meter at meterN or more
  zone?: string; name?: string; trait?: string; status?: string;
  adjacent?: boolean; opposite?: boolean; pointed?: boolean; here?: boolean } // here: at this location (locations' abilities) // grid boards: in a neighboring column of this; in the column facing this; pointed at by this card's link arrows
/** A changing amount: X = how many of something there are (your units, cards in hand…), a meter, this card's counters or a stat,
 *  times `times`, plus `plus` (never below 0). Any effect with an amount can use it instead of a fixed number. */
export interface Amount { of: 'units' | 'enemyUnits' | 'allUnits' | 'hand' | 'oppHand' | 'grave' | 'deck' | 'life' | 'oppLife' | 'meter' | 'counter' | 'stat' | 'turn';
  meter?: string; counter?: string; stat?: string; times?: number; plus?: number }
export interface Effect { k: EffectKind; n?: number; amount?: Amount; count?: number; repeat?: number; // count: choose up to N targets; repeat: do it N times (choosing again each time)
  meter?: string; set?: boolean; // meter: add n (or set it to n) on a meter (yours / the opponent's with who, this unit's, or the game's)
   kw?: string; target?: TargetKind; filter?: Filter; stat?: string; until?: 'turn' | 'forever' | 'battle'; who?: 'me' | 'opp' | 'each'; card?: string; type?: string; rule?: KeywordRule; to?: 'hand' | 'deck' | 'play'; zone?: string; raw?: unknown[];
  status?: string; // inflict / cure (cure: empty = every status)
  heads?: Effect[]; tails?: Effect[]; perHeads?: boolean; // flip: n coins; heads/tails effects (several coins: heads only if all are heads, or once per heads with perHeads)
  sides?: number; ranges?: { min: number; max: number; do: Effect[] }[]; then?: Effect[]; // roll: n dice with this many sides; effects for the total's range; effects after every roll
  fromRoll?: boolean; // the amount is the last roll's total
}
export interface Ability {
  when: When; if?: Cond; do: Effect[]; once?: boolean | 'game'; label?: string; // label: the activated ability's button name
  may?: boolean; // "you may": the player chooses whether it happens
  event?: string; eventWho?: 'any' | 'me' | 'opp'; // when 'event': the event type (a meter step mt_<id>_<n>, a named value mv_<id>_<n>, any game or script event) and whose it must be
  loyalty?: number; sacSelf?: boolean;
  quick?: boolean; from?: 'hand' | 'grave'; detach?: number; oncePerName?: boolean; // quick: speed 2, usable on either turn; from: used from hand or discard pile; detach: remove N attached materials; oncePerName: once per turn for all copies // loyalty: walkers' +N / -N cost (once per turn per walker, main phase); sacSelf: sacrifice this card as a cost
  cost?: number; tap?: boolean; discard?: number; sacrifice?: boolean; life?: number; uncount?: { id: string; n: number }; banish?: number; returnRes?: number; // activation costs
}
export interface Move {
  name: string; cost: Record<string, number>; damage: number; do?: Effect[];
  plus?: { per: 'energy' | 'targetDamage' | 'benched' | 'oppBenched' | 'heads'; n: number; coins?: number }; // damage bonus (+n for each …)
  discard?: number; // discard this many attached energy after attacking
}
export interface CardBP {
  id: string; name: string; type: string;
  tag?: string; // a stable handle for cards a mechanic added ("heat:cool-down"), so its options still find them after renames
  cost?: number | Record<string, number>;
  stats: Record<string, number>;
  color?: string; color2?: string; keywords: string[]; abilities: Ability[];
  traits?: string[]; // affiliations other cards can name ("look for a {Luchador Guild} card")
  kwv?: Record<string, number>; // numbers for valued keywords (Resist 2)
  family?: string; // a shared base name (evolution/shift onto any card of this family)
  text?: string; flavor?: string; art?: string;
  subs?: Effect[]; iceType?: string; // guardians (ICE): subroutines that fire unless broken, and its kind for breakers
  breaker?: { breaks: string; boostCost: number; boostBy: number; breakCost: number }; // breaks this ICE kind ('all' = any): pay boostCost for +boostBy strength, breakCost per subroutine
  combo?: string; // check mode: playable only right after a card with this trait (or type) in your card pool
  shift?: number; // Shift N: may be played for N on top of your unit with the same name (the part before " - "), keeping its state
  moves?: Move[]; evolvesFrom?: string; materials?: number; weakness?: string; retreat?: number;
  resist?: string; // takes less attack damage from this color (combat.resistance)
  prizes?: number; // prize cards the opponent takes when it is destroyed (default 1)
  provides?: number; rainbow?: boolean; // energy cards: counts as N energy; counts as every color
  kicker?: number; flashback?: number; cycling?: number; // optional extra cost; cast from the discard pile for this; pay and discard: draw a card
  equipCost?: number; // equipment: move it onto one of your units for this (main phase)
  crew?: number; // vehicle: can attack/block only after tapping units with this much total power this turn
  station?: number; // spacecraft: tap another unit to add charge equal to its power; attacks/blocks once charge reaches this
  isToken?: boolean; // made only by effects (any card type, e.g. a non-unit treasure)
  mats?: Filter[]; // fusion recipe (one filter per material) or link material requirement (first filter)
  arrows?: ('TL' | 'T' | 'TR' | 'L' | 'R' | 'BL' | 'B' | 'BR')[]; // link arrows (grid boards); the link rating is the number of arrows
  scale?: number; // pendulum scale: can be placed in the leftmost/rightmost support slot
  bonus?: Record<string, number>; // attachments: stat bonus to the bearer
  raw?: Record<string, unknown>; // advanced: merged over the compiled card
}
export interface DeckBP { id: string; name: string; main: Record<string, number>; leader?: string; champion?: string; sites?: string[]; extra?: Record<string, number>; res?: Record<string, number> }

export interface Blueprint {
  v: 1;
  id: string; name: string; tagline: string; author?: string; blueprint?: string;
  look: { accent: string; accent2: string; glyph: string; board?: BoardLook };
  colors: Color[];
  stats: StatDef[];
  counters?: Counter[];
  statuses?: Status[];
  meters?: Meter[]; comeback?: Comeback;
  opts?: Record<string, unknown>; // Mechanics Shelf sub-option values that can't be read back from the game itself
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
  advanced?: { rules?: Record<string, unknown>; functions?: Record<string, unknown>; procedures?: Record<string, unknown>; triggers?: unknown[]; ai?: Record<string, unknown>;
    log?: Record<string, string> }; // log: battle-log text for events, e.g. {"doom": "{p} feel{s} the doom grow ({n})"}
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
  ward: { label: "Hexproof (opponents can't target it)", text: "Can't be chosen by an opponent's effects." },
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
  rushUnits: { label: 'Attacks units the turn it is played', text: 'Can attack enemy units (not the leader or player) the turn it is played.' },
  noKO: { label: "Can't be destroyed in battle", text: "Can't be destroyed in battle." },
  reach: { label: 'Can block and challenge flyers', text: 'Can block and challenge units with flying.' },
  doubleStrike: { label: 'Strikes twice', text: 'Deals combat damage in both the first-strike and the regular damage step.' },
  menace: { label: 'Needs 2+ blockers', text: "Can't be blocked except by two or more units." },
  indestructible: { label: "Can't be destroyed", text: "Damage and destroy effects don't destroy it." },
  flash: { label: 'Play any time (instant speed)', text: 'You may play it whenever you could play a quick spell.' },
  wardTax: { label: 'Ward N (opponents pay N to target it)', text: "When an opponent's effect targets it, that effect does nothing to it unless they pay N.", valued: true },
  hidden: { label: 'Hidden (set at a battlefield, play free later)', text: 'Hidden: pay 1 power to place it face down at a battlefield you control; from your next turn you may play it there for free at reaction speed.' },
  deflect: { label: 'Deflect N (opponents pay N more to target it)', text: "Opponents' effects that target it cost N more power.", valued: true },
  tuner: { label: 'Tuner (synchro material)', text: 'Tuner: needed for synchro summons.' },
  directAttack: { label: 'Can attack directly', text: 'Can attack the opponent directly even while they have units.' },
  extraAttack: { label: 'Attacks twice', text: 'Can attack twice each turn.' },
  ex: { label: 'EX N (momentum for speed)', text: 'Enhance: remove 1 momentum to give this attack +N speed.', valued: true },
  powerful: { label: 'Powerful N (momentum for damage)', text: 'Enhance: remove 1 momentum to give this attack +N damage.', valued: true },
  stun: { label: 'Stun N (rival commits foundations)', text: 'Enhance: your rival commits N of their ready foundations.', valued: true },
  breaker: { label: 'Breaker N (block penalty)', text: "After you block with this, your rival's next check gets -N.", valued: true },
  flashAtk: { label: 'Flash (no enhance step)', text: "This attack skips the enhance step." },
  bodyguard: { label: 'Bodyguard (may enter exhausted; must be attacked first)', text: 'May enter play exhausted. An enemy unit attacking one of your units must choose one with this if able.' },
  support: { label: 'Support (lends its power when it quests)', text: 'When this quests, you may give another of your units +power equal to this power this turn.' },
  reckless: { label: "Reckless (can't quest; must attack if able)", text: "Can't quest. You can't end your turn while it is able to attack." },
  adventurous: { label: "Adventurous (can't attack; must quest if able)", text: "Can't attack. You can't end your turn while it is able to quest." },
  vanish: { label: 'Vanish (destroyed when an enemy spell picks it)', text: "When an opponent's spell chooses this, destroy this instead." },
  boost: { label: 'Boost N (stack a card under it)', text: 'Once a turn, pay N: put the top card of your deck face down under this.', valued: true },
  underdog: { label: 'Underdog (cheaper for the second player at first)', text: "On your first turn, if you didn't go first, this costs 1 less." },
  singer: { label: 'Singer N (sings as if it cost N)', text: 'Counts as cost N when singing songs.', valued: true },
  singTogether: { label: 'Sing Together N (several units sing it)', text: 'Instead of paying, exhaust any of your units whose costs add up to N or more.', valued: true },
  legendary: { label: 'Legendary (only one of each name)', text: 'If you control two with the same name, the older one goes to the discard pile.' },
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
  ice: { label: 'Guardian (ICE)', hint: 'Asymmetric runs: installed face down in front of a server; rezzed when approached; its subroutines fire unless broken.' },
  agenda: { label: 'Scheme (agenda)', hint: 'Asymmetric runs: installed in a server and advanced; scored for its points, or stolen when accessed.' },
  location: { label: 'Location', hint: 'A place you play into the board: units move there for its move cost, it scores its lore at the start of your turn, and enemies can attack it.' },
  walker: { label: 'Walker (loyalty permanent)', hint: 'A permanent with loyalty: use one + or - loyalty ability per turn; enemies can attack it, and damage removes loyalty.' },
  battlefield: { label: 'Battlefield', hint: 'A place to fight over. Each deck brings some; one is chosen for each player. Gives its effects to whoever conquers or holds it.' },
};
