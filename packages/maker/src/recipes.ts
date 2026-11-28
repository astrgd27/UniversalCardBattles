// Mechanic recipes: one-click packs that add a whole system to any blueprint (stats, types, keywords, rules settings
// and a few example cards). They are plain edits, so everything they add can be changed afterwards, and they combine:
// an inkwell with shields and twin arenas, pitch with action points and life cards, and so on.
import type { Blueprint, CardBP, CardType, Keyword, KeywordRule, Role } from './blueprint.ts';
import { normalize } from './blueprint.ts';
import { slug } from './compile.ts';

export type RecipeGroup = 'Resources' | 'Combat' | 'Board' | 'Winning' | 'Timing & turns' | 'Card types' | 'Keywords & counters';
/** A sub-option of a shelf recipe: a short list of values you step through with arrows; it reads and writes the live blueprint. */
export interface RecipeOpt { id: string; label: string; values: unknown[]; names?: string[]; get: (bp: Blueprint) => unknown; set: (bp: Blueprint, v: any) => void }
export interface Recipe { id: string; name: string; icon: string; group: RecipeGroup; desc: string; apply: (bp: Blueprint) => void; opts?: RecipeOpt[] }

const UNITISH: Role[] = ['unit', 'evolution', 'extra', 'token'];
const roleOf = (bp: Blueprint, c: CardBP): Role => bp.types.find((t) => t.id === c.type)?.role ?? 'unit';
const unitCards = (bp: Blueprint) => bp.cards.filter((c) => roleOf(bp, c) === 'unit');
const playable = (bp: Blueprint) => bp.cards.filter((c) => !['resource', 'token', 'leader'].includes(roleOf(bp, c)));
const costNum = (c: CardBP) => (typeof c.cost === 'number' ? c.cost : Object.values(c.cost ?? {}).reduce((a, b) => a + b, 0));
function scale(bp: Blueprint): number {
  const p = unitCards(bp).map((c) => c.stats[bp.combat.power] ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  return p[Math.floor(p.length / 2)] ?? 2;
}
function ensureStat(bp: Blueprint, id: string, name: string, icon = '') {
  if (!bp.stats.some((s) => s.id === id)) bp.stats.push({ id, name, icon });
}
function ensureKeyword(bp: Blueprint, id: string, name: string, rule: KeywordRule, text: string, valued = false): Keyword {
  let k = bp.keywords.find((w) => w.id === id) ?? bp.keywords.find((w) => w.rule === rule && rule !== 'none');
  if (!k) { k = { id, name, rule, text, ...(valued ? { valued } : {}) }; bp.keywords.push(k); }
  return k;
}
const FRAMES: Record<Role, CardType['frame']> = {
  unit: { base: 'skirmisher', cost: 'tl', stats: [], art: 48, text: true }, spell: { base: 'spell', cost: 'tl', stats: [], art: 48, text: true },
  fast: { base: 'spell', cost: 'tl', stats: [], art: 48, text: true }, attack: { base: 'classic', cost: 'tl', stats: [], art: 48, text: true },
  permanent: { base: 'spell', cost: 'tl', stats: [], art: 48, text: true }, attachment: { base: 'spell', cost: 'tl', stats: [], art: 48, text: true },
  resource: { base: 'resource', cost: 'none', stats: [], art: 70, text: false }, trap: { base: 'spell', cost: 'none', stats: [], art: 48, text: true },
  leader: { base: 'leader', cost: 'none', stats: [], art: 52, text: true }, evolution: { base: 'vital', cost: 'tl', stats: [], art: 48, text: true },
  extra: { base: 'monster', cost: 'none', stats: [], art: 48, text: true }, token: { base: 'token', cost: 'none', stats: [], art: 48, text: true },
  walker: { base: 'leader', cost: 'tl', stats: [], art: 52, text: true },
  battlefield: { base: 'spell', cost: 'none', stats: [], art: 52, text: true, layout: 'landscape' },
  location: { base: 'spell', cost: 'tl', stats: [], art: 52, text: true, layout: 'landscape' },
  ice: { base: 'monster', cost: 'tl', stats: [], art: 48, text: true }, agenda: { base: 'spell', cost: 'none', stats: [], art: 48, text: true },
};
function ensureType(bp: Blueprint, id: string, name: string, role: Role, icon = '', zone?: string): CardType {
  let t = bp.types.find((x) => x.id === id);
  if (!t) {
    const stats = UNITISH.includes(role) || role === 'leader' || role === 'attack'
      ? [{ stat: bp.combat.power, pos: 'bl' as const }, ...(bp.combat.health ? [{ stat: bp.combat.health, pos: 'br' as const }] : [])] : [];
    t = { id, name, role, icon, frame: { ...structuredClone(FRAMES[role]), stats }, ...(zone ? { zone } : {}) };
    bp.types.push(t);
  }
  return t;
}
function addCard(bp: Blueprint, c: Omit<CardBP, 'keywords' | 'abilities' | 'id'> & Partial<CardBP>, copies: number, section: 'main' | 'extra' | 'res' | 'none' = 'main'): CardBP {
  let id = c.id || slug(c.name);
  const base = id;
  for (let i = 2; bp.cards.some((k) => k.id === id); i++) id = `${base}-${i}`;
  const card: CardBP = { keywords: [], abilities: [], ...c, id };
  bp.cards.push(card);
  if (section !== 'none') for (const d of bp.decks) { const m = (d[section] ??= {}); m[id] = (m[id] ?? 0) + copies; }
  fitDecks(bp);
  return card;
}
/** Keeps deck limits wide enough for what recipes added, and sections consistent with the resource system. */
function fitDecks(bp: Blueprint) {
  for (const d of bp.decks) {
    const n = Object.values(d.main).reduce((a, b) => a + b, 0);
    if (n > bp.setup.deckMax) bp.setup.deckMax = n;
    if (n < bp.setup.deckMin) bp.setup.deckMin = Math.max(5, n);
    if (bp.resource.mode === 'deck') for (const c of bp.cards) if (roleOf(bp, c) === 'resource' && d.main[c.id]) { delete d.main[c.id]; }
  }
  for (const d of bp.decks) { const n = Object.values(d.main).reduce((a, b) => a + b, 0); if (n < bp.setup.deckMin) bp.setup.deckMin = Math.max(5, n); }
  bp.setup.maxCopies = Math.max(bp.setup.maxCopies, ...bp.decks.flatMap((d) => Object.entries(d.main).filter(([id]) => roleOf(bp, bp.cards.find((c) => c.id === id)!) !== 'resource').map(([, v]) => v)), 1);
}
const needTargetMode = (bp: Blueprint) => { if (!['block', 'target'].includes(bp.combat.mode)) bp.combat.mode = 'target'; };
const unitTypes = (bp: Blueprint) => bp.types.filter((t) => t.role === 'unit');

export const RECIPES: Recipe[] = [
  // ---------------------------------------------------------------- resources
  { id: 'ramp', name: 'Growing energy', icon: '📈', group: 'Resources', desc: 'Your energy refills each turn and grows by one, up to 10.',
    apply: (bp) => { Object.assign(bp.resource, { mode: 'ramp', name: bp.resource.name === 'None' ? 'Energy' : bp.resource.name, start: 1, perTurn: 1, max: 10 }); } },
  { id: 'lands', name: 'Colored lands', icon: '⛰', group: 'Resources', desc: 'Play one land a turn from your hand; lands make colored mana for typed costs.',
    apply: (bp) => {
      Object.assign(bp.resource, { mode: 'cards', name: 'Mana' });
      if (!bp.colors.length) bp.colors.push({ id: 'ember', name: 'Ember', hex: '#e8553a', icon: '🔥' }, { id: 'tide', name: 'Tide', hex: '#3a8de8', icon: '💧' });
      ensureType(bp, 'land', 'Land', 'resource', '⛰');
      const per = Math.max(4, Math.round(16 / bp.colors.length));
      for (const k of bp.colors) addCard(bp, { id: `${k.id}-land`, name: `${k.name} Grounds`, type: 'land', color: k.id, stats: {} }, per);
    } },
  { id: 'inkwell', name: 'Inkwell', icon: '◈', group: 'Resources', desc: 'Once a turn, put a card marked Inkable face down as a resource. Every card is a choice: play it or ink it.',
    apply: (bp) => {
      Object.assign(bp.resource, { mode: 'anycard', name: 'Ink', icon: '◈', faceDown: true, onlyKeyword: 'inkable' });
      ensureKeyword(bp, 'inkable', 'Inkable', 'none', 'Can be put into your inkwell.');
      playable(bp).forEach((c, i) => { if (i % 4 !== 3 && !c.keywords.includes('inkable')) c.keywords.push('inkable'); });
    } },
  { id: 'manaZone', name: 'Any card as mana', icon: '🔄', group: 'Resources', desc: 'Once a turn, put any card from your hand into your mana zone, face up; it makes its own color.',
    apply: (bp) => { Object.assign(bp.resource, { mode: 'anycard', name: 'Mana', faceDown: false, onlyKeyword: undefined }); } },
  { id: 'hiddenResources', name: 'Face-down resources', icon: '🂠', group: 'Resources', desc: 'Once a turn, put any card face down as a resource (generic, no colors).',
    apply: (bp) => { Object.assign(bp.resource, { mode: 'anycard', name: 'Resources', faceDown: true, onlyKeyword: undefined }); } },
  { id: 'resDeck', name: 'Resource deck', icon: '🪙', group: 'Resources', desc: 'A separate 10-card deck feeds you resources each turn (1 on the first turn, then 2).',
    apply: (bp) => {
      Object.assign(bp.resource, { mode: 'deck', start: 1, perTurn: 2, deckSize: 10 });
      ensureType(bp, 'resource-card', 'Resource', 'resource', '◎');
      if (!bp.cards.some((c) => c.id === 'resource-card')) addCard(bp, { id: 'resource-card', name: bp.resource.name || 'Resource', type: 'resource-card', stats: {} }, 0, 'none');
      for (const d of bp.decks) d.res = { 'resource-card': 10 };
      fitDecks(bp);
    } },
  { id: 'attachEnergy', name: 'Attached energy', icon: '🔋', group: 'Resources', desc: 'Attach one energy card a turn to a unit. Units carry their own fuel.',
    apply: (bp) => {
      bp.resource.mode = 'attach'; bp.resource.name = 'Energy';
      ensureType(bp, 'energy', 'Energy', 'resource', '⚡');
      if (!bp.cards.some((c) => c.type === 'energy')) addCard(bp, { name: 'Basic Energy', type: 'energy', stats: {} }, 12);
    } },
  { id: 'pitch', name: 'Pitch & attack cards', icon: '◆', group: 'Resources', desc: 'Pay by pitching cards from hand (each worth 1-3). Attack with attack cards; defend by blocking with cards from hand.',
    apply: (bp) => {
      Object.assign(bp.resource, { mode: 'pitch', name: 'Resources', pitchStat: 'pitch', actions: Math.max(1, bp.resource.actions ?? 0) });
      ensureStat(bp, 'pitch', 'Pitch', '◆'); ensureStat(bp, 'defense', 'Defense', '⛨');
      bp.combat.mode = 'cards'; bp.combat.blockStat = 'defense';
      if (!bp.win.life) bp.win.life = 20;
      ensureKeyword(bp, 'go-again', 'Go again', 'goAgain', 'Gives back its action point.');
      const at = ensureType(bp, 'attack', 'Attack', 'attack', '⚔');
      at.frame.stats = [{ stat: bp.combat.power, pos: 'bl' }, { stat: 'defense', pos: 'br' }, { stat: 'pitch', pos: 'tr' }];
      playable(bp).forEach((c, i) => { c.stats.pitch ??= 1 + (i % 3); c.stats.defense ??= 2 + (i % 2); });
      const s = Math.max(3, scale(bp));
      addCard(bp, { name: 'Quick Jab', type: 'attack', cost: 0, stats: { [bp.combat.power]: Math.round(s * 0.8), defense: 2, pitch: 2 }, keywords: ['go-again'] }, 3);
      addCard(bp, { name: 'Heavy Blow', type: 'attack', cost: 2, stats: { [bp.combat.power]: Math.round(s * 1.7), defense: 3, pitch: 1 } }, 3);
      addCard(bp, { name: 'Measured Cut', type: 'attack', cost: 1, stats: { [bp.combat.power]: Math.round(s * 1.2), defense: 3, pitch: 3 },
        abilities: [{ when: 'hit', do: [{ k: 'draw', n: 1 }] }] }, 3);
    } },
  { id: 'skillChecks', name: 'Skill checks', icon: '🎯', group: 'Resources', desc: 'No resources: play any card by passing a check. Turn over your top card; its Check value must reach the card\'s difficulty plus the cards you already played this turn. Foundations can be committed to make up the difference; a failed check ends your turn.',
    apply: (bp) => {
      Object.assign(bp.resource, { mode: 'check', name: 'Check', icon: '🎯', checkStat: 'check' });
      ensureStat(bp, 'check', 'Check', '🎯');
      for (const c of bp.cards) c.stats.check ??= Math.max(1, Math.min(6, 6 - costNum(c)));
      const t = ensureType(bp, 'foundation', 'Foundation', 'permanent', '🧱');
      t.foundation = true;
      addCard(bp, { name: 'Steady Training', type: t.id, cost: 1, stats: { check: 5 } }, 3);
      addCard(bp, { name: 'Focus Stone', type: t.id, cost: 2, stats: { check: 4 }, abilities: [{ when: 'activated', tap: true, do: [{ k: 'buff', n: 1, target: 'ownUnit' }], label: 'Commit: a unit of yours gets +1 power this turn' }] }, 3);
    } },
  { id: 'actionPoints', name: 'Action points', icon: '⏱', group: 'Resources', desc: 'One action a turn: each non-quick card costs an action point; "Go again" gives it back.',
    apply: (bp) => {
      bp.resource.actions = 1;
      ensureKeyword(bp, 'go-again', 'Go again', 'goAgain', 'Gives back its action point.');
      playable(bp).filter((c) => costNum(c) <= 1).forEach((c) => { if (!c.keywords.includes('go-again')) c.keywords.push('go-again'); });
    } },
  { id: 'levelGate', name: 'Level requirement', icon: '★', group: 'Resources', desc: 'A card can only be played once you have resources at least equal to its level.',
    apply: (bp) => { ensureStat(bp, 'level', 'Level', '★'); for (const c of playable(bp)) c.stats.level ??= Math.max(1, costNum(c)); bp.resource.levelGate = 'level'; } },
  { id: 'energyNeed', name: 'Energy requirement', icon: '⚡', group: 'Resources', desc: 'Units generate energy; a card needs enough energy on your side to be played (it is not spent).',
    apply: (bp) => {
      ensureStat(bp, 'need', 'Energy needed', '◆'); ensureStat(bp, 'gen', 'Energy made', '⚡');
      for (const c of playable(bp)) { c.stats.need ??= Math.max(0, costNum(c) - 1); if (roleOf(bp, c) === 'unit') c.stats.gen ??= costNum(c) >= 4 ? 2 : 1; }
      bp.resource.need = { stat: 'need', gen: 'gen' };
    } },
  { id: 'boost', name: 'Power boosts', icon: '⬆', group: 'Resources', desc: 'Spend 1 resource during battle to give a unit extra power until end of turn.',
    apply: (bp) => { if (!['ramp', 'cards', 'anycard', 'deck'].includes(bp.resource.mode)) bp.resource.mode = 'ramp'; bp.resource.boost = Math.max(1, Math.round(scale(bp) / 3)); } },

  // ---------------------------------------------------------------- combat
  { id: 'block', name: 'Attack & block', icon: '🛡', group: 'Combat', desc: 'Attackers hit the player; the defender may block with up to two units. Adds First Strike.',
    apply: (bp) => { bp.combat.mode = 'block'; bp.combat.maxBlockers = 2; ensureKeyword(bp, 'first-strike', 'First Strike', 'firstStrike', 'Deals combat damage first.'); } },
  { id: 'target', name: 'Pick a target', icon: '🎯', group: 'Combat', desc: 'Attack a unit or the player directly; both sides deal damage.',
    apply: (bp) => { bp.combat.mode = 'target'; bp.combat.direct = 'always'; } },
  { id: 'compare', name: 'Power duels', icon: '⚖', group: 'Combat', desc: 'No health: the stronger unit wins a battle, the loser is destroyed, ties destroy both.',
    apply: (bp) => { needTargetMode(bp); bp.combat.health = null; bp.combat.compare = { ties: 'both', loser: true, overflow: false }; } },
  { id: 'positions', name: 'Positions & face-down units', icon: '🔃', group: 'Combat', desc: 'Units can be set face down in defense position and switch positions; battle damage spills to the player.',
    apply: (bp) => {
      needTargetMode(bp); ensureStat(bp, 'def', 'Defense', '⛨');
      bp.combat.health = null; bp.combat.defense = 'def'; bp.combat.positions = true; bp.combat.compare = { ties: 'both', loser: true, overflow: true };
      for (const c of unitCards(bp)) c.stats.def ??= Math.max(1, Math.round((c.stats[bp.combat.power] ?? 1) * 0.8));
    } },
  { id: 'quest', name: 'Questing for points', icon: '◆', group: 'Combat', desc: 'Units exhaust to quest for their Lore instead of attacking players; first to 20 wins. Units can only challenge exhausted units.',
    apply: (bp) => {
      ensureStat(bp, 'lore', 'Lore', '◆');
      for (const c of unitCards(bp)) c.stats.lore ??= (c.stats[bp.combat.power] ?? 0) >= scale(bp) ? 1 : 2;
      needTargetMode(bp); Object.assign(bp.combat, { quest: 'lore', direct: 'never', targetUnits: 'exhausted' });
      bp.win.points = bp.win.points || 20; bp.win.life = 0; bp.win.lifeCards = 0;
      for (const t of unitTypes(bp)) if (!t.frame.stats.some((s) => s.stat === 'lore')) t.frame.stats.push({ stat: 'lore', pos: 'tr', icon: '◆' });
    } },
  { id: 'counterStep', name: 'Counter step', icon: '⛉', group: 'Combat', desc: 'When attacked, the defender may discard cards with a Counter value to power up the defender.',
    apply: (bp) => {
      needTargetMode(bp); ensureStat(bp, 'counter', 'Counter', '⛉'); bp.combat.counterStep = true;
      unitCards(bp).forEach((c, i) => { c.stats.counter ??= i % 3 === 2 ? 0 : Math.max(1, Math.round(scale(bp) / (i % 3 === 0 ? 2 : 1))); });
    } },
  { id: 'lifeTriggers', name: 'Life-card triggers', icon: '✶', group: 'Winning', desc: 'When a life card is taken, cards marked Trigger can be used for free on the spot.',
    apply: (bp) => {
      if (!bp.win.lifeCards) { bp.win.lifeCards = 5; bp.win.life = 0; }
      bp.win.lifeTriggers = true;
      ensureKeyword(bp, 'trigger', 'Trigger', 'trigger', 'If this is taken from your life, you may use it for free.');
      bp.cards.filter((c) => ['spell', 'fast'].includes(roleOf(bp, c)) && costNum(c) <= 3).forEach((c) => { if (!c.keywords.includes('trigger')) c.keywords.push('trigger'); });
    } },

  // ---------------------------------------------------------------- board
  { id: 'twinArenas', name: 'Twin arenas', icon: '🪐', group: 'Board', desc: 'Two arenas (ground and space). Units only fight units in their own arena, or the opponent.',
    apply: (bp) => {
      needTargetMode(bp);
      bp.combat.arenas = [{ id: 'ground', name: 'Ground Arena', size: 6, attack: true }, { id: 'space', name: 'Space Arena', size: 6, attack: true }];
      bp.combat.sameArena = true;
      for (const t of unitTypes(bp)) {
        t.zone = 'ground';
        const sp = ensureType(bp, `${t.id}-space`, `Space ${t.name}`, 'unit', '🚀', 'space');
        sp.frame = structuredClone(t.frame);
      }
      unitCards(bp).forEach((c, i) => { if (i % 2 && !c.type.endsWith('-space')) c.type = `${c.type}-space`; });
    } },
  { id: 'lines', name: 'Front line & reserve', icon: '⇵', group: 'Board', desc: 'Units enter a reserve line and move to the front line to attack and block.',
    apply: (bp) => {
      bp.combat.arenas = [{ id: 'front', name: 'Front Line', size: 4, attack: true }, { id: 'reserve', name: 'Reserve Line', size: 4, attack: false }];
      bp.combat.sameArena = false;
      for (const t of unitTypes(bp)) t.zone = 'reserve';
      if (!['block', 'target'].includes(bp.combat.mode)) bp.combat.mode = 'block';
    } },
  { id: 'lanes', name: 'Battlefields', icon: '⟁', group: 'Board', desc: 'Move units onto shared battlefields; fights break out; conquer and hold battlefields for points.',
    apply: (bp) => { bp.combat.mode = 'lanes'; bp.combat.arenas = undefined; bp.combat.lanes = bp.combat.lanes?.length ? bp.combat.lanes : ['North Field', 'South Field']; bp.win.points = bp.win.points || 8; bp.win.life = 0; if (!bp.combat.health) bp.combat.health = bp.stats.find((s) => s.id === 'health')?.id ?? bp.combat.power; } },
  { id: 'duel', name: 'Active & bench', icon: '✪', group: 'Board', desc: 'One active unit fights with printed attacks that need attached energy; the rest wait on the bench. Take prize cards.',
    apply: (bp) => {
      bp.combat.mode = 'duel'; bp.combat.arenas = undefined;
      if (!bp.combat.health) { ensureStat(bp, 'health', 'Health', '♥'); bp.combat.health = 'health'; for (const c of unitCards(bp)) c.stats.health ??= (c.stats[bp.combat.power] ?? 1) * 2; }
      Object.assign(bp.combat, { attackEndsTurn: true, sickness: false, firstTurnAttack: false, benchSize: 5 });
      RECIPES.find((r) => r.id === 'attachEnergy')!.apply(bp);
      for (const c of unitCards(bp)) c.moves ??= [{ name: 'Strike', cost: { any: Math.max(1, Math.min(3, costNum(c))) }, damage: c.stats[bp.combat.power] ?? 1 }];
      bp.win.prizes = bp.win.prizes || 4; bp.win.noUnits = true; bp.win.life = 0;
    } },
  { id: 'leader', name: 'Leader', icon: '👑', group: 'Board', desc: 'Each deck has a leader card that starts in play. With life cards, its Life sets how many you get.',
    apply: (bp) => {
      bp.setup.leader = true; ensureType(bp, 'leader', 'Leader', 'leader', '👑');
      if (bp.win.lifeCards) ensureStat(bp, 'life', 'Life', '♥');
      let ld = bp.cards.find((c) => roleOf(bp, c) === 'leader');
      if (!ld) ld = addCard(bp, { name: 'Champion of the Realm', type: 'leader', stats: { [bp.combat.power]: scale(bp), ...(bp.win.lifeCards ? { life: bp.win.lifeCards } : {}) },
        abilities: [{ when: 'activated', tap: true, once: true, do: [{ k: 'buff', n: Math.max(1, Math.round(scale(bp) / 2)), target: 'ownUnit' }], label: 'Exhaust: a unit gets a boost' }] }, 0, 'none');
      for (const d of bp.decks) d.leader ??= ld.id;
      bp.combat.leaderAttacks = true;
    } },
  { id: 'deployLeader', name: 'Deployable leader', icon: '🚩', group: 'Board', desc: 'Once you have 6 resources, your leader can enter play as a unit (once per game).',
    apply: (bp) => {
      RECIPES.find((r) => r.id === 'leader')!.apply(bp);
      const ld = bp.cards.find((c) => roleOf(bp, c) === 'leader')!;
      if (!ld.abilities.some((a) => a.do.some((e) => e.k === 'deploy'))) ld.abilities.push({ when: 'activated', once: 'game', if: { k: 'res', n: 6 }, do: [{ k: 'deploy' }], label: 'Deploy (6+ resources): enter play as a unit' });
      if (bp.combat.health) ld.stats[bp.combat.health] ??= scale(bp) * 2;
      bp.combat.leaderAttacks = false;
    } },

  // ---------------------------------------------------------------- winning
  { id: 'lifeCards', name: 'Life cards', icon: '🂡', group: 'Winning', desc: 'Your life is a stack of face-down cards; each hit puts one into your hand. A hit with none left loses.',
    apply: (bp) => { bp.win.life = 0; bp.win.lifeCards = bp.win.lifeCards || 5; } },
  { id: 'shields', name: 'Shields', icon: '🛡', group: 'Winning', desc: 'Five face-down shields; breaking one puts it in your hand, and Shield Trigger cards can be cast for free.',
    apply: (bp) => {
      bp.win.life = 0; bp.win.lifeCards = 5; bp.win.lifeTriggers = true;
      ensureKeyword(bp, 'trigger', 'Shield Trigger', 'trigger', 'When this is broken from your shields, you may cast it for free.');
      bp.cards.filter((c) => ['spell', 'fast'].includes(roleOf(bp, c))).forEach((c) => { if (!c.keywords.includes('trigger')) c.keywords.push('trigger'); });
      if (bp.combat.mode === 'target') bp.combat.direct = 'always';
    } },
  { id: 'prizes', name: 'Prize cards', icon: '🏆', group: 'Winning', desc: 'Set aside prize cards; take one each time an enemy unit is destroyed. Take them all to win.',
    apply: (bp) => { bp.win.prizes = 4; bp.win.life = 0; } },
  { id: 'lifeTotal', name: 'Life total', icon: '♥', group: 'Winning', desc: 'Classic life points: reduce the opponent to 0.',
    apply: (bp) => { bp.win.life = bp.win.life || 20; bp.win.lifeCards = 0; } },

  // ---------------------------------------------------------------- timing & turns
  { id: 'stack', name: 'Stack & responses', icon: '⧗', group: 'Timing & turns', desc: 'Anyone can respond with quick cards; the last thing played resolves first. Adds a Counterspell.',
    apply: (bp) => {
      bp.timing = 'stack'; ensureType(bp, 'quick', 'Quick Spell', 'fast', '⚡');
      addCard(bp, { name: 'Countermand', type: bp.types.find((t) => t.role === 'fast')!.id, cost: 2, stats: {}, abilities: [{ when: 'play', do: [{ k: 'counter' }] }] }, 2);
    } },
  { id: 'chain', name: 'Chains', icon: '⛓', group: 'Timing & turns', desc: 'Players take turns adding responses to a chain, which then resolves backwards.',
    apply: (bp) => { bp.timing = 'chain'; } },
  { id: 'alternate', name: 'Alternating actions', icon: '⇄', group: 'Timing & turns', desc: 'Both players act in the same round, one action at a time; regroup together at the end.',
    apply: (bp) => { for (const p of bp.turn) { if (p.kind === 'main') p.alternate = true; if (p.kind === 'ready' || p.kind === 'draw') p.each = true; } } },
  { id: 'drawTo', name: 'Draw up to a hand size', icon: '✋', group: 'Timing & turns', desc: 'Instead of drawing one, refill your hand to 4 at the end of your turn.',
    apply: (bp) => {
      bp.turn = bp.turn.filter((p) => p.kind !== 'draw');
      const end = bp.turn.findIndex((p) => p.kind === 'end');
      bp.turn.splice(end < 0 ? bp.turn.length : end, 0, { id: 'refill', name: 'Refill', kind: 'draw', drawTo: 4 });
      bp.setup.skipFirstDraw = false; bp.setup.handLimit = Math.max(bp.setup.handLimit, 8);
    } },
  { id: 'combatPhase', name: 'Separate combat phase', icon: '⚔', group: 'Timing & turns', desc: 'Main, then Combat, then a second Main.',
    apply: (bp) => {
      if (bp.turn.some((p) => p.kind === 'combat')) return;
      const i = bp.turn.findIndex((p) => p.kind === 'main');
      bp.turn.splice(i + 1, 0, { id: 'combat', name: 'Combat', kind: 'combat' }, { id: 'main2', name: 'Second Main', kind: 'main' });
    } },

  // ---------------------------------------------------------------- card types
  { id: 'traps', name: 'Traps', icon: '⚠', group: 'Card types', desc: 'Set traps face down; spring them on a later turn, some only when an enemy attacks.',
    apply: (bp) => { ensureType(bp, 'trap', 'Trap', 'trap', '⚠'); addCard(bp, { name: 'Snare Pit', type: 'trap', cost: 1, stats: {}, abilities: [{ when: 'opAttack', do: [{ k: 'destroy', target: 'attacker' }] }] }, 2); } },
  { id: 'tribute', name: 'Tribute summons', icon: '⇣', group: 'Card types', desc: 'Big units need tributes: level 5+ sends one of your units to the discard pile, level 7+ sends two.',
    apply: (bp) => { ensureStat(bp, 'level', 'Level', '★'); for (const c of unitCards(bp)) c.stats.level ??= Math.max(1, Math.min(10, costNum(c) + 1)); bp.resource.tribute = [{ level: 5, n: 1 }, { level: 7, n: 2 }]; } },
  { id: 'evolution', name: 'Evolution & shift', icon: '⇑', group: 'Card types', desc: 'Evolved cards are played on top of a named unit (or any unit of a family), keeping its damage.',
    apply: (bp) => {
      ensureType(bp, 'evolved', 'Evolved', 'evolution', '⇑');
      for (const b of unitCards(bp).slice(0, 2)) addCard(bp, { name: `${b.name} Ascendant`, type: 'evolved', cost: costNum(b) + 1, color: b.color, evolvesFrom: b.name,
        stats: Object.fromEntries(Object.entries(b.stats).map(([k, v]) => [k, Math.round(v * 1.6)])) }, 2);
    } },
  { id: 'extraDeck', name: 'Fusion deck', icon: '✶', group: 'Card types', desc: 'A separate extra deck of big units, summoned by sending two of your units to the discard pile.',
    apply: (bp) => {
      ensureType(bp, 'fusion', 'Fusion', 'extra', '✶');
      const s = scale(bp);
      addCard(bp, { name: 'Fused Colossus', type: 'fusion', cost: 0, materials: 2, stats: { [bp.combat.power]: s * 3, ...(bp.combat.health ? { [bp.combat.health]: s * 3 } : {}) } }, 2, 'extra');
    } },
  { id: 'gear', name: 'Gear & pilots', icon: '🛠', group: 'Card types', desc: 'Attachments that ride on a unit and boost its stats.',
    apply: (bp) => {
      ensureType(bp, 'gear', 'Gear', 'attachment', '🛠');
      addCard(bp, { name: 'Battle Rig', type: 'gear', cost: 1, stats: {}, bonus: { [bp.combat.power]: Math.max(1, Math.round(scale(bp) / 2)) } }, 2);
    } },
  { id: 'songs', name: 'Songs', icon: '🎵', group: 'Card types', desc: 'Song spells can be sung for free by exhausting one of your units with at least the song\'s cost.',
    apply: (bp) => {
      ensureKeyword(bp, 'song', 'Song', 'song', 'A unit with cost at least this can sing it instead of paying.');
      const sp = bp.types.find((t) => t.role === 'spell') ?? ensureType(bp, 'action', 'Action', 'spell', '✦');
      addCard(bp, { name: 'Rallying Chorus', type: sp.id, cost: 3, stats: {}, keywords: ['song'], abilities: [{ when: 'play', do: [{ k: 'buff', n: Math.max(1, Math.round(scale(bp) / 2)), target: 'allOwnUnits' }] }] }, 2);
    } },
  { id: 'items', name: 'Items & locations', icon: '🏛', group: 'Card types', desc: 'Permanents that stay in play with an activated ability.',
    apply: (bp) => {
      ensureType(bp, 'item', 'Item', 'permanent', '🏛');
      addCard(bp, { name: 'Wishing Lamp', type: 'item', cost: 2, stats: {}, abilities: [{ when: 'activated', tap: true, do: [{ k: 'draw', n: 1 }], once: true, label: 'Exhaust: draw a card' }] }, 2);
    } },

  // ---------------------------------------------------------------- keywords & counters
  { id: 'keywordKit', name: 'Keyword toolkit', icon: '✧', group: 'Keywords & counters', desc: 'Adds a full set of classic keywords: Haste, Guard, Flying, Vigilance, Lifesteal, Deadly, Overflow, Ward, Shield, Resist N, Challenger N, Saboteur.',
    apply: (bp) => {
      for (const [id, name, rule, valued] of [['haste', 'Haste', 'haste'], ['guard', 'Guard', 'guard'], ['flying', 'Flying', 'flying'], ['vigilance', 'Vigilance', 'vigilance'], ['lifesteal', 'Lifesteal', 'lifesteal'],
        ['deadly', 'Deadly', 'deadly'], ['overflow', 'Overflow', 'overflow'], ['ward', 'Ward', 'ward'], ['shield', 'Shield', 'shield'], ['resist', 'Resist', 'resist', true], ['challenger', 'Challenger', 'challenger', true],
        ['saboteur', 'Saboteur', 'saboteur']] as [string, string, KeywordRule, boolean?][]) ensureKeyword(bp, id, name, rule, '', !!valued);
    } },
  { id: 'growth', name: '+1/+1 counters', icon: '✚', group: 'Keywords & counters', desc: 'Growth counters that permanently raise power (and health). Adds a card that places them.',
    apply: (bp) => {
      bp.counters ??= [];
      if (!bp.counters.some((k) => k.id === 'growth')) bp.counters.push({ id: 'growth', name: 'Growth', icon: '✚', adds: { [bp.combat.power]: 1, ...(bp.combat.health ? { [bp.combat.health]: 1 } : {}) } });
      const sp = bp.types.find((t) => t.role === 'spell') ?? ensureType(bp, 'action', 'Action', 'spell', '✦');
      addCard(bp, { name: 'Nurture', type: sp.id, cost: 1, stats: {}, abilities: [{ when: 'play', do: [{ k: 'addCounter', card: 'growth', n: 2, target: 'ownUnit' }] }] }, 2);
    } },
  { id: 'restrictions', name: 'Restriction keywords', icon: '⛔', group: 'Keywords & counters', desc: 'Defender (can\'t attack), Elusive (can\'t be blocked), Untouchable (can\'t be attacked) and Sluggish (enters exhausted), plus a wall unit.',
    apply: (bp) => {
      ensureKeyword(bp, 'defender', 'Defender', 'noAttack', "Can't attack.");
      ensureKeyword(bp, 'elusive', 'Elusive', 'unblockable', "Can't be blocked.");
      ensureKeyword(bp, 'untouchable', 'Untouchable', 'noBeAttacked', "Can't be attacked.");
      ensureKeyword(bp, 'sluggish', 'Sluggish', 'entersExhausted', 'Enters play exhausted.');
      const ut = unitTypes(bp)[0];
      if (ut) { const s = scale(bp); addCard(bp, { name: 'Stone Rampart', type: ut.id, cost: 2, stats: { [bp.combat.power]: Math.max(0, Math.round(s / 2)), ...(bp.combat.health ? { [bp.combat.health]: s * 3 } : {}) }, keywords: ['defender'] }, 2); }
    } },
  { id: 'conditions', name: 'Stun & sleep conditions', icon: '💤', group: 'Keywords & counters', desc: 'A Stun counter stops a unit attacking and blocking until the end of its controller\'s next turn. Adds a card that stuns.',
    apply: (bp) => {
      bp.counters ??= [];
      if (!bp.counters.some((k) => k.id === 'stun')) bp.counters.push({ id: 'stun', name: 'Stun', icon: '💤', stops: ['attack', 'block'], expires: true });
      const sp = bp.types.find((t) => t.role === 'spell') ?? ensureType(bp, 'action', 'Action', 'spell', '✦');
      addCard(bp, { name: 'Lullaby Dart', type: sp.id, cost: 1, stats: {}, abilities: [{ when: 'play', do: [{ k: 'addCounter', card: 'stun', n: 1, target: 'enemyUnit' }] }] }, 2);
    } },
  { id: 'costReducer', name: 'Cost reducers', icon: '🏷', group: 'Keywords & counters', desc: 'A permanent that makes your units cheaper while it is in play.',
    apply: (bp) => {
      const it = bp.types.find((t) => t.role === 'permanent') ?? ensureType(bp, 'item', 'Item', 'permanent', '🏛');
      const ut = unitTypes(bp)[0];
      addCard(bp, { name: 'Guild Charter', type: it.id, cost: 2, stats: {}, abilities: [{ when: 'static', do: [{ k: 'costMod', n: 1, ...(ut ? { type: ut.id } : {}) }] }] }, 2);
    } },
  { id: 'prevention', name: 'Damage prevention & second chances', icon: '🛡', group: 'Keywords & counters', desc: '"Instead" effects: a totem that reduces damage to your units, and a unit that returns to hand instead of being destroyed.',
    apply: (bp) => {
      const it = bp.types.find((t) => t.role === 'permanent') ?? ensureType(bp, 'item', 'Item', 'permanent', '🏛');
      addCard(bp, { name: 'Aegis Totem', type: it.id, cost: 2, stats: {}, abilities: [{ when: 'static', do: [{ k: 'prevent', n: Math.max(1, Math.round(scale(bp) / 3)), target: 'allOwnUnits' }] }] }, 2);
      const ut = unitTypes(bp)[0];
      if (ut) addCard(bp, { name: 'Ember Phoenix', type: ut.id, cost: 3, stats: { [bp.combat.power]: scale(bp), ...(bp.combat.health ? { [bp.combat.health]: scale(bp) } : {}) },
        abilities: [{ when: 'static', do: [{ k: 'insteadDestroy', to: 'hand' }] }] }, 2);
    } },
  { id: 'banish', name: 'Banished pile', icon: '🌀', group: 'Board', desc: 'Banish cards out of the game for good. Adds a removal spell that banishes, and a unit that banishes a card from your discard pile to power up.',
    apply: (bp) => {
      const sp = bp.types.find((t) => t.role === 'spell') ?? ensureType(bp, 'action', 'Action', 'spell', '✦');
      addCard(bp, { name: 'Void Exile', type: sp.id, cost: 3, stats: {}, abilities: [{ when: 'play', do: [{ k: 'moveTo', zone: 'banished', target: 'enemyUnit' }] }] }, 2);
      const ut = unitTypes(bp)[0];
      if (ut) addCard(bp, { name: 'Grave Feaster', type: ut.id, cost: 2, stats: { [bp.combat.power]: Math.max(1, Math.round(scale(bp) / 2)), ...(bp.combat.health ? { [bp.combat.health]: scale(bp) } : {}) },
        abilities: [{ when: 'activated', banish: 2, once: true, do: [{ k: 'buff', n: scale(bp), target: 'self' }], label: 'Banish 2 from your discard pile: +power this turn' }] }, 2);
    } },
  { id: 'places', name: 'Places (locations)', icon: '🏰', group: 'Board', desc: 'Location cards you play to the board. Units move there for its move cost and get its bonus; with questing it scores its lore at the start of your turn. Enemies can attack it.',
    apply: (bp) => {
      ensureStat(bp, 'move', 'Move cost', '🥾');
      const t = ensureType(bp, 'place', 'Place', 'location', '🏰');
      t.frame = { ...t.frame, layout: 'landscape', stats: [{ stat: 'move', pos: 'bl' }, ...(bp.combat.health ? [{ stat: bp.combat.health, pos: 'br' as const }] : []), ...(bp.combat.quest ? [{ stat: bp.combat.quest, pos: 'tr' as const }] : [])] };
      const st = (move: number, hp: number, lore: number) => ({ move, ...(bp.combat.health ? { [bp.combat.health]: hp } : {}), ...(bp.combat.quest ? { [bp.combat.quest]: lore } : {}) });
      addCard(bp, { name: 'Training Grounds', type: t.id, cost: 2, stats: st(1, 6, 1), abilities: [{ when: 'static', do: [{ k: 'aura', n: 1, stat: bp.combat.power, target: 'allOwnUnits', filter: { here: true } }] }] }, 2);
      addCard(bp, { name: 'Hidden Sanctuary', type: t.id, cost: 3, stats: st(2, 8, 2), abilities: bp.combat.health ? [{ when: 'static', do: [{ k: 'aura', n: 2, stat: bp.combat.health, target: 'allOwnUnits', filter: { here: true } }] }] : [] }, 2);
    } },
  { id: 'shift', name: 'Shift (upgraded versions)', icon: '⇪', group: 'Card types', desc: 'Stronger versions of a unit that can be played on top of it for a shift cost, keeping its damage and readiness. Cards share a name before " - ".',
    apply: (bp) => {
      const pick = unitCards(bp).filter((c) => !c.shift && !c.name.includes(' - ')).slice(0, 2);
      for (const c of pick) {
        const n = Math.max(2, costNum(c) + 2);
        addCard(bp, { name: `${c.name} - Legendary`, type: c.type, cost: n, color: c.color, stats: Object.fromEntries(Object.entries(c.stats).map(([k, v]) => [k, typeof v === 'number' ? v + 2 : v])),
          shift: Math.max(1, n - 2), abilities: [{ when: 'play', do: [{ k: 'draw', n: 1 }] }] }, 2);
      }
    } },
  { id: 'stadium', name: 'Shared stadium', icon: '🏟', group: 'Board', desc: 'A single Stadium slot for the whole table: playing a new Stadium replaces the one in play, whoever owns it. Stadiums buff everyone\'s units.',
    apply: (bp) => {
      bp.zones ??= [];
      if (!bp.zones.some((z) => z.id === 'stadium')) bp.zones.push({ id: 'stadium', name: 'Stadium', vis: 'public', size: 1, inPlay: true, global: true });
      const st = ensureType(bp, 'stadium-card', 'Stadium', 'permanent', '🏟');
      st.playTo = 'stadium';
      const s = Math.max(1, Math.round(scale(bp) / 3));
      addCard(bp, { name: 'Roaring Coliseum', type: st.id, cost: 1, stats: {}, abilities: [{ when: 'static', do: [{ k: 'aura', n: s, stat: bp.combat.power, target: 'allUnits' }] }] }, 2);
      addCard(bp, { name: 'Quiet Sanctuary', type: st.id, cost: 1, stats: {}, abilities: [{ when: 'static', do: [{ k: 'prevent', n: s, target: 'allUnits' }] }] }, 2);
    } },
  { id: 'restore', name: 'Keyword with its own abilities', icon: '🧩', group: 'Keywords & counters', desc: 'Example of a custom keyword with a number: "Restore N" (when this attacks, gain N life).',
    apply: (bp) => {
      const k = ensureKeyword(bp, 'restore', 'Restore', 'none', 'When this attacks, you gain N life.', true);
      k.abilities = [{ when: 'attack', do: [{ k: 'lifeGain', kw: 'restore' }] }];
      const u = unitCards(bp)[0];
      if (u && !u.keywords.includes('restore')) { u.keywords.push('restore'); (u.kwv ??= {}).restore = 2; }
      if (!bp.win.life) bp.win.life = 20;
    } },
];

/** Applies a recipe and records it on the blueprint (so the shelf can show what is in the game). */
// ---------------------------------------------------------------- mechanics not taken from any one game (each listed in its own group)
RECIPES.push(
  { id: 'zoneCombat', name: 'Zone combat', icon: '↕', group: 'Combat', desc: 'Attack cards strike high, mid or low with a speed; defenders block from hand with a card for that zone. Same zone stops it, the zone next to it halves it.',
    apply: (bp) => {
      Object.assign(bp.combat, { mode: 'cards', zones: true, blockStat: null });
      for (const [id, n, ic] of [['speed', 'Speed', '⚡'], ['azone', 'Attack zone', '↕'], ['bzone', 'Block zone', '🛡'], ['bmod', 'Block modifier', '±']] as const) ensureStat(bp, id, n, ic);
      const at = ensureType(bp, 'attack', 'Attack', 'attack', '👊');
      at.frame.stats = [{ stat: bp.combat.power, pos: 'bl' }, { stat: 'speed', pos: 'br' }];
      playable(bp).forEach((c, i) => { c.stats.bzone ??= 1 + (i % 3); c.stats.bmod ??= 1 + (i % 2); });
      const s = Math.max(2, scale(bp));
      for (const [name, z, sp, d] of [['Low Sweep', 1, 4, s], ['Body Blow', 2, 3, Math.round(s * 1.4)], ['Overhead Smash', 3, 2, s * 2]] as const)
        addCard(bp, { name, type: at.id, cost: Math.max(1, Math.round(d / Math.max(1, s))), stats: { [bp.combat.power]: d, speed: sp, azone: z, bzone: z, bmod: 1 } }, 3);
    } },
  { id: 'worldClock', name: 'World clock', icon: '🌗', group: 'Timing & turns', desc: 'Time moves on as turns pass (day and night, seasons…). Each time can change every unit, and cards can do more at certain times.',
    apply: (bp) => {
      bp.clock ??= { names: ['Day', 'Night'], every: 1, effect: { at: 1, stat: bp.combat.power, n: Math.max(1, Math.round(scale(bp) / 3)) } };
      const unit = bp.types.find((t) => t.role === 'unit');
      if (unit) addCard(bp, { name: 'Night Prowler', type: unit.id, cost: 2, stats: { [bp.combat.power]: scale(bp), ...(bp.combat.health ? { [bp.combat.health]: scale(bp) } : {}) },
        abilities: [{ when: 'static', if: { k: 'clock', n: bp.clock.names.length - 1 }, do: [{ k: 'aura', n: Math.max(1, scale(bp)), target: 'self' }] }] }, 2);
    } },
  { id: 'heat', name: 'Heat', icon: '🌡', group: 'Resources', desc: 'Every card you play builds heat. Reach the limit and you overheat (a penalty), then it resets; heat cools at the start of your turn.',
    apply: (bp) => {
      bp.heat ??= { per: 'card', limit: 5, penalty: 'damage', amount: Math.max(1, Math.round(scale(bp) / 2)), cool: 2 };
      addCard(bp, { name: 'Cool Down', type: (bp.types.find((t) => t.role === 'spell') ?? ensureType(bp, 'spell', 'Spell', 'spell', '✦')).id, cost: 1, stats: {},
        abilities: [{ when: 'play', do: [{ k: 'raw', raw: [['set', '$me', 'heat', 0]] }, { k: 'draw', n: 1 }] }] }, 2);
    } },
  { id: 'aging', name: 'Aging', icon: '⌛', group: 'Keywords & counters', desc: 'Units grow older each of your turns: they can grow stronger with age, crumble at a set age, or both.',
    apply: (bp) => { bp.aging ??= { dies: 5 }; } },
  { id: 'comeback', name: 'Comeback', icon: '🔄', group: 'Winning', desc: 'A player who falls behind (in life, points or units) gets a bonus at the start of each turn until they catch up.',
    apply: (bp) => { bp.comeback ??= { by: bp.win.points ? 'points' : bp.win.life ? 'life' : 'units', gap: bp.win.points ? 3 : bp.win.life ? Math.max(2, Math.round(bp.win.life / 4)) : 2, bonus: 'draw', n: 1 }; } },
);

// ---------------------------------------------------------------- sub-options: every recipe can be tuned beyond its source game
const getP = (o: any, p: (string | number)[]) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
const setP = (o: any, p: (string | number)[], v: unknown) => { let x = o; for (const k of p.slice(0, -1)) { x[k] ??= typeof k === 'number' ? [] : {}; x = x[k]; } if (v === undefined) delete x[p[p.length - 1]]; else x[p[p.length - 1]] = v; };
const at = (path: (string | number)[], label: string, values: unknown[], names?: string[]): RecipeOpt => ({ id: path.join('.'), label, values, names, get: (bp) => getP(bp, path), set: (bp, v) => setP(bp, path, v) });
const yes = ['Yes', 'No'];
const ofType = (role: Role, key: string, label: string, values: unknown[], names?: string[]): RecipeOpt => ({ id: `${role}.${key}`, label, values, names,
  get: (bp) => (bp.types.find((t) => t.role === role) as any)?.[key], set: (bp, v) => { const t = bp.types.find((x) => x.role === role) as any; if (t) { if (v === undefined) delete t[key]; else t[key] = v; } } });
const onCard = (id: string, path: (string | number)[], label: string, values: unknown[], names?: string[]): RecipeOpt => ({ id: `${id}.${path.join('.')}`, label, values, names,
  get: (bp) => getP(bp.cards.find((c) => c.id === id || c.id.startsWith(`${id}-`)) ?? {}, path), set: (bp, v) => { for (const c of bp.cards) if (c.id === id || c.id.startsWith(`${id}-`)) setP(c, path, v); } });
const kwRule = (id: string, label: string, values: KeywordRule[], names: string[]): RecipeOpt => ({ id: `kw.${id}`, label, values, names,
  get: (bp) => bp.keywords.find((k) => k.id === id)?.rule, set: (bp, v) => { const k = bp.keywords.find((x) => x.id === id); if (k) k.rule = v; } });
const pow = (bp: Blueprint) => bp.combat.power;
const OPTS: Record<string, RecipeOpt[]> = {
  ramp: [at(['resource', 'start'], 'First turn', [0, 1, 2, 3]), at(['resource', 'perTurn'], 'Growth per turn', [1, 2]), at(['resource', 'max'], 'Maximum', [5, 7, 10, 12, 15])],
  lands: [at(['resource', 'plays'], 'Lands per turn', [undefined, 2, 3], ['1', '2', '3']), { id: 'setup.maxColors', label: 'Colors per deck', values: [undefined, 1, 2, 3], names: ['any', '1', '2', '3'], get: (bp) => bp.setup.maxColors,
    set: (bp, v) => { if (v === undefined) { delete bp.setup.maxColors; return; } bp.setup.maxColors = v; // starter decks keep their main colors
      for (const d of bp.decks) { const by = new Map<string, number>(); for (const [id, n] of Object.entries(d.main)) { const c = bp.cards.find((k) => k.id === id)?.color; if (c) by.set(c, (by.get(c) ?? 0) + n); }
        const keep = new Set([...by].sort((a, b) => b[1] - a[1]).slice(0, v).map(([c]) => c));
        for (const id of Object.keys(d.main)) { const c = bp.cards.find((k) => k.id === id)?.color; if (c && !keep.has(c)) delete d.main[id]; } } } }],
  inkwell: [at(['resource', 'plays'], 'Ink per turn', [undefined, 2], ['1', '2']), at(['resource', 'faceDown'], 'Inked cards', [true, false], ['face down', 'face up'])],
  manaZone: [at(['resource', 'plays'], 'Cards per turn', [undefined, 2], ['1', '2']), at(['resource', 'faceDown'], 'Placed', [false, true], ['face up (its color)', 'face down (generic)'])],
  hiddenResources: [at(['resource', 'plays'], 'Cards per turn', [undefined, 2, 3], ['1', '2', '3'])],
  resDeck: [{ id: 'resource.deckSize', label: 'Resource deck size', values: [6, 8, 10, 12], get: (bp) => bp.resource.deckSize,
    set: (bp, v) => { bp.resource.deckSize = v; for (const d of bp.decks) if (d.res?.['resource-card'] !== undefined) d.res['resource-card'] = v; } }, at(['resource', 'perTurn'], 'Per turn', [1, 2, 3]), at(['resource', 'secondBonus'], 'Second player bonus', [undefined, 1, 2], ['none', '+1', '+2'])],
  attachEnergy: [at(['resource', 'plays'], 'Attachments per turn', [undefined, 2], ['1', '2']),
    { id: 'energy.copies', label: 'Energy cards per deck', values: [8, 12, 16], get: (bp) => bp.decks[0]?.main[bp.cards.find((c) => c.type === 'energy')?.id ?? ''],
      set: (bp, v) => { const id = bp.cards.find((c) => c.type === 'energy')?.id; if (id) for (const d of bp.decks) d.main[id] = v; } }],
  pitch: [at(['resource', 'actions'], 'Action points', [1, 2, 3]), at(['win', 'life'], 'Starting life', [20, 30, 40])],
  skillChecks: [at(['resource', 'checkStep'], 'Harder per card played', [undefined, 0, 2], ['+1', 'no', '+2']), at(['resource', 'failEnds'], 'A failed check ends the turn', [undefined, false], yes)],
  actionPoints: [at(['resource', 'actions'], 'Actions per turn', [2, 3, 4, 5]), at(['resource', 'spendAll'], 'Must spend them all', [undefined, true], ['No', 'Yes']), at(['resource', 'basicActions'], "'Draw' and 'take 1' actions", [undefined, true], ['No', 'Yes'])],
  levelGate: [at(['resource', 'levelGate'], 'Level gate', ['level', undefined], ['On', 'Off'])],
  energyNeed: [at(['resource', 'need'], 'Energy requirement', [{ stat: 'need', gen: 'gen' }, undefined], ['On', 'Off'])],
  boost: [at(['resource', 'boost'], 'Power per resource', [1, 2, 3, 500, 1000]), at(['resource', 'give'], 'Boosts are', [undefined, true], ['spent', 'given (main phase)'])],
  block: [at(['combat', 'maxBlockers'], 'Blockers per attacker', [undefined, 2, 3], ['1', '2', '3']), at(['combat', 'mass'], 'All attackers at once', [undefined, true], ['No', 'Yes'])],
  target: [at(['combat', 'targetUnits'], 'Can attack', ['any', 'exhausted'], ['any unit', 'exhausted units']), at(['combat', 'direct'], 'Attack the player', ['always', 'ifEmpty', 'never'], ['always', 'only with no units', 'never'])],
  compare: [at(['combat', 'compare', 'ties'], 'On a tie', ['both', 'defender', 'none'], ['both destroyed', 'defender wins', 'nothing']), at(['combat', 'compare', 'loser'], 'A losing attacker', [false, true], ['survives', 'is destroyed']), at(['combat', 'compare', 'overflow'], 'Excess hits the player', [false, true], ['No', 'Yes'])],
  positions: [at(['combat', 'compare', 'overflow'], 'Piercing (attack over defense)', [true, false], yes), at(['combat', 'firstTurnAttack'], 'Attacks on turn 1', [false, true], ['No', 'Yes']), at(['look', 'board', 'defenseSideways'], 'Defense drawn', [undefined, false], ['sideways', 'upright + DEF'])],
  quest: [at(['win', 'points'], 'Points to win', [10, 15, 20, 25]), at(['combat', 'targetUnits'], 'Can challenge', ['exhausted', 'any'], ['exhausted units', 'any unit'])],
  counterStep: [{ id: 'counter.size', label: 'Counter values', values: [1, 2, 3], names: ['normal', 'double', 'triple'],
    get: (bp) => { const c = unitCards(bp)[0]; return c ? Math.round((c.stats.counter ?? 0) / Math.max(1, Math.round(scale(bp) / 2))) : 1; },
    set: (bp, v: number) => unitCards(bp).forEach((c, i) => { c.stats.counter = i % 3 === 2 ? 0 : Math.max(1, Math.round(scale(bp) / (i % 3 === 0 ? 2 : 1))) * v; }) }],
  lifeTriggers: [at(['win', 'lifeTriggers'], 'Life-card triggers', [true, false], ['On', 'Off'])],
  twinArenas: [at(['combat', 'sameArena'], 'Fight only in your own arena', [true, false], yes)],
  lines: [at(['combat', 'arenas', 0, 'size'], 'Front line size', [3, 4, 5, 7]), at(['combat', 'arenas', 1, 'size'], 'Reserve size', [2, 4, 6])],
  lanes: [{ id: 'lanes.count', label: 'Battlefields', values: [2, 3], get: (bp) => bp.combat.lanes.length, set: (bp, v) => { const names = ['North Front', 'South Front', 'East Front']; bp.combat.lanes = names.slice(0, v); } },
    at(['win', 'points'], 'Points to win', [5, 8, 10, 12]), at(['combat', 'conquest'], 'Showdowns & conquest', [undefined, true], ['Off', 'On'])],
  duel: [at(['combat', 'benchSize'], 'Bench size', [3, 5, 8]), at(['combat', 'weakness'], 'Weakness', [1, 2], ['none', '×2']), at(['combat', 'attackEndsTurn'], 'Attacking ends the turn', [true, false], yes)],
  leader: [at(['combat', 'leaderAttacks'], 'Leader attacks', [true, false], yes), at(['combat', 'leaderDefends'], 'Leader defends with its power', [undefined, true], ['No', 'Yes'])],
  deployLeader: [at(['combat', 'leaderAttacks'], 'Leader attacks before deploying', [undefined, true], ['No', 'Yes'])],
  lifeCards: [at(['win', 'lifeCards'], 'Life cards', [3, 4, 5, 6, 8]), at(['win', 'lifeTriggers'], 'Triggers', [undefined, true], ['Off', 'On'])],
  shields: [at(['win', 'lifeCards'], 'Shields', [3, 5, 7]), at(['win', 'lifeTriggers'], 'Shield triggers', [true, false], ['On', 'Off'])],
  prizes: [at(['win', 'prizes'], 'Prize cards', [3, 4, 6]), at(['win', 'noUnits'], 'No units left loses', [true, false], yes)],
  lifeTotal: [at(['win', 'life'], 'Starting life', [10, 15, 20, 30, 40, 4000, 8000]), at(['combat', 'damage'], 'Damage on units', ['heal', 'persist'], ['heals each turn', 'stays'])],
  stack: [at(['combat', 'counterOnly'], 'Responses', [undefined, true], ['any time', 'only while defending']), at(['timing'], 'Style', ['stack', 'chain', 'alternate'], ['last in, first out', 'chain with speeds', 'alternating'])],
  chain: [at(['timing'], 'Style', ['chain', 'stack', 'alternate'], ['chain with speeds', 'last in, first out', 'alternating'])],
  alternate: [at(['timing'], 'Style', ['alternate', 'stack', 'chain'], ['alternating', 'last in, first out', 'chain with speeds'])],
  drawTo: [{ id: 'drawTo.n', label: 'Refill to', values: [3, 4, 5, 6, 7], get: (bp) => bp.turn.find((p) => p.drawTo)?.drawTo, set: (bp, v) => { const p = bp.turn.find((x) => x.drawTo); if (p) p.drawTo = v; } }],
  combatPhase: [at(['combat', 'firstTurnAttack'], 'Attacks on turn 1', [false, true], ['No', 'Yes'])],
  traps: [ofType('trap', 'speed3', 'Spring in response to', [undefined, true], ['attacks', 'anything']), ofType('trap', 'continuous', 'After springing', [undefined, true], ['discarded', 'stays face up'])],
  tribute: [{ id: 'tribute', label: 'Tributes', values: ['5:1,7:2', '4:1,6:2', '6:1', '3:1,5:2,7:3'], names: ['L5+: 1, L7+: 2', 'L4+: 1, L6+: 2', 'L6+: 1', 'L3: 1, L5: 2, L7: 3'],
    get: (bp) => bp.resource.tribute.map((t) => `${t.level}:${t.n}`).join(','), set: (bp, v: string) => { bp.resource.tribute = v.split(',').map((x) => { const [l, n] = x.split(':').map(Number); return { level: l, n }; }); } }],
  evolution: [at(['setup', 'noEvolveFirstTurn'], 'Evolve the turn a unit arrives', [undefined, true], ['Yes', 'No'])],
  extraDeck: [at(['setup', 'extraMax'], 'Extra deck size', [5, 10, 15])],
  gear: [ofType('attachment', 'perUnit', 'Gear per unit', [undefined, 1, 2], ['any', '1', '2']), ofType('attachment', 'equipment', 'When its unit leaves', [undefined, true], ['goes too', 'stays (re-equip)'])],
  songs: [at(['resource', 'songAny'], 'Who can sing', [undefined, true], ['cost at least the song', 'any ready unit'])],
  items: [ofType('permanent', 'perTurn', 'Items per turn', [undefined, 1, 2], ['any', '1', '2'])],
  keywordKit: [kwRule('haste', 'Haste', ['haste', 'rushUnits'], ['attacks anything at once', 'attacks units at once'])],
  growth: [{ id: 'growth.adds', label: 'Each counter gives', values: ['1/1', '1/0', '2/2'], names: ['+1/+1', '+1 power', '+2/+2'],
    get: (bp) => { const k = bp.counters?.find((x) => x.id === 'growth'); return k?.adds ? `${k.adds[pow(bp)] ?? 0}/${bp.combat.health ? k.adds[bp.combat.health] ?? 0 : 0}` : '1/1'; },
    set: (bp, v: string) => { const k = bp.counters?.find((x) => x.id === 'growth'); if (!k) return; const [a, b] = v.split('/').map(Number); k.adds = { [pow(bp)]: a, ...(bp.combat.health && b ? { [bp.combat.health]: b } : {}) }; } }],
  restrictions: [kwRule('elusive', 'Elusive units', ['unblockable', 'noBeAttacked'], ["can't be blocked", "can't be attacked"])],
  conditions: [{ id: 'stun.expires', label: 'Stun', values: [true, false], names: ['wears off after its turn', 'lasts until removed'],
      get: (bp) => !!bp.counters?.find((x) => x.id === 'stun')?.expires, set: (bp, v) => { const k = bp.counters?.find((x) => x.id === 'stun'); if (k) k.expires = v; } },
    { id: 'stun.stops', label: 'A stunned unit cannot', values: ['attack,block', 'attack', 'block'], names: ['attack or block', 'attack', 'block'],
      get: (bp) => bp.counters?.find((x) => x.id === 'stun')?.stops?.join(','), set: (bp, v: string) => { const k = bp.counters?.find((x) => x.id === 'stun'); if (k) k.stops = v.split(',') as any; } }],
  costReducer: [onCard('guild-charter', ['abilities', 0, 'do', 0, 'n'], 'Cost reduction', [1, 2])],
  prevention: [onCard('aegis-totem', ['abilities', 0, 'do', 0, 'n'], 'Damage prevented', [1, 2, 3])],
  banish: [onCard('grave-feaster', ['abilities', 0, 'banish'], 'Banish cost', [1, 2, 3])],
  places: [onCard('training-grounds', ['abilities', 0, 'do', 0, 'n'], 'Power for units at a place', [1, 2, 3]),
    { id: 'places.move', label: 'Move cost', values: [0, 1, 2], get: (bp) => bp.cards.find((c) => c.stats.move !== undefined)?.stats.move, set: (bp, v) => { for (const c of bp.cards) if (c.stats.move !== undefined) c.stats.move = v; } }],
  shift: [{ id: 'shift.off', label: 'Shift cost', values: [1, 2], names: ['cost − 1', 'cost − 2'],
    get: (bp) => { const c = bp.cards.find((k) => k.shift); return c ? (typeof c.cost === 'number' ? c.cost : 0) - c.shift! : 2; },
    set: (bp, v: number) => { for (const c of bp.cards) if (c.shift) c.shift = Math.max(1, (typeof c.cost === 'number' ? c.cost : 0) - v); } }],
  stadium: [{ id: 'stadium.global', label: 'Stadium', values: [true, false], names: ['one shared by both players', 'one for each player'],
    get: (bp) => bp.zones?.find((z) => z.id === 'stadium')?.global, set: (bp, v) => { const z = bp.zones?.find((x) => x.id === 'stadium'); if (z) z.global = v; } }],
  restore: [{ id: 'restore.n', label: 'Restore amount', values: [1, 2, 3, 5],
      get: (bp) => bp.cards.find((c) => c.keywords?.includes('restore'))?.kwv?.restore, set: (bp, v) => { for (const c of bp.cards) if (c.keywords?.includes('restore')) c.kwv = { ...c.kwv, restore: v }; } },
    { id: 'restore.when', label: 'Restore triggers', values: ['attack', 'play', 'startTurn'], names: ['when it attacks', 'when it is played', 'at the start of your turn'],
      get: (bp) => bp.keywords.find((k) => k.id === 'restore')?.abilities?.[0]?.when, set: (bp, v) => { const a = bp.keywords.find((k) => k.id === 'restore')?.abilities?.[0]; if (a) a.when = v; } }],
  zoneCombat: [at(['combat', 'nearBlock'], 'Block from the next zone', [undefined, 'full', 'none'], ['halves the damage', 'stops it all', 'does nothing']), { id: 'zone.speed', label: 'Attack speed', values: [0, 1, 2], names: ['normal', '+1 (harder to block)', '+2'],
      get: (bp) => { const c = bp.cards.find((k) => k.id === 'low-sweep'); return c ? (c.stats.speed ?? 4) - 4 : 0; },
      set: (bp, v: number) => { for (const [id, b] of [['low-sweep', 4], ['body-blow', 3], ['overhead-smash', 2]] as const) { const c = bp.cards.find((k) => k.id === id); if (c) c.stats.speed = b + v; } } }],
  worldClock: [{ id: 'clock.names', label: 'Cycle', values: ['Day,Night', 'Dawn,Day,Dusk,Night', 'Spring,Summer,Autumn,Winter', 'Calm,Storm'],
      get: (bp) => bp.clock?.names.join(','), set: (bp, v: string) => { if (!bp.clock) return; bp.clock.names = v.split(','); if (bp.clock.effect) bp.clock.effect.at = bp.clock.names.length - 1; for (const c of bp.cards) for (const a of c.abilities) if (a.if?.k === 'clock') a.if.n = bp.clock.names.length - 1; } },
    at(['clock', 'every'], 'Turns per time', [1, 2, 3]),
    { id: 'clock.effect', label: 'Last time of the cycle', values: ['+1', '-1', 'none'], names: ['units +1 power', 'units −1 power', 'no change'],
      get: (bp) => (!bp.clock?.effect ? 'none' : bp.clock.effect.n > 0 ? '+1' : '-1'),
      set: (bp, v: string) => { if (!bp.clock) return; if (v === 'none') delete bp.clock.effect; else bp.clock.effect = { at: bp.clock.names.length - 1, stat: pow(bp), n: (v === '+1' ? 1 : -1) * Math.max(1, Math.round(scale(bp) / 3)) }; } }],
  heat: [at(['heat', 'limit'], 'Overheat at', [3, 5, 7, 10]), at(['heat', 'per'], 'Heat per', ['card', 'cost'], ['card played', 'point of cost']),
    at(['heat', 'penalty'], 'Overheating', ['damage', 'discard', 'exhaust'], ['deals you damage', 'discards cards', 'exhausts your units']), at(['heat', 'cool'], 'Cools per turn', [1, 2, 3])],
  aging: [at(['aging', 'dies'], 'Crumbles at age', [undefined, 3, 4, 5, 6], ['never', '3', '4', '5', '6']),
    { id: 'aging.grow', label: 'Each turn of age', values: ['none', 'power'], names: ['no change', '+1 power'],
      get: (bp) => (bp.aging?.grow ? 'power' : 'none'), set: (bp, v) => { if (!bp.aging) return; if (v === 'none') delete bp.aging.grow; else bp.aging.grow = { stat: pow(bp), n: Math.max(1, Math.round(scale(bp) / 4)) }; } }],
  comeback: [at(['comeback', 'by'], 'Behind in', ['life', 'points', 'units']), at(['comeback', 'gap'], 'By at least', [2, 3, 5, 10]), at(['comeback', 'bonus'], 'Bonus', ['draw', 'resource', 'heal'], ['draw a card', '+1 resource', 'heal'])],
};
for (const r of RECIPES) r.opts = OPTS[r.id] ?? [];
/** Sets one recipe sub-option and keeps the starter decks legal. */
export function setRecipeOpt(bp: Blueprint, o: RecipeOpt, v: unknown): Blueprint { normalize(bp); o.set(bp, v); fitDecks(bp); return bp; }

export function applyRecipe(bp: Blueprint, id: string): Blueprint {
  normalize(bp);
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return bp;
  r.apply(bp);
  fitDecks(bp);
  bp.recipes = [...new Set([...(bp.recipes ?? []), id])];
  return bp;
}

/** "Surprise me": a playable game made by stacking random recipes (one per system), checked by the caller's build. */
export const RANDOM_PICKS: string[][] = [
  ['ramp', 'lands', 'inkwell', 'manaZone', 'hiddenResources', 'resDeck', 'pitch'],
  ['block', 'target', 'compare', 'positions', 'quest', 'twinArenas', 'lines', 'lanes'],
  ['lifeTotal', 'lifeCards', 'shields', 'prizes'],
  ['stack', 'chain', 'alternate', 'combatPhase', 'drawTo'],
  ['traps', 'tribute', 'evolution', 'extraDeck', 'gear', 'songs', 'items'],
  ['keywordKit', 'growth', 'restrictions', 'conditions', 'costReducer', 'prevention', 'restore', 'counterStep', 'boost', 'leader', 'banish', 'stadium'],
];
export function surpriseRecipes(seed: number): string[] {
  let x = (seed >>> 0) || 1;
  const rnd = (n: number) => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % n; };
  const out = RANDOM_PICKS.map((g) => g[rnd(g.length)]);
  if (out[0] === 'pitch' && out[1] === 'lanes') out[1] = 'target'; // attack cards need a battle window, which battlefields don't have
  const extra = RANDOM_PICKS[4 + rnd(2)];
  out.push(extra[rnd(extra.length)]);
  return [...new Set(out)];
}
