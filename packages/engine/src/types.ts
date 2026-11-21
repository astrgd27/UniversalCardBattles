// Core types. Module data (ModuleDef) is plain JSON; Mod is the compiled, indexed form.
export type Expr = unknown;
export type Effect = unknown[];
export type EffectList = Effect[];
export type Ctx = Record<string, any>;

export interface Manifest {
  moduleId: string;
  displayName: string;
  semanticVersion: string;
  engineApiRange: string;
  requiredCapabilities?: string[];
  licensing?: string;
  contentHashes?: Record<string, string>; // path -> sha256 hex
  extends?: { moduleId: string; range: string }; // expansion of a base module
  tagline?: string; // presentation only
  theme?: { accent?: string; accent2?: string; glyph?: string; hideStats?: string[] }; // presentation only: colours, emblem, card fields not to print
  /** Presentation only: card templates (see apps/web templates). byType maps card types to template names. */
  presentation?: { templates?: Record<string, { base?: string; layout?: 'portrait' | 'landscape'; cost?: 'tl' | 'tr' | 'none'; stats?: { field: string; pos: string; icon?: string; label?: string }[]; level?: string; text?: boolean; label?: string }>; byType?: Record<string, string> };
}
export interface ZoneDef {
  id: string;
  vis: 'public' | 'owner' | 'hidden';
  shared?: boolean;
  ordered?: boolean;
  abilities?: boolean; // card abilities function here by default
  /** Named positions inside the zone (equipment, circles, provinces): objects occupy one via `slot`. */
  slots?: SlotPos[];
}
/** types/kinds limit what may occupy the slot (card type / card field `kind`); cap = objects per slot (default 1). */
export interface SlotPos { id: string; types?: string[]; kinds?: string[]; cap?: number; tags?: string[]; adj?: string[] }
/** Engine-tracked usage limit: at most n uses per scope, counted per group (default: the action / ability) and key. */
export interface Limit { n?: number; per: 'turn' | 'phase' | 'game'; by?: 'player' | 'source' | 'card' | 'name' | 'inst'; group?: string }
/** Typed resource pool: player vars "<id>:<type>"; generic = the cost key any type can pay; expire empties pools. */
export interface ResourceDef { types: string[]; generic?: string; expire?: 'phase' | 'turn' }
/** A timing window opened mid-turn (combat, showdown): its steps run like phases, then the opening effect resumes. */
export interface WindowDef { steps: PhaseDef[]; timing?: Timing }
/** recheck at resolution: true = target must still be in `from`; 'exists' = must still exist; false = cost choice. */
export interface SlotDef { as: string; from: Expr; min?: Expr; max?: Expr; prompt?: string; recheck?: boolean | 'exists' }
export interface Req { if: Expr; why: string }
/** alternate: players take turns acting (one action each), all passing in a row ends the phase; `first` picks who starts. */
export interface Timing { mode: 'immediate' | 'stack' | 'chain' | 'alternate'; retain?: boolean; minResponse?: number; first?: Expr }
export interface ActionDef {
  label?: string;
  phases?: string[];
  speed?: number; // 1 = own turn, empty stack; >= minResponse = may respond
  stack?: boolean; // false: resolves at once even under stack/chain timing
  source?: Expr;
  req?: Req[];
  targets?: SlotDef[];
  check?: Req[]; // evaluated after targets are chosen (bound in ctx)
  cardTargets?: boolean;
  cost?: EffectList;
  limit?: Limit;
  do: EffectList;
  countered?: EffectList; // runs if the stack item is countered or fizzles
}
export interface Ability { on: string; if?: Expr; do: EffectList; zones?: string[]; stack?: boolean; speed?: number; text?: string; once?: boolean; limit?: Limit }
export interface Replacement { replace: string; if?: Expr; instead?: EffectList; modify?: Record<string, Expr>; zones?: string[]; order?: number; text?: string }
export interface ModDef { op: 'set' | 'add' | 'grant' | 'remove'; stat?: string; kw?: string; value?: Expr }
export interface StaticDef { layer: string; affects: Expr; mods: ModDef[]; if?: Expr; zones?: string[]; text?: string }
export interface CardDef {
  id: string;
  name: string;
  type: string;
  text?: string;
  keywords?: string[];
  targets?: SlotDef[];
  effects?: EffectList;
  abilities?: Ability[];
  replacements?: Replacement[];
  statics?: StaticDef[];
  [k: string]: unknown;
}
export interface FunctionDef { params: string[]; body: Expr }
export interface ProcedureDef { params: string[]; do: EffectList }
export interface PhaseDef { id: string; auto?: boolean; do?: EffectList; timing?: Timing }
export interface Rules {
  players: { min: number; max: number };
  playerVars: Record<string, number>;
  objectVars?: Record<string, number>;
  zones: ZoneDef[];
  deckZone: string;
  handZone: string;
  graveZone: string;
  format: {
    deckMin: number; deckMax: number; maxCopies: number;
    zones?: { zone: string; min: number; max: number; types?: string[]; maxCopies?: number }[];
    copiesBy?: string; // card field that identifies "the same card" for copy limits (e.g. "name"); default id
    rules?: Req[]; // construction rules as expressions over $deck (all ids), $sections ({zone: ids})
  };
  gameVars?: Record<string, number>; // read/written via the "game" ref
  sharedDecks?: Record<string, string[]>; // shared zone -> card ids created at match start (owner "shared")
  damage?: { player: string; object: string };
  turnLimit?: number;
  timing?: Timing;
  stats?: string[]; // computed object characteristics (continuous effects apply)
  layers?: string[]; // continuous-effect layer order
  setup?: EffectList;
  phases: PhaseDef[];
  actions: Record<string, ActionDef>;
  triggers?: Ability[];
  replacements?: Replacement[];
  statics?: StaticDef[];
  stateChecks?: EffectList;
  grid?: { cols: number; rows: number; zones?: string[] }; // 2D board: objects in `zones` sit at cells via vars x, y
  resources?: Record<string, ResourceDef>;
  windows?: Record<string, WindowDef>;
  external?: Record<string, (string | number)[]>; // inputs from outside the game (sensors, toys, the host): name -> allowed values
  functions?: Record<string, FunctionDef>; // pure expression scripts: ["call", name, ...args]
  procedures?: Record<string, ProcedureDef>; // effect scripts: ["call", name, ...args]
}
/** AI hints (ai/ai.json): eval = position value for $me; bias = per-action score bonus; samples = possible worlds per decision. */
export interface AiDef { eval?: Expr; bias?: Record<string, number>; samples?: number }
/** campaign: single-player campaign data (validated by packages/campaign; opaque to the engine). */
export interface ModuleDef { manifest: Manifest; rules: Rules; cards: CardDef[]; decks?: Record<string, Deck>; ai?: AiDef; campaign?: unknown }
export interface Mod extends ModuleDef { card: Map<string, CardDef>; zone: Map<string, ZoneDef>; hash: string }

export interface Obj {
  id: string; // game-object id: new on every zone change; numeric part is its timestamp
  inst: string; // physical card instance id: stable for the match
  card: string; // definition id
  owner: string;
  controller: string;
  zone: string; // zone key "p0:hand" | "shared:x"
  vars: Record<string, number>;
  rel?: Record<string, string>; // relationships (attachedTo, ...), cleared on zone change
  fd?: boolean; // face down: identity known only to the controller; abilities inactive
  slot?: string; // position inside a slotted zone
}
export interface Player { id: string; vars: Record<string, number>; lost: boolean }
export interface Frame { list: EffectList; i: number; ctx: Ctx }
export interface Trig { id: string; ref: string; ctrl: string; ctx: Ctx; label: string; stack: boolean; speed: number }
export interface StackItem {
  id: string;
  kind: 'action' | 'trigger';
  ctrl: string;
  label: string;
  card: string | null;
  source: string | null;
  list: EffectList;
  ctx: Ctx;
  slots: SlotDef[];
  speed: number;
  countered?: EffectList;
  action?: string;
}
export interface TempEffect { id: string; ts: number; layer: string; targets: string[]; mods: { op: string; stat?: string; kw?: string; value?: any }[]; until: 'turn' | null }
export interface Pending {
  id: string;
  kind: 'choose' | 'order';
  player: string;
  options: string[];
  min: number;
  max: number;
  as: string;
  single: boolean;
  prompt: string;
  labels?: Record<string, string>;
  secret?: boolean; // the selection is hidden from other players
}
/** masks: [viewers, fields]: players not in viewers get those fields deleted. */
export type Mask = [string[], string[]];
export interface GEvent { seq: number; type: string; masks?: Mask[]; [k: string]: any }
export interface ActionCmd { action: string; source?: string | null; targets?: Record<string, string[]> }
export type Cmd =
  | ({ t: 'act'; p: string } & ActionCmd)
  | { t: 'dec'; p: string; id: string; sel: string[] }
  | { t: 'ext'; name: string; value: string | number };
export interface Result { winners: string[]; reason: string }
/** A deck is a card list (main deck) or sections by zone, e.g. {deck: [...], extra: [...]}. */
export type Deck = string[] | Record<string, string[]>;
/**
 * Scenario (campaign encounters, puzzles): validated additions to a normal match. `setup` runs after the module's setup
 * ($me = p0, $opp = p1); `vars` seed game vars; `triggers` behave like rule triggers (once = fire at most once per match).
 */
export interface Scenario { setup?: EffectList; vars?: Record<string, number>; triggers?: Ability[] }
export interface MatchOpts { decks: Deck[]; seed: number; scenario?: Scenario; external?: Record<string, string | number> }
export interface State {
  moduleId: string;
  version: string;
  rulesHash: string; // pins the ruleset + card database this state was played with
  opts: MatchOpts;
  rng: number[];
  players: Player[];
  vars: Record<string, number>; // game vars
  ext: Record<string, string | number>; // external inputs (rules.external)
  objects: Record<string, Obj>;
  zones: Record<string, string[]>;
  turn: { n: number; active: number; phase: number };
  phaseState: 'enter' | 'run' | 'ended';
  priority: string | null; // who may act now
  holder: string | null; // who receives priority next (stack/chain timing)
  passes: number; // consecutive passes
  resolving: boolean; // chain timing: resolving links back to back
  stack: StackItem[]; // bottom -> top
  effects: TempEffect[];
  exec: Frame[];
  triggers: Trig[];
  nextTrig: string | null;
  dirty: boolean;
  pending: Pending | null;
  events: GEvent[];
  cmds: Cmd[];
  nextId: number;
  nextDecision: number;
  result: Result | null;
  windows: Win[]; // open timing windows, innermost last
  uses: Record<string, number>; // usage-limit counters "scope|group|key" (turn and phase scopes reset)
}
/** An open timing window; `saved` holds the interrupted turn state, restored when the window closes. */
export interface Win {
  id: string; step: number; data: Record<string, any>; closed?: boolean;
  saved: { exec: Frame[]; stack: StackItem[]; resolving: boolean; holder: string | null; passes: number; phaseState: State['phaseState'] };
}
export interface Match { m: Mod; s: State }
export interface Reason { ok: boolean; code: string; msg: string; children?: Reason[] }
export interface SlotOpts { as: string; options: string[]; min: number; max: number; prompt: string }
export interface Template { action: string; label: string; source: string | null; slots: SlotOpts[] }
