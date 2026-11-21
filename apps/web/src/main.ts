// App controller: owns the match, seats (human/AI), selection state and the AI loop. Rendering lives in render.ts.
import type { ActionCmd, Match, Mod, Reason, Template } from '#engine';
import { IllegalAction, commitAction, createMatch, determinize, listActions, observe, proposeAction, restore, serialize, submitDecision } from '#engine';
import { makeAgent, type Agent, type AgentInfo } from '#ai';
import { PackageError } from '#sdk';
import { MODULES, loadZipModule } from './modules.ts';
import { render } from './render.ts';

export type Seat = 'human' | 'heuristic' | 'random';
/** Choosing targets for an action template, or answering a pending decision. */
export interface Selection { tpl?: Template; slot: number; picks: Record<string, string[]> }
export interface UI {
  mod: Mod;
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
  fast: boolean;
  theme: 'auto' | 'light' | 'dark';
}

const SAVE_KEY = 'ucb-save';
const deckNames = (m: Mod) => Object.keys(m.decks ?? {});
function seatsFor(m: Mod, n = Math.max(2, m.rules.players.min)): { seats: Seat[]; decks: string[] } {
  const d = deckNames(m);
  return { seats: Array.from({ length: n }, (_, i) => (i === 0 ? 'human' : 'heuristic')), decks: Array.from({ length: n }, (_, i) => d[i % d.length]) };
}

const first = MODULES.values().next().value as Mod;
export const ui: UI = {
  mod: first, ...seatsFor(first), match: null, agents: [], viewer: 'p0', cover: null, sel: null, menu: null, note: null,
  inspect: null, fast: false, theme: 'auto',
};
(window as any).__ucb = ui; // test hook

let timer: ReturnType<typeof setTimeout> | undefined;
const seatOf = (p: string) => ui.seats[+p.slice(1)];
export const actor = (m: Match) => m.s.pending?.player ?? m.s.priority;

export const redraw = () => { decisionStart(); render(ui, actions); };

function advance() {
  clearTimeout(timer);
  ui.sel = null;
  ui.menu = null;
  const m = ui.match;
  if (!m || m.s.result) return redraw();
  const p = actor(m);
  if (!p) return redraw();
  if (seatOf(p) !== 'human') {
    redraw();
    timer = setTimeout(aiStep, ui.fast ? 0 : 450);
    return;
  }
  const humans = ui.seats.filter((s) => s === 'human').length;
  if (p !== ui.viewer) {
    if (humans > 1) ui.cover = p;
    ui.viewer = p;
  }
  redraw();
}

function aiStep() {
  const m = ui.match;
  if (!m || m.s.result) return;
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
    if (e instanceof IllegalAction) ui.note = { title: 'Not allowed', reason: e.reason };
    else ui.note = { title: 'Engine error', text: String(e) };
  }
  advance();
}

export const actions = {
  setModule(id: string) {
    ui.mod = MODULES.get(id)!;
    Object.assign(ui, seatsFor(ui.mod), { match: null, note: null, inspect: null });
    redraw();
  },
  setPlayers(n: number) { Object.assign(ui, seatsFor(ui.mod, n)); redraw(); },
  setSeat(i: number, s: Seat) { ui.seats[i] = s; ui.seats = [...ui.seats]; if (ui.match) advance(); else redraw(); },
  setDeck(i: number, d: string) { ui.decks[i] = d; redraw(); },
  newGame() {
    const seed = Math.floor(Math.random() * 1e9);
    try {
      ui.match = createMatch(ui.mod, { decks: ui.decks.map((d) => structuredClone(ui.mod.decks![d])), seed });
    } catch (e) {
      ui.note = { title: 'Cannot start', text: String((e as Error).message) };
      return redraw();
    }
    ui.agents = ui.seats.map((s, i) => makeAgent(s === 'random' ? 'random' : 'heuristic', seed + i));
    ui.viewer = `p${Math.max(0, ui.seats.indexOf('human'))}`;
    Object.assign(ui, { cover: null, note: null, inspect: null });
    advance();
  },
  reveal() { ui.cover = null; redraw(); },
  view(p: string) { if (ui.seats.every((s) => s !== 'human')) { ui.viewer = p; redraw(); } },
  /** Click on a card, player or stack item. */
  pick(id: string) {
    const m = ui.match;
    if (!m) return;
    ui.inspect = m.s.objects[id] ? id : ui.inspect;
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
      const pd = m.s.pending!;
      try { ui.match = submitDecision(m, ui.viewer, pd.id, sel.picks.$ ?? []); ui.note = null; } catch (e) { ui.note = { title: 'Not allowed', text: String((e as Error).message) }; }
      return advance();
    }
    if (sel.slot + 1 < sel.tpl.slots.length) { sel.slot++; return redraw(); }
    const cmd = { action: sel.tpl.action, source: sel.tpl.source, targets: sel.picks };
    const r = proposeAction(m, ui.viewer, cmd);
    if (!r.ok) { ui.note = { title: 'Not allowed', reason: r }; ui.sel = null; return redraw(); }
    commit(cmd);
  },
  cancel() { ui.sel = null; ui.menu = null; redraw(); },
  closeNote() { ui.note = null; redraw(); },
  setFast(f: boolean) { ui.fast = f; redraw(); },
  setTheme(t: UI['theme']) { ui.theme = t; redraw(); },
  save() {
    if (!ui.match) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ mod: ui.mod.manifest.moduleId, seats: ui.seats, decks: ui.decks, state: serialize(ui.match) }));
      ui.note = { title: 'Saved', text: 'Game saved in this browser.' };
    } catch (e) { ui.note = { title: 'Could not save', text: String(e) }; }
    redraw();
  },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (!d) throw new Error('No saved game.');
      const mod = MODULES.get(d.mod);
      if (!mod) throw new Error(`Module ${d.mod} is not loaded.`);
      ui.mod = mod;
      ui.seats = d.seats;
      ui.decks = d.decks;
      ui.match = restore(mod, d.state);
      ui.agents = ui.seats.map((s, i) => makeAgent(s === 'random' ? 'random' : 'heuristic', ui.match!.s.cmds.length * 31 + i));
      ui.note = null;
      ui.viewer = `p${Math.max(0, ui.seats.indexOf('human'))}`;
    } catch (e) { ui.note = { title: 'Could not load', text: String((e as Error).message) }; }
    advance();
  },
  async loadZip(file: File) {
    try {
      const mod = await loadZipModule(file);
      actions.setModule(mod.manifest.moduleId);
    } catch (e) {
      ui.note = { title: 'Invalid module', text: e instanceof PackageError ? e.errors.join('\n') : String(e) };
      redraw();
    }
  },
};

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

/** Why can't this card be used? Collects the engine's explanations for every action. */
function explain(m: Match, id: string): UI['note'] {
  const reasons = Object.keys(m.m.rules.actions)
    .map((a) => ({ a, r: proposeAction(m, ui.viewer, { action: a, source: id }) }))
    .filter((x) => x.r.code !== 'source');
  if (!reasons.length) return { title: m.m.card.get(m.s.objects[id].card)?.name ?? 'Card', text: 'No action can use this card right now.' };
  return { title: 'Why not?', reason: { ok: false, code: 'why', msg: 'This card cannot be used right now:', children: reasons.map((x) => x.r) } };
}

export function decisionStart() {
  const m = ui.match;
  if (m?.s.pending && m.s.pending.player === ui.viewer && seatOf(ui.viewer) === 'human' && !ui.cover && !ui.sel) ui.sel = { slot: 0, picks: {} };
}

redraw();
