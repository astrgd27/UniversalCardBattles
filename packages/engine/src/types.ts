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
}
export interface ZoneDef {
  id: string;
  vis: 'public' | 'owner' | 'hidden';
  shared?: boolean;
  ordered?: boolean;
  abilities?: boolean; // card abilities function here by default
}
/** recheck at resolution: true = target must still be in `from`; 'exists' = must still exist; false = cost choice. */
export interface SlotDef { as: string; from: Expr; min?: number; max?: number; prompt?: string; recheck?: boolean | 'exists' }
export interface Req { if: Expr; why: string }
export interface Timing { mode: 'immediate' | 'stack' | 'chain'; retain?: boolean; minResponse?: number }
export interface ActionDef {
  label?: string;
  phases?: string[];
  speed?: number; // 1 = own turn, empty stack; >= minResponse = may respond
  stack?: boolean; // false: resolves at once even under stack/chain timing
  source?: Expr;
  req?: Req[];
  targets?: SlotDef[];
  cardTargets?: boolean;
  cost?: EffectList;
  do: EffectList;
  countered?: EffectList; // runs if the stack item is countered or fizzles
}
export interface Ability { on: string; if?: Expr; do: EffectList; zones?: string[]; stack?: boolean; speed?: number; text?: string }
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
export interface PhaseDef { id: string; auto?: boolean; do?: EffectList; timing?: Timing }
export interface Rules {
  players: { min: number; max: number };
  playerVars: Record<string, number>;
  objectVars?: Record<string, number>;
  zones: ZoneDef[];
  deckZone: string;
  handZone: string;
  graveZone: string;
  format: { deckMin: number; deckMax: number; maxCopies: number };
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
}
export interface ModuleDef { manifest: Manifest; rules: Rules; cards: CardDef[]; decks?: Record<string, string[]> }
export interface Mod extends ModuleDef { card: Map<string, CardDef>; zone: Map<string, ZoneDef> }

export interface Obj {
  id: string; // game-object id: new on every zone change; numeric part is its timestamp
  inst: string; // physical card instance id: stable for the match
  card: string; // definition id
  owner: string;
  controller: string;
  zone: string; // zone key "p0:hand" | "shared:x"
  vars: Record<string, number>;
  rel?: Record<string, string>; // relationships (attachedTo, ...), cleared on zone change
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
}
/** masks: [viewers, fields]: players not in viewers get those fields deleted. */
export type Mask = [string[], string[]];
export interface GEvent { seq: number; type: string; masks?: Mask[]; [k: string]: any }
export interface ActionCmd { action: string; source?: string | null; targets?: Record<string, string[]> }
export type Cmd =
  | ({ t: 'act'; p: string } & ActionCmd)
  | { t: 'dec'; p: string; id: string; sel: string[] };
export interface Result { winners: string[]; reason: string }
export interface MatchOpts { decks: string[][]; seed: number }
export interface State {
  moduleId: string;
  version: string;
  opts: MatchOpts;
  rng: number[];
  players: Player[];
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
}
export interface Match { m: Mod; s: State }
export interface Reason { ok: boolean; code: string; msg: string; children?: Reason[] }
export interface SlotOpts { as: string; options: string[]; min: number; max: number; prompt: string }
export interface Template { action: string; label: string; source: string | null; slots: SlotOpts[] }
