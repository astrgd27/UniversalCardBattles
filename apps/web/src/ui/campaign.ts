// Campaign screens: map, encounter (dialogue + deck choice), reward, shop (with pack reveal).
import type { Campaign, Line, Reward } from '#campaign';
import { balance, currenciesOf, hasEncounters, itemBlocked, mainCurrency, nodeState, ownedErrors, priceOf, type Profile } from '#campaign';
import { assetUrl } from '../modules.ts';
import { deckErrors } from '#engine';
import { campaign, type UI } from '../main.ts';
import { cardFace, cls, emblem, h, select, themeStyle, topnav } from './kit.ts';

/** The wallet: every currency the campaign uses, with its icon. */
const money = (c: Campaign, p: Profile) => h('span', { class: 'money wallet', 'aria-label': 'Your currencies' },
  currenciesOf(c).map((cu) => h('span', { class: 'coin', 'data-coin': cu.id, title: cu.name }, `${cu.icon ?? '◆'} ${balance(c, p, cu.id)} ${currenciesOf(c).length > 1 ? '' : cu.name}`)));
const coinName = (c: Campaign, id?: string) => { const cu = currenciesOf(c).find((x) => x.id === (id ?? mainCurrency(c))); return { icon: cu?.icon ?? '◆', name: cu?.name ?? id ?? '' }; };
const AI_NAME: Record<string, string> = { random: 'Easy AI', heuristic: 'Normal AI', planner: 'Hard AI' };

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
        h('p', { class: 'muted' }, Object.keys(c.starter.decks).length
          ? `Start with ${c.currency.start} ${c.currency.name} and a starter collection. Win encounters to earn cards and currency.`
          : `Claim a free starter deck in the Shop, then battle rivals to earn ${c.currency.name} for booster packs.`),
        h('button', { class: 'cta', onclick: A.beginCampaign }, 'Begin campaign')));
  }
  return h('div', { class: 'screen campaign', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], c.name, money(c, p)),
    ui.dialog && dialogue(ui, A, emblem(m)),
    h('div', { class: 'camp-actions' },
      (c.shop?.length ?? 0) > 0 && h('button', { class: cls(!Object.keys(p.decks).length && 'cta small'), onclick: () => A.go('shop'), 'data-camp': 'shop' }, Object.keys(p.decks).length ? '🛒 Shop' : '🛒 Shop: claim your starter deck'),
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
    !!r.currency && h('span', { class: 'chip' }, `${coinName(c).icon} ${r.currency} ${coinName(c).name}`),
    ...Object.entries(r.coins ?? {}).filter(([, n]) => n > 0).map(([id, n]) => h('span', { class: 'chip' }, `${coinName(c, id).icon} ${n} ${coinName(c, id).name}`)),
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
    topnav([c.name, () => A.go('campaign')], en.name, money(c, p)),
    ui.dialog && dialogue(ui, A, en.portrait ?? '⚔'),
    h('div', { class: 'versus' },
      h('div', { class: 'vs-card' }, h('div', { class: 'portrait big' }, en.portrait ?? '⚔'), h('h2', {}, en.opponent), h('p', { class: 'muted' }, en.name), h('span', { class: cls('chip', 'ai-level', en.ai?.kind ?? 'heuristic') }, AI_NAME[en.ai?.kind ?? 'heuristic'])),
      h('div', { class: 'vs-mid' }, 'VS'),
      h('div', { class: 'vs-card' },
        h('div', { class: 'portrait big you' }, '★'), h('h2', {}, 'You'),
        select(ui.campDeck, Object.keys(p.decks).map((d) => [d, d]), A.setCampDeck, 'Your deck', 'deck-select'),
        h('button', { class: 'link', onclick: () => A.editCampaignDeck(ui.campDeck) }, 'Edit decks'),
        errs.length > 0 && h('ul', { class: 'errs' }, errs.slice(0, 4).map((x) => h('li', {}, x))))),
    !Object.keys(p.decks).length && h('p', { class: 'center-row muted' }, 'You have no deck yet: claim a starter deck in the Shop.'),
    h('div', { class: 'stakes' }, h('strong', {}, won ? 'Replay reward: ' : 'Reward: '), rewardChips(c, won ? en.rewards?.repeat : en.rewards?.first, m),
      en.rewards?.loss && [h('strong', {}, ' · Even in defeat: '), rewardChips(c, en.rewards.loss, m)]),
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
      Object.entries(g.coins ?? { [mainCurrency(c)]: g.currency }).filter(([, n]) => n > 0).map(([id, n]) => h('div', { class: 'loot-money', 'data-coin': id }, `+${n} ${coinName(c, id).icon} ${coinName(c, id).name}`)),
      cards.length > 0 && h('div', { class: 'grid reveal' }, cards.map((x, i) => h('div', { class: 'flip', style: `animation-delay:${i * 90}ms` }, cardFace(m, x, { size: 'md' }))))),
    !r.won && !g && h('p', { class: 'muted' }, 'No rewards this time. Adjust your deck and try again.'),
    h('div', { class: 'center-row' }, h('button', { class: 'cta', onclick: () => A.go('campaign') }, 'Back to the map')));
}

export function shopScreen(ui: UI, A: any) {
  const m = ui.mod!;
  const c = campaign()!;
  const p = ui.profile;
  if (!p) return h('div', { class: 'screen shop', style: themeStyle(m) }, topnav([m.manifest.displayName, () => A.go('home')], 'Shop'),
    h('div', { class: 'empty' }, hasEncounters(c) ? [h('p', {}, 'Begin the campaign to earn currency.'), h('button', { class: 'cta', onclick: () => A.go('campaign') }, 'Go to campaign')]
      : [h('p', {}, 'Open your collection to start shopping.'), h('button', { class: 'cta', 'data-act': 'open-shop', onclick: A.openShop }, 'Open the shop')]));
  return h('div', { class: 'screen shop', style: themeStyle(m) },
    topnav([m.manifest.displayName, () => A.go('home')], 'Shop', money(c, p)),
    !hasEncounters(c) && h('div', { class: 'camp-actions' }, h('button', { onclick: () => A.editCampaignDeck(Object.keys(p.decks)[0] ?? null), 'data-camp': 'decks' }, '🂠 Your decks')),
    h('div', { class: 'shop-grid' }, (c.shop ?? []).map((it) => {
      const left = it.stock === undefined ? null : it.stock - (p.bought[it.id] ?? 0);
      const why = itemBlocked(c, p, it);
      const art = assetUrl(m.manifest.moduleId, it.art, it.booster ? `assets/packs/${it.booster}` : it.deck ? `assets/decks/${it.deck}` : undefined);
      const deck = it.deck ? ({ ...(m.decks ?? {}), ...(c.decks ?? {}) } as Record<string, any>)[it.deck] : null;
      const lead = deck ? (Array.isArray(deck) ? deck[0] : Object.values(deck as Record<string, string[]>)[0][0]) : null;
      const n = deck ? (Array.isArray(deck) ? deck.length : Object.values(deck as Record<string, string[]>).flat().length) : 0;
      return h('div', { class: cls('shop-item', it.group && 'promo', why && 'blocked'), 'data-item': it.id },
        it.group && h('span', { class: 'promo-tag' }, it.price === 0 ? 'Free promo · choose one' : 'Choose one'),
        it.badge && h('span', { class: 'item-badge' }, it.badge),
        art ? h('img', { class: 'item-art', src: art, alt: it.name })
          : it.booster ? h('div', { class: 'pack' }, h('span', { class: 'pack-emblem' }, emblem(m)), h('span', {}, it.name),
            h('span', { class: 'muted' }, `${c.boosters![it.booster].slots.reduce((a, s) => a + s.count, 0)} cards`))
            : lead ? cardFace(m, lead, { size: 'md' }) : cardFace(m, it.card!, { size: 'md' }),
        h('strong', {}, it.name),
        it.text && h('p', { class: 'muted item-text' }, it.text),
        deck && h('div', { class: 'muted' }, `${n}-card ready-to-play deck`),
        h('div', { class: 'price' }, (() => { const pr = priceOf(it, p); const cn = coinName(c, it.currency);
          return [pr !== it.price && h('s', { class: 'muted' }, `${cn.icon} ${it.price}`), ' ', pr === 0 ? 'Free' : `${cn.icon} ${pr}`, pr !== it.price && h('span', { class: 'promo-note' }, ' first one')]; })()),
        left !== null && it.price > 0 && h('div', { class: 'muted' }, left > 0 ? `${left} left` : 'Sold out'),
        left === null && h('div', { class: 'muted' }, 'Buy as often as you like'),
        h('button', { class: 'cta small', disabled: !!why, 'data-buy': it.id, onclick: () => A.buyItem(it.id) }, why ?? (priceOf(it, p) === 0 ? 'Claim' : 'Buy')));
    })),
    ui.reveal && h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'panel-pop wide' }, h('h2', {}, 'You got'),
        h('div', { class: 'grid reveal' }, ui.reveal.map((x, i) => h('div', { class: 'flip', style: `animation-delay:${i * 120}ms` }, cardFace(m, x, { size: 'md' })))),
        h('button', { class: 'cta', onclick: A.closeReveal }, 'Collect'))));
}
