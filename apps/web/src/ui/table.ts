// The game table. Renders strictly from observe()/eventsFor()/listActions() for the viewing player.
import type { GEvent, Mod, ObjView, Template, View, ZoneDef } from '#engine';
import { eventsFor, listActions, observe } from '#engine';
import { actor, current, type UI } from '../main.ts';
import { cardBack, cardFace, cls, emblem, h, noteEl, pname, segmented, themeStyle, title } from './kit.ts';

interface C {
  ui: UI; A: any; v: View; mod: Mod;
  sources: Set<string>; targets: Set<string>; picked: Set<string>;
  label: (x: string) => string;
}

export function table(ui: UI, A: any) {
  const m = ui.match!;
  const mod = m.m;
  const v = observe(m, ui.viewer);
  const mine = actor(m) === ui.viewer && !ui.cover && !m.s.result && !ui.paused;
  const tpls: Template[] = mine && !m.s.pending ? listActions(m, ui.viewer) : [];
  const step = ui.sel ? current(ui.sel) : null;
  const names = new Map<string, string>();
  for (const z of Object.values(v.zones)) for (const c of z.cards ?? []) names.set(c.id, c.card ? mod.card.get(c.card)?.name ?? c.card : 'a face-down card');
  for (const it of v.stack) names.set(it.id, it.label);
  const c: C = {
    ui, A, v, mod,
    sources: new Set(tpls.map((t) => t.source).filter(Boolean) as string[]),
    targets: new Set(step?.options ?? []),
    picked: new Set(step ? ui.sel!.picks[step.key] ?? [] : []),
    label: (x) => (/^p\d+$/.test(x) ? pname(x) : names.get(x) ?? x),
  };
  const shared = mod.rules.zones.filter((z) => z.shared);
  return h('div', { class: 'screen table', style: themeStyle(mod) },
    hud(c, mine),
    h('div', { class: 'felt' },
      h('div', { class: 'opponents' }, v.players.filter((p) => p.id !== ui.viewer).map((p) => seat(c, p.id, false))),
      (shared.length > 0 || v.stack.length > 0) && h('div', { class: 'center' },
        shared.map((z) => zoneBlock(c, `shared:${z.id}`, z)),
        v.stack.length > 0 && stack(c)),
      seat(c, ui.viewer, true)),
    dock(c, mine, tpls, step),
    ui.drawer && drawer(c),
    ui.paused && pause(c),
    v.result && gameOver(c),
    ui.cover && h('div', { class: 'overlay cover', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'panel-pop' }, h('h2', {}, `Pass the device to ${pname(ui.cover)}`),
        h('button', { class: 'cta', onclick: A.reveal, autofocus: true }, `I am ${pname(ui.cover)}`))));
}

function hud(c: C, mine: boolean) {
  const { ui, A, v, mod } = c;
  const who = ui.match!.s.pending?.player ?? v.priority;
  return h('header', { class: 'hud' },
    h('button', { class: 'icon', 'aria-label': 'Menu', onclick: () => A.pause(true) }, '☰'),
    h('span', { class: 'hud-game' }, h('span', { class: 'hud-emblem' }, emblem(mod)), mod.manifest.displayName),
    h('span', { class: 'pill' }, `Turn ${v.turn} · ${title(v.phase)}`),
    h('span', { class: cls('hud-status', mine && 'go'), role: 'status' },
      v.result ? 'Game over' : mine ? (v.pending ? 'Your decision' : 'Your move') : `${who ? pname(who) : '…'} is thinking…`),
    h('span', { class: 'hud-right' },
      h('button', { class: cls('icon', ui.drawer === 'log' && 'on'), onclick: () => A.drawer('log'), 'aria-label': 'Log' }, '☷ Log'),
      h('button', { class: cls('icon', ui.drawer === 'card' && 'on'), onclick: () => A.drawer('card'), 'aria-label': 'Card details' }, '🔍')));
}

function obj(c: C, o: ObjView, size: 'sm' | 'md') {
  const state = cls(c.sources.has(o.id) && 'legal', c.targets.has(o.id) && 'target', c.picked.has(o.id) && 'picked', c.ui.inspect === o.id && 'inspected');
  const onclick = () => c.A.pick(o.id);
  if (!o.card) return cardBack(c.mod, { size, state, onclick });
  return cardFace(c.mod, o.card, { size, state, onclick, stats: o.stats, vars: o.vars, baseVars: c.mod.rules.objectVars, keywords: o.keywords, faceDown: o.faceDown });
}

function layout(mod: Mod) {
  const zones = mod.rules.zones.filter((z) => !z.shared);
  const hand = zones.find((z) => z.id === mod.rules.handZone);
  const field = zones.filter((z) => z !== hand && z.vis === 'public' && !z.ordered);
  return { hand, field, piles: zones.filter((z) => z !== hand && !field.includes(z)) };
}

function seat(c: C, p: string, me: boolean) {
  const { v, mod, A, targets, picked } = c;
  const pl = v.players.find((x) => x.id === p)!;
  const L = layout(mod);
  const bar = h('div', { class: 'seat-bar' },
    h('button', {
      class: cls('avatar', targets.has(p) && 'target', picked.has(p) && 'picked'), style: `--h:${(+p.slice(1) * 97 + 200) % 360}`,
      'aria-label': `${pname(p)}${targets.has(p) ? ', can be chosen' : ''}`, onclick: () => (c.ui.sel ? A.pick(p) : A.view(p)),
    }, String(+p.slice(1) + 1)),
    h('span', { class: 'seat-name' }, `${pname(p)}${me ? ' (you)' : ''}`, v.active === p ? h('span', { class: 'turn-dot', title: 'Active player' }, ' ●') : null, pl.lost ? ' — out' : ''),
    h('span', { class: 'vars' }, Object.entries(pl.vars).map(([k, n]) => h('span', { class: 'chip' }, h('b', {}, String(n)), ` ${k}`))),
    h('span', { class: 'piles' }, L.piles.map((z) => pile(c, `${p}:${z.id}`, z))));
  const field = h('div', { class: 'field' }, L.field.map((z) => zoneBlock(c, `${p}:${z.id}`, z)));
  const hand = L.hand ? handRow(c, `${p}:${L.hand.id}`, me) : null;
  return h('section', { class: cls('seat-area', me ? 'me' : 'opp', pl.lost && 'lost', v.active === p && 'active') },
    me ? [field, hand, bar] : [bar, hand, field]);
}

function pile(c: C, key: string, z: ZoneDef) {
  const zv = c.v.zones[key];
  if (!zv) return null;
  const hot = (zv.cards ?? []).some((o) => c.sources.has(o.id) || c.targets.has(o.id));
  return h('button', {
    class: cls('pile', hot && 'hot', !zv.cards && 'hidden'), disabled: !zv.cards,
    'aria-label': `${title(z.id)}: ${zv.count} cards${zv.cards ? '' : ' (hidden)'}`, onclick: () => c.A.drawer('pile', key),
  }, h('span', { class: 'pile-n' }, String(zv.count)), h('span', { class: 'pile-l' }, title(z.id)));
}

function zoneBlock(c: C, key: string, z: ZoneDef) {
  const zv = c.v.zones[key];
  if (!zv) return null;
  if (!zv.cards) return pile(c, key, z);
  if (!zv.cards.length && !z.abilities) return null;
  return h('div', { class: 'zone' }, h('span', { class: 'zone-l' }, title(z.id)),
    h('div', { class: 'row' }, zv.cards.length ? zv.cards.map((o) => obj(c, o, 'sm')) : h('span', { class: 'empty-slot' }, 'empty')));
}

function handRow(c: C, key: string, me: boolean) {
  const zv = c.v.zones[key];
  if (!zv) return null;
  if (!zv.cards) return h('div', { class: 'hand backs', 'aria-label': `${zv.count} cards in hand` }, Array.from({ length: Math.min(zv.count, 12) }, () => cardBack(c.mod, { size: 'sm' })));
  return h('div', { class: cls('hand', me && 'mine') }, zv.cards.map((o) => obj(c, o, 'md')));
}

function stack(c: C) {
  return h('div', { class: 'stack' }, h('span', { class: 'zone-l' }, 'Stack — top resolves first'),
    [...c.v.stack].reverse().map((it, i) => h('button', {
      class: cls('stack-item', i === 0 && 'top', c.targets.has(it.id) && 'target', c.picked.has(it.id) && 'picked'), onclick: () => c.A.pick(it.id),
    }, h('b', {}, it.label), ` · ${pname(it.ctrl)}`)));
}

function dock(c: C, mine: boolean, tpls: Template[], step: ReturnType<typeof current> | null) {
  const { ui, A, label } = c;
  const body = ui.note ? noteEl(ui.note, A.closeNote)
    : ui.sel && step ? prompt(c, step)
      : ui.menu ? h('div', { class: 'dock-body' }, h('strong', {}, 'Choose an action'),
        h('div', { class: 'opts' }, ui.menu.tpls.map((t) => h('button', { class: 'opt', onclick: () => A.start(t) }, t.label)), h('button', { class: 'ghost', onclick: A.cancel }, 'Cancel')))
        : mine ? actionsBar(A, tpls)
          : h('div', { class: 'dock-body waiting' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ui.match!.s.result ? 'Game over' : 'Opponent is playing…');
  return h('div', { class: 'dock' }, body);
}

function prompt(c: C, step: ReturnType<typeof current>) {
  const { ui, A, label } = c;
  const picks = ui.sel!.picks[step.key] ?? [];
  const pd = ui.match!.s.pending;
  const objectish = (x: string) => /^(o|k)\d+$/.test(x) || /^p\d+$/.test(x);
  const inline = step.options.filter((x) => !objectish(x) || (!ui.sel!.tpl && pd?.labels));
  const ok = picks.length >= step.min && picks.length <= step.max;
  return h('div', { class: 'dock-body' },
    h('div', { class: 'prompt-title' }, h('strong', {}, title(step.prompt)), h('span', { class: 'muted' },
      ` · choose ${step.min === step.max ? step.min : `${step.min}–${step.max}`}${inline.length < step.options.length ? ' (glowing on the table)' : ''}`)),
    inline.length > 0 && h('div', { class: 'opts' }, inline.map((x) => h('button', {
      class: cls('opt', picks.includes(x) && 'picked'), 'aria-pressed': picks.includes(x), onclick: () => A.choose(x),
    }, pd?.labels?.[x] ?? label(x)))),
    h('div', { class: 'opts end' },
      picks.length > 0 && h('span', { class: 'muted' }, picks.map((x) => pd?.labels?.[x] ?? label(x)).join(', ')),
      ui.sel!.tpl && h('button', { class: 'ghost', onclick: A.cancel }, 'Cancel'),
      h('button', { class: 'cta small', disabled: !ok, onclick: A.confirm }, 'Confirm')));
}

function actionsBar(A: any, tpls: Template[]) {
  const free = tpls.filter((t) => !t.source);
  const n = tpls.length - free.length;
  const pass = free.find((t) => t.action === 'pass');
  return h('div', { class: 'dock-body' },
    h('span', { class: 'muted hint' }, n ? `${n} playable — glowing cards. Tap a dim card to see why it can't be used.` : 'Nothing to play with cards right now.'),
    h('div', { class: 'opts end' },
      free.filter((t) => t !== pass).map((t) => h('button', { class: 'opt', onclick: () => A.start(t) }, t.label)),
      pass && h('button', { class: 'cta small pass', onclick: () => A.start(pass) }, pass.label)));
}

function drawer(c: C) {
  const { ui, A, v, mod } = c;
  let body;
  if (ui.drawer === 'pile' && ui.pile) {
    const zv = v.zones[ui.pile];
    body = [h('h3', {}, `${ui.pile.startsWith('shared') ? 'Shared' : pname(ui.pile.split(':')[0])} — ${title(ui.pile.split(':')[1])}`),
      h('div', { class: 'grid' }, (zv?.cards ?? []).map((o) => obj(c, o, 'sm')))];
  } else if (ui.drawer === 'card') {
    const o = ui.inspect ? Object.values(v.zones).flatMap((z) => z.cards ?? []).find((x) => x.id === ui.inspect) : null;
    body = o?.card
      ? [cardFace(mod, o.card, { size: 'lg', stats: o.stats, vars: o.vars, baseVars: mod.rules.objectVars, keywords: o.keywords, faceDown: o.faceDown }),
        o.rel && h('p', { class: 'muted' }, Object.entries(o.rel).map(([a, b]) => `${a} → ${c.label(b)}`).join(', '))]
      : h('p', { class: 'muted' }, 'Tap a card on the table to see it here.');
  } else body = log(c);
  return h('aside', { class: 'drawer' }, h('button', { class: 'x drawer-x', 'aria-label': 'Close panel', onclick: () => A.drawer(null) }, '×'), body);
}

function pause(c: C) {
  const { ui, A } = c;
  return h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'panel-pop' },
      h('h2', {}, 'Paused'),
      h('button', { class: 'cta', onclick: () => A.pause(false) }, 'Resume'),
      h('button', { onclick: A.save }, 'Save game'),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: ui.fast, onchange: (e: Event) => A.setFast((e.target as HTMLInputElement).checked) }), ' Fast AI'),
      segmented(ui.theme, [['dark', 'Dark'], ['light', 'Light']], A.setTheme, 'Theme'),
      h('button', { class: 'ghost', onclick: A.quit }, 'Quit to game menu')));
}

function gameOver(c: C) {
  const { ui, A, v } = c;
  const r = v.result!;
  const human = ui.seats[+ui.viewer.slice(1)] === 'human';
  const head = !r.winners.length ? 'Draw' : r.winners.includes(ui.viewer) && human ? 'Victory' : human ? 'Defeat' : `${r.winners.map(pname).join(' & ')} wins`;
  return h('div', { class: 'overlay gameover', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'panel-pop' },
      h('h1', { class: cls('result', head === 'Victory' && 'win', head === 'Defeat' && 'loss') }, head),
      h('p', { class: 'muted' }, `${r.winners.length ? `${r.winners.map(pname).join(' & ')} won` : 'No winner'} after ${v.turn} turns (${r.reason}).`),
      h('button', { class: 'cta', onclick: A.rematch }, 'Rematch'),
      h('button', { onclick: () => A.drawer('log') }, 'Review log'),
      h('button', { class: 'ghost', onclick: A.quit }, 'Game menu')));
}

function fmt(e: Record<string, any>, mod: Mod, label: (x: string) => string): string | null {
  const cn = (id?: string) => (id ? mod.card.get(id)?.name ?? id : undefined);
  switch (e.type) {
    case 'moved': return `${cn(e.card) ?? 'A card'}: ${e.from} → ${e.to}${e.toPlayer && e.toPlayer !== 'shared' ? ` (${pname(e.toPlayer)})` : ''}`;
    case 'damage': return `${e.source ? label(e.source) : 'Damage'} → ${label(e.target)}: ${e.amount}`;
    case 'changed': return /^p\d+$/.test(e.ref) ? `${pname(e.ref)} ${e.name}: ${e.from} → ${e.to}` : null;
    case 'action': return `${pname(e.player)}: ${mod.rules.actions[e.action]?.label ?? e.action}${e.card ? ` ${cn(e.card)}` : ''}`;
    case 'phase': return `— Turn ${e.turn}, ${e.phase} (${pname(e.active)})`;
    case 'pass': return `${pname(e.player)} passes`;
    case 'chose': return `${pname(e.player)} chose ${e.sel ? e.sel.map(label).join(', ') || 'nothing' : 'secretly'}`;
    case 'revealed': return `Revealed: ${Object.entries(e.picks).map(([p, x]) => `${pname(p)} ${x == null ? 'none' : ([x].flat() as string[]).map((y) => label(y)).join(', ')}`).join('; ')}`;
    case 'stacked': return `Stack: ${e.label ?? cn(e.card) ?? 'item'}`;
    case 'resolve': case 'fizzled': case 'countered': return `${title(e.type)}: ${cn(e.card) ?? 'ability'}`;
    case 'destroyed': return `${cn(e.card) ?? 'A card'} destroyed`;
    case 'lost': return `${pname(e.player)} is out`;
    case 'gameOver': return `Game over (${e.reason})`;
    case 'random': return `Random result: ${e.value === undefined ? 'hidden' : [e.value].flat().map((x: any) => label(String(x))).join(', ')}`;
    case 'flipped': return `${cn(e.card) ?? 'A card'} turned face ${e.up ? 'up' : 'down'}`;
    case 'replaced': return `${e.by}: ${e.event} ${e.how === 'instead' ? 'replaced' : 'modified'}`;
    case 'shuffled': case 'linked': case 'unlinked': case 'modified': case 'expired': case 'drawFail': case 'log': return null;
    default: {
      const { seq: _s, type, ...rest } = e;
      return `${title(type)} ${Object.entries(rest).map(([k, x]) => `${k}: ${typeof x === 'string' ? label(x) : JSON.stringify(x)}`).join(', ')}`;
    }
  }
}

function log(c: C) {
  const m = c.ui.match!;
  const ev = eventsFor(m, c.ui.viewer, Math.max(0, m.s.events.length - 150));
  const lines = ev.map((e) => fmt(e as GEvent, c.mod, c.label)).filter(Boolean).slice(-60).reverse();
  return [h('h3', {}, 'Log'), h('ol', { class: 'log', reversed: true }, lines.map((l) => h('li', {}, l!)))];
}
