import type { Mod, ModuleDef } from './types.ts';
import { hash } from './rng.ts';
import { EngineError } from './util.ts';
import { validateModule } from './validate.ts';

export * from './types.ts';
export { EngineError, CostError, ScriptError } from './util.ts';
export { validateModule, validateIssues, validateScenario, issueText, deckErrors, deckSections, ENGINE_API, CAPABILITIES, TEMPLATE_BASES } from './validate.ts';
export type { Issue } from './validate.ts';
export { satisfies, isSemver, isRange } from './semver.ts';
export { GAS, MAX_DEPTH } from './expr.ts';
export {
  createMatch, listActions, proposeAction, explainLegality, commitAction, submitDecision, serialize, restore, replay,
  applyCmd, eventHash, IllegalAction, setExternal,
} from './match.ts';
export { observe, eventsFor, redact } from './view.ts';
export type { View, ObjView, StackView } from './view.ts';
export { invalidate } from './layers.ts';
export { determinize, scoreFor } from './determinize.ts';
export { timingOf } from './match.ts';
export { seedRng, rand, randInt, sample, shuffle, hash } from './rng.ts';

/** Validates a module definition and indexes it for the engine. Throws with all errors. */
export function compileModule(def: ModuleDef): Mod {
  const errs = validateModule(def);
  if (errs.length) throw new EngineError(`Invalid module ${def.manifest?.moduleId}:\n  ${errs.join('\n  ')}`);
  return {
    ...def, card: new Map(def.cards.map((c) => [c.id, c])), zone: new Map(def.rules.zones.map((z) => [z.id, z])),
    hash: hash(JSON.stringify([def.rules, def.cards])),
  };
}
