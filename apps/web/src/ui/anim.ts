// Combat animations drawn on a layer above the table, timed to the battle director's beats:
// - an attacker flies at its target, hits it (impact burst, shake) and returns;
// - a played card or used ability fires a bolt at each card or player it affects;
// - a destroyed card stays where it stood until its beat, then cracks, flashes and burns away.
// The table is redrawn often, so this keeps its own state: where each board card was last drawn, and which beats already played.
type Beatish = { kind: string; at: number; ms: number; from?: string; to?: string; targets?: string[]; dying?: string[]; mine: boolean; results?: string[] };

const last = new Map<string, { rect: DOMRect; html: string }>(); // board objects as last drawn
const started = new Set<string>();
const ghosts = new Map<string, HTMLElement>(); // destroyed object id -> its stand-in
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function layer(): HTMLElement {
  let l = document.getElementById('fx-layer');
  if (!l) { l = document.createElement('div'); l.id = 'fx-layer'; l.setAttribute('aria-hidden', 'true'); document.body.append(l); }
  return l;
}
const find = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(/^p\d+$/.test(id) ? `[data-player="${id}"]` : `.table [data-obj="${id}"]`) ?? ghosts.get(id) ?? null;
const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** A fixed copy of a board element (or of a remembered one), placed exactly over its rectangle. */
function copyAt(html: string, r: DOMRect): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'fx-copy';
  wrap.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  wrap.innerHTML = html;
  const inner = wrap.firstElementChild as HTMLElement | null;
  if (inner) { inner.style.margin = '0'; inner.style.setProperty('--w', `${r.width}px`); inner.style.rotate = '0deg'; inner.classList.remove('fx-enter', 'fx-hit', 'beat-src', 'beat-dst', 'beat-target', 'legal', 'target'); }
  layer().append(wrap);
  return wrap;
}

function impact(x: number, y: number, kind: 'hit' | 'bolt' | 'boom') {
  const b = document.createElement('div');
  b.className = `fx-burst ${kind}`;
  b.style.cssText = `left:${x}px;top:${y}px`;
  layer().append(b);
  setTimeout(() => b.remove(), 900);
}
function shake(el: HTMLElement | null) {
  if (!el || reduced()) return;
  el.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,2px) rotate(-3deg)' }, { transform: 'translate(6px,-2px) rotate(2deg)' }, { transform: 'translate(-4px,1px)' }, { transform: 'translate(0,0)' }],
    { duration: 420, easing: 'ease-out' });
}

/** The attacker leaves its spot, slams into the target and comes back. */
function attack(fromId: string, toId: string, ms: number) {
  const a = find(fromId), t = find(toId);
  if (!a || !t) return;
  const ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect();
  const ca = center(ra), ct = center(rt);
  const dx = ct.x - ca.x, dy = ct.y - ca.y;
  const go = Math.min(560, ms * 0.45), back = Math.min(380, ms * 0.3);
  if (reduced()) { impact(ct.x, ct.y, 'hit'); return; }
  const fly = copyAt(a.outerHTML, ra);
  fly.classList.add('fx-attacker');
  a.style.visibility = 'hidden';
  const toward = `translate(${dx * 0.86}px, ${dy * 0.86}px) scale(1.12) rotate(${dx > 0 ? 8 : -8}deg)`;
  const anim = fly.animate([{ transform: 'translate(0,0) scale(1)', offset: 0 }, { transform: 'translate(0,0) scale(1.15)', offset: 0.18 }, { transform: toward, offset: 1 }],
    { duration: go, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
  anim.onfinish = () => {
    impact(ct.x, ct.y, 'hit');
    shake(find(toId));
    fly.animate([{ transform: toward }, { transform: 'translate(0,0) scale(1)' }], { duration: back, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
      fly.remove();
      const live = find(fromId);
      if (live) live.style.visibility = '';
    };
  };
}

/** A bolt from the card that was played or used to each thing it affected. */
function bolt(fromEl: Element | null, toIds: string[], delay: number) {
  const src = fromEl?.getBoundingClientRect();
  if (!src) return;
  const s = center(src);
  toIds.forEach((id, i) => setTimeout(() => {
    const t = find(id);
    if (!t) return;
    const c = center(t.getBoundingClientRect());
    if (reduced()) { impact(c.x, c.y, 'bolt'); return; }
    const orb = document.createElement('div');
    orb.className = 'fx-bolt';
    orb.style.cssText = `left:${s.x}px;top:${s.y}px`;
    layer().append(orb);
    orb.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.4 }, { transform: `translate(calc(-50% + ${c.x - s.x}px), calc(-50% + ${c.y - s.y}px)) scale(1.1)`, opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' }).onfinish = () => { orb.remove(); impact(c.x, c.y, 'bolt'); shake(find(id)); };
  }, delay + i * 160));
}

/** The destroyed card cracks, flashes and burns away where it stood. */
function destroy(id: string) {
  const g = ghosts.get(id);
  if (!g) return;
  const r = g.getBoundingClientRect();
  const c = center(r);
  g.classList.add('fx-dying');
  if (reduced()) { setTimeout(() => { g.remove(); ghosts.delete(id); }, 300); return; }
  impact(c.x, c.y, 'boom');
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'fx-spark';
    p.style.cssText = `left:${c.x}px;top:${c.y}px`;
    layer().append(p);
    const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.5, dist = 40 + Math.random() * 50;
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(.2)`, opacity: 0 }],
      { duration: 650 + Math.random() * 250, easing: 'ease-out', fill: 'forwards' }).onfinish = () => p.remove();
  }
  g.animate([
    { transform: 'none', filter: 'none', opacity: 1, offset: 0 },
    { transform: 'translate(-4px,0) rotate(-3deg) scale(1.04)', filter: 'brightness(2.2) sepia(1) hue-rotate(-40deg) saturate(4)', opacity: 1, offset: 0.25 },
    { transform: 'translate(4px,0) rotate(3deg) scale(1.02)', filter: 'brightness(1.6) sepia(1) hue-rotate(-40deg) saturate(5)', opacity: 1, offset: 0.45 },
    { transform: 'translateY(10px) rotate(-6deg) scale(.7)', filter: 'brightness(.3) grayscale(1) blur(2px)', opacity: 0, offset: 1 },
  ], { duration: 900, easing: 'ease-in', fill: 'forwards' }).onfinish = () => { g.remove(); ghosts.delete(id); };
}

/** Called after every table render: starts animations for beats that just began, keeps destroyed cards on screen until their beat,
 *  and remembers where every board card is for the next render. */
export function animateTable(beats: Beatish[]) {
  if (typeof document === 'undefined') return;
  const now = Date.now();
  // destroyed cards: a stand-in at their last position until their beat
  for (const b of beats) for (const id of b.dying ?? []) {
    if (ghosts.has(id) || document.querySelector(`.table [data-obj="${id}"]`)) continue;
    const seen = last.get(id);
    if (!seen || now > b.at + b.ms) continue;
    ghosts.set(id, copyAt(seen.html, seen.rect));
  }
  for (const b of beats) {
    const key = `${b.at}:${b.kind}:${b.from ?? ''}:${b.to ?? ''}`;
    if (started.has(key) || now > b.at + b.ms) continue;
    started.add(key);
    const wait = Math.max(0, b.at - now);
    setTimeout(() => {
      if (b.kind === 'attack' && b.from && b.to) attack(b.from, b.to, b.ms);
      if (b.kind === 'play' && b.targets?.length) bolt((b.from && find(b.from)) || document.querySelector('.beat-spot .card'), b.targets, 250);
      const dieAt = b.kind === 'clash' ? 350 : b.kind === 'play' ? 700 : 150;
      for (const id of b.dying ?? []) setTimeout(() => destroy(id), dieAt);
    }, wait);
  }
  if (started.size > 400) started.clear();
  // remember where board cards are (the next render may remove some of them)
  last.clear();
  for (const el of document.querySelectorAll<HTMLElement>('.table [data-obj]')) {
    if (el.closest('.hand, .beat, .drawer, #fx-layer')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0) last.set(el.dataset.obj!, { rect: r, html: el.outerHTML });
  }
}
/** Clears stand-ins (leaving a game). */
export function resetAnims() { for (const g of ghosts.values()) g.remove(); ghosts.clear(); started.clear(); last.clear(); }
