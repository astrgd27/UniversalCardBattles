// Agents see only a View and legal action templates: they cannot read hidden state.
import type { ActionCmd, Template, View } from '#engine';
import { rand, randInt, sample, seedRng } from '#engine';

export interface Agent {
  act(view: View, actions: Template[]): ActionCmd;
  decide(view: View): string[];
}

/** Uniformly random legal play; passes with probability `passRate` when anything else is legal. */
export function randomAgent(seed: number, passRate = 0.15): Agent {
  const st = seedRng(seed);
  const between = (min: number, max: number) => min + randInt(st, max - min + 1);
  return {
    act(_view, actions) {
      const other = actions.filter((a) => a.action !== 'pass');
      const pass = actions.find((a) => a.action === 'pass');
      const t = other.length && (!pass || rand(st) >= passRate) ? other[randInt(st, other.length)] : (pass ?? actions[0]);
      const targets: Record<string, string[]> = {};
      for (const sl of t.slots) targets[sl.as] = sample(st, sl.options, between(sl.min, sl.max));
      return { action: t.action, source: t.source, targets };
    },
    decide(view) {
      const pd = view.pending as { options: string[]; min: number; max: number };
      return sample(st, pd.options, between(pd.min, pd.max));
    },
  };
}
