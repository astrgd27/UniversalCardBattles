// Deckbuilder and card gallery: game-aware search with facet chips, sorting, live legality, stats, sample hands,
// text import/export. Legality always comes from the engine's deckErrors (the game's own format rules).
import type { CardDef, Deck, Mod } from '#engine';
import { deckErrors } from '#engine';
import { ownedErrors } from '#campaign';
import { campaign, customDecks, sections, type UI } from '../main.ts';
import { customArt } from '../art.ts';
import { cardMatches, costTotal, curve, facets, hasToken, parseQuery, sortCards } from '../search.ts';
import { templateFor } from '../templates.ts';
import { cardFace, cls, h, hue, segmented, themeStyle, title, topnav } from './kit.ts';

/** Search box, sort control and facet chips derived from the game's own cards. */
function searchBar(ui: UI, A: any, pool: CardDef[], shown: number) {
  const f = facets(pool);
  const chip = (token: string, label: string, n?: number) => h('button', {
    class: cls('facet', hasToken(ui.filter, token) && 'on'), 'aria-pressed': hasToken(ui.filter, token), onclick: () => A.toggleFacet(token),
  }, label, n !== undefined && h('span', { class: 'facet-n' }, String(n)));
  return h('div', { class: 'searchbar' },
    h('div', { class: 'search-row' },
      h('input', {
        class: 'search', placeholder: 'Search… e.g. t:unit k:guard cost<=2 "draw"', value: ui.filter, 'data-keep': 'filter', 'aria-label': 'Search cards',
        oninput: (ev: Event) => A.setFilter((ev.target as HTMLInputElement).value),
      }),
      ui.filter && h('button', { class: 'ghost', onclick: () => A.setFilter('') }, 'Clear'),
      segmented(ui.sort, [['cost', 'Cost'], ['name', 'Name'], ['type', 'Type']], A.setSort, 'Sort by'),
      h('span', { class: 'muted' }, `${shown} / ${pool.length}`)),
    h('div', { class: 'facets', 'aria-label': 'Filters' },
      f.types.map(([t, n]) => chip(`t:${t}`, title(t), n)),
      f.words.slice(0, 14).map(([w, n]) => chip(`k:${w}`, `#${w}`, n)),
      f.costs.length > 1 && f.costs.map((c) => chip(`cost=${c}`, `◆${c}`))));
}

const filtered = (ui: UI, cards: CardDef[]) => sortCards(cards.filter((c) => cardMatches(c, parseQuery(ui.filter))), ui.sort);

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
      !inCamp && h('button', { class: 'x', 'aria-label': `Delete ${n}`, onclick: () => A.deleteDeck(n) }, '×'))) : h('p', { class: 'muted' }, 'None yet.'),
    !inCamp && h('h3', {}, 'Starter decks'),
    !inCamp && Object.keys(m.decks ?? {}).map((n) => h('div', { class: 'deck-row' }, h('button', { class: 'link', onclick: () => A.editDeck(n) }, title(n)), h('span', { class: 'muted' }, 'copy'))),
    h('h3', {}, 'Format'),
    h('p', { class: 'muted rules' }, formatSummary(m)));
  return h('div', { class: 'screen decks', style: themeStyle(m) },
    inCamp ? topnav([campaign()!.name, () => A.go('campaign')], 'Campaign decks') : topnav([m.manifest.displayName, () => A.go('home')], 'Deckbuilder'),
    h('div', { class: 'deck-layout' }, list, e ? editor(ui, A, m) : h('div', { class: 'empty' }, h('p', {}, 'Copy a starter deck or start a new one.'))),
    ui.io && ioDialog(ui, A),
    ui.sample && h('div', { class: 'overlay', onclick: A.closeSample },
      h('div', { class: 'panel-pop wide', onclick: (ev: Event) => ev.stopPropagation() }, h('h2', {}, 'Sample opening hand'),
        h('div', { class: 'grid reveal' }, ui.sample.map((x, i) => h('div', { class: 'flip', style: `animation-delay:${i * 80}ms` }, cardFace(m, x, { size: 'md' })))),
        h('div', { class: 'opts end' }, h('button', { onclick: () => A.sampleHand(ui.sample!.length) }, 'Draw again'), h('button', { class: 'cta small', onclick: A.closeSample }, 'Done')))));
}

/** The game's deck rules in words, straight from rules.format. */
function formatSummary(m: Mod): string {
  const F = m.rules.format;
  const secs = F.zones ?? [{ zone: m.rules.deckZone, min: F.deckMin, max: F.deckMax, types: undefined }];
  const parts = secs.map((s) => `${title(s.zone)}: ${s.min === s.max ? s.min : `${s.min}–${s.max}`} cards${s.types ? ` (${s.types.join(', ')})` : ''}`);
  return `${parts.join('; ')}. Up to ${F.maxCopies} copies of a card unless the card says otherwise.`;
}

function maxCopies(m: Mod, id: string) { return (m.card.get(id)?.maxCopies as number | undefined) ?? m.rules.format.maxCopies; }

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
  const eligible = m.cards.filter((c) => maxCopies(m, c.id) > 0 && (!owned || (owned[c.id] ?? 0) > 0) && (!spec.types || spec.types.includes(c.type)));
  const pool = filtered(ui, eligible);
  const here = e.deck[e.section];
  const counts = new Map<string, number>();
  for (const c of here) counts.set(c, (counts.get(c) ?? 0) + 1);
  const cv = curve(m, here);
  const peak = Math.max(1, ...cv);
  const types = new Map<string, number>();
  for (const c of here) { const t = m.card.get(c)?.type ?? '?'; types.set(t, (types.get(t) ?? 0) + 1); }
  const costs = here.map((c) => costTotal(m.card.get(c)?.cost)).filter((x): x is number => typeof x === 'number');
  return h('div', { class: 'editor' },
    h('div', { class: 'editor-head' },
      h('input', { class: 'deck-name', value: e.name, 'aria-label': 'Deck name', onchange: (ev: Event) => A.rename((ev.target as HTMLInputElement).value) }),
      h('span', { class: cls('legal-chip', errs.length ? 'bad' : 'good') }, errs.length ? `✗ ${errs.length} issue${errs.length > 1 ? 's' : ''}` : '✓ Legal'),
      h('button', { class: 'cta small', onclick: A.saveDeck }, 'Save deck'),
      h('button', { onclick: A.duplicateDeck }, 'Duplicate'),
      h('button', { onclick: () => A.openIO('export') }, 'Export'),
      h('button', { onclick: () => A.openIO('import') }, 'Import'),
      h('button', { onclick: () => A.sampleHand(5), disabled: !here.length }, 'Sample hand')),
    secs.length > 1 && segmented(e.section, secs.map((z) => [z, `${title(z)} (${e.deck[z].length})`]), A.setSection, 'Deck section'),
    errs.length > 0 && h('ul', { class: 'errs', role: 'status' }, errs.map((x) => h('li', {}, x))),
    h('div', { class: 'editor-cols' },
      h('section', { class: 'pool' },
        searchBar(ui, A, eligible, pool.length),
        h('div', { class: 'grid' }, pool.map((c) => {
          const n = inDeck.get(c.id) ?? 0;
          const cap = Math.min(maxCopies(m, c.id), owned ? owned[c.id] ?? 0 : Infinity);
          return h('div', { class: 'pool-card' },
            cardFace(m, c.id, { size: 'sm', onclick: () => A.addCard(c.id), label: `Add ${c.name} (${n} in deck)` }),
            h('span', { class: cls('copies', n > cap && 'over', n > 0 && 'some') }, `${n}/${Number.isFinite(cap) ? cap : '∞'}`),
            n > 0 && h('button', { class: 'minus', 'aria-label': `Remove ${c.name}`, onclick: () => A.removeCard(c.id) }, '−'));
        }))),
      h('section', { class: 'decklist' },
        h('h3', {}, `${title(e.section)}: ${here.length} / ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`}`),
        here.length > 0 && h('div', { class: 'deck-stats' },
          h('div', { class: 'curve', 'aria-label': `Cost curve ${cv.join(', ')}` }, cv.map((n, i) => h('div', { class: 'bar-wrap' },
            h('div', { class: 'bar', style: `height:${(n / peak) * 100}%` }, n ? String(n) : ''), h('span', {}, i === cv.length - 1 ? `${i}+` : String(i))))),
          h('div', { class: 'muted' }, [...types].map(([t, n]) => `${n} ${title(t)}`).join(' · '), costs.length ? ` · avg cost ${(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(1)}` : '')),
        [...counts].sort((a, b) => ((m.card.get(a[0])?.cost as number) ?? 99) - ((m.card.get(b[0])?.cost as number) ?? 99) || a[0].localeCompare(b[0])).map(([id, n]) => {
          const c = m.card.get(id)!;
          const over = n > maxCopies(m, id) || (owned !== null && n > (owned[id] ?? 0));
          return h('div', { class: cls('dl-row', over && 'over'), style: `--h:${hue(id)}` },
            h('span', { class: 'dl-cost' }, c.cost !== undefined ? String(c.cost) : '·'), h('span', { class: 'dl-name' }, c.name), h('span', { class: 'dl-n' }, `×${n}`),
            h('button', { class: 'x', 'aria-label': `Remove ${c.name}`, onclick: () => A.removeCard(id) }, '−'),
            h('button', { class: 'x', 'aria-label': `Add ${c.name}`, onclick: () => A.addCard(id) }, '+'));
        }))));
}

function ioDialog(ui: UI, A: any) {
  const io = ui.io!;
  return h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'panel-pop wide io' },
      h('h2', {}, io.mode === 'export' ? 'Export deck' : 'Import deck'),
      h('p', { class: 'muted' }, io.mode === 'export' ? 'Copied to your clipboard. One card per line: "2 Card Name".' : 'Paste a list: "2 Card Name" per line ("# section" lines switch section).'),
      h('textarea', { class: 'io-text', rows: 12, 'aria-label': 'Deck list', readonly: io.mode === 'export', oninput: (ev: Event) => A.setIOText((ev.target as HTMLTextAreaElement).value) }, io.text),
      io.errors.length > 0 && h('ul', { class: 'errs' }, io.errors.slice(0, 8).map((x) => h('li', {}, x))),
      h('div', { class: 'opts end' },
        h('button', { class: 'ghost', onclick: A.closeIO }, io.mode === 'export' ? 'Close' : 'Cancel'),
        io.mode === 'import' && h('button', { class: 'cta small', onclick: A.applyImport }, 'Replace deck'))));
}

export function gallery(ui: UI, A: any) {
  const m = ui.mod!;
  const cards = filtered(ui, m.cards);
  const big = ui.gallery ? m.card.get(ui.gallery) : null;
  return h('div', { class: 'screen gallery', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'Card gallery'),
    h('div', { class: 'gallery-search' }, searchBar(ui, A, m.cards, cards.length)),
    h('div', { class: 'grid roomy' }, cards.map((c) => cardFace(m, c.id, { size: 'md', onclick: () => A.enlarge(c.id) }))),
    big && h('div', { class: 'overlay', onclick: () => A.enlarge(null) },
      h('div', { class: 'enlarged', onclick: (ev: Event) => ev.stopPropagation() }, cardFace(m, big.id, { size: 'lg' }),
        h('p', { class: 'muted' }, `Template: ${templateFor(m, big).label}`),
        h('div', { class: 'opts' },
          h('label', { class: 'file-btn', 'data-act': 'art' }, '🖼 Use my own art',
            h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.setArt(big.id, f); } })),
          customArt(m.manifest.moduleId, big.id) && h('button', { onclick: () => A.clearArt(big.id) }, 'Reset art'),
          h('button', { onclick: () => A.enlarge(null) }, 'Close')),
        h('p', { class: 'muted' }, 'Your art is stored only in this browser.'))));
}
