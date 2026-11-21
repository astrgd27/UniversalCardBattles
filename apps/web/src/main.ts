// App controller: screens, the match, seats (human/AI), selections, saved games and custom decks.
// Rendering lives in ui/*.ts and only ever reads player views.
import type { ActionCmd, Deck, Match, Mod, Reason, Template } from '#engine';
import {
  IllegalAction, commitAction, createMatch, deckErrors, determinize, listActions, observe, proposeAction, restore, serialize, submitDecision,
} from '#engine';
import { makeAgent, type Agent, type AgentInfo } from '#ai';
import { PackageError } from '#sdk';
import { MODULES, loadZipModule } from './modules.ts';
import { render } from './ui/render.ts';

export type Seat = 'human' | 'heuristic' | 'random';
export type Screen = 'library' | 'home' | 'setup' | 'game' | 'decks' | 'gallery';
/** Choosing targets for an action template, or answering a pending decision. */
export interface Selection { tpl?: Template; slot: number; picks: Record<string, string[]> }
export interface DeckEdit { name: string; original: string | null; deck: Record<string, string[]>; section: string }
export interface UI {
  screen: Screen;
  mod: Mod | null;
  seats: Seat[];
  decks: string[];
  match: Match | null;
  agents: Agent[];
  viewer: string;
  cover: string | null; // hot-seat: waiting for this player to take the device
  sel: Selection | null;
  menu: { source: string; tpls: Template[] } | null;
  note: { title: string; reason?: Reason; text?: string } | null;
  inspect: string | null;
  drawer: 'log' | 'card' | 'pile' | null;
  pile: string | null; // zone key shown in the drawer
  paused: boolean;
  fast: boolean;
  theme: 'light' | 'dark';
  edit: DeckEdit | null;
  filter: string;
  gallery: string | null; // card id enlarged in the gallery
}

const SAVE = (id: string) => `ucb-save:${id}`;
const DECKS = (id: string) => `ucb-decks:${id}`;
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

export const customDecks = (m: Mod): Record<string, Deck> => store.get(DECKS(m.manifest.moduleId), {});
export const allDecks = (m: Mod): Record<string, Deck> => ({ ...(m.decks ?? {}), ...customDecks(m) });
export const hasSave = (m: Mod) => !!store.get(SAVE(m.manifest.moduleId), null);
export const sections = (m: Mod) => m.rules.format.zones?.map((z) => z.zone) ?? [m.rules.deckZone];
export const actor = (m: Match) => m.s.pending?.player ?? m.s.priority;

function seatsFor(m: Mod, n = Math.max(2, m.rules.players.min)): Pick<UI, 'seats' | 'decks'> {
  const d = Object.keys(allDecks(m));
  return { seats: Array.from({ length: n }, (_, i) => (i === 0 ? 'human' : 'heuristic')), decks: Array.from({ length: n }, (_, i) => d[i % d.length]) };
}

export const ui: UI = {
  screen: 'library', mod: null, seats: [], decks: [], match: null, agents: [], viewer: 'p0', cover: null, sel: null, menu: null,
  note: null, inspect: null, drawer: null, pile: null, paused: false, fast: false, theme: store.get<'light' | 'dark'>('ucb-theme', 'dark') === 'light' ? 'light' : 'dark', edit: null,
  filter: '', gallery: null,
};
(window as any).__ucb = ui; // test hook

let timer: ReturnType<typeof setTimeout> | undefined;
const seatOf = (p: string) => ui.seats[+p.slice(1)];
export const redraw = () => { decisionStart(); render(ui, actions); };

function advance() {
  clearTimeout(timer);
  ui.sel = null;
  ui.menu = null;
  const m = ui.match;
  if (!m || m.s.result || ui.paused) return redraw();
  const p = actor(m);
  if (!p) return redraw();
  if (seatOf(p) !== 'human') {
    redraw();
    timer = setTimeout(aiStep, ui.fast ? 0 : 500);
    return;
  }
  if (p !== ui.viewer) {
    if (ui.seats.filter((s) => s === 'human').length > 1) ui.cover = p;
    ui.viewer = p;
  }
  redraw();
}

function aiStep() {
  const m = ui.match;
  if (!m || m.s.result || ui.paused || ui.screen !== 'game') return;
  const p = actor(m)!;
  const agent = ui.agents[+p.slice(1)];
  const info: AgentInfo = { player: p, mod: m.m, sample: (seed) => determinize(m, p, seed) };
  try {
    if (m.s.pending) ui.match = submitDecision(m, p, m.s.pending.id, agent.decide(observe(m, p), info));
    else {
      let next: Match | null = null;
      for (let i = 0; !next && i < 20; i++) {
        try { next = commitAction(m, p, agent.act(observe(m, p), listActions(m, p), info)); } catch (e) { if (!(e instanceof IllegalAction)) throw e; }
      }
      ui.match = next ?? commitAction(m, p, { action: 'pass' });
    }
  } catch (e) {
    ui.note = { title: 'Engine error', text: String(e) };
    return redraw();
  }
  advance();
}

function commit(cmd: ActionCmd) {
  try {
    ui.match = commitAction(ui.match!, ui.viewer, cmd);
    ui.note = null;
  } catch (e) {
    ui.note = e instanceof IllegalAction ? { title: 'Not allowed', reason: e.reason } : { title: 'Engine error', text: String(e) };
  }
  advance();
}

function toggle(id: string) {
  const sel = ui.sel;
  if (!sel) return;
  const { options, max, key } = current(sel);
  if (!options.includes(id)) return;
  const l = sel.picks[key] ?? [];
  sel.picks[key] = l.includes(id) ? l.filter((x) => x !== id) : max === 1 ? [id] : l.length < max ? [...l, id] : l;
  redraw();
}

/** Options for the active step of a selection (action slot or pending decision). */
export function current(sel: Selection): { options: string[]; min: number; max: number; prompt: string; key: string } {
  if (sel.tpl) {
    const s = sel.tpl.slots[sel.slot];
    return { options: s.options, min: s.min, max: s.max, prompt: s.prompt, key: s.as };
  }
  const pd = ui.match!.s.pending!;
  return { options: pd.options, min: pd.min, max: pd.max, prompt: pd.prompt, key: '$' };
}

/** Why can't this card be used? The engine's explanations for every action. */
function explain(m: Match, id: string): UI['note'] {
  const reasons = Object.keys(m.m.rules.actions)
    .map((a) => proposeAction(m, ui.viewer, { action: a, source: id }))
    .filter((r) => r.code !== 'source');
  if (!reasons.length) return { title: m.m.card.get(m.s.objects[id].card)?.name ?? 'Card', text: 'No action can use this card right now.' };
  return { title: 'Why not?', reason: { ok: false, code: 'why', msg: 'This card cannot be used right now:', children: reasons } };
}

function decisionStart() {
  const m = ui.match;
  if (ui.screen === 'game' && m?.s.pending && m.s.pending.player === ui.viewer && seatOf(ui.viewer) === 'human' && !ui.cover && !ui.sel) {
    ui.sel = { slot: 0, picks: {} };
  }
}

function deckOf(m: Mod, name: string): Deck {
  return structuredClone(allDecks(m)[name]);
}

export const actions = {
  // ---- navigation ----
  go(screen: Screen) {
    clearTimeout(timer);
    Object.assign(ui, { screen, note: null, sel: null, menu: null, paused: false });
    if (screen === 'library') ui.mod = null;
    window.scrollTo(0, 0);
    redraw();
  },
  openModule(id: string) {
    ui.mod = MODULES.get(id)!;
    Object.assign(ui, seatsFor(ui.mod), { match: null, filter: '', gallery: null });
    actions.go('home');
  },
  async loadZip(file: File) {
    try {
      const mod = await loadZipModule(file);
      actions.openModule(mod.manifest.moduleId);
    } catch (e) {
      ui.note = { title: 'Invalid module', text: e instanceof PackageError ? e.errors.join('\n') : String(e) };
      redraw();
    }
  },
  setTheme(t: UI['theme']) { ui.theme = t; store.set('ucb-theme', t); redraw(); },
  closeNote() { ui.note = null; redraw(); },

  // ---- match setup ----
  setPlayers(n: number) { Object.assign(ui, seatsFor(ui.mod!, n)); redraw(); },
  setSeat(i: number, s: Seat) { ui.seats = ui.seats.map((x, j) => (j === i ? s : x)); if (ui.match && ui.screen === 'game') advance(); else redraw(); },
  setDeck(i: number, d: string) { ui.decks = ui.decks.map((x, j) => (j === i ? d : x)); redraw(); },
  setFast(f: boolean) { ui.fast = f; redraw(); },
  newGame() {
    const m = ui.mod!;
    const seed = Math.floor(Math.random() * 1e9);
    try {
      ui.match = createMatch(m, { decks: ui.decks.map((d) => deckOf(m, d)), seed });
    } catch (e) {
      ui.note = { title: 'Cannot start', text: String((e as Error).message) };
      return redraw();
    }
    ui.agents = ui.seats.map((s, i) => makeAgent(s === 'random' ? 'random' : 'heuristic', seed + i));
    ui.viewer = `p${Math.max(0, ui.seats.indexOf('human'))}`;
    Object.assign(ui, { screen: 'game', cover: null, note: null, inspect: null, drawer: null, pile: null, paused: false });
    advance();
  },
  continueGame() {
    const m = ui.mod!;
    try {
      const d = store.get<any>(SAVE(m.manifest.moduleId), null);
      if (!d) throw new Error('No saved game.');
      ui.seats = d.seats;
      ui.decks = d.decks;
      ui.match = restore(m, d.state);
      ui.agents = ui.seats.map((s, i) => makeAgent(s === 'random' ? 'random' : 'heuristic', ui.match!.s.cmds.length * 31 + i));
      ui.viewer = `p${Math.max(0, ui.seats.indexOf('human'))}`;
      Object.assign(ui, { screen: 'game', cover: null, note: null, inspect: null, drawer: null, paused: false });
    } catch (e) {
      ui.note = { title: 'Could not continue', text: String((e as Error).message) };
    }
    advance();
  },

  // ---- in game ----
  pause(on: boolean) { ui.paused = on; if (on) { clearTimeout(timer); redraw(); } else advance(); },
  save() {
    if (!ui.match) return;
    const ok = store.set(SAVE(ui.mod!.manifest.moduleId), { seats: ui.seats, decks: ui.decks, state: serialize(ui.match) });
    ui.note = ok ? { title: 'Game saved', text: 'Continue it later from the game menu.' } : { title: 'Could not save', text: 'Browser storage is unavailable.' };
    redraw();
  },
  quit() { if (ui.match?.s.result) store.del(SAVE(ui.mod!.manifest.moduleId)); ui.match = null; actions.go('home'); },
  rematch() { actions.newGame(); },
  reveal() { ui.cover = null; redraw(); },
  drawer(d: UI['drawer'], pile: string | null = null) { ui.drawer = ui.drawer === d && ui.pile === pile ? null : d; ui.pile = pile; redraw(); },
  view(p: string) { if (ui.seats.every((s) => s !== 'human')) { ui.viewer = p; redraw(); } },
  /** Click on a card, player or stack item. */
  pick(id: string) {
    const m = ui.match;
    if (!m) return;
    if (m.s.objects[id]) ui.inspect = id;
    if (ui.sel) return toggle(id);
    if (actor(m) !== ui.viewer || m.s.pending) return redraw();
    const tpls = listActions(m, ui.viewer).filter((t) => t.source === id);
    if (tpls.length === 1) return actions.start(tpls[0]);
    if (tpls.length > 1) { ui.menu = { source: id, tpls }; return redraw(); }
    const o = m.s.objects[id];
    if (o && o.controller === ui.viewer) ui.note = explain(m, id);
    redraw();
  },
  start(tpl: Template) {
    ui.menu = null;
    if (!tpl.slots.length) return commit({ action: tpl.action, source: tpl.source });
    ui.sel = { tpl, slot: 0, picks: {} };
    redraw();
  },
  choose(id: string) { toggle(id); },
  confirm() {
    const m = ui.match!;
    const sel = ui.sel!;
    if (!sel.tpl) {
      try { ui.match = submitDecision(m, ui.viewer, m.s.pending!.id, sel.picks.$ ?? []); ui.note = null; } catch (e) { ui.note = { title: 'Not allowed', text: String((e as Error).message) }; }
      return advance();
    }
    if (sel.slot + 1 < sel.tpl.slots.length) { sel.slot++; return redraw(); }
    const cmd = { action: sel.tpl.action, source: sel.tpl.source, targets: sel.picks };
    const r = proposeAction(m, ui.viewer, cmd);
    if (!r.ok) { ui.note = { title: 'Not allowed', reason: r }; ui.sel = null; return redraw(); }
    commit(cmd);
  },
  cancel() { ui.sel = null; ui.menu = null; redraw(); },

  // ---- deckbuilder & gallery ----
  editDeck(name: string | null) {
    const m = ui.mod!;
    const secs = sections(m);
    const src = name ? allDecks(m)[name] : null;
    const deck: Record<string, string[]> = Object.fromEntries(secs.map((z) => [z, []]));
    if (src) Object.assign(deck, structuredClone(Array.isArray(src) ? { [secs[0]]: src } : src));
    const custom = !!name && name in customDecks(m);
    ui.edit = { name: name ? (custom ? name : `${name} (copy)`) : 'New deck', original: custom ? name : null, deck, section: secs[0] };
    actions.go('decks');
  },
  setSection(z: string) { ui.edit!.section = z; redraw(); },
  rename(n: string) { ui.edit!.name = n; redraw(); },
  addCard(id: string) { const e = ui.edit!; e.deck[e.section] = [...e.deck[e.section], id]; redraw(); },
  removeCard(id: string, section?: string) {
    const e = ui.edit!;
    const z = section ?? e.section;
    const i = e.deck[z].lastIndexOf(id);
    if (i >= 0) e.deck[z] = e.deck[z].filter((_, j) => j !== i);
    redraw();
  },
  saveDeck() {
    const m = ui.mod!;
    const e = ui.edit!;
    const name = e.name.trim();
    const secs = sections(m);
    const deck: Deck = secs.length === 1 && !m.rules.format.zones ? e.deck[secs[0]] : e.deck;
    const errs = deckErrors(m, deck);
    if (!name || (name in (m.decks ?? {}))) { ui.note = { title: 'Choose another name', text: 'Built-in deck names are reserved.' }; return redraw(); }
    if (errs.length) { ui.note = { title: 'Deck is not legal yet', text: errs.join('\n') }; return redraw(); }
    const all = customDecks(m);
    if (e.original && e.original !== name) delete all[e.original];
    all[name] = deck;
    store.set(DECKS(m.manifest.moduleId), all);
    e.original = name;
    ui.note = { title: 'Deck saved', text: `"${name}" is ready to play.` };
    redraw();
  },
  deleteDeck(name: string) {
    const m = ui.mod!;
    const all = customDecks(m);
    delete all[name];
    store.set(DECKS(m.manifest.moduleId), all);
    ui.decks = ui.decks.map((d) => (d === name ? Object.keys(allDecks(m))[0] : d));
    if (ui.edit?.original === name) ui.edit = null;
    redraw();
  },
  setFilter(f: string) { ui.filter = f; redraw(); },
  enlarge(id: string | null) { ui.gallery = id; redraw(); },
};

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (ui.gallery) actions.enlarge(null);
  else if (ui.sel || ui.menu) actions.cancel();
  else if (ui.screen === 'game' && ui.match && !ui.match.s.result) actions.pause(!ui.paused);
});
redraw();
