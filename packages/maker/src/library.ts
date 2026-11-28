// Script library: starter scripts that ship with the Workshop, plus helpers for the user's own saved scripts (kept by the
// app across projects). Every entry is an ordinary Script Lab bundle, so it goes in with the same merge/replace import.
import type { ScriptBundle } from './scripts.ts';
import { SCRIPT_FORMAT } from './scripts.ts';

export interface LibraryScript { id: string; name: string; desc: string; bundle: ScriptBundle; builtIn?: boolean; saved?: string }

const b = (advanced: ScriptBundle['advanced']): ScriptBundle => ({ format: SCRIPT_FORMAT, v: 1, from: 'Starter scripts', advanced });

/** Starter scripts: small, game-agnostic rule twists written in the engine DSL. They only use what every Maker game has. */
export const STARTER_SCRIPTS: LibraryScript[] = [
  { id: 'overtime', name: 'Overtime', builtIn: true, desc: 'From turn 20, the player whose turn it is draws an extra card, so long games speed up.',
    bundle: b({ triggers: [{ on: 'turnStart', if: ['>=', '$turn', 20], do: [['draw', '$active', 1], ['emit', 'overtime', { p: '$active' }]] }], log: { overtime: 'Overtime: {p} draw{s} an extra card' } }) },
  { id: 'doom-clock', name: 'Doom clock', builtIn: true, desc: 'A doom counter rises every turn. When it reaches 30, the player whose turn it is loses: finish the game first!',
    bundle: b({ rules: { gameVars: { doom: 0 } },
      triggers: [{ on: 'turnStart', do: [['inc', 'game', 'doom', 1], ['if', ['=', ['mod', ['get', 'game', 'doom'], 5], 0], [['emit', 'doom', { n: ['get', 'game', 'doom'] }]]],
        ['if', ['>=', ['get', 'game', 'doom'], 30], [['lose', '$active']]]] }],
      log: { doom: 'The doom clock ticks: {n} of 30' } }) },
  { id: 'empty-hand-draw', name: 'Second wind', builtIn: true, desc: 'A player who starts their turn with no cards in hand draws two.',
    bundle: b({ triggers: [{ on: 'turnStart', if: ['=', ['count', ['cards', '$active', 'hand']], 0], do: [['draw', '$active', 2], ['emit', 'secondWind', { p: '$active' }]] }],
      log: { secondWind: '{p} {has} a second wind: draw 2' } }) },
  { id: 'helper-fns', name: 'Helper functions', builtIn: true, desc: 'Reusable expressions for your own scripts: double, half (rounded down), clamp to 0–10.',
    bundle: b({ functions: { double: { params: ['$x'], body: ['*', '$x', 2] }, half: { params: ['$x'], body: ['/', '$x', 2] }, clamp10: { params: ['$x'], body: ['max', 0, ['min', 10, '$x']] } } }) },
  { id: 'aggressive-ai', name: 'Aggressive AI', builtIn: true, desc: 'The computer opponent attacks much more eagerly.', bundle: b({ ai: { bias: { attack: 2 } } }) },
];

/** A user library entry from a game's current scripts. */
export function libraryEntry(name: string, bundle: ScriptBundle, now = new Date()): LibraryScript {
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'script'}-${now.getTime().toString(36)}`;
  const parts = [bundle.advanced.rules && 'rules patch', bundle.advanced.triggers?.length && `${bundle.advanced.triggers.length} trigger(s)`, bundle.advanced.functions && 'functions',
    bundle.advanced.procedures && 'procedures', bundle.advanced.ai && 'AI hints', bundle.advanced.log && 'event messages', bundle.cards && 'card patches'].filter(Boolean);
  return { id, name: name.trim() || 'My script', desc: parts.length ? `Has: ${parts.join(', ')}.` : 'Empty.', bundle, saved: now.toISOString() };
}
