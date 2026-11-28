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
  results?: string[]; // what a played card or ability did (damage, destroyed, drew, +stats...)
  targets?: string[]; // objects or players it chose or affected, highlighted (and hit by a bolt) while the beat plays
  dying?: string[]; // objects destroyed in this beat (they burn away on the table)
  mine: boolean; // caused by the viewer
  ms: number;
  at?: number;
}
type Ev = Record<string, any>;
const ICON: Record<Beat['kind'], string> = { play: '✦', attack: '⚔', block: '🛡', clash: '💥', hit: '♥', destroy: '✖', info: '•', stack: '⧗' };
export const beatIcon = (k: Beat['kind']) => ICON[k];
const BEAT_EVENTS = new Set(['quest', 'lifeLost', 'prize', 'conquer', 'hold', 'deployed', 'showdownFight', 'hit', 'marched', 'recalled', 'finalPoint', 'coin', 'status', 'attackFailed', 'evolved', 'switched', 'statusTick', 'dice', 'rolled', 'synchro', 'xyz', 'linkSummon', 'fusion', 'ritual', 'pendulum', 'hidden', 'burnOut', 'shifted', 'locLore', 'movedTo', 'vanished', 'checkFail', 'stunned', 'blockFailed', 'stolen', 'scoredAgenda', 'flatline', 'runEnded', 'rezzed', 'run', 'clock', 'overheat', 'aged', 'comeback']);

/** Beats for a slice of the viewer's events. `who(p)` names a player ("You" / "Opponent"). */
export function beatsOf(events: Ev[], mod: Mod, viewer: string, who: (p: string) => string, cardOf: (id: string) => string | undefined): Beat[] {
  const out: Beat[] = [];
  const name = (id?: string) => (!id ? 'something' : /^p\d+$/.test(id) ? who(id) : mod.card.get(cardOf(id) ?? '')?.name ?? 'a card');
  let battle: { a?: string; t?: string; mine: boolean; dmg: Map<string, number>; dead: Set<string>; deadCards: Map<string, string>; multi?: boolean } | null = null;
  const flush = () => {
    if (!battle) return;
    const { a, t, dmg, dead, deadCards } = battle;
    if (battle.multi) {
      const lost = [...dmg].filter(([k]) => /^p\d+$/.test(k)).map(([k, n]) => `${who(k)} take${who(k) === 'You' ? '' : 's'} ${n}`);
      const outcome = [...dead].map((d) => `${mod.card.get(cardOf(d) ?? deadCards.get(d) ?? '')?.name ?? 'A card'} is destroyed`);
      if (lost.length || outcome.length) out.push({ kind: 'clash', mine: battle.mine, ms: 1700, dying: [...dead], text: [...lost, ...outcome].join(', ') || 'Combat is over' });
      battle = null;
      return;
    }
    const side = (id?: string, other?: string) => (id && !/^p\d+$/.test(id) ? { card: cardOf(id) ?? deadCards.get(id) ?? '', dealt: other ? dmg.get(other) ?? 0 : 0, took: dmg.get(id) ?? 0, dead: dead.has(id) } : undefined);
    const anything = dmg.size > 0 || dead.size > 0;
    if (anything) {
      const sa = side(a, t), sb = side(t, a);
      const outcome = [...dead].map((d) => `${mod.card.get(cardOf(d) ?? deadCards.get(d) ?? '')?.name ?? 'A card'} is destroyed`).join(', ');
      const playerHit = t && /^p\d+$/.test(t) ? dmg.get(t) : undefined;
      out.push({ kind: 'clash', mine: battle.mine, ms: 1700, dying: [...dead], clash: { a: sa, b: sb, ...(playerHit ? { player: t, playerTook: playerHit } : {}) },
        text: outcome || (playerHit ? `${who(t!)} take${who(t!) === 'You' ? '' : 's'} ${playerHit} damage` : 'The battle is over') });
    }
    battle = null;
  };
  // the latest play collects what it did until the next action, phase or battle
  let play: (Beat & { results: string[]; src?: string; hitP: Set<string>; drew: Map<string, number>; targets: string[]; dying: string[] }) | null = null;
  const touch = (id?: string) => { if (play && id && id !== play.src && !play.targets.includes(id)) { play.targets.push(id); play.to ??= id; } };
  const labels = ((mod.manifest.theme as any)?.labels ?? {}) as Record<string, string>;
  const hidden = new Set<string>(((mod.manifest.theme as any)?.hideVars ?? []) as string[]);
  const statName = (k: string) => labels[k] ?? k;
  const closePlay = () => {
    if (!play) return;
    for (const [p, n] of play.drew) play.results.push(`${who(p)} draw${who(p) === 'You' ? '' : 's'} ${n === 1 ? 'a card' : `${n} cards`}`);
    if (play.results.length) play.ms += Math.min(900, play.results.length * 250);
    play = null;
  };
  const result = (line: string) => { if (play && !play.results.includes(line) && play.results.length < 6) play.results.push(line); };
  const boardZone = (z?: string) => !!z && !['deck', 'hand', 'grave', 'limbo', 'look', 'banished', 'resdeck', 'life', 'prizes', 'void'].includes(z);
  for (const e of events) {
    const mine = (e.player ?? e.p) === viewer;
    if (play && !battle) {
      if (e.type === 'damage') { touch(e.target); result(/^p\d+$/.test(e.target) ? `${who(e.target)} take${who(e.target) === 'You' ? '' : 's'} ${e.amount} damage` : `${name(e.target)} takes ${e.amount} damage`); if (/^p\d+$/.test(e.target)) play.hitP.add(e.target); continue; }
      if (e.type === 'destroyed') { touch(e.obj); if (e.obj) play.dying.push(e.obj); result(`${mod.card.get(e.card)?.name ?? 'A card'} is destroyed`); continue; }
      if (e.type === 'modified' && e.mods && e.targets) { for (const t of e.targets) touch(t); for (const t of e.targets) for (const md of e.mods) result(`${name(t)} ${md.value >= 0 ? '+' : ''}${md.value} ${statName(md.stat)}`); continue; }
      if (e.type === 'moved' && e.to === 'hand' && e.from === 'deck' && e.toPlayer) { play.drew.set(e.toPlayer, (play.drew.get(e.toPlayer) ?? 0) + 1); continue; }
      if (e.type === 'moved' && e.to === 'hand' && boardZone(e.from)) { touch(e.obj); result(`${mod.card.get(e.card)?.name ?? 'A card'} returns to hand`); continue; }
      if (e.type === 'moved' && e.to === 'grave' && e.from === 'hand' && e.obj !== play.src) { result(`${who(e.fromPlayer)} discard${who(e.fromPlayer) === 'You' ? '' : 's'} ${mod.card.get(e.card)?.name ?? 'a card'}`); continue; }
      if (e.type === 'created' && e.card) { result(`${mod.card.get(e.card)?.name ?? 'A token'} appears`); continue; }
      if (e.type === 'moved' && e.from === 'deck' && e.to !== 'hand' && e.to !== 'grave' && e.obj !== play.src) { result(`${e.card ? mod.card.get(e.card)?.name ?? 'A card' : 'A card'} goes from the deck to ${labels[e.to] ?? e.to}`); continue; }
      if (e.type === 'moved' && e.from === 'deck' && e.to === 'grave') { result(`${who(e.fromPlayer)} mill${who(e.fromPlayer) === 'You' ? '' : 's'} ${e.card ? mod.card.get(e.card)?.name ?? 'a card' : 'a card'}`); continue; }
      if (e.type === 'moved' && e.to === 'banished' && e.obj !== play.src) { result(`${mod.card.get(e.card)?.name ?? 'A card'} is banished`); continue; }
      if (e.type === 'changed' && /^p\d+$/.test(e.ref) && !hidden.has(e.name) && e.name !== 'ap' && typeof e.to === 'number' && typeof e.from === 'number') {
        const d = e.to - e.from;
        if (d && !(e.name === 'life' && play.hitP.has(e.ref)) && !(String(e.name).startsWith('mana:') && d < 0)) result(`${who(e.ref)}: ${d > 0 ? '+' : ''}${d} ${statName(e.name)}`);
        continue;
      }
      if (e.type === 'changed' && e.name === 'ex' && e.to === 1 && e.ref !== play.src && !/^p\d+$/.test(e.ref)) { touch(e.ref); result(`${name(e.ref)} is exhausted`); continue; }
    }
    if (['action', 'phase', 'attack', 'windowOpened', 'turnEnd'].includes(e.type)) closePlay();
    switch (e.type) {
      case 'action': {
        if (e.action === 'pass' || !e.card) break;
        const base = String(e.action).split('#')[0];
        const label = (mod.rules.actions[base]?.label ?? base).toLowerCase();
        if (/attack|move|march|quest/i.test(base)) break; // their own beats follow
        if (base === 'boost' && /^Give/.test(mod.rules.actions[base]?.label ?? '')) { if (!mine) out.push({ kind: 'play', mine, ms: 700, card: e.card, text: `${who(e.player)} power${who(e.player) === 'You' ? '' : 's'} up ${mod.card.get(e.card)?.name ?? 'a card'}` }); break; }
        const verb = label === 'play' || label === 'summon' || label === 'cast' ? 'play' : label.split(' ')[0];
        const rest = label === 'play' || label === 'summon' || label === 'cast' ? '' : label.split(' ').slice(1).join(' ').replace(/\([^)]*\)/g, '').trim();
        const you = who(e.player) === 'You';
        const targets = Object.values((e.targets ?? {}) as Record<string, string[]>).flat().filter((t) => typeof t === 'string');
        const tgt = targets.length ? ` → ${targets.map((t) => name(t)).join(', ')}` : '';
        play = { kind: 'play', mine, ms: mine ? 1100 : 1700, card: e.card, results: [], src: e.source ?? undefined, hitP: new Set(), drew: new Map(), dying: [],
          targets, from: e.source ?? undefined, to: targets[0],
          text: `${who(e.player)} ${verb}${you ? '' : /(s|sh|ch|x)$/.test(verb) ? 'es' : 's'} ${mod.card.get(e.card)?.name ?? 'a card'}${rest ? ` ${rest}` : ''}${tgt}` };
        out.push(play);
        break;
      }
      case 'attack': {
        if (battle && !battle.dmg.size && !battle.dead.size && battle.mine === mine) { battle.multi = true; out.push({ kind: 'attack', mine, ms: 1000, from: e.o ?? e.attacker, to: e.t ?? e.target, card: e.o ? cardOf(e.o) : undefined, text: `${name(e.o ?? e.attacker)} attacks ${name(e.t ?? e.target)}` }); break; }
        flush();
        const a = e.o ?? e.attacker, t = e.t ?? e.target;
        battle = { a, t, mine, dmg: new Map(), dead: new Set(), deadCards: new Map() };
        out.push({ kind: 'attack', mine, ms: 1200, from: a, to: t, targets: t ? [t] : [], card: a ? cardOf(a) : undefined, text: `${name(a)} attacks ${name(t)}` });
        break;
      }
      case 'blocked': if (e.o) { out.push({ kind: 'block', mine: !(battle?.mine ?? false), ms: 800, from: e.o, to: e.a ?? battle?.a, text: `${name(e.o)} blocks ${e.a ? name(e.a) : 'the attack'}!` }); if (battle && !e.a) battle.t = e.o; } break;
      case 'blockAsk': if (e.p === viewer) out.push({ kind: 'block', mine: true, ms: 500, from: e.a, text: `Choose blockers for ${name(e.a)}` }); break;
      case 'damage':
        if (battle) battle.dmg.set(e.target, (battle.dmg.get(e.target) ?? 0) + e.amount);
        else if (/^p\d+$/.test(e.target)) out.push({ kind: 'hit', mine: e.target !== viewer, ms: 700, to: e.target, text: `${who(e.target)} take${who(e.target) === 'You' ? '' : 's'} ${e.amount} damage` });
        break;
      case 'destroyed':
        if (battle) { battle.dead.add(e.obj); if (e.card) battle.deadCards.set(e.obj, e.card); }
        else out.push({ kind: 'destroy', mine: e.controller !== viewer, ms: 1100, dying: e.obj ? [e.obj] : [], card: e.card, text: `${mod.card.get(e.card)?.name ?? 'A card'} is destroyed` });
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
                : e.type === 'hidden' ? `${who(p)} hide${s} a card at ${zn(e.z)}…` : e.type === 'burnOut' ? `${who(p)} burn${s} out! (+1 point to the opponent)`
                : ['synchro', 'xyz', 'linkSummon', 'fusion', 'ritual', 'pendulum'].includes(e.type) ? `${who(p)} ${e.type === 'linkSummon' ? 'link' : e.type} summon${s}!`
                : e.type === 'dice' ? `🎲 ${who(p)} roll${s} a d${e.sides}… ${e.value}!` : e.type === 'rolled' ? (e.dice > 1 ? `🎲 Total: ${e.total}` : '')
                : e.type === 'coin' ? `${who(p)} flip${s} a coin… ${e.heads ? 'Heads!' : 'Tails!'}` : e.type === 'status' ? `${name(e.o)} is now ${stl(e.s)}`
                : e.type === 'attackFailed' ? `${name(e.o)} is ${stl(e.s)}: the attack fails!` : e.type === 'evolved' ? `${name(e.o)} evolves!` : e.type === 'switched' ? `${who(p)} switch${who(p) === 'You' ? '' : 'es'} the active unit`
                : e.type === 'statusTick' ? `${name(e.o)} takes ${e.n} damage (${stl(e.s)})`
                : e.type === 'shifted' ? `${name(e.o)} shifts in!` : e.type === 'locLore' ? `${name(e.o)}: +${e.n} point${e.n === 1 ? '' : 's'}` : e.type === 'movedTo' ? `${name(e.o)} moves to ${name(e.loc)}`
                : e.type === 'vanished' ? `${name(e.o)} vanishes!` : e.type === 'clock' ? `It is now ${((mod.manifest.theme as any)?.clock ?? [])[e.n] ?? 'a new time'}` : e.type === 'overheat' ? `${who(p)} overheat${s}!`
                : e.type === 'aged' ? `${name(e.o)} crumbles with age!` : e.type === 'comeback' ? `${who(p)} get${s} a comeback bonus`
                : e.type === 'stolen' ? `${who(p)} steal${s} a scheme! (+${e.n})` : e.type === 'scoredAgenda' ? `${who(p)} score${s} a scheme! (+${e.n})` : e.type === 'flatline' ? `${who(p)} flatlined!`
                : e.type === 'runEnded' ? 'The run is stopped!' : e.type === 'rezzed' ? `${name(e.o)} awakens!` : e.type === 'run' ? `${who(p)} start${s} a run…`
                : e.type === 'checkFail' ? `${who(p)} fail${s} a check — turn over!` : e.type === 'stunned' ? `Stunned! ${e.n} foundation${e.n === 1 ? '' : 's'} committed` : e.type === 'blockFailed' ? 'The block slips!'
                : e.type === 'recalled' ? 'Both sides survive: the attackers fall back to base' : e.type === 'finalPoint' ? `${who(p)} can't win by conquest without scoring every battlefield this turn: draw${s} a card instead` : '';
          if (text) out.push({ kind: e.type === 'lifeLost' ? 'hit' : 'info', mine: p === viewer, ms: 800, text });
        } else if (e.type === 'lifeLost' && battle) battle.dmg.set(e.p, (battle.dmg.get(e.p) ?? 0) + 1);
    }
  }
  closePlay();
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
