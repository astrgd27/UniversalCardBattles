// DOM rendering from a player's View only (never from raw state), so the UI cannot leak hidden information.
import type { GEvent, Mod, ObjView, Reason, Template, View } from '#engine';
import { eventsFor, listActions, observe } from '#engine';
import { MODULES } from './modules.ts';
import { actor, current, type UI } from './main.ts';

type Child = Node | string | null | undefined | false | Child[];
function h(tag: string, props: Record<string, any> = {}, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c); };
  kids.forEach(add);
  return el;
}
const pname = (p: string) => `Player ${+p.slice(1) + 1}`;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function render(ui: UI, A: any) {
  document.documentElement.dataset.theme = ui.theme;
  const root = document.getElementById('app')!;
  root.replaceChildren(...([topbar(ui, A), ui.match ? game(ui, A) : intro(ui.mod), ui.cover ? cover(ui, A) : null].filter(Boolean) as Node[]));
}

function select(value: string, options: [string, string][], onchange: (v: string) => void, label: string) {
  return h('select', { 'aria-label': label, onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value) },
    options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
}

function topbar(ui: UI, A: any) {
  const R = ui.mod.rules;
  const counts = Array.from({ length: R.players.max - R.players.min + 1 }, (_, i) => R.players.min + i).filter((n) => n >= 2);
  const decks = Object.keys(ui.mod.decks ?? {});
  return h('header', { class: 'bar' },
    h('strong', { class: 'brand' }, 'Universal Card Battles'),
    select(ui.mod.manifest.moduleId, [...MODULES.values()].map((m) => [m.manifest.moduleId, m.manifest.displayName]), A.setModule, 'Game'),
    counts.length > 1 && select(String(ui.seats.length), counts.map((n) => [String(n), `${n} players`]), (v) => A.setPlayers(+v), 'Players'),
    ui.seats.map((s, i) => h('span', { class: 'seat' }, `P${i + 1}`,
      select(s, [['human', 'Human'], ['ai', 'AI']], (v) => A.setSeat(i, v), `Player ${i + 1} seat`),
      decks.length > 1 && select(ui.decks[i], decks.map((d) => [d, d]), (v) => A.setDeck(i, v), `Player ${i + 1} deck`))),
    h('button', { class: 'primary', onclick: A.newGame }, 'New game'),
    h('button', { onclick: A.save, disabled: !ui.match }, 'Save'),
    h('button', { onclick: A.load }, 'Load'),
    h('label', { class: 'file' }, 'Open .zip',
      h('input', { type: 'file', accept: '.zip', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) A.loadZip(f); } })),
    h('label', {}, h('input', { type: 'checkbox', checked: ui.fast, onchange: (e: Event) => A.setFast((e.target as HTMLInputElement).checked) }), ' Fast AI'),
    select(ui.theme, [['auto', 'Auto theme'], ['light', 'Light'], ['dark', 'Dark']], A.setTheme, 'Theme'));
}

function intro(m: Mod) {
  return h('main', { class: 'intro' },
    h('h1', {}, m.manifest.displayName),
    h('p', {}, `${m.cards.length} cards · ${Object.keys(m.decks ?? {}).length} decks · ${m.rules.players.min}-${m.rules.players.max} players · ${m.rules.timing?.mode ?? 'immediate'} timing`),
    h('p', { class: 'muted' }, m.manifest.licensing ?? ''),
    h('p', {}, 'Choose seats and decks above, then press New game.'));
}

function cover(ui: UI, A: any) {
  return h('div', { class: 'cover', role: 'dialog', 'aria-modal': 'true' },
    h('div', {}, h('h2', {}, `Pass the device to ${pname(ui.cover!)}`), h('button', { class: 'primary', onclick: A.reveal, autofocus: true }, `I am ${pname(ui.cover!)}`)));
}

function game(ui: UI, A: any) {
  const m = ui.match!;
  const v = observe(m, ui.viewer);
  const mine = actor(m) === ui.viewer && !ui.cover && !m.s.result;
  const tpls: Template[] = mine && !m.s.pending ? listActions(m, ui.viewer) : [];
  const sources = new Set(tpls.map((t) => t.source).filter(Boolean) as string[]);
  const step = ui.sel ? current(ui.sel) : null;
  const targets = new Set(step?.options ?? []);
  const picked = new Set(step ? ui.sel!.picks[step.key] ?? [] : []);
  const names = new Map<string, string>();
  for (const z of Object.values(v.zones)) for (const c of z.cards ?? []) names.set(c.id, c.card ? ui.mod.card.get(c.card)?.name ?? c.card : 'face-down card');
  for (const it of v.stack) names.set(it.id, it.label);
  const label = (x: string) => (x.startsWith('p') && /^p\d+$/.test(x) ? pname(x) : names.get(x) ?? x);
  const clickable = (id: string) => (targets.has(id) || sources.has(id) || !ui.sel);
  const ctx = { ui, A, v, sources, targets, picked, clickable };

  const order = [...v.players.map((p) => p.id).filter((p) => p !== ui.viewer), ui.viewer];
  const shared = ui.mod.rules.zones.filter((z) => z.shared);
  return h('main', { class: 'game' },
    h('section', { class: 'table' },
      order.slice(0, -1).map((p) => playerPanel(ctx, p)),
      shared.length > 0 && h('section', { class: 'panel shared' }, h('h3', {}, 'Shared'), shared.map((z) => zone(ctx, `shared:${z.id}`, z.id))),
      v.stack.length > 0 && h('section', { class: 'panel stack' }, h('h3', {}, 'Stack (top first)'),
        [...v.stack].reverse().map((it) => h('button', {
          class: cls('item', targets.has(it.id) && 'target', picked.has(it.id) && 'picked'), onclick: () => A.pick(it.id),
        }, `${it.label} — ${pname(it.ctrl)}`))),
      playerPanel(ctx, order[order.length - 1])),
    h('aside', { class: 'side' },
      status(ui, v, mine),
      ui.note && note(ui, A),
      ui.sel ? prompt(ui, A, step!, label) : ui.menu ? menu(ui, A) : mine && actionBar(A, tpls),
      inspector(ui, v),
      log(ui, label)));
}

const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

function playerPanel(c: any, p: string) {
  const { ui, A, v, targets, picked } = c;
  const pl = v.players.find((x: View['players'][0]) => x.id === p);
  const zones = ui.mod.rules.zones.filter((z: any) => !z.shared);
  return h('section', { class: cls('panel', p === ui.viewer && 'me', pl.lost && 'lost') },
    h('button', {
      class: cls('who', targets.has(p) && 'target', picked.has(p) && 'picked'), onclick: () => (c.ui.sel ? A.pick(p) : A.view(p)),
      'aria-label': `${pname(p)}${targets.has(p) ? ' (choose)' : ''}`,
    },
    h('span', { class: 'name' }, `${pname(p)}${p === ui.viewer ? ' (you)' : ''}`, v.active === p ? ' ★' : '', pl.lost ? ' — out' : ''),
    h('span', { class: 'vars' }, Object.entries(pl.vars).map(([k, n]) => h('span', { class: 'chip' }, `${k} ${n}`)))),
    zones.map((z: any) => zone(c, `${p}:${z.id}`, z.id)));
}

function zone(c: any, key: string, id: string) {
  const z = c.v.zones[key];
  if (!z) return null;
  if (!z.cards) return h('div', { class: 'zone' }, h('span', { class: 'zlabel' }, title(id)), h('span', { class: 'pile', 'aria-label': `${id}: ${z.count} hidden cards` }, `🂠 ${z.count}`));
  return h('div', { class: 'zone' }, h('span', { class: 'zlabel' }, `${title(id)} ${z.count}`),
    h('div', { class: 'cards' }, z.cards.length ? z.cards.map((o: ObjView) => card(c, o)) : h('span', { class: 'muted' }, '—')));
}

function statsOf(mod: Mod, o: ObjView): [string, unknown][] {
  const def = mod.card.get(o.card) as any;
  const out = new Map<string, unknown>();
  for (const [k, val] of Object.entries(def ?? {})) if (typeof val === 'number' && k !== 'cost' && k !== 'maxCopies') out.set(k, val);
  for (const [k, val] of Object.entries(o.stats ?? {})) if (k !== 'cost' && (def?.[k] !== undefined || val !== 0)) out.set(k, val);
  return [...out];
}

function card(c: any, o: ObjView) {
  const { ui, A, sources, targets, picked } = c;
  const def = o.card ? ui.mod.card.get(o.card) : null;
  const ov = ui.mod.rules.objectVars ?? {};
  const badges = Object.entries(o.vars).filter(([k, n]) => n !== (ov[k] ?? 0));
  const k = cls('card', sources.has(o.id) && 'legal', targets.has(o.id) && 'target', picked.has(o.id) && 'picked', !def && 'back', ui.inspect === o.id && 'inspected');
  if (!def) return h('button', { class: k, onclick: () => A.pick(o.id), 'aria-label': 'Face-down card' }, h('span', { class: 'cname' }, 'Face down'));
  const stats = statsOf(ui.mod, o);
  return h('button', {
    class: k, onclick: () => A.pick(o.id), title: def.text ?? '',
    'aria-label': `${def.name}, ${def.type}${stats.length ? ', ' + stats.map(([a, b]) => `${a} ${b}`).join(', ') : ''}${sources.has(o.id) ? ', playable' : ''}${targets.has(o.id) ? ', can be chosen' : ''}`,
  },
  def.cost !== undefined && h('span', { class: 'cost' }, String(o.stats?.cost ?? def.cost)),
  h('span', { class: 'cname' }, def.name),
  h('span', { class: 'ctype' }, def.type, o.faceDown ? ' · face down' : ''),
  stats.length > 0 && h('span', { class: 'cstats' }, stats.map(([a, b]) => `${a} ${b}`).join(' · ')),
  (o.keywords ?? def.keywords ?? []).length > 0 && h('span', { class: 'kw' }, (o.keywords ?? def.keywords).join(', ')),
  badges.length > 0 && h('span', { class: 'badges' }, badges.map(([a, b]) => h('span', { class: 'chip' }, `${a} ${b}`))));
}

function status(ui: UI, v: View, mine: boolean) {
  const r = v.result;
  const who = ui.match!.s.pending?.player ?? v.priority;
  return h('div', { class: 'status', role: 'status' },
    h('div', {}, `Turn ${v.turn} · ${v.phase} · ${pname(v.active)}'s turn`),
    r ? h('strong', {}, r.winners.length ? `Game over: ${r.winners.map(pname).join(', ')} wins` : `Game over: draw (${r.reason})`)
      : h('strong', {}, mine ? (v.pending ? 'Your decision' : 'Your move') : `Waiting for ${who ? pname(who) : '…'}`));
}

function reasonTree(r: Reason): HTMLElement {
  return h('li', { class: r.ok ? 'ok' : 'bad' }, `${r.ok ? '✓' : '✗'} ${r.msg}`, r.children?.length ? h('ul', {}, r.children.map(reasonTree)) : null);
}

function note(ui: UI, A: any) {
  const n = ui.note!;
  return h('div', { class: 'note', role: 'alert' },
    h('div', { class: 'row' }, h('strong', {}, n.title), h('button', { onclick: A.closeNote, 'aria-label': 'Close' }, '×')),
    n.reason && h('ul', { class: 'reasons' }, reasonTree(n.reason)),
    n.text && h('pre', {}, n.text));
}

function prompt(ui: UI, A: any, step: ReturnType<typeof current>, label: (x: string) => string) {
  const picks = ui.sel!.picks[step.key] ?? [];
  const pd = ui.match!.s.pending;
  const objectish = (x: string) => /^(o|k)\d+$/.test(x) || /^p\d+$/.test(x);
  const inline = step.options.filter((x) => !objectish(x) || (!ui.sel!.tpl && pd?.labels));
  const ok = picks.length >= step.min && picks.length <= step.max;
  return h('div', { class: 'prompt' },
    h('strong', {}, title(step.prompt)),
    h('div', { class: 'muted' }, step.min === step.max ? `Choose ${step.min}.` : `Choose ${step.min}–${step.max}.`, inline.length < step.options.length ? ' Highlighted items can be chosen.' : ''),
    inline.length > 0 && h('div', { class: 'opts' }, inline.map((x) => h('button', {
      class: cls('opt', picks.includes(x) && 'picked'), onclick: () => A.choose(x), 'aria-pressed': picks.includes(x),
    }, pd?.labels?.[x] ?? label(x)))),
    picks.length > 0 && h('div', { class: 'muted' }, `Selected: ${picks.map((x) => pd?.labels?.[x] ?? label(x)).join(', ')}`),
    h('div', { class: 'row' }, h('button', { class: 'primary', disabled: !ok, onclick: A.confirm }, 'Confirm'), ui.sel!.tpl && h('button', { onclick: A.cancel }, 'Cancel')));
}

function menu(ui: UI, A: any) {
  return h('div', { class: 'prompt' }, h('strong', {}, 'Choose an action'),
    h('div', { class: 'opts' }, ui.menu!.tpls.map((t) => h('button', { class: 'opt', onclick: () => A.start(t) }, t.label))),
    h('button', { onclick: A.cancel }, 'Cancel'));
}

function actionBar(A: any, tpls: Template[]) {
  const free = tpls.filter((t) => !t.source);
  const n = tpls.length - free.length;
  return h('div', { class: 'prompt' },
    n > 0 && h('div', { class: 'muted' }, `${n} playable card action${n > 1 ? 's' : ''}: outlined cards (▶). Tap a greyed card to see why it can't be used.`),
    h('div', { class: 'opts' }, free.map((t) => h('button', { class: t.action === 'pass' ? 'opt pass' : 'opt', onclick: () => A.start(t) }, t.label))));
}

function inspector(ui: UI, v: View) {
  const o = ui.inspect ? Object.values(v.zones).flatMap((z) => z.cards ?? []).find((c) => c.id === ui.inspect) : null;
  if (!o || !o.card) return null;
  const def = ui.mod.card.get(o.card)!;
  return h('div', { class: 'inspect' },
    h('strong', {}, def.name), h('div', { class: 'muted' }, `${def.type}${def.cost !== undefined ? ` · cost ${def.cost}` : ''}`),
    def.text && h('p', {}, def.text),
    h('div', { class: 'badges' }, [...statsOf(ui.mod, o), ...Object.entries(o.vars).filter(([k, n]) => n !== (ui.mod.rules.objectVars?.[k] ?? 0))].map(([a, b]) => h('span', { class: 'chip' }, `${a} ${b}`))),
    o.rel && h('div', { class: 'muted' }, Object.entries(o.rel).map(([a, b]) => `${a} → ${b}`).join(', ')));
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
      const { seq, type, ...rest } = e;
      return `${title(type)} ${Object.entries(rest).map(([k, x]) => `${k}: ${typeof x === 'string' ? label(x) : JSON.stringify(x)}`).join(', ')}`;
    }
  }
}

function log(ui: UI, label: (x: string) => string) {
  const ev = eventsFor(ui.match!, ui.viewer, Math.max(0, ui.match!.s.events.length - 120));
  const lines = ev.map((e) => fmt(e as GEvent, ui.mod, label)).filter(Boolean).slice(-40).reverse();
  return h('div', { class: 'log' }, h('strong', {}, 'Log'), h('ol', { reversed: true }, lines.map((l) => h('li', {}, l!))));
}
