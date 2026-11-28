// Game Maker state: projects (blueprints) in browser storage, maker XP and quests, playtests, AI lab runs, publishing
// into the library and exporting packages. The screens live in ui/maker.ts.
import type { Mod } from '#engine';
import type { Match } from '#engine';
import { IllegalAction, commitAction, createMatch, determinize, listActions, observe, submitDecision } from '#engine';
import { makeAgent } from '#ai';
import { packFiles } from '#sdk';
import { type Blueprint, type CardBP, type Problem, BLUEPRINTS, RECIPES, applyRecipe, build, surpriseRecipes, type WizAnswers, WIZARD, optionsFor, wizardBuild, cardsFromCsv, cardsToCsv, compileBlueprint, fromBlueprint, normalize, rulebookMarkdown, slug, featuresOf, fitIssues, exportScripts, importScripts, readScripts, STARTER_SCRIPTS, libraryEntry, type LibraryScript, type ScriptBundle } from '#maker';
import { MODULES, SOURCES } from './modules.ts';
import { store } from './storage.ts';

export type Station = 'identity' | 'shelf' | 'frames' | 'types' | 'board' | 'turn' | 'rules' | 'keywords' | 'cards' | 'decks' | 'shop' | 'campaign' | 'test' | 'publish' | 'lab';
export interface MakerUI {
  project: string | null;
  station: Station;
  card: string | null;
  deck: string | null;
  type: string | null;
  filter: string | null; // card type shown in the Cards station
  picker: boolean;
  wiz: { step: number; a: WizAnswers } | null; // the guided-setup wizard, when open
  toast: { text: string; xp: number; at: number } | null;
  celebrate: number;
  sim: { done: number; total: number; lines: string[]; running: boolean; cards?: { id: string; name: string; games: number; wins: number }[] } | null;
  undo: string[]; redo: string[]; lastEdit: number;
  rawErr: Record<string, string>;
  confirm?: { id: string; name: string; why: string[] }; // a mechanic that would break the game, waiting for "add anyway"
  script?: { mode: 'merge' | 'replace'; report?: string[]; err?: string }; // Script Lab import/export
  test: { a: string; b: string; opp: 'heuristic' | 'random' | 'human' | 'planner'; lab?: 'heuristic' | 'planner' };
}
export const newMakerUI = (): MakerUI => ({ project: null, station: 'identity', card: null, deck: null, type: null, filter: null, picker: false, wiz: null, toast: null, celebrate: 0, sim: null, rawErr: {}, test: { a: '', b: '', opp: 'heuristic' }, undo: [], redo: [], lastEdit: 0 });

interface Project { bp: Blueprint; created: string; updated: string }
interface Profile { xp: number; quests: string[] }
const PKEY = (id: string) => `ucb-maker:${id}`;
const PUB = (id: string) => `ucb-maker-pub:${id}`;
const PROFILE = 'ucb-maker-profile';

export const STATIONS: { id: Station; name: string; icon: string; quest: string; xp: number; goal: string }[] = [
  { id: 'identity', name: 'Name & Look', icon: '✎', quest: 'look', xp: 25, goal: 'Name your game and pick its colors and emblem.' },
  { id: 'shelf', name: 'Mechanics Shelf', icon: '🧰', quest: 'recipe', xp: 40, goal: 'Mix in a mechanic from the shelf.' },
  { id: 'frames', name: 'Card Frames', icon: '▭', quest: 'frame', xp: 25, goal: 'Design how one card type looks: frame, corners, art size.' },
  { id: 'types', name: 'Card Types & Stats', icon: '⧉', quest: 'types', xp: 25, goal: 'Shape your card types and the numbers they carry.' },
  { id: 'board', name: 'The Board', icon: '▦', quest: 'board', xp: 25, goal: 'Name the zones on your table.' },
  { id: 'turn', name: 'Turn Sequence', icon: '⟳', quest: 'turn', xp: 25, goal: 'Arrange the phases of a turn.' },
  { id: 'rules', name: 'Rules of Play', icon: '⚖', quest: 'rules', xp: 35, goal: 'Choose how resources, combat and winning work.' },
  { id: 'keywords', name: 'Keywords & Counters', icon: '✧', quest: 'keyword', xp: 25, goal: 'Invent a keyword and give it a rule or abilities.' },
  { id: 'cards', name: 'Cards', icon: '🂠', quest: 'ability', xp: 50, goal: 'Create a card and give it an ability.' },
  { id: 'decks', name: 'Decks', icon: '▤', quest: 'deck', xp: 25, goal: 'Build or tune a deck.' },
  { id: 'shop', name: 'Shop (optional)', icon: '🛒', quest: 'shop', xp: 30, goal: 'Optional: sell booster packs and decks for your currencies.' },
  { id: 'campaign', name: 'Campaign (optional)', icon: '🗺', quest: 'campaign', xp: 40, goal: 'Optional: line up opponents to beat for rewards.' },
  { id: 'test', name: 'Playtest', icon: '▶', quest: 'win', xp: 100, goal: 'Win a playtest against the AI.' },
  { id: 'publish', name: 'Publish', icon: '★', quest: 'publish', xp: 100, goal: 'Publish your game to the library.' },
  { id: 'lab', name: 'Script Lab', icon: '⚙', quest: 'script', xp: 50, goal: 'Advanced: patch the rules with your own script.' },
];
export const RANKS: [number, string][] = [[0, 'Apprentice Tinkerer'], [100, 'Card Smith'], [250, 'Rule Wright'], [450, 'Game Architect'], [700, 'Grand Designer'], [1000, 'Legendary Maker']];
export const profile = (): Profile => store.get<Profile>(PROFILE, { xp: 0, quests: [] });
export function rankOf(xp: number): { name: string; next: number | null; floor: number } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  return { name: RANKS[i][1], floor: RANKS[i][0], next: RANKS[i + 1]?.[0] ?? null };
}

export function projects(): { id: string; p: Project }[] {
  return store.keys('ucb-maker:').map((k) => ({ id: k.slice('ucb-maker:'.length), p: store.get<Project | null>(k, null)! })).filter((x) => x.p?.bp)
    .sort((a, b) => b.p.updated.localeCompare(a.p.updated));
}
/** The user's own script library, shared by all their projects. */
const LIB = 'ucb-scriptlib';
export const scriptLibrary = (): LibraryScript[] => store.get<LibraryScript[]>(LIB, []);
export const published = (id: string) => store.get<Blueprint | null>(PUB(id), null) !== null;
export const isMakerModule = (m: Mod) => (m.manifest.licensing ?? '').startsWith('Made with the Universal Card Battles Game Maker');

/** Compiles every published game into the library at boot. */
export function registerPublished() {
  for (const k of store.keys('ucb-maker-pub:')) {
    const bp = store.get<Blueprint | null>(k, null);
    if (!bp) continue;
    try { const { mod } = build(bp); if (mod && !(MODULES.has(bp.id) && !isMakerModule(MODULES.get(bp.id)!))) MODULES.set(bp.id, mod); } catch { /* skip broken */ }
  }
}

/** A preview module built without validation, for drawing cards while the design is still half-finished. */
const previewCache = new Map<string, Mod>();
export function previewMod(bp: Blueprint): Mod | null {
  const key = JSON.stringify(bp);
  const hit = previewCache.get(key);
  if (hit) return hit;
  try {
    const def = compileBlueprint(bp) as any;
    const mod = { ...def, card: new Map(def.cards.map((c: any) => [c.id, c])), zone: new Map(def.rules.zones.map((z: any) => [z.id, z])), hash: '', idStatics: false } as Mod;
    previewCache.clear();
    previewCache.set(key, mod);
    return mod;
  } catch { return null; }
}
const checkCache = new Map<string, Problem[]>();
export function problems(bp: Blueprint): Problem[] {
  const key = JSON.stringify(bp);
  const hit = checkCache.get(key);
  if (hit) return hit;
  let out: Problem[];
  try {
    out = build(bp).problems;
    const other = MODULES.get(bp.id);
    if (other && !isMakerModule(other)) out = [{ level: 'bug', text: `"${bp.id}" is already used by ${other.manifest.displayName}. Pick another game id.`, where: 'identity' }, ...out];
  } catch (e) { out = [{ level: 'bug', text: String((e as Error).message) }]; }
  checkCache.clear();
  checkCache.set(key, out);
  return out;
}

function setPath(o: any, path: (string | number)[], v: unknown) {
  let x = o;
  for (const k of path.slice(0, -1)) { if (x[k] === undefined || x[k] === null) x[k] = typeof k === 'number' ? [] : {}; x = x[k]; }
  const last = path[path.length - 1];
  if (v === undefined) { if (Array.isArray(x)) x.splice(last as number, 1); else delete x[last]; } else x[last] = v;
}
const uniq = (base: string, taken: (s: string) => boolean) => { let s = base, i = 2; while (taken(s)) s = `${base}-${i++}`; return s; };
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function hslHex(h: number): string {
  const f = (n: number) => { const k = (n + h / 30) % 12; const c = 0.5 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export function blip(freq = 660, ms = 90) {
  try {
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ac = (blip as any).ac ?? ((blip as any).ac = new AC());
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = freq; g.gain.value = 0.06;
    o.connect(g); g.connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000); o.stop(ac.currentTime + ms / 1000);
  } catch { /* no audio */ }
}

/** One AI move (a decision or an action), as the harness plays matches. */
function aiStep(match: Match, agents: ReturnType<typeof makeAgent>[]): Match {
  const s = match.s;
  const info = (p: string) => ({ player: p, mod: match.m, sample: (seed: number) => determinize(match, p, seed) });
  if (s.pending) { const p = s.pending.player; return submitDecision(match, p, s.pending.id, agents[+p.slice(1)].decide(observe(match, p), info(p))); }
  const p = s.priority!;
  for (let tries = 0; tries < 20; tries++) {
    try { return commitAction(match, p, agents[+p.slice(1)].act(observe(match, p), listActions(match, p), info(p))); } catch (e) { if (!(e instanceof IllegalAction)) throw e; }
  }
  return commitAction(match, p, { action: 'pass' });
}

/** Maker actions, merged into the app's action table. `ui.mk` holds the maker screen state. */
export function makerActions(ui: any, redraw: () => void, A: any) {
  const mk = (): MakerUI => (ui.mk ??= newMakerUI());
  const cur = (): Project | null => (mk().project ? store.get<Project | null>(PKEY(mk().project!), null) : null);
  const save = (p: Project) => { p.updated = new Date().toISOString(); store.set(PKEY(mk().project!), p); };
  function award(quest: string, xp: number, text: string) {
    const pr = profile();
    if (pr.quests.includes(quest)) return;
    const before = rankOf(pr.xp).name;
    pr.quests.push(quest); pr.xp += xp;
    store.set(PROFILE, pr);
    mk().toast = { text, xp, at: Date.now() };
    if (rankOf(pr.xp).name !== before) { mk().toast = { text: `Rank up! You are now a ${rankOf(pr.xp).name}. (${text})`, xp, at: Date.now() }; mk().celebrate = Date.now(); blip(880, 220); } else blip(990, 120);
  }
  const questFor = (st: Station) => STATIONS.find((s) => s.id === st)!;
  function edit(fn: (bp: Blueprint) => void, quest?: Station) {
    const p = cur();
    if (!p) return;
    const m = mk();
    if (Date.now() - m.lastEdit > 700) { m.undo.push(JSON.stringify(p.bp)); if (m.undo.length > 80) m.undo.shift(); }
    m.redo = []; m.lastEdit = Date.now();
    normalize(p.bp);
    fn(p.bp);
    save(p);
    if (quest) { const q = questFor(quest); award(q.quest, q.xp, `Quest complete: ${q.goal}`); }
    redraw();
  }
  const firstDecks = (bp: Blueprint) => { const t = mk().test; const ids = bp.decks.map((d) => d.id); if (!ids.includes(t.a)) t.a = ids[0] ?? ''; if (!ids.includes(t.b)) t.b = ids[1] ?? ids[0] ?? ''; };

  function createProject(bp: Blueprint) {
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    store.set(PKEY(id), { bp, created: new Date().toISOString(), updated: new Date().toISOString() });
    Object.assign(mk(), { project: id, station: 'identity', picker: false, card: null, deck: null, type: bp.types[0]?.id ?? null });
    firstDecks(bp);
    award('start', 20, 'Quest complete: start your first game.');
    redraw();
  }
  const out = {
    mkOpen() { mk().project = null; mk().picker = false; mk().wiz = null; ui.mod = null; A.go('maker'); },
    mkPicker(open: boolean) { mk().picker = open; redraw(); },
    mkOpenCard(id: string) { Object.assign(mk(), { station: 'cards', card: id }); redraw(); },
    mkNew(blueprintId: string) {
      const src = blueprintId.startsWith('mod:') ? SOURCES.get(blueprintId.slice(4)) : null;
      const bp: Blueprint = src ? normalize(structuredClone(src)) : fromBlueprint(blueprintId);
      const taken = (s: string) => MODULES.has(s) || projects().some((x) => x.p.bp.id === s);
      bp.id = uniq(blueprintId === 'blank' ? 'my-card-game' : `my-${bp.id}`, taken);
      if (blueprintId !== 'blank') bp.name = `${bp.name} (my version)`;
      createProject(bp);
    },
    // ---- guided setup
    mkWizard(open: boolean) { Object.assign(mk(), { wiz: open ? { step: 0, a: { picks: {}, vals: {} } } : null, picker: false }); redraw(); },
    mkWizPick(step: string, opt: string) {
      const w = mk().wiz; if (!w) return;
      const st = WIZARD.find((x) => x.id === step)!;
      const cur = w.a.picks[step] ?? [];
      w.a.picks[step] = st.multi ? (cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]) : [opt];
      redraw();
    },
    mkWizVal(id: string, v: string | number, draw = true) { const w = mk().wiz; if (!w) return; w.a.vals[id] = v; if (draw) redraw(); },
    mkWizGo(delta: number, skip = false) {
      const w = mk().wiz; if (!w) return;
      if (skip) delete w.a.picks[WIZARD[w.step].id];
      let n = w.step + delta;
      const empty = (i: number) => { const st = WIZARD[i]; return st.id !== 'review' && !optionsFor(st, w.a).length && !(st.fields ?? []).some((f) => !f.when || f.when(w.a)); };
      while (n > 0 && n < WIZARD.length - 1 && empty(n)) n += delta < 0 ? -1 : 1;
      w.step = Math.max(0, Math.min(WIZARD.length - 1, n));
      redraw();
    },
    mkWizJump(i: number) { const w = mk().wiz; if (w) { w.step = i; redraw(); } },
    mkWizCreate() {
      const w = mk().wiz; if (!w) return;
      const bp = wizardBuild(w.a);
      const taken = (s: string) => MODULES.has(s) || projects().some((x) => x.p.bp.id === s);
      bp.id = uniq(bp.id, taken);
      mk().wiz = null;
      createProject(bp);
      award('wizard', 30, 'Quest complete: build a game with the guided setup.');
      redraw();
    },
    mkSurprise() {
      out.mkNew('blank');
      const seed = Math.floor(Math.random() * 1e9);
      const ids = surpriseRecipes(seed);
      const hue = seed % 360;
      edit((bp) => {
        for (const r of ids) applyRecipe(bp, r);
        bp.name = `Mystery Game #${seed % 1000}`;
        bp.tagline = `Built from: ${ids.map((r) => RECIPES.find((x) => x.id === r)?.name ?? r).join(', ')}.`;
        bp.look = { accent: `hsl(${hue} 70% 50%)`.replace(/hsl\((\d+) 70% 50%\)/, (_m, h) => hslHex(+h)), accent2: hslHex((hue + 140) % 360), glyph: '🎲' };
      });
      mk().toast = { text: 'A surprise game! Playtest it, or open the Mechanics Shelf to see what went in.', xp: 0, at: Date.now() };
      redraw();
    },
    mkLoad(id: string) { const p = store.get<Project | null>(PKEY(id), null); if (!p) return; Object.assign(mk(), { project: id, station: 'identity', card: null, deck: null, type: p.bp.types[0]?.id ?? null, sim: null, undo: [], redo: [] }); firstDecks(p.bp); redraw(); },
    mkUndo() { const p = cur(); const m = mk(); const prev = m.undo.pop(); if (!p || !prev) return; m.redo.push(JSON.stringify(p.bp)); p.bp = JSON.parse(prev); save(p); m.lastEdit = 0; redraw(); },
    mkRedo() { const p = cur(); const m = mk(); const next = m.redo.pop(); if (!p || !next) return; m.undo.push(JSON.stringify(p.bp)); p.bp = JSON.parse(next); save(p); m.lastEdit = 0; redraw(); },
    /** Adds a mechanic. It is tried on a copy first: if it would break the game, the shelf asks before adding it. */
    mkRecipe(id: string, name: string, force = false) {
      const p = cur(); if (!p) return;
      if (!force) {
        const before = new Set(problems(p.bp).filter((q) => q.level === 'bug').map((q) => q.text));
        const trial = applyRecipe(JSON.parse(JSON.stringify(p.bp)) as Blueprint, id);
        const added = problems(trial).filter((q) => q.level === 'bug' && !before.has(q.text)).map((q) => q.text);
        const issues = fitIssues(id, featuresOf(p.bp)).filter((q) => q.level === 'blocks').map((q) => q.text);
        if (added.length || issues.length) { mk().confirm = { id, name, why: [...issues, ...added.slice(0, 4)] }; redraw(); return; }
      }
      mk().confirm = undefined;
      mk().lastEdit = 0; edit((bp) => applyRecipe(bp, id), 'shelf'); if (!mk().toast || Date.now() - mk().toast!.at > 300) mk().toast = { text: `Added ${name} to your game. Undo if it isn't what you wanted.`, xp: 0, at: Date.now() }; blip(760, 120); redraw(); },
    mkCsvExport() { const p = cur(); if (p) download(`${p.bp.id}-cards.csv`, cardsToCsv(p.bp), 'text/csv'); },
    async mkCsvImport(file: File) {
      const text = await file.text();
      let res = { added: 0, updated: 0, errors: [] as string[] };
      mk().lastEdit = 0;
      edit((bp) => { res = cardsFromCsv(bp, text); }, 'cards');
      ui.note = { title: 'Cards imported', text: [`${res.added} added, ${res.updated} updated.`, ...res.errors.slice(0, 12)].join('\n') };
      redraw();
    },
    mkRulebook() { const p = cur(); if (p) download(`${p.bp.id}-rules.md`, rulebookMarkdown(p.bp), 'text/markdown'); },
    mkDelete(id: string) { const p = store.get<Project | null>(PKEY(id), null); if (p && window.confirm(`Delete "${p.bp.name}"? This can't be undone.`)) { store.del(PKEY(id)); redraw(); } },
    mkClose() { mk().project = null; redraw(); },
    mkStation(s: Station) { mk().station = s; window.scrollTo(0, 0); redraw(); },
    mkSet(path: (string | number)[], v: unknown, quest?: Station) { edit((bp) => setPath(bp, path, v), quest); },
    mkEdit(fn: (bp: Blueprint) => void, quest?: Station) { edit(fn, quest); },
    mkSel(k: 'card' | 'deck' | 'type' | 'filter', id: string | null) { (mk() as any)[k] = id; redraw(); },
    mkNewCard(type: string) {
      edit((bp) => {
        const id = uniq('new-card', (s) => bp.cards.some((c) => c.id === s));
        const t = bp.types.find((x) => x.id === type)!;
        const stats: Record<string, number> = {};
        for (const sl of t.frame.stats) stats[sl.stat] = 1;
        bp.cards.unshift({ id, name: 'New Card', type, cost: 1, stats, keywords: [], abilities: [] });
        mk().card = id;
      });
      award('card', 20, 'Quest complete: create your first card.');
      redraw();
    },
    mkRenameCard(id: string, name: string) {
      edit((bp) => {
        const c = bp.cards.find((x) => x.id === id);
        if (!c) return;
        const oldName = c.name;
        c.name = name;
        for (const o of bp.cards) if (o.evolvesFrom === oldName) o.evolvesFrom = name;
      });
    },
    mkDupCard(id: string) {
      edit((bp) => {
        const c = bp.cards.find((x) => x.id === id);
        if (!c) return;
        const nid = uniq(`${c.id}-copy`, (s) => bp.cards.some((k) => k.id === s));
        bp.cards.splice(bp.cards.indexOf(c) + 1, 0, { ...structuredClone(c), id: nid, name: `${c.name} (copy)` });
        mk().card = nid;
      });
    },
    mkDelCard(id: string) {
      edit((bp) => {
        bp.cards = bp.cards.filter((c) => c.id !== id);
        for (const d of bp.decks) { delete d.main[id]; if (d.extra) delete d.extra[id]; if (d.res) delete d.res[id]; if (d.leader === id) d.leader = undefined; }
        mk().card = null;
      });
    },
    mkNewDeck() {
      edit((bp) => {
        const id = uniq('deck', (s) => bp.decks.some((d) => d.id === s));
        bp.decks.push({ id, name: `Deck ${bp.decks.length + 1}`, main: {} });
        mk().deck = id;
      }, 'decks');
    },
    mkDeckCount(deck: string, section: 'main' | 'extra' | 'res', card: string, delta: number) {
      edit((bp) => {
        const d = bp.decks.find((x) => x.id === deck);
        if (!d) return;
        const m = (d[section] ??= {});
        const n = Math.max(0, (m[card] ?? 0) + delta);
        if (n) m[card] = n; else delete m[card];
      }, 'decks');
    },
    mkAutofill(deck: string) {
      edit((bp) => {
        const d = bp.decks.find((x) => x.id === deck);
        if (!d) return;
        const roles = new Map(bp.types.map((t) => [t.id, t.role]));
        const pool = bp.cards.filter((c) => !['leader', 'extra', 'token'].includes(roles.get(c.type) ?? '') && !(bp.resource.mode === 'deck' && roles.get(c.type) === 'resource'));
        const total = () => Object.values(d.main).reduce((a, b) => a + b, 0);
        const max = (c: CardBP) => (roles.get(c.type) === 'resource' ? 99 : bp.setup.maxCopies);
        for (let guard = 0; total() < bp.setup.deckMin && guard < 500 && pool.length; guard++) {
          const c = pool[guard % pool.length];
          if ((d.main[c.id] ?? 0) < max(c)) d.main[c.id] = (d.main[c.id] ?? 0) + 1;
        }
        if (bp.setup.leader && !d.leader) d.leader = bp.cards.find((c) => roles.get(c.type) === 'leader')?.id;
        if (bp.resource.mode === 'deck' && !Object.keys(d.res ?? {}).length) { const r = bp.cards.find((c) => roles.get(c.type) === 'resource'); if (r) d.res = { [r.id]: bp.resource.deckSize }; }
      }, 'decks');
    },
    mkSetTest(k: 'a' | 'b' | 'opp' | 'lab', v: string) { (mk().test as any)[k] = v; redraw(); },
    mkPlaytest() {
      const p = cur();
      if (!p) return;
      const { mod, problems: probs } = build(p.bp);
      if (!mod) { ui.note = { title: 'Fix the bugs first', text: probs.filter((x) => x.level === 'bug').map((x) => `• ${x.text}`).join('\n') }; return redraw(); }
      const other = MODULES.get(mod.manifest.moduleId);
      if (other && !isMakerModule(other)) { ui.note = { title: 'Game id taken', text: 'Change the game id on Name & Look.' }; return redraw(); }
      firstDecks(p.bp);
      MODULES.set(mod.manifest.moduleId, mod);
      const t = mk().test;
      ui.mod = mod;
      ui.seats = ['human', t.opp === 'human' ? 'human' : t.opp];
      ui.decks = [t.a, t.b];
      ui.makerReturn = mk().project;
      ui.profile = null;
      award('playtest', 40, 'Quest complete: playtest your game.');
      A.newGame();
    },
    mkBack() {
      const m = ui.match;
      if (m?.s.result && ui.seats[0] === 'human' && ui.seats[1] !== 'human' && m.s.result.winners?.includes('p0')) {
        const q = questFor('test'); award(q.quest, q.xp, 'Quest complete: win a playtest against the AI.');
      }
      ui.makerReturn = null; ui.match = null; ui.mod = null;
      Object.assign(ui, { screen: 'maker', note: null, sel: null, menu: null, paused: false });
      window.scrollTo(0, 0);
      redraw();
    },
    mkSim(n: number) {
      const p = cur();
      if (!p) return;
      const { mod } = build(p.bp);
      if (!mod) { ui.note = { title: 'Fix the bugs first', text: 'The lab can only run a game that builds.' }; return redraw(); }
      const ids = p.bp.decks.map((d) => d.id);
      const pairs = ids.length > 1 ? ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b])) : [[ids[0], ids[0]]];
      const s: NonNullable<MakerUI['sim']> = { done: 0, total: n, lines: [], running: true };
      mk().sim = s;
      const wins: Record<string, number> = {}, games: Record<string, number> = {};
      const cardStats: Record<string, { games: number; wins: number }> = {};
      let turns = 0, limits = 0, errors = 0;
      const step = () => {
        if (s !== mk().sim || s.done >= s.total) {
          s.running = false;
          s.cards = Object.entries(cardStats).map(([id, v]) => ({ id, name: p.bp.cards.find((k) => k.id === id)?.name ?? id, ...v })).sort((a, b) => b.games - a.games);
          const rows = Object.keys(games).map((d) => `${p.bp.decks.find((x) => x.id === d)?.name ?? d}: won ${wins[d] ?? 0} of ${games[d]} (${Math.round((100 * (wins[d] ?? 0)) / games[d])}%)`);
          s.lines = [`${s.done} AI games · average ${(turns / Math.max(1, s.done)).toFixed(1)} turns${limits ? ` · ${limits} hit the turn limit` : ''}${errors ? ` · ${errors} crashed` : ''}`, ...rows];
          award('lab', 30, 'Quest complete: run the AI lab.');
          return redraw();
        }
        const [a, b] = pairs[s.done % pairs.length];
        const order = s.done % 2 ? [b, a] : [a, b];
        try {
          let g = createMatch(mod, { decks: order.map((d) => structuredClone(mod.decks![d])), seed: 1000 + s.done });
          const kind = mk().test.lab ?? 'heuristic';
          const agents = [makeAgent(kind, s.done), makeAgent(kind, s.done + 7)];
          for (let i = 0; !g.s.result && i < 20000; i++) g = aiStep(g, agents);
          turns += g.s.turn.n;
          for (const d of order) games[d] = (games[d] ?? 0) + 1;
          const w = g.s.result?.winners?.[0];
          for (const pl of ['p0', 'p1']) {
            const played = new Set((g.s.events as any[]).filter((e) => e.type === 'action' && e.player === pl && e.card).map((e) => e.card as string));
            for (const id of played) { const cs = (cardStats[id] ??= { games: 0, wins: 0 }); cs.games++; if (w === pl) cs.wins++; }
          }
          if (!g.s.result || g.s.result.reason === 'turnLimit') limits++;
          else if (w) wins[order[+w.slice(1)]] = (wins[order[+w.slice(1)]] ?? 0) + 1;
        } catch { errors++; }
        s.done++;
        redraw();
        setTimeout(step, 0);
      };
      redraw();
      setTimeout(step, 30);
    },
    mkPublish() {
      const p = cur();
      if (!p) return;
      const { mod, problems: probs } = build(p.bp);
      if (!mod) { ui.note = { title: 'Fix the bugs first', text: probs.filter((x) => x.level === 'bug').map((x) => `• ${x.text}`).join('\n') }; return redraw(); }
      store.set(PUB(p.bp.id), p.bp);
      MODULES.set(mod.manifest.moduleId, mod);
      mk().celebrate = Date.now();
      const q = questFor('publish'); award(q.quest, q.xp, `Published! ${p.bp.name} is in your library.`);
      if (!mk().toast || Date.now() - mk().toast!.at > 100) mk().toast = { text: `${p.bp.name} is in your library.`, xp: 0, at: Date.now() };
      blip(1200, 260);
      redraw();
    },
    mkUnpublish() { const p = cur(); if (!p) return; store.del(PUB(p.bp.id)); MODULES.delete(p.bp.id); redraw(); },
    async mkExportZip() {
      const p = cur();
      if (!p) return;
      const { mod } = build(p.bp);
      if (!mod) { ui.note = { title: 'Fix the bugs first', text: 'Only a game that builds can be exported.' }; return redraw(); }
      const def = compileBlueprint(p.bp) as any;
      const enc = (o: unknown) => new TextEncoder().encode(`${JSON.stringify(o, null, 1)}\n`);
      const files = new Map<string, Uint8Array>([['manifest.json', enc(def.manifest)], ['rules.json', enc(def.rules)], ['cards.json', enc(def.cards)], ['decks.json', enc(def.decks)], ['ai/ai.json', enc(def.ai)], ...(def.campaign ? [['campaign/campaign.json', enc(def.campaign)] as [string, Uint8Array]] : [])]);
      download(`${p.bp.id}.zip`, (await packFiles(files)) as BlobPart, 'application/zip');
      award('export', 25, 'Quest complete: export a module package.');
      redraw();
    },
    mkExportJson() { const p = cur(); if (p) download(`${p.bp.id}.maker.json`, JSON.stringify(p.bp, null, 1), 'application/json'); },
    async mkImportJson(file: File) {
      try {
        const bp = JSON.parse(await file.text()) as Blueprint;
        if (bp?.v !== 1 || !Array.isArray(bp.types) || !Array.isArray(bp.cards)) throw new Error('This is not a Game Maker blueprint.');
        const id = `p${Date.now().toString(36)}`;
        store.set(PKEY(id), { bp, created: new Date().toISOString(), updated: new Date().toISOString() });
        out.mkLoad(id);
      } catch (e) { ui.note = { title: 'Could not import', text: String((e as Error).message) }; redraw(); }
    },
    mkRaw(key: string, path: (string | number)[], text: string) {
      const errs = mk().rawErr;
      if (!text.trim()) { delete errs[key]; return edit((bp) => setPath(bp, path, undefined), 'lab'); }
      try { const v = JSON.parse(text); delete errs[key]; edit((bp) => setPath(bp, path, v), 'lab'); } catch (e) { errs[key] = (e as Error).message; redraw(); }
    },
    // Script Lab import / export
    mkScriptMode(mode: 'merge' | 'replace') { mk().script = { ...mk().script, mode }; redraw(); },
    mkExportScripts() { const p = cur(); if (p) download(`${p.bp.id}.script.json`, JSON.stringify(exportScripts(p.bp), null, 1), 'application/json'); },
    mkExportRules() { const p = cur(); if (!p) return; const def = compileBlueprint(p.bp) as any; download(`${p.bp.id}.rules.json`, JSON.stringify(def.rules, null, 1), 'application/json'); },
    mkLibSave(name: string) {
      const p = cur(); if (!p) return;
      const e = libraryEntry(name || `${p.bp.name} scripts`, exportScripts(p.bp));
      store.set(LIB, [e, ...scriptLibrary()].slice(0, 100));
      mk().script = { mode: mk().script?.mode ?? 'merge', report: [`Saved "${e.name}" to your script library.`] }; redraw();
    },
    mkLibDelete(id: string) { store.set(LIB, scriptLibrary().filter((e) => e.id !== id)); redraw(); },
    mkLibExport(id: string) { const e = [...STARTER_SCRIPTS, ...scriptLibrary()].find((x) => x.id === id); if (e) download(`${e.id}.script.json`, JSON.stringify(e.bundle, null, 1), 'application/json'); },
    mkLibAdd(id: string) { const e = [...STARTER_SCRIPTS, ...scriptLibrary()].find((x) => x.id === id); if (e) out.mkImportScripts(e.bundle, e.name); },
    async mkImportScripts(src: File | string | ScriptBundle, label?: string) {
      const m = mk();
      const mode = m.script?.mode ?? 'merge';
      try {
        const bundle = readScripts(typeof src === 'string' ? JSON.parse(src) : src instanceof Blob ? JSON.parse(await src.text()) : src);
        if (label) bundle.from = label;
        let report: string[] = [];
        edit((bp) => { report = importScripts(bp, bundle, mode); }, 'lab');
        m.rawErr = {};
        m.script = { mode, report: bundle.from ? [`From "${bundle.from}":`, ...report] : report };
      } catch (e) { m.script = { mode, err: (e as Error).message }; }
      redraw();
    },
    mkCancelRecipe() { mk().confirm = undefined; redraw(); },
    mkToast() { mk().toast = null; redraw(); },
  };
  return out;
}
export { BLUEPRINTS, slug };
