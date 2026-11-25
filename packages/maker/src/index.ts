// Game Maker: friendly blueprints compiled into engine modules, with plain-language checks ("bugs" and "tips").
import type { Mod } from '#engine';
import { compileModule, deckErrors, validateModule } from '#engine';
import type { Blueprint } from './blueprint.ts';
import { UNIT_ROLES, compileBlueprint, context } from './compile.ts';

export * from './blueprint.ts';
export { compileBlueprint, cardText, abilityText, effectText, costLabel, costText, filterText, slug, UNIT_ROLES } from './compile.ts';
export { BLUEPRINTS, fromBlueprint, blank } from './presets.ts';
export { RECIPES, applyRecipe, surpriseRecipes } from './recipes.ts';
export { rulebook, rulebookMarkdown } from './rulebook.ts';
export type { RuleSection } from './rulebook.ts';
export { cardsToCsv, cardsFromCsv, parseCsv } from './csv.ts';
export type { Recipe, RecipeGroup } from './recipes.ts';

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
  if (!bp.types.some((t) => UNIT_ROLES.includes(t.role) && t.role !== 'token') && bp.combat.mode !== 'none') bug('Your game has combat but no card type that fights. Add a Unit type.', 'types');
  if (!statIds.has(bp.combat.power)) bug(`Combat uses the stat "${bp.combat.power}", which your game doesn't have.`, 'rules');
  if (bp.combat.health && !statIds.has(bp.combat.health)) bug(`Combat uses the health stat "${bp.combat.health}", which your game doesn't have.`, 'rules');
  if (!x.life && !x.lifeCards && !x.prizes && !x.points) bug('Nobody can win! Turn on life, life cards, prizes or points.', 'rules');
  if (!bp.turn.some((p) => p.kind === 'main')) bug('Your turn needs a Main phase, or nobody can play cards.', 'turn');
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
      if (e.k === 'token' && x.roleOf.get(bp.cards.find((c) => c.id === e.card)?.type ?? '') !== 'token') bug(`${k.name} makes a token "${e.card ?? '?'}", which isn't a Token card.`, `card:${k.id}`);
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
  for (const d of bp.decks) for (const e of deckErrors(mod, mod.decks![d.id])) problems.push({ level: 'bug', text: `Deck "${d.name}": ${e}`, where: `deck:${d.id}` });
  return { mod: problems.some((p) => p.level === 'bug') ? null : mod, problems };
}
