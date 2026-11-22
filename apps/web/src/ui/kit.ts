// Shared UI building blocks: element helper, card faces, module theming.
import type { CardDef, Mod, Reason } from '#engine';
import { assetUrl } from '../modules.ts';
import { customArt, procArt } from '../art.ts';
import { type StatSlot, templateFor } from '../templates.ts';
import { costText, costTotal } from '../search.ts';

export type Child = Node | string | null | undefined | false | Child[];
export function h(tag: string, props: Record<string, any> = {}, ...kids: Child[]): HTMLElement {
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
export const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const pname = (p: string) => `Player ${+p.slice(1) + 1}`;
export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
export function hue(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x % 360;
}
export function themeStyle(m: Mod): string {
  const t = m.manifest.theme ?? {};
  const h0 = hue(m.manifest.moduleId);
  return `--accent:${t.accent ?? `hsl(${h0} 75% 55%)`};--accent2:${t.accent2 ?? `hsl(${(h0 + 50) % 360} 80% 60%)`}`;
}
export const emblem = (m: Mod) => m.manifest.theme?.glyph ?? m.manifest.displayName.charAt(0);
export function select(value: string, options: [string, string][], onchange: (v: string) => void, label: string, klass = '') {
  return h('select', { class: klass, 'aria-label': label, onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value) },
    options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
}
export function segmented<T extends string>(value: T, options: [T, string][], onpick: (v: T) => void, label: string) {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    options.map(([v, t]) => h('button', { role: 'radio', 'aria-checked': v === value, class: cls(v === value && 'on'), onclick: () => onpick(v) }, t)));
}

const GLYPH: Record<string, string> = {
  unit: '⚔', monster: '⚔', ally: '☺', spell: '✦', trap: '⚠', aura: '◈', fusion: '✶', evolved: '⇑', tide: '≈', treasure: '◎',
  relic: '♜', die: '⚄',
};
const ICON: Record<string, string> = { power: '⚔', atk: '⚔', health: '♥', def: '⛨', gold: '◎', influence: '✧', pitch: '◆' };

/** Stats to print on a card: numeric definition fields (overridden by computed stats), without bookkeeping fields. */
export function cardStats(def: CardDef, stats?: Record<string, any>): [string, unknown][] {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(def)) if (typeof v === 'number' && k !== 'cost' && k !== 'maxCopies') out.set(k, v);
  for (const [k, v] of Object.entries(stats ?? {})) if (k !== 'cost' && ((def as any)[k] !== undefined || v !== 0)) out.set(k, v);
  return [...out];
}

export interface FaceOpts {
  obj?: string; // game object id (long-press opens its live details)
  note?: string; // extra state on the type line (copy of…, no abilities, grid layer)
  stats?: Record<string, any>;
  vars?: Record<string, number>;
  baseVars?: Record<string, number>;
  keywords?: string[];
  faceDown?: boolean; // own face-down card: shown, but marked
  state?: string; // extra classes: legal, target, picked, inspected
  size?: 'sm' | 'md' | 'lg';
  count?: number;
  onclick?: () => void;
  label?: string;
}

export function cardFace(m: Mod, cardId: string, o: FaceOpts = {}): HTMLElement {
  const def = m.card.get(cardId);
  if (!def) return cardBack(m, o);
  const tpl = templateFor(m, def);
  const hidden = new Set([...(m.manifest.theme?.hideStats ?? []), ...(m.rules.grid ? ['x', 'y'] : [])]);
  const val = (f: string) => o.stats?.[f] ?? (def as any)[f];
  const placed = tpl.stats.filter((s) => typeof val(s.field) === 'number' && !hidden.has(s.field));
  const onFrame = new Set([...placed.map((s) => s.field), ...(tpl.level ? [tpl.level] : [])]);
  const chips = cardStats(def, o.stats).filter(([k]) => !hidden.has(k) && !onFrame.has(k));
  const kw = (o.keywords ?? def.keywords ?? []).filter((k) => k !== def.type); // a keyword that repeats the type adds nothing on the type line
  const th = m.manifest.theme;
  const hideV = new Set(th?.hideVars ?? []);
  const badges = Object.entries(o.vars ?? {}).filter(([k, n]) => n !== (o.baseVars?.[k] ?? 0) && !hideV.has(k) && !(m.rules.grid && (k === 'x' || k === 'y' || k === 'z')));
  const tapped = !!th?.tapVar && (o.vars?.[th.tapVar] ?? 0) > 0;
  const mid = m.manifest.moduleId;
  const full = assetUrl(mid, undefined, `assets/full/${def.id}`);
  const art = customArt(mid, def.id) ?? assetUrl(mid, typeof def.art === 'string' ? def.art : undefined, `assets/cards/${def.id}`) ?? procArt(def, GLYPH[def.type] ?? '◆');
  const corners = new Map<string, StatSlot[]>();
  for (const s of placed) if (s.pos !== 'line') corners.set(s.pos, [...(corners.get(s.pos) ?? []), s]);
  const line = placed.filter((s) => s.pos === 'line');
  const level = tpl.level && typeof def[tpl.level] === 'number' ? (def[tpl.level] as number) : 0;
  const statText = (s: StatSlot) => (s.icon ? `${s.icon} ${val(s.field)}` : String(val(s.field)));
  const aria = [...placed.map((s) => `${s.label ?? s.field} ${val(s.field)}`), ...chips.map(([a, b]) => `${a} ${b}`)].join(', ');
  const label = o.label ?? `${def.name}, ${def.type}${def.cost !== undefined ? `, cost ${costText(def.cost)}` : ''}${aria ? `, ${aria}` : ''}`;
  // A finished full-card image replaces the template; live state (wounds, notes) still shows on top.
  if (full && !customArt(mid, def.id)) {
    return h('button', {
      class: cls('card', 'full-art', `layout-${tpl.layout}`, `size-${o.size ?? 'md'}`, `t-${def.type}`, o.faceDown && 'fd', tapped && 'tapped', o.state),
      onclick: o.onclick, title: def.text ?? def.name, 'aria-label': label, 'data-card': def.id, 'data-obj': o.obj,
    },
    h('img', { class: 'full-img', src: full, alt: '', draggable: 'false' }),
    o.count !== undefined && h('span', { class: 'count' }, `×${o.count}`),
    (badges.length > 0 || o.note) && h('span', { class: 'badges overlay' },
      o.note && h('span', { class: 'chip' }, o.note),
      badges.map(([k, v]) => h('span', { class: 'chip' }, `${th?.labels?.[k] ?? k} ${v}`))));
  }
  return h('button', {
    class: cls('card', `tpl-${tpl.base}`, `layout-${tpl.layout}`, `size-${o.size ?? 'md'}`, `t-${def.type}`, o.faceDown && 'fd', tapped && 'tapped',
      (corners.has('bl') || corners.has('br')) && 'low-stats', o.state),
    style: `--h:${hue(def.id)}`, onclick: o.onclick, title: def.text ?? def.name, 'data-template': tpl.base, 'data-card': def.id, 'data-obj': o.obj,
    'aria-label': label,
  },
  tpl.cost !== 'none' && def.cost !== undefined && (typeof def.cost === 'object'
    ? h('span', { class: `gem typed pos-${tpl.cost}`, title: `Cost: ${costText(def.cost)}` }, String(costTotal(def.cost)),
      h('span', { class: 'pips' }, Object.entries(def.cost as Record<string, number>).filter(([k]) => k !== 'any').flatMap(([k, n]) =>
        Array.from({ length: n }, () => h('i', { class: 'pip', style: `--h:${hue(k)}` }, k[0].toUpperCase())))))
    : h('span', { class: `gem pos-${tpl.cost}` }, String(o.stats?.cost ?? def.cost))),
  o.count !== undefined && h('span', { class: 'count' }, `×${o.count}`),
  h('span', { class: 'art', style: tpl.art ? `flex-basis:${tpl.art}%` : null },
    h('img', { src: art, alt: '', draggable: 'false', style: typeof def.artPos === 'string' ? `object-position:${def.artPos}` : null })),
  h('span', { class: 'body' },
    h('span', { class: 'name' }, def.name),
    level > 0 && h('span', { class: 'stars', 'aria-label': `level ${level}` }, '★'.repeat(Math.min(12, level))),
    h('span', { class: 'type' }, title(def.type), kw.length ? ` · ${kw.map(title).join(', ')}` : '', o.faceDown ? ' · face down' : '', o.note ? ` · ${o.note}` : ''),
    tpl.text && def.text && h('span', { class: 'text' }, def.text),
    chips.length > 0 && h('span', { class: 'stats' }, chips.map(([k, v]) => h('span', { class: cls('stat', `s-${k}`), title: k }, ICON[k] ? `${ICON[k]} ${v}` : `${k} ${v}`))),
    line.length > 0 && h('span', { class: 'statline' }, line.map((s) => `${s.label ?? s.field} ${val(s.field)}`).join(' / ')),
    badges.length > 0 && h('span', { class: 'badges' }, badges.map(([k, v]) => h('span', { class: 'chip' }, `${th?.labels?.[k] ?? k} ${v}`)))),
  [...corners].map(([pos, slots]) => h('span', { class: `statbox pos-${pos}` }, slots.map(statText).join(tpl.base === 'classic' ? '/' : ' '))));
}

export function cardBack(m: Mod, o: FaceOpts = {}): HTMLElement {
  const back = assetUrl(m.manifest.moduleId, undefined, 'assets/back');
  return h('button', { class: cls('card back', back && 'art-back', `size-${o.size ?? 'md'}`, o.state), onclick: o.onclick, 'aria-label': o.label ?? 'Face-down card' },
    back ? h('img', { class: 'back-img', src: back, alt: '', draggable: 'false' }) : h('span', { class: 'emblem' }, emblem(m)));
}

function reasonTree(r: Reason): HTMLElement {
  return h('li', { class: r.ok ? 'ok' : 'bad' }, `${r.ok ? '✓' : '✗'} ${r.msg}`, r.children?.length ? h('ul', {}, r.children.map(reasonTree)) : null);
}
export function noteEl(n: { title: string; reason?: Reason; text?: string }, onclose: () => void) {
  return h('div', { class: 'note', role: 'alert' },
    h('div', { class: 'note-head' }, h('strong', {}, n.title), h('button', { class: 'x', onclick: onclose, 'aria-label': 'Close' }, '×')),
    n.reason && h('ul', { class: 'reasons' }, reasonTree(n.reason)),
    n.text && h('pre', {}, n.text));
}
export function topnav(back: [string, () => void], heading: string, ...right: Child[]) {
  return h('header', { class: 'topnav' }, h('button', { class: 'back', onclick: back[1] }, `← ${back[0]}`), h('h2', {}, heading), h('div', { class: 'topnav-right' }, right));
}
