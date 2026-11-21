// Shared UI building blocks: element helper, card faces, module theming.
import type { CardDef, Mod, Reason } from '#engine';
import { ASSETS } from '../modules.ts';
import { customArt, procArt } from '../art.ts';

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
  const hidden = new Set([...(m.manifest.theme?.hideStats ?? []), ...(m.rules.grid ? ['x', 'y'] : [])]);
  const stats = cardStats(def, o.stats).filter(([k]) => !hidden.has(k));
  const kw = o.keywords ?? def.keywords ?? [];
  const badges = Object.entries(o.vars ?? {}).filter(([k, n]) => n !== (o.baseVars?.[k] ?? 0) && !(m.rules.grid && (k === 'x' || k === 'y')));
  const art = customArt(m.manifest.moduleId, def.id) ?? (typeof def.art === 'string' ? ASSETS.get(m.manifest.moduleId)?.get(def.art) : undefined) ?? procArt(def, GLYPH[def.type] ?? '◆');
  const hh = hue(def.id);
  return h('button', {
    class: cls('card', `size-${o.size ?? 'md'}`, `t-${def.type}`, o.faceDown && 'fd', o.state),
    style: `--h:${hh}`, onclick: o.onclick, title: def.text ?? def.name,
    'aria-label': o.label ?? `${def.name}, ${def.type}${stats.length ? `, ${stats.map(([a, b]) => `${a} ${b}`).join(', ')}` : ''}`,
  },
  def.cost !== undefined && h('span', { class: 'gem' }, String(o.stats?.cost ?? def.cost)),
  o.count !== undefined && h('span', { class: 'count' }, `×${o.count}`),
  h('span', { class: 'art' }, h('img', { src: art, alt: '', draggable: 'false' })),
  h('span', { class: 'name' }, def.name),
  h('span', { class: 'type' }, title(def.type), kw.length ? ` · ${kw.map(title).join(', ')}` : '', o.faceDown ? ' · face down' : ''),
  def.text && h('span', { class: 'text' }, def.text),
  stats.length > 0 && h('span', { class: 'stats' }, stats.map(([k, v]) => h('span', { class: cls('stat', `s-${k}`), title: k }, ICON[k] ? `${ICON[k]} ${v}` : `${k} ${v}`))),
  badges.length > 0 && h('span', { class: 'badges' }, badges.map(([k, v]) => h('span', { class: 'chip' }, `${k} ${v}`))));
}

export function cardBack(m: Mod, o: FaceOpts = {}): HTMLElement {
  return h('button', { class: cls('card back', `size-${o.size ?? 'md'}`, o.state), onclick: o.onclick, 'aria-label': o.label ?? 'Face-down card' },
    h('span', { class: 'emblem' }, emblem(m)));
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
