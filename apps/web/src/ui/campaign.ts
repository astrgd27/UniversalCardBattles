// Campaign screens: map, encounter (dialogue + deck choice), reward, shop (with pack reveal).
import type { Campaign, Line, Reward } from '#campaign';
import { nodeState, ownedErrors } from '#campaign';
import { deckErrors } from '#engine';
import { campaign, type UI } from '../main.ts';
import { cardFace, cls, emblem, h, select, themeStyle, topnav } from './kit.ts';

const money = (c: Campaign, n: number) => h('span', { class: 'money', 'aria-label': `${n} ${c.currency.name}` }, `◆ ${n} ${c.currency.name}`);

function dialogue(ui: UI, A: any, portrait: string) {
  const d = ui.dialog!;
  const line = d.lines[d.i];
  return h('div', { class: 'dialogue', role: 'dialog', 'aria-label': 'Dialogue' },
    h('div', { class: 'portrait', 'aria-hidden': 'true' }, portrait),
    h('div', { class: 'speech' },
      h('div', { class: 'speaker' }, line.speaker),
      h('p', {}, line.text),
      h('div', { class: 'opts end' },
        h('span', { class: 'muted' }, `${d.i + 1} / ${d.lines.length}`),
        h('button', { class: 'ghost', onclick: () => A.dialogNext(true) }, 'Skip'),
        h('button', { class: 'cta small', onclick: () => A.dialogNext(), autofocus: true }, d.i + 1 < d.lines.length ? 'Next' : 'Continue'))));
}

export function campaignScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const c = campaign()!;
  const p = ui.profile;
  if (!p) {
    return h('div', { class: 'screen campaign', style: themeStyle(m) },
      topnav([m.manifest.displayName, () => A.go('home')], 'Campaign'),
      h('div', { class: 'camp-start' },
        h('div', { class: 'big-emblem' }, emblem(m)),
        h('h1', {}, c.name),
        c.intro?.[0] && h('p', { class: 'tagline' }, `“${c.intro[0].text}”`),
        h('p', { class: 'muted' }, `Start with ${c.currency.start} ${c.currency.name} and a starter collection. Win encounters to earn cards and currency.`),
        h('button', { class: 'cta', onclick: A.beginCampaign }, 'Begin campaign')));
  }
  return h('div', { class: 'screen campaign', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], c.name, money(c, p.currency)),
    ui.dialog && dialogue(ui, A, emblem(m)),
    h('div', { class: 'camp-actions' },
      (c.shop?.length ?? 0) > 0 && h('button', { onclick: () => A.go('shop'), 'data-camp': 'shop' }, '🛒 Shop'),
      h('button', { onclick: () => A.editCampaignDeck(Object.keys(p.decks)[0] ?? null), 'data-camp': 'decks' }, '🂠 Your decks'),
      h('span', { class: 'muted' }, `${Object.values(p.collection).reduce((a, n) => a + n, 0)} cards collected`),
      h('button', { class: 'ghost danger', onclick: A.resetCampaign }, 'Reset progress')),
    c.chapters.map((ch) => h('section', { class: 'chapter' },
      h('h3', {}, ch.name),
      h('div', { class: 'path' }, ch.nodes.map((id, i) => {
        const en = c.encounters[id];
        const st = nodeState(c, p, id);
        return [i > 0 && h('span', { class: cls('link-line', st !== 'locked' && 'lit'), 'aria-hidden': 'true' }),
          h('button', { class: cls('node', st), disabled: st === 'locked', 'data-node': id, onclick: () => A.openEncounter(id) },
            h('span', { class: 'node-portrait' }, st === 'locked' ? '🔒' : en.portrait ?? '⚔'),
            h('span', { class: 'node-name' }, en.name),
            h('span', { class: 'muted' }, en.opponent),
            h('span', { class: 'node-state' }, st === 'won' ? `✓ Won ×${p.wins[id]}` : st === 'open' ? 'Available' : 'Locked'))];
      })))));
}

function rewardChips(c: Campaign, r: Reward | undefined, m: any) {
  if (!r) return h('span', { class: 'muted' }, 'No reward');
  return [
    !!r.currency && h('span', { class: 'chip' }, `◆ ${r.currency} ${c.currency.name}`),
    ...(r.cards ?? []).map((x) => h('span', { class: 'chip' }, `🂠 ${m.card.get(x)?.name ?? x}`)),
    ...(r.packs ?? []).map((x) => h('span', { class: 'chip' }, `🎁 ${c.boosters?.[x]?.name ?? x}`)),
  ];
}

export function encounterScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const c = campaign()!;
  const p = ui.profile!;
  const en = c.encounters[ui.encounter!];
  const deck = p.decks[ui.campDeck];
  const errs = deck ? [...deckErrors(m, deck), ...ownedErrors(p.collection, deck)] : ['Choose a deck'];
  const won = !!p.wins[ui.encounter!];
  return h('div', { class: 'screen encounter', style: themeStyle(m) },
    topnav([c.name, () => A.go('campaign')], en.name, money(c, p.currency)),
    ui.dialog && dialogue(ui, A, en.portrait ?? '⚔'),
    h('div', { class: 'versus' },
      h('div', { class: 'vs-card' }, h('div', { class: 'portrait big' }, en.portrait ?? '⚔'), h('h2', {}, en.opponent), h('p', { class: 'muted' }, en.name)),
      h('div', { class: 'vs-mid' }, 'VS'),
      h('div', { class: 'vs-card' },
        h('div', { class: 'portrait big you' }, '★'), h('h2', {}, 'You'),
        select(ui.campDeck, Object.keys(p.decks).map((d) => [d, d]), A.setCampDeck, 'Your deck', 'deck-select'),
        h('button', { class: 'link', onclick: () => A.editCampaignDeck(ui.campDeck) }, 'Edit decks'),
        errs.length > 0 && h('ul', { class: 'errs' }, errs.slice(0, 4).map((x) => h('li', {}, x))))),
    h('div', { class: 'stakes' }, h('strong', {}, won ? 'Replay reward: ' : 'Reward: '), rewardChips(c, won ? en.rewards?.repeat : en.rewards?.first, m)),
    h('div', { class: 'center-row' }, h('button', { class: 'cta', disabled: errs.length > 0, onclick: A.playEncounter }, 'Fight!')));
}

export function rewardScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const c = campaign()!;
  const r = ui.reward!;
  const g = r.granted;
  const cards = g ? [...g.cards, ...g.packs.flatMap((x) => x.cards)] : [];
  return h('div', { class: 'screen reward', style: themeStyle(m) },
    h('h1', { class: cls('result', r.won ? 'win' : 'loss') }, r.won ? 'Victory' : 'Defeat'),
    r.lines.map((l: Line) => h('blockquote', {}, h('strong', {}, l.speaker), ` — ${l.text}`)),
    g && h('div', { class: 'loot' },
      g.currency > 0 && h('div', { class: 'loot-money' }, `+${g.currency} ${c.currency.name}`),
      cards.length > 0 && h('div', { class: 'grid reveal' }, cards.map((x, i) => h('div', { class: 'flip', style: `animation-delay:${i * 90}ms` }, cardFace(m, x, { size: 'md' }))))),
    !r.won && h('p', { class: 'muted' }, 'No rewards this time. Adjust your deck and try again.'),
    h('div', { class: 'center-row' }, h('button', { class: 'cta', onclick: () => A.go('campaign') }, 'Back to the map')));
}

export function shopScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const c = campaign()!;
  const p = ui.profile;
  if (!p) return h('div', { class: 'screen shop', style: themeStyle(m) }, topnav([m.manifest.displayName, () => A.go('home')], 'Shop'),
    h('div', { class: 'empty' }, h('p', {}, 'Begin the campaign to earn currency.'), h('button', { class: 'cta', onclick: () => A.go('campaign') }, 'Go to campaign')));
  return h('div', { class: 'screen shop', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'Shop', money(c, p.currency)),
    h('div', { class: 'shop-grid' }, (c.shop ?? []).map((it) => {
      const left = it.stock === undefined ? null : it.stock - (p.bought[it.id] ?? 0);
      const can = p.currency >= it.price && left !== 0;
      return h('div', { class: 'shop-item' },
        it.booster ? h('div', { class: 'pack' }, h('span', { class: 'pack-emblem' }, emblem(m)), h('span', {}, it.name),
          h('span', { class: 'muted' }, `${c.boosters![it.booster].slots.reduce((a, s) => a + s.count, 0)} cards`)) : cardFace(m, it.card!, { size: 'md' }),
        h('div', { class: 'price' }, `◆ ${it.price}`),
        left !== null && h('div', { class: 'muted' }, left > 0 ? `${left} left` : 'Sold out'),
        h('button', { class: 'cta small', disabled: !can, 'data-buy': it.id, onclick: () => A.buyItem(it.id) }, left === 0 ? 'Sold out' : 'Buy'));
    })),
    ui.reveal && h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'panel-pop wide' }, h('h2', {}, 'You got'),
        h('div', { class: 'grid reveal' }, ui.reveal.map((x, i) => h('div', { class: 'flip', style: `animation-delay:${i * 120}ms` }, cardFace(m, x, { size: 'md' })))),
        h('button', { class: 'cta', onclick: A.closeReveal }, 'Collect'))));
}
