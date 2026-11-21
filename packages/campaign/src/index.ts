// Single-player campaign runtime. Lives outside the match engine: an encounter becomes an ordinary MatchOpts
// (with a validated scenario), and results come back as a match Result. Profiles are plain JSON.
import type { Deck, MatchOpts, Mod, ModuleDef, Result, Scenario, View } from '#engine';
import { deckErrors, rand, seedRng, validateScenario } from '#engine';
import { heuristicAgent, randomAgent, type Agent } from '#ai';

export interface Line { speaker: string; text: string }
export interface Reward { currency?: number; cards?: string[]; packs?: string[] }
export interface Encounter {
  name: string;
  opponent: string;
  portrait?: string;
  deck: string; // a campaign deck or a module deck
  ai?: { kind?: 'heuristic' | 'random'; bias?: Record<string, number>; phaseVar?: string; phases?: Record<string, { bias?: Record<string, number> }> };
  intro?: Line[];
  outro?: Line[];
  defeat?: Line[];
  scenario?: Scenario;
  rewards?: { first?: Reward; repeat?: Reward };
  repeatable?: boolean;
  requires?: string[];
}
export interface Booster { name: string; slots: { count: number; pool: string[]; weights?: Record<string, number> }[] }
export interface ShopItem { id: string; name: string; price: number; booster?: string; card?: string; stock?: number }
export interface Campaign {
  name: string;
  intro?: Line[];
  currency: { name: string; start: number };
  starter: { collection: Record<string, number>; decks: Record<string, Deck> };
  decks?: Record<string, Deck>;
  chapters: { id: string; name: string; nodes: string[] }[];
  encounters: Record<string, Encounter>;
  boosters?: Record<string, Booster>;
  shop?: ShopItem[];
}
export const PROFILE_VERSION = 1;
export interface Profile {
  v: number; // profile format version (see migrateProfile)
  module: string;
  currency: number;
  collection: Record<string, number>;
  decks: Record<string, Deck>;
  wins: Record<string, number>;
  bought: Record<string, number>;
  ledger: string[]; // idempotency keys of applied rewards and purchases
  seq: number;
  seed: number;
  active: { encounter: string; seq: number } | null;
}
export class CampaignError extends Error {
  reasons: string[];
  constructor(reasons: string[]) { super(reasons.join('; ')); this.reasons = reasons; }
}

export const campaignOf = (m: Mod | ModuleDef): Campaign | undefined => (m as any).campaign;
const cardsOf = (d: Deck) => Object.values(Array.isArray(d) ? { deck: d } : d).flat();
const countOf = (l: string[]) => l.reduce<Record<string, number>>((a, c) => ((a[c] = (a[c] ?? 0) + 1), a), {});
const add = (col: Record<string, number>, cards: string[]) => { for (const c of cards) col[c] = (col[c] ?? 0) + 1; };

export function validateCampaign(m: Mod, c: Campaign): string[] {
  try {
    return checkCampaign(m, c);
  } catch (e) {
    return [`campaign: malformed data (${(e as Error).message})`]; // safety net: validation never throws
  }
}

function checkCampaign(m: Mod, c: Campaign): string[] {
  const e: string[] = [];
  const rec = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x: unknown): x is any[] => Array.isArray(x);
  const card = (id: unknown, where: string) => { if (typeof id !== 'string' || !m.card.has(id)) e.push(`${where}: unknown card "${id}"`); };
  const lines = (l: unknown, where: string) => {
    if (l !== undefined && !(arr(l) && l.every((x) => rec(x) && typeof x.speaker === 'string' && typeof x.text === 'string'))) e.push(`${where}: must be [{speaker, text}]`);
  };
  if (!rec(c)) return ['campaign: must be an object'];
  if (typeof c.name !== 'string' || !c.name) e.push('campaign/name: required');
  lines(c.intro, 'campaign/intro');
  if (!rec(c.currency) || typeof c.currency.name !== 'string' || !(Number.isInteger(c.currency.start) && c.currency.start >= 0)) e.push('campaign/currency: needs {name, start}');
  if (!rec(c.starter) || !rec(c.starter.collection) || !rec(c.starter.decks)) return [...e, 'campaign/starter: needs {collection, decks}'];
  for (const [id, n] of Object.entries(c.starter.collection)) {
    card(id, 'campaign/starter/collection');
    if (!Number.isInteger(n) || (n as number) < 0) e.push(`campaign/starter/collection/${id}: bad count`);
  }
  if (!Object.keys(c.starter.decks).length) e.push('campaign/starter/decks: at least one deck');
  for (const [name, d] of Object.entries(c.starter.decks)) {
    const errs = deckErrors(m, d);
    for (const x of errs) e.push(`campaign/starter/decks/${name}: ${x}`);
    if (!errs.length) for (const x of ownedErrors(c.starter.collection, d)) e.push(`campaign/starter/decks/${name}: ${x}`);
  }
  if (c.decks !== undefined && !rec(c.decks)) e.push('campaign/decks: must be an object');
  const extra = rec(c.decks) ? c.decks : {};
  for (const [name, d] of Object.entries(extra)) for (const x of deckErrors(m, d)) e.push(`campaign/decks/${name}: ${x}`);
  const decks = { ...(m.decks ?? {}), ...extra };
  const encs = rec(c.encounters) ? c.encounters : (e.push('campaign/encounters: must be an object'), {});
  const boosters = rec(c.boosters) ? c.boosters : {};
  if (!arr(c.chapters)) e.push('campaign/chapters: must be a list');
  else for (const ch of c.chapters) {
    if (!rec(ch) || typeof ch.id !== 'string' || !arr(ch.nodes)) { e.push('campaign/chapters: each needs {id, name, nodes}'); continue; }
    for (const n of ch.nodes) if (typeof n !== 'string' || !encs[n]) e.push(`campaign/chapters/${ch.id}: unknown encounter "${n}"`);
  }
  const reward = (r: unknown, where: string) => {
    if (r === undefined) return;
    if (!rec(r)) { e.push(`${where}: must be an object`); return; }
    if (r.currency !== undefined && !(Number.isInteger(r.currency) && r.currency >= 0)) e.push(`${where}/currency: must be a non-negative integer`);
    if (r.cards !== undefined) (arr(r.cards) ? r.cards : [null]).forEach((x: unknown) => card(x, where));
    if (r.packs !== undefined) (arr(r.packs) ? r.packs : [null]).forEach((p: unknown) => { if (typeof p !== 'string' || !boosters[p]) e.push(`${where}: unknown booster "${p}"`); });
  };
  for (const [id, en] of Object.entries(encs)) {
    const w = `campaign/encounters/${id}`;
    if (!rec(en)) { e.push(`${w}: must be an object`); continue; }
    if (typeof en.name !== 'string' || typeof en.opponent !== 'string') e.push(`${w}: needs name and opponent`);
    if (typeof en.deck !== 'string' || !decks[en.deck]) e.push(`${w}: unknown deck "${en.deck}"`);
    if (en.requires !== undefined && !arr(en.requires)) e.push(`${w}/requires: must be a list`);
    (arr(en.requires) ? en.requires : []).forEach((r: unknown) => { if (typeof r !== 'string' || !encs[r]) e.push(`${w}: requires unknown encounter "${r}"`); });
    lines(en.intro, `${w}/intro`); lines(en.outro, `${w}/outro`); lines(en.defeat, `${w}/defeat`);
    if (en.ai !== undefined && !rec(en.ai)) e.push(`${w}/ai: must be an object`);
    if (en.scenario !== undefined) for (const x of validateScenario(m, en.scenario)) e.push(`${w}/${x}`);
    if (en.rewards !== undefined && !rec(en.rewards)) e.push(`${w}/rewards: must be an object`);
    else { reward(en.rewards?.first, `${w}/rewards/first`); reward(en.rewards?.repeat, `${w}/rewards/repeat`); }
  }
  for (const [id, b] of Object.entries(boosters)) {
    if (!rec(b) || !arr(b.slots)) { e.push(`campaign/boosters/${id}: needs {name, slots}`); continue; }
    for (const s of b.slots) {
      if (!rec(s) || !(Number.isInteger(s.count) && s.count >= 0) || !arr(s.pool) || !s.pool.length) { e.push(`campaign/boosters/${id}: each slot needs {count, pool}`); continue; }
      s.pool.forEach((x: unknown) => card(x, `campaign/boosters/${id}`));
      if (s.weights !== undefined && !(rec(s.weights) && Object.values(s.weights).every((w) => typeof w === 'number' && w >= 0))) e.push(`campaign/boosters/${id}: weights must be non-negative numbers`);
    }
  }
  if (c.shop !== undefined && !arr(c.shop)) e.push('campaign/shop: must be a list');
  for (const it of arr(c.shop) ? c.shop : []) {
    if (!rec(it) || typeof it.id !== 'string') { e.push('campaign/shop: each item needs an id'); continue; }
    if (!(Number.isInteger(it.price) && it.price >= 0)) e.push(`campaign/shop/${it.id}: bad price`);
    if (it.card !== undefined) card(it.card, `campaign/shop/${it.id}`);
    if (it.booster !== undefined && (typeof it.booster !== 'string' || !boosters[it.booster])) e.push(`campaign/shop/${it.id}: unknown booster "${it.booster}"`);
    if ((it.card === undefined) === (it.booster === undefined)) e.push(`campaign/shop/${it.id}: needs exactly one of card or booster`);
  }
  return e;
}

export function newProfile(m: Mod, c: Campaign, seed: number): Profile {
  return {
    v: PROFILE_VERSION, module: m.manifest.moduleId, currency: c.currency.start, collection: { ...c.starter.collection }, decks: structuredClone(c.starter.decks),
    wins: {}, bought: {}, ledger: [], seq: 0, seed: seed >>> 0, active: null,
  };
}

/** Cards a deck needs beyond what the collection holds. */
export function ownedErrors(collection: Record<string, number>, deck: Deck): string[] {
  return Object.entries(countOf(cardsOf(deck))).filter(([id, n]) => n > (collection[id] ?? 0)).map(([id, n]) => `needs ${n}× ${id}, you own ${collection[id] ?? 0}`);
}

export function nodeState(c: Campaign, p: Profile, id: string): 'locked' | 'open' | 'won' {
  if (p.wins[id]) return 'won';
  return (c.encounters[id].requires ?? []).every((r) => p.wins[r]) ? 'open' : 'locked';
}

/** Validates and starts an encounter: returns match options (with the scenario) and the profile marked active. */
export function startEncounter(m: Mod, c: Campaign, p: Profile, id: string, deckName: string, seed: number): { profile: Profile; opts: MatchOpts } {
  const en = c.encounters[id];
  if (!en) throw new CampaignError([`unknown encounter "${id}"`]);
  const errs: string[] = [];
  const state = nodeState(c, p, id);
  if (state === 'locked') errs.push(`${en.name} is locked`);
  if (state === 'won' && !en.repeatable) errs.push(`${en.name} cannot be replayed`);
  const deck = p.decks[deckName];
  if (!deck) errs.push(`you have no deck "${deckName}"`);
  else errs.push(...deckErrors(m, deck), ...ownedErrors(p.collection, deck));
  if (errs.length) throw new CampaignError(errs);
  const foe = structuredClone({ ...(m.decks ?? {}), ...(c.decks ?? {}) }[en.deck]);
  const profile = { ...structuredClone(p), seq: p.seq + 1, active: { encounter: id, seq: p.seq + 1 } };
  return { profile, opts: { decks: [structuredClone(deck), foe], seed, ...(en.scenario ? { scenario: en.scenario } : {}) } };
}

/** The opponent's agent: heuristic or random, with per-phase biases switched by a game var (boss phases). */
export function encounterAgent(en: Encounter, seed: number): Agent {
  if (en.ai?.kind === 'random') return randomAgent(seed);
  const base = heuristicAgent(seed, { bias: en.ai?.bias });
  const phased = new Map<string, Agent>();
  const pick = (v: View) => {
    const ph = en.ai?.phaseVar ? String(v.vars[en.ai.phaseVar] ?? '') : '';
    const cfg = en.ai?.phases?.[ph];
    if (!cfg) return base;
    if (!phased.has(ph)) phased.set(ph, heuristicAgent(seed + ph.length * 7919, { bias: { ...(en.ai?.bias ?? {}), ...(cfg.bias ?? {}) } }));
    return phased.get(ph)!;
  };
  return { act: (v, t, i) => pick(v).act(v, t, i), decide: (v, i) => pick(v).decide(v, i) };
}

export function openBooster(c: Campaign, id: string, rng: number[]): string[] {
  const b = c.boosters?.[id];
  if (!b) throw new CampaignError([`unknown booster "${id}"`]);
  const out: string[] = [];
  for (const s of b.slots) {
    const w = s.pool.map((x) => s.weights?.[x] ?? 1);
    const total = w.reduce((a, x) => a + x, 0);
    for (let k = 0; k < s.count; k++) {
      let r = rand(rng) * total;
      let i = 0;
      while (r >= w[i] && i < w.length - 1) { r -= w[i]; i++; }
      out.push(s.pool[i]);
    }
  }
  return out;
}

function grant(c: Campaign, p: Profile, r: Reward, rng: number[]): { currency: number; cards: string[]; packs: { id: string; cards: string[] }[] } {
  const packs = (r.packs ?? []).map((id) => ({ id, cards: openBooster(c, id, rng) }));
  const cards = [...(r.cards ?? []), ...packs.flatMap((x) => x.cards)];
  p.currency += r.currency ?? 0;
  add(p.collection, cards);
  return { currency: r.currency ?? 0, cards: r.cards ?? [], packs };
}
export type Granted = ReturnType<typeof grant>;

/**
 * Applies an encounter result exactly once per (encounter, attempt seq). Calling it again for the same attempt
 * (e.g. after a reload) changes nothing and returns granted = null.
 */
export function finishEncounter(c: Campaign, p: Profile, id: string, seq: number, result: Result, player = 'p0'): { profile: Profile; won: boolean; granted: Granted | null } {
  const won = result.winners.includes(player);
  const key = `enc:${id}:${seq}`;
  if (p.ledger.includes(key)) return { profile: p, won, granted: null };
  const np = structuredClone(p);
  np.ledger.push(key);
  if (np.active?.encounter === id && np.active.seq === seq) np.active = null;
  let granted: Granted | null = null;
  if (won) {
    const en = c.encounters[id];
    const r = np.wins[id] ? en.rewards?.repeat : en.rewards?.first;
    np.wins[id] = (np.wins[id] ?? 0) + 1;
    if (r) granted = grant(c, np, r, seedRng((np.seed ^ (seq * 2654435761)) >>> 0));
  }
  return { profile: np, won, granted };
}

export function buy(c: Campaign, p: Profile, itemId: string): { profile: Profile; cards: string[] } {
  const it = c.shop?.find((x) => x.id === itemId);
  if (!it) throw new CampaignError([`unknown shop item "${itemId}"`]);
  const errs: string[] = [];
  if (p.currency < it.price) errs.push(`not enough ${c.currency.name} (${p.currency}/${it.price})`);
  if (it.stock !== undefined && (p.bought[it.id] ?? 0) >= it.stock) errs.push(`${it.name} is sold out`);
  if (errs.length) throw new CampaignError(errs);
  const np = structuredClone(p);
  np.seq++;
  np.ledger.push(`shop:${it.id}:${np.seq}`);
  np.currency -= it.price;
  np.bought[it.id] = (np.bought[it.id] ?? 0) + 1;
  const cards = it.card ? [it.card] : openBooster(c, it.booster!, seedRng((np.seed ^ (np.seq * 40503)) >>> 0));
  add(np.collection, cards);
  return { profile: np, cards };
}


const isRec = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const isCounts = (x: unknown) => isRec(x) && Object.values(x).every((n) => Number.isInteger(n) && (n as number) >= 0);
const isDeck = (d: unknown) => (Array.isArray(d) && d.every((c) => typeof c === 'string')) || (isRec(d) && Object.values(d).every((l) => Array.isArray(l) && l.every((c) => typeof c === 'string')));

/**
 * Upgrades a stored profile to the current format and checks its shape. Throws CampaignError if it is not a profile.
 * v0 (unversioned) profiles get the fields added in later versions with safe defaults.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!isRec(raw)) throw new CampaignError(['profile must be an object']);
  const p: Record<string, any> = { ...raw };
  if (p.v === undefined) p.v = 0;
  if (typeof p.v !== 'number' || p.v > PROFILE_VERSION) throw new CampaignError([`unsupported profile version ${p.v}`]);
  if (p.v < 1) { p.bought ??= {}; p.active ??= null; p.v = 1; }
  const errs: string[] = [];
  if (typeof p.module !== 'string') errs.push('module missing');
  if (!(Number.isInteger(p.currency) && p.currency >= 0)) errs.push('currency must be a non-negative integer');
  if (!isCounts(p.collection)) errs.push('collection must map card ids to counts');
  if (!isRec(p.decks) || !Object.values(p.decks).every(isDeck)) errs.push('decks are malformed');
  if (!isCounts(p.wins) || !isCounts(p.bought)) errs.push('wins/bought must map ids to counts');
  if (!Array.isArray(p.ledger) || !p.ledger.every((k: unknown) => typeof k === 'string')) errs.push('ledger must be a list of strings');
  if (!Number.isInteger(p.seq) || !Number.isInteger(p.seed)) errs.push('seq/seed must be integers');
  if (p.active !== null && !(isRec(p.active) && typeof p.active.encounter === 'string' && Number.isInteger(p.active.seq))) errs.push('active is malformed');
  if (errs.length) throw new CampaignError(errs);
  return p as Profile;
}
