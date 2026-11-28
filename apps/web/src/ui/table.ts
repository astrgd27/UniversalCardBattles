// The game table. Renders strictly from observe()/eventsFor()/listActions() for the viewing player.
import type { GEvent, Mod, ObjView, Template, View, ZoneDef } from '#engine';
import { eventsFor, listActions, observe } from '#engine';
import { actor, current, pendingDialogue, playable, tutCoach, tutorial, type UI } from '../main.ts';
import { cardBack, cardFace, cls, emblem, h, noteEl, pname, segmented, select, themeStyle, title } from './kit.ts';
import { type Beat, beatIcon, beatsOf, drawArrows } from './director.ts';
import { animateTable } from './anim.ts';

interface Fx {
  entered: Set<string>; // objects that just arrived in a visible zone
  hit: Map<string, number>; // object or player id -> damage just taken
  flipped: Set<string>;
  tapped: Map<string, boolean>; // object -> just tapped (true) or untapped (false), from the theme's tapVar
  pulse: Map<string, Set<string>>; // player -> vars that just changed
  bump: Set<string>; // zone keys whose size just grew
  glow: Set<string>; // objects whose counters or stats just changed
  float: Map<string, { text: string; kind: 'buff' | 'heal' | 'debuff' }[]>; // object -> floating labels (+2 Power, healed 3)
  chip: Map<string, number>; // 'p0:life' -> change just made (floats beside the chip)
  banners: string[]; // announcements in order: module events (theme.announce), then a new turn
}
interface C {
  ui: UI; A: any; v: View; mod: Mod;
  sources: Set<string>; targets: Set<string>; picked: Set<string>;
  label: (x: string) => string;
  fx: Fx;
  beatTargets: Set<string>; // what the beat playing now points at
}

const BANNER_MS = 1400, BANNER_GAP = 1250;
/** Names players from the viewer's seat: "You" and, in a two-player game against the AI, "Opponent". */
export function whoOf(ui: UI) {
  const humans = ui.seats.filter((s) => s === 'human').length;
  return (p: string) => (p === ui.viewer && humans < 2 ? 'You' : ui.seats.length === 2 && humans < 2 ? 'Opponent' : pname(p));
}
/** The beat playing right now, if any. */
export function currentBeat(ui: UI): (Beat & { at: number }) | null {
  const now = Date.now();
  return (ui.beats ?? []).find((b) => now >= b.at && now < b.at + b.ms) ?? null;
}
function beatView(c: C, b: Beat & { at: number }) {
  const face = (card?: string, extra?: string) => card && c.mod.card.has(card) ? cardFace(c.mod, card, { size: 'md', state: extra }) : null;
  const side = (s?: { card: string; dealt: number; took: number; dead: boolean }) => s && h('div', { class: cls('clash-side', s.dead && 'dead') },
    face(s.card), h('div', { class: 'clash-nums' }, s.took ? h('span', { class: 'took' }, `-${s.took}`) : null, s.dead ? h('span', { class: 'stamp' }, 'DESTROYED') : null));
  return h('div', { class: cls('beat', `beat-${b.kind}`, b.mine ? 'mine' : 'theirs'), role: 'status', 'aria-live': 'polite', style: `--ms:${b.ms}ms;animation-delay:${(b.at - Date.now()) / 1000}s` },
    h('div', { class: 'beat-cap' }, h('span', { class: 'beat-icon' }, beatIcon(b.kind)), b.text),
    (b.kind === 'play' || b.kind === 'stack' || b.kind === 'destroy') && b.card && h('div', { class: cls('beat-spot', b.kind === 'play' && b.mine && 'small') }, face(b.card, b.kind === 'destroy' ? 'gone' : '')),
    b.results?.length ? h('ul', { class: 'beat-results' }, b.results.map((r) => h('li', {}, r))) : null,
    b.kind === 'clash' && b.clash && h('div', { class: 'beat-clash' }, side(b.clash.a), h('span', { class: 'vs' }, 'VS'),
      b.clash.b ? side(b.clash.b) : h('div', { class: 'clash-side player' }, h('div', { class: 'clash-avatar' }, '♥'), h('span', { class: 'took' }, `-${b.clash.playerTook ?? 0}`))));
}
/** Animations come only from the viewer's redacted event log since the previous render. */
function effectsSince(ui: UI, v: View): Fx {
  const m = ui.match!;
  const fx: Fx = { entered: new Set(), hit: new Map(), flipped: new Set(), tapped: new Map(), pulse: new Map(), bump: new Set(), glow: new Set(), banners: [], float: new Map(), chip: new Map() };
  const labels = (m.m.manifest.theme?.labels ?? {}) as Record<string, string>;
  const addFloat = (id: string, text: string, kind: 'buff' | 'heal' | 'debuff') => { if (!fx.float.has(id)) fx.float.set(id, []); fx.float.get(id)!.push({ text, kind }); };

  const tapVar = m.m.manifest.theme?.tapVar;
  const announce = m.m.manifest.theme?.announce ?? {};
  const from = Math.min(ui.fxFrom, m.s.events.length);
  const first = m.m.rules.phases[0].id;
  const who = whoOf(ui);
  const evs = eventsFor(m, ui.viewer, from);
  for (const e of evs) {
    if ((e.type === 'moved' || e.type === 'created') && e.newObj) fx.entered.add(e.newObj);
    else if (e.type === 'damage' && e.target) fx.hit.set(e.target, (fx.hit.get(e.target) ?? 0) + e.amount);
    else if (e.type === 'flipped') fx.flipped.add(e.obj);
    else if (e.type === 'changed' && tapVar && e.name === tapVar && e.ref && !/^p\d+$/.test(e.ref)) fx.tapped.set(e.ref, (e.to ?? 0) > 0);
    else if (e.type === 'changed' && e.ref && !/^p\d+$/.test(e.ref) && e.name !== 'newT') { fx.glow.add(e.ref); if (e.name === 'dmg' && typeof e.from === 'number' && typeof e.to === 'number' && e.to < e.from) addFloat(e.ref, `+${e.from - e.to} healed`, 'heal'); }
    else if (e.type === 'modified' && e.targets) for (const t of e.targets) { fx.glow.add(t); for (const md of (e as any).mods ?? []) addFloat(t, `${md.value >= 0 ? '+' : ''}${md.value} ${labels[md.stat] ?? md.stat}`, md.value >= 0 ? 'buff' : 'debuff'); }
    else if (e.type === 'changed' && /^p\d+$/.test(e.ref)) { if (!fx.pulse.has(e.ref)) fx.pulse.set(e.ref, new Set()); fx.pulse.get(e.ref)!.add(e.name); if (typeof e.to === 'number' && typeof e.from === 'number') fx.chip.set(`${e.ref}:${e.name}`, (fx.chip.get(`${e.ref}:${e.name}`) ?? 0) + e.to - e.from); }
    else if (announce[e.type] && from > 0) fx.banners.push(announce[e.type].replace(/\{(\w+)\}/g, (_: string, k: string) => (typeof e[k] === 'string' ? (/^p\d+$/.test(e[k]) ? who(e[k]) : m.m.card.get(e[k])?.name ?? e[k]) : String(e[k] ?? ''))));
    else if (e.type === 'phase' && e.phase === first && from > 0) fx.banners.push(who(e.active) === 'You' ? 'Your turn' : `${who(e.active)}'s turn`);
  }
  const counts: Record<string, number> = {};
  for (const [k, z] of Object.entries(v.zones)) {
    counts[k] = z.count;
    if (ui.counts[k] !== undefined && z.count > ui.counts[k]) fx.bump.add(k);
  }
  ui.counts = counts;
  ui.fxFrom = m.s.events.length;
  // announcements play one after another and survive redraws: each keeps its start time
  const now = Date.now();
  const q = (ui.banners ?? []).filter((b) => now < b.at + BANNER_MS);
  for (const text of fx.banners) q.push({ text, at: Math.max(now, (q[q.length - 1]?.at ?? 0) + BANNER_GAP) });
  ui.banners = q.slice(-4);
  // the director: opponent moves (and battles) as beats, played one after another
  if (from > 0) {
    const cardOf = new Map<string, string>();
    for (const z of Object.values(v.zones)) for (const o of z.cards ?? []) if (o.card) cardOf.set(o.id, o.card);
    const speed = ui.fast ? 0.4 : 1.3; // the default pace is unhurried so every move can be followed
    const beats = (ui.beats ?? []).filter((b) => now < b.at + b.ms);
    let t = Math.max(now, ...beats.map((b) => b.at + b.ms));
    for (const b of beatsOf(evs as any[], m.m, ui.viewer, who, (id) => cardOf.get(id))) {
      const ms = Math.round(b.ms * speed);
      beats.push({ ...b, ms, at: t });
      t += ms;
    }
    ui.beats = beats.slice(-12);
  }
  return fx;
}

export function table(ui: UI, A: any) {
  const m = ui.match!;
  const mod = m.m;
  const v = observe(m, ui.viewer);
  const mine = actor(m) === ui.viewer && !ui.cover && !m.s.result && !ui.paused;
  const tpls: Template[] = mine && !m.s.pending ? playable(m) : [];
  const step = ui.sel ? current(ui.sel) : null;
  const names = new Map<string, string>();
  for (const z of Object.values(v.zones)) for (const c of z.cards ?? []) names.set(c.id, c.card ? mod.card.get(c.card)?.name ?? c.card : 'a face-down card');
  for (const it of v.stack) names.set(it.id, it.label);
  const c: C = {
    ui, A, v, mod,
    sources: new Set(tpls.map((t) => t.source).filter(Boolean) as string[]),
    targets: new Set(step?.options ?? []),
    picked: new Set(step ? ui.sel!.picks[step.key] ?? [] : []),
    label: (x) => (/^p\d+$/.test(x) ? whoOf(ui)(x) : /^[ok]\d+$/.test(x) && !names.has(x) ? 'a card' : names.get(x) ?? (/^[a-z][a-z-]*$/.test(x) ? title(x) : x)),
    fx: effectsSince(ui, v),
    beatTargets: new Set(currentBeat(ui)?.targets ?? []),
  };
  const onGrid = new Set(mod.rules.grid?.zones ?? []);
  const shared = mod.rules.zones.filter((z) => z.shared && !onGrid.has(z.id) && !z.offTable);
  // while choosing targets, arrows run from the card being used to each pick
  const selSrc = ui.sel?.tpl?.source;
  requestAnimationFrame(() => drawSelArrows(selSrc ?? undefined, step ? ui.sel!.picks[step.key] ?? [] : []));
  return h('div', { class: cls('screen table', ui.logDock && 'with-log', matOf(mod) && 'has-mat', lanesOf(mod) && 'has-lanes', `labels-${boardOf(mod).labels ?? 'top'}`), style: `${themeStyle(mod)};--board-scale:${boardOf(mod).scale ?? 1}` },
    hud(c, mine),
    h('div', { class: 'felt' },
      matOf(mod) && v.players.length === 2 ? duelBoard(c, matOf(mod)!) : [
      h('div', { class: 'opponents' }, v.players.filter((p) => p.id !== ui.viewer).map((p) => seat(c, p.id, false))),
      lanesOf(mod) && laneStrip(c, lanesOf(mod)!),
      mod.rules.grid && gridBoard(c),
      (shared.length > 0 || v.stack.length > 0) && h('div', { class: 'center' },
        shared.map((z) => zoneBlock(c, `shared:${z.id}`, z)),
        v.stack.length > 0 && stack(c)),
      seat(c, ui.viewer, true)]),
    ui.logDock && h('aside', { class: 'logdock', 'aria-label': 'Game log' }, h('div', { class: 'logdock-head' }, h('strong', {}, 'Log'), h('button', { class: 'x', onclick: A.toggleLog, 'aria-label': 'Hide log' }, '×')), log(c).slice(1)),
    dock(c, mine, tpls, step),
    (() => { const b = currentBeat(ui); requestAnimationFrame(() => { drawArrows(document.body, b); animateTable(ui.beats ?? []); }); return b && beatView(c, b); })(),
    (c.ui.banners ?? []).map((b) => h('div', { class: 'turn-banner', style: `animation-delay:${(b.at - Date.now()) / 1000}s`, 'aria-hidden': 'true' }, b.text)),
    ui.drawer && drawer(c),
    ui.paused && pause(c),
    !v.result && pendingDialogue() && banner(c),
    v.result && !(ui.tut && !ui.tut.done) && !ui.tut?.done && gameOver(c),
    ui.tut?.done && tutDone(c),
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
    h('span', { class: 'pill' }, `Turn ${v.turn}`),
    h('ol', { class: 'phase-strip', 'aria-label': 'Turn phases' }, mod.rules.phases.filter((ph) => !ph.auto || ph.id === v.phase).map((ph) => h('li', { class: cls(ph.id === v.phase && 'on') },
      mod.manifest.theme?.labels?.[ph.id] ?? title(ph.id))),
      v.window && h('li', { class: 'on window' }, `${title(v.window.step)}`)),
    h('span', { class: cls('hud-status', mine && 'go'), role: 'status' },
      v.result ? 'Game over' : mine ? (v.pending ? 'Your decision' : 'Your move') : `${who ? whoOf(ui)(who) : '…'} ${who && whoOf(ui)(who) === 'You' ? 'are' : 'is'} thinking…`),
    Object.entries(mod.rules.external ?? {}).map(([name, dom]) => h('label', { class: 'ext', title: 'External input (set by the host, logged in the replay)' }, `⚙ ${name} `,
      select(String(v.ext[name]), dom.map((x) => [String(x), String(x)]), (val) => A.setExternal(name, val), `External input ${name}`))),
    h('span', { class: 'hud-right' },
      h('button', { class: cls('icon', ui.logDock && 'on'), onclick: A.toggleLog, 'aria-label': 'Log', 'data-act': 'log' }, '☷ Log'),
      h('button', { class: cls('icon', ui.drawer === 'card' && 'on'), onclick: () => A.drawer('card'), 'aria-label': 'Card details' }, '🔍')));
}

function obj(c: C, o: ObjView, size: 'sm' | 'md') {
  const hit = c.fx.hit.get(o.id);
  const state = cls(c.sources.has(o.id) && 'legal', c.targets.has(o.id) && 'target', c.picked.has(o.id) && 'picked', c.ui.inspect === o.id && 'inspected',
    c.fx.entered.has(o.id) && 'fx-enter', !!hit && 'fx-hit', c.fx.flipped.has(o.id) && 'fx-flip', c.fx.tapped.get(o.id) === true && 'fx-tap', c.fx.tapped.get(o.id) === false && 'fx-untap', c.fx.glow.has(o.id) && !c.fx.entered.has(o.id) && 'fx-glow', o.controller === c.ui.viewer ? 'own' : 'foe');
  const onclick = () => c.A.pick(o.id);
  const el = o.card
    ? cardFace(c.mod, o.card, { size, state, onclick, obj: o.id, stats: o.stats, vars: o.vars, baseVars: c.mod.rules.objectVars, keywords: o.blank ? [] : o.keywords, faceDown: o.faceDown, note: noteOf(c.mod, o) })
    : cardBack(c.mod, { size, state, onclick });
  if (hit) el.append(h('span', { class: 'dmg-float', 'aria-hidden': 'true' }, `-${hit}`));
  (c.fx.float.get(o.id) ?? []).forEach((f, i) => el.append(h('span', { class: cls('stat-float', f.kind), style: `--i:${i + (hit ? 1 : 0)}`, 'aria-hidden': 'true' }, f.text)));
  // used this turn (attacked, exhausted or used an ability): drawn the way the game asks (tilt is the card's tapped state)
  const th = c.mod.manifest.theme as any;
  const style: string = th?.usedStyle ?? (th?.tapVar === 'ex' ? 'tilt' : 'badge');
  const exhausted = (o.vars?.ex ?? 0) > 0, usedNow = (o.vars?.ut ?? 0) === c.v.turn && (o.vars?.ut ?? 0) > 0;
  if (size === 'sm' && style !== 'none') { // board cards only (the hand is drawn at md size)
    const tilted = th?.tapVar === 'ex' && exhausted;
    if (style === 'dim' && (exhausted || usedNow)) el.classList.add('used-dim');
    if ((style === 'badge' && (exhausted || usedNow)) || (style === 'tilt' && usedNow && !tilted) || (style === 'dim' && usedNow && !exhausted))
      el.append(h('span', { class: 'used-badge', title: exhausted ? 'Attacked or exhausted this turn' : 'Used an ability this turn', 'aria-label': 'used this turn' }, exhausted ? '⚔✓' : '↻✓'));
  }
  if (th?.defenseSideways === false && (o.vars?.pos ?? 0) > 0) el.append(h('span', { class: 'def-badge', title: 'Defense position' }, 'DEF'));
  if (c.beatTargets.has(o.id)) el.classList.add('beat-target');
  return el;
}

/** Identity and position notes for a card on the table. */
function noteOf(mod: Mod, o: ObjView): string | undefined {
  const parts = [
    o.printed && `copy (printed: ${mod.card.get(o.printed)?.name ?? o.printed})`,
    o.blank && 'no abilities',
    mod.rules.grid?.layers && o.vars.z !== undefined && mod.rules.grid.layers[o.vars.z],
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

function gridBoard(c: C) {
  const g = c.mod.rules.grid!;
  const zones = new Set(g.zones ?? []);
  const at = new Map<string, ObjView[]>();
  for (const [key, z] of Object.entries(c.v.zones)) {
    if (!zones.has(key.slice(key.indexOf(':') + 1))) continue;
    for (const o of z.cards ?? []) {
      const k = `${o.vars.x ?? 0},${o.vars.y ?? 0}`;
      if (!at.has(k)) at.set(k, []);
      at.get(k)!.push(o);
    }
  }
  const cells: HTMLElement[] = [];
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const k = `${x},${y}`;
      const t = c.targets.has(k);
      cells.push(h('div', {
        class: cls('cell', t && 'target', c.picked.has(k) && 'picked'), 'data-cell': k, role: t ? 'button' : null, tabindex: t ? 0 : null,
        'aria-label': `cell ${k}${t ? ', can be chosen' : ''}`, onclick: t ? () => c.A.choose(k) : null,
        onkeydown: t ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') c.A.choose(k); } : null,
      }, (at.get(k) ?? []).map((o) => obj(c, o, 'sm'))));
    }
  }
  return h('div', { class: 'gridboard', style: `--cols:${g.cols}`, 'aria-label': `${g.cols} by ${g.rows} board` }, cells);
}

interface Mat { rows: string[]; center: string | null }
interface BoardOpts { layout?: 'auto' | 'free' | 'mat' | 'lanes'; labels?: 'top' | 'side' | 'hidden'; scale?: number; slotNames?: boolean; corners?: { lm?: string; ls?: string; rm?: string; rs?: string } }
const boardOf = (mod: Mod) => ((mod.manifest.theme as any)?.board ?? {}) as BoardOpts;
interface Lane { name: string; units: string; site?: string; hidden?: string; ctrl: string }
const matOf = (mod: Mod) => (boardOf(mod).layout === 'free' ? undefined : (mod.manifest.theme as any)?.mat as Mat | undefined);
const lanesOf = (mod: Mod) => (boardOf(mod).layout === 'free' ? undefined : (mod.manifest.theme as any)?.lanes as Lane[] | undefined);
const TEMP_ZONES = new Set(['limbo', 'look']);

/** One slot of a fixed board: the card in it, or its name (and a target while choosing). */
function slotEl(c: C, sp: { id: string }, here: ObjView[], mine: boolean, size: 'sm' | 'md' = 'sm') {
  const t = mine && c.targets.has(sp.id);
  return h('div', {
    class: cls('slot', t && 'target', mine && c.picked.has(sp.id) && 'picked', here.length > 0 && 'full'), 'data-slot': sp.id,
    role: t ? 'button' : null, tabindex: t ? 0 : null, 'aria-label': `${title(sp.id)} slot${t ? ', can be chosen' : ''}`, onclick: t ? () => c.A.choose(sp.id) : null,
  }, here.length ? here.map((o) => obj(c, o, size)) : h('span', { class: 'slot-l' }, title(sp.id)));
}
/** A slot-board mat (monster row nearest the middle, then spells/traps): fixed card-sized slots, piles at the side. */
function matField(c: C, p: string, me: boolean, rowsZ: ZoneDef[], sidePiles: ZoneDef[], tempZ: ZoneDef[]) {
  const mirror = !me;
  const order = me ? rowsZ : [...rowsZ].reverse();
  return h('div', { class: 'mat-wrap' },
    h('div', { class: 'mat', style: `--rows:${order.length}` },
      order.map((z) => {
        const cards = c.v.zones[`${p}:${z.id}`]?.cards ?? [];
        const slots = mirror ? [...(z.slots ?? [])].reverse() : z.slots ?? [];
        return h('div', { class: 'mat-row', 'data-zone': z.id }, h('span', { class: 'mat-l' }, c.mod.manifest.theme?.labels?.[z.id] ?? title(z.id)),
          slots.map((sp) => slotEl(c, sp, cards.filter((o) => o.slot === sp.id), me)));
      }),
      h('div', { class: 'mat-side' }, sidePiles.map((z) => pile(c, `${p}:${z.id}`, z)))),
    tempZ.map((z) => zoneBlock(c, `${p}:${z.id}`, z)));
}
/** A pile drawn as a card-shaped slot: the top card face up for public piles, a back otherwise, with its count. */
function pileSlot(c: C, key: string, z: ZoneDef | undefined) {
  if (!z) return h('div', { class: 'slot gap' });
  const zv = c.v.zones[key];
  const label = c.mod.manifest.theme?.labels?.[z.id] ?? title(z.id);
  const top = zv?.cards?.length ? zv.cards[zv.cards.length - 1] : undefined;
  const hot = (zv?.cards ?? []).some((o) => c.sources.has(o.id) || c.targets.has(o.id));
  return h('button', { class: cls('slot pile-slot', hot && 'hot', c.fx.bump.has(key) && 'fx-bump'), 'aria-label': `${label}: ${zv?.count ?? 0} cards`, title: label, onclick: () => c.A.drawer('pile', key), disabled: !zv?.cards },
    zv?.count ? (top?.card && z.vis === 'public' ? cardFace(c.mod, top.card, { size: 'sm' }) : cardBack(c.mod, { size: 'sm' })) : null,
    h('span', { class: 'pile-tag' }, h('b', {}, String(zv?.count ?? 0)), ` ${label}`));
}
/** A Duel Links-style board for slot games: opponent spells/traps, opponent monsters, the shared extra zones, your monsters, your spells/traps;
 *  piles in the corners (field/banished and extra deck on the left, graveyard and deck on the right, mirrored for the opponent). */
function duelBoard(c: C, mat: Mat) {
  const me = c.ui.viewer, opp = c.v.players.find((x) => x.id !== me)?.id ?? me;
  const zd = (id?: string) => (id ? c.mod.rules.zones.find((z) => z.id === id) : undefined);
  const has = (id: string) => !!zd(id);
  const opts = boardOf(c.mod);
  const cn = { lm: opts.corners?.lm ?? (['fieldzone', 'banished'].find(has)), ls: opts.corners?.ls ?? (['extra'].find(has)), rm: opts.corners?.rm ?? 'grave', rs: opts.corners?.rs ?? 'deck' };
  const placed = new Set([...mat.rows, mat.center ?? '', ...Object.values(cn), c.mod.rules.handZone, 'leader'].filter(Boolean) as string[]);
  const [monZ, spellZ] = mat.rows.map((id) => zd(id));
  const row = (p: string, z: ZoneDef | undefined, mine: boolean) => {
    if (!z) return Array.from({ length: 5 }, () => h('div', { class: 'slot gap' }));
    const cards = c.v.zones[`${p}:${z.id}`]?.cards ?? [];
    return (mine ? z.slots ?? [] : [...(z.slots ?? [])].reverse()).map((sp) => slotEl(c, sp, cards.filter((o) => o.slot === sp.id), mine));
  };
  const info = (p: string, mine: boolean) => {
    const pl = c.v.players.find((x) => x.id === p)!;
    const hand = c.v.zones[`${p}:${c.mod.rules.handZone}`];
    const extraPiles = c.mod.rules.zones.filter((z) => !z.shared && !z.offTable && !placed.has(z.id) && !TEMP_ZONES.has(z.id) && !(z.slots?.length));
    return h('div', { class: cls('duel-info', mine ? 'me' : 'opp', c.v.active === p && 'active') },
      h('button', { class: cls('avatar', c.targets.has(p) && 'target', c.picked.has(p) && 'picked', c.fx.hit.has(p) && 'fx-hit', c.beatTargets.has(p) && 'beat-target'), style: `--h:${(+p.slice(1) * 97 + 200) % 360}`,
        'aria-label': whoOf(c.ui)(p), 'data-player': p, onclick: () => (c.ui.sel ? c.A.pick(p) : c.A.view(p)) }, String(+p.slice(1) + 1), c.fx.hit.has(p) && h('span', { class: 'dmg-float', 'aria-hidden': 'true' }, `-${c.fx.hit.get(p)}`)),
      h('strong', { class: 'duel-name' }, whoOf(c.ui)(p), c.v.active === p ? h('span', { class: 'turn-dot' }, ' ●') : null),
      h('span', { class: 'vars' }, Object.entries(pl.vars).filter(([k]) => !c.mod.manifest.theme?.hideVars?.includes(k)).map(([k, n]) => h('span', { class: cls('chip', c.fx.pulse.get(p)?.has(k) && 'fx-pulse') }, h('b', {}, String(n)), ` ${c.mod.manifest.theme?.labels?.[k] ?? k}`,
        (() => { const d = c.fx.chip.get(`${p}:${k}`); return d ? h('span', { class: cls('chip-float', d < 0 && 'neg'), 'aria-hidden': 'true' }, `${d > 0 ? '+' : ''}${d}`) : null; })()))),
      !mine && hand && h('span', { class: 'chip' }, `✋ ${hand.count}`),
      extraPiles.map((z) => pile(c, `${p}:${z.id}`, z)),
      !mine && recap(c, p));
  };
  const center = mat.center ? (() => {
    const mineZ = c.v.zones[`${me}:${mat.center}`]?.cards ?? [], theirZ = c.v.zones[`${opp}:${mat.center}`]?.cards ?? [];
    const cell = (mySlot: string, theirSlot: string) => slotEl(c, { id: mySlot }, [...mineZ.filter((o) => o.slot === mySlot), ...theirZ.filter((o) => o.slot === theirSlot)], true);
    return [h('div', { class: 'slot gap' }), h('div', { class: 'slot gap' }), cell('L', 'R'), h('div', { class: 'slot gap' }), cell('R', 'L'), h('div', { class: 'slot gap' }), h('div', { class: 'slot gap' })];
  })() : Array.from({ length: 7 }, () => h('div', { class: 'slot gap' }));
  const temp = c.mod.rules.zones.filter((z) => TEMP_ZONES.has(z.id)).flatMap((z) => [zoneBlock(c, `${me}:${z.id}`, z), zoneBlock(c, `${opp}:${z.id}`, z)]).filter(Boolean);
  return h('div', { class: cls('duel', opts.slotNames === false && 'no-slot-names') },
    h('div', { class: 'duel-grid' },
      info(opp, false),
      pileSlot(c, `${opp}:${cn.rs}`, zd(cn.rs)), ...row(opp, spellZ, false), pileSlot(c, `${opp}:${cn.ls}`, zd(cn.ls)),
      pileSlot(c, `${opp}:${cn.rm}`, zd(cn.rm)), ...row(opp, monZ, false), pileSlot(c, `${opp}:${cn.lm}`, zd(cn.lm)),
      h('div', { class: 'duel-mid' }, temp), ...center,
      info(me, true),
      pileSlot(c, `${me}:${cn.lm}`, zd(cn.lm)), ...row(me, monZ, true), pileSlot(c, `${me}:${cn.rm}`, zd(cn.rm)),
      pileSlot(c, `${me}:${cn.ls}`, zd(cn.ls)), ...row(me, spellZ, true), pileSlot(c, `${me}:${cn.rs}`, zd(cn.rs))),
    handRow(c, `${me}:${c.mod.rules.handZone}`, true));
}
/** The shared middle row of a slot board (extra zones): your left zone is the opponent's right one. */
function matCenter(c: C, zid: string) {
  const me = c.ui.viewer, opp = c.v.players.find((x) => x.id !== me)?.id ?? me;
  const mineZ = c.v.zones[`${me}:${zid}`]?.cards ?? [], theirZ = c.v.zones[`${opp}:${zid}`]?.cards ?? [];
  const cell = (mySlot: string, theirSlot: string) => slotEl(c, { id: mySlot }, [...mineZ.filter((o) => o.slot === mySlot), ...theirZ.filter((o) => o.slot === theirSlot)], true);
  return h('div', { class: 'mat-wrap' }, h('div', { class: 'mat mat-center', style: '--rows:1' },
    h('div', { class: 'mat-row' }, h('span', { class: 'mat-l' }, c.mod.manifest.theme?.labels?.[zid] ?? 'Extra'),
      h('div', { class: 'slot gap' }), cell('L', 'R'), h('div', { class: 'slot gap' }), cell('R', 'L'), h('div', { class: 'slot gap' })),
    h('div', { class: 'mat-side' })));
}
/** Shared battlefields between the players: the opponent's units above, yours below, the battlefield card and its controller between. */
function laneStrip(c: C, lanes: Lane[]) {
  const me = c.ui.viewer, opp = c.v.players.find((x) => x.id !== me)?.id ?? me;
  const units = (p: string, l: Lane) => {
    const hid = l.hidden ? c.v.zones[`${p}:${l.hidden}`] : undefined;
    return [...(c.v.zones[`${p}:${l.units}`]?.cards ?? []).map((o) => withAtts(c, o)),
      ...(hid?.cards ? hid.cards.map((o) => obj(c, o, 'sm')) : Array.from({ length: hid?.count ?? 0 }, () => cardBack(c.mod, { size: 'sm' })))];
  };
  return h('div', { class: 'lanes', style: `--n:${lanes.length}`, 'aria-label': 'Battlefields' }, lanes.map((l) => {
    const site = l.site ? [...(c.v.zones[`${me}:${l.site}`]?.cards ?? []), ...(c.v.zones[`${opp}:${l.site}`]?.cards ?? [])][0] : undefined;
    const ctrl = c.v.vars[l.ctrl] ?? 0;
    const owner = ctrl ? c.v.players[ctrl - 1]?.id : null;
    const them = units(opp, l), mine = units(me, l);
    return h('div', { class: cls('lane', owner === me && 'mine', owner === opp && 'theirs'), 'data-lane': l.name },
      h('div', { class: cls('lane-units', 'opp', them.length > 4 && 'crowd') }, them.length ? them : h('span', { class: 'lane-empty' }, 'No enemy units')),
      h('div', { class: 'lane-mid' }, site ? obj(c, site, 'sm') : null,
        h('div', { class: 'lane-info' }, h('strong', {}, l.name), h('span', { class: cls('chip', owner === me && 'good', owner === opp && 'bad') }, owner === me ? '⚑ You control it' : owner === opp ? '⚑ Opponent controls it' : 'Uncontrolled'))),
      h('div', { class: cls('lane-units', 'me', mine.length > 4 && 'crowd') }, mine.length ? mine : h('span', { class: 'lane-empty' }, 'No units of yours')));
  }));
}

function layout(mod: Mod) {
  const zones = mod.rules.zones.filter((z) => !z.shared && !z.offTable);
  const hand = zones.find((z) => z.id === mod.rules.handZone);
  const onGrid = new Set(mod.rules.grid?.zones ?? []);
  const field = zones.filter((z) => z !== hand && z.vis === 'public' && !z.ordered && !onGrid.has(z.id));
  return { hand, field, piles: zones.filter((z) => z !== hand && !field.includes(z) && !onGrid.has(z.id)) };
}

function seat(c: C, p: string, me: boolean) {
  const { v, mod, A, targets, picked } = c;
  const pl = v.players.find((x) => x.id === p)!;
  const L = layout(mod);
  const bar = h('div', { class: 'seat-bar' },
    h('button', {
      class: cls('avatar', targets.has(p) && 'target', picked.has(p) && 'picked', c.fx.hit.has(p) && 'fx-hit', c.beatTargets.has(p) && 'beat-target'), style: `--h:${(+p.slice(1) * 97 + 200) % 360}`,
      'aria-label': `${whoOf(c.ui)(p)}${targets.has(p) ? ', can be chosen' : ''}`, 'data-player': p, onclick: () => (c.ui.sel ? A.pick(p) : A.view(p)),
    }, String(+p.slice(1) + 1), c.fx.hit.has(p) && h('span', { class: 'dmg-float', 'aria-hidden': 'true' }, `-${c.fx.hit.get(p)}`)),
    h('span', { class: 'seat-name' }, whoOf(c.ui)(p) === 'You' ? 'You' : whoOf(c.ui)(p), v.active === p ? h('span', { class: 'turn-dot', title: 'Active player' }, ' ●') : null, pl.lost ? ' — out' : ''),
    h('span', { class: 'vars' }, Object.entries(pl.vars).filter(([k]) => !mod.manifest.theme?.hideVars?.includes(k)).map(([k, n]) => h('span', { class: cls('chip', c.fx.pulse.get(p)?.has(k) && 'fx-pulse') }, h('b', {}, String(n)), ` ${mod.manifest.theme?.labels?.[k] ?? k}`, (() => { const d = c.fx.chip.get(`${p}:${k}`); return d ? h('span', { class: cls('chip-float', d < 0 && 'neg'), 'aria-hidden': 'true' }, `${d > 0 ? '+' : ''}${d}`) : null; })()))),
    !me && recap(c, p),
    !matOf(mod) && h('span', { class: 'piles' }, L.piles.map((z) => pile(c, `${p}:${z.id}`, z))));
  const mirror = !me && !!(mod.manifest.theme as any)?.mirror; // grid boards: the opponent's side is drawn as seen across the table
  const mat = matOf(mod), lanes = lanesOf(mod);
  const laneZ = new Set((lanes ?? []).flatMap((l) => [l.units, l.site, l.hidden].filter(Boolean) as string[]));
  const fieldZ = L.field.filter((z) => !laneZ.has(z.id));
  let field: HTMLElement;
  if (mat) {
    const rowsZ = mat.rows.map((id) => fieldZ.find((z) => z.id === id)).filter(Boolean) as ZoneDef[];
    const others = fieldZ.filter((z) => !mat.rows.includes(z.id) && z.id !== mat.center && !TEMP_ZONES.has(z.id));
    field = matField(c, p, me, rowsZ, [...L.piles, ...others], fieldZ.filter((z) => TEMP_ZONES.has(z.id)));
  } else field = h('div', { class: 'field' }, (mirror ? [...fieldZ].reverse() : fieldZ).map((z) => zoneBlock(c, `${p}:${z.id}`, z)));
  const hand = L.hand ? handRow(c, `${p}:${L.hand.id}`, me) : null;
  return h('section', { class: cls('seat-area', me ? 'me' : 'opp', pl.lost && 'lost', v.active === p && 'active') },
    me ? [field, hand, bar] : [bar, hand, field]);
}

/** What a player did on their latest turn (cards played and abilities used), newest last. */
function recap(c: C, p: string) {
  const m = c.ui.match!;
  const evs = eventsFor(m, c.ui.viewer, Math.max(0, m.s.events.length - 600)) as Record<string, any>[];
  const first = m.m.rules.phases[0].id;
  let start = -1;
  for (let i = evs.length - 1; i >= 0; i--) if (evs[i].type === 'phase' && evs[i].phase === first && evs[i].active === p) { start = i; break; }
  if (start < 0) return null;
  const items: { card: string; verb: string }[] = [];
  for (const e of evs.slice(start)) {
    if (e.type === 'phase' && e.phase === first && e.active !== p) break;
    if (e.type === 'action' && e.player === p && e.card && e.action !== 'pass') {
      const base = String(e.action).split('#')[0];
      const label = (m.m.rules.actions[base]?.label ?? base).toLowerCase();
      items.push({ card: e.card, verb: /attack/.test(label) ? '⚔' : /quest/.test(label) ? '◆' : /move|march/.test(label) ? '➜' : /use|activate|act/.test(label) ? '↻' : '✦' });
    }
  }
  if (!items.length) return null;
  const turnNow = c.v.active === p;
  return h('span', { class: 'recap', 'aria-label': `${turnNow ? 'This turn' : 'Last turn'}: ${items.map((x) => c.mod.card.get(x.card)?.name ?? x.card).join(', ')}` },
    h('span', { class: 'recap-l' }, turnNow ? 'This turn' : 'Last turn'),
    items.slice(-8).map((x) => h('span', { class: 'chip recap-i', 'data-card': x.card, title: c.mod.card.get(x.card)?.name ?? x.card }, `${x.verb} ${c.mod.card.get(x.card)?.name ?? x.card}`)));
}

function pile(c: C, key: string, z: ZoneDef) {
  const zv = c.v.zones[key];
  if (!zv || (z.hideEmpty && !zv.count && !zv.show)) return null;
  const hot = (zv.cards ?? []).some((o) => c.sources.has(o.id) || c.targets.has(o.id));
  return h('button', {
    class: cls('pile', hot && 'hot', !zv.cards && 'hidden', c.fx.bump.has(key) && 'fx-bump'), disabled: !zv.cards,
    'aria-label': `${title(z.id)}: ${zv.count} cards${zv.cards ? '' : ' (hidden)'}`, onclick: () => c.A.drawer('pile', key),
  }, h('span', { class: 'pile-n' }, String(zv.count)), h('span', { class: 'pile-l' }, c.mod.manifest.theme?.labels?.[z.id] ?? title(z.id)));
}

/** A zone with named slots: rows grouped by each slot's first tag; empty slots show their name and can be targets. */
function slotted(c: C, key: string, z: ZoneDef, cards: ObjView[]) {
  const mine = key.startsWith(`${c.ui.viewer}:`);
  const mirror = !mine && !!(c.mod.manifest.theme as any)?.mirror;
  const rows = new Map<string, NonNullable<ZoneDef['slots']>>();
  for (const sp of mirror ? [...z.slots!].reverse() : z.slots!) { const r = sp.tags?.[0] ?? ''; rows.set(r, [...(rows.get(r) ?? []), sp]); }
  return h('div', { class: 'zone slotted' }, h('span', { class: 'zone-l' }, c.mod.manifest.theme?.labels?.[z.id] ?? title(z.id)),
    [...rows.values()].map((row) => h('div', { class: 'slot-row' }, row.map((sp) => {
      const here = cards.filter((o) => o.slot === sp.id);
      const t = mine && c.targets.has(sp.id);
      return h('div', {
        class: cls('slot', t && 'target', mine && c.picked.has(sp.id) && 'picked', here.length > 0 && 'full'), 'data-slot': sp.id,
        role: t ? 'button' : null, tabindex: t ? 0 : null, 'aria-label': `${title(sp.id)} slot${t ? ', can be chosen' : ''}`, onclick: t ? () => c.A.choose(sp.id) : null,
      }, here.length ? here.map((o) => obj(c, o, 'sm')) : h('span', { class: 'slot-l' }, title(sp.id)));
    }))));
}

/** Cards attached to an object (relationship "bearer"): drawn small under it instead of in their own zone. */
function attsOf(c: C, id: string): ObjView[] {
  const out: ObjView[] = [];
  for (const z of Object.values(c.v.zones)) for (const o of z.cards ?? []) if (o.rel?.bearer === id) out.push(o);
  return out;
}
function withAtts(c: C, o: ObjView) {
  const atts = attsOf(c, o.id);
  // a unit at a location, or with cards tucked under it (shift, boost): a small tag under the card
  const under = Object.values(c.v.zones).reduce((n, z) => n + (z.cards ?? []).filter((x) => x.rel?.host === o.id).length, 0);
  const at = o.rel?.at && Object.values(c.v.zones).some((z) => z.cards?.some((x) => x.id === o.rel!.at)) ? o.rel.at : null;
  if (!atts.length && (at || under)) return h('div', { class: 'unit-stack' }, obj(c, o, 'sm'),
    h('div', { class: 'unit-tags' }, at && h('span', { class: 'chip', title: 'At this location' }, `📍 ${c.label(at)}`), under > 0 && h('span', { class: 'chip', title: 'Cards under it' }, `📚 ${under}`)));
  if (!atts.length) return obj(c, o, 'sm');
  return h('div', { class: 'unit-stack' }, obj(c, o, 'sm'), h('div', { class: 'atts', 'aria-label': `${atts.length} attached` }, atts.map((a) => obj(c, a, 'sm'))));
}
function zoneBlock(c: C, key: string, z: ZoneDef) {
  const zv = c.v.zones[key];
  if (!zv) return null;
  if (z.hideEmpty && !zv.count && !zv.show) return null;
  if (!zv.cards) return pile(c, key, z);
  const shown = zv.cards.filter((o) => !(o.rel?.bearer && Object.values(c.v.zones).some((q) => q.cards?.some((x) => x.id === o.rel!.bearer))) && !(o.rel?.host && Object.values(c.v.zones).some((q) => q.cards?.some((x) => x.id === o.rel!.host))));
  if (z.hideEmpty && !shown.length && !zv.show) return null;
  if (z.slots?.length) return slotted(c, key, z, zv.cards);
  if (!shown.length && !z.abilities) return null;
  return h('div', { class: cls('zone', z.compact && 'compact') }, h('span', { class: 'zone-l' }, c.mod.manifest.theme?.labels?.[z.id] ?? title(z.id)),
    h('div', { class: 'row' }, shown.length ? shown.map((o) => withAtts(c, o)) : h('span', { class: 'empty-slot' }, 'empty')));
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

/** The tutorial guide: the current coaching line; read-only steps pause the game until Continue. */
function coach(c: C) {
  const k = tutCoach();
  if (!k) return null;
  return h('div', { class: cls('coach', k.read && 'read'), role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'coach-head' }, h('span', { class: 'coach-who' }, k.speaker ?? 'Guide'), h('span', { class: 'muted' }, `${k.n} / ${k.of}`)),
    h('p', {}, k.text),
    k.read && h('div', { class: 'opts end' }, h('button', { class: 'cta small', onclick: c.A.tutNext, autofocus: true, 'data-tut': 'next' }, k.n === k.of ? 'Finish' : 'Continue')));
}

function tutDone(c: C) {
  const { ui, A } = c;
  const t = tutorial();
  const g = ui.tut!.granted;
  return h('div', { class: 'overlay gameover', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'panel-pop' },
      h('h1', { class: 'result win' }, 'Tutorial complete'),
      h('p', {}, t?.name ?? ''),
      h('p', { class: 'muted' }, g?.currency ? `+${g.currency} Marks added to your campaign.` : 'Reward already collected for this tutorial.'),
      h('button', { class: 'cta', onclick: A.tutExit, 'data-tut': 'exit' }, 'Back to tutorials'),
      !ui.match!.s.result && h('button', { onclick: A.tutKeepPlaying }, 'Keep playing against the AI')));
}

function dock(c: C, mine: boolean, tpls: Template[], step: ReturnType<typeof current> | null) {
  const { ui, A, label } = c;
  const body = ui.note ? noteEl(ui.note, A.closeNote)
    : ui.sel && step ? prompt(c, step)
      : ui.menu ? h('div', { class: 'dock-body' }, h('strong', {}, 'Choose an action'),
        h('div', { class: 'opts' }, ui.menu.tpls.map((t) => h('button', { class: 'opt', onclick: () => A.start(t) }, t.label)), h('button', { class: 'ghost', onclick: A.cancel }, 'Cancel')))
        : mine ? actionsBar(A, tpls, c)
          : h('div', { class: 'dock-body waiting' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ui.match!.s.result ? 'Game over' : 'Opponent is playing…');
  return h('div', { class: 'dock' }, coach(c), body);
}

function prompt(c: C, step: ReturnType<typeof current>) {
  const { ui, A, label } = c;
  const picks = ui.sel!.picks[step.key] ?? [];
  const pd = ui.match!.s.pending;
  const objectish = (x: string) => /^(o|k)\d+$/.test(x) || /^p\d+$/.test(x) || (!!c.mod.rules.grid && /^\d+,\d+$/.test(x));
  const inline = step.options.filter((x) => !objectish(x) || (!ui.sel!.tpl && pd?.labels) || step.divide);
  const n = (x: string) => picks.filter((y) => y === x).length;
  if (step.divide) {
    return h('div', { class: 'dock-body' },
      h('div', { class: 'prompt-title' }, h('strong', {}, title(step.prompt)), h('span', { class: 'muted' }, ` · tap to assign, ${step.max - picks.length} left`)),
      h('div', { class: 'opts' }, inline.map((x) => h('button', { class: cls('opt', n(x) > 0 && 'picked'), onclick: () => A.choose(x) }, `${label(x)}${n(x) ? ` ×${n(x)}` : ''}`))),
      h('div', { class: 'opts end' },
        h('button', { class: 'ghost', disabled: !picks.length, onclick: A.undoPick }, 'Undo'),
        h('button', { class: 'cta small', disabled: picks.length !== step.max, onclick: A.confirm }, 'Confirm')));
  }
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

function actionsBar(A: any, tpls: Template[], c?: C) {
  const free = tpls.filter((t) => !t.source);
  const n = tpls.length - free.length;
  const pass = free.find((t) => t.action === 'pass');
  return h('div', { class: 'dock-body' },
    h('span', { class: 'muted hint' }, n ? `${n} playable — glowing cards. Tap a dim card to see why it can't be used.` : 'Nothing to play with cards right now.'),
    h('div', { class: 'opts end' },
      free.filter((t) => t !== pass).map((t) => h('button', { class: 'opt', onclick: () => A.start(t) }, t.label)),
      pass && h('button', { class: 'cta small pass', onclick: () => A.start(pass), 'data-act': 'pass' }, c ? passLabel(c) : pass.label)));
}

/** What passing does right now, in the player's words: finish responding, go to the next phase, or end the turn. */
function passLabel(c: C): string {
  const { v, mod, ui } = c;
  if (v.window) return v.active === ui.viewer ? 'Continue' : 'No response';
  if (v.active !== ui.viewer) return 'No response';
  const ph = mod.rules.phases;
  const i = ph.findIndex((p) => p.id === v.phase);
  const next = ph.slice(i + 1).find((p) => !p.auto);
  return next ? `Next: ${mod.manifest.theme?.labels?.[next.id] ?? title(next.id)} ▸` : 'End turn ▸';
}
function drawSelArrows(src: string | undefined, picks: string[]) {
  document.querySelectorAll('svg.sel-arrows').forEach((s) => s.remove());
  if (!src || !picks.length) return;
  const find = (id: string) => document.querySelector<HTMLElement>(/^p\d+$/.test(id) ? `[data-player="${id}"]` : `[data-obj="${id}"]`);
  const a = find(src);
  if (!a) return;
  const ra = a.getBoundingClientRect();
  const paths = picks.map(find).filter(Boolean).map((b) => {
    const rb = b!.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2, y1 = ra.top + ra.height / 2, x2 = rb.left + rb.width / 2, y2 = rb.top + rb.height / 2;
    return `<path d="M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - 60} ${x2},${y2}" marker-end="url(#sa)"/>`;
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'beat-arrows sel-arrows');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<defs><marker id="sa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>' + paths.join('');
  document.body.append(svg);
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
      ? [cardFace(mod, o.card, { size: 'lg', stats: o.stats, vars: o.vars, baseVars: mod.rules.objectVars, keywords: o.blank ? [] : o.keywords, faceDown: o.faceDown, note: noteOf(mod, o) }),
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
      segmented(ui.cardSize, [['s', 'Compact'], ['m', 'Large'], ['l', 'Huge']], A.setCardSize, 'Card size'),
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
      ui.camp ? h('button', { class: 'cta', onclick: A.finishCampaignMatch }, 'Continue') : h('button', { class: 'cta', onclick: A.rematch }, 'Rematch'),
      h('button', { onclick: () => A.drawer('log') }, 'Review log'),
      !ui.camp && h('button', { class: 'ghost', onclick: A.quit }, 'Game menu')));
}

function banner(c: C) {
  const d = pendingDialogue()!;
  return h('div', { class: 'overlay soft', role: 'dialog', 'aria-label': 'Dialogue' },
    h('div', { class: 'dialogue' }, h('div', { class: 'portrait', 'aria-hidden': 'true' }, '💬'),
      h('div', { class: 'speech' }, h('div', { class: 'speaker' }, d.speaker), h('p', {}, d.text),
        h('div', { class: 'opts end' }, h('button', { class: 'cta small', onclick: c.A.ackDialogue, autofocus: true }, 'Continue')))));
}

function fmt(e: Record<string, any>, mod: Mod, label: (x: string) => string, pname: (p: string) => string): string | null {
  const cn = (id?: string) => (id ? mod.card.get(id)?.name ?? id : undefined);
  switch (e.type) {
    case 'moved': return `${cn(e.card) ?? 'A card'}: ${e.from} → ${e.to}${e.toPlayer && e.toPlayer !== 'shared' ? ` (${pname(e.toPlayer)})` : ''}`;
    case 'damage': return `${e.source ? label(e.source) : 'Damage'} → ${label(e.target)}: ${e.amount}`;
    case 'changed': return /^p\d+$/.test(e.ref) ? `${pname(e.ref)} ${e.name}: ${e.from} → ${e.to}` : null;
    case 'action': {
      const [base, i] = String(e.action).split('#');
      const d = mod.rules.actions[base];
      const ab = i !== undefined && d?.activated && e.card ? (mod.card.get(e.card) as any)?.[d.activated]?.[+i]?.label : undefined;
      return `${pname(e.player)}: ${ab ?? d?.label ?? base}${e.card ? ` ${cn(e.card)}` : ''}`;
    }
    case 'became': return e.targets ? `${e.targets.map(label).join(', ')} ${e.copy ? `becomes a copy of ${cn(e.copy)}` : ''}${e.copy && e.blank ? ' and ' : ''}${e.blank ? 'loses all abilities' : ''}` : null;
    case 'missed': return `${e.label} missed its timing`;
    case 'controlled': return `${label(e.obj)} changes sides (${pname(e.from)} → ${pname(e.to)})`;
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
    case 'dialogue': return `${e.speaker}: “${e.text}”`;
    case 'created': return `${cn(e.card) ?? 'A token'} appears${e.toPlayer && e.toPlayer !== 'shared' ? ` (${pname(e.toPlayer)})` : ''}`;
    case 'replaced': return `${e.by}: ${e.event} ${e.how === 'instead' ? 'replaced' : 'modified'}`;
    case 'windowOpened': return `▸ ${title(e.window)} begins`;
    case 'windowClosed': return `◂ ${title(e.window)} ends`;
    case 'step': return `  ${title(e.window)}: ${title(e.step)} step`;
    case 'paid': return `${pname(e.player)} paid ${Object.entries(e.paid).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'}`;
    case 'slotted': return e.obj ? `${label(e.obj)} moves to ${title(e.slot)}` : null;
    case 'slotFull': return `No room${e.slot ? ` in ${title(e.slot)}` : ''}`;
    case 'shuffled': case 'linked': case 'unlinked': case 'modified': case 'expired': case 'drawFail': case 'log': return null;
    default: {
      const { seq: _s, type, ...rest } = e;
      return `${title(type)} ${Object.entries(rest).map(([k, x]) => `${k}: ${typeof x === 'string' ? label(x) : JSON.stringify(x)}`).join(', ')}`;
    }
  }
}

/** Plain-language log lines: what happened, from the viewer's seat, without bookkeeping. */
function friendly(e: Record<string, any>, c: C): string | null {
  const { mod, ui } = c;
  const who = whoOf(ui);
  const s = (p: string) => (who(p) === 'You' ? '' : 's');
  const cn = (id?: string) => (id ? mod.card.get(id)?.name ?? 'a card' : 'a card');
  const lbl = (k: string) => mod.manifest.theme?.labels?.[k] ?? title(k);
  const hide = new Set(mod.manifest.theme?.hideVars ?? []);
  switch (e.type) {
    case 'phase': return e.phase === mod.rules.phases[0].id ? `— ${who(e.active) === 'You' ? 'Your' : `${who(e.active)}'s`} turn ${e.turn} —` : null;
    case 'action': {
      if (e.action === 'pass') return null;
      const [base, i] = String(e.action).split('#');
      if (/^(attack|march|quest)$/.test(base) || (base === 'boost' && /^Give/.test(mod.rules.actions[base]?.label ?? ''))) return null;
      const d = mod.rules.actions[base];
      const ab = i !== undefined && d?.activated && e.card ? (mod.card.get(e.card) as any)?.[d.activated]?.[+i]?.label : undefined;
      const verb = (ab ?? d?.label ?? base).toLowerCase();
      const v1 = verb === 'play' || verb === 'summon' ? 'play' : verb.split(' ')[0];
      const rest = verb.split(' ').slice(1).join(' ');
      return `${who(e.player)} ${ab ? `use${s(e.player)} ${cn(e.card)}: ${ab}` : `${v1}${s(e.player)}${rest ? ` ${rest}` : ''} ${e.card ? cn(e.card) : 'a card'}`}`;
    }
    case 'moved':
      if (e.from === 'deck' && e.to === 'hand') return `${who(e.toPlayer ?? e.owner)} draw${s(e.toPlayer ?? e.owner)} ${e.card ? cn(e.card) : 'a card'}`;
      if (e.from === 'hand' && e.to === 'grave') return `${who(e.owner)} discard${s(e.owner)} ${cn(e.card)}`;
      if (e.to === 'hand' && e.from !== 'deck' && e.from !== 'limbo') return `${cn(e.card)} returns to ${who(e.owner) === 'You' ? 'your' : 'their'} hand`;
      if (e.to === 'banished') return `${cn(e.card)} is banished`;
      return null;
    case 'attack': return `${c.label(e.o ?? e.attacker)} attacks ${c.label(e.t ?? e.target)}`;
    case 'blocked': return e.o ? `${c.label(e.o)} blocks${e.a ? ` ${c.label(e.a)}` : ''}${e.full === true ? ' completely' : e.full === false ? ' (half damage)' : ''}` : null;
    case 'checked': return `${who(e.p)} check${s(e.p)}: ${cn(e.card)} shows ${e.v} (needs ${e.need}) — ${e.ok ? 'pass' : 'fail'}`;
    case 'checkFail': return `${who(e.p)} fail${s(e.p)} a check: the card is discarded and the turn ends`;
    case 'blockFailed': return `${who(e.p)} fail${s(e.p)} the block check`;
    case 'breaker': return `Breaker: ${who(e.p) === 'You' ? 'your' : "the opponent's"} next check gets -${e.n}`;
    case 'enhanced': return `${c.label(e.o)} gets +${e.n} ${e.what}`;
    case 'stunned': return `${who(e.p)} ${who(e.p) === 'You' ? 'are' : 'is'} stunned: ${e.n} foundation${e.n === 1 ? '' : 's'} committed`;
    case 'momentum': return `${who(e.p)} gain${s(e.p)} momentum`;
    case 'installed': return `${who(e.p)} install${s(e.p)} a card in ${lbl(e.z)}`;
    case 'rezzed': return `${who(e.p)} rez${who(e.p) === 'You' ? '' : 'zes'} ${c.label(e.o)}`;
    case 'advanced': return `${who(e.p)} advance${s(e.p)} a card (${e.n})`;
    case 'scoredAgenda': return `${who(e.p)} score${s(e.p)} ${cn(e.card)} for ${e.n}`;
    case 'run': return `${who(e.p)} start${s(e.p)} a run`;
    case 'approach': return `Approaching ${c.label(e.o)}`;
    case 'broken': return `${c.label(e.by)} breaks ${c.label(e.o)}`;
    case 'fired': return `${c.label(e.o)}'s subroutines fire`;
    case 'runEnded': return 'The run ends';
    case 'jackOut': return `${who(e.p)} jack${s(e.p)} out`;
    case 'runSuccess': return `The run on ${e.z} succeeds`;
    case 'accessed': return `${who(e.p)} access${who(e.p) === 'You' ? '' : 'es'} ${cn(e.card)}`;
    case 'stolen': return `${who(e.p)} steal${s(e.p)} a scheme (+${e.n})`;
    case 'trashedAccess': return `${who(e.p)} trash${who(e.p) === 'You' ? '' : 'es'} what they found`;
    case 'wounded': return `${who(e.p)} take${s(e.p)} ${e.n} wound${e.n === 1 ? '' : 's'}`;
    case 'flatline': return `${who(e.p)} ${who(e.p) === 'You' ? 'are' : 'is'} flatlined!`;
    case 'tagged': return `${who(e.p)} get${s(e.p)} ${e.n} tag${e.n === 1 ? '' : 's'}`;
    case 'untagged': return `${who(e.p)} remove${s(e.p)} a tag`;
    case 'trashedTagged': return `${who(e.p)} trash${who(e.p) === 'You' ? '' : 'es'} a tagged resource`;
    case 'tookOne': return null;
    case 'blockAsk': return `Blockers for ${c.label(e.a)}?`;
    case 'menace': return `${c.label(e.a)} has menace: one blocker isn't enough`;
    case 'walkerHit': return `${c.label(e.o)} loses ${e.n} loyalty`;
    case 'walkerDown': return `${who(e.p)} lose${s(e.p)} a walker`;
    case 'crewed': return `${c.label(e.o)} is crewed`;
    case 'stationed': return `${c.label(e.o)} gains ${e.n} charge`;
    case 'legendRule': return `Legend rule: the older ${cn(e.card)} goes to the discard pile`;
    case 'warded': return `Ward: the effect fizzles on ${c.label(e.o)}`;
    case 'kicked': return `${who(e.p)} kick${s(e.p)} the spell`;
    case 'cycled': return `${who(e.p)} cycle${s(e.p)} a card`;
    case 'damage': return `${e.source ? c.label(e.source) : 'Damage'} → ${c.label(e.target)}: ${e.amount} damage`;
    case 'destroyed': return `${cn(e.card)} is destroyed`;
    case 'changed': return /^p\d+$/.test(e.ref) && !hide.has(e.name) && !String(e.name).includes(':') ? `${who(e.ref)}: ${e.to} ${lbl(e.name)} (${e.to - e.from >= 0 ? '+' : ''}${e.to - e.from})` : null;
    case 'created': return `${cn(e.card)} appears`;
    case 'stacked': return `${who(e.ctrl)} cast${s(e.ctrl)} ${e.label ?? cn(e.card)}`;
    case 'countered': return `${cn(e.card)} is cancelled`;
    case 'flipped': return e.card ? `${cn(e.card)} is revealed` : null;
    case 'lifeLost': return `${who(e.p)} lose${s(e.p)} a life card`;
    case 'prize': return `${who(e.p)} take${s(e.p)} ${(e.n ?? 1) > 1 ? `${e.n} prize cards` : 'a prize card'}`;
    case 'quest': return `${c.label(e.o)} quests for ${e.n}`;
    case 'locLore': return `${c.label(e.o)} gives ${who(e.p) === 'You' ? 'you' : who(e.p)} ${e.n} point${e.n === 1 ? '' : 's'}`;
    case 'movedTo': return `${c.label(e.o)} moves to ${c.label(e.loc)}`;
    case 'shifted': return `${who(e.p)} shift${s(e.p)} ${c.label(e.o)} onto its earlier self`;
    case 'boosted': return `${who(e.p)} tuck${s(e.p)} a card under ${c.label(e.o)}`;
    case 'supported': return `${c.label(e.o)} gets +${e.n} from a helping hand`;
    case 'vanished': return `${c.label(e.o)} vanishes when chosen`;
    case 'drops': return `${who(e.p)} save${s(e.p)} ${e.n} for later`;
    case 'dropSpent': return `${who(e.p)} spend${s(e.p)} a saved resource`;
    case 'emptyDeck': return `${who(e.p)} end${s(e.p)} the turn with no cards left`;
    case 'conquer': return `${who(e.p)} conquer${s(e.p)} ${lbl(e.z)} (+1 point)`;
    case 'hold': return `${who(e.p)} hold${s(e.p)} ${lbl(e.z)} (+1 point)`;
    case 'retaken': return `${who(e.p)} retake${s(e.p)} ${lbl(e.z)} (already scored this turn)`;
    case 'finalPoint': return `${who(e.p)} can't win by conquest yet: draw${s(e.p)} a card instead`;
    case 'marched': return `${who(e.p)} move${s(e.p)} ${e.n} unit${e.n === 1 ? '' : 's'} into ${lbl(e.z)}`;
    case 'recalled': return `Attackers fall back from ${lbl(e.z)}`;
    case 'showdownFight': return `Fight at ${lbl(e.z)}: ${e.a} against ${e.b}`;
    case 'hidden': return `${who(e.p)} hide${s(e.p)} a card at ${lbl(e.z)}`;
    case 'hiddenLost': return `${who(e.p)} lose${s(e.p)} a hidden card`;
    case 'burnOut': return `${who(e.p)} burn${s(e.p)} out: the opponent scores 1 and the trash is reshuffled`;
    case 'synchro': return `${who(e.p)} synchro summon${s(e.p)}!`;
    case 'xyz': return `${who(e.p)} xyz summon${s(e.p)}!`;
    case 'linkSummon': return `${who(e.p)} link summon${s(e.p)}!`;
    case 'fusion': return `${who(e.p)} fusion summon${s(e.p)}!`;
    case 'ritual': return `${who(e.p)} ritual summon${s(e.p)}!`;
    case 'pendulum': return `${who(e.p)} pendulum summon${s(e.p)}!`;
    case 'scale': return `${who(e.p)} set${s(e.p)} a pendulum scale: ${c.label(e.o)}`;
    case 'placed': return `${c.label(e.o)} takes the field`;
    case 'dice': return `${who(e.p)} roll${s(e.p)} a d${e.sides}: ${e.value}`;
    case 'rolled': return e.dice > 1 ? `Total: ${e.total}` : null;
    case 'coin': return `${who(e.p)} flip${s(e.p)} a coin: ${e.heads ? 'heads!' : 'tails'}`;
    case 'status': return `${c.label(e.o)} is now ${lbl(`st_${e.s}`)}`;
    case 'cured': return `${c.label(e.o)} recovers from ${lbl(`st_${e.s}`)}`;
    case 'statusTick': return `${c.label(e.o)} takes ${e.n} damage from ${lbl(`st_${e.s}`)}`;
    case 'attackFailed': return `${c.label(e.o)} is ${lbl(`st_${e.s}`)}: the attack fails`;
    case 'switched': return `${who(e.p)} switch${who(e.p) === 'You' ? '' : 'es'} the active unit`;
    case 'evolved': return `${c.label(e.o)} evolves!`;
    case 'mulligan': return `${who(e.p)} had no basic unit and redraw${s(e.p)}`;
    case 'mulliganBonus': return `${who(e.p)} draw${s(e.p)} ${e.n} extra for the opponent's mulligans`;
    case 'given': return `${who(e.p)} give${s(e.p)} ${lbl('resources')} to ${c.label(e.o)}`;
    case 'peek': return e.card ? `You look at the top card: ${cn(e.card)}` : null;
    case 'lost': return `${who(e.player)} ${who(e.player) === 'You' ? 'are' : 'is'} out`;
    case 'gameOver': return 'Game over';
    case 'dialogue': return `${e.speaker}: “${e.text}”`;
    default: return null;
  }
}

function log(c: C) {
  const m = c.ui.match!;
  const ev = eventsFor(m, c.ui.viewer, Math.max(0, m.s.events.length - 150));
  const lines = ev.map((e) => (c.ui.logAll ? fmt(e as GEvent, c.mod, c.label, whoOf(c.ui)) : friendly(e as GEvent, c))).filter(Boolean).slice(-60).reverse();
  return [h('h3', {}, 'Log'), h('label', { class: 'chk log-all' }, h('input', { type: 'checkbox', checked: !!c.ui.logAll, onchange: c.A.toggleLogAll }), h('span', {}, 'Details')), h('ol', { class: 'log', reversed: true }, lines.map((l) => h('li', {}, l!)))];
}
