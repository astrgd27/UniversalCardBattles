// Game Maker screens: the project hub with its blueprint picker, and the Workshop (a path of build stations, live card
// previews, the ability builder, playtests, the AI lab, publishing and the Script Lab). Everything edits a blueprint.
import type { Mod } from '#engine';
import {
  type Ability, type Blueprint, type CardBP, type Cond, type Effect, type TargetPick, pickText, USAGE, balanceReport, setCardCost, type EffectKind, type Phase, type Role, type TargetKind, type When,
  KEYWORD_RULES, RECIPES, ROLES, setRecipeOpt, featuresOf, fitIssues, COND_OP, EVENT_TEXT, UNIT_ROLES, cardText, costLabel, effectText, rulebook, slug,
  type RecipeOpt, type LibraryScript, STARTER_SCRIPTS, type WizAnswers, type WizStep, WIZARD, optionsFor, wizardBuild,
} from '#maker';
import { type MakerUI, type Station, scriptLibrary, BLUEPRINTS, RANKS, STATIONS, newMakerUI, previewMod, problems, profile, projects, published, rankOf } from '../maker.ts';
import { store } from '../storage.ts';
const sideOff = () => store.get<boolean>('ucb-mk-sideoff', false);
const setSideOff = (v: boolean) => store.set('ucb-mk-sideoff', v);
import { SOURCES } from '../modules.ts';
import { type Child, cardFace, cls, h } from './kit.ts';
import { BUILTIN } from '../templates.ts';

type Path = (string | number)[];
const get = (o: any, p: Path) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
const look = (bp: Blueprint) => `--accent:${bp.look.accent};--accent2:${bp.look.accent2}`;

// ---------------------------------------------------------------- bound inputs
function txt(bp: Blueprint, A: any, path: Path, o: { ph?: string; q?: Station; label?: string; wide?: boolean; onval?: (v: string) => void } = {}) {
  const inp = h('input', { type: 'text', value: get(bp, path) ?? '', placeholder: o.ph ?? '', 'data-keep': path.join('.'), 'aria-label': o.label ?? String(path[path.length - 1]),
    class: cls(o.wide && 'wide'), oninput: (e: Event) => { const v = (e.target as HTMLInputElement).value; if (o.onval) o.onval(v); else A.mkSet(path, v, o.q); } });
  return o.label ? h('label', { class: 'fld' }, h('span', {}, o.label), inp) : inp;
}
function area(bp: Blueprint, A: any, path: Path, o: { ph?: string; label?: string; q?: Station; rows?: number } = {}) {
  const t = h('textarea', { rows: o.rows ?? 3, placeholder: o.ph ?? '', 'data-keep': path.join('.'), 'aria-label': o.label ?? 'text',
    oninput: (e: Event) => A.mkSet(path, (e.target as HTMLTextAreaElement).value || undefined, o.q) }, get(bp, path) ?? '');
  return o.label ? h('label', { class: 'fld wide' }, h('span', {}, o.label), t) : t;
}
function num(bp: Blueprint, A: any, path: Path, o: { min?: number; max?: number; step?: number; label?: string; q?: Station; title?: string; dflt?: number } = {}) {
  const inp = h('input', { type: 'number', value: get(bp, path) ?? o.dflt ?? 0, min: o.min ?? 0, max: o.max, step: o.step ?? 1, 'aria-label': o.label ?? String(path[path.length - 1]), title: o.title,
    onchange: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); if (!Number.isNaN(v)) A.mkSet(path, v, o.q); } });
  return o.label ? h('label', { class: 'fld' }, h('span', {}, o.label), inp) : inp;
}
function sel(bp: Blueprint, A: any, path: Path, options: [string, string][], o: { label?: string; q?: Station; map?: (v: string) => unknown } = {}) {
  const v = String(get(bp, path) ?? '');
  const s = h('select', { 'aria-label': o.label ?? String(path[path.length - 1]), onchange: (e: Event) => { const x = (e.target as HTMLSelectElement).value; A.mkSet(path, o.map ? o.map(x) : x, o.q); } },
    options.map(([k, t]) => h('option', { value: k, selected: k === v }, t)));
  return o.label ? h('label', { class: 'fld' }, h('span', {}, o.label), s) : s;
}
function chk(bp: Blueprint, A: any, path: Path, label: string, q?: Station, hint?: string) {
  return h('label', { class: 'chk', title: hint ?? '' }, h('input', { type: 'checkbox', checked: !!get(bp, path), onchange: (e: Event) => A.mkSet(path, (e.target as HTMLInputElement).checked, q) }), h('span', {}, label));
}
function colorIn(bp: Blueprint, A: any, path: Path, label: string, q?: Station) {
  return h('label', { class: 'fld color' }, h('span', {}, label), h('input', { type: 'color', value: get(bp, path) ?? '#888888', onchange: (e: Event) => A.mkSet(path, (e.target as HTMLInputElement).value, q) }));
}
const panel = (title: string, ...kids: Child[]) => h('section', { class: 'mk-panel' }, h('h3', {}, title), kids);
const hint = (t: string) => h('p', { class: 'mk-hint' }, t);
const row = (...kids: Child[]) => h('div', { class: 'mk-row' }, kids);
/** Advanced options tucked behind a disclosure; its open state survives redraws. `on` counts options in use. */
const moreOpen = new Set<string>();
const more = (key: string, title: string, on: number, ...kids: Child[]) => h('details', { class: 'mk-more', open: moreOpen.has(key),
  ontoggle: (e: Event) => { if ((e.target as HTMLDetailsElement).open) moreOpen.add(key); else moreOpen.delete(key); } },
  h('summary', {}, title, on ? h('span', { class: 'chip good' }, `${on} in use`) : null), kids);
const count = (...v: unknown[]) => v.filter((x) => x !== undefined && x !== null && x !== false && x !== 0 && x !== '' && !(Array.isArray(x) && !x.length)).length;
function modeCards<T extends string>(cur: T, modes: [T, string, string, string][], pick: (v: T) => void) {
  return h('div', { class: 'mk-modes' }, modes.map(([v, icon, name, desc]) => h('button', { class: cls('mk-mode', v === cur && 'on'), onclick: () => pick(v), 'data-mode': v },
    h('span', { class: 'mk-mode-icon' }, icon), h('strong', {}, name), h('span', { class: 'muted' }, desc))));
}

// ---------------------------------------------------------------- hub
export function makerScreen(ui: any, A: any) {
  const mk: MakerUI = (ui.mk ??= newMakerUI());
  const p = mk.project ? store.get<any>(`ucb-maker:${mk.project}`, null) : null;
  if (mk.project && !p) mk.project = null;
  return p ? workshop(ui, A, mk, p.bp) : hub(ui, A, mk);
}
function rankBadge() {
  const pr = profile();
  const r = rankOf(pr.xp);
  const pct = r.next ? Math.round((100 * (pr.xp - r.floor)) / (r.next - r.floor)) : 100;
  return h('div', { class: 'mk-rank', title: `${pr.xp} maker XP${r.next ? ` · next rank at ${r.next}` : ''}` },
    h('span', { class: 'mk-rank-name' }, `⚒ ${r.name}`), h('span', { class: 'mk-xpbar' }, h('i', { style: `width:${pct}%` })), h('span', { class: 'muted' }, `${pr.xp} XP`));
}
function hub(ui: any, A: any, mk: MakerUI) {
  const list = projects();
  return h('div', { class: 'screen maker mk-hub' },
    h('header', { class: 'mk-hero' },
      h('button', { class: 'back', onclick: () => A.go('library') }, '← Library'),
      h('div', { class: 'mk-hero-title' }, h('div', { class: 'logo-mark mk-logo' }, '⚒'),
        h('div', {}, h('h1', {}, 'Game Maker'), h('p', {}, 'Invent a card game, playtest it against the AI, and publish it to your library.'))),
      rankBadge()),
    h('div', { class: 'tiles' },
      h('button', { class: 'tile mk-newtile', onclick: () => A.mkPicker(true), 'data-act': 'mk-new' },
        h('span', { class: 'tile-emblem' }, '+'), h('span', { class: 'tile-title' }, 'New game'), h('span', { class: 'tile-tag' }, 'Start from a blueprint or a blank canvas')),
      list.map(({ id, p }) => h('div', { class: 'tile mk-proj', style: look(p.bp) },
        h('button', { class: 'mk-proj-open', onclick: () => A.mkLoad(id), 'data-project': id, 'aria-label': `Open ${p.bp.name}` }),
        published(p.bp.id) && h('span', { class: 'tile-badge' }, 'Published'),
        h('span', { class: 'tile-emblem' }, p.bp.look.glyph),
        h('span', { class: 'tile-title' }, p.bp.name),
        h('span', { class: 'tile-tag' }, p.bp.tagline),
        h('span', { class: 'tile-meta' }, h('span', { class: 'chip' }, `${p.bp.cards.length} cards`), h('span', { class: 'chip' }, `edited ${new Date(p.updated).toLocaleDateString()}`)),
        h('button', { class: 'x mk-del', onclick: () => A.mkDelete(id), 'aria-label': `Delete ${p.bp.name}` }, '🗑'))),
      h('label', { class: 'tile tile-add' }, h('span', { class: 'tile-emblem' }, '⬆'), h('span', { class: 'tile-title' }, 'Import blueprint'), h('span', { class: 'tile-tag' }, 'Open a .maker.json file'),
        h('input', { type: 'file', accept: '.json,application/json', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.mkImportJson(f); } }))),
    h('section', { class: 'mk-ranks' }, h('h3', {}, 'Maker ranks'), h('div', { class: 'mk-rank-row' }, RANKS.map(([xp, n]) => h('span', { class: cls('chip', profile().xp >= xp && 'good') }, `${n} · ${xp} XP`)))),
    mk.picker && picker(A), mk.wiz && wizard(A, mk.wiz));
}
function picker(A: any) {
  return h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Choose a blueprint', onclick: (e: Event) => { if (e.target === e.currentTarget) A.mkPicker(false); } },
    h('div', { class: 'mk-picker' },
      h('div', { class: 'mk-picker-head' }, h('h2', {}, 'Pick a blueprint'), h('button', { class: 'x', onclick: () => A.mkPicker(false), 'aria-label': 'Close' }, '×')),
      hint('Each blueprint is a complete, playable game built around one family of mechanics. Reshape anything once you are in the Workshop.'),
      h('div', { class: 'mk-bps' }, h('button', { class: 'mk-bp mk-guided', onclick: () => A.mkWizard(true), 'data-blueprint': 'wizard' }, h('span', { class: 'mk-bp-icon' }, '🧭'), h('strong', {}, 'Guided setup'),
        h('span', {}, 'A step-by-step tour of every system a card game can have: theme, resources, combat, winning, decks, card types, keywords and extras. Pick presets, tweak a few numbers, skip anything.'),
        h('span', { class: 'mk-bp-sys' }, h('span', { class: 'chip' }, `${WIZARD.length - 1} steps`), h('span', { class: 'chip' }, 'Everything optional'))),
        h('button', { class: 'mk-bp mk-surprise', onclick: () => A.mkSurprise(), 'data-blueprint': 'surprise' }, h('span', { class: 'mk-bp-icon' }, '🎲'), h('strong', {}, 'Surprise me'),
        h('span', {}, 'A random, playable mash-up of mechanics from the shelf: a resource system, a combat style, a way to win, timing and special card types.'), h('span', { class: 'mk-bp-sys' }, h('span', { class: 'chip' }, 'Random recipes'))),
        BLUEPRINTS.map((b) => h('button', { class: 'mk-bp', onclick: () => A.mkNew(b.id), 'data-blueprint': b.id },
        h('span', { class: 'mk-bp-icon' }, b.icon), h('strong', {}, b.name), h('span', {}, b.pitch), h('span', { class: 'mk-bp-sys' }, b.systems.map((s) => h('span', { class: 'chip' }, s))))),
        [...SOURCES].map(([id, bp]) => h('button', { class: 'mk-bp', onclick: () => A.mkNew(`mod:${id}`), 'data-blueprint': `mod:${id}` },
          h('span', { class: 'mk-bp-icon' }, bp.look?.glyph ?? '✦'), h('strong', {}, `Remix ${bp.name}`), h('span', {}, bp.tagline ?? ''),
          h('span', { class: 'mk-bp-sys' }, h('span', { class: 'chip' }, 'Default game'), h('span', { class: 'chip' }, `${bp.cards?.length ?? 0} cards`)))))));
}

// ---------------------------------------------------------------- guided setup (wizard)
function wizField(A: any, a: WizAnswers, f: NonNullable<WizStep['fields']>[number]) {
  const v = a.vals[f.id] ?? f.def;
  const id = `wiz-${f.id}`;
  const inp = f.kind === 'select'
    ? h('select', { id, 'data-wiz': f.id, onchange: (e: Event) => A.mkWizVal(f.id, (e.target as HTMLSelectElement).value) }, (f.choices ?? []).map(([k, n]) => h('option', { value: k, selected: String(v) === k }, n)))
    : h('input', { id, 'data-wiz': f.id, 'data-keep': id, type: f.kind === 'num' ? 'number' : 'text', value: String(v), min: f.min, max: f.max,
      oninput: (e: Event) => { const t = (e.target as HTMLInputElement).value; A.mkWizVal(f.id, f.kind === 'num' ? (t === '' ? '' : Number(t)) : t, false); } });
  return h('label', { class: 'fld', for: id }, h('span', {}, f.label), inp);
}
function wizSummary(a: WizAnswers) {
  return WIZARD.filter((st) => st.id !== 'review').map((st) => {
    const ok = optionsFor(st, a);
    const chosen = ok.filter((o) => (a.picks[st.id] ?? []).includes(o.id));
    const shown = st.multi ? (chosen.length ? chosen.map((o) => o.name).join(', ') : 'None') : (chosen[0] ?? ok[0])?.name ?? '—';
    const vals = (st.fields ?? []).filter((f) => !f.when || f.when(a)).map((f) => `${f.label}: ${f.kind === 'select' ? f.choices?.find(([k]) => k === String(a.vals[f.id] ?? f.def))?.[1] : a.vals[f.id] ?? f.def}`);
    return h('div', { class: 'mk-wsum' }, h('span', { class: 'mk-wsum-k' }, `${st.icon} ${st.title}`), h('span', {}, shown, !st.multi && !chosen.length && h('em', { class: 'muted' }, ' (default)'), vals.length > 0 && h('span', { class: 'muted' }, ` · ${vals.join(' · ')}`)));
  });
}
function wizard(A: any, w: { step: number; a: WizAnswers }) {
  const st = WIZARD[w.step];
  const a = w.a;
  const ok = optionsFor(st, a);
  const picked = a.picks[st.id] ?? [];
  const isOn = (id: string) => picked.includes(id) || (!st.multi && !ok.some((o) => picked.includes(o.id)) && ok[0]?.id === id);
  const fields = (st.fields ?? []).filter((f) => !f.when || f.when(a));
  let body: Child;
  if (st.id === 'review') {
    const bp = wizardBuild(a);
    const mod = previewMod(bp);
    const probs = problems(bp).filter((p) => p.level === 'bug');
    const roleOf = (c: CardBP) => bp.types.find((t) => t.id === c.type)?.role;
    const samples = [...bp.colors.map((c) => bp.cards.find((k) => k.color === c.id && UNIT_ROLES.includes(roleOf(k) as Role) && (typeof k.cost !== 'number' || k.cost >= 3))), bp.cards.find((k) => roleOf(k) === 'spell')]
      .filter((k): k is CardBP => !!k).slice(0, 4);
    const deckSize = Object.values(bp.decks[0]?.main ?? {}).reduce((t, n) => t + n, 0);
    body = h('div', { class: 'mk-wreview' },
      h('div', { class: 'mk-wsums' }, h('h3', {}, bp.name), h('p', { class: 'muted' }, bp.tagline),
        h('div', { class: 'mk-wstats' }, h('span', { class: 'chip' }, `${bp.cards.length} cards`), h('span', { class: 'chip' }, `${bp.decks.length} starter deck${bp.decks.length === 1 ? '' : 's'}`), h('span', { class: 'chip' }, `${deckSize}-card decks`),
          h('span', { class: cls('chip', probs.length ? 'bad' : 'good') }, probs.length ? `🐞 ${probs.length} to fix` : '✓ Ready to play')),
        wizSummary(a)),
      h('div', { class: 'mk-preview' }, h('h4', {}, 'Sample cards'), mod ? samples.map((c) => mod.card.has(c.id) && cardFace(mod, c.id, { size: 'md' })) : hint('Preview unavailable.')));
  } else {
    body = h('div', {},
      ok.length > 0 && h('div', { class: 'mk-wopts', role: st.multi ? 'group' : 'radiogroup', 'aria-label': st.title }, ok.map((o) => h('button', {
        class: cls('mk-wopt', isOn(o.id) && 'on'), role: st.multi ? 'checkbox' : 'radio', 'aria-checked': isOn(o.id) ? 'true' : 'false', 'data-wopt': o.id, onclick: () => A.mkWizPick(st.id, o.id) },
        h('span', { class: 'mk-wopt-icon' }, o.icon), h('strong', {}, o.name), h('span', {}, o.desc), !st.multi && !picked.length && ok[0].id === o.id && h('span', { class: 'chip' }, 'Default')))),
      fields.length > 0 && h('div', { class: 'mk-wfields' }, fields.map((f) => wizField(A, a, f))));
  }
  const last = w.step === WIZARD.length - 1;
  return h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Guided setup', onclick: (e: Event) => { if (e.target === e.currentTarget) A.mkWizard(false); } },
    h('div', { class: 'mk-picker mk-wiz' },
      h('div', { class: 'mk-picker-head' }, h('h2', {}, `🧭 Guided setup · ${st.icon} ${st.title}`), h('span', { class: 'muted' }, `Step ${w.step + 1} of ${WIZARD.length}`), h('button', { class: 'x', onclick: () => A.mkWizard(false), 'aria-label': 'Close' }, '×')),
      h('nav', { class: 'mk-wsteps', 'aria-label': 'Wizard steps' }, WIZARD.map((x, i) => h('button', { class: cls('mk-wstep', i === w.step && 'on', i < w.step && 'done'), title: x.title, 'aria-label': x.title, onclick: () => A.mkWizJump(i) }, x.icon))),
      hint(st.help + (st.multi ? ' Pick any number, or none.' : '')),
      body,
      h('div', { class: 'mk-wfoot' },
        h('button', { class: 'ghost', onclick: () => A.mkWizGo(-1), disabled: w.step === 0, 'data-act': 'wiz-back' }, '← Back'),
        !last && h('button', { class: 'ghost', onclick: () => A.mkWizGo(1, true), 'data-act': 'wiz-skip', title: 'Use the default for this step' }, 'Skip'),
        !last && h('button', { class: 'cta', onclick: () => A.mkWizGo(1), 'data-act': 'wiz-next' }, 'Next →'),
        !last && h('button', { class: 'ghost', onclick: () => A.mkWizJump(WIZARD.length - 1), 'data-act': 'wiz-finish' }, 'Skip to review'),
        last && h('button', { class: 'cta', onclick: () => A.mkWizCreate(), 'data-act': 'wiz-create' }, '✓ Create my game'))));
}

// ---------------------------------------------------------------- workshop shell
function workshop(ui: any, A: any, mk: MakerUI, bp: Blueprint) {
  const mod = previewMod(bp);
  const probs = problems(bp);
  const bugs = probs.filter((p) => p.level === 'bug');
  const done = new Set(profile().quests);
  const views: Record<Station, () => Child> = {
    identity: () => identity(bp, A), shelf: () => shelf(bp, A, mk), frames: () => frames(bp, A, mk, mod), types: () => types(bp, A), board: () => board(bp, A, mod), turn: () => turn(bp, A),
    rules: () => rules(bp, A), keywords: () => keywords(bp, A), cards: () => cardsView(bp, A, mk, mod), decks: () => decksView(bp, A, mk, mod, probs), test: () => testView(bp, A, mk, bugs.length),
    publish: () => publishView(bp, A, bugs.length), lab: () => labView(bp, A, mk, mod),
  };
  const st = STATIONS.find((s) => s.id === mk.station)!;
  const celebrating = Date.now() - mk.celebrate < 2600;
  return h('div', { class: 'screen maker mk-shop', style: look(bp) },
    h('header', { class: 'mk-top' },
      h('button', { class: 'back', onclick: A.mkClose }, '← Projects'),
      h('span', { class: 'mk-glyph' }, bp.look.glyph), h('h2', {}, bp.name || 'Untitled'),
      rankBadge(),
      h('button', { class: 'x', onclick: A.mkUndo, disabled: !mk.undo.length, title: 'Undo', 'aria-label': 'Undo', 'data-act': 'mk-undo' }, '↶'),
      h('button', { class: 'x', onclick: A.mkRedo, disabled: !mk.redo.length, title: 'Redo', 'aria-label': 'Redo' }, '↷'),
      h('button', { class: cls('mk-bugs', bugs.length ? 'bad' : 'good'), onclick: () => A.mkStation('test'), title: 'Problems that stop the game from building' }, bugs.length ? `🐞 ${bugs.length} to fix` : '✓ Ready to play'),
      h('button', { class: 'cta small', onclick: A.mkPlaytest, disabled: bugs.length > 0, 'data-act': 'mk-play' }, '▶ Playtest'),
      h('button', { class: cls('chip', !sideOff() && 'on'), onclick: () => { setSideOff(!sideOff()); A.mkSel('filter', mk.filter); }, title: 'Show or hide the guide and quests', 'aria-label': 'Toggle the guide panel' }, sideOff() ? '💡 Guide' : '💡 Hide guide')),
    h('div', { class: cls('mk-body', sideOff() && 'side-off') },
      h('nav', { class: 'mk-path', 'aria-label': 'Build stations' }, STATIONS.map((s, i) => h('button', { class: cls('mk-station', s.id === mk.station && 'on', done.has(s.quest) && 'done'), onclick: () => A.mkStation(s.id), 'data-station': s.id },
        h('span', { class: 'mk-st-n' }, done.has(s.quest) ? '★' : String(i + 1)), h('span', { class: 'mk-st-icon' }, s.icon), h('span', { class: 'mk-st-name' }, s.name)))),
      h('main', { class: 'mk-main' }, h('div', { class: 'mk-head' }, h('h2', {}, `${st.icon} ${st.name}`), h('span', { class: cls('chip', done.has(st.quest) && 'good') }, done.has(st.quest) ? `★ ${st.goal}` : `Quest · ${st.goal} (+${st.xp} XP)`)), views[mk.station]()),
      !sideOff() && h('aside', { class: 'mk-side' }, guide(mk.station, probs, A, mk))),
    mk.toast && Date.now() - mk.toast.at < 6000 && h('button', { class: 'mk-toast', onclick: A.mkToast }, mk.toast.xp ? h('span', { class: 'mk-xp' }, `+${mk.toast.xp} XP`) : null, mk.toast.text),
    celebrating && h('div', { class: 'mk-confetti', 'aria-hidden': 'true' }, Array.from({ length: 28 }, (_, i) => h('i', { style: `--i:${i};animation-delay:-${Date.now() - mk.celebrate}ms` }))));
}

const TIPS: Record<Station, string> = {
  identity: 'Every great game starts with a name. Pick colors that fit its mood; your emblem shows on the library tile.',
  shelf: 'Mix and match! Each recipe drops a whole mechanic into your game: its stats, card types, keywords, rules and a few example cards. Stack as many as you like, then tune them.',
  frames: 'Click a frame family, then place each stat in a corner. The preview is a real card from your game.',
  types: 'Roles decide what a card type does: units fight, spells resolve and leave, traps hide face down, leaders start in play.',
  board: 'These are the zones your table will draw. Rename them to match your world: "Battlefield", "Graveyard", "Bench"...',
  turn: 'A turn runs top to bottom. Ready untaps, Draw draws, Main lets players act, Combat opens attacks, End cleans up.',
  rules: 'This is the heart of your game. Pick one resource system and one combat style, then decide how someone wins.',
  keywords: 'Keywords are shorthand. Give one a built-in rule (like "attacks right away") or keep it as flavor for your own scripts.',
  cards: 'Pick a card, then stack ability blocks: When → (If) → Do. The rules text writes itself as you build.',
  decks: 'Each deck needs enough cards to be legal. Auto-fill gets you there fast; then tune the counts.',
  test: 'Play your game right here. The AI Lab plays many games to tell you whether your decks are balanced.',
  publish: 'Published games appear in your library like any other. Export a .zip to share it with friends.',
  lab: 'For deeper ideas: patch the compiled rules with JSON in the engine DSL (see docs/DSL.md). Card-level scripts live in each card\'s Advanced box.',
};
function guide(st: Station, probs: ReturnType<typeof problems>, A: any, mk: MakerUI) {
  const done = new Set(profile().quests);
  const next = STATIONS.find((s) => !done.has(s.quest));
  const go = (w?: string) => {
    if (!w) return;
    if (w.startsWith('card:')) { mk.card = w.slice(5); A.mkStation('cards'); } else if (w.startsWith('deck:')) { mk.deck = w.slice(5); A.mkStation('decks'); }
    else A.mkStation(({ identity: 'identity', types: 'types', rules: 'rules', turn: 'turn', decks: 'decks', look: 'identity', advanced: 'lab' } as Record<string, Station>)[w] ?? 'rules');
  };
  return [
    h('div', { class: 'mk-guide' }, h('span', { class: 'mk-bot', 'aria-hidden': 'true' }, '🤖'), h('div', {}, h('strong', {}, 'Gizmo'), h('p', {}, TIPS[st]),
      next && h('p', { class: 'muted' }, `Next quest: ${next.goal}`))),
    h('div', { class: 'mk-problems' }, h('h4', {}, probs.length ? `Checks (${probs.length})` : 'Checks'),
      probs.length ? probs.slice(0, 14).map((p) => h('button', { class: cls('mk-prob', p.level), onclick: () => go(p.where) }, p.level === 'bug' ? '🐞 ' : '💡 ', p.text))
        : h('p', { class: 'muted' }, 'No problems found. Your game builds!')),
    h('div', { class: 'mk-quests' }, h('h4', {}, 'Quests'), STATIONS.map((s) => h('div', { class: cls('mk-q', done.has(s.quest) && 'done') }, done.has(s.quest) ? '★ ' : '☆ ', s.goal))),
  ];
}

// ---------------------------------------------------------------- 1. identity
const GLYPHS = ['✦', '⚔', '✺', '☥', '⚓', '✹', '✪', '⟁', '☾', '❖', '♜', '⚡', '🐉', '🔥', '🌊', '🌙', '👁', '🗡', '🛡', '🍄', '🤖', '👑', '🎲', '💀'];
function identity(bp: Blueprint, A: any) {
  return [
    panel('Name', row(txt(bp, A, ['name'], { label: 'Game name', q: 'identity', wide: true }), txt(bp, A, ['tagline'], { label: 'Tagline', q: 'identity', wide: true })),
      row(txt(bp, A, ['author'], { label: 'Designer' }), txt(bp, A, ['id'], { label: 'Game id', onval: (v) => A.mkSet(['id'], slug(v)) }),
        h('button', { class: 'ghost', onclick: () => A.mkSet(['id'], slug(bp.name)) }, 'Id from name'))),
    panel('Board & layout', hint('How the battle table draws your game. Auto picks a duel mat for slot boards (Board grid in Rules) and a battlefield strip for battlefields.'),
      row(sel(bp, A, ['look', 'board', 'layout'], [['auto', 'Auto'], ['free', 'Free-form zones'], ...(bp.combat.grid ? [['mat', 'Duel mat (fixed slots)'] as [string, string]] : []), ...(bp.combat.mode === 'lanes' ? [['lanes', 'Battlefield strip'] as [string, string]] : [])], { label: 'Layout' }),
        sel(bp, A, ['look', 'board', 'labels'], [['top', 'Small, on top'], ['side', 'On the side'], ['hidden', 'Hidden']], { label: 'Zone names' }),
        sel(bp, A, ['look', 'board', 'scale'], [['1', 'Normal'], ['0.8', 'Smaller'], ['0.9', 'A bit smaller'], ['1.1', 'A bit bigger'], ['1.25', 'Bigger']], { label: 'Board card size', map: (v) => Number(v) }),
        sel(bp, A, ['look', 'board', 'used'], [['', `Default (${bp.combat.positions || ['duel', 'runs'].includes(bp.combat.mode) ? 'badge' : 'tilt'})`], ['tilt', 'Tilt sideways (tap / exhaust)'], ['dim', 'Dim the card'], ['badge', 'Small "used" badge'], ['none', 'No change']], { label: 'Cards that attacked or used an ability', map: (v) => v || undefined }),
        bp.combat.positions && sel(bp, A, ['look', 'board', 'defenseSideways'], [['', 'Defense position sideways'], ['false', 'Defense position upright with a DEF tag']], { label: 'Defense position', map: (v) => (v ? false : undefined) }),
        bp.combat.grid && sel(bp, A, ['look', 'board', 'slotNames'], [['', 'Shown'], ['false', 'Hidden']], { label: 'Slot names (M1, S1…)', map: (v) => (v ? false : undefined) })),
      bp.combat.grid && row(...([['lm', 'Left of monsters'], ['ls', 'Left of spells/traps'], ['rm', 'Right of monsters'], ['rs', 'Right of spells/traps']] as const).map(([k, l]) =>
        sel(bp, A, ['look', 'board', 'corners', k], [['', 'Default'], ['deck', 'Deck'], ['grave', 'Discard pile'], ['extra', 'Extra deck'], ['banished', 'Banished'], ...(bp.zones ?? []).map((z) => [z.id, z.name] as [string, string])], { label: l, map: (v) => v || undefined })))),
    panel('Look', row(colorIn(bp, A, ['look', 'accent'], 'Main color', 'identity'), colorIn(bp, A, ['look', 'accent2'], 'Second color', 'identity'), txt(bp, A, ['look', 'glyph'], { label: 'Emblem' })),
      h('div', { class: 'mk-glyphs' }, GLYPHS.map((g) => h('button', { class: cls('mk-gl', g === bp.look.glyph && 'on'), onclick: () => A.mkSet(['look', 'glyph'], g, 'identity') }, g))),
      h('div', { class: 'tiles mk-preview-tile' }, h('div', { class: 'tile', style: look(bp) }, h('span', { class: 'tile-emblem' }, bp.look.glyph), h('span', { class: 'tile-title' }, bp.name), h('span', { class: 'tile-tag' }, bp.tagline)))),
    panel('Colors (factions, mana colors, energy types)',
      hint('Colors tint card frames and can be typed costs ("2 Ember + 1 any"). Leave empty for a colorless game.'),
      bp.colors.map((c, i) => row(txt(bp, A, ['colors', i, 'name'], { label: 'Name' }), colorIn(bp, A, ['colors', i, 'hex'], 'Tint'), txt(bp, A, ['colors', i, 'icon'], { label: 'Icon' }),
        h('span', { class: 'muted' }, `id: ${c.id}`), h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.colors.splice(i, 1); }), 'aria-label': 'Remove color' }, '🗑'))),
      h('button', { onclick: () => A.mkEdit((b: Blueprint) => { const id = `color${b.colors.length + 1}`; b.colors.push({ id, name: `Color ${b.colors.length + 1}`, hex: '#888888', icon: '●' }); }) }, '+ Add color')),
  ];
}

// ---------------------------------------------------------------- 2. frames
const POS: [string, string][] = [['', 'hidden'], ['tl', 'top left'], ['tr', 'top right'], ['bl', 'bottom left'], ['br', 'bottom right'], ['line', 'stat line']];
function frames(bp: Blueprint, A: any, mk: MakerUI, mod: Mod | null) {
  const ti = Math.max(0, bp.types.findIndex((t) => t.id === mk.type));
  const t = bp.types[ti];
  if (!t) return hint('Add a card type first.');
  const fp: Path = ['types', ti, 'frame'];
  const samples = bp.cards.filter((c) => c.type === t.id).slice(0, 3);
  const slotOf = (stat: string) => t.frame.stats.find((s) => s.stat === stat);
  const setSlot = (stat: string, patch: Record<string, string> | null) => A.mkEdit((b: Blueprint) => {
    const f = b.types[ti].frame;
    const cur = f.stats.find((s) => s.stat === stat);
    if (!patch) f.stats = f.stats.filter((s) => s.stat !== stat);
    else if (cur) Object.assign(cur, patch);
    else f.stats.push({ stat, pos: 'br', ...patch } as any);
  }, 'frames');
  return [
    h('div', { class: 'mk-tabs' }, bp.types.map((x) => h('button', { class: cls('chip', x.id === t.id && 'on'), onclick: () => A.mkSel('type', x.id) }, `${x.icon ?? ''} ${x.name}`))),
    h('div', { class: 'mk-split' },
      h('div', {},
        panel('Frame family', h('div', { class: 'mk-families' }, Object.entries(BUILTIN).map(([id, f]) => h('button', { class: cls('mk-fam', t.frame.base === id && 'on'), onclick: () => A.mkSet([...fp, 'base'], id, 'frames'), title: f.label }, h('strong', {}, id), h('span', { class: 'muted' }, f.label.split(' — ')[1] ?? ''))))),
        panel('Layout',
          row(sel(bp, A, [...fp, 'cost'], [['tl', 'Cost top left'], ['tr', 'Cost top right'], ['none', 'No cost shown']], { label: 'Cost', q: 'frames' }),
            sel(bp, A, [...fp, 'layout'], [['portrait', 'Portrait'], ['landscape', 'Landscape']], { label: 'Shape', q: 'frames' }),
            sel(bp, A, [...fp, 'level'], [['', 'No stars'], ...bp.stats.map((s) => [s.id, `Stars from ${s.name}`] as [string, string])], { label: 'Star row', q: 'frames', map: (v) => v || undefined })),
          row(h('label', { class: 'fld wide' }, h('span', {}, `Art window: ${t.frame.art}%`), h('input', { type: 'range', min: 20, max: 80, value: t.frame.art, onchange: (e: Event) => A.mkSet([...fp, 'art'], Number((e.target as HTMLInputElement).value), 'frames') })),
            chk(bp, A, [...fp, 'text'], 'Show rules text', 'frames'))),
        panel('Stats on the frame', bp.stats.map((s) => {
          const sl = slotOf(s.id);
          return row(h('strong', { class: 'mk-statname' }, s.name),
            h('select', { 'aria-label': `${s.name} position`, onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; setSlot(s.id, v ? { pos: v } : null); } },
              POS.map(([v, l]) => h('option', { value: v, selected: (sl?.pos ?? '') === v }, l))),
            sl && h('input', { type: 'text', value: sl.icon ?? '', placeholder: 'icon', 'aria-label': `${s.name} icon`, class: 'tiny', onchange: (e: Event) => setSlot(s.id, { icon: (e.target as HTMLInputElement).value }) }),
            sl && h('input', { type: 'text', value: sl.label ?? '', placeholder: 'label', 'aria-label': `${s.name} label`, class: 'tiny', onchange: (e: Event) => setSlot(s.id, { label: (e.target as HTMLInputElement).value }) }));
        }))),
      h('div', { class: 'mk-preview' }, h('h4', {}, 'Live preview'), mod && samples.length ? samples.map((c) => cardFace(mod, c.id, { size: 'lg' })) : hint(`Make a ${t.name} card to see it here.`))),
  ];
}

// ---------------------------------------------------------------- 3. types & stats
const ROLE_OPTS = Object.entries(ROLES).map(([k, v]) => [k, v.label] as [string, string]);
const FRAME_FOR: Record<Role, string> = { ice: 'monster', agenda: 'spell', location: 'spell', attack: 'classic', unit: 'skirmisher', spell: 'spell', fast: 'spell', permanent: 'spell', attachment: 'spell', resource: 'resource', trap: 'spell', leader: 'leader', evolution: 'vital', extra: 'monster', token: 'token', battlefield: 'spell', walker: 'leader' };
function types(bp: Blueprint, A: any) {
  const used = (id: string) => bp.cards.some((c) => c.type === id);
  return [
    panel('Card types', hint('A card type is a kind of card: its role decides how it is played.'),
      bp.types.map((t, i) => h('div', { class: 'mk-typerow' },
        txt(bp, A, ['types', i, 'icon'], { label: 'Icon' }), txt(bp, A, ['types', i, 'name'], { label: 'Name', q: 'types' }),
        sel(bp, A, ['types', i, 'role'], ROLE_OPTS, { label: 'Role', q: 'types' }),
        h('span', { class: 'muted mk-rolehint' }, ROLES[t.role].hint),
        t.role === 'permanent' && (bp.zones ?? []).length > 0 && sel(bp, A, ['types', i, 'playTo'], [['', 'Support area'], ...bp.zones!.map((z) => [z.id, z.name] as [string, string])], { label: 'Played to', map: (v) => v || undefined }),
        ['spell', 'fast', 'permanent', 'attachment', 'trap'].includes(t.role) && num(bp, A, ['types', i, 'perTurn'], { label: 'Per turn (0 = any)', min: 0, max: 9 }),
        ['spell', 'fast', 'permanent', 'attachment', 'trap'].includes(t.role) && chk(bp, A, ['types', i, 'notFirstTurn'], 'Not on turn 1'),
        t.role === 'attachment' && num(bp, A, ['types', i, 'perUnit'], { label: 'Per unit (0 = any)', min: 0, max: 9 }),
        t.role === 'extra' && sel(bp, A, ['types', i, 'method'], [['materials', 'Send N units'], ['fusion', 'Fusion (recipe, via a fusion effect)'], ['synchro', 'Synchro (tuner + levels)'], ['xyz', 'Xyz (same-level materials attached)'], ['link', 'Link (materials = arrows)']], { label: 'Summoned by' }),
        t.role === 'unit' && chk(bp, A, ['types', i, 'ritual'], 'Ritual (only by a ritual effect)'), t.role === 'spell' && bp.combat.conquest && chk(bp, A, ['types', i, 'showdown'], 'Action: also playable in showdowns on your focus'), t.role === 'fast' && chk(bp, A, ['types', i, 'settable'], 'Can be set, used from next turn'),
        t.role === 'trap' && chk(bp, A, ['types', i, 'speed3'], 'Counter speed (responds to anything)'), t.role === 'trap' && chk(bp, A, ['types', i, 'continuous'], 'Continuous (stays face up)'),
        bp.setup.sides && sel(bp, A, ['types', i, 'side'], [['', 'Both sides'], ['0', bp.setup.sides[0]], ['1', bp.setup.sides[1]]], { label: 'Side', map: (v) => (v === '' ? undefined : Number(v)) }),
        t.role === 'permanent' && bp.setup.sides && [chk(bp, A, ['types', i, 'memory'], 'Program (uses memory)'), chk(bp, A, ['types', i, 'tagTarget'], 'Trashable while its owner has tags')],
        t.role === 'permanent' && chk(bp, A, ['types', i, 'foundation'], 'Foundation (commit it to help skill checks)'), t.role === 'attachment' && chk(bp, A, ['types', i, 'anyUnit'], 'Can go on enemy units too'), t.role === 'attachment' && chk(bp, A, ['types', i, 'equipment'], 'Equipment (stays; re-equip for a cost)'),
        !!bp.combat.arenas?.length && UNIT_ROLES.includes(t.role) && sel(bp, A, ['types', i, 'zone'], bp.combat.arenas.map((z) => [z.id, z.name] as [string, string]), { label: 'Enters' }),
        h('button', { class: 'x', disabled: used(t.id), title: used(t.id) ? 'Cards still use this type' : 'Remove', onclick: () => A.mkEdit((b: Blueprint) => { b.types.splice(i, 1); }) }, '🗑'))),
      h('div', { class: 'mk-addrow' }, h('span', { class: 'muted' }, 'Add:'), (Object.keys(ROLES) as Role[]).map((r) => h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => {
        let id = slug(ROLES[r].label); let k = 2; while (b.types.some((x) => x.id === id)) id = `${slug(ROLES[r].label)}-${k++}`;
        const st = UNIT_ROLES.includes(r) ? b.stats.slice(0, 2).map((s, j) => ({ stat: s.id, pos: (j ? 'br' : 'bl') as any })) : [];
        b.types.push({ id, name: ROLES[r].label, role: r, icon: '', frame: { base: FRAME_FOR[r], cost: r === 'resource' || r === 'leader' ? 'none' : 'tl', stats: st, art: 48, text: r !== 'resource' } });
      }, 'types') }, `+ ${ROLES[r].label}`)))),
    panel('Stats', hint('Stats are the numbers on cards: power, health, level, counter value... Combat and abilities can use any of them.'),
      bp.stats.map((s, i) => row(txt(bp, A, ['stats', i, 'name'], { label: 'Name', q: 'types' }), txt(bp, A, ['stats', i, 'icon'], { label: 'Icon' }), h('span', { class: 'muted' }, `id: ${s.id}`),
        h('button', { class: 'x', disabled: [bp.combat.power, bp.combat.health, bp.combat.defense].includes(s.id), title: 'Remove (not while combat uses it)', onclick: () => A.mkEdit((b: Blueprint) => { b.stats.splice(i, 1); }) }, '🗑'))),
      h('button', { onclick: () => A.mkEdit((b: Blueprint) => { let id = 'stat'; let k = 2; while (b.stats.some((x) => x.id === id)) id = `stat${k++}`; b.stats.push({ id, name: 'New stat', icon: '' }); }, 'types') }, '+ Add stat')),
  ];
}

// ---------------------------------------------------------------- 4. board
function board(bp: Blueprint, A: any, mod: Mod | null) {
  if (!mod) return hint('Fix the build problems to see the board.');
  const labels = mod.manifest.theme?.labels ?? {};
  const zones = mod.rules.zones.filter((z) => !z.offTable && z.id !== 'limbo');
  const box = (zid: string) => h('div', { class: cls('mk-zone', `z-${zid}`) },
    h('input', { type: 'text', value: bp.zoneNames[zid] ?? labels[zid] ?? zid, 'data-keep': `zone.${zid}`, 'aria-label': `Rename ${zid}`, oninput: (e: Event) => A.mkSet(['zoneNames', zid], (e.target as HTMLInputElement).value, 'board') }),
    h('span', { class: 'muted' }, ({ public: 'everyone sees', owner: 'only its owner sees', hidden: 'face down' } as Record<string, string>)[zones.find((z) => z.id === zid)!.vis]));
  const side = (who: string) => h('div', { class: 'mk-side-board' }, h('h4', {}, who), h('div', { class: 'mk-zones' }, zones.map((z) => box(z.id))));
  return [
    panel('Your table', hint('Each player gets these zones. Rename them to fit your theme.'), h('div', { class: 'mk-board' }, side('Opponent'), h('div', { class: 'mk-midline' }), side('You'))),
    panel('Sizes',
      row(num(bp, A, ['combat', 'fieldSize'], { label: bp.combat.mode === 'lanes' ? 'Units at base' : 'Units on the board', min: 1, max: 20, q: 'board' }),
        bp.combat.mode === 'duel' && num(bp, A, ['combat', 'benchSize'], { label: 'Bench size', min: 1, max: 10, q: 'board' })),
      !['duel', 'lanes'].includes(bp.combat.mode) && h('div', { class: 'mk-sub' }, h('strong', {}, 'Board areas (arenas)'),
        hint('Split the board into named areas: ground and space, a front line and a reserve... Units enter the area their card type says. Areas marked "fight" can attack and block.'),
        (bp.combat.arenas ?? []).map((ar, i) => row(txt(bp, A, ['combat', 'arenas', i, 'name'], { label: 'Area' }), num(bp, A, ['combat', 'arenas', i, 'size'], { label: 'Holds', min: 1, max: 12 }),
          chk(bp, A, ['combat', 'arenas', i, 'attack'], 'Fights from here'), h('span', { class: 'muted' }, `id: ${ar.id}`),
          h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.combat.arenas!.splice(i, 1); if (!b.combat.arenas!.length) b.combat.arenas = undefined; for (const t of b.types) if (t.zone === ar.id) delete t.zone; }), 'aria-label': 'Remove area' }, '🗑'))),
        row(h('button', { onclick: () => A.mkEdit((b: Blueprint) => { const list = (b.combat.arenas ??= []); let id = `area${list.length + 1}`; while (list.some((z) => z.id === id)) id += 'x'; list.push({ id, name: `Area ${list.length + 1}`, size: 5, attack: true }); }, 'board') }, '+ Add area'),
          (bp.combat.arenas?.length ?? 0) > 1 && chk(bp, A, ['combat', 'sameArena'], 'Units only fight units in their own area'))),
      h('div', { class: 'mk-sub' }, h('strong', {}, 'Extra zones'),
        hint('Make your own piles and slots: a banished pile already exists; add a Stadium slot both players share, a graveyard for spells, a hidden vault... Permanent card types can be played into them (Card Types station).'),
        (bp.zones ?? []).map((z, i) => row(txt(bp, A, ['zones', i, 'name'], { label: 'Zone' }),
          sel(bp, A, ['zones', i, 'vis'], [['public', 'Everyone sees it'], ['owner', 'Only its owner sees it'], ['hidden', 'Face down']], { label: 'Visibility' }),
          num(bp, A, ['zones', i, 'size'], { label: 'Holds (0 = any)', min: 0, max: 30 }), chk(bp, A, ['zones', i, 'inPlay'], 'Cards here are in play'),
          chk(bp, A, ['zones', i, 'global'], 'One for the whole table (new replaces old)'), h('span', { class: 'muted' }, `id: ${z.id}`),
          h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.zones!.splice(i, 1); for (const t of b.types) if (t.playTo === z.id) delete t.playTo; }), 'aria-label': 'Remove zone' }, '🗑'))),
        h('button', { onclick: () => A.mkEdit((b: Blueprint) => { const list = (b.zones ??= []); let id = `zone${list.length + 1}`; while (list.some((z) => z.id === id)) id += 'x'; list.push({ id, name: `Zone ${list.length + 1}`, vis: 'public', size: 0, inPlay: false }); }, 'board') }, '+ Add zone')),
      bp.combat.mode === 'lanes' && [hint('Battlefields are shared lanes both players fight over.'),
        bp.combat.lanes.map((_, i) => row(txt(bp, A, ['combat', 'lanes', i], { label: `Battlefield ${i + 1}` }), h('button', { class: 'x', disabled: bp.combat.lanes.length < 2, onclick: () => A.mkEdit((b: Blueprint) => { b.combat.lanes.splice(i, 1); }) }, '🗑'))),
        bp.combat.lanes.length < 4 && h('button', { onclick: () => A.mkEdit((b: Blueprint) => { b.combat.lanes.push(`Battlefield ${b.combat.lanes.length + 1}`); }, 'board') }, '+ Add battlefield')]),
  ];
}

// ---------------------------------------------------------------- 5. turn
const PHASES: [Phase['kind'], string, string, string][] = [
  ['ready', '⟳', 'Ready', 'Untap your cards; start-of-turn effects.'], ['draw', '🂠', 'Draw', 'Draw cards.'], ['resource', '◆', 'Resource', 'Gain resources for the turn.'],
  ['main', '✋', 'Main', 'Players play cards and use abilities.'], ['combat', '⚔', 'Combat', 'Attacks happen here (otherwise in Main).'], ['end', '⏾', 'End', 'Heal, end-of-turn effects, discard to hand size.'],
  ['custom', '⚙', 'Custom', 'Runs your own script (JSON effects).'],
];
function turn(bp: Blueprint, A: any) {
  const info = (k: Phase['kind']) => PHASES.find((p) => p[0] === k)!;
  const move = (i: number, d: number) => A.mkEdit((b: Blueprint) => { const j = i + d; if (j < 0 || j >= b.turn.length) return; [b.turn[i], b.turn[j]] = [b.turn[j], b.turn[i]]; }, 'turn');
  return [
    panel('Timing', modeCards(bp.timing, [
      ['simple', '➜', 'Simple', 'Only the active player acts; quick cards and traps work in battles.'],
      ['stack', '⧗', 'Stack', 'Anyone can respond with quick cards; the last thing played resolves first.'],
      ['chain', '⛓', 'Chain', 'Players take turns adding responses to a chain, then it resolves backwards.'],
    ], (v) => A.mkSet(['timing'], v, 'turn'))),
    panel('Phases of a turn', h('ol', { class: 'mk-phases' }, bp.turn.map((p, i) => h('li', { class: cls('mk-phase', `k-${p.kind}`) },
      h('span', { class: 'mk-ph-icon' }, info(p.kind)[1]),
      txt(bp, A, ['turn', i, 'name'], { label: info(p.kind)[2], q: 'turn' }),
      p.kind === 'draw' && num(bp, A, ['turn', i, 'n'], { label: 'Cards', min: 0, max: 10 }),
      p.kind === 'draw' && num(bp, A, ['turn', i, 'drawTo'], { label: 'Or draw up to (0 = off)', min: 0, max: 12 }),
      (p.kind === 'draw' || p.kind === 'ready') && chk(bp, A, ['turn', i, 'each'], 'Both players'),
      p.kind === 'main' && chk(bp, A, ['turn', i, 'alternate'], 'Players alternate actions'),
      p.kind === 'custom' && h('textarea', { rows: 2, class: 'code', 'aria-label': 'Custom phase effects (JSON)', onchange: (e: Event) => A.mkRaw(`phase${i}`, ['turn', i, 'raw'], (e.target as HTMLTextAreaElement).value) }, JSON.stringify(p.raw ?? [])),
      h('span', { class: 'muted mk-ph-desc' }, info(p.kind)[3]),
      h('span', { class: 'mk-ph-btns' }, h('button', { class: 'x', onclick: () => move(i, -1), 'aria-label': 'Move up' }, '↑'), h('button', { class: 'x', onclick: () => move(i, 1), 'aria-label': 'Move down' }, '↓'),
        h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.turn.splice(i, 1); }, 'turn'), 'aria-label': 'Remove phase' }, '✕'))))),
    h('div', { class: 'mk-addrow' }, h('span', { class: 'muted' }, 'Add a phase:'), PHASES.map(([k, icon, name]) => h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => {
      let id = k as string; let n = 2; while (b.turn.some((x) => x.id === id)) id = `${k}${n++}`;
      const at = Math.max(0, b.turn.findIndex((x) => x.kind === 'end'));
      b.turn.splice(k === 'end' ? b.turn.length : at || b.turn.length, 0, { id, name, kind: k, ...(k === 'draw' ? { n: 1 } : {}) });
    }, 'turn') }, `${icon} ${name}`)))),
  ];
}

// ---------------------------------------------------------------- 6. rules
function rules(bp: Blueprint, A: any) {
  const r = bp.resource, c = bp.combat;
  const stats = bp.stats.map((s) => [s.id, s.name] as [string, string]);
  const R: Path = ['resource'], Cb: Path = ['combat'], W: Path = ['win'], S: Path = ['setup'];
  return [
    panel('Resources: how cards are paid for', modeCards(r.mode, [
      ['ramp', '📈', 'Growing energy', 'Your pool grows by itself each turn.'], ['cards', '⛰', 'Resource cards', 'Play one resource card a turn (lands); they make colored mana.'],
      ['anycard', '🔄', 'Any card as energy', 'Once a turn, put any card from hand into your energy area.'], ['deck', '🪙', 'Resource deck', 'A second deck feeds resources into play each turn.'],
      ['attach', '🔋', 'Attach to units', 'Attach one energy card a turn to a unit; attacks need energy.'], ['pitch', '◆', 'Pitch from hand', 'Pay by pitching cards from hand, each worth its pitch value.'],
      ['bank', '🏦', 'Banked credits', 'Credits carry over between turns; start with some and earn more with actions and cards.'],
      ['check', '🎯', 'Skill checks', 'Play any card by passing a check: the top card of your deck against its difficulty plus the cards already played this turn. Foundations help; a failed check ends your turn.'],
      ['none', '∅', 'Free', 'Cards are free; limit summons per turn instead.'],
    ], (v) => A.mkSet([...R, 'mode'], v, 'rules')),
    r.mode === 'bank' && row(num(bp, A, [...R, 'start'], { label: 'Starting credits', min: 0, max: 50 })),
    (r.actions ?? 0) > 0 && row(sel(bp, A, [...R, 'actionsStat'], [['', 'Same for everyone'], ...stats], { label: 'Actions per turn from the leader stat', map: (v) => v || undefined }),
      chk(bp, A, [...R, 'spendAll'], "Can't end the turn with actions left"), chk(bp, A, [...R, 'basicActions'], "Basic actions: 'draw a card' and 'take 1'")),
    r.mode === 'check' && row(sel(bp, A, [...R, 'checkStat'], stats, { label: 'Check value stat' }), hint('Mark a permanent type as Foundation (Types station) so it can be committed to help checks.')),
    r.mode === 'anycard' && row(chk(bp, A, [...R, 'faceDown'], 'Placed face down (generic resource)'),
      sel(bp, A, [...R, 'onlyKeyword'], [['', 'Any card can be a resource'], ...bp.keywords.map((k) => [k.id, `Only cards with ${k.name}`] as [string, string])], { label: 'Which cards', map: (v) => v || undefined })),
    r.mode === 'pitch' && row(sel(bp, A, [...R, 'pitchStat'], stats, { label: 'Pitch value stat' })),
    more('res', 'More resource options', count(r.levelGate, r.actions, r.need, r.tribute, r.summonsPerTurn), row(sel(bp, A, [...R, 'levelGate'], [['', 'No level requirement'], ...stats], { label: 'Level requirement (stat ≤ resources in play)', map: (v) => v || undefined }),
      num(bp, A, [...R, 'actions'], { label: 'Action points per turn (0 = off)', min: 0, max: 5 })),
    row(h('label', { class: 'fld' }, h('span', {}, 'Energy requirement'), h('select', { 'aria-label': 'Energy requirement', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet([...R, 'need'], v ? { stat: v, gen: r.need?.gen ?? v } : null, 'rules'); } },
      [['', 'Off'], ...stats].map(([v, l]) => h('option', { value: v, selected: (r.need?.stat ?? '') === v }, v ? `Needs: ${l}` : l)))),
      r.need && sel(bp, A, [...R, 'need', 'gen'], stats, { label: 'Made by units\' stat' })), num(bp, A, [...R, 'summonsPerTurn'], { label: 'Summons per turn (0 = any)', min: 0, max: 10 }),
    row(txt(bp, A, [...R, 'name'], { label: 'Resource name' }), txt(bp, A, [...R, 'icon'], { label: 'Icon' }),
      r.mode === 'ramp' && [num(bp, A, [...R, 'start'], { label: 'First turn', min: 0, max: 20 }), num(bp, A, [...R, 'perTurn'], { label: 'Growth per turn', min: 0, max: 10 }), num(bp, A, [...R, 'max'], { label: 'Maximum', min: 1, max: 99 })],
      r.mode === 'deck' && [num(bp, A, [...R, 'deckSize'], { label: 'Resource deck size', min: 1, max: 40 }), num(bp, A, [...R, 'start'], { label: 'First turn', min: 0, max: 10 }), num(bp, A, [...R, 'perTurn'], { label: 'Per turn', min: 0, max: 10 }),
        num(bp, A, [...R, 'secondBonus'], { label: "Extra on the second player's first turn", min: 0, max: 5 })]),
    r.mode === 'deck' && row(chk(bp, A, [...R, 'recycle'], 'Colored costs: recycle resources of that color (each still gives 1 generic)')),
    row(['ramp', 'cards', 'anycard', 'deck'].includes(r.mode) && num(bp, A, [...R, 'boost'], { label: 'Boost (+power per resource, 0 = off)', min: 0, max: 100000, step: 1 }),
      r.boost > 0 && chk(bp, A, [...R, 'give'], 'Boost is "give": main phase only, counted on the card (for "N given" conditions)'),
    ),
    h('div', { class: 'mk-sub' }, h('strong', {}, 'Tribute summons'), hint('Units at or above a level must send units to the discard pile to be summoned.'),
      r.tribute.map((t, i) => row(num(bp, A, [...R, 'tribute', i, 'level'], { label: 'Level at least', min: 1, max: 20 }), num(bp, A, [...R, 'tribute', i, 'n'], { label: 'Tributes', min: 1, max: 5 }),
        h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.resource.tribute.splice(i, 1); }), 'aria-label': 'Remove' }, '🗑'))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { b.resource.tribute.push({ level: 5, n: 1 }); if (!b.stats.some((s) => s.id === 'level')) b.stats.push({ id: 'level', name: 'Level', icon: '★' }); }, 'rules') }, '+ Tribute rule')))),
    panel('Combat: how fights work', modeCards(c.mode, [
      ['block', '🛡', 'Attack & block', 'Attackers hit the player; the defender may block with a unit.'], ['target', '🎯', 'Pick a target', 'Attack a unit, the leader or the player directly.'],
      ['duel', '⚔', 'Active duel', 'One active unit fights; the rest wait on the bench. Units use printed attacks.'], ['lanes', '⟁', 'Battlefields', 'Move units onto shared battlefields; conquer and hold for points.'],
      ['cards', '🗡', 'Attack cards', 'Play attack cards from hand; the defender blocks with cards from hand.'], ['runs', '🏰', 'Runs (asymmetric)', 'One side guards servers with face-down guardians and advances schemes; the other runs the servers, breaks guardians and steals schemes.'], ['none', '☮', 'No combat', 'Win through card effects, points or races.'],
    ], (v) => A.mkSet([...Cb, 'mode'], v, 'rules')),
    c.mode === 'cards' && row(chk(bp, A, [...Cb, 'zones'], 'Attack zones (high/mid/low), speed, enhance step and blocks with a check; hits become momentum'),
      !c.zones && sel(bp, A, [...Cb, 'blockStat'], stats, { label: 'Blocking stat (cards discarded to defend)' })),
    c.mode === 'runs' && row(num(bp, A, [...Cb, 'remotes'], { label: 'Remote servers', min: 1, max: 6 }), num(bp, A, [...Cb, 'memory'], { label: 'Memory for programs', min: 1, max: 10 }),
      hint('Needs two sides (Setup), guardian (ICE) and scheme (agenda) types for side 0, and breaker programs for side 1. Stats: rez, trash, req, points, mu, muPlus.')),
    c.mode === 'cards' && c.zones && hint('Zone combat reads the stats azone (attack zone: 1 low, 2 mid, 3 high), speed, bzone (block zone) and bmod (block modifier).'),
    more('combat', 'More combat options', count(c.conquest, c.grid, c.mass, c.quest, c.finalPoint), c.mode === 'lanes' && c.conquest && row(chk(bp, A, [...Cb, 'playToControlled'], 'Units may be played to a battlefield you control'), chk(bp, A, [...Cb, 'assignDamage'], 'Players assign fight damage (Tank first)')),
    c.mode === 'lanes' && row(chk(bp, A, [...Cb, 'conquest'], 'Conquest: group moves, showdowns, fights with Tank, recall on a tie'), chk(bp, A, [...Cb, 'finalPoint'], 'The winning point needs every battlefield scored this turn'),
      bp.types.some((t) => t.role === 'battlefield') && num(bp, A, [...S, 'sites'], { label: 'Battlefield cards per deck', min: 0, max: 5 })),
    ['block', 'target'].includes(c.mode) && row(chk(bp, A, [...Cb, 'grid'], 'Board grid: units go in numbered columns (players choose), 5 support slots'), c.grid && chk(bp, A, [...Cb, 'emz'], 'Two shared extra zones + link arrows')),
    c.mode === 'block' && row(chk(bp, A, [...Cb, 'mass'], 'Declare all attackers at once; blockers per attacker; first-strike step; attack walkers'), !c.mass && num(bp, A, [...Cb, 'maxBlockers'], { label: 'Blockers per attacker', min: 1, max: 5 })),
    ['block', 'target'].includes(c.mode) && row(sel(bp, A, [...Cb, 'quest'], [['', 'No questing'], ...stats], { label: 'Questing: exhaust to score this stat', map: (v) => v || null }))),
    c.mode !== 'none' && [
      row(sel(bp, A, [...Cb, 'power'], stats, { label: 'Attack stat' }), sel(bp, A, [...Cb, 'health'], [['', 'None (compare power)'], ...stats], { label: 'Health stat', map: (v) => v || null }),
        c.mode === 'target' && sel(bp, A, [...Cb, 'defense'], [['', 'None'], ...stats], { label: 'Defense stat', map: (v) => v || null }),
        c.health && sel(bp, A, [...Cb, 'damage'], [['heal', 'Damage heals each turn'], ['persist', 'Damage stays']], { label: 'Damage' })),
      row(chk(bp, A, [...Cb, 'sickness'], 'New units wait a turn to attack'), chk(bp, A, [...Cb, 'firstTurnAttack'], 'First player may attack on turn 1'),
        !c.firstTurnAttack && chk(bp, A, [...Cb, 'firstTurnEach'], 'Nobody attacks on their own first turn'),
        c.mode === 'duel' && chk(bp, A, [...Cb, 'attackEndsTurn'], 'Attacking ends your turn'), c.mode === 'duel' && num(bp, A, [...Cb, 'weakness'], { label: 'Weakness multiplier', min: 1, max: 4 }),
        c.mode === 'duel' && num(bp, A, [...Cb, 'resistance'], { label: 'Resistance (damage less)', min: 0, max: 1000 }), c.mode === 'duel' && num(bp, A, [...Cb, 'counterSize'], { label: 'Damage per damage counter', min: 1, max: 100 }),
        c.mode === 'duel' && num(bp, A, [...Cb, 'benchSize'], { label: 'Bench size', min: 0, max: 10 })),
      c.mode === 'target' && [
        row(sel(bp, A, [...Cb, 'targetUnits'], [['any', 'Any enemy unit'], ['exhausted', 'Only exhausted (rested) units'], ['none', 'Never units']], { label: 'Units you may attack' }),
          sel(bp, A, [...Cb, 'direct'], [['always', 'May attack the player directly'], ['ifEmpty', 'Directly only when they have no units'], ['never', 'Never attack the player']], { label: 'Direct attacks' }), chk(bp, A, [...Cb, 'positions'], 'Attack / defense positions & face-down units'),
          chk(bp, A, [...Cb, 'counterStep'], 'Counter step (defender plays counter cards)')),
        row(chk(bp, A, [...Cb, 'counterOnly'], 'Quick spells only while defending'), chk(bp, A, [...Cb, 'replaceFull'], 'Full board: playing a unit trashes one of yours'), num(bp, A, [...Cb, 'fieldSize'], { label: 'Units in play (max)', min: 1, max: 30 })),
        !c.health && row(sel(bp, A, [...Cb, 'compare', 'ties'], [['defender', 'Equal power: attacker wins'], ['both', 'Equal power: both destroyed'], ['none', 'Equal power: nothing happens']], { label: 'Ties' }),
          chk(bp, A, [...Cb, 'compare', 'loser'], 'A weaker attacker is destroyed'), chk(bp, A, [...Cb, 'compare', 'overflow'], 'The difference hits the player')),
        (bp.setup.leader || bp.types.some((t) => t.role === 'leader')) && row(chk(bp, A, [...Cb, 'leaderAttacks'], 'The leader can attack'), chk(bp, A, [...Cb, 'leaderDefends'], 'Attacks on the leader compare power'))]],
    ),
    panel('Winning',
      row(num(bp, A, [...W, 'life'], { label: 'Starting life (0 = none)', min: 0, max: 100000, q: 'rules' }), num(bp, A, [...W, 'lifeCards'], { label: 'Life cards (0 = none)', min: 0, max: 15 }),
        num(bp, A, [...W, 'prizes'], { label: 'Prize cards (0 = none)', min: 0, max: 10 }), num(bp, A, [...W, 'points'], { label: 'Points to win (0 = none)', min: 0, max: 50 })),
      row(chk(bp, A, [...W, 'deckOut'], 'Drawing from an empty deck loses'), chk(bp, A, [...W, 'burnOut'], 'Burn out instead: the opponent scores 1 and your discard pile is reshuffled'), chk(bp, A, [...W, 'emptyEnd'], 'Ending your turn with an empty deck loses'), chk(bp, A, [...W, 'noUnits'], 'Having no units in play loses'),
        bp.win.lifeCards > 0 && chk(bp, A, [...W, 'lifeTriggers'], 'Life cards with a trigger can be used for free')),
      hint([bp.win.life && `Reduce the opponent from ${bp.win.life} life to 0.`, bp.win.lifeCards && `Each hit takes one of ${bp.win.lifeCards} life cards; a hit with none left wins.`,
        bp.win.prizes && `Take a prize for each enemy unit destroyed; take all ${bp.win.prizes} to win.`, (bp.win.points || c.mode === 'lanes') && `First to ${bp.win.points || 8} points wins.`].filter(Boolean).join(' ') || 'Choose at least one way to win.')),
    panel('Setup',
      row(num(bp, A, [...S, 'hand'], { label: 'Opening hand', min: 0, max: 15 }), num(bp, A, [...S, 'handLimit'], { label: 'Hand limit', min: 1, max: 99 }), num(bp, A, [...S, 'deckMin'], { label: 'Deck min', min: 5, max: 100 }),
        num(bp, A, [...S, 'deckMax'], { label: 'Deck max', min: 5, max: 120 }), num(bp, A, [...S, 'maxCopies'], { label: 'Copies per card', min: 1, max: 20 }), num(bp, A, [...S, 'turnLimit'], { label: 'Turn limit', min: 10, max: 400 })),
      more('setup', 'More setup options', count(bp.setup.mulliganN, bp.setup.london, bp.setup.maxColors, bp.setup.leaderLife, bp.setup.champion, bp.setup.leaderColors, bp.setup.benchSetup, bp.setup.mulliganBonus, bp.setup.noEvolveFirstTurn, bp.setup.leader),
      row(chk(bp, A, [...S, 'mulligan'], 'Free mulligan'), bp.setup.mulligan && num(bp, A, [...S, 'mulliganN'], { label: 'Mulligan: set aside up to N (0 = whole hand)', min: 0, max: 10 }),
        bp.setup.leader && h('label', { class: 'fld' }, h('span', {}, 'Sides'), h('select', { 'aria-label': 'Sides', onchange: (e: Event) => A.mkSet([...S, 'sides'], (e.target as HTMLSelectElement).value ? ['Defender', 'Raider'] : undefined, 'rules') },
          h('option', { value: '', selected: !bp.setup.sides }, 'Both players play the same way'), h('option', { value: 'on', selected: !!bp.setup.sides }, 'Two different sides (asymmetric)'))),
        bp.setup.sides && [txt(bp, A, [...S, 'sides', 0], { label: 'Side 1 (goes first)' }), txt(bp, A, [...S, 'sides', 1], { label: 'Side 2' })],
        bp.setup.leader && sel(bp, A, [...S, 'leaderLife'], [['', 'Fixed starting life'], ...bp.stats.map((st) => [st.id, `Life = leader's ${st.name}`] as [string, string])], { label: 'Starting life', map: (v) => v || undefined }),
        bp.setup.leader && sel(bp, A, [...S, 'leaderHand'], [['', 'Fixed hand size'], ...bp.stats.map((st) => [st.id, `Hand size = leader's ${st.name}`] as [string, string])], { label: 'Hand size', map: (v) => v || undefined }),
        bp.setup.mulligan && chk(bp, A, [...S, 'london'], 'London mulligan (redraw, then bottom 1 per mulligan)'), bp.colors.length > 1 && num(bp, A, [...S, 'maxColors'], { label: 'Colors per deck (0 = any)', min: 0, max: bp.colors.length }), chk(bp, A, [...S, 'champion'], 'Each deck names a champion (playable from its own zone)'), bp.setup.leader && chk(bp, A, [...S, 'leaderColors'], "Cards must match the leader's two colors")),
      bp.combat.mode === 'duel' && row(chk(bp, A, [...S, 'benchSetup'], 'Also put basic units on the bench at setup'), chk(bp, A, [...S, 'mulliganBonus'], 'Mulligan only without a basic unit; the opponent draws 1 per mulligan')),
      row(chk(bp, A, [...S, 'noEvolveFirstTurn'], 'Nobody evolves on their own first turn'), chk(bp, A, [...S, 'skipFirstDraw'], 'First player skips the first draw'), chk(bp, A, [...S, 'leader'], 'Each deck has a leader card'),
        bp.types.some((t) => t.role === 'extra') && num(bp, A, [...S, 'extraMax'], { label: 'Extra deck size', min: 0, max: 30 })))),
  ];
}

// ---------------------------------------------------------------- status effects
const STOPS: [string, string][] = [['attack', "can't attack"], ['block', "can't block"], ['retreat', "can't retreat"], ['abilities', "can't use abilities"]];
function statusPanel(bp: Blueprint, A: any) {
  const P = (i: number, k: string): Path => ['statuses', i, k];
  return panel('Status effects', hint('Statuses sit on units until cured: asleep, poisoned, frozen, inspired... Each one picks its own rules. Ability blocks inflict and cure them, and filters can target units that have one.'),
    (bp.statuses ?? []).map((s, i) => h('div', { class: 'mk-sub' },
      row(txt(bp, A, P(i, 'name'), { label: 'Name', q: 'keywords' }), txt(bp, A, P(i, 'icon'), { label: 'Icon' }), txt(bp, A, P(i, 'group'), { label: 'Group (same group replace each other)', ph: 'e.g. pose' }),
        h('span', { class: 'muted' }, `id: ${s.id}`), h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.statuses!.splice(i, 1); }), 'aria-label': 'Remove status' }, '🗑')),
      row(STOPS.map(([k, l]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!s.stops?.includes(k as 'attack'),
        onchange: (e: Event) => A.mkEdit((b: Blueprint) => { const t = b.statuses![i]; const set = new Set(t.stops ?? []); if ((e.target as HTMLInputElement).checked) set.add(k as 'attack'); else set.delete(k as 'attack'); t.stops = [...set]; }) }), h('span', {}, l))),
        bp.combat.mode === 'duel' && chk(bp, A, P(i, 'activeOnly'), 'Active unit only (benching clears it)'), chk(bp, A, P(i, 'stacks'), 'Stacks (levels)')),
      row(sel(bp, A, P(i, 'tickWhen'), [['betweenTurns', 'between turns'], ['ownerStart', "at the start of its controller's turn"], ['ownerEnd', "at the end of its controller's turn"]], { label: 'Ticks' }),
        num(bp, A, P(i, 'tickDamage'), { label: 'Damage each tick', min: 0, max: 1000 }), chk(bp, A, P(i, 'tickFlip'), 'Then flip: heads cures'),
        sel(bp, A, P(i, 'lasts'), [['untilCured', 'until cured'], ['ownerNextTurnEnd', "until the end of its controller's next turn"], ['endOfTurn', 'until end of turn']], { label: 'Lasts' }),
        num(bp, A, P(i, 'attackFlip'), { label: 'Attacking: flip, tails fails + damage (0 = off)', min: 0, max: 1000 }), chk(bp, A, P(i, 'noDamage'), 'Deals no damage in fights')),
      row(bp.stats.map((st) => num(bp, A, ['statuses', i, 'adds', st.id], { label: `${st.name} change`, min: -100000, max: 100000 }))))),
    h('button', { onclick: () => A.mkEdit((b: Blueprint) => { const list = (b.statuses ??= []); let id = 'status'; let n = 2; while (list.some((x) => x.id === id)) id = `status${n++}`; list.push({ id, name: 'New Status', icon: '✦', stops: [] }); }, 'keywords') }, '+ New status'));
}

// ---------------------------------------------------------------- 7. keywords
function keywords(bp: Blueprint, A: any) {
  const rulesOpt = Object.entries(KEYWORD_RULES).map(([k, v]) => [k, v.label] as [string, string]);
  return [
    panel('Keywords', hint('A keyword is printed on cards. Give it a built-in rule, a number ("Resist 2"), and/or its own ability blocks: every card with the keyword gets them.'),
      bp.keywords.map((k, i) => h('div', { class: 'mk-kwbox' },
        h('div', { class: 'mk-typerow' }, txt(bp, A, ['keywords', i, 'name'], { label: 'Name', q: 'keywords' }), sel(bp, A, ['keywords', i, 'rule'], rulesOpt, { label: 'Rule', q: 'keywords' }),
          chk(bp, A, ['keywords', i, 'valued'], 'Has a number (N)'), num(bp, A, ['keywords', i, 'deckMax'], { label: 'Max per deck (0 = any)', min: 0, max: 60 }),
          txt(bp, A, ['keywords', i, 'text'], { label: 'Reminder text', wide: true, ph: KEYWORD_RULES[k.rule].text }),
          h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { const id = b.keywords[i].id; b.keywords.splice(i, 1); for (const c of b.cards) c.keywords = c.keywords.filter((w) => w !== id); }), 'aria-label': 'Remove keyword' }, '🗑')),
        h('details', { class: 'mk-kwab', open: (k.abilities?.length ?? 0) > 0 }, h('summary', {}, `Abilities every ${k.name} card gets (${k.abilities?.length ?? 0})`),
          (k.abilities ?? []).map((a, ai) => abilityBox(bp, A, ['keywords', i], a, ai, 'unit', k.valued ? k.id : undefined)),
          h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.keywords[i].abilities ??= []).push({ when: 'attack', do: [{ k: 'lifeGain', ...(b.keywords[i].valued ? { kw: b.keywords[i].id } : { n: 1 }) }] }); }, 'keywords') }, '+ Ability for this keyword')))),
      h('button', { onclick: () => A.mkEdit((b: Blueprint) => { let id = 'keyword'; let n = 2; while (b.keywords.some((x) => x.id === id)) id = `keyword${n++}`; b.keywords.push({ id, name: 'New Keyword', rule: 'none', text: '' }); }, 'keywords') }, '+ New keyword')),
    panel('Counters', hint('Counters sit on cards: +1/+1, poison, loyalty, charge... A counter can raise stats for each one on a card. Ability blocks add, remove and check them.'),
      (bp.counters ?? []).map((k, i) => row(txt(bp, A, ['counters', i, 'name'], { label: 'Name', q: 'keywords' }), txt(bp, A, ['counters', i, 'icon'], { label: 'Icon' }),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!k.stops?.includes('attack'), onchange: (e: Event) => A.mkEdit((b: Blueprint) => { const c = b.counters![i]; const s = new Set(c.stops ?? []); if ((e.target as HTMLInputElement).checked) s.add('attack'); else s.delete('attack'); c.stops = [...s]; }) }), h('span', {}, 'Stops attacking')),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!k.stops?.includes('block'), onchange: (e: Event) => A.mkEdit((b: Blueprint) => { const c = b.counters![i]; const s = new Set(c.stops ?? []); if ((e.target as HTMLInputElement).checked) s.add('block'); else s.delete('block'); c.stops = [...s]; }) }), h('span', {}, 'Stops blocking')),
        chk(bp, A, ['counters', i, 'expires'], 'Wears off at end of its controller\'s turn'), num(bp, A, ['counters', i, 'max'], { label: 'Max on one card (0 = any)', min: 0, max: 99 }),
        bp.stats.map((s) => num(bp, A, ['counters', i, 'adds', s.id], { label: `+${s.name} each`, min: -100000, max: 100000 })),
        h('span', { class: 'muted' }, `id: ${k.id}`), h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.counters!.splice(i, 1); }), 'aria-label': 'Remove counter' }, '🗑'))),
      h('button', { onclick: () => A.mkEdit((b: Blueprint) => { const list = (b.counters ??= []); let id = 'counter'; let n = 2; while (list.some((x) => x.id === id)) id = `counter${n++}`; list.push({ id, name: 'New Counter', icon: '●' }); }, 'keywords') }, '+ New counter')),
    statusPanel(bp, A),
    meterPanel(bp, A),
    bp.comeback && comebackPanel(bp, A),
  ];
}
/** Comeback: whoever is behind by a gap gets a bonus at the start of their turn (a preset or any ability blocks). */
function comebackPanel(bp: Blueprint, A: any) {
  const cb = bp.comeback!;
  const pm = (bp.meters ?? []).filter((m) => m.on === 'player');
  return panel('Comeback', hint('A player who is behind by at least the gap gets the bonus at the start of each of their turns, until they catch up.'),
    row(sel(bp, A, ['comeback', 'by'], [['life', 'life'], ['points', 'points'], ['units', 'units in play'], ['hand', 'cards in hand'], ...(pm.length ? [['meter', 'a meter (lower = behind)'] as [string, string]] : [])], { label: 'Behind in' }),
      cb.by === 'meter' && sel(bp, A, ['comeback', 'meter'], pm.map((m) => [m.id, m.name] as [string, string]), { label: 'Meter' }),
      num(bp, A, ['comeback', 'gap'], { label: 'By at least', min: 1, max: 1000 }),
      sel(bp, A, ['comeback', 'bonus'], [['draw', 'draw cards'], ['resource', 'gain resources'], ['heal', 'heal'], ['effects', 'my own effects']], { label: 'Bonus' }),
      cb.bonus !== 'effects' && num(bp, A, ['comeback', 'n'], { label: 'Amount', min: 1, max: 100 }),
      h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { delete b.comeback; }), 'aria-label': 'Remove comeback' }, '🗑')),
    cb.bonus === 'effects' && h('div', { class: 'mk-sub' }, (cb.do ?? []).map((f, fi) => effectRow(bp, A, ['comeback', 'do', fi], f, () => A.mkEdit((b: Blueprint) => { b.comeback!.do!.splice(fi, 1); }))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.comeback!.do ??= []).push({ k: 'draw', n: 1 }); }) }, '+ effect')));
}

const METER_ON: [string, string][] = [['player', 'each player'], ['unit', 'each unit'], ['game', 'the whole game']];
const METER_GAIN: [string, string][] = [['event', 'a named event happens'], ['play', 'a card is played'], ['turnStart', 'its owner\'s turn starts'], ['turnEnd', 'its owner\'s turn ends'], ['damaged', 'it takes damage'], ['attack', 'it attacks'], ['destroyed', 'a unit is destroyed']];
/** Meters: numbers on players, units or the game that things raise, that decay or cycle, with steps that fire effects. */
function meterPanel(bp: Blueprint, A: any) {
  const ms = bp.meters ?? [];
  return panel('Meters', hint('A meter is a number kept on each player, each unit or the whole game: heat, rage, age, doom, a day/night clock… Pick what raises it, whether it decays or cycles, and what happens when it reaches a step. Conditions and the "Change a meter" block use it on cards.'),
    ms.map((m, i) => { const mp: Path = ['meters', i]; return h('div', { class: 'mk-sub mk-meter', 'data-meter': m.id },
      row(txt(bp, A, [...mp, 'name'], { label: 'Name', q: 'keywords' }), txt(bp, A, [...mp, 'icon'], { label: 'Icon' }), sel(bp, A, [...mp, 'on'], METER_ON, { label: 'Kept on' }),
        h('span', { class: 'muted' }, `id: ${m.id}`), h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.meters!.splice(i, 1); }), 'aria-label': 'Remove meter' }, '🗑')),
      h('strong', {}, 'Goes up when'),
      m.gain.map((q, gi) => row(sel(bp, A, [...mp, 'gain', gi, 'on'], METER_GAIN, { label: 'When' }), num(bp, A, [...mp, 'gain', gi, 'n'], { label: 'By', min: -100, max: 100 }),
        q.on === 'play' && chk(bp, A, [...mp, 'gain', gi, 'cost'], 'by the card\'s cost instead'),
        q.on === 'event' && eventPicker(bp, A, [...mp, 'gain', gi, 'event'], q.event),
        h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.meters![i].gain.splice(gi, 1); }), 'aria-label': 'Remove gain' }, '🗑'))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { b.meters![i].gain.push({ on: 'turnStart', n: 1 }); }) }, '+ way to raise it'),
      row(num(bp, A, [...mp, 'every'], { label: 'Turn gains every N turns', min: 1, max: 20 }), num(bp, A, [...mp, 'decay'], { label: 'Decays per turn', min: 0, max: 100 }),
        num(bp, A, [...mp, 'max'], { label: 'Max (0 = none)', min: 0, max: 1000 }), chk(bp, A, [...mp, 'wrap'], 'Cycles back to 0 at max'), chk(bp, A, [...mp, 'hidden'], 'Hidden'),
        m.on !== 'game' && num(bp, A, [...mp, 'ai'], { label: 'AI values each point (− avoids)', min: -100, max: 100, title: 'How much the computer player wants this meter to be high for itself' })),
      h('label', { class: 'fld wide' }, h('span', {}, 'Names for its values (comma separated, e.g. Day, Night)'),
        h('input', { type: 'text', value: (m.names ?? []).join(', '), 'aria-label': 'Value names', onchange: (e: Event) => A.mkEdit((b: Blueprint) => {
          const list = (e.target as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean); const mm = b.meters![i];
          if (list.length) { mm.names = list; mm.max = list.length; mm.wrap = true; } else delete mm.names; }) })),
      h('strong', {}, 'Steps'),
      (m.steps ?? []).map((st, si) => h('div', { class: 'mk-sub' },
        row(num(bp, A, [...mp, 'steps', si, 'n'], { label: 'When it reaches', min: 1, max: 1000 }), chk(bp, A, [...mp, 'steps', si, 'reset'], 'then reset to 0'),
          txt(bp, A, [...mp, 'steps', si, 'say'], { label: 'Log line ({p}, {o}, {s})', ph: '{p} overheat{s}!' }),
          h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.meters![i].steps!.splice(si, 1); }), 'aria-label': 'Remove step' }, '🗑')),
        st.do.map((f, fi) => effectRow(bp, A, [...mp, 'steps', si, 'do', fi], f, () => A.mkEdit((b: Blueprint) => { b.meters![i].steps![si].do.splice(fi, 1); }))),
        h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { b.meters![i].steps![si].do.push({ k: 'draw', n: 1 }); }) }, '+ effect'))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.meters![i].steps ??= []).push({ n: 5, reset: true, do: [{ k: 'draw', n: 1 }] }); }) }, '+ step'),
      row(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!m.aura, onchange: (e: Event) => A.mkEdit((b: Blueprint) => { const mm = b.meters![i]; if ((e.target as HTMLInputElement).checked) mm.aura = { at: 1, op: 'ge', stat: b.combat.power, n: 1 }; else delete mm.aura; }) }), 'While it is at a value, units get a bonus'),
        m.aura && num(bp, A, [...mp, 'aura', 'at'], { label: 'Value', min: 0, max: 1000 }), m.aura && sel(bp, A, [...mp, 'aura', 'op'], [['ge', 'or more'], ['eq', 'exactly']], { label: 'Match' }),
        m.aura && sel(bp, A, [...mp, 'aura', 'stat'], bp.stats.map((x) => [x.id, x.name]), { label: 'Stat' }), m.aura && num(bp, A, [...mp, 'aura', 'n'], { label: 'Bonus', min: -1000, max: 1000 })),
      m.on !== 'game' && row(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!m.per, onchange: (e: Event) => A.mkEdit((b: Blueprint) => { const mm = b.meters![i]; if ((e.target as HTMLInputElement).checked) mm.per = { stat: b.combat.power, n: 1 }; else delete mm.per; }) }), m.on === 'unit' ? 'The unit gets a bonus per point' : 'Your units get a bonus per point'),
        m.per && sel(bp, A, [...mp, 'per', 'stat'], bp.stats.map((x) => [x.id, x.name]), { label: 'Stat' }), m.per && num(bp, A, [...mp, 'per', 'n'], { label: 'Per point', min: -1000, max: 1000 }))); }),
    h('button', { 'data-act': 'mk-new-meter', onclick: () => A.mkEdit((b: Blueprint) => { const list = (b.meters ??= []); let id = 'meter'; let n = 2; while (list.some((x) => x.id === id)) id = `meter${n++}`; list.push({ id, name: 'New Meter', icon: '◔', on: 'player', gain: [{ on: 'turnStart', n: 1 }], steps: [] }); }, 'keywords') }, '+ New meter'));
}

// ---------------------------------------------------------------- shelf: mechanic recipes
function shelf(bp: Blueprint, A: any, mk: MakerUI) {
  const used = new Set(bp.recipes ?? []);
  const groups = [...new Set(RECIPES.map((r) => r.group))];
  const feats = featuresOf(bp);
  const ask = mk.confirm;
  return [
    hint('Pick mechanics from real card games and drop them into yours. Each one adds what it needs (stats, card types, keywords, rules and example cards); stack them freely and undo any time. A ⚠ means it doesn\'t fit your game as it is.'),
    ask && h('div', { class: 'mk-confirm', role: 'alertdialog', 'aria-label': `Add ${ask.name}?` }, h('strong', {}, `Adding ${ask.name} would cause problems:`),
      h('ul', {}, ask.why.map((w) => h('li', {}, w))),
      row(h('button', { class: 'ghost', onclick: A.mkCancelRecipe, 'data-act': 'mk-recipe-cancel' }, 'Cancel'), h('button', { onclick: () => A.mkRecipe(ask.id, ask.name, true), 'data-act': 'mk-recipe-anyway' }, 'Add anyway (I\'ll fix it)'))),
    groups.map((gname) => panel(gname, h('div', { class: 'mk-recipes' }, RECIPES.filter((r) => r.group === gname).map((r) => {
      const issues = used.has(r.id) ? [] : fitIssues(r.id, feats);
      const blocked = issues.some((q) => q.level === 'blocks');
      return h('div', { class: cls('mk-recipe', used.has(r.id) && 'on', blocked && 'misfit') },
        h('span', { class: 'mk-recipe-icon' }, r.icon), h('strong', {}, r.name), h('span', { class: 'muted' }, r.desc),
        issues.length ? h('span', { class: cls('mk-fit', blocked ? 'blocks' : 'warns') }, `⚠ ${issues.map((q) => q.text).join(' ')}`) : null,
        used.has(r.id) && r.opts?.length ? h('div', { class: 'mk-opts' }, r.opts.map((o) => optRow(bp, A, o)))
          : r.opts?.length ? h('span', { class: 'mk-opts-hint muted' }, `⚙ Tune after adding: ${r.opts.map((o) => o.label.toLowerCase()).join(' · ')}`) : null,
        h('button', { class: cls('chip', used.has(r.id) && 'on'), onclick: () => A.mkRecipe(r.id, r.name), 'data-recipe': r.id }, used.has(r.id) ? '✓ Added (add again)' : '+ Add to my game'));
    })))),
  ];
}
/** One sub-option of an added mechanic: its label and ◀ value ▶ arrows that cycle through the choices. */
function optRow(bp: Blueprint, A: any, o: RecipeOpt) {
  const key = (v: unknown) => JSON.stringify(v ?? null);
  const cur = o.get(bp);
  let i = o.values.findIndex((v) => key(v) === key(cur));
  const name = i < 0 ? (cur === undefined ? '—' : String(cur)) : o.names?.[i] ?? String(o.values[i] ?? '—');
  const step = (d: number) => { const n = o.values.length; const j = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n; A.mkEdit((b: Blueprint) => setRecipeOpt(b, o, o.values[j])); };
  return h('div', { class: 'mk-opt', 'data-opt': o.id },
    h('span', { class: 'mk-opt-label' }, o.label),
    h('span', { class: 'mk-opt-pick' },
      h('button', { class: 'mk-opt-arrow', 'aria-label': `Previous ${o.label}`, onclick: () => step(-1) }, '◀'),
      h('span', { class: 'mk-opt-val' }, name),
      h('button', { class: 'mk-opt-arrow', 'aria-label': `Next ${o.label}`, onclick: () => step(1) }, '▶')));
}


// ---------------------------------------------------------------- context-aware, most-used-first option lists
/** Which ability-builder options make sense in this game. An option the game can't use is hidden (unless it is the one already picked). */
const pool = (bp: Blueprint) => ['ramp', 'cards', 'anycard', 'deck', 'bank'].includes(bp.resource.mode);
const lifeish = (bp: Blueprint) => bp.win.life > 0 || bp.win.lifeCards > 0;
const battles = (bp: Blueprint) => ['block', 'target', 'cards'].includes(bp.combat.mode);
const hasRole = (bp: Blueprint, role: Role) => bp.types.some((t) => t.role === role);
const STATIC_EFF = new Set(['aura', 'costMod', 'insteadDestroy', 'prevent', 'restrict']);
const EFF_OK: Partial<Record<EffectKind, (bp: Blueprint) => boolean>> = {
  meter: (bp) => !!bp.meters?.length, addCounter: (bp) => !!bp.counters?.length, removeCounter: (bp) => !!bp.counters?.length,
  inflict: (bp) => !!bp.statuses?.length, cure: (bp) => !!bp.statuses?.length, token: (bp) => hasRole(bp, 'token'),
  gain: pool, readyRes: pool, addRes: (bp) => bp.resource.mode === 'deck', giveRes: (bp) => !!bp.resource.give, drops: (bp) => bp.resource.mode === 'bank',
  lifeGain: lifeish, lifeLoss: lifeish, score: (bp) => bp.win.points > 0, addLife: (bp) => bp.win.lifeCards > 0, lifeToHand: (bp) => bp.win.lifeCards > 0, handToLife: (bp) => bp.win.lifeCards > 0,
  strike: battles, deploy: (bp) => hasRole(bp, 'leader'), switch: (bp) => bp.combat.mode === 'duel', attachFrom: (bp) => bp.combat.mode === 'duel', skipEvolve: (bp) => hasRole(bp, 'evolution'),
  endRun: (bp) => bp.combat.mode === 'runs', wound: (bp) => bp.combat.mode === 'runs', tag: (bp) => bp.combat.mode === 'runs', fusion: (bp) => hasRole(bp, 'extra'), ritual: (bp) => hasRole(bp, 'extra'),
  counter: (bp) => bp.timing === 'stack' || bp.timing === 'chain', fight: (bp) => bp.combat.mode !== 'none', steal: (bp) => bp.combat.mode !== 'runs', copy: (bp) => bp.combat.mode !== 'runs',
};
const effOk = (bp: Blueprint, isStatic: boolean) => (k: string) => (isStatic ? STATIC_EFF.has(k) : !STATIC_EFF.has(k) || k === 'restrict') && (EFF_OK[k as EffectKind]?.(bp) ?? true);
const WHEN_OK: Partial<Record<When, (bp: Blueprint) => boolean>> = {
  quest: (bp) => !!bp.combat.quest, conquer: (bp) => bp.combat.mode === 'lanes', hold: (bp) => bp.combat.mode === 'lanes', access: (bp) => bp.combat.mode === 'runs',
  landfall: (bp) => ['cards', 'anycard'].includes(bp.resource.mode), attack: (bp) => bp.combat.mode !== 'none', opAttack: (bp) => bp.combat.mode !== 'none',
  hit: (bp) => bp.combat.mode !== 'none', allyDies: (bp) => bp.combat.mode !== 'runs', enemyDies: (bp) => bp.combat.mode !== 'runs', block: (bp) => bp.combat.mode === 'block', flip: (bp) => hasRole(bp, 'trap') || bp.types.some((t) => t.settable), castSpell: (bp) => hasRole(bp, 'spell') || hasRole(bp, 'fast'),
};
const COND_OK: Record<string, (bp: Blueprint) => boolean> = {
  counter: (bp) => !!bp.counters?.length, status: (bp) => !!bp.statuses?.length, meter: (bp) => !!bp.meters?.length, kicked: (bp) => bp.cards.some((c) => c.kicker),
  linked: (bp) => !!bp.combat.grid && !!bp.combat.emz, here: (bp) => hasRole(bp, 'location'), attached: (bp) => !!bp.resource.give, res: (bp) => bp.resource.mode !== 'none',
  life: lifeish, oppLife: lifeish, attacking: (bp) => bp.combat.mode !== 'none', defending: (bp) => bp.combat.mode !== 'none', under: (bp) => bp.cards.some((c) => c.shift) || bp.keywords.some((k) => k.rule === 'boost') || hasRole(bp, 'extra'),
};
const TGT_OK: Partial<Record<TargetKind, (bp: Blueprint) => boolean>> = { attacker: battles, battleTarget: battles, ownLeader: (bp) => hasRole(bp, 'leader'), ownAny: (bp) => hasRole(bp, 'leader') };
const AMOUNT_OK: Record<string, (bp: Blueprint) => boolean> = { x: (bp) => bp.cards.some((c) => c.xCost), meter: (bp) => !!bp.meters?.length, counter: (bp) => !!bp.counters?.length, life: lifeish, oppLife: lifeish };
/** <option>s for a list: blank choices first, then the most used in the default games ("Most used"), then the rest ("More").
 *  Options the game can't use are left out, except the one already picked. */
function rankedOpts(kind: keyof typeof USAGE, items: [string, string][], cur: string, ok?: (id: string) => boolean): HTMLElement[] {
  const shown = items.filter(([v]) => !v || v === cur || !ok || ok(v));
  const blank = shown.filter(([v]) => !v), rest = shown.filter(([v]) => v);
  const u = USAGE[kind] ?? {};
  const top = rest.filter(([v]) => (u[v] ?? 0) > 0).sort((a, b) => (u[b[0]] ?? 0) - (u[a[0]] ?? 0)).slice(0, 8);
  const topIds = new Set(top.map(([v]) => v));
  const opt = ([v, l]: [string, string]) => h('option', { value: v, selected: v === cur }, l);
  const more = rest.filter(([v]) => !topIds.has(v));
  return [...blank.map(opt), ...(top.length && more.length ? [h('optgroup', { label: 'Most used' }, top.map(opt)), h('optgroup', { label: 'More' }, more.map(opt))] : [...top, ...more].map(opt))];
}
/** A select like sel(), with a ranked, context-aware option list. */
function rsel(bp: Blueprint, A: any, path: Path, items: [string, string][], kind: keyof typeof USAGE, o: { label?: string; q?: Station; ok?: (id: string) => boolean } = {}) {
  const s = h('select', { 'aria-label': o.label ?? String(path[path.length - 1]), onchange: (e: Event) => A.mkSet(path, (e.target as HTMLSelectElement).value, o.q) },
    rankedOpts(kind, items, String(get(bp, path) ?? ''), o.ok));
  return o.label ? h('label', { class: 'fld' }, h('span', {}, o.label), s) : s;
}

// ---------------------------------------------------------------- conditions (nestable with all / any / not)
const COND_KINDS: [string, string][] = [['units', 'if you control N+ units'], ['life', 'if your life is N or less'], ['hand', 'if your hand has N or fewer'], ['yourTurn', 'during your turn'], ['res', 'if you have N+ resources'], ['counter', 'if this has N+ counters'], ['zone', 'if you have N+ cards in a zone'],
  ['played', 'if you played N other cards this turn'], ['status', 'if this has a status'], ['kicked', 'if it was kicked'], ['linked', 'if this is linked (arrows)'], ['charged', 'if this has N+ charge'], ['under', 'if this has N+ cards under it'], ['here', 'if this is at a location (or a unit is here)'],
  ['attached', 'if this was given N+ resources'], ['oppTurn', "during the opponent's turn"], ['oppLife', 'if the opponent has N or less life'], ['attacking', 'while you are attacking'], ['defending', 'while you are being attacked'], ['raw', 'a custom condition (script)']];
/** One condition picker. "All of", "any of" and "not" open nested pickers, so conditions combine without scripting. */
function condEditor(bp: Blueprint, A: any, path: Path, k: Cond | undefined, depth: number): HTMLElement {
  const meters = bp.meters ?? [];
  const opts: [string, string][] = [['', depth ? '(pick a condition)' : 'always'], ...COND_KINDS, ...(meters.length ? [['meter', 'if a meter is at a value'] as [string, string]] : []),
    ...(depth < 3 ? [['all', 'all of these…'], ['any', 'any of these…'], ['not', 'not…']] as [string, string][] : [])];
  const pick = h('label', { class: 'fld' }, h('span', {}, depth ? 'Condition' : 'If'), h('select', { 'aria-label': depth ? `Condition (level ${depth + 1})` : 'Condition', onchange: (e: Event) => {
    const v = (e.target as HTMLSelectElement).value;
    A.mkSet(path, !v ? undefined : v === 'all' || v === 'any' ? { k: v, of: k?.k && !['all', 'any'].includes(k.k) ? [k] : k?.of ?? [{ k: 'yourTurn' }] } : v === 'not' ? { k: v, of: [k?.k ? k : { k: 'yourTurn' }] }
      : v === 'meter' ? { k: v, meter: meters[0]?.id, n: 1, op: 'ge' } : { k: v, n: k?.n ?? 1 });
  } }, rankedOpts('cond', opts, k?.k ?? '', (id) => ['all', 'any', 'not'].includes(id) || (COND_OK[id]?.(bp) ?? true))));
  const kids = (k?.k === 'all' || k?.k === 'any' || k?.k === 'not') ? h('div', { class: 'mk-cond-group' },
    (k.of ?? []).map((q, i) => h('div', { class: 'mk-cond-item' }, condEditor(bp, A, [...path, 'of', i], q, depth + 1),
      k.k !== 'not' && h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { get(b, [...path, 'of']).splice(i, 1); }), 'aria-label': 'Remove condition' }, '🗑'))),
    k.k !== 'not' && h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { get(b, path).of.push({ k: 'yourTurn' }); }) }, k.k === 'all' ? '+ and…' : '+ or…')) : null;
  const m = k?.k === 'meter' ? meters.find((q) => q.id === k.meter) : undefined;
  const shownOp = k?.op ?? (k?.k ? COND_OP[k.k] : undefined); // the kind's usual comparison until one is picked
  return h('div', { class: cls('mk-cond', depth > 0 && 'nested') }, pick,
    k?.k === 'zone' && sel(bp, A, [...path, 'zone'], zoneOpts(bp).filter(([z]) => z !== 'deck' && z !== 'hand'), { label: 'Zone' }),
    k?.k === 'status' && sel(bp, A, [...path, 'status'], (bp.statuses ?? []).map((q) => [q.id, q.name] as [string, string]), { label: 'Status' }),
    k?.k === 'counter' && sel(bp, A, [...path, 'counter'], (bp.counters ?? []).map((q) => [q.id, q.name] as [string, string]), { label: 'Counter' }),
    k?.k === 'meter' && sel(bp, A, [...path, 'meter'], meters.map((q) => [q.id, q.name] as [string, string]), { label: 'Meter' }),
    k?.k === 'raw' && h('textarea', { class: 'code', rows: 2, 'aria-label': 'Custom condition JSON', placeholder: '[">=", "$turn", 5]', onchange: (ev: Event) => A.mkRaw(path.join('.'), [...path, 'raw'], (ev.target as HTMLTextAreaElement).value) }, k.raw !== undefined ? JSON.stringify(k.raw) : ''),
    k?.k && COND_OP[k.k] && h('label', { class: 'fld' }, h('span', {}, 'Is'), h('select', { 'aria-label': 'Comparison', onchange: (e: Event) => A.mkSet([...path, 'op'], (e.target as HTMLSelectElement).value) },
      [['ge', 'at least'], ['le', 'at most'], ['eq', 'exactly']].map(([v, l]) => h('option', { value: v, selected: shownOp === v }, l)))),
    k?.k === 'meter' && m?.names?.length ? sel(bp, A, [...path, 'n'], m.names.map((nm, i) => [String(i), nm] as [string, string]), { label: 'Value', map: Number })
      : k?.k && !['yourTurn', 'oppTurn', 'status', 'kicked', 'linked', 'attacking', 'defending', 'all', 'any', 'not', 'raw'].includes(k.k) && num(bp, A, [...path, 'n'], { label: 'N', min: 0, max: 100000 }),
    kids);
}

// ---------------------------------------------------------------- 8. cards and the ability builder
const WHEN: [When, string][] = [['play', 'When played'], ['leave', 'When destroyed'], ['attack', 'When it attacks'], ['hit', 'When it hits the opponent'], ['quest', 'When it quests'], ['startTurn', 'At the start of your turn'],
  ['endTurn', 'At the end of your turn'], ['activated', 'Activated (exhaust and/or pay)'], ['static', 'Always on (aura)'], ['opAttack', 'When the opponent attacks (traps: spring)'], ['block', 'When it blocks'],
  ['flip', 'When flipped face up'], ['castSpell', 'Whenever you cast a spell'], ['landfall', 'Whenever a resource enters for you'], ['conquer', 'When it conquers (battlefields: when you conquer here)'], ['hold', 'When you hold its battlefield (battlefields: here)'], ['event', 'Whenever a named event happens (a meter step, a game or script event)'], ['allyDies', 'Whenever another of your units is destroyed'], ['enemyDies', 'Whenever an enemy unit is destroyed'], ['allyEnters', 'Whenever another unit enters on your side'], ['enemyEnters', 'Whenever a unit enters on the opponent\'s side']];
const EFF: [EffectKind, string, string[]][] = [
  ['draw', 'Draw cards', ['n', 'who']], ['damage', 'Deal damage', ['n', 'target']], ['heal', 'Heal', ['n', 'target']], ['buff', 'Boost a stat', ['n', 'stat', 'target', 'until']],
  ['destroy', 'Destroy', ['target']], ['bounce', 'Return to hand', ['target']], ['exhaust', 'Exhaust (tap)', ['target']], ['ready', 'Ready (untap)', ['target']],
  ['token', 'Create tokens', ['n', 'card']], ['gain', 'Gain resource', ['n']], ['discard', 'Discard', ['n', 'who']], ['mill', 'Mill (deck to discard)', ['n', 'who']],
  ['search', 'Search your deck', ['type']], ['recover', 'Return from discard', ['type']], ['counter', 'Cancel a spell', []], ['lifeGain', 'Gain life', ['n']], ['lifeLoss', 'Lose life', ['n', 'who']],
  ['score', 'Score points', ['n']], ['addLife', 'Add life cards', ['n']], ['aura', 'Aura stat boost', ['n', 'stat', 'scope']], ['addCounter', 'Add counters', ['n', 'counter', 'target']],
  ['removeCounter', 'Remove counters', ['n', 'counter', 'target']], ['strike', 'Attack with power N', ['n']], ['deploy', 'Deploy this leader as a unit', []],
  ['restrict', "Can't… (restriction)", ['rule', 'target', 'until']], ['prevent', 'Prevent damage (instead)', ['n', 'scope']], ['costMod', 'Make cards cost less', ['n', 'type']],
  ['insteadDestroy', 'If destroyed, instead…', ['to']], ['moveTo', 'Move / banish', ['zone', 'target']], ['win', 'Win the game', []],
  ['scry', 'Look at the top card (may bottom it)', ['n']], ['dig', 'Look at the top N, reveal 1 matching', ['n', 'type', 'dfilter']], ['putIntoPlay', 'Play a unit for free', ['type', 'from', 'dfilter']],
  ['choose', 'Choose one — (modes)', ['modes']], ['later', 'Later (next turn / end of turn)', ['later']], ['steal', 'Take control of a unit', ['target']], ['copy', 'Copy a unit (a token for you)', ['target']],
  ['meter', 'Change a meter', ['n', 'meterId', 'meterWho']], ['addRes', 'Add resources from the resource deck', ['n']], ['readyRes', 'Set spent resources active', ['n']], ['giveRes', 'Give spent resources (+power)', ['n', 'target']],
  ['lifeToHand', 'Top life card to hand', ['n']], ['handToLife', 'A card from hand to the top of life', []],
  ['inflict', 'Give a status', ['status', 'n', 'target']], ['cure', 'Cure a status', ['statusAll', 'target']], ['flip', 'Flip coins (heads / tails)', ['n', 'flip']],
  ['switch', 'Switch the active unit', ['side']], ['tutor', 'Search your deck (choose)', ['n', 'type', 'dest', 'dfilter']], ['attachFrom', 'Attach a resource card from a zone', ['src', 'target', 'dfilter']],
  ['drawTo', 'Draw up to N in hand', ['n']], ['endRun', 'End the run', []], ['wound', 'Wound (random discards)', ['n']], ['tag', 'Give tags', ['n']], ['skipEvolve', 'Evolve two stages at once', []], ['fight', 'Fight (one of your units)', ['target']], ['roll', 'Roll dice', ['n', 'roll']], ['fusion', 'Fusion summon (from extra deck)', []], ['ritual', 'Ritual summon (from hand)', []], ['surveil', 'Surveil (top cards to discard)', ['n']], ['drops', 'Save resources for later (ink drops)', ['n']], ['raw', 'Custom script (JSON)', ['raw']],
];
const TGT: [TargetKind, string][] = [['enemyUnit', 'an enemy unit (choose)'], ['anyUnit', 'any unit (choose)'], ['ownUnit', 'one of your units'], ['otherOwnUnit', 'another of your units'], ['enemyAny', 'enemy unit or opponent'],
  ['opponent', 'the opponent'], ['you', 'you'], ['self', 'this card'], ['randomEnemyUnit', 'a random enemy unit'], ['allEnemyUnits', 'all enemy units'], ['allUnits', 'all units'], ['allOwnUnits', 'all your units'],
  ['eachPlayer', 'each player'], ['attacker', 'the attacker (in a battle)'], ['battleTarget', 'the attacked card (in a battle)'], ['ownLeader', 'your leader'], ['ownAny', 'your leader or one of your units']];
/** The target builder: whose × what × how (choose up to N / all / N at random). */
const PICK_SIDE: [string, string][] = [['enemy', 'enemy'], ['own', 'your'], ['any', "anyone's"]];
const PICK_WHAT: [string, string][] = [['unit', 'units'], ['unitOrPlayer', 'units or players'], ['player', 'players'], ['leader', 'leaders'], ['unitOrLeader', 'leaders or units'], ['permanent', 'permanents (non-units)']];
const PICK_HOW: [string, string][] = [['choose', 'you choose'], ['all', 'all of them'], ['random', 'at random']];
function presetToPick(t: TargetKind | undefined, count?: number): TargetPick {
  const m: Partial<Record<TargetKind, TargetPick>> = { enemyUnit: { side: 'enemy', what: 'unit', how: 'choose' }, anyUnit: { side: 'any', what: 'unit', how: 'choose' }, ownUnit: { side: 'own', what: 'unit', how: 'choose' },
    otherOwnUnit: { side: 'own', what: 'unit', how: 'choose', other: true }, enemyAny: { side: 'enemy', what: 'unitOrPlayer', how: 'choose' }, opponent: { side: 'enemy', what: 'player', how: 'choose' }, you: { side: 'own', what: 'player', how: 'choose' },
    eachPlayer: { side: 'any', what: 'player', how: 'all' }, allEnemyUnits: { side: 'enemy', what: 'unit', how: 'all' }, allUnits: { side: 'any', what: 'unit', how: 'all' }, allOwnUnits: { side: 'own', what: 'unit', how: 'all' },
    randomEnemyUnit: { side: 'enemy', what: 'unit', how: 'random' }, ownLeader: { side: 'own', what: 'leader', how: 'choose' }, ownAny: { side: 'own', what: 'unitOrLeader', how: 'choose' } };
  return { ...(m[t ?? 'enemyUnit'] ?? { side: 'enemy', what: 'unit', how: 'choose' }), ...((count ?? 1) > 1 ? { n: count } : {}) };
}
function pickEditor(bp: Blueprint, A: any, ep: Path, pk: TargetPick) {
  const pp: Path = [...ep, 'pick'];
  return h('span', { class: 'mk-pick' },
    sel(bp, A, [...pp, 'side'], PICK_SIDE, { label: 'Whose' }),
    sel(bp, A, [...pp, 'what'], PICK_WHAT.filter(([w]) => !['leader', 'unitOrLeader'].includes(w) || bp.types.some((t) => t.role === 'leader') || pk.what === w), { label: 'What' }),
    sel(bp, A, [...pp, 'how'], PICK_HOW, { label: 'How' }),
    pk.how !== 'all' && num(bp, A, [...pp, 'n'], { label: pk.how === 'random' ? 'How many' : 'Up to', min: 1, max: 10, dflt: 1 }),
    pk.side === 'own' && chk(bp, A, [...pp, 'other'], 'Not this card'),
    h('span', { class: 'muted' }, `→ ${pickText(pk)}`),
    h('button', { class: 'ghost', onclick: () => A.mkSet(pp, undefined), title: 'Back to the preset list' }, 'presets'));
}
const CHOOSE_TGT = new Set(['enemyUnit', 'anyUnit', 'ownUnit', 'otherOwnUnit', 'enemyAny', 'ownAny']);
const SCOPE: [TargetKind, string][] = [['allOwnUnits', 'your units'], ['otherOwnUnit', 'your other units'], ['allEnemyUnits', 'enemy units'], ['allUnits', 'all units'], ['self', 'this card']];
const zoneOpts = (bp: Blueprint): [string, string][] => [['banished', 'Banished pile'], ['grave', 'Discard pile'], ['hand', 'Hand'], ['deck', 'Deck (bottom)'], ...(bp.zones ?? []).map((z) => [z.id, z.name] as [string, string])];
const RESTRICT: [string, string][] = [['noAttack', "can't attack"], ['noBlock', "can't block"], ['noBeAttacked', "can't be attacked"], ['unblockable', "can't be blocked"], ['entersExhausted', 'enters exhausted']];
/** The events an ability or a meter can react to: meter steps and named values, game events, events your scripts name, or any typed name. */
function eventChoices(bp: Blueprint): [string, string][] {
  const out: [string, string][] = [];
  for (const m of bp.meters ?? []) {
    (m.steps ?? []).forEach((st, i) => out.push([`mt_${m.id}_${i}`, `${m.name} reaches ${st.n}`]));
    (m.names ?? []).forEach((nm, i) => out.push([`mv_${m.id}_${i}`, `${m.name} becomes ${nm}`]));
  }
  for (const k of Object.keys(bp.advanced?.log ?? {})) if (!out.some(([v]) => v === k)) out.push([k, `"${k}" (your event)`]);
  for (const [k, t] of Object.entries(EVENT_TEXT)) out.push([k, t]);
  return out;
}
function eventPicker(bp: Blueprint, A: any, path: Path, cur: string | undefined) {
  const ch = eventChoices(bp);
  const known = !cur || ch.some(([v]) => v === cur);
  return h('span', { class: 'mk-event' },
    h('label', { class: 'fld' }, h('span', {}, 'Event'), h('select', { 'aria-label': 'Event', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet(path, v === '*' ? 'myEvent' : v); } },
      [['', '(pick an event)'], ...ch, ['*', 'another name…']].map(([v, l]) => h('option', { value: v, selected: (known ? cur ?? '' : '*') === v }, l)))),
    !known && txt(bp, A, path, { label: 'Event name' }));
}
const AMOUNT_OF: [string, string][] = [['', 'a fixed number'], ['x', 'X = the X paid (X cost)'], ['units', 'X = your units'], ['enemyUnits', "X = the opponent's units"], ['allUnits', 'X = all units in play'],
  ['hand', 'X = cards in your hand'], ['oppHand', "X = cards in the opponent's hand"], ['grave', 'X = cards in your discard pile'], ['deck', 'X = cards in your deck'],
  ['life', 'X = your life'], ['oppLife', "X = the opponent's life"], ['meter', 'X = a meter'], ['counter', 'X = counters on this'], ['stat', "X = this card's stat"], ['turn', 'X = the turn number']];
/** "Amount = a fixed number / X = …": any effect's amount can count something instead. */
function amountPicker(bp: Blueprint, A: any, ep: Path, e: Effect) {
  const a = e.amount;
  return h('span', { class: 'mk-amount' },
    h('label', { class: 'fld' }, h('span', {}, 'Amount is'), h('select', { 'aria-label': 'Amount is', onchange: (ev: Event) => { const v = (ev.target as HTMLSelectElement).value;
      A.mkSet([...ep, 'amount'], v ? { of: v, times: 1, ...(v === 'meter' ? { meter: bp.meters?.[0]?.id } : v === 'counter' ? { counter: bp.counters?.[0]?.id } : v === 'stat' ? { stat: bp.combat.power } : {}) } : undefined); } },
      rankedOpts('amount', AMOUNT_OF, a?.of ?? '', (v) => AMOUNT_OK[v]?.(bp) ?? true))),
    a?.of === 'meter' && sel(bp, A, [...ep, 'amount', 'meter'], (bp.meters ?? []).map((m) => [m.id, m.name] as [string, string]), { label: 'Meter' }),
    a?.of === 'counter' && sel(bp, A, [...ep, 'amount', 'counter'], (bp.counters ?? []).map((k) => [k.id, k.name] as [string, string]), { label: 'Counter' }),
    a?.of === 'stat' && sel(bp, A, [...ep, 'amount', 'stat'], bp.stats.map((x) => [x.id, x.name] as [string, string]), { label: 'Stat' }),
    a && num(bp, A, [...ep, 'amount', 'times'], { label: '× (times)', min: 0, max: 100, step: 0.5, dflt: 1 }),
    a && num(bp, A, [...ep, 'amount', 'plus'], { label: '+ (plus)', min: -100, max: 100 }));
}
function effectRow(bp: Blueprint, A: any, ep: Path, e: Effect, onDel: () => void, kwId?: string, isStatic = false): HTMLElement {
  const def = EFF.find((x) => x[0] === e.k)!;
  const P = new Set(def[2]);
  const roleOf = new Map(bp.types.map((t) => [t.id, t.role]));
  const tokens = bp.cards.filter((c) => roleOf.get(c.type) === 'token');
  return h('div', { class: 'mk-eff' },
    rsel(bp, A, [...ep, 'k'], EFF.map(([k, l]) => [k, l]), 'effect', { label: 'Do', ok: effOk(bp, isStatic) }),
    P.has('n') && !e.kw && !e.amount && num(bp, A, [...ep, 'n'], { label: 'Amount', min: -100000, max: 100000 }),
    P.has('n') && !e.kw && !e.fromRoll && amountPicker(bp, A, ep, e),
    P.has('n') && kwId && chk(bp, A, [...ep, 'kw'], 'Amount = keyword N'),
    P.has('n') && e.k !== 'roll' && chk(bp, A, [...ep, 'fromRoll'], 'Amount = the last roll'),
    P.has('counter') && sel(bp, A, [...ep, 'card'], (bp.counters ?? []).length ? bp.counters!.map((k) => [k.id, k.name] as [string, string]) : [['', '(make a counter first)']], { label: 'Counter' }),
    P.has('meterId') && sel(bp, A, [...ep, 'meter'], (bp.meters ?? []).length ? bp.meters!.map((m) => [m.id, m.name] as [string, string]) : [['', '(make a meter first, under Keywords)']], { label: 'Meter' }),
    P.has('meterId') && chk(bp, A, [...ep, 'set'], 'Set it to the amount (instead of adding)'),
    P.has('meterWho') && bp.meters?.find((m) => m.id === e.meter)?.on === 'player' && sel(bp, A, [...ep, 'who'], [['me', 'yours'], ['opp', "the opponent's"]], { label: 'Whose' }),
    P.has('stat') && sel(bp, A, [...ep, 'stat'], bp.stats.map((s) => [s.id, s.name]), { label: 'Stat' }),
    P.has('target') && !e.pick && rsel(bp, A, [...ep, 'target'], isStatic ? SCOPE : TGT, 'target', { label: isStatic ? 'Affects' : 'Target', ok: (t) => TGT_OK[t as TargetKind]?.(bp) ?? true }),
    P.has('target') && !isStatic && !e.pick && CHOOSE_TGT.has(e.target ?? 'enemyUnit') && num(bp, A, [...ep, 'count'], { label: 'Up to (targets)', min: 1, max: 10, dflt: 1, title: 'Choose up to this many targets' }),
    P.has('target') && !isStatic && (e.pick ? pickEditor(bp, A, ep, e.pick)
      : h('button', { class: 'chip', 'data-act': 'mk-build-target', title: 'Build the target from whose, what and how many', onclick: () => A.mkSet([...ep, 'pick'], presetToPick(e.target, e.count)) }, '✎ build target')),
    !isStatic && num(bp, A, [...ep, 'repeat'], { label: 'Times', min: 1, max: 10, dflt: 1, title: 'Do this several times (choosing again each time)' }),
    P.has('rule') && sel(bp, A, [...ep, 'rule'], [...RESTRICT, ...bp.keywords.filter((k) => !RESTRICT.some(([r]) => r === k.rule) && k.rule !== 'none').map((k) => [k.rule, `gains ${k.name}`] as [string, string])], { label: 'Rule' }),
    P.has('zone') && sel(bp, A, [...ep, 'zone'], zoneOpts(bp), { label: 'To' }),
    P.has('to') && sel(bp, A, [...ep, 'to'], [['hand', 'return it to hand'], ['deck', 'put it on the bottom of the deck']], { label: 'Instead' }),
    P.has('scope') && sel(bp, A, [...ep, 'target'], SCOPE, { label: 'Affects' }),
    P.has('until') && !isStatic && sel(bp, A, [...ep, 'until'], [['turn', 'until end of turn'], ['yourNextTurn', 'until your next turn'], ['battle', 'during this battle'], ['forever', 'until it leaves play']], { label: 'Lasts' }),
    P.has('modes') && h('div', { class: 'mk-sub mk-modes' }, h('strong', {}, 'Choose one —'),
      (e.modes ?? []).map((md, mi) => h('div', { class: 'mk-sub' }, row(txt(bp, A, [...ep, 'modes', mi, 'label'], { label: `Mode ${mi + 1} name (optional)`, ph: 'e.g. Fire' }),
          h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'modes']).splice(mi, 1); }), 'aria-label': 'Remove mode' }, '🗑')),
        md.do.map((f, fi) => effectRow(bp, A, [...ep, 'modes', mi, 'do', fi], f, () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'modes', mi, 'do']).splice(fi, 1); }))),
        h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'modes', mi, 'do']).push({ k: 'draw', n: 1 }); }) }, '+ effect'))),
      h('button', { class: 'chip', 'data-act': 'mk-add-mode', onclick: () => A.mkEdit((b: Blueprint) => { const t = get(b, ep); (t.modes ??= []).push({ do: [{ k: 'damage', n: 1, target: 'enemyUnit' }] }); }) }, '+ mode')),
    P.has('later') && h('div', { class: 'mk-sub' }, sel(bp, A, [...ep, 'at'], [['yourNextTurn', 'at the start of your next turn'], ['endOfTurn', 'at the end of this turn']], { label: 'When' }),
      (e.do ?? []).map((f, fi) => effectRow(bp, A, [...ep, 'do', fi], f, () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'do']).splice(fi, 1); }))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { const t = get(b, ep); (t.do ??= []).push({ k: 'draw', n: 1 }); }) }, '+ effect')),
    P.has('from') && sel(bp, A, [...ep, 'zone'], [['hand', 'from your hand'], ['grave', 'from your discard pile']], { label: 'From' }),
    P.has('status') && sel(bp, A, [...ep, 'status'], (bp.statuses ?? []).length ? bp.statuses!.map((s) => [s.id, s.name] as [string, string]) : [['', '(make a status first)']], { label: 'Status' }),
    P.has('statusAll') && sel(bp, A, [...ep, 'status'], [['', 'every status'], ...(bp.statuses ?? []).map((s) => [s.id, s.name] as [string, string])], { label: 'Status', map: (v) => v || undefined }),
    P.has('side') && sel(bp, A, [...ep, 'who'], [['me', 'yours'], ['opp', "the opponent's (you choose)"]], { label: 'Whose' }),
    P.has('dest') && sel(bp, A, [...ep, 'to'], [['hand', 'into your hand'], ['play', 'into play']], { label: 'Put' }),
    P.has('src') && sel(bp, A, [...ep, 'zone'], [['deck', 'deck'], ['grave', 'discard pile'], ['hand', 'hand']], { label: 'From your' }),
    P.has('roll') && num(bp, A, [...ep, 'sides'], { label: 'Sides', min: 2, max: 100 }),
    P.has('roll') && h('div', { class: 'mk-sub' }, h('strong', {}, 'Results'),
      (e.ranges ?? []).map((r, ri) => h('div', { class: 'mk-sub' }, row(num(bp, A, [...ep, 'ranges', ri, 'min'], { label: 'From', min: 1, max: 600 }), num(bp, A, [...ep, 'ranges', ri, 'max'], { label: 'To', min: 1, max: 600 }),
        h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'ranges']).splice(ri, 1); }), 'aria-label': 'Remove result' }, '🗑')),
        r.do.map((f, fi) => effectRow(bp, A, [...ep, 'ranges', ri, 'do', fi], f, () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'ranges', ri, 'do']).splice(fi, 1); }))),
        h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'ranges', ri, 'do']).push({ k: 'draw', n: 1 }); }, 'cards') }, '+ effect'))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { const t = get(b, ep); const s = t.sides ?? 6; (t.ranges ??= []).push({ min: 1, max: s, do: [] }); }, 'cards') }, '+ result range'),
      h('strong', {}, 'Then (every roll)'),
      (e.then ?? []).map((f, fi) => effectRow(bp, A, [...ep, 'then', fi], f, () => A.mkEdit((b: Blueprint) => { get(b, [...ep, 'then']).splice(fi, 1); }))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { const t = get(b, ep); (t.then ??= []).push({ k: 'damage', fromRoll: true, target: 'enemyUnit' }); }, 'cards') }, '+ effect')),
    P.has('flip') && chk(bp, A, [...ep, 'perHeads'], 'Heads effects happen once per heads'),
    P.has('flip') && ['heads', 'tails'].map((side) => !(side === 'tails' && e.perHeads) && h('div', { class: 'mk-sub' }, h('strong', {}, side === 'heads' ? 'If heads' : 'If tails'),
      ((e as any)[side] ?? []).map((f: Effect, fi: number) => effectRow(bp, A, [...ep, side, fi], f, () => A.mkEdit((b: Blueprint) => { get(b, [...ep, side]).splice(fi, 1); }))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { const t = get(b, ep); (t[side] ??= []).push({ k: 'damage', n: 1, target: 'enemyUnit' }); }, 'cards') }, '+ effect'))),
    P.has('who') && sel(bp, A, [...ep, 'who'], [['me', 'you'], ['opp', 'the opponent'], ['each', 'each player']], { label: 'Who' }),
    P.has('card') && sel(bp, A, [...ep, 'card'], tokens.length ? tokens.map((t) => [t.id, t.name]) : [['', '(make a Token card first)']], { label: 'Token' }),
    P.has('type') && sel(bp, A, [...ep, 'type'], [['', 'any card'], ...bp.types.map((t) => [t.id, t.name] as [string, string])], { label: 'Type', map: (v) => v || undefined }),
    (P.has('target') || P.has('scope') || P.has('dfilter')) && h('details', { class: 'mk-filter', open: !!e.filter }, h('summary', {}, e.filter ? 'where…' : '+ where…'),
      sel(bp, A, [...ep, 'filter', 'type'], [['', 'any type'], ...bp.types.map((t) => [t.id, t.name] as [string, string])], { label: 'Type', map: (v) => v || undefined }),
      bp.colors.length > 0 && sel(bp, A, [...ep, 'filter', 'color'], [['', 'any color'], ...bp.colors.map((k) => [k.id, k.name] as [string, string])], { label: 'Color', map: (v) => v || undefined }),
      sel(bp, A, [...ep, 'filter', 'keyword'], [['', 'any keyword'], ...bp.keywords.map((k) => [k.id, k.name] as [string, string])], { label: 'Keyword', map: (v) => v || undefined }),
      sel(bp, A, [...ep, 'filter', 'stat'], [['', 'no stat limit'], ...bp.stats.map((s) => [s.id, s.name] as [string, string])], { label: 'Stat', map: (v) => v || undefined }),
      e.filter?.stat && sel(bp, A, [...ep, 'filter', 'op'], [['le', 'or less'], ['ge', 'or more'], ['eq', 'exactly']], { label: 'Compare' }),
      e.filter?.stat && num(bp, A, [...ep, 'filter', 'val'], { label: 'Value', min: -100000, max: 100000 }),
      h('label', { class: 'fld' }, h('span', {}, 'Ready or exhausted'), h('select', { 'aria-label': 'Ready or exhausted', onchange: (ev: Event) => { const v = (ev.target as HTMLSelectElement).value; A.mkSet([...ep, 'filter', 'exhausted'], v === 'ex' ? true : v === 'ready' ? false : undefined); } },
        [['', 'either'], ['ex', 'exhausted only'], ['ready', 'ready only']].map(([v, l]) => h('option', { value: v, selected: (e.filter?.exhausted === true ? 'ex' : e.filter?.exhausted === false ? 'ready' : '') === v }, l)))),
      chk(bp, A, [...ep, 'filter', 'damaged'], 'Only damaged'),
      bp.keywords.length > 0 && sel(bp, A, [...ep, 'filter', 'notKeyword'], [['', '—'], ...bp.keywords.map((k) => [k.id, k.name] as [string, string])], { label: 'Without keyword', map: (v) => v || undefined }),
      (bp.counters ?? []).length > 0 && sel(bp, A, [...ep, 'filter', 'counter'], [['', 'any'], ...bp.counters!.map((k) => [k.id, `with a ${k.name} counter`] as [string, string])], { label: 'Counters', map: (v) => v || undefined }),
      (bp.meters ?? []).some((m) => m.on === 'unit') && sel(bp, A, [...ep, 'filter', 'meter'], [['', 'any'], ...bp.meters!.filter((m) => m.on === 'unit').map((m) => [m.id, m.name] as [string, string])], { label: 'Meter at least', map: (v) => v || undefined }),
      e.filter?.meter && num(bp, A, [...ep, 'filter', 'meterN'], { label: 'Value', min: 1, max: 1000 }),
      sel(bp, A, [...ep, 'filter', 'zone'], [['', 'in play'], ...zoneOpts(bp).filter(([z]) => z !== 'deck')], { label: 'Where', map: (v) => v || undefined }),
      txt(bp, A, [...ep, 'filter', 'name'], { label: 'Named', ph: 'name or family' }), txt(bp, A, [...ep, 'filter', 'trait'], { label: 'Trait', ph: 'e.g. Sky Pirates' }),
      bp.types.some((t) => t.role === 'location') && chk(bp, A, [...ep, 'filter', 'here'], 'At this location'),
      bp.combat.grid && [chk(bp, A, [...ep, 'filter', 'adjacent'], 'Next to this'), chk(bp, A, [...ep, 'filter', 'opposite'], 'Facing this'), bp.combat.emz && chk(bp, A, [...ep, 'filter', 'pointed'], 'This points to it')],
      (bp.statuses ?? []).length > 0 && sel(bp, A, [...ep, 'filter', 'status'], [['', 'any status'], ...bp.statuses!.map((s) => [s.id, `that is ${s.name}`] as [string, string])], { label: 'Status', map: (v) => v || undefined })),
    P.has('raw') && h('textarea', { class: 'code', rows: 2, 'aria-label': 'Custom effects JSON', onchange: (ev: Event) => A.mkRaw(ep.join('.'), [...ep, 'raw'], (ev.target as HTMLTextAreaElement).value) }, JSON.stringify(e.raw ?? [['draw', '$me', 1]])),
    h('span', { class: 'mk-eff-text muted' }, effectText(e, bp)),
    h('button', { class: 'x', onclick: onDel, 'aria-label': 'Remove effect' }, '✕'));
}
function abilityBox(bp: Blueprint, A: any, cp: Path, a: Ability, ai: number, role: Role, kwId?: string) {
  const ap: Path = [...cp, 'abilities', ai];
  return h('div', { class: 'mk-ability' },
    h('div', { class: 'mk-ab-head' },
      rsel(bp, A, [...ap, 'when'], WHEN, 'when', { label: 'When', q: 'cards', ok: (w) => WHEN_OK[w as When]?.(bp) ?? true }),
      a.when === 'event' && eventPicker(bp, A, [...ap, 'event'], a.event),
      !['static', 'activated'].includes(a.when) && chk(bp, A, [...ap, 'may'], 'You may (optional)'),
      a.when === 'activated' && txt(bp, A, [...ap, 'label'], { label: 'Button name', ph: 'e.g. Exhaust: draw a card' }),
      a.when === 'event' && sel(bp, A, [...ap, 'eventWho'], [['any', 'anyone\'s'], ['me', 'yours'], ['opp', "your opponent's"]], { label: 'Whose' }),
      a.when === 'activated' && [chk(bp, A, [...ap, 'quick'], 'Quick (either turn)'), sel(bp, A, [...ap, 'from'], [['', 'from play'], ['hand', 'from hand'], ['grave', 'from discard pile']], { label: 'Used', map: (v) => v || undefined }),
        num(bp, A, [...ap, 'detach'], { label: 'Detach materials', min: 0, max: 5 }), chk(bp, A, [...ap, 'oncePerName'], 'Once per turn per name'), role === 'walker' && num(bp, A, [...ap, 'loyalty'], { label: 'Loyalty (+/-)', min: -20, max: 20 }), chk(bp, A, [...ap, 'sacSelf'], 'Sacrifice this'), chk(bp, A, [...ap, 'tap'], 'Exhaust this'), num(bp, A, [...ap, 'cost'], { label: 'Pay', min: 0, max: 20 }), num(bp, A, [...ap, 'discard'], { label: 'Discard', min: 0, max: 5 }),
        chk(bp, A, [...ap, 'sacrifice'], 'Sacrifice a unit'), num(bp, A, [...ap, 'banish'], { label: 'Banish from discard', min: 0, max: 10 }),
        ['cards', 'anycard', 'deck'].includes(bp.resource.mode) && num(bp, A, [...ap, 'returnRes'], { label: `Return ${bp.resource.name}`, min: 0, max: 10 }), (bp.win.life > 0 || bp.win.lifeCards > 0 || bp.setup.leader) && num(bp, A, [...ap, 'life'], { label: bp.win.life > 0 ? 'Pay life' : 'Life cards to hand', min: 0, max: 100000 }),
        (bp.counters ?? []).length > 0 && h('label', { class: 'fld' }, h('span', {}, 'Remove counters'), h('select', { 'aria-label': 'Counter cost', onchange: (ev: Event) => { const v = (ev.target as HTMLSelectElement).value; A.mkSet([...ap, 'uncount'], v ? { id: v, n: a.uncount?.n ?? 1 } : undefined); } },
          [['', 'none'], ...bp.counters!.map((k) => [k.id, k.name])].map(([v, l]) => h('option', { value: v, selected: (a.uncount?.id ?? '') === v }, l)))),
        a.uncount && num(bp, A, [...ap, 'uncount', 'n'], { label: 'How many', min: 1, max: 20 })],
      condEditor(bp, A, [...ap, 'if'], a.if, 0),
      h('label', { class: 'fld' }, h('span', {}, 'Limit'), h('select', { 'aria-label': 'Limit', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet([...ap, 'once'], v === 'turn' ? true : v === 'game' ? 'game' : undefined); } },
        [['', 'every time'], ['turn', 'once per turn'], ['game', 'once per game']].map(([v, l]) => h('option', { value: v, selected: (a.once === true ? 'turn' : a.once || '') === v }, l)))),
      h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { get(b, cp).abilities.splice(ai, 1); }), 'aria-label': 'Remove ability' }, '🗑')),
    a.do.map((e, ei) => effectRow(bp, A, [...ap, 'do', ei], e, () => A.mkEdit((b: Blueprint) => { get(b, ap).do.splice(ei, 1); }), kwId, a.when === 'static')),
    h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { get(b, ap).do.push({ k: a.when === 'static' ? 'aura' : 'draw', n: 1, target: a.when === 'static' ? 'allOwnUnits' : 'enemyUnit' }); }, 'cards') }, '+ then…'));
}
let cardQuery = '';
function cardsView(bp: Blueprint, A: any, mk: MakerUI, mod: Mod | null) {
  const ci = bp.cards.findIndex((c) => c.id === mk.card);
  const c = bp.cards[ci];
  const filter = mk.filter && bp.types.some((t) => t.id === mk.filter) ? mk.filter : null;
  const q = (cardQuery ?? '').trim().toLowerCase();
  const shown = bp.cards.filter((k) => (!filter || k.type === filter) && (!q || k.name.toLowerCase().includes(q) || (k.traits ?? []).some((t) => t.toLowerCase().includes(q)) || k.keywords.some((w) => w.toLowerCase().includes(q))));
  return h('div', { class: 'mk-cards' },
    h('div', { class: 'mk-cardlist' },
      h('div', { class: 'mk-cardbar' },
        h('input', { type: 'search', class: 'mk-search', placeholder: `Search ${bp.cards.length} cards (name, trait, keyword)`, value: cardQuery, 'aria-label': 'Search cards', 'data-keep': 'card-search',
          oninput: (e: Event) => { cardQuery = (e.target as HTMLInputElement).value; A.mkSel('filter', filter); } }),
        h('select', { 'aria-label': 'Filter by type', onchange: (e: Event) => A.mkSel('filter', (e.target as HTMLSelectElement).value || null) },
          h('option', { value: '', selected: !filter }, `All types (${bp.cards.length})`),
          bp.types.map((t) => h('option', { value: t.id, selected: filter === t.id }, `${t.icon ?? ''} ${t.name} (${bp.cards.filter((k) => k.type === t.id).length})`))),
        h('select', { class: 'mk-newsel', 'aria-label': 'New card', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) A.mkNewCard(v); } },
          h('option', { value: '' }, '+ New card…'), bp.types.map((t) => h('option', { value: t.id, 'data-newcard': t.id }, `${t.icon ?? ''} ${t.name}`)))),
      q && h('p', { class: 'muted' }, `${shown.length} match${shown.length === 1 ? '' : 'es'}`),
      h('div', { class: 'mk-addrow' }, h('button', { class: 'chip', onclick: A.mkCsvExport }, '⬇ Spreadsheet (CSV)'),
        h('label', { class: 'chip file-btn' }, '⬆ Import CSV', h('input', { type: 'file', accept: '.csv,text/csv', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.mkCsvImport(f); } }))),
      h('div', { class: 'mk-grid' }, mod ? shown.map((k) => mod.card.has(k.id) && cardFace(mod, k.id, { size: 'sm', state: k.id === mk.card ? 'picked' : '', onclick: () => A.mkSel('card', k.id) }))
        : shown.map((k) => h('button', { class: 'chip', onclick: () => A.mkSel('card', k.id) }, k.name)))),
    c ? cardEditor(bp, A, mk, ci, c, mod) : h('div', { class: 'mk-editor' }, hint('Pick a card to edit it, or make a new one.')));
}
function cardEditor(bp: Blueprint, A: any, mk: MakerUI, ci: number, c: CardBP, mod: Mod | null) {
  const cp: Path = ['cards', ci];
  const t = bp.types.find((x) => x.id === c.type);
  const role: Role = t?.role ?? 'unit';
  const typed = bp.colors.length > 0 && ['cards', 'deck', 'anycard'].includes(bp.resource.mode);
  const costMap: Record<string, number> = typeof c.cost === 'object' ? c.cost : { any: c.cost ?? 0 };
  const setCost = (k: string, n: number) => A.mkEdit((b: Blueprint) => { const k0 = b.cards[ci]; const m: Record<string, number> = typeof k0.cost === 'object' ? { ...k0.cost } : { any: k0.cost ?? 0 }; if (n) m[k] = n; else delete m[k]; k0.cost = typed ? m : (m.any ?? 0); });
  const unitNames = bp.cards.filter((k) => bp.types.find((x) => x.id === k.type)?.role === 'unit' || bp.types.find((x) => x.id === k.type)?.role === 'evolution').map((k) => k.name);
  return h('div', { class: 'mk-editor' },
    h('div', { class: 'mk-ed-top' },
      h('div', { class: 'mk-ed-preview' }, mod?.card.has(c.id) ? cardFace(mod, c.id, { size: 'lg' }) : hint('Preview unavailable until the game builds.')),
      h('div', { class: 'mk-ed-fields' },
        txt(bp, A, [...cp, 'name'], { label: 'Name', q: 'cards', onval: (v) => A.mkRenameCard(c.id, v) }),
        row(sel(bp, A, [...cp, 'type'], bp.types.map((x) => [x.id, x.name]), { label: 'Type' }),
          bp.colors.length > 0 && sel(bp, A, [...cp, 'color'], [['', 'colorless'], ...bp.colors.map((k) => [k.id, k.name] as [string, string])], { label: 'Color', map: (v) => v || undefined }),
          role === 'leader' && bp.colors.length > 0 && sel(bp, A, [...cp, 'color2'], [['', 'no second color'], ...bp.colors.map((k) => [k.id, k.name] as [string, string])], { label: 'Second color', map: (v) => v || undefined }),
          txt(bp, A, [...cp, 'art'], { label: 'Art glyph', ph: t?.icon || '◆' })),
        h('label', { class: 'fld' }, h('span', {}, 'Traits (comma-separated affiliations)'), h('input', { type: 'text', value: (c.traits ?? []).join(', '), placeholder: 'e.g. Sky Pirates, Royal Navy', 'aria-label': 'Traits',
          onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean); A.mkSet([...cp, 'traits'], v.length ? v : undefined, 'cards'); } })),
        role === 'ice' && txt(bp, A, [...cp, 'iceType'], { label: 'Guardian kind (breakers match it)', ph: 'e.g. Wall' }),
        role === 'ice' && h('div', { class: 'mk-sub' }, h('strong', {}, 'Subroutines (fire in order unless broken)'),
          (c.subs ?? []).map((f, fi) => effectRow(bp, A, [...cp, 'subs', fi], f, () => A.mkEdit((b: Blueprint) => { b.cards[ci].subs!.splice(fi, 1); }))),
          h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.cards[ci].subs ??= []).push({ k: 'endRun' }); }, 'cards') }, '+ Subroutine')),
        bp.combat.mode === 'runs' && role === 'permanent' && row(txt(bp, A, [...cp, 'breaker', 'breaks'], { label: "Breaks (guardian kind, 'all', or empty)", onval: (v: string) => A.mkEdit((b: Blueprint) => { const k = b.cards[ci]; if (!v) delete k.breaker; else k.breaker = { boostCost: 1, boostBy: 1, breakCost: 1, ...(k.breaker ?? {}), breaks: v }; }, 'cards') }),
          c.breaker && [num(bp, A, [...cp, 'breaker', 'boostCost'], { label: 'Boost cost', min: 0, max: 9 }), num(bp, A, [...cp, 'breaker', 'boostBy'], { label: '+Strength per boost', min: 1, max: 9 }), num(bp, A, [...cp, 'breaker', 'breakCost'], { label: 'Cost per subroutine', min: 0, max: 9 })]),
        bp.resource.mode === 'check' && txt(bp, A, [...cp, 'combo'], { label: 'Combo: only right after a card with this trait or type', ph: 'e.g. Punch' }),
        !['resource', 'leader', 'token'].includes(role) && bp.resource.mode !== 'none' && bp.resource.mode !== 'attach' && h('div', { class: 'mk-cost' }, h('span', { class: 'muted' }, `Cost (${costLabel(c.cost, bp)})`),
          typed ? [h('label', { class: 'fld' }, h('span', {}, 'Any'), h('input', { type: 'number', min: 0, max: 20, value: costMap.any ?? 0, onchange: (e: Event) => setCost('any', Number((e.target as HTMLInputElement).value)) })),
            ...(() => {
              const box = (k: { id: string; name: string }) => h('label', { class: 'fld' }, h('span', {}, k.name), h('input', { type: 'number', min: 0, max: 20, value: costMap[k.id] ?? 0, onchange: (e: Event) => setCost(k.id, Number((e.target as HTMLInputElement).value)) }));
              const used = bp.colors.filter((k) => (costMap[k.id] ?? 0) > 0 || k.id === c.color);
              const rest = bp.colors.filter((k) => !used.includes(k));
              return [...used.map(box), rest.length ? h('details', { class: 'mk-morecost' }, h('summary', {}, '+ other colors'), rest.map(box)) : null];
            })()]
            : num(bp, A, [...cp, 'cost'], { label: 'Cost', min: 0, max: 30 })),
        h('div', { class: 'mk-row' }, bp.stats.map((s) => num(bp, A, [...cp, 'stats', s.id], { label: s.name, min: -100000, max: 100000 }))),
        bp.keywords.length > 0 && h('div', { class: 'mk-kws' }, bp.keywords.map((k) => [h('button', { class: cls('chip', c.keywords.includes(k.id) && 'on'), title: k.text || KEYWORD_RULES[k.rule].text,
          onclick: () => A.mkEdit((b: Blueprint) => { const kk = b.cards[ci].keywords; const i = kk.indexOf(k.id); if (i >= 0) kk.splice(i, 1); else kk.push(k.id); }, 'cards') }, k.name),
          k.valued && c.keywords.includes(k.id) && h('input', { type: 'number', class: 'tiny', value: c.kwv?.[k.id] ?? 1, min: 0, max: 100000, 'aria-label': `${k.name} value`, onchange: (e: Event) => A.mkSet([...cp, 'kwv', k.id], Number((e.target as HTMLInputElement).value)) })])),
        txt(bp, A, [...cp, 'family'], { label: 'Family (evolutions onto any card of this family)', ph: 'e.g. Dragon' }),
        bp.win.prizes > 0 && UNIT_ROLES.includes(role) && num(bp, A, [...cp, 'prizes'], { label: 'Prizes taken when destroyed', min: 1, max: 6 }),
        bp.combat.mode === 'duel' && UNIT_ROLES.includes(role) && bp.colors.length > 0 && sel(bp, A, [...cp, 'resist'], [['', 'no resistance'], ...bp.colors.map((k) => [k.id, k.name] as [string, string])], { label: 'Resists', map: (v) => v || undefined }),
        role === 'resource' && row(num(bp, A, [...cp, 'provides'], { label: 'Counts as N energy', min: 1, max: 4 }), chk(bp, A, [...cp, 'rainbow'], 'Counts as every color'),
          bp.colors.length > 1 && sel(bp, A, [...cp, 'color2'], [['', 'single color'], ...bp.colors.map((k) => [k.id, k.name] as [string, string])], { label: 'Also makes (dual)', map: (v) => v || undefined })),
        ['ramp', 'cards', 'anycard', 'deck'].includes(bp.resource.mode) && row(!['resource', 'token'].includes(role) && num(bp, A, [...cp, 'kicker'], { label: 'Kicker (extra cost, 0 = none)', min: 0, max: 10 }),
          !['resource', 'token'].includes(role) && chk(bp, A, [...cp, 'xCost'], 'X cost (choose X and pay X more)'),
          ['unit', 'evolution'].includes(role) && num(bp, A, [...cp, 'shift'], { label: 'Shift cost (onto a same-named unit; 0 = none)', min: 0, max: 15 }),
          ['spell', 'fast'].includes(role) && num(bp, A, [...cp, 'flashback'], { label: 'Flashback cost', min: 0, max: 10 }), !['resource', 'token'].includes(role) && num(bp, A, [...cp, 'cycling'], { label: 'Cycling cost', min: 0, max: 10 }),
          role === 'attachment' && num(bp, A, [...cp, 'equipCost'], { label: 'Equip cost', min: 0, max: 10 })),
        bp.types.find((tt) => tt.id === c.type)?.method === 'link' && h('div', { class: 'mk-row' }, h('span', { class: 'muted' }, 'Link arrows'), (['TL', 'T', 'TR', 'L', 'R', 'BL', 'B', 'BR'] as const).map((a) =>
          h('button', { class: cls('chip', c.arrows?.includes(a) && 'on'), onclick: () => A.mkEdit((b: Blueprint) => { const k = b.cards[ci]; const s = new Set(k.arrows ?? []); if (s.has(a)) s.delete(a); else s.add(a); k.arrows = [...s]; }, 'cards') }, a))),
        ['fusion', 'link'].includes(bp.types.find((tt) => tt.id === c.type)?.method ?? '') && h('div', { class: 'mk-sub' }, h('strong', {}, 'Materials'),
          (c.mats ?? []).map((m, mi) => row(txt(bp, A, [...cp, 'mats', mi, 'name'], { label: 'Named', ph: 'card name' }), txt(bp, A, [...cp, 'mats', mi, 'trait'], { label: 'or trait', ph: 'e.g. Dessert' }),
            h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.cards[ci].mats!.splice(mi, 1); }), 'aria-label': 'Remove material' }, '🗑'))),
          h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.cards[ci].mats ??= []).push({}); }, 'cards') }, '+ material')),
        UNIT_ROLES.includes(role) && bp.combat.grid && num(bp, A, [...cp, 'scale'], { label: 'Pendulum scale (0 = none)', min: 0, max: 13 }),
        UNIT_ROLES.includes(role) && row(num(bp, A, [...cp, 'crew'], { label: 'Crew N (vehicle, 0 = off)', min: 0, max: 10 }), num(bp, A, [...cp, 'station'], { label: 'Station N (spacecraft, 0 = off)', min: 0, max: 20 })),
        role !== 'token' && chk(bp, A, [...cp, 'isToken'], 'Token (made by effects, never in decks)'))),
    role === 'evolution' && row(sel(bp, A, [...cp, 'evolvesFrom'], unitNames.filter((n) => n !== c.name).map((n) => [n, n]), { label: 'Evolves from' })),
    role === 'extra' && row(num(bp, A, [...cp, 'materials'], { label: 'Units sent to summon it', min: 1, max: 5 })),
    role === 'attachment' && h('div', { class: 'mk-row' }, h('span', { class: 'muted' }, 'Gives the unit:'), bp.stats.map((s) => num(bp, A, [...cp, 'bonus', s.id], { label: `+${s.name}`, min: -100000, max: 100000 }))),
    bp.combat.mode === 'duel' && (role === 'unit' || role === 'evolution') && [
      row(bp.colors.length > 0 && sel(bp, A, [...cp, 'weakness'], [['', 'no weakness'], ...bp.colors.map((k) => [k.id, `weak to ${k.name}`] as [string, string])], { label: 'Weakness', map: (v) => v || undefined }),
        num(bp, A, [...cp, 'retreat'], { label: 'Retreat cost', min: 0, max: 5 })),
      h('div', { class: 'mk-sub' }, h('strong', {}, 'Attacks'), (c.moves ?? []).map((mv, mi) => h('div', { class: 'mk-move' },
        txt(bp, A, [...cp, 'moves', mi, 'name'], { label: 'Attack' }), num(bp, A, [...cp, 'moves', mi, 'damage'], { label: 'Damage', min: 0, max: 999, step: 10 }),
        [['any', 'Any energy'], ...bp.colors.map((k) => [k.id, k.name])].map(([k, n]) => num(bp, A, [...cp, 'moves', mi, 'cost', k], { label: n, min: 0, max: 5 })),
        h('label', { class: 'fld' }, h('span', {}, 'Bonus damage'), h('select', { 'aria-label': 'Bonus damage', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet([...cp, 'moves', mi, 'plus'], v ? { per: v, n: mv.plus?.n ?? 10, ...(v === 'heads' ? { coins: mv.plus?.coins ?? 1 } : {}) } : undefined, 'cards'); } },
          [['', 'none'], ['energy', '+N per energy attached'], ['targetDamage', '+N per damage counter on the target'], ['benched', '+N per benched unit (yours)'], ['oppBenched', "+N per opponent's benched unit"], ['heads', '+N per heads (flip coins)']]
            .map(([v, l]) => h('option', { value: v, selected: (mv.plus?.per ?? '') === v }, l)))),
        mv.plus && num(bp, A, [...cp, 'moves', mi, 'plus', 'n'], { label: 'N', min: -999, max: 999, step: 10 }), mv.plus?.per === 'heads' && num(bp, A, [...cp, 'moves', mi, 'plus', 'coins'], { label: 'Coins', min: 1, max: 10 }),
        num(bp, A, [...cp, 'moves', mi, 'discard'], { label: 'Discard energy after', min: 0, max: 5 }),
        h('div', { class: 'mk-sub' }, (mv.do ?? []).map((f, fi) => effectRow(bp, A, [...cp, 'moves', mi, 'do', fi], f, () => A.mkEdit((b: Blueprint) => { b.cards[ci].moves![mi].do!.splice(fi, 1); }))),
          h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.cards[ci].moves![mi].do ??= []).push({ k: 'damage', n: 10, target: 'enemyUnit' }); }, 'cards') }, '+ attack effect')),
        h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.cards[ci].moves!.splice(mi, 1); }), 'aria-label': 'Remove attack' }, '🗑'))),
        h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { (b.cards[ci].moves ??= []).push({ name: 'New Attack', cost: { any: 1 }, damage: 20 }); }, 'cards') }, '+ Attack'))],
    h('div', { class: 'mk-sub' }, h('strong', {}, 'Abilities'), hint('Stack blocks: When → If → Do. The card text updates as you go.'),
      c.abilities.map((a, ai) => abilityBox(bp, A, cp, a, ai, role)),
      h('button', { class: 'cta small', onclick: () => A.mkEdit((b: Blueprint) => { b.cards[ci].abilities.push({ when: 'play', do: [{ k: 'draw', n: 1 }] }); }, 'cards'), 'data-act': 'mk-ability' }, '+ Add ability')),
    h('div', { class: 'mk-sub' }, h('strong', {}, 'Text'),
      area(bp, A, [...cp, 'text'], { label: 'Rules text (leave empty to write it automatically)', ph: cardText({ ...c, text: undefined }, bp) }),
      area(bp, A, [...cp, 'flavor'], { label: 'Flavor text', rows: 2 })),
    h('details', { class: 'mk-sub' }, h('summary', {}, '⚙ Advanced: raw card script'),
      hint('JSON merged over the compiled card: add `abilities`, `statics`, `replacements` or fields in the engine DSL.'),
      h('textarea', { class: 'code', rows: 5, 'aria-label': 'Raw card JSON', onchange: (e: Event) => A.mkRaw(`card:${c.id}`, [...cp, 'raw'], (e.target as HTMLTextAreaElement).value) }, c.raw ? JSON.stringify(c.raw, null, 1) : ''),
      mk.rawErr[`card:${c.id}`] && h('p', { class: 'mk-prob bug' }, `JSON error: ${mk.rawErr[`card:${c.id}`]}`)),
    h('div', { class: 'mk-row' }, h('button', { onclick: () => A.mkDupCard(c.id) }, '⧉ Duplicate'), h('button', { class: 'ghost bad', onclick: () => A.mkDelCard(c.id) }, '🗑 Delete card')));
}

// ---------------------------------------------------------------- 9. decks
function decksView(bp: Blueprint, A: any, mk: MakerUI, mod: Mod | null, probs: ReturnType<typeof problems>) {
  const d = bp.decks.find((x) => x.id === mk.deck) ?? bp.decks[0];
  const roleOf = new Map(bp.types.map((t) => [t.id, t.role]));
  const resDeck = bp.resource.mode === 'deck';
  const mainPool = bp.cards.filter((c) => !['leader', 'extra', 'token'].includes(roleOf.get(c.type) ?? '') && !(resDeck && roleOf.get(c.type) === 'resource'));
  const di = d ? bp.decks.indexOf(d) : -1;
  const list = (section: 'main' | 'extra' | 'res', pool: CardBP[]) => h('div', { class: 'mk-decklist' }, pool.map((c) => {
    const n = d?.[section]?.[c.id] ?? 0;
    return h('div', { class: cls('mk-dk', n > 0 && 'in') }, mod?.card.has(c.id) ? cardFace(mod, c.id, { size: 'sm', count: n || undefined }) : h('span', {}, c.name),
      h('div', { class: 'mk-dk-btns' }, h('button', { class: 'x', onclick: () => A.mkDeckCount(d!.id, section, c.id, -1), 'aria-label': `Remove ${c.name}` }, '−'), h('strong', {}, String(n)),
        h('button', { class: 'x', onclick: () => A.mkDeckCount(d!.id, section, c.id, 1), 'aria-label': `Add ${c.name}` }, '+')));
  }));
  const total = d ? Object.values(d.main).reduce((a, b) => a + b, 0) : 0;
  return [
    h('div', { class: 'mk-tabs' }, bp.decks.map((x) => h('button', { class: cls('chip', x.id === d?.id && 'on'), onclick: () => A.mkSel('deck', x.id) }, x.name)), h('button', { class: 'chip', onclick: A.mkNewDeck }, '+ New deck')),
    d ? [
      row(txt(bp, A, ['decks', di, 'name'], { label: 'Deck name', q: 'decks' }), h('span', { class: cls('chip', total >= bp.setup.deckMin && total <= bp.setup.deckMax ? 'good' : 'bad') }, `${total} cards (needs ${bp.setup.deckMin}–${bp.setup.deckMax})`),
        h('button', { onclick: () => A.mkAutofill(d.id) }, '✨ Auto-fill'), h('button', { class: 'ghost', disabled: bp.decks.length < 2, onclick: () => A.mkEdit((b: Blueprint) => { b.decks.splice(di, 1); mk.deck = null; }) }, '🗑 Delete deck')),
      probs.filter((p) => p.where === `deck:${d.id}`).map((p) => h('p', { class: 'mk-prob bug' }, `🐞 ${p.text}`)),
      (bp.setup.leader || bp.types.some((t) => t.role === 'leader')) && row(sel(bp, A, ['decks', di, 'leader'], [['', '(choose a leader)'], ...bp.cards.filter((c) => roleOf.get(c.type) === 'leader').map((c) => [c.id, c.name] as [string, string])], { label: 'Leader', map: (v) => v || undefined })),
      panel('Main deck', list('main', mainPool)),
      bp.types.some((t) => t.role === 'extra') && panel('Extra deck', list('extra', bp.cards.filter((c) => roleOf.get(c.type) === 'extra'))),
      resDeck && panel(`${bp.resource.name} deck (exactly ${bp.resource.deckSize})`, list('res', bp.cards.filter((c) => roleOf.get(c.type) === 'resource')))]
      : hint('Make a deck to start.'),
  ];
}

// ---------------------------------------------------------------- 10. playtest + AI lab
function testView(bp: Blueprint, A: any, mk: MakerUI, bugs: number) {
  const opts = bp.decks.map((d) => [d.id, d.name] as [string, string]);
  const s = mk.sim;
  const deckSel = (k: 'a' | 'b', label: string) => h('label', { class: 'fld' }, h('span', {}, label),
    h('select', { onchange: (e: Event) => A.mkSetTest(k, (e.target as HTMLSelectElement).value) }, opts.map(([v, t]) => h('option', { value: v, selected: mk.test[k] === v }, t))));
  return [
    panel('Play your game', hint('You play seat 1. Win against the AI to complete the quest.'),
      row(deckSel('a', 'Your deck'), deckSel('b', 'Opponent deck'),
        h('label', { class: 'fld' }, h('span', {}, 'Opponent'), h('select', { onchange: (e: Event) => A.mkSetTest('opp', (e.target as HTMLSelectElement).value) },
          [['heuristic', 'AI (quick)'], ['planner', 'AI (strong: plays out each turn, slower)'], ['random', 'AI (random)'], ['human', 'A friend (same device)']].map(([v, t]) => h('option', { value: v, selected: mk.test.opp === v }, t))))),
      h('button', { class: 'cta mk-bigplay', onclick: A.mkPlaytest, disabled: bugs > 0, 'data-act': 'mk-play2' }, bugs ? `Fix ${bugs} bug${bugs > 1 ? 's' : ''} to play` : '▶ Play it!')),
    panel('AI Lab', hint('Let two AIs play many games with your decks. Lopsided win rates mean a deck needs tuning; very long games may need faster win conditions.'),
      row(h('label', { class: 'fld' }, h('span', {}, 'AI players'), h('select', { 'aria-label': 'Lab AI', onchange: (e: Event) => A.mkSetTest('lab', (e.target as HTMLSelectElement).value) },
          [['heuristic', 'quick (one move ahead)'], ['planner', 'strong (plays out each turn, ~6× slower)']].map(([v, t]) => h('option', { value: v, selected: (mk.test.lab ?? 'heuristic') === v }, t)))),
        h('button', { onclick: () => A.mkSim(10), disabled: bugs > 0 || s?.running, 'data-act': 'mk-sim' }, '🧪 Run 10 games'), h('button', { onclick: () => A.mkSim(30), disabled: bugs > 0 || s?.running }, '🧪 Run 30 games')),
      s && h('div', { class: 'mk-sim' }, h('span', { class: 'mk-xpbar wide' }, h('i', { style: `width:${Math.round((100 * s.done) / s.total)}%` })), h('span', { class: 'muted' }, s.running ? `Playing game ${s.done + 1} of ${s.total}…` : 'Lab report'),
        !s.running && h('ul', { class: 'mk-report' }, s.lines.map((l) => h('li', {}, l))),
        !s.running && !!s.cards?.length && h('table', { class: 'mk-cardstats' }, h('thead', {}, h('tr', {}, h('th', {}, 'Card'), h('th', {}, 'Games played in'), h('th', {}, 'Win % when played'))),
          h('tbody', {}, s.cards.slice(0, 24).map((r) => h('tr', { class: r.games >= 3 && r.wins / r.games >= 0.7 ? 'hot' : r.games >= 3 && r.wins / r.games <= 0.3 ? 'cold' : '' },
            h('td', {}, r.name), h('td', {}, String(r.games)), h('td', {}, `${Math.round((100 * r.wins) / Math.max(1, r.games))}%`))))))),
    balancePanel(bp, A, s?.running ? [] : s?.cards ?? []),
  ];
}
/** Balance check: cards far off the game's own cost curve, and (after an AI-lab run) cards whose win rate stands out. */
function balancePanel(bp: Blueprint, A: any, play: { id: string; games: number; wins: number }[]) {
  const notes = balanceReport(bp, play);
  return panel('Balance check', hint(`Estimates what every card is worth from its stats, keywords and abilities, and compares it with your other cards of the same kind. ${play.length ? 'It also uses the AI lab games you just ran.' : 'Run the AI lab to add real win rates.'} These are estimates: trust playtests over them.`),
    notes.length ? h('ul', { class: 'mk-balance' }, notes.slice(0, 16).map((n) => h('li', { class: n.level, 'data-card': n.id },
      h('span', { class: 'mk-bal-tag' }, n.level === 'strong' ? '▲ strong' : '▼ weak'), h('strong', {}, n.name), ` ${n.text}.`,
      n.confidence === 'both' && h('span', { class: 'mk-bal-sure', title: 'Both the cost curve and the AI games say so' }, ' ✔✔'),
      n.suggest !== undefined && h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { const c = b.cards.find((k) => k.id === n.id); if (c) setCardCost(c, n.suggest!); }, 'test'), 'data-act': 'mk-balance-fix' }, `Set cost to ${n.suggest}`),
      h('button', { class: 'ghost', onclick: () => A.mkOpenCard(n.id) }, 'Open'))))
    : h('p', { class: 'muted' }, 'Nothing stands out. Every card sits close to your cost curve.'));
}

// ---------------------------------------------------------------- 11. publish
function publishView(bp: Blueprint, A: any, bugs: number) {
  const pub = published(bp.id);
  return [
    panel(pub ? 'Published' : 'Publish to your library', hint(pub ? `${bp.name} is in your library. Publish again after changes to update it.` : 'Your game will appear in the library next to the official ones, with deckbuilder, gallery and saves.'),
      row(h('button', { class: 'cta', onclick: A.mkPublish, disabled: bugs > 0, 'data-act': 'mk-publish' }, pub ? '★ Update published game' : '★ Publish'), pub && h('button', { class: 'ghost', onclick: A.mkUnpublish }, 'Remove from library'))),
    panel('Rulebook', hint('Written automatically from your design. Read it like a new player would.'), rulebook(bp).map((s) => h('div', { class: 'mk-rules' }, h('h4', {}, s.title), h('ul', {}, s.items.map((i) => h('li', {}, i))))),
      h('button', { onclick: A.mkRulebook }, '⬇ Download rulebook (.md)')),
    panel('Share', hint('A module package (.zip) can be opened by anyone with "Load a game" in the library. The blueprint (.maker.json) opens in the Game Maker so others can remix it.'),
      row(h('button', { onclick: A.mkExportZip, disabled: bugs > 0 }, '⬇ Export module (.zip)'), h('button', { onclick: A.mkExportJson }, '⬇ Export blueprint (.maker.json)'))),
  ];
}

// ---------------------------------------------------------------- 12. script lab
/** Export the game's scripts as one file, or import a script file (or pasted JSON), merged in or replacing what is there. */
function scriptIO(bp: Blueprint, A: any, mk: MakerUI) {
  const mode = mk.script?.mode ?? 'merge';
  const adv = bp.advanced ?? {};
  const counts = [adv.rules && 'rules patch', adv.triggers?.length && `${adv.triggers.length} trigger${adv.triggers.length === 1 ? '' : 's'}`,
    adv.functions && `${Object.keys(adv.functions).length} function(s)`, adv.procedures && `${Object.keys(adv.procedures).length} procedure(s)`, adv.ai && 'AI hints', adv.log && `${Object.keys(adv.log).length} event message(s)`,
    bp.cards.some((c) => c.raw && Object.keys(c.raw).length) && `${bp.cards.filter((c) => c.raw && Object.keys(c.raw).length).length} card patch(es)`].filter(Boolean);
  let paste = '';
  return h('div', { class: 'mk-sub mk-script-io' }, h('strong', {}, 'Import & export'),
    hint('Save this game\'s scripts to a .script.json file and load them into another game, or share them. Card patches apply to cards with the same id.'),
    row(h('button', { onclick: A.mkExportScripts, disabled: !counts.length, 'data-act': 'mk-export-scripts' }, '⬇ Export scripts (.script.json)'),
      h('button', { class: 'ghost', onclick: A.mkExportRules }, '⬇ Export compiled rules (rules.json)')),
    h('p', { class: 'muted' }, counts.length ? `In this game: ${counts.join(', ')}.` : 'This game has no scripts yet.'),
    h('div', { class: 'mk-seg', role: 'radiogroup', 'aria-label': 'Import mode' },
      ...(['merge', 'replace'] as const).map((m) => h('button', { class: cls('chip', mode === m && 'on'), role: 'radio', 'aria-checked': String(mode === m), onclick: () => A.mkScriptMode(m) },
        m === 'merge' ? 'Merge into my scripts' : 'Replace my scripts'))),
    h('label', { class: 'mk-file' }, '⬆ Import a script file ',
      h('input', { type: 'file', accept: '.json,application/json', 'data-act': 'mk-import-scripts', onchange: (e: Event) => { const el = e.target as HTMLInputElement; const f = el.files?.[0]; if (f) A.mkImportScripts(f); el.value = ''; } })),
    h('details', {}, h('summary', {}, 'Or paste script JSON'),
      h('textarea', { class: 'code', rows: 5, 'aria-label': 'Paste script JSON', placeholder: '{"format": "ucb-script", "v": 1, "advanced": {"triggers": [...]}}', oninput: (e: Event) => { paste = (e.target as HTMLTextAreaElement).value; } }),
      h('button', { onclick: () => paste.trim() && A.mkImportScripts(paste), 'data-act': 'mk-paste-scripts' }, 'Import pasted JSON')),
    mk.script?.err && h('p', { class: 'mk-prob bug' }, `Could not import: ${mk.script.err}`),
    mk.script?.report && h('ul', { class: 'mk-script-report' }, mk.script.report.map((l) => h('li', {}, l))),
    libraryView(A, counts.length > 0, bp.name));
}
/** The script library: starter scripts plus the user's own saved ones, usable in any project. */
function libraryView(A: any, canSave: boolean, game: string) {
  let name = '';
  const item = (e: LibraryScript) => h('li', { class: 'mk-lib-item', 'data-lib': e.id }, h('strong', {}, e.name), h('span', { class: 'muted' }, e.desc),
    row(h('button', { class: 'chip', onclick: () => A.mkLibAdd(e.id), 'data-act': 'mk-lib-add' }, '+ Add to this game'), h('button', { class: 'ghost', onclick: () => A.mkLibExport(e.id), 'aria-label': `Export ${e.name}` }, '⬇'),
      !e.builtIn && h('button', { class: 'x', onclick: () => A.mkLibDelete(e.id), 'aria-label': `Delete ${e.name}` }, '🗑')));
  const mine = scriptLibrary();
  return h('div', { class: 'mk-lib' }, h('strong', {}, 'Script library'),
    hint('Scripts you save here are available in all your projects. Adding one uses the import mode above.'),
    row(h('input', { type: 'text', placeholder: `${game} scripts`, 'aria-label': 'Library name', oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } }),
      h('button', { onclick: () => A.mkLibSave(name), disabled: !canSave, 'data-act': 'mk-lib-save' }, '★ Save my scripts to the library')),
    mine.length ? h('ul', { class: 'mk-lib-list' }, mine.map(item)) : h('p', { class: 'muted' }, 'Nothing saved yet.'),
    h('details', { open: !mine.length }, h('summary', {}, `Starter scripts (${STARTER_SCRIPTS.length})`), h('ul', { class: 'mk-lib-list' }, STARTER_SCRIPTS.map(item))));
}
function labView(bp: Blueprint, A: any, mk: MakerUI, mod: Mod | null) {
  const box = (key: string, path: Path, title: string, help: string, sample: string) => h('div', { class: 'mk-sub' }, h('strong', {}, title), hint(help),
    h('textarea', { class: 'code', rows: 6, placeholder: sample, 'aria-label': title, onchange: (e: Event) => A.mkRaw(key, path, (e.target as HTMLTextAreaElement).value) }, get(bp, path) !== undefined ? JSON.stringify(get(bp, path), null, 1) : ''),
    mk.rawErr[key] && h('p', { class: 'mk-prob bug' }, `JSON error: ${mk.rawErr[key]}`));
  return [
    hint('The Script Lab edits the compiled game directly. Everything is the same JSON rules DSL the official games use. Bad scripts show up under Checks.'),
    box('lab-rules', ['advanced', 'rules'], 'Rules patch', 'Merged into rules.json (objects merge, other values replace).', '{"turnLimit": 120, "gameVars": {"doom": 0}}'),
    box('lab-trig', ['advanced', 'triggers'], 'Extra rule triggers', 'A list of {on, if?, do}: react to any event.', '[{"on": "turnStart", "if": [">=", "$turn", 10], "do": [["draw", "$active", 1]]}]'),
    box('lab-fn', ['advanced', 'functions'], 'Functions', 'Pure expressions callable with ["call", name, ...].', '{"double": {"params": ["$x"], "body": ["*", "$x", 2]}}'),
    box('lab-proc', ['advanced', 'procedures'], 'Procedures', 'Effect lists callable with ["call", name, ...].', '{"chaos": {"params": [], "do": [["each", ["players"], "$p", [["draw", "$p", 1]]]]}}'),
    box('lab-log', ['advanced', 'log'], 'Event messages', 'Battle-log and caption text for events, by event type (your triggers can emit their own events). {p} the player, {o} a card, {s}/{es} verb endings, {is}, {has}, or any {field} of the event.', '{"doom": "{p} feel{s} the doom grow ({n})"}'),
    box('lab-ai', ['advanced', 'ai'], 'AI hints', 'Override the AI evaluation: {eval, bias, samples}.', '{"bias": {"attack": 2}}'),
    scriptIO(bp, A, mk),
    h('details', { class: 'mk-sub' }, h('summary', {}, 'View the compiled rules'), h('pre', { class: 'code mk-compiled' }, mod ? JSON.stringify(mod.rules, null, 1).slice(0, 60000) : 'Not built.')),
  ];
}
