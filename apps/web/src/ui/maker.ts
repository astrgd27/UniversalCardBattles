// Game Maker screens: the project hub with its blueprint picker, and the Workshop (a path of build stations, live card
// previews, the ability builder, playtests, the AI lab, publishing and the Script Lab). Everything edits a blueprint.
import type { Mod } from '#engine';
import {
  type Ability, type Blueprint, type CardBP, type Effect, type EffectKind, type Phase, type Role, type TargetKind, type When,
  KEYWORD_RULES, RECIPES, ROLES, UNIT_ROLES, cardText, costLabel, effectText, rulebook, slug,
} from '#maker';
import { type MakerUI, type Station, BLUEPRINTS, RANKS, STATIONS, newMakerUI, previewMod, problems, profile, projects, published, rankOf } from '../maker.ts';
import { store } from '../storage.ts';
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
function num(bp: Blueprint, A: any, path: Path, o: { min?: number; max?: number; step?: number; label?: string; q?: Station; title?: string } = {}) {
  const inp = h('input', { type: 'number', value: get(bp, path) ?? 0, min: o.min ?? 0, max: o.max, step: o.step ?? 1, 'aria-label': o.label ?? String(path[path.length - 1]), title: o.title,
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
    mk.picker && picker(A));
}
function picker(A: any) {
  return h('div', { class: 'overlay', role: 'dialog', 'aria-label': 'Choose a blueprint', onclick: (e: Event) => { if (e.target === e.currentTarget) A.mkPicker(false); } },
    h('div', { class: 'mk-picker' },
      h('div', { class: 'mk-picker-head' }, h('h2', {}, 'Pick a blueprint'), h('button', { class: 'x', onclick: () => A.mkPicker(false), 'aria-label': 'Close' }, '×')),
      hint('Each blueprint is a complete, playable game built around one family of mechanics. Reshape anything once you are in the Workshop.'),
      h('div', { class: 'mk-bps' }, h('button', { class: 'mk-bp mk-surprise', onclick: () => A.mkSurprise(), 'data-blueprint': 'surprise' }, h('span', { class: 'mk-bp-icon' }, '🎲'), h('strong', {}, 'Surprise me'),
        h('span', {}, 'A random, playable mash-up of mechanics from the shelf: a resource system, a combat style, a way to win, timing and special card types.'), h('span', { class: 'mk-bp-sys' }, h('span', { class: 'chip' }, 'Random recipes'))),
        BLUEPRINTS.map((b) => h('button', { class: 'mk-bp', onclick: () => A.mkNew(b.id), 'data-blueprint': b.id },
        h('span', { class: 'mk-bp-icon' }, b.icon), h('strong', {}, b.name), h('span', {}, b.pitch), h('span', { class: 'mk-bp-sys' }, b.systems.map((s) => h('span', { class: 'chip' }, s))))),
        [...SOURCES].map(([id, bp]) => h('button', { class: 'mk-bp', onclick: () => A.mkNew(`mod:${id}`), 'data-blueprint': `mod:${id}` },
          h('span', { class: 'mk-bp-icon' }, bp.look?.glyph ?? '✦'), h('strong', {}, `Remix ${bp.name}`), h('span', {}, bp.tagline ?? ''),
          h('span', { class: 'mk-bp-sys' }, h('span', { class: 'chip' }, 'Default game'), h('span', { class: 'chip' }, `${bp.cards?.length ?? 0} cards`)))))));
}

// ---------------------------------------------------------------- workshop shell
function workshop(ui: any, A: any, mk: MakerUI, bp: Blueprint) {
  const mod = previewMod(bp);
  const probs = problems(bp);
  const bugs = probs.filter((p) => p.level === 'bug');
  const done = new Set(profile().quests);
  const views: Record<Station, () => Child> = {
    identity: () => identity(bp, A), shelf: () => shelf(bp, A), frames: () => frames(bp, A, mk, mod), types: () => types(bp, A), board: () => board(bp, A, mod), turn: () => turn(bp, A),
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
      h('button', { class: 'cta small', onclick: A.mkPlaytest, disabled: bugs.length > 0, 'data-act': 'mk-play' }, '▶ Playtest')),
    h('div', { class: 'mk-body' },
      h('nav', { class: 'mk-path', 'aria-label': 'Build stations' }, STATIONS.map((s, i) => h('button', { class: cls('mk-station', s.id === mk.station && 'on', done.has(s.quest) && 'done'), onclick: () => A.mkStation(s.id), 'data-station': s.id },
        h('span', { class: 'mk-st-n' }, done.has(s.quest) ? '★' : String(i + 1)), h('span', { class: 'mk-st-icon' }, s.icon), h('span', { class: 'mk-st-name' }, s.name)))),
      h('main', { class: 'mk-main' }, h('div', { class: 'mk-head' }, h('h2', {}, `${st.icon} ${st.name}`), h('span', { class: cls('chip', done.has(st.quest) && 'good') }, done.has(st.quest) ? `★ ${st.goal}` : `Quest · ${st.goal} (+${st.xp} XP)`)), views[mk.station]()),
      h('aside', { class: 'mk-side' }, guide(mk.station, probs, A, mk))),
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
const FRAME_FOR: Record<Role, string> = { attack: 'classic', unit: 'skirmisher', spell: 'spell', fast: 'spell', permanent: 'spell', attachment: 'spell', resource: 'resource', trap: 'spell', leader: 'leader', evolution: 'vital', extra: 'monster', token: 'token', battlefield: 'spell', walker: 'leader' };
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
        t.role === 'attachment' && chk(bp, A, ['types', i, 'anyUnit'], 'Can go on enemy units too'), t.role === 'attachment' && chk(bp, A, ['types', i, 'equipment'], 'Equipment (stays; re-equip for a cost)'),
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
      ['none', '∅', 'Free', 'Cards are free; limit summons per turn instead.'],
    ], (v) => A.mkSet([...R, 'mode'], v, 'rules')),
    r.mode === 'anycard' && row(chk(bp, A, [...R, 'faceDown'], 'Placed face down (generic resource)'),
      sel(bp, A, [...R, 'onlyKeyword'], [['', 'Any card can be a resource'], ...bp.keywords.map((k) => [k.id, `Only cards with ${k.name}`] as [string, string])], { label: 'Which cards', map: (v) => v || undefined })),
    r.mode === 'pitch' && row(sel(bp, A, [...R, 'pitchStat'], stats, { label: 'Pitch value stat' })),
    row(sel(bp, A, [...R, 'levelGate'], [['', 'No level requirement'], ...stats], { label: 'Level requirement (stat ≤ resources in play)', map: (v) => v || undefined }),
      num(bp, A, [...R, 'actions'], { label: 'Action points per turn (0 = off)', min: 0, max: 5 })),
    row(h('label', { class: 'fld' }, h('span', {}, 'Energy requirement'), h('select', { 'aria-label': 'Energy requirement', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet([...R, 'need'], v ? { stat: v, gen: r.need?.gen ?? v } : null, 'rules'); } },
      [['', 'Off'], ...stats].map(([v, l]) => h('option', { value: v, selected: (r.need?.stat ?? '') === v }, v ? `Needs: ${l}` : l)))),
      r.need && sel(bp, A, [...R, 'need', 'gen'], stats, { label: 'Made by units\' stat' })),
    row(txt(bp, A, [...R, 'name'], { label: 'Resource name' }), txt(bp, A, [...R, 'icon'], { label: 'Icon' }),
      r.mode === 'ramp' && [num(bp, A, [...R, 'start'], { label: 'First turn', min: 0, max: 20 }), num(bp, A, [...R, 'perTurn'], { label: 'Growth per turn', min: 0, max: 10 }), num(bp, A, [...R, 'max'], { label: 'Maximum', min: 1, max: 99 })],
      r.mode === 'deck' && [num(bp, A, [...R, 'deckSize'], { label: 'Resource deck size', min: 1, max: 40 }), num(bp, A, [...R, 'start'], { label: 'First turn', min: 0, max: 10 }), num(bp, A, [...R, 'perTurn'], { label: 'Per turn', min: 0, max: 10 }),
        num(bp, A, [...R, 'secondBonus'], { label: "Extra on the second player's first turn", min: 0, max: 5 })]),
    r.mode === 'deck' && row(chk(bp, A, [...R, 'recycle'], 'Colored costs: recycle resources of that color (each still gives 1 generic)')),
    row(['ramp', 'cards', 'anycard', 'deck'].includes(r.mode) && num(bp, A, [...R, 'boost'], { label: 'Boost (+power per resource, 0 = off)', min: 0, max: 100000, step: 1 }),
      r.boost > 0 && chk(bp, A, [...R, 'give'], 'Boost is "give": main phase only, counted on the card (for "N given" conditions)'),
      num(bp, A, [...R, 'summonsPerTurn'], { label: 'Summons per turn (0 = any)', min: 0, max: 10 })),
    h('div', { class: 'mk-sub' }, h('strong', {}, 'Tribute summons'), hint('Units at or above a level must send units to the discard pile to be summoned.'),
      r.tribute.map((t, i) => row(num(bp, A, [...R, 'tribute', i, 'level'], { label: 'Level at least', min: 1, max: 20 }), num(bp, A, [...R, 'tribute', i, 'n'], { label: 'Tributes', min: 1, max: 5 }),
        h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.resource.tribute.splice(i, 1); }), 'aria-label': 'Remove' }, '🗑'))),
      h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { b.resource.tribute.push({ level: 5, n: 1 }); if (!b.stats.some((s) => s.id === 'level')) b.stats.push({ id: 'level', name: 'Level', icon: '★' }); }, 'rules') }, '+ Tribute rule'))),
    panel('Combat: how fights work', modeCards(c.mode, [
      ['block', '🛡', 'Attack & block', 'Attackers hit the player; the defender may block with a unit.'], ['target', '🎯', 'Pick a target', 'Attack a unit, the leader or the player directly.'],
      ['duel', '⚔', 'Active duel', 'One active unit fights; the rest wait on the bench. Units use printed attacks.'], ['lanes', '⟁', 'Battlefields', 'Move units onto shared battlefields; conquer and hold for points.'],
      ['cards', '🗡', 'Attack cards', 'Play attack cards from hand; the defender blocks with cards from hand.'], ['none', '☮', 'No combat', 'Win through card effects, points or races.'],
    ], (v) => A.mkSet([...Cb, 'mode'], v, 'rules')),
    c.mode === 'cards' && row(sel(bp, A, [...Cb, 'blockStat'], stats, { label: 'Blocking stat (cards discarded to defend)' })),
    c.mode === 'lanes' && row(chk(bp, A, [...Cb, 'conquest'], 'Conquest: group moves, showdowns, fights with Tank, recall on a tie'), chk(bp, A, [...Cb, 'finalPoint'], 'The winning point needs every battlefield scored this turn'),
      bp.types.some((t) => t.role === 'battlefield') && num(bp, A, [...S, 'sites'], { label: 'Battlefield cards per deck', min: 0, max: 5 })),
    c.mode === 'block' && row(chk(bp, A, [...Cb, 'mass'], 'Declare all attackers at once; blockers per attacker; first-strike step; attack walkers'), !c.mass && num(bp, A, [...Cb, 'maxBlockers'], { label: 'Blockers per attacker', min: 1, max: 5 })),
    ['block', 'target'].includes(c.mode) && row(sel(bp, A, [...Cb, 'quest'], [['', 'No questing'], ...stats], { label: 'Questing: exhaust to score this stat', map: (v) => v || null })),
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
      row(chk(bp, A, [...W, 'deckOut'], 'Drawing from an empty deck loses'), chk(bp, A, [...W, 'noUnits'], 'Having no units in play loses'),
        bp.win.lifeCards > 0 && chk(bp, A, [...W, 'lifeTriggers'], 'Life cards with a trigger can be used for free')),
      hint([bp.win.life && `Reduce the opponent from ${bp.win.life} life to 0.`, bp.win.lifeCards && `Each hit takes one of ${bp.win.lifeCards} life cards; a hit with none left wins.`,
        bp.win.prizes && `Take a prize for each enemy unit destroyed; take all ${bp.win.prizes} to win.`, (bp.win.points || c.mode === 'lanes') && `First to ${bp.win.points || 8} points wins.`].filter(Boolean).join(' ') || 'Choose at least one way to win.')),
    panel('Setup',
      row(num(bp, A, [...S, 'hand'], { label: 'Opening hand', min: 0, max: 15 }), num(bp, A, [...S, 'handLimit'], { label: 'Hand limit', min: 1, max: 99 }), num(bp, A, [...S, 'deckMin'], { label: 'Deck min', min: 5, max: 100 }),
        num(bp, A, [...S, 'deckMax'], { label: 'Deck max', min: 5, max: 120 }), num(bp, A, [...S, 'maxCopies'], { label: 'Copies per card', min: 1, max: 20 }), num(bp, A, [...S, 'turnLimit'], { label: 'Turn limit', min: 10, max: 400 })),
      row(chk(bp, A, [...S, 'mulligan'], 'Free mulligan'), bp.setup.mulligan && num(bp, A, [...S, 'mulliganN'], { label: 'Mulligan: set aside up to N (0 = whole hand)', min: 0, max: 10 }),
        bp.setup.mulligan && chk(bp, A, [...S, 'london'], 'London mulligan (redraw, then bottom 1 per mulligan)'), chk(bp, A, [...S, 'champion'], 'Each deck names a champion (playable from its own zone)'), bp.setup.leader && chk(bp, A, [...S, 'leaderColors'], "Cards must match the leader's two colors")),
      bp.combat.mode === 'duel' && row(chk(bp, A, [...S, 'benchSetup'], 'Also put basic units on the bench at setup'), chk(bp, A, [...S, 'mulliganBonus'], 'Mulligan only without a basic unit; the opponent draws 1 per mulligan')),
      row(chk(bp, A, [...S, 'noEvolveFirstTurn'], 'Nobody evolves on their own first turn'), chk(bp, A, [...S, 'skipFirstDraw'], 'First player skips the first draw'), chk(bp, A, [...S, 'leader'], 'Each deck has a leader card'),
        bp.types.some((t) => t.role === 'extra') && num(bp, A, [...S, 'extraMax'], { label: 'Extra deck size', min: 0, max: 30 }))),
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
        num(bp, A, P(i, 'attackFlip'), { label: 'Attacking: flip, tails fails + damage (0 = off)', min: 0, max: 1000 })),
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
        chk(bp, A, ['counters', i, 'expires'], 'Wears off at end of its controller\'s turn'),
        bp.stats.map((s) => num(bp, A, ['counters', i, 'adds', s.id], { label: `+${s.name} each`, min: -100000, max: 100000 })),
        h('span', { class: 'muted' }, `id: ${k.id}`), h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { b.counters!.splice(i, 1); }), 'aria-label': 'Remove counter' }, '🗑'))),
      h('button', { onclick: () => A.mkEdit((b: Blueprint) => { const list = (b.counters ??= []); let id = 'counter'; let n = 2; while (list.some((x) => x.id === id)) id = `counter${n++}`; list.push({ id, name: 'New Counter', icon: '●' }); }, 'keywords') }, '+ New counter')),
    statusPanel(bp, A),
  ];
}

// ---------------------------------------------------------------- shelf: mechanic recipes
function shelf(bp: Blueprint, A: any) {
  const used = new Set(bp.recipes ?? []);
  const groups = [...new Set(RECIPES.map((r) => r.group))];
  return [
    hint('Pick mechanics from real card games and drop them into yours. Each one adds what it needs (stats, card types, keywords, rules and example cards); stack them freely and undo any time.'),
    groups.map((gname) => panel(gname, h('div', { class: 'mk-recipes' }, RECIPES.filter((r) => r.group === gname).map((r) => h('div', { class: cls('mk-recipe', used.has(r.id) && 'on') },
      h('span', { class: 'mk-recipe-icon' }, r.icon), h('strong', {}, r.name), h('span', { class: 'muted' }, r.desc),
      h('button', { class: cls('chip', used.has(r.id) && 'on'), onclick: () => A.mkRecipe(r.id, r.name), 'data-recipe': r.id }, used.has(r.id) ? '✓ Added (add again)' : '+ Add to my game')))))),
  ];
}

// ---------------------------------------------------------------- 8. cards and the ability builder
const WHEN: [When, string][] = [['play', 'When played'], ['leave', 'When destroyed'], ['attack', 'When it attacks'], ['hit', 'When it hits the opponent'], ['quest', 'When it quests'], ['startTurn', 'At the start of your turn'],
  ['endTurn', 'At the end of your turn'], ['activated', 'Activated (exhaust and/or pay)'], ['static', 'Always on (aura)'], ['opAttack', 'When the opponent attacks (traps: spring)'], ['block', 'When it blocks'],
  ['castSpell', 'Whenever you cast a spell'], ['landfall', 'Whenever a resource enters for you'], ['conquer', 'When it conquers (battlefields: when you conquer here)'], ['hold', 'When you hold its battlefield (battlefields: here)']];
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
  ['addRes', 'Add resources from the resource deck', ['n']], ['readyRes', 'Set spent resources active', ['n']], ['giveRes', 'Give spent resources (+power)', ['n', 'target']],
  ['lifeToHand', 'Top life card to hand', ['n']], ['handToLife', 'A card from hand to the top of life', []],
  ['inflict', 'Give a status', ['status', 'n', 'target']], ['cure', 'Cure a status', ['statusAll', 'target']], ['flip', 'Flip coins (heads / tails)', ['n', 'flip']],
  ['switch', 'Switch the active unit', ['side']], ['tutor', 'Search your deck (choose)', ['n', 'type', 'dest', 'dfilter']], ['attachFrom', 'Attach a resource card from a zone', ['src', 'target', 'dfilter']],
  ['drawTo', 'Draw up to N in hand', ['n']], ['skipEvolve', 'Evolve two stages at once', []], ['fight', 'Fight (one of your units)', ['target']], ['roll', 'Roll dice', ['n', 'roll']], ['surveil', 'Surveil (top cards to discard)', ['n']], ['raw', 'Custom script (JSON)', ['raw']],
];
const TGT: [TargetKind, string][] = [['enemyUnit', 'an enemy unit (choose)'], ['anyUnit', 'any unit (choose)'], ['ownUnit', 'one of your units'], ['otherOwnUnit', 'another of your units'], ['enemyAny', 'enemy unit or opponent'],
  ['opponent', 'the opponent'], ['you', 'you'], ['self', 'this card'], ['randomEnemyUnit', 'a random enemy unit'], ['allEnemyUnits', 'all enemy units'], ['allUnits', 'all units'], ['allOwnUnits', 'all your units'],
  ['eachPlayer', 'each player'], ['attacker', 'the attacker (in a battle)'], ['battleTarget', 'the attacked card (in a battle)'], ['ownLeader', 'your leader'], ['ownAny', 'your leader or one of your units']];
const SCOPE: [TargetKind, string][] = [['allOwnUnits', 'your units'], ['otherOwnUnit', 'your other units'], ['allEnemyUnits', 'enemy units'], ['allUnits', 'all units'], ['self', 'this card']];
const zoneOpts = (bp: Blueprint): [string, string][] => [['banished', 'Banished pile'], ['grave', 'Discard pile'], ['hand', 'Hand'], ['deck', 'Deck (bottom)'], ...(bp.zones ?? []).map((z) => [z.id, z.name] as [string, string])];
const RESTRICT: [string, string][] = [['noAttack', "can't attack"], ['noBlock', "can't block"], ['noBeAttacked', "can't be attacked"], ['unblockable', "can't be blocked"], ['entersExhausted', 'enters exhausted']];
function effectRow(bp: Blueprint, A: any, ep: Path, e: Effect, onDel: () => void, kwId?: string, isStatic = false): HTMLElement {
  const def = EFF.find((x) => x[0] === e.k)!;
  const P = new Set(def[2]);
  const roleOf = new Map(bp.types.map((t) => [t.id, t.role]));
  const tokens = bp.cards.filter((c) => roleOf.get(c.type) === 'token');
  return h('div', { class: 'mk-eff' },
    sel(bp, A, [...ep, 'k'], EFF.map(([k, l]) => [k, l]), { label: 'Do' }),
    P.has('n') && !e.kw && num(bp, A, [...ep, 'n'], { label: 'Amount', min: -100000, max: 100000 }),
    P.has('n') && kwId && chk(bp, A, [...ep, 'kw'], 'Amount = keyword N'),
    P.has('n') && e.k !== 'roll' && chk(bp, A, [...ep, 'fromRoll'], 'Amount = the last roll'),
    P.has('counter') && sel(bp, A, [...ep, 'card'], (bp.counters ?? []).length ? bp.counters!.map((k) => [k.id, k.name] as [string, string]) : [['', '(make a counter first)']], { label: 'Counter' }),
    P.has('stat') && sel(bp, A, [...ep, 'stat'], bp.stats.map((s) => [s.id, s.name]), { label: 'Stat' }),
    P.has('target') && sel(bp, A, [...ep, 'target'], isStatic ? SCOPE : TGT, { label: isStatic ? 'Affects' : 'Target' }),
    P.has('rule') && sel(bp, A, [...ep, 'rule'], [...RESTRICT, ...bp.keywords.filter((k) => !RESTRICT.some(([r]) => r === k.rule) && k.rule !== 'none').map((k) => [k.rule, `gains ${k.name}`] as [string, string])], { label: 'Rule' }),
    P.has('zone') && sel(bp, A, [...ep, 'zone'], zoneOpts(bp), { label: 'To' }),
    P.has('to') && sel(bp, A, [...ep, 'to'], [['hand', 'return it to hand'], ['deck', 'put it on the bottom of the deck']], { label: 'Instead' }),
    P.has('scope') && sel(bp, A, [...ep, 'target'], SCOPE, { label: 'Affects' }),
    P.has('until') && !isStatic && sel(bp, A, [...ep, 'until'], [['turn', 'until end of turn'], ['battle', 'during this battle'], ['forever', 'until it leaves play']], { label: 'Lasts' }),
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
      e.filter?.stat && sel(bp, A, [...ep, 'filter', 'op'], [['le', 'or less'], ['ge', 'or more']], { label: 'Compare' }),
      e.filter?.stat && num(bp, A, [...ep, 'filter', 'val'], { label: 'Value', min: -100000, max: 100000 }),
      chk(bp, A, [...ep, 'filter', 'exhausted'], 'Only exhausted'),
      sel(bp, A, [...ep, 'filter', 'zone'], [['', 'in play'], ...zoneOpts(bp).filter(([z]) => z !== 'deck')], { label: 'Where', map: (v) => v || undefined }),
      txt(bp, A, [...ep, 'filter', 'name'], { label: 'Named', ph: 'name or family' }), txt(bp, A, [...ep, 'filter', 'trait'], { label: 'Trait', ph: 'e.g. Sky Pirates' }),
      (bp.statuses ?? []).length > 0 && sel(bp, A, [...ep, 'filter', 'status'], [['', 'any status'], ...bp.statuses!.map((s) => [s.id, `that is ${s.name}`] as [string, string])], { label: 'Status', map: (v) => v || undefined })),
    P.has('raw') && h('textarea', { class: 'code', rows: 2, 'aria-label': 'Custom effects JSON', onchange: (ev: Event) => A.mkRaw(ep.join('.'), [...ep, 'raw'], (ev.target as HTMLTextAreaElement).value) }, JSON.stringify(e.raw ?? [['draw', '$me', 1]])),
    h('span', { class: 'mk-eff-text muted' }, effectText(e, bp)),
    h('button', { class: 'x', onclick: onDel, 'aria-label': 'Remove effect' }, '✕'));
}
function abilityBox(bp: Blueprint, A: any, cp: Path, a: Ability, ai: number, role: Role, kwId?: string) {
  const ap: Path = [...cp, 'abilities', ai];
  return h('div', { class: 'mk-ability' },
    h('div', { class: 'mk-ab-head' },
      sel(bp, A, [...ap, 'when'], WHEN.filter(([w]) => (['conquer', 'hold'].includes(w) ? bp.combat.mode === 'lanes' : true)), { label: 'When', q: 'cards' }),
      a.when === 'activated' && [role === 'walker' && num(bp, A, [...ap, 'loyalty'], { label: 'Loyalty (+/-)', min: -20, max: 20 }), chk(bp, A, [...ap, 'sacSelf'], 'Sacrifice this'), chk(bp, A, [...ap, 'tap'], 'Exhaust this'), num(bp, A, [...ap, 'cost'], { label: 'Pay', min: 0, max: 20 }), num(bp, A, [...ap, 'discard'], { label: 'Discard', min: 0, max: 5 }),
        chk(bp, A, [...ap, 'sacrifice'], 'Sacrifice a unit'), num(bp, A, [...ap, 'banish'], { label: 'Banish from discard', min: 0, max: 10 }),
        ['cards', 'anycard', 'deck'].includes(bp.resource.mode) && num(bp, A, [...ap, 'returnRes'], { label: `Return ${bp.resource.name}`, min: 0, max: 10 }), (bp.win.life > 0 || bp.win.lifeCards > 0 || bp.setup.leader) && num(bp, A, [...ap, 'life'], { label: bp.win.life > 0 ? 'Pay life' : 'Life cards to hand', min: 0, max: 100000 }),
        (bp.counters ?? []).length > 0 && h('label', { class: 'fld' }, h('span', {}, 'Remove counters'), h('select', { 'aria-label': 'Counter cost', onchange: (ev: Event) => { const v = (ev.target as HTMLSelectElement).value; A.mkSet([...ap, 'uncount'], v ? { id: v, n: a.uncount?.n ?? 1 } : undefined); } },
          [['', 'none'], ...bp.counters!.map((k) => [k.id, k.name])].map(([v, l]) => h('option', { value: v, selected: (a.uncount?.id ?? '') === v }, l)))),
        a.uncount && num(bp, A, [...ap, 'uncount', 'n'], { label: 'How many', min: 1, max: 20 })],
      h('label', { class: 'fld' }, h('span', {}, 'If'), h('select', { 'aria-label': 'Condition', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet([...ap, 'if'], v ? { k: v, n: a.if?.n ?? 1 } : undefined); } },
        [['', 'always'], ['units', 'if you control N+ units'], ['life', 'if your life is N or less'], ['hand', 'if your hand has N or fewer'], ['yourTurn', 'during your turn'], ['res', 'if you have N+ resources'], ['counter', 'if this has N+ counters'], ['zone', 'if you have N+ cards in a zone'],
          ['played', 'if you played N other cards this turn'], ['status', 'if this has a status'], ['kicked', 'if it was kicked'], ['charged', 'if this has N+ charge'], ['attached', 'if this was given N+ resources'], ['oppTurn', "during the opponent's turn"], ['oppLife', 'if the opponent has N or less life']].map(([v, l]) => h('option', { value: v, selected: (a.if?.k ?? '') === v }, l)))),
      a.if?.k === 'zone' && sel(bp, A, [...ap, 'if', 'zone'], zoneOpts(bp).filter(([z]) => z !== 'deck' && z !== 'hand'), { label: 'Zone' }),
      a.if?.k === 'status' && sel(bp, A, [...ap, 'if', 'status'], (bp.statuses ?? []).map((k) => [k.id, k.name] as [string, string]), { label: 'Status' }),
      a.if?.k === 'counter' && sel(bp, A, [...ap, 'if', 'counter'], (bp.counters ?? []).map((k) => [k.id, k.name] as [string, string]), { label: 'Counter' }),
      a.if && !['yourTurn', 'oppTurn', 'status', 'kicked'].includes(a.if.k) && num(bp, A, [...ap, 'if', 'n'], { label: 'N', min: 0, max: 100000 }),
      h('label', { class: 'fld' }, h('span', {}, 'Limit'), h('select', { 'aria-label': 'Limit', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; A.mkSet([...ap, 'once'], v === 'turn' ? true : v === 'game' ? 'game' : undefined); } },
        [['', 'every time'], ['turn', 'once per turn'], ['game', 'once per game']].map(([v, l]) => h('option', { value: v, selected: (a.once === true ? 'turn' : a.once || '') === v }, l)))),
      h('button', { class: 'x', onclick: () => A.mkEdit((b: Blueprint) => { get(b, cp).abilities.splice(ai, 1); }), 'aria-label': 'Remove ability' }, '🗑')),
    a.do.map((e, ei) => effectRow(bp, A, [...ap, 'do', ei], e, () => A.mkEdit((b: Blueprint) => { get(b, ap).do.splice(ei, 1); }), kwId, a.when === 'static')),
    h('button', { class: 'chip', onclick: () => A.mkEdit((b: Blueprint) => { get(b, ap).do.push({ k: a.when === 'static' ? 'aura' : 'draw', n: 1, target: a.when === 'static' ? 'allOwnUnits' : 'enemyUnit' }); }, 'cards') }, '+ then…'));
}
function cardsView(bp: Blueprint, A: any, mk: MakerUI, mod: Mod | null) {
  const ci = bp.cards.findIndex((c) => c.id === mk.card);
  const c = bp.cards[ci];
  const filter = mk.filter && bp.types.some((t) => t.id === mk.filter) ? mk.filter : null;
  const shown = bp.cards.filter((k) => !filter || k.type === filter);
  return h('div', { class: 'mk-cards' },
    h('div', { class: 'mk-cardlist' },
      h('div', { class: 'mk-tabs' }, h('button', { class: cls('chip', !filter && 'on'), onclick: () => A.mkSel('filter', null) }, `All (${bp.cards.length})`),
        bp.types.map((t) => h('button', { class: cls('chip', filter === t.id && 'on'), onclick: () => A.mkSel('filter', t.id) }, `${t.icon ?? ''} ${t.name} (${bp.cards.filter((k) => k.type === t.id).length})`))),
      h('div', { class: 'mk-addrow' }, h('span', { class: 'muted' }, 'New:'), bp.types.map((t) => h('button', { class: 'chip', onclick: () => A.mkNewCard(t.id), 'data-newcard': t.id }, `+ ${t.name}`))),
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
        !['resource', 'leader', 'token'].includes(role) && bp.resource.mode !== 'none' && bp.resource.mode !== 'attach' && h('div', { class: 'mk-cost' }, h('span', { class: 'muted' }, `Cost (${costLabel(c.cost, bp)})`),
          typed ? [h('label', { class: 'fld' }, h('span', {}, 'Any'), h('input', { type: 'number', min: 0, max: 20, value: costMap.any ?? 0, onchange: (e: Event) => setCost('any', Number((e.target as HTMLInputElement).value)) })),
            bp.colors.map((k) => h('label', { class: 'fld' }, h('span', {}, k.name), h('input', { type: 'number', min: 0, max: 20, value: costMap[k.id] ?? 0, onchange: (e: Event) => setCost(k.id, Number((e.target as HTMLInputElement).value)) })))]
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
          ['spell', 'fast'].includes(role) && num(bp, A, [...cp, 'flashback'], { label: 'Flashback cost', min: 0, max: 10 }), !['resource', 'token'].includes(role) && num(bp, A, [...cp, 'cycling'], { label: 'Cycling cost', min: 0, max: 10 }),
          role === 'attachment' && num(bp, A, [...cp, 'equipCost'], { label: 'Equip cost', min: 0, max: 10 })),
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
          [['heuristic', 'AI (thinks ahead)'], ['random', 'AI (random)'], ['human', 'A friend (same device)']].map(([v, t]) => h('option', { value: v, selected: mk.test.opp === v }, t))))),
      h('button', { class: 'cta mk-bigplay', onclick: A.mkPlaytest, disabled: bugs > 0, 'data-act': 'mk-play2' }, bugs ? `Fix ${bugs} bug${bugs > 1 ? 's' : ''} to play` : '▶ Play it!')),
    panel('AI Lab', hint('Let two AIs play many games with your decks. Lopsided win rates mean a deck needs tuning; very long games may need faster win conditions.'),
      row(h('button', { onclick: () => A.mkSim(10), disabled: bugs > 0 || s?.running, 'data-act': 'mk-sim' }, '🧪 Run 10 games'), h('button', { onclick: () => A.mkSim(30), disabled: bugs > 0 || s?.running }, '🧪 Run 30 games')),
      s && h('div', { class: 'mk-sim' }, h('span', { class: 'mk-xpbar wide' }, h('i', { style: `width:${Math.round((100 * s.done) / s.total)}%` })), h('span', { class: 'muted' }, s.running ? `Playing game ${s.done + 1} of ${s.total}…` : 'Lab report'),
        !s.running && h('ul', { class: 'mk-report' }, s.lines.map((l) => h('li', {}, l))),
        !s.running && !!s.cards?.length && h('table', { class: 'mk-cardstats' }, h('thead', {}, h('tr', {}, h('th', {}, 'Card'), h('th', {}, 'Games played in'), h('th', {}, 'Win % when played'))),
          h('tbody', {}, s.cards.slice(0, 24).map((r) => h('tr', { class: r.games >= 3 && r.wins / r.games >= 0.7 ? 'hot' : r.games >= 3 && r.wins / r.games <= 0.3 ? 'cold' : '' },
            h('td', {}, r.name), h('td', {}, String(r.games)), h('td', {}, `${Math.round((100 * r.wins) / Math.max(1, r.games))}%`))))))),
  ];
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
    box('lab-ai', ['advanced', 'ai'], 'AI hints', 'Override the AI evaluation: {eval, bias, samples}.', '{"bias": {"attack": 2}}'),
    h('details', { class: 'mk-sub' }, h('summary', {}, 'View the compiled rules'), h('pre', { class: 'code mk-compiled' }, mod ? JSON.stringify(mod.rules, null, 1).slice(0, 60000) : 'Not built.')),
  ];
}
