// Menu screens: library (all games), game home, match setup, deckbuilder, card gallery.
import type { Deck, Mod } from '#engine';
import { deckErrors } from '#engine';
import { MODULES } from '../modules.ts';
import { allDecks, campaign, customDecks, hasSave, sections, type UI } from '../main.ts';
import { cardFace, cls, emblem, h, hue, segmented, select, themeStyle, title, topnav } from './kit.ts';

export function library(ui: UI, A: any) {
  return h('div', { class: 'screen library' },
    h('header', { class: 'hero' },
      h('div', { class: 'logo-mark', 'aria-hidden': 'true' }, '◆'),
      h('div', {}, h('h1', {}, 'Universal Card Battles'), h('p', {}, 'One table. Every card game that never was. Choose a game to load.'))),
    h('div', { class: 'tiles' },
      [...MODULES.values()].map((m) => h('button', { class: 'tile', style: themeStyle(m), 'data-module': m.manifest.moduleId, onclick: () => A.openModule(m.manifest.moduleId) },
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
      h('button', { onclick: A.exportSaves, 'data-act': 'export' }, '⬇ Export saves'),
      h('label', { class: 'file-btn', 'data-act': 'import' }, '⬆ Import saves',
        h('input', { type: 'file', accept: '.json,application/json', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.importSaves(f); } })),
      segmented(ui.theme, [['dark', 'Dark'], ['light', 'Light']], A.setTheme, 'Theme')));
}

function meta(m: Mod): string[] {
  const R = m.rules;
  return [R.players.min === R.players.max ? `${R.players.min} players` : `${R.players.min}–${R.players.max} players`, `${m.cards.length} cards`, `${R.timing?.mode ?? 'immediate'} timing`];
}

export function home(ui: UI, A: any) {
  const m = ui.mod!;
  const camp = campaign();
  const items: [string, string, () => void, string][] = [
    ...(hasSave(m) ? [['Continue', 'Resume your saved match', A.continueGame, 'continue'] as [string, string, () => void, string]] : []),
    ['Play', 'A match against the AI or friends on this device', () => A.go('setup'), 'play'],
    ['Deckbuilder', `Build decks from ${m.cards.length} cards`, () => A.go('decks'), 'decks'],
    ['Card gallery', 'Browse every card', () => A.go('gallery'), 'gallery'],
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
    h('button', { class: 'cta', onclick: A.newGame }, 'Start match'));
}
