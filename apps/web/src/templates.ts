// Card templates (presentation only). Built-in layouts follow common TCG card anatomy — name, cost, art, type line,
// rules text and stats — in generic, original arrangements. A module may define its own templates and choose one per
// card type (presentation.byType) or per card (card.template); otherwise a template is inferred from the card's fields.
import type { CardDef, Mod } from '#engine';

export type Pos = 'tl' | 'tr' | 'bl' | 'br' | 'line';
export interface StatSlot { field: string; pos: Pos; icon?: string; label?: string }
export interface CardTemplate {
  base: string; // one of BUILTIN (styling family)
  layout: 'portrait' | 'landscape';
  cost: 'tl' | 'tr' | 'none';
  stats: StatSlot[]; // primary stats placed on the frame; other numeric fields become small chips
  level?: string; // field drawn as a row of stars
  text: boolean;
  label: string; // human name (shown in the gallery)
  art?: number; // picture window height in % of the card (default per family)
}

/** Generic defaults, named for their structure rather than any game. */
export const BUILTIN: Record<string, CardTemplate> = {
  classic: { base: 'classic', layout: 'portrait', cost: 'tr', stats: [{ field: 'power', pos: 'br', label: 'power/health' }, { field: 'health', pos: 'br' }], text: true, label: 'Classic — cost top-right, stat box bottom-right' },
  skirmisher: { base: 'skirmisher', layout: 'portrait', cost: 'tl', stats: [{ field: 'power', pos: 'bl', icon: '⚔' }, { field: 'health', pos: 'br', icon: '♥' }], text: true, label: 'Skirmisher — attack and health in the bottom corners' },
  monster: { base: 'monster', layout: 'portrait', cost: 'none', level: 'level', stats: [{ field: 'atk', pos: 'line', label: 'ATK' }, { field: 'def', pos: 'line', label: 'DEF' }], text: true, label: 'Ranked — level stars under the name, ATK/DEF line' },
  vital: { base: 'vital', layout: 'portrait', cost: 'tl', stats: [{ field: 'hp', pos: 'tr', label: 'HP' }], text: true, label: 'Vital — hit points top-right, abilities as the body' },
  leader: { base: 'leader', layout: 'portrait', cost: 'none', stats: [{ field: 'life', pos: 'tr', icon: '⛨' }, { field: 'power', pos: 'bl', icon: '⚔' }], text: true, label: 'Leader — no cost, life shield top-right' },
  spell: { base: 'spell', layout: 'portrait', cost: 'tr', stats: [], text: true, label: 'Spell — cost and a large text box, no stats' },
  resource: { base: 'resource', layout: 'portrait', cost: 'none', stats: [], text: false, label: 'Resource — full-bleed art, name band' },
  location: { base: 'location', layout: 'landscape', cost: 'tl', stats: [], text: true, label: 'Location — landscape, art left, text right' },
  token: { base: 'token', layout: 'portrait', cost: 'none', stats: [{ field: 'power', pos: 'bl', icon: '⚔' }, { field: 'health', pos: 'br', icon: '♥' }], text: true, label: 'Token — compact, art-led' },
};

const SPELLISH = /spell|trap|trick|tool|aura|event|action|instant|item|trainer|order/;
const PLACE = /location|site|terrain|battlefield|field|stadium|vault|realm|arena/;
const RESOURCE = /resource|energy|mana|tide|rune|stone|crystal|treasure/;

/** Picks a built-in template from the card's own fields when the module says nothing. */
export function inferTemplate(def: CardDef): string {
  const t = def.type.toLowerCase();
  const has = (f: string) => typeof (def as any)[f] === 'number';
  if (def.maxCopies === 0 && !PLACE.test(t)) return 'token';
  if (PLACE.test(t)) return 'location';
  if (has('atk') && has('def')) return 'monster';
  if (has('hp')) return 'vital';
  if (has('life') || /leader|hero|champion|legend/.test(t)) return 'leader';
  if (has('power') && has('health')) return 'skirmisher';
  if (SPELLISH.test(t)) return 'spell';
  if (RESOURCE.test(t) || (!def.text && !has('power'))) return 'resource';
  return 'classic';
}

/** Resolves a card's template: card.template > presentation.byType > inferred; module templates may extend built-ins. */
export function templateFor(m: Mod, def: CardDef): CardTemplate {
  const pres = m.manifest.presentation;
  const name = (def.template as string | undefined) ?? pres?.byType?.[def.type] ?? inferTemplate(def);
  const own = pres?.templates?.[name];
  if (own) {
    const base = BUILTIN[own.base ?? 'classic'] ?? BUILTIN.classic;
    return { ...base, ...own, base: base.base, stats: (own.stats as StatSlot[] | undefined) ?? base.stats, label: own.label ?? name } as CardTemplate;
  }
  return BUILTIN[name] ?? BUILTIN.classic;
}
