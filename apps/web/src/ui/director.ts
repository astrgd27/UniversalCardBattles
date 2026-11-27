// Battle director: turns the viewer's event log into "beats" the table plays one at a time (like digital TCG clients):
// a caption, a spotlight on the card being played, an arrow from attacker to target, and a battle readout with the
// numbers and the outcome. The AI waits for its beats to finish before it acts again, so every opponent move can be
// followed. Beats are built only from the viewer's redacted events, so they never reveal hidden cards.
import type { Mod } from '#engine';

export interface Beat {
  kind: 'play' | 'attack' | 'block' | 'clash' | 'hit' | 'destroy' | 'info' | 'stack';
  text: string;
  card?: string; // card id to spotlight
  from?: string; to?: string; // object or player ids for the arrow
  clash?: { a?: { card: string; dealt: number; took: number; dead: boolean }; b?: { card: string; dealt: number; took: number; dead: boolean }; player?: string; playerTook?: number };
  mine: boolean; // caused by the viewer
  ms: number;
  at?: number;
}
type Ev = Record<string, any>;
const ICON: Record<Beat['kind'], string> = { play: '✦', attack: '⚔', block: '🛡', clash: '💥', hit: '♥', destroy: '✖', info: '•', stack: '⧗' };
export const beatIcon = (k: Beat['kind']) => ICON[k];
const BEAT_EVENTS = new Set(['quest', 'lifeLost', 'prize', 'conquer', 'hold', 'deployed', 'showdownFight', 'hit', 'marched', 'recalled', 'finalPoint', 'coin', 'status', 'attackFailed', 'evolved', 'switched', 'statusTick']);

/** Beats for a slice of the viewer's events. `who(p)` names a player ("You" / "Opponent"). */
export function beatsOf(events: Ev[], mod: Mod, viewer: string, who: (p: string) => string, cardOf: (id: string) => string | undefined): Beat[] {
  const out: Beat[] = [];
  const name = (id?: string) => (!id ? 'something' : /^p\d+$/.test(id) ? who(id) : mod.card.get(cardOf(id) ?? '')?.name ?? 'a card');
  let battle: { a?: string; t?: string; mine: boolean; dmg: Map<string, number>; dead: Set<string>; deadCards: Map<string, string> } | null = null;
  const flush = () => {
    if (!battle) return;
    const { a, t, dmg, dead, deadCards } = battle;
    const side = (id?: string, other?: string) => (id && !/^p\d+$/.test(id) ? { card: cardOf(id) ?? deadCards.get(id) ?? '', dealt: other ? dmg.get(other) ?? 0 : 0, took: dmg.get(id) ?? 0, dead: dead.has(id) } : undefined);
    const anything = dmg.size > 0 || dead.size > 0;
    if (anything) {
      const sa = side(a, t), sb = side(t, a);
      const outcome = [...dead].map((d) => `${mod.card.get(cardOf(d) ?? deadCards.get(d) ?? '')?.name ?? 'A card'} is destroyed`).join(', ');
      const playerHit = t && /^p\d+$/.test(t) ? dmg.get(t) : undefined;
      out.push({ kind: 'clash', mine: battle.mine, ms: 1300, clash: { a: sa, b: sb, ...(playerHit ? { player: t, playerTook: playerHit } : {}) },
        text: outcome || (playerHit ? `${who(t!)} take${who(t!) === 'You' ? '' : 's'} ${playerHit} damage` : 'The battle is over') });
    }
    battle = null;
  };
  for (const e of events) {
    const mine = (e.player ?? e.p) === viewer;
    switch (e.type) {
      case 'action': {
        if (e.action === 'pass' || !e.card) break;
        const base = String(e.action).split('#')[0];
        const label = (mod.rules.actions[base]?.label ?? base).toLowerCase();
        if (/attack|move|march|quest/i.test(base)) break; // their own beats follow
        if (base === 'boost' && /^Give/.test(mod.rules.actions[base]?.label ?? '')) { if (!mine) out.push({ kind: 'play', mine, ms: 700, card: e.card, text: `${who(e.player)} power${who(e.player) === 'You' ? '' : 's'} up ${mod.card.get(e.card)?.name ?? 'a card'} with ${(mod.manifest.theme as any)?.labels?.resources ?? 'a resource'}` }); break; }
        if (!mine) out.push({ kind: 'play', mine, ms: 1100, card: e.card, text: `${who(e.player)} ${label === 'play' || label === 'summon' ? 'play' + (who(e.player) === 'You' ? '' : 's') : label.replace(/^(\w+)/, '$1' + (who(e.player) === 'You' ? '' : 's'))} ${mod.card.get(e.card)?.name ?? 'a card'}` });
        break;
      }
      case 'attack': {
        flush();
        const a = e.o ?? e.attacker, t = e.t ?? e.target;
        battle = { a, t, mine, dmg: new Map(), dead: new Set(), deadCards: new Map() };
        out.push({ kind: 'attack', mine, ms: mine ? 700 : 1000, from: a, to: t, card: a ? cardOf(a) : undefined, text: `${name(a)} attacks ${name(t)}` });
        break;
      }
      case 'blocked': if (e.o) { out.push({ kind: 'block', mine: !(battle?.mine ?? false), ms: 800, from: e.o, to: battle?.a, text: `${name(e.o)} steps in to block!` }); if (battle) battle.t = e.o; } break;
      case 'damage':
        if (battle) battle.dmg.set(e.target, (battle.dmg.get(e.target) ?? 0) + e.amount);
        else if (/^p\d+$/.test(e.target)) out.push({ kind: 'hit', mine: e.target !== viewer, ms: 700, to: e.target, text: `${who(e.target)} take${who(e.target) === 'You' ? '' : 's'} ${e.amount} damage` });
        break;
      case 'destroyed':
        if (battle) { battle.dead.add(e.obj); if (e.card) battle.deadCards.set(e.obj, e.card); }
        else out.push({ kind: 'destroy', mine: e.controller !== viewer, ms: 800, card: e.card, text: `${mod.card.get(e.card)?.name ?? 'A card'} is destroyed` });
        break;
      case 'windowClosed': flush(); break;
      case 'stacked': if (e.ctrl && e.ctrl !== viewer && e.card) out.push({ kind: 'stack', mine: false, ms: 900, card: e.card, text: `${who(e.ctrl)} casts ${mod.card.get(e.card)?.name ?? 'something'}: you may respond` }); break;
      default:
        if (BEAT_EVENTS.has(e.type) && !battle) {
          const p = e.p ?? e.player;
          const zn = (z: string) => (mod.manifest.theme as any)?.labels?.[z] ?? 'a battlefield';
          const stl = (id: string) => (mod.manifest.theme as any)?.labels?.[`st_${id}`] ?? id;
          const s = who(p) === 'You' ? '' : 's';
          const text = e.type === 'quest' ? `${name(e.o)} quests for ${e.n}` : e.type === 'lifeLost' ? `${who(p)} lose${who(p) === 'You' ? '' : 's'} a life card` : e.type === 'prize' ? `${who(p)} take${who(p) === 'You' ? '' : 's'} ${(e.n ?? 1) > 1 ? `${e.n} prize cards` : 'a prize card'}`
            : e.type === 'conquer' ? `${who(p)} conquer${s} ${zn(e.z)} (+1 point)` : e.type === 'hold' ? `${who(p)} hold${s} ${zn(e.z)} (+1 point)` : e.type === 'deployed' ? `${who(p)} deploy${s} their leader`
              : e.type === 'showdownFight' ? `Fight at ${zn(e.z)}: ${e.a} might against ${e.b}!` : e.type === 'marched' ? `${who(p)} move${s} ${e.n} unit${e.n === 1 ? '' : 's'} into ${zn(e.z)}`
                : e.type === 'coin' ? `${who(p)} flip${s} a coin… ${e.heads ? 'Heads!' : 'Tails!'}` : e.type === 'status' ? `${name(e.o)} is now ${stl(e.s)}`
                : e.type === 'attackFailed' ? `${name(e.o)} is ${stl(e.s)}: the attack fails!` : e.type === 'evolved' ? `${name(e.o)} evolves!` : e.type === 'switched' ? `${who(p)} switch${who(p) === 'You' ? '' : 'es'} the active unit`
                : e.type === 'statusTick' ? `${name(e.o)} takes ${e.n} damage (${stl(e.s)})`
                : e.type === 'recalled' ? 'Both sides survive: the attackers fall back to base' : e.type === 'finalPoint' ? `${who(p)} can't win by conquest without scoring every battlefield this turn: draw${s} a card instead` : '';
          if (text) out.push({ kind: e.type === 'lifeLost' ? 'hit' : 'info', mine: p === viewer, ms: 800, text });
        } else if (e.type === 'lifeLost' && battle) battle.dmg.set(e.p, (battle.dmg.get(e.p) ?? 0) + 1);
    }
  }
  flush();
  return out;
}

/** Draws arrows for the current beat between table elements (cards by data-obj, players by data-player). */
export function drawArrows(root: HTMLElement, beat: { from?: string; to?: string } | null) {
  document.querySelector('svg.beat-arrows')?.remove();
  for (const el of root.querySelectorAll('.beat-src, .beat-dst')) el.classList.remove('beat-src', 'beat-dst');
  if (!beat?.from || !beat.to) return;
  const find = (id: string) => root.querySelector<HTMLElement>(/^p\d+$/.test(id) ? `[data-player="${id}"]` : `[data-obj="${id}"]`);
  const a = find(beat.from), b = find(beat.to);
  if (!a || !b) return;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const x1 = ra.left + ra.width / 2, y1 = ra.top + ra.height / 2, x2 = rb.left + rb.width / 2, y2 = rb.top + rb.height / 2;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'beat-arrows');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>`
    + `<path d="M${x1},${y1} Q${(x1 + x2) / 2 + (y2 - y1) * 0.15},${(y1 + y2) / 2 - Math.abs(x2 - x1) * 0.15} ${x2},${y2}" marker-end="url(#ah)"/>`;
  document.body.append(svg);
  a.classList.add('beat-src');
  b.classList.add('beat-dst');
}
