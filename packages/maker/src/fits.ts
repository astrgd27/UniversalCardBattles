// What each mechanic needs and what it clashes with, in one table. The Game Wizard, the Mechanics Shelf and "Surprise me"
// all read it, so a rule like "songs need a resource to pay for spells" is written once.
// Features are plain strings: res:<system> (the resource system), combat:<style>, the ids of mechanics already added,
// 'units' (a card type that fights) and 'scripted' (cards or rules with custom script).
import type { Blueprint } from './blueprint.ts';
import { UNIT_ROLES } from './compile.ts';

export interface Fit {
  needs?: string[]; // every one of these
  needsAny?: string[]; // at least one of these
  clashes?: string[]; // none of these
  replaces?: 'resources' | 'combat'; // swaps a core system (scripted cards may rely on the old one)
}
const RES = 'resources' as const, CMB = 'combat' as const;
const notPitch = ['res:pitch'];
export const FITS: Record<string, Fit> = {
  // resource systems
  ramp: { replaces: RES }, lands: { replaces: RES }, inkwell: { replaces: RES }, manaZone: { replaces: RES }, hiddenResources: { replaces: RES }, resDeck: { replaces: RES },
  attachEnergy: { replaces: RES, clashes: ['combat:runs'] }, pitch: { replaces: RES }, actionPoints: { replaces: RES }, skillChecks: { replaces: RES, clashes: ['combat:duel', 'combat:lanes', 'combat:runs'] },
  boost: { needsAny: ['res:ramp', 'res:lands', 'res:manaZone', 'res:resDeck', 'res:inkwell'] },
  // combat styles
  target: { replaces: CMB, needs: ['units'], clashes: notPitch }, block: { replaces: CMB, needs: ['units'], clashes: notPitch }, compare: { replaces: CMB, needs: ['units'], clashes: notPitch },
  positions: { replaces: CMB, needs: ['units'], clashes: notPitch }, duel: { replaces: CMB, needs: ['units'], clashes: notPitch }, lanes: { replaces: CMB, needs: ['units'], clashes: notPitch },
  twinArenas: { replaces: CMB, needs: ['units'], needsAny: ['combat:target', 'combat:block'] }, lines: { replaces: CMB, needs: ['units'], needsAny: ['combat:target', 'combat:block'] },
  quest: { needs: ['units'], needsAny: ['combat:target', 'combat:block'] }, counterStep: { needs: ['units'], needsAny: ['combat:target', 'combat:compare', 'combat:positions'] },
  zoneCombat: { replaces: CMB },
  combatPhase: { clashes: ['combat:lanes', 'combat:duel'] }, drawTo: { clashes: notPitch },
  // winning
  lifeCards: { clashes: ['combat:lanes', 'combat:duel', 'combat:cards', 'quest'] }, shields: { clashes: ['combat:lanes', 'combat:duel', 'combat:cards', 'quest'] },
  prizes: { clashes: ['combat:lanes', 'combat:cards', 'quest'] },
  leader: { clashes: ['combat:lanes', 'combat:duel', 'combat:cards'] }, deployLeader: { clashes: ['combat:lanes', 'combat:duel', 'combat:cards'] },
  // card types
  gear: { clashes: ['res:skillChecks'] }, traps: { clashes: ['res:skillChecks'] }, evolution: { clashes: ['res:skillChecks'] },
  extraDeck: { clashes: ['combat:duel', 'combat:lanes', 'combat:cards', 'res:skillChecks'] }, tribute: { needs: ['res:free'] },
  songs: { clashes: ['res:free', 'res:pitch', 'res:skillChecks'] },
  // systems
  costReducer: { needsAny: ['res:ramp', 'res:free', 'res:resDeck'] },
  places: { needsAny: ['combat:target', 'combat:block', 'combat:compare'], clashes: ['res:pitch', 'res:free', 'res:attachEnergy', 'res:skillChecks'] },
  shift: { clashes: ['res:pitch', 'res:free', 'res:attachEnergy', 'res:skillChecks', 'combat:duel'] },
  worldClock: { clashes: ['combat:cards'] }, aging: { clashes: ['combat:cards'] },
};

const NAMES: Record<string, string> = {
  units: 'a card type that fights (a Unit type)', scripted: 'scripted cards',
  'res:ramp': 'growing energy', 'res:lands': 'colored lands', 'res:inkwell': 'an inkwell', 'res:manaZone': 'a mana zone', 'res:resDeck': 'a resource deck', 'res:attachEnergy': 'attached energy',
  'res:pitch': 'pitch & attack cards', 'res:skillChecks': 'skill checks', 'res:actionPoints': 'action points', 'res:free': 'no resources (free cards)', 'res:hiddenResources': 'face-down resources',
  'combat:target': 'pick-a-target combat', 'combat:block': 'attack & block combat', 'combat:compare': 'power duels', 'combat:positions': 'attack & defense positions', 'combat:duel': 'active & bench duels',
  'combat:lanes': 'battlefields', 'combat:cards': 'attack cards', 'combat:runs': 'runs', 'combat:none': 'no combat', quest: 'questing',
};
export const featureName = (f: string) => NAMES[f] ?? f;

const RES_OF: Record<string, string> = { none: 'free', ramp: 'ramp', cards: 'lands', anycard: 'manaZone', deck: 'resDeck', attach: 'attachEnergy', pitch: 'pitch', check: 'skillChecks', actions: 'actionPoints', bank: 'bank' };
const RES_RECIPES = ['ramp', 'lands', 'inkwell', 'manaZone', 'hiddenResources', 'resDeck', 'attachEnergy', 'pitch', 'skillChecks', 'actionPoints'];
/** The features a blueprint has now. */
export function featuresOf(bp: Blueprint): Set<string> {
  const f = new Set<string>(bp.recipes ?? []);
  // the resource system: the last resource recipe added if it is still the one in use, else the mode's usual name
  const lastRes = [...(bp.recipes ?? [])].reverse().find((r) => RES_RECIPES.includes(r));
  const modeRes = RES_OF[bp.resource.mode] ?? bp.resource.mode;
  const sameFamily = (r: string) => ({ inkwell: 'manaZone', hiddenResources: 'manaZone' } as Record<string, string>)[r] ?? r;
  f.add(`res:${lastRes && sameFamily(lastRes) === modeRes ? lastRes : modeRes}`);
  if (bp.resource.actions) f.add('res:actionPoints');
  f.add(`combat:${bp.combat.mode}`);
  if (bp.combat.compare) f.add('combat:compare');
  if (bp.combat.positions) f.add('combat:positions');
  if (bp.combat.quest) f.add('quest');
  if (bp.types.some((t) => UNIT_ROLES.includes(t.role) && t.role !== 'token')) f.add('units');
  if (bp.advanced || bp.cards.some((c) => c.raw || c.abilities.some((a) => a.do.some((e) => e.k === 'raw')))) f.add('scripted');
  return f;
}

export interface FitIssue { level: 'blocks' | 'warns'; text: string }
/** Why a mechanic does not fit a game with these features (nothing when it fits). */
export function fitIssues(id: string, f: Set<string>): FitIssue[] {
  const fit = FITS[id];
  if (!fit) return [];
  const out: FitIssue[] = [];
  for (const n of fit.needs ?? []) if (!f.has(n)) out.push({ level: 'blocks', text: `Needs ${featureName(n)}.` });
  if (fit.needsAny?.length && !fit.needsAny.some((n) => f.has(n))) out.push({ level: 'blocks', text: `Needs ${fit.needsAny.map(featureName).join(' or ')}.` });
  for (const c of fit.clashes ?? []) if (f.has(c)) out.push({ level: 'blocks', text: `Doesn't work with ${featureName(c)}.` });
  if (fit.replaces && f.has('scripted')) out.push({ level: 'warns', text: `Replaces your ${fit.replaces} system; scripted cards may still refer to the old one.` });
  return out;
}
export const fits = (id: string, f: Set<string>) => !fitIssues(id, f).some((i) => i.level === 'blocks');
