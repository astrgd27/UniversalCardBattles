// App controller: screens, the match, seats (human/AI), selections, saved games and custom decks.
// Rendering lives in ui/*.ts and only ever reads player views.
import type { ActionCmd, Deck, Match, Mod, Reason, Template } from '#engine';
import {
  IllegalAction, commitAction, createMatch, deckErrors, determinize, listActions, observe, proposeAction, restore, serialize, setExternal, submitDecision,
} from '#engine';
import { clearCustomArt, loadCustomArt, setCustomArt } from './art.ts';
import { type SortKey, deckFromText, deckToText, toggleToken } from './search.ts';
import { makeAgent, type Agent, type AgentInfo } from '#ai';
import {
  type Campaign, type Granted, type Line, type Profile, CampaignError, buy, campaignOf, encounterAgent, finishEncounter, migrateProfile, newProfile,
  ownedErrors, startEncounter,
} from '#campaign';
import { makeBackup, readBackup } from './backup.ts';
import { connectSync, initSync, openStore, persistStorage, store, sync, unlinkSync, usage } from './storage.ts';
import { PackageError } from '#sdk';
import { MODULES, loadZipModule } from './modules.ts';
import { render } from './ui/render.ts';

export type Seat = 'human' | 'heuristic' | 'random';
export type Screen = 'library' | 'home' | 'setup' | 'game' | 'decks' | 'gallery' | 'campaign' | 'encounter' | 'reward' | 'shop' | 'saves';
/** Choosing targets for an action template, or answering a pending decision. */
export interface Selection { tpl?: Template; slot: number; picks: Record<string, string[]> }
export interface DeckEdit { name: string; original: string | null; deck: Record<string, string[]>; section: string; campaign?: boolean }
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
  profile: Profile | null; // campaign profile of the open module
  camp: { enc: string; seq: number } | null; // campaign encounter being played
  encounter: string | null; // encounter selected on the map
  campDeck: string;
  dialog: { lines: Line[]; i: number } | null;
  dialogSeen: number; // last in-match dialogue event acknowledged
  reward: { won: boolean; granted: Granted | null; lines: Line[]; enc: string } | null;
  reveal: string[] | null; // cards from a purchase being revealed
  sort: SortKey;
  sample: string[] | null; // sample opening hand in the deckbuilder
  io: { mode: 'import' | 'export'; text: string; errors: string[] } | null; // deck text dialog
  fxFrom: number; // first event not yet animated
  counts: Record<string, number>; // zone sizes at the last render (pile bumps)
}

const PROFILE = (id: string) => `ucb-profile:${id}`;
const DECKS = (id: string) => `ucb-decks:${id}`;
/** Save slots: ucb-slot:<module>:<slot>; "auto" is the autosave, others are manual saves. */
const SLOT = (id: string, slot: string) => `ucb-slot:${id}:${slot}`;
const MAX_SLOTS = 20;
export interface SlotInfo { key: string; slot: string; name: string; savedAt: string; turn: number; seats: Seat[]; auto: boolean; camp: boolean }
export function slots(m: Mod): SlotInfo[] {
  const pre = `ucb-slot:${m.manifest.moduleId}:`;
  return store.keys(pre).map((key) => {
    const d = store.get<any>(key, {});
    return { key, slot: key.slice(pre.length), name: d.name ?? 'Saved game', savedAt: d.savedAt ?? '', turn: d.turn ?? 0, seats: d.seats ?? [], auto: key.endsWith(':auto'), camp: !!d.camp };
  }).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
/** Older versions kept one save per game under ucb-save:<module>; turn those into manual slots. */
function migrateLegacySaves() {
  for (const k of store.keys('ucb-save:')) {
    const d = store.get<any>(k, null);
    const id = k.slice('ucb-save:'.length);
    if (d) store.set(SLOT(id, `s${Date.now().toString(36)}`), { name: 'Saved game', savedAt: new Date(0).toISOString(), turn: 0, ...d });
    store.del(k);
  }
}
function slotData(name: string) {
  return { name, savedAt: new Date().toISOString(), turn: ui.match!.s.turn.n, seats: ui.seats, decks: ui.decks, camp: ui.camp, state: serialize(ui.match!) };
}
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let autoAt = '';
const autoKey = (m: Match) => `${m.s.opts.seed}:${m.s.cmds.length}`;
/** Writes the autosave now (a finished match clears it instead). */
function autosaveNow() {
  clearTimeout(autoTimer);
  autoTimer = undefined;
  const m = ui.match;
  if (!m || !ui.mod || autoKey(m) === autoAt) return;
  autoAt = autoKey(m);
  if (m.s.result) store.del(SLOT(ui.mod.manifest.moduleId, 'auto'));
  else store.set(SLOT(ui.mod.manifest.moduleId, 'auto'), slotData('Autosave'));
}
/** Autosave at most about once a second while a match is being played. */
function autosave() {
  const m = ui.match;
  if (!m || !ui.mod || ui.screen !== 'game' || autoKey(m) === autoAt || autoTimer) return;
  autoTimer = setTimeout(autosaveNow, 800);
}

export const customDecks = (m: Mod): Record<string, Deck> => store.get(DECKS(m.manifest.moduleId), {});
export const allDecks = (m: Mod): Record<string, Deck> => ({ ...(m.decks ?? {}), ...customDecks(m) });
export const hasSave = (m: Mod) => slots(m).length > 0;
export const sections = (m: Mod) => m.rules.format.zones?.map((z) => z.zone) ?? [m.rules.deckZone];
export const actor = (m: Match) => m.s.pending?.player ?? m.s.priority;

function seatsFor(m: Mod, n = Math.max(2, m.rules.players.min)): Pick<UI, 'seats' | 'decks'> {
  const d = Object.keys(allDecks(m));
  return { seats: Array.from({ length: n }, (_, i) => (i === 0 ? 'human' : 'heuristic')), decks: Array.from({ length: n }, (_, i) => d[i % d.length]) };
}

export const ui: UI = {
  screen: 'library', mod: null, seats: [], decks: [], match: null, agents: [], viewer: 'p0', cover: null, sel: null, menu: null,
  note: null, inspect: null, drawer: null, pile: null, paused: false, fast: false, theme: store.get<'light' | 'dark'>('ucb-theme', 'dark') === 'light' ? 'light' : 'dark', edit: null,
  filter: '', gallery: null, profile: null, camp: null, encounter: null, campDeck: '', dialog: null, dialogSeen: -1, reward: null, reveal: null, fxFrom: 0, counts: {}, sort: 'cost', sample: null, io: null,
};
(window as any).__ucb = ui; // test hook

let timer: ReturnType<typeof setTimeout> | undefined;
const seatOf = (p: string) => ui.seats[+p.slice(1)];
export const redraw = () => { decisionStart(); autosave(); render(ui, actions); };

function advance() {
  clearTimeout(timer);
  ui.sel = null;
  ui.menu = null;
  const m = ui.match;
  if (!m || m.s.result || ui.paused) return redraw();
  const p = actor(m);
  if (!p || pendingDialogue()) return redraw();
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
  const { options, max, key, divide } = current(sel);
  if (!options.includes(id)) return;
  const l = sel.picks[key] ?? [];
  // Dividing: each tap assigns one more point to that recipient.
  if (divide) { if (l.length < max) sel.picks[key] = [...l, id]; return redraw(); }
  sel.picks[key] = l.includes(id) ? l.filter((x) => x !== id) : max === 1 ? [id] : l.length < max ? [...l, id] : l;
  redraw();
}

/** Options for the active step of a selection (action slot or pending decision). */
export function current(sel: Selection): { options: string[]; min: number; max: number; prompt: string; key: string; divide?: boolean } {
  if (sel.tpl) {
    const s = sel.tpl.slots[sel.slot];
    return { options: s.options, min: s.min, max: s.max, prompt: s.prompt, key: s.as };
  }
  const pd = ui.match!.s.pending!;
  return { options: pd.options, min: pd.min, max: pd.max, prompt: pd.prompt, key: '$', divide: pd.kind === 'divide' };
}

/** Why can't this card be used? The engine's explanations for every action. */
function explain(m: Match, id: string): UI['note'] {
  const card = m.m.card.get(m.s.objects[id].card) as any;
  const names = Object.entries(m.m.rules.actions).flatMap(([a, d]) => (d.activated ? ((card?.[d.activated] ?? []) as unknown[]).map((_, i) => `${a}#${i}`) : [a]));
  const reasons = names
    .map((a) => proposeAction(m, ui.viewer, { action: a, source: id }))
    .filter((r) => r.code !== 'source' && r.code !== 'unknown');
  if (!reasons.length) return { title: m.m.card.get(m.s.objects[id].card)?.name ?? 'Card', text: 'No action can use this card right now.' };
  return { title: 'Why not?', reason: { ok: false, code: 'why', msg: 'This card cannot be used right now:', children: reasons } };
}

function decisionStart() {
  const m = ui.match;
  if (ui.screen === 'game' && m?.s.pending && m.s.pending.player === ui.viewer && seatOf(ui.viewer) === 'human' && !ui.cover && !ui.sel) {
    ui.sel = { slot: 0, picks: {} };
  }
}

/** Latest in-match dialogue event the player has not acknowledged yet (scenario `emit dialogue`). */
export function pendingDialogue(): { seq: number; speaker: string; text: string } | null {
  const ev = ui.match?.s.events;
  if (!ev) return null;
  for (let i = ev.length - 1; i > ui.dialogSeen; i--) if (ev[i].type === 'dialogue') return ev[i] as any;
  return null;
}
export const campaign = (): Campaign | undefined => (ui.mod ? campaignOf(ui.mod) : undefined);
function saveProfile() { if (ui.mod && ui.profile) store.set(PROFILE(ui.mod.manifest.moduleId), ui.profile); }
function campaignError(e: unknown): UI['note'] {
  return e instanceof CampaignError ? { title: 'Not possible', text: e.reasons.join('\n') } : { title: 'Error', text: String(e) };
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
    let profile: Profile | null = null;
    try { const raw = store.get<unknown>(PROFILE(id), null); profile = raw ? migrateProfile(raw) : null; } catch { profile = null; ui.note = { title: 'Campaign progress unreadable', text: 'The stored profile was damaged and has been ignored.' }; }
    Object.assign(ui, seatsFor(ui.mod), { match: null, filter: '', gallery: null, camp: null, profile });
    void loadCustomArt(id).then(() => redraw());
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
  exportSaves() {
    const b = makeBackup(store.all());
    const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `ucb-saves-${b.exportedAt.slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.note = { title: 'Saves exported', text: `${Object.keys(b.entries).length} item(s): campaign progress, custom decks and saved matches.` };
    redraw();
  },
  async importSaves(file: File) {
    const { entries, problems } = readBackup(await file.text());
    const n = Object.keys(entries).length;
    if (!n) { ui.note = { title: 'Nothing imported', text: problems.join('\n') || 'The file has no saves.' }; return redraw(); }
    if (!window.confirm(`Import ${n} item(s)? Existing saves with the same names will be replaced.`)) return;
    let written = 0;
    for (const [k, v] of Object.entries(entries)) if (store.set(k, v)) written++;
    migrateLegacySaves();
    ui.theme = store.get<'light' | 'dark'>('ucb-theme', ui.theme) === 'light' ? 'light' : 'dark';
    ui.note = { title: 'Saves imported', text: [`${written} item(s) restored.`, ...problems].join('\n') };
    redraw();
  },
  closeNote() { ui.note = null; redraw(); },
  async linkSync(pick: boolean) {
    try {
      const msg = await connectSync(pick, async (text) => {
        const { entries, problems } = readBackup(text);
        const n = Object.keys(entries).length;
        const same = Object.entries(entries).every(([k, v]) => JSON.stringify(store.get(k, null)) === JSON.stringify(v));
        if (!n || same) return false;
        if (!window.confirm(`The sync file holds ${n} saved item(s). Load them into this browser?\n\nOK: load them (same names are replaced).\nCancel: keep this browser's saves and overwrite the file.`)) return false;
        for (const [k, v] of Object.entries(entries)) store.set(k, v);
        migrateLegacySaves();
        if (problems.length) ui.note = { title: 'Some items were skipped', text: problems.join('\n') };
        return true;
      });
      ui.note ??= { title: 'Sync file', text: msg };
    } catch (e) {
      if ((e as Error).name !== 'AbortError') ui.note = { title: 'Sync failed', text: String((e as Error).message) };
    }
    redraw();
  },
  async unlinkSync() { await unlinkSync(); redraw(); },

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
    Object.assign(ui, { camp: null, dialogSeen: -1, fxFrom: 0, counts: {}, screen: 'game', cover: null, note: null, inspect: null, drawer: null, pile: null, paused: false });
    advance();
  },
  continueGame(key?: string) {
    const m = ui.mod!;
    try {
      const d = store.get<any>(key ?? slots(m)[0]?.key ?? '', null);
      if (!d) throw new Error('No saved game.');
      ui.seats = d.seats;
      ui.decks = d.decks;
      ui.match = restore(m, d.state);
      ui.camp = d.camp ?? null;
      const s0 = ui.match!.s.cmds.length * 31;
      ui.agents = ui.seats.map((s, i) => (ui.camp && i === 1 ? encounterAgent(campaign()!.encounters[ui.camp.enc], s0 + i) : makeAgent(s === 'random' ? 'random' : 'heuristic', s0 + i)));
      ui.dialogSeen = ui.match!.s.events.length - 1;
      ui.viewer = `p${Math.max(0, ui.seats.indexOf('human'))}`;
      autoAt = autoKey(ui.match!);
      Object.assign(ui, { screen: 'game', cover: null, note: null, inspect: null, drawer: null, paused: false, fxFrom: ui.match!.s.events.length, counts: {} });
    } catch (e) {
      ui.note = { title: 'Could not continue', text: String((e as Error).message) };
    }
    advance();
  },

  // ---- in game ----
  pause(on: boolean) { ui.paused = on; if (on) { clearTimeout(timer); redraw(); } else advance(); },
  save() {
    if (!ui.match) return;
    const m = ui.mod!;
    const manual = slots(m).filter((s) => !s.auto);
    for (const s of manual.slice(MAX_SLOTS - 1)) store.del(s.key);
    const when = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const ok = store.set(SLOT(m.manifest.moduleId, `s${Date.now().toString(36)}`), slotData(`Turn ${ui.match.s.turn.n} · ${when}`));
    ui.note = ok ? { title: 'Game saved', text: `Load it later from the game menu (Load game).${manual.length >= MAX_SLOTS ? ` The oldest save was removed (${MAX_SLOTS} kept).` : ''}` } : { title: 'Could not save', text: 'Browser storage is unavailable.' };
    redraw();
  },
  deleteSlot(key: string) { if (window.confirm('Delete this saved game?')) { store.del(key); redraw(); } },
  quit() { if (!ui.camp || !ui.match?.s.result) autosaveNow(); else clearTimeout(autoTimer); ui.match = null; const back = ui.camp ? 'campaign' : 'home'; ui.camp = null; actions.go(back); },
  rematch() { if (ui.camp) actions.playEncounter(); else actions.newGame(); },
  setExternal(name: string, value: string) {
    const m = ui.match!;
    const dom = m.m.rules.external?.[name] ?? [];
    const v = dom.find((x) => String(x) === value) ?? value;
    try { ui.match = setExternal(m, name, v); } catch (e) { ui.note = { title: 'Not allowed', text: String((e as Error).message) }; }
    advance();
  },
  ackDialogue() { const d = pendingDialogue(); if (d) ui.dialogSeen = d.seq; advance(); },
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
  undoPick() { const l = ui.sel?.picks.$; if (l?.length) { l.pop(); redraw(); } },
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
  editDeck(name: string | null, inCampaign = false) {
    const m = ui.mod!;
    const secs = sections(m);
    const pool = inCampaign ? ui.profile!.decks : allDecks(m);
    const src = name ? pool[name] : null;
    const deck: Record<string, string[]> = Object.fromEntries(secs.map((z) => [z, []]));
    if (src) Object.assign(deck, structuredClone(Array.isArray(src) ? { [secs[0]]: src } : src));
    const custom = !!name && (inCampaign || name in customDecks(m));
    ui.edit = { name: name ? (custom ? name : `${name} (copy)`) : 'New deck', original: custom ? name : null, deck, section: secs[0], campaign: inCampaign };
    ui.sample = null;
    ui.io = null;
    actions.go('decks');
  },
  setSection(z: string) { ui.edit!.section = z; redraw(); },
  rename(n: string) { ui.edit!.name = n; redraw(); },
  addCard(id: string) {
    const e = ui.edit!;
    if (e.campaign) {
      const used = Object.values(e.deck).flat().filter((x) => x === id).length;
      if (used >= (ui.profile!.collection[id] ?? 0)) { ui.note = { title: 'Not in your collection', text: `You own ${ui.profile!.collection[id] ?? 0} of this card.` }; return redraw(); }
    }
    e.deck[e.section] = [...e.deck[e.section], id];
    redraw();
  },
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
    const errs = [...deckErrors(m, deck), ...(e.campaign ? ownedErrors(ui.profile!.collection, deck) : [])];
    if (!name || (!e.campaign && name in (m.decks ?? {}))) { ui.note = { title: 'Choose another name', text: 'Built-in deck names are reserved.' }; return redraw(); }
    if (errs.length) { ui.note = { title: 'Deck is not legal yet', text: errs.join('\n') }; return redraw(); }
    if (e.campaign) {
      const p = ui.profile!;
      if (e.original && e.original !== name) delete p.decks[e.original];
      p.decks[name] = deck;
      saveProfile();
      e.original = name;
      ui.campDeck = name;
      ui.note = { title: 'Deck saved', text: `"${name}" is ready for the campaign.` };
      return redraw();
    }
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
  toggleFacet(token: string) { ui.filter = toggleToken(ui.filter, token); redraw(); },
  setSort(k: SortKey) { ui.sort = k; redraw(); },
  sampleHand(n: number) {
    const all = Object.values(ui.edit!.deck)[0] ?? [];
    const pool = [...all];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    ui.sample = pool.slice(0, n);
    redraw();
  },
  closeSample() { ui.sample = null; redraw(); },
  openIO(mode: 'import' | 'export') {
    const e = ui.edit!;
    ui.io = { mode, text: mode === 'export' ? deckToText(ui.mod!, e.deck, sections(ui.mod!)) : '', errors: [] };
    if (mode === 'export') navigator.clipboard?.writeText(ui.io.text).catch(() => {});
    redraw();
  },
  setIOText(t: string) { ui.io!.text = t; },
  applyImport() {
    const r = deckFromText(ui.mod!, ui.io!.text, sections(ui.mod!));
    if (r.errors.length) { ui.io!.errors = r.errors; return redraw(); }
    ui.edit!.deck = r.deck;
    ui.io = null;
    redraw();
  },
  closeIO() { ui.io = null; redraw(); },
  duplicateDeck() {
    const e = ui.edit!;
    ui.edit = { ...e, deck: structuredClone(e.deck), name: `${e.name} (copy)`, original: null };
    redraw();
  },

  // ---- campaign & shop ----
  beginCampaign() {
    ui.profile = newProfile(ui.mod!, campaign()!, Math.floor(Math.random() * 2 ** 31));
    saveProfile();
    ui.dialog = campaign()!.intro?.length ? { lines: campaign()!.intro!, i: 0 } : null;
    actions.go('campaign');
  },
  resetCampaign() {
    if (!window.confirm('Erase all campaign progress for this game?')) return;
    store.del(PROFILE(ui.mod!.manifest.moduleId));
    ui.profile = null;
    redraw();
  },
  openEncounter(id: string) {
    const en = campaign()!.encounters[id];
    ui.encounter = id;
    ui.campDeck = ui.campDeck in (ui.profile?.decks ?? {}) ? ui.campDeck : Object.keys(ui.profile!.decks)[0];
    ui.dialog = en.intro?.length ? { lines: en.intro, i: 0 } : null;
    actions.go('encounter');
  },
  dialogNext(skip = false) {
    const d = ui.dialog!;
    ui.dialog = !skip && d.i + 1 < d.lines.length ? { ...d, i: d.i + 1 } : null;
    redraw();
  },
  setCampDeck(n: string) { ui.campDeck = n; redraw(); },
  editCampaignDeck(name: string | null) { actions.editDeck(name, true); },
  playEncounter() {
    const m = ui.mod!;
    const c = campaign()!;
    const id = ui.encounter!;
    const seed = Math.floor(Math.random() * 1e9);
    try {
      const r = startEncounter(m, c, ui.profile!, id, ui.campDeck, seed);
      ui.profile = r.profile;
      saveProfile();
      ui.match = createMatch(m, r.opts);
      ui.seats = ['human', 'heuristic'];
      ui.decks = [ui.campDeck, c.encounters[id].deck];
      ui.agents = [makeAgent('random', seed), encounterAgent(c.encounters[id], seed + 1)];
      ui.camp = { enc: id, seq: r.profile.active!.seq };
      Object.assign(ui, { screen: 'game', viewer: 'p0', cover: null, note: null, inspect: null, drawer: null, paused: false, dialogSeen: -1, fxFrom: 0, counts: {} });
    } catch (e) {
      ui.note = campaignError(e);
      return redraw();
    }
    advance();
  },
  finishCampaignMatch() {
    const c = campaign()!;
    const { enc, seq } = ui.camp!;
    const r = finishEncounter(c, ui.profile!, enc, seq, ui.match!.s.result!);
    ui.profile = r.profile;
    saveProfile();
    clearTimeout(autoTimer);
    autoTimer = undefined;
    store.del(SLOT(ui.mod!.manifest.moduleId, 'auto'));
    const en = c.encounters[enc];
    ui.reward = { won: r.won, granted: r.granted, lines: (r.won ? en.outro : en.defeat) ?? [], enc };
    Object.assign(ui, { match: null, camp: null });
    actions.go('reward');
  },
  buyItem(id: string) {
    try {
      const r = buy(campaign()!, ui.profile!, id);
      ui.profile = r.profile;
      saveProfile();
      ui.reveal = r.cards;
    } catch (e) {
      ui.note = campaignError(e);
    }
    redraw();
  },
  closeReveal() { ui.reveal = null; redraw(); },
  enlarge(id: string | null) { ui.gallery = id; redraw(); },
  async setArt(cardId: string, file: File) {
    try { await setCustomArt(ui.mod!.manifest.moduleId, cardId, file); ui.note = null; } catch (e) { ui.note = { title: 'Could not use that image', text: String((e as Error).message) }; }
    redraw();
  },
  async clearArt(cardId: string) {
    try { await clearCustomArt(ui.mod!.manifest.moduleId, cardId); } catch (e) { ui.note = { title: 'Could not reset art', text: String(e) }; }
    redraw();
  },
};

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (ui.gallery) actions.enlarge(null);
  else if (ui.reveal) actions.closeReveal();
  else if (ui.dialog) actions.dialogNext(true);
  else if (ui.sel || ui.menu) actions.cancel();
  else if (ui.screen === 'game' && ui.match && !ui.match.s.result) actions.pause(!ui.paused);
});

// Boot: open storage (IndexedDB, migrating older localStorage saves), then draw.
export const storageInfo: { backend: string; persisted: boolean; used: number | null } = { backend: 'memory', persisted: false, used: null };
openStore((msg) => { ui.note = { title: 'Storage problem', text: msg }; redraw(); }).then(async (b) => {
  storageInfo.backend = b;
  migrateLegacySaves();
  ui.theme = store.get<'light' | 'dark'>('ucb-theme', 'dark') === 'light' ? 'light' : 'dark';
  redraw();
  await initSync(() => JSON.stringify(makeBackup(store.all()), null, 1), redraw);
  storageInfo.persisted = await persistStorage();
  storageInfo.used = (await usage())?.used ?? null;
  redraw();
});
window.addEventListener('pagehide', () => { if (ui.screen === 'game') autosaveNow(); });
(window as any).__ucbStore = store; // test hook
export { sync };
