// Node-only helpers: module loading from disk and headless match running.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Match, MatchOpts, Mod, ModuleDef } from '#engine';
import { IllegalAction, commitAction, compileModule, deckSections, listActions, observe, submitDecision } from '#engine';
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
  return { decks: names.map((n) => structuredClone(m.decks![n])), seed };
}
/** Default seating for a module: its first decks, repeated up to the minimum player count. */
export function defaultDecks(m: Mod): string[] {
  const names = Object.keys(m.decks ?? {});
  const n = Math.max(2, m.rules.players.min);
  return Array.from({ length: n }, (_, i) => names[i] ?? names[0]);
}

/**
 * Plays until the game ends. onStep runs before every command (for invariant checks).
 * If an agent proposes something the engine rejects (e.g. targets failing an action's `check`), it is asked again;
 * after 20 rejections the player passes.
 */
export function playMatch(match: Match, agents: Agent[], onStep?: (m: Match) => void, maxSteps = 20_000): Match {
  for (let steps = 0; !match.s.result; steps++) {
    if (steps > maxSteps) throw new Error(`Step limit ${maxSteps} reached`);
    onStep?.(match);
    const s = match.s;
    if (s.pending) {
      const p = s.pending.player;
      match = submitDecision(match, p, s.pending.id, agents[+p.slice(1)].decide(observe(match, p)));
      continue;
    }
    const p = s.priority;
    if (!p) throw new Error('Stuck: no priority and no pending decision');
    const agent = agents[+p.slice(1)];
    let next: Match | null = null;
    for (let tries = 0; !next && tries < 20; tries++) {
      try {
        next = commitAction(match, p, agent.act(observe(match, p), listActions(match, p)));
      } catch (e) {
        if (!(e instanceof IllegalAction) || e.reason.code !== 'check') throw e;
      }
    }
    match = next ?? commitAction(match, p, { action: 'pass' });
  }
  return match;
}

/** Every object sits in exactly one zone and the card count is conserved. */
export function invariantErrors({ m, s }: Match): string[] {
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
  let total = 0;
  for (const d of s.opts.decks) for (const l of Object.values(deckSections(m, d))) total += l.length;
  for (const l of Object.values(m.rules.sharedDecks ?? {})) total += l.length;
  if (seen.size !== total) errs.push(`card count ${seen.size} != ${total}`);
  return errs;
}
