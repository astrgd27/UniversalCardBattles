// Node-only helpers: module loading from disk and headless match running.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Match, MatchOpts, Mod, ModuleDef } from '#engine';
import { commitAction, compileModule, createMatch, listActions, observe, submitDecision } from '#engine';
import type { Agent } from '#ai';

export const REF_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../reference-games');

export function readModuleDir(dir: string): ModuleDef {
  const j = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return {
    manifest: j('manifest.json'), rules: j('rules.json'), cards: j('cards.json'),
    decks: existsSync(join(dir, 'decks.json')) ? j('decks.json') : {},
  };
}
export const loadRef = (id: string): Mod => compileModule(readModuleDir(join(REF_DIR, id)));

export function deckOpts(m: Mod, names: string[], seed: number): MatchOpts {
  return { decks: names.map((n) => [...m.decks![n]]), seed };
}

/** Plays until the game ends. onStep runs before every command (for invariant checks). */
export function playMatch(match: Match, agents: Agent[], onStep?: (m: Match) => void, maxSteps = 10_000): Match {
  for (let steps = 0; !match.s.result; steps++) {
    if (steps > maxSteps) throw new Error(`Step limit ${maxSteps} reached`);
    onStep?.(match);
    const s = match.s;
    if (s.pending) {
      const p = s.pending.player;
      match = submitDecision(match, p, s.pending.id, agents[+p.slice(1)].decide(observe(match, p)));
    } else if (s.priority) {
      const p = s.priority;
      match = commitAction(match, p, agents[+p.slice(1)].act(observe(match, p), listActions(match, p)));
    } else throw new Error('Stuck: no priority and no pending decision');
  }
  return match;
}

/** Every object sits in exactly one zone and the card count is conserved. */
export function invariantErrors({ s }: Match): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const [key, ids] of Object.entries(s.zones)) {
    for (const id of ids) {
      if (seen.has(id)) errs.push(`${id} in two zones`);
      seen.add(id);
      if (s.objects[id]?.zone !== key) errs.push(`${id} zone mismatch (${key})`);
    }
  }
  if (seen.size !== Object.keys(s.objects).length) errs.push('object/zone count mismatch');
  const total = s.opts.decks.reduce((a, d) => a + d.length, 0);
  if (seen.size !== total) errs.push(`card count ${seen.size} != ${total}`);
  return errs;
}
