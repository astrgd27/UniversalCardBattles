// Game Maker: friendly blueprints compiled into engine modules, with plain-language checks ("bugs" and "tips").
import type { Mod } from '#engine';
import { compileModule, deckErrors, validateModule } from '#engine';
import { validateCampaign } from '#campaign';
import { campaignOn, shopOn } from './economy.ts';
import type { Blueprint, Cond } from './blueprint.ts';
import { UNIT_ROLES, compileBlueprint, context } from './compile.ts';

export * from './blueprint.ts';
export { compileBlueprint, cardText, abilityText, effectText, costLabel, costText, filterText, slug, UNIT_ROLES, COND_OP, COND_N, EVENT_TEXT, eventLabel, amountText, pickText } from './compile.ts';
export { BLUEPRINTS, fromBlueprint, blank } from './presets.ts';
export { RECIPES, applyRecipe, setRecipeOpt, surpriseRecipes } from './recipes.ts';
export { WIZARD, THEMES, wizardBuild, optionsFor, randomAnswers } from './wizard.ts';
export type { WizAnswers, WizStep, WizOption, WizField } from './wizard.ts';
export { rulebook, rulebookMarkdown } from './rulebook.ts';
export type { RuleSection } from './rulebook.ts';
export { cardsToCsv, cardsFromCsv, parseCsv } from './csv.ts';
export type { Recipe, RecipeGroup, RecipeOpt } from './recipes.ts';

export interface Problem { level: 'bug' | 'tip'; text: string; where?: string }

/** Friendly design checks that run before the engine's own validation. */
export function lint(bp: Blueprint): Problem[] {
  const out: Problem[] = [];
  const bug = (text: string, where?: string) => out.push({ level: 'bug', text, where });
  const tip = (text: string, where?: string) => out.push({ level: 'tip', text, where });
  if (!/^[a-z0-9-]{2,64}$/.test(bp.id)) bug('The game id must be 2-64 lowercase letters, digits or dashes.', 'identity');
  if (!bp.name.trim()) bug('Give your game a name.', 'identity');
  if (!bp.types.length) bug('Add at least one card type.', 'types');
  const x = context(bp);
  const typeIds = new Set(bp.types.map((t) => t.id));
  const statIds = new Set(bp.stats.map((s) => s.id));
  if (!bp.types.some((t) => UNIT_ROLES.includes(t.role) && t.role !== 'token') && bp.combat.mode !== 'none' && bp.combat.mode !== 'runs' && !(bp.combat.mode === 'cards' && bp.types.some((t) => t.role === 'attack'))) bug('Your game has combat but no card type that fights. Add a Unit type.', 'types');
  if (!statIds.has(bp.combat.power)) bug(`Combat uses the stat "${bp.combat.power}", which your game doesn't have.`, 'rules');
  if (bp.combat.health && !statIds.has(bp.combat.health)) bug(`Combat uses the health stat "${bp.combat.health}", which your game doesn't have.`, 'rules');
  if (!x.life && !x.lifeCards && !x.prizes && !x.points) bug('Nobody can win! Turn on life, life cards, prizes or points.', 'rules');
  if (!bp.turn.some((p) => p.kind === 'main')) bug('Your turn needs a Main phase, or nobody can play cards.', 'turn');
  // meters: unique ids, and every condition or effect that names one must find it
  const meterIds = new Set<string>();
  for (const m of bp.meters ?? []) {
    if (meterIds.has(m.id)) bug(`Two meters share the id "${m.id}".`, 'keywords');
    meterIds.add(m.id);
    if (!m.gain.length && !(m.steps ?? []).length && !m.aura && !m.per) tip(`The meter "${m.name}" never changes and does nothing yet.`, 'keywords');
    for (const q of m.gain) if (q.on === 'event' && !q.event) bug(`The meter "${m.name}" rises on an event but has no event picked.`, 'keywords');
    if (m.wrap && !m.max) bug(`The meter "${m.name}" cycles but has no max.`, 'keywords');
  }
  const condMeters = (q: Cond | undefined): string[] => (!q ? [] : q.k === 'meter' ? [q.meter ?? ''] : (q.of ?? []).flatMap(condMeters));
  for (const k of bp.cards) for (const a of k.abilities) {
    for (const id of condMeters(a.if)) if (!meterIds.has(id)) bug(`${k.name}: its condition uses a meter that doesn't exist ("${id}").`, `card:${k.id}`);
    for (const e of a.do) if (e.k === 'meter' && !meterIds.has(e.meter ?? '')) bug(`${k.name}: "Change a meter" needs a meter (make one under Keywords → Meters).`, `card:${k.id}`);
    if (k.xCost && !['ramp', 'cards', 'anycard', 'deck', 'bank'].includes(bp.resource.mode)) tip(`${k.name}: X costs need a resource pool; here X is always 0.`, `card:${k.id}`);
    for (const e of a.do) {
      if (e.k === 'choose' && (e.modes?.length ?? 0) < 2) tip(`${k.name}: "Choose one" works best with two or more modes.`, `card:${k.id}`);
      if (e.k === 'later' && !e.do?.length) tip(`${k.name}: a "later" block has nothing in it.`, `card:${k.id}`);
    }
    if (a.when === 'event' && !a.event) bug(`${k.name}: a "whenever an event happens" ability needs an event.`, `card:${k.id}`);
    if ((a.if?.k === 'all' || a.if?.k === 'any' || a.if?.k === 'not') && !a.if.of?.length) tip(`${k.name}: a combined condition has nothing in it.`, `card:${k.id}`);
  }
  // shop & campaign
  const eco = bp.economy;
  if (eco && (shopOn(bp) || campaignOn(bp))) {
    const deckIds = new Set(bp.decks.map((d) => d.id));
    const curIds = new Set(eco.currencies.map((c) => c.id));
    if (eco.currencies.length > 5) bug('A game can have at most 5 currencies.', 'shop');
    if (curIds.size !== eco.currencies.length) bug('Two currencies share an id.', 'shop');
    const freeDeck = shopOn(bp) && eco.shop!.items.some((i) => i.kind === 'deck' && i.price === 0 && deckIds.has(i.ref));
    if (!eco.starterDecks.some((d) => deckIds.has(d)) && !freeDeck) bug('Players need a deck to start: give them a starter deck, or put a free deck (or a free "choose one" starter) in the shop.', shopOn(bp) ? 'shop' : 'campaign');
    if (shopOn(bp)) for (const i of eco.shop!.items) {
      if (i.kind === 'deck' && !deckIds.has(i.ref)) bug(`Shop item "${i.name}" sells a deck that doesn't exist.`, 'shop');
      if (i.kind === 'booster' && !eco.shop!.boosters.some((b) => b.id === i.ref)) bug(`Shop item "${i.name}" sells a booster that doesn't exist.`, 'shop');
      if (i.currency && !curIds.has(i.currency)) bug(`Shop item "${i.name}" is priced in a currency that doesn't exist.`, 'shop');
      if (i.requires?.length && !campaignOn(bp)) tip(`Shop item "${i.name}" is locked behind campaign wins, but the campaign is off, so it is always for sale.`, 'shop');
    }
    if (campaignOn(bp)) {
      const encIds = new Set(eco.campaign!.encounters.map((e) => e.id));
      if (!eco.campaign!.encounters.length) tip('The campaign has no battles yet.', 'campaign');
      for (const e of eco.campaign!.encounters) {
        if (!deckIds.has(e.deck)) bug(`Campaign battle "${e.name}" uses a deck that doesn't exist.`, 'campaign');
        for (const r of e.requires ?? []) if (!encIds.has(r) || r === e.id) bug(`Campaign battle "${e.name}" is gated behind a battle that doesn't exist.`, 'campaign');
        for (const k of Object.keys({ ...e.first, ...e.repeat, ...e.loss })) if (!curIds.has(k)) bug(`Campaign battle "${e.name}" rewards a currency that doesn't exist.`, 'campaign');
      }
    }
  }
  const ids = new Set<string>();
  for (const t of bp.types) { if (ids.has(t.id)) bug(`Two card types share the id "${t.id}".`, 'types'); ids.add(t.id); }
  const cardIds = new Set<string>();
  for (const k of bp.cards) {
    if (cardIds.has(k.id)) bug(`Two cards share the id "${k.id}".`, `card:${k.id}`);
    cardIds.add(k.id);
    if (!typeIds.has(k.type)) bug(`${k.name} has a type that no longer exists.`, `card:${k.id}`);
    for (const w of k.keywords) if (!x.kw.has(w)) bug(`${k.name} has the keyword "${w}", which isn't defined.`, `card:${k.id}`);
    for (const s of Object.keys(k.stats)) if (!statIds.has(s)) tip(`${k.name} sets "${s}", which isn't one of your stats.`, `card:${k.id}`);
    const role = x.roleOf.get(k.type);
    if (role && UNIT_ROLES.includes(role) && bp.combat.mode !== 'none' && k.stats[bp.combat.power] === undefined) tip(`${k.name} has no ${bp.combat.power}.`, `card:${k.id}`);
    if (role === 'evolution' && !bp.cards.some((b) => b.name === k.evolvesFrom)) bug(`${k.name} evolves from "${k.evolvesFrom ?? '?'}", but no card has that name.`, `card:${k.id}`);
    for (const a of k.abilities) for (const e of a.do) {
      if (e.k === 'token') { const tk = bp.cards.find((c) => c.id === e.card); if (!tk || (x.roleOf.get(tk.type) !== 'token' && !tk.isToken)) bug(`${k.name} makes a token "${e.card ?? '?'}", which isn't a Token card (or marked as a token).`, `card:${k.id}`); }
      if (e.k === 'counter' && bp.timing === 'simple') tip(`${k.name} cancels spells, which only works with stack or chain timing.`, `card:${k.id}`);
    }
    if (bp.combat.mode === 'duel' && role === 'unit' && !k.moves?.length) tip(`${k.name} has no attacks.`, `card:${k.id}`);
  }
  if (!bp.decks.length) bug('Make at least one deck so the game can be played.', 'decks');
  for (const d of bp.decks) {
    for (const id of [...Object.keys(d.main), ...Object.keys(d.extra ?? {}), ...Object.keys(d.res ?? {})]) if (!cardIds.has(id)) bug(`Deck "${d.name}" lists a card that no longer exists.`, `deck:${d.id}`);
    if (x.leader && !d.leader) bug(`Deck "${d.name}" needs a leader.`, `deck:${d.id}`);
  }
  if (bp.colors.length && !bp.cards.some((k) => k.color)) tip('You defined colors, but no card uses one.', 'look');
  const hiddenZ = new Set(['deck', 'life', 'prizes', 'resdeck', ...(bp.zones ?? []).filter((z) => z.vis !== 'public').map((z) => z.id)]);
  for (const k of bp.cards) for (const a of k.abilities) for (const e of a.do) if (e.filter?.zone && hiddenZ.has(e.filter.zone) && !['search'].includes(e.k)) bug(`${k.name} targets cards in a hidden zone, which players can't see. Use a public zone.`, `card:${k.id}`);
  if (bp.colors.length && bp.cards.some((k) => k.abilities.some((a) => a.do.some((e) => e.k === 'costMod')))) tip('Cost reducers only work in games without colored costs.', 'cards');
  return out;
}

/** Compiles and validates. On success `mod` is ready for createMatch; `problems` always lists what to fix. */
export function build(bp: Blueprint): { mod: Mod | null; problems: Problem[] } {
  const problems = lint(bp);
  if (problems.some((p) => p.level === 'bug')) return { mod: null, problems };
  let def;
  try { def = compileBlueprint(bp); } catch (e) { return { mod: null, problems: [...problems, { level: 'bug', text: `The game could not be built: ${(e as Error).message}` }] }; }
  const errs = validateModule(def);
  if (errs.length) return { mod: null, problems: [...problems, ...errs.slice(0, 12).map((t) => ({ level: 'bug' as const, text: `Engine check: ${t}`, where: 'advanced' }))] };
  const mod = compileModule(def);
  if ((def as any).campaign) for (const e of validateCampaign(mod, (def as any).campaign).slice(0, 12)) problems.push({ level: 'bug', text: `Shop/campaign: ${e}`, where: campaignOn(bp) ? 'campaign' : 'shop' });
  for (const d of bp.decks) for (const e of deckErrors(mod, mod.decks![d.id])) problems.push({ level: 'bug', text: `Deck "${d.name}": ${e}`, where: `deck:${d.id}` });
  return { mod: problems.some((p) => p.level === 'bug') ? null : mod, problems };
}
export { SCRIPT_FORMAT, SCRIPT_PARTS, exportScripts, importScripts, readScripts } from './scripts.ts';
export type { ScriptBundle, ScriptPart } from './scripts.ts';
export { STARTER_SCRIPTS, libraryEntry } from './library.ts';
export type { LibraryScript } from './library.ts';
export { FITS, featuresOf, fitIssues, fits, featureName } from './fits.ts';
export type { Fit, FitIssue } from './fits.ts';
export { answerFeatures } from './wizard.ts';
export { USAGE } from './usage.ts';
export { balanceReport, cardValue, effectValue, abilityValue, setCardCost } from './balance.ts';
export type { BalanceNote, PlayStat } from './balance.ts';
export { compileEconomy, starterEconomy, slotPool, shopOn, campaignOn } from './economy.ts';
