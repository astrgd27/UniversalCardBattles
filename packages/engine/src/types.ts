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
export interface SlotDef { as: string; from: Expr; min?: number; max?: number; prompt?: string }
export interface Req { if: Expr; why: string }
export interface ActionDef {
  label?: string;
  phases?: string[];
  source?: Expr;
  req?: Req[];
  targets?: SlotDef[];
  cardTargets?: boolean;
  cost?: EffectList;
  do: EffectList;
}
export interface Ability { on: string; if?: Expr; do: EffectList; zones?: string[] }
export interface CardDef {
  id: string;
  name: string;
  type: string;
  text?: string;
  keywords?: string[];
  targets?: SlotDef[];
  effects?: EffectList;
  abilities?: Ability[];
  [k: string]: unknown;
}
export interface PhaseDef { id: string; auto?: boolean; do?: EffectList }
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
  setup?: EffectList;
  phases: PhaseDef[];
  actions: Record<string, ActionDef>;
  triggers?: Ability[];
  stateChecks?: EffectList;
}
export interface ModuleDef { manifest: Manifest; rules: Rules; cards: CardDef[]; decks?: Record<string, string[]> }
export interface Mod extends ModuleDef { card: Map<string, CardDef>; zone: Map<string, ZoneDef> }

export interface Obj {
  id: string; // game-object id: new on every zone change
  inst: string; // physical card instance id: stable for the match
  card: string; // definition id
  owner: string;
  controller: string;
  zone: string; // zone key "p0:hand" | "shared:x"
  vars: Record<string, number>;
}
export interface Player { id: string; vars: Record<string, number>; lost: boolean }
export interface Frame { list: EffectList; i: number; ctx: Ctx }
export interface Trig { ref: string; ctrl: string; ctx: Ctx }
export interface Pending {
  id: string;
  player: string;
  options: string[];
  min: number;
  max: number;
  as: string;
  single: boolean;
  prompt: string;
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
  priority: string | null;
  exec: Frame[];
  triggers: Trig[];
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
