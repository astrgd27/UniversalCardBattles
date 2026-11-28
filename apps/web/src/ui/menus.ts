// Menu screens: library (all games), game home, match setup, deckbuilder, card gallery.
import type { Deck, Mod } from '#engine';
import { battleSettings } from './table.ts';
import { deckErrors } from '#engine';
import { MODULES, SOURCES } from '../modules.ts';
import { allDecks, campaign, customDecks, hasSave, sections, slots, storageInfo, sync, type UI } from '../main.ts';
import { syncSupported } from '../storage.ts';
import { tutorialDone } from '#campaign';
import { cardFace, cls, emblem, h, hue, segmented, select, themeStyle, title, topnav } from './kit.ts';

export function library(ui: UI, A: any) {
  return h('div', { class: 'screen library' },
    h('header', { class: 'hero' },
      h('div', { class: 'logo-mark', 'aria-hidden': 'true' }, '◆'),
      h('div', {}, h('h1', {}, 'Universal Card Battles'), h('p', {}, 'One table. Every card game that never was. Choose a game to load.'))),
    h('div', { class: 'tiles' },
      h('button', { class: 'tile mk-libtile', onclick: A.mkOpen, 'data-act': 'maker' },
        h('span', { class: 'tile-badge' }, 'New'),
        h('span', { class: 'tile-emblem', 'aria-hidden': 'true' }, '⚒'),
        h('span', { class: 'tile-title' }, 'Game Maker'),
        h('span', { class: 'tile-tag' }, 'Invent your own card game: frames, rules, turns, cards. Then play it.')),
      [...MODULES.values()].sort((a, b) => Number(!!b.manifest.official) - Number(!!a.manifest.official)).map((m) => h('button', { class: cls('tile', m.manifest.official && 'official'), style: themeStyle(m), 'data-module': m.manifest.moduleId, onclick: () => A.openModule(m.manifest.moduleId) },
        m.manifest.official && h('span', { class: 'tile-badge' }, 'Official'),
        !m.manifest.official && (m.manifest.licensing ?? '').startsWith('Made with the Universal Card Battles Game Maker') && h('span', { class: 'tile-badge maker' }, 'Made by you'),
        h('span', { class: 'tile-emblem', 'aria-hidden': 'true' }, emblem(m)),
        h('span', { class: 'tile-title' }, m.manifest.displayName),
        h('span', { class: 'tile-tag' }, m.manifest.tagline ?? ''),
        h('span', { class: 'tile-meta' }, meta(m).map((x) => h('span', { class: 'chip' }, x))))),
      h('label', { class: 'tile tile-add' },
        h('span', { class: 'tile-emblem', 'aria-hidden': 'true' }, '+'),
        h('span', { class: 'tile-title' }, 'Load a game'),
        h('span', { class: 'tile-tag' }, 'Open a module package (.zip)'),
        h('input', { type: 'file', accept: '.zip', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.loadZip(f); } }))),
    h('footer', { class: 'foot' },
      storageLine(),
      syncSupported() && syncControls(A),
      h('button', { onclick: A.exportSaves, 'data-act': 'export' }, '⬇ Export saves'),
      h('label', { class: 'file-btn', 'data-act': 'import' }, '⬆ Import saves',
        h('input', { type: 'file', accept: '.json,application/json', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.importSaves(f); } })),
      segmented(ui.theme, [['dark', 'Dark'], ['light', 'Light']], A.setTheme, 'Theme'),
      segmented(ui.cardSize, [['s', 'Compact'], ['m', 'Large'], ['l', 'Huge']], A.setCardSize, 'Card size')));
}

function storageLine() {
  const where = storageInfo.backend === 'indexeddb' ? 'Saved in this browser' : storageInfo.backend === 'localStorage' ? 'Saved in this browser (basic storage)' : 'Saves last only until you close this tab';
  const mb = storageInfo.used !== null ? ` · ${(storageInfo.used / 1048576).toFixed(1)} MB` : '';
  return h('span', { class: 'muted storage-line', 'data-storage': storageInfo.backend, title: storageInfo.persisted ? 'The browser will keep these saves' : 'The browser may clear these saves when space runs low; export or link a sync file to keep them safe' },
    `${where}${mb}${storageInfo.persisted ? ' · protected' : ''}`);
}

/** Sync file controls: link a file in a cloud-synced folder and every change is written to it. */
function syncControls(A: any) {
  if (sync.status === 'off') return h('button', { onclick: () => A.linkSync(true), 'data-act': 'sync', title: 'Pick a file in a Dropbox, OneDrive, iCloud or Google Drive folder; saves are written to it automatically' }, '☁ Link sync file');
  const at = sync.at ? ` · ${new Date(sync.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '';
  return h('span', { class: 'sync-ctl' },
    sync.status === 'connected' ? h('span', { class: 'chip good', title: 'Every change is written to this file' }, `☁ ${sync.name}${at}`)
      : h('button', { onclick: () => A.linkSync(false), class: 'cta small' }, sync.status === 'error' ? `☁ Sync error, retry` : `☁ Reconnect ${sync.name}`),
    h('button', { class: 'ghost', onclick: A.unlinkSync, 'aria-label': 'Stop syncing' }, '×'));
}

/** Scripted lessons: the basics first, then one per faction; each pays its reward once. */
export function tutorialsScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const c = campaign()!;
  const list = c.tutorials ?? [];
  return h('div', { class: 'screen tutorials', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'Tutorials'),
    h('p', { class: 'muted center-row' }, 'Each lesson plays a short, scripted scene with a guide. Start with the basics.'),
    h('div', { class: 'tut-list' }, list.map((t, i) => {
      const done = tutorialDone(ui.profile, t.id);
      const reward = t.rewards?.currency ? `${t.rewards.currency} ${c.currency.name}` : '';
      return h('article', { class: cls('tut-card', done && 'done', i === 0 && 'first'), 'data-tutorial': t.id },
        h('span', { class: 'tut-icon', 'aria-hidden': 'true' }, t.icon ?? '★'),
        h('div', { class: 'tut-main' },
          h('strong', {}, t.name),
          t.blurb && h('span', { class: 'muted' }, t.blurb),
          h('span', { class: 'tut-meta' }, `${t.steps.length} steps${t.opponent ? ` · vs ${t.opponent}` : ''}${reward ? ` · ${done ? 'reward collected' : `reward ${reward}`}` : ''}`)),
        h('button', { class: cls(done ? 'ghost' : 'cta small'), onclick: () => A.startTutorial(t.id), 'data-start': t.id }, done ? 'Replay' : 'Start'));
    })));
}

/** Save slots for the open game: autosave and manual saves, newest first. */
export function savesScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const list = slots(m);
  return h('div', { class: 'screen saves', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'Load game'),
    list.length ? h('div', { class: 'slot-list' }, list.map((s) => h('div', { class: 'slot-card', 'data-slot-key': s.key },
      h('div', { class: 'slot-main' },
        h('strong', {}, s.auto ? '⟳ Autosave' : s.name),
        h('span', { class: 'muted' }, [s.savedAt ? new Date(s.savedAt).toLocaleString() : '', s.turn ? `turn ${s.turn}` : '', s.seats.map((x) => (x === 'human' ? 'You' : 'AI')).join(' vs '), s.camp ? 'campaign' : ''].filter(Boolean).join(' · '))),
      h('button', { class: 'cta small', onclick: () => A.continueGame(s.key) }, 'Load'),
      h('button', { class: 'ghost', onclick: () => A.deleteSlot(s.key), 'aria-label': `Delete ${s.name}` }, 'Delete'))))
      : h('p', { class: 'muted' }, 'No saved games yet. Use Save game in the pause menu; matches also autosave.'));
}

function meta(m: Mod): string[] {
  const R = m.rules;
  return [R.players.min === R.players.max ? `${R.players.min} players` : `${R.players.min}–${R.players.max} players`, `${m.cards.length} cards`, `${R.timing?.mode ?? 'immediate'} timing`];
}

export function home(ui: UI, A: any) {
  const m = ui.mod!;
  const camp = campaign();
  const items: [string, string, () => void, string][] = [
    ...(hasSave(m) ? [['Continue', `Resume ${slots(m)[0].auto ? 'where you left off' : slots(m)[0].name}`, () => A.continueGame(), 'continue'] as [string, string, () => void, string]] : []),
    ...(camp?.tutorials?.length ? [['Tutorials', `${camp.tutorials.filter((t) => tutorialDone(ui.profile, t.id)).length}/${camp.tutorials.length} complete · learn each faction step by step`, () => A.go('tutorials'), 'tutorials'] as [string, string, () => void, string]] : []),
    ['Play', 'A match against the AI or friends on this device', () => A.go('setup'), 'play'],
    ...(slots(m).length > 1 ? [['Load game', `${slots(m).length} saved games`, () => A.go('saves'), 'load'] as [string, string, () => void, string]] : []),
    ['Deckbuilder', `Build decks from ${m.cards.length} cards`, () => A.go('decks'), 'decks'],
    ['Card gallery', 'Browse every card', () => A.go('gallery'), 'gallery'],
    ...(SOURCES.has(m.manifest.moduleId) ? [['Edit in the Workshop', 'Open a copy of this game in the Game Maker and change anything', () => { A.mkOpen(); A.mkNew(`mod:${m.manifest.moduleId}`); }, 'remix'] as [string, string, () => void, string]] : []),
    ...(camp ? [['Campaign', ui.profile ? `${camp.name} · ${Object.keys(ui.profile.wins).length}/${Object.keys(camp.encounters).length} won` : camp.name, () => A.go('campaign'), 'campaign'] as [string, string, () => void, string]] : []),
    ...(camp?.shop?.length ? [['Shop', ui.profile ? `${ui.profile.currency} ${camp.currency.name} to spend` : 'Boosters and singles', () => A.go('shop'), 'shop'] as [string, string, () => void, string]] : []),
  ];
  return h('div', { class: 'screen home', style: themeStyle(m) },
    h('button', { class: 'back', onclick: () => A.go('library') }, '← Library'),
    h('div', { class: 'home-hero' },
      h('div', { class: 'big-emblem', 'aria-hidden': 'true' }, emblem(m)),
      h('h1', {}, m.manifest.displayName),
      h('p', { class: 'tagline' }, m.manifest.tagline ?? '')),
    h('nav', { class: 'main-menu', 'aria-label': 'Game menu' },
      items.map(([t, sub, fn, id], i) => h('button', { class: cls('menu-item', i === 0 && 'first'), 'data-menu': id, onclick: fn },
        h('span', { class: 'mi-title' }, t), h('span', { class: 'mi-sub' }, sub)))),
    h('aside', { class: 'home-info' },
      meta(m).map((x) => h('span', { class: 'chip' }, x)),
      (m.manifest.requiredCapabilities ?? []).map((c) => h('span', { class: 'chip dim' }, c)),
      h('p', { class: 'muted' }, `v${m.manifest.semanticVersion} · ${m.manifest.licensing ?? ''}`)));
}

export function setup(ui: UI, A: any) {
  const m = ui.mod!;
  const R = m.rules;
  const counts = Array.from({ length: R.players.max - R.players.min + 1 }, (_, i) => R.players.min + i).filter((n) => n >= 2);
  const names = Object.keys(allDecks(m));
  const custom = customDecks(m);
  return h('div', { class: 'screen setup', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'New match'),
    counts.length > 1 && h('div', { class: 'center-row' }, segmented(String(ui.seats.length), counts.map((c) => [String(c), `${c} players`]), (v) => A.setPlayers(+v), 'Players')),
    h('div', { class: 'seats' }, ui.seats.map((s, i) => h('div', { class: 'seat-card', 'data-seat': i + 1, style: `--h:${(i * 97 + 200) % 360}` },
      h('div', { class: 'avatar' }, String(i + 1)),
      h('div', { class: 'seat-name' }, `Player ${i + 1}`),
      segmented(s, [['human', 'Human'], ['heuristic', 'AI'], ['random', 'Random']], (v) => A.setSeat(i, v), `Player ${i + 1} seat`),
      select(ui.decks[i], names.map((d) => [d, d in custom ? `★ ${d}` : title(d)]), (v) => A.setDeck(i, v), `Player ${i + 1} deck`, 'deck-select')))),
    h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: ui.fast, onchange: (e: Event) => A.setFast((e.target as HTMLInputElement).checked) }), ' Fast AI'),
    battleSettings(A),
    h('button', { class: 'cta', onclick: A.newGame }, 'Start match'));
}
