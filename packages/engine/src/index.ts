import type { Mod, ModuleDef } from './types.ts';
import { EngineError } from './util.ts';
import { validateModule } from './validate.ts';

export * from './types.ts';
export { EngineError } from './util.ts';
export { validateModule, deckErrors, ENGINE_API } from './validate.ts';
export {
  createMatch, listActions, proposeAction, explainLegality, commitAction, submitDecision, serialize, restore, replay,
  applyCmd, eventHash, IllegalAction,
} from './match.ts';
export { observe, eventsFor, redact } from './view.ts';
export type { View, ObjView } from './view.ts';
export { seedRng, rand, randInt, sample, shuffle, hash } from './rng.ts';

/** Validates a module definition and indexes it for the engine. Throws with all errors. */
export function compileModule(def: ModuleDef): Mod {
  const errs = validateModule(def);
  if (errs.length) throw new EngineError(`Invalid module ${def.manifest?.moduleId}:\n  ${errs.join('\n  ')}`);
  return { ...def, card: new Map(def.cards.map((c) => [c.id, c])), zone: new Map(def.rules.zones.map((z) => [z.id, z])) };
}
