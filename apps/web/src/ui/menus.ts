// Menu screens: library (all games), game home, match setup, deckbuilder, card gallery.
import type { Deck, Mod } from '#engine';
import { deckErrors } from '#engine';
import { MODULES } from '../modules.ts';
import { allDecks, campaign, customDecks, hasSave, sections, type UI } from '../main.ts';
import { ownedErrors } from '#campaign';
import { customArt } from '../art.ts';
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

export function decks(ui: UI, A: any) {
  const m = ui.mod!;
  const e = ui.edit;
  const inCamp = !!e?.campaign;
  const custom = inCamp ? ui.profile!.decks : customDecks(m);
  const list = h('aside', { class: 'deck-list' },
    h('button', { class: 'cta small', onclick: () => A.editDeck(null, inCamp) }, '+ New deck'),
    h('h3', {}, 'Your decks'),
    Object.keys(custom).length ? Object.keys(custom).map((n) => h('div', { class: cls('deck-row', e?.original === n && 'on') },
      h('button', { class: 'link', onclick: () => A.editDeck(n, inCamp) }, `★ ${n}`),
      h('button', { class: 'x', 'aria-label': `Delete ${n}`, onclick: () => A.deleteDeck(n) }, '×'))) : h('p', { class: 'muted' }, 'None yet.'),
    !inCamp && h('h3', {}, 'Starter decks'),
    !inCamp && Object.keys(m.decks ?? {}).map((n) => h('div', { class: 'deck-row' }, h('button', { class: 'link', onclick: () => A.editDeck(n) }, title(n)), h('span', { class: 'muted' }, 'copy'))));
  return h('div', { class: 'screen decks', style: themeStyle(m) },
    inCamp ? topnav([campaign()!.name, () => A.go('campaign')], 'Campaign decks') : topnav([m.manifest.displayName, () => A.go('home')], 'Deckbuilder'),
    h('div', { class: 'deck-layout' }, list, e ? editor(ui, A, m) : h('div', { class: 'empty' }, h('p', {}, 'Copy a starter deck or start a new one.'))));
}

function editor(ui: UI, A: any, m: Mod) {
  const e = ui.edit!;
  const secs = sections(m);
  const F = m.rules.format;
  const spec = F.zones?.find((z) => z.zone === e.section) ?? { zone: e.section, min: F.deckMin, max: F.deckMax, types: undefined };
  const deck: Deck = secs.length === 1 && !F.zones ? e.deck[secs[0]] : e.deck;
  const owned = e.campaign ? ui.profile!.collection : null;
  const errs = [...deckErrors(m, deck), ...(owned ? ownedErrors(owned, deck) : [])];
  const inDeck = new Map<string, number>();
  for (const l of Object.values(e.deck)) for (const c of l) inDeck.set(c, (inDeck.get(c) ?? 0) + 1);
  const q = ui.filter.toLowerCase();
  const pool = m.cards.filter((c) => (!owned || (owned[c.id] ?? 0) > 0) && (!spec.types || spec.types.includes(c.type)) && (!q || `${c.name} ${c.type} ${c.text ?? ''}`.toLowerCase().includes(q)));
  const counts = new Map<string, number>();
  for (const c of e.deck[e.section]) counts.set(c, (counts.get(c) ?? 0) + 1);
  return h('div', { class: 'editor' },
    h('div', { class: 'editor-head' },
      h('input', { class: 'deck-name', value: e.name, 'aria-label': 'Deck name', onchange: (ev: Event) => A.rename((ev.target as HTMLInputElement).value) }),
      h('span', { class: cls('legal-chip', errs.length ? 'bad' : 'good') }, errs.length ? `✗ ${errs.length} issue${errs.length > 1 ? 's' : ''}` : '✓ Legal'),
      h('button', { class: 'cta small', onclick: A.saveDeck }, 'Save deck')),
    secs.length > 1 && segmented(e.section, secs.map((z) => [z, `${title(z)} (${e.deck[z].length})`]), A.setSection, 'Deck section'),
    errs.length > 0 && h('ul', { class: 'errs' }, errs.map((x) => h('li', {}, x))),
    h('div', { class: 'editor-cols' },
      h('section', { class: 'pool' },
        h('input', { class: 'search', placeholder: 'Search cards…', value: ui.filter, 'data-keep': 'filter', 'aria-label': 'Search cards', oninput: (ev: Event) => A.setFilter((ev.target as HTMLInputElement).value) }),
        h('div', { class: 'grid' }, pool.map((c) => cardFace(m, c.id, { size: 'sm', count: owned ? (owned[c.id] ?? 0) - (inDeck.get(c.id) ?? 0) : (inDeck.get(c.id) ?? 0), onclick: () => A.addCard(c.id), label: `Add ${c.name}` })))),
      h('section', { class: 'decklist' },
        h('h3', {}, `${title(e.section)}: ${e.deck[e.section].length} / ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`}`),
        [...counts].sort((a, b) => ((m.card.get(a[0])?.cost as number) ?? 0) - ((m.card.get(b[0])?.cost as number) ?? 0)).map(([id, n]) => {
          const c = m.card.get(id)!;
          return h('div', { class: 'dl-row', style: `--h:${hue(id)}` },
            h('span', { class: 'dl-cost' }, c.cost !== undefined ? String(c.cost) : '·'), h('span', { class: 'dl-name' }, c.name), h('span', { class: 'dl-n' }, `×${n}`),
            h('button', { class: 'x', 'aria-label': `Remove ${c.name}`, onclick: () => A.removeCard(id) }, '−'));
        }))));
}

export function gallery(ui: UI, A: any) {
  const m = ui.mod!;
  const q = ui.filter.toLowerCase();
  const cards = m.cards.filter((c) => !q || `${c.name} ${c.type} ${c.text ?? ''}`.toLowerCase().includes(q));
  const big = ui.gallery ? m.card.get(ui.gallery) : null;
  return h('div', { class: 'screen gallery', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'Card gallery',
      h('input', { class: 'search', placeholder: 'Search…', value: ui.filter, 'data-keep': 'filter', 'aria-label': 'Search cards', oninput: (ev: Event) => A.setFilter((ev.target as HTMLInputElement).value) })),
    h('div', { class: 'grid roomy' }, cards.map((c) => cardFace(m, c.id, { size: 'md', onclick: () => A.enlarge(c.id) }))),
    big && h('div', { class: 'overlay', onclick: () => A.enlarge(null) },
      h('div', { class: 'enlarged', onclick: (ev: Event) => ev.stopPropagation() }, cardFace(m, big.id, { size: 'lg' }),
        h('div', { class: 'opts' },
          h('label', { class: 'file-btn', 'data-act': 'art' }, '🖼 Use my own art',
            h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.setArt(big.id, f); } })),
          customArt(m.manifest.moduleId, big.id) && h('button', { onclick: () => A.clearArt(big.id) }, 'Reset art'),
          h('button', { onclick: () => A.enlarge(null) }, 'Close')),
        h('p', { class: 'muted' }, 'Your art is stored only in this browser.'))));
}
