// Compiles a Game Maker blueprint into an engine module (manifest, rules, cards, decks, AI hints).
// The blueprint picks systems (resources, combat, winning, turn) and the compiler writes the DSL for each one.
import type { ModuleDef } from '#engine';
import { ENGINE_API } from '#engine';
import type { Ability, Blueprint, CardBP, Cond, Effect, Filter, Role, TargetKind } from './blueprint.ts';
import { normalize } from './blueprint.ts';

type X = unknown;
// ---------------------------------------------------------------- DSL helpers
const L = (x: X) => ['lit', x];
const g = (r: X, k: string) => ['get', r, k];
const eq = (a: X, b: X) => ['=', a, b];
const ne = (a: X, b: X) => ['!=', a, b];
const lt = (a: X, b: X) => ['<', a, b];
const le = (a: X, b: X) => ['<=', a, b];
const gt = (a: X, b: X) => ['>', a, b];
const ge = (a: X, b: X) => ['>=', a, b];
const AND = (...a: X[]) => (a.length === 1 ? a[0] : ['and', ...a]);
const OR = (...a: X[]) => (a.length === 1 ? a[0] : ['or', ...a]);
const NOT = (a: X) => ['not', a];
const Q = (c: X, a: X, b: X) => ['?', c, a, b];
const add = (...a: X[]) => ['+', ...a];
const sub = (a: X, b: X) => ['-', a, b];
const mul = (a: X, b: X) => ['*', a, b];
const mn = (a: X, b: X) => ['min', a, b];
const mx = (a: X, b: X) => ['max', a, b];
const cnt = (l: X) => ['count', l];
const flt = (l: X, p: X) => ['filter', l, p];
const ANY = (l: X, p: X) => ['any', l, p];
const SUM = (l: X, e: X) => ['sum', l, e];
const first = (l: X) => ['first', l];
const cards = (p: X, z: string) => ['cards', p, z];
const has = (o: X, k: string) => ['has', o, k];
const isObj = (x: X) => ['isObj', x];
const isP = (x: X) => ['isPlayer', x];
const inl = (x: X, l: X[]) => ['in', x, L(l)];
const IF = (c: X, t: X[], e?: X[]) => (e ? ['if', c, t, e] : ['if', c, t]);
const EACH = (l: X, v: string, b: X[]) => ['each', l, v, b];
const LET = (v: string, e: X) => ['let', v, e];
const SET = (r: X, k: string, v: X) => ['set', r, k, v];
const INC = (r: X, k: string, d: X) => ['inc', r, k, d];
const C = (name: string, ...a: X[]) => ['call', name, ...a];
const choose = (o: Record<string, X>) => ['choose', o];
const emit = (t: string, d: Record<string, X>) => ['emit', t, d];
const def = (o: X, f: string) => ['def', o, f];
const ctrl = (o: X) => g(o, 'controller');
const seat = (p: X) => g(p, 'seat');
const range = (n: X) => ['range', n];
const cat = (...l: X[]) => (l.length === 1 ? l[0] : ['concat', ...l]);

export const UNIT_ROLES: Role[] = ['unit', 'evolution', 'extra', 'token'];
const SPELLISH: Role[] = ['spell', 'fast', 'trap', 'attack'];
const slug = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

/** Everything the compiler derives once from a blueprint. */
export function context(bp0: Blueprint) {
  const bp = normalize(bp0);
  const c = bp.combat, r = bp.resource;
  const roleOf = new Map(bp.types.map((t) => [t.id, t.role]));
  const typesOf = (...roles: Role[]) => bp.types.filter((t) => roles.includes(t.role)).map((t) => t.id);
  const hasRole = (...roles: Role[]) => typesOf(...roles).length > 0;
  const lanes = c.mode === 'lanes' ? c.lanes.map((_, i) => `lane${i + 1}`) : [];
  const arenas = c.arenas?.length && !['duel', 'lanes'].includes(c.mode) ? c.arenas : null;
  const grid = !!c.grid && (c.mode === 'block' || c.mode === 'target') && !arenas;
  const emz = grid && !!c.emz;
  const UZ = c.mode === 'duel' ? ['active', 'bench'] : c.mode === 'lanes' ? ['base', ...lanes] : arenas ? arenas.map((a) => a.id) : emz ? ['field', 'emz'] : ['field'];
  const atkZ = arenas && arenas.some((a) => a.attack) ? arenas.filter((a) => a.attack).map((a) => a.id) : UZ;
  const main = bp.turn.filter((p) => p.kind === 'main').map((p) => p.id);
  const combatP = bp.turn.filter((p) => p.kind === 'combat').map((p) => p.id);
  const endP = bp.turn.find((p) => p.kind === 'end')?.id ?? 'end';
  const battle = c.mode === 'block' || c.mode === 'target' || c.mode === 'cards';
  const pool = ['ramp', 'cards', 'anycard', 'deck', 'bank'].includes(r.mode);
  const colorIds = bp.colors.map((k) => k.id);
  const leader = bp.setup.leader || hasRole('leader');
  const kw = new Map(bp.keywords.map((k) => [k.id, k]));
  const conq = c.mode === 'lanes' && !!c.conquest;
  const duals = [...new Set(bp.cards.filter((k) => roleOf.get(k.type) === 'resource' && k.color && k.color2).map((k) => [k.color!, k.color2!].sort().join('_')))];
  return {
    check: r.mode === 'check', zonesC: c.mode === 'cards' && !!c.zones, CK: r.checkStat ?? 'check', runs: c.mode === 'runs', sides: !!bp.setup.sides,
    bp, c, r, conq, duals, grid, emz, recycle: r.mode === 'deck' && !!r.recycle, sites: c.mode === 'lanes' && (bp.setup.sites ?? 0) > 0 && hasRole('battlefield'), roleOf, typesOf, hasRole, lanes, arenas, UZ, atkZ, main: main.length ? main : ['main'], combatP, endP, battle, pool, colorIds, leader, kw,
    atkPhases: combatP.length ? combatP : main.length ? main : ['main'],
    fast: [...new Set([...(main.length ? main : ['main']), ...combatP, ...(battle || conq ? ['respond'] : []), ...(c.mode === 'block' && c.mass ? ['respond2'] : [])])],
    POW: c.power, HP: c.health, DEF: c.defense,
    life: bp.win.life > 0, lifeCards: bp.win.lifeCards > 0 || (leader && bp.cards.some((k) => roleOf.get(k.type) === 'leader' && (k.stats.life ?? 0) > 0)),
    prizes: bp.win.prizes > 0, points: bp.win.points > 0 || c.mode === 'lanes' || !!c.quest,
    kwKey: (id: string) => { const w = kw.get(id); return w && w.rule !== 'none' ? w.rule : id; },
    hasRule: (rule: string) => bp.keywords.some((k) => k.rule === rule),
  };
}
type Ctx = ReturnType<typeof context>;

const units = (x: Ctx, p: X, zones: string[] = x.UZ) => cat(...zones.map((z) => cards(p, z)));
const unitsOf = units;
const allUnits = (x: Ctx) => units(x, '*');
// resources in play; games without resource cards count the player's turns instead
const resCount = (x: Ctx, p: X) => (x.r.mode === 'ramp' ? g(p, 'cap') : ['cards', 'anycard', 'deck'].includes(x.r.mode) ? cnt(cards(p, 'resources')) : g(p, 'turns'));

// ---------------------------------------------------------------- rules text
const TGT_TEXT: Record<TargetKind, string> = {
  self: 'this', enemyUnit: 'an enemy unit', anyUnit: 'a unit', ownUnit: 'one of your units', otherOwnUnit: 'another of your units', enemyAny: 'an enemy unit or the opponent',
  opponent: 'the opponent', you: 'you', eachPlayer: 'each player', allEnemyUnits: 'each enemy unit', allUnits: 'each unit', allOwnUnits: 'each of your units',
  randomEnemyUnit: 'a random enemy unit', attacker: 'the attacker', battleTarget: 'the card being attacked', ownLeader: 'your leader', ownAny: 'your leader or one of your units',
};
const nm = (bp: Blueprint, list: 'stats' | 'types' | 'colors' | 'keywords' | 'counters' | 'statuses', id: string | undefined) => ((bp as any)[list] ?? []).find((s: any) => s.id === id)?.name ?? id ?? '';
export function filterText(f: Filter | undefined, bp: Blueprint): string {
  if (!f) return '';
  const bits: string[] = [];
  if (f.exhausted) bits.push('exhausted');
  if (f.color) bits.push(nm(bp, 'colors', f.color));
  if (f.type) bits.push(nm(bp, 'types', f.type));
  const tail: string[] = [];
  if (f.keyword) tail.push(`with ${nm(bp, 'keywords', f.keyword)}`);
  if (f.stat && f.val !== undefined) tail.push(`with ${f.val} or ${f.op === 'ge' ? 'more' : 'less'} ${nm(bp, 'stats', f.stat)}`);
  if (f.name) tail.push(`named ${f.name}`);
  if (f.trait) bits.push(`{${f.trait}}`);
  if (f.status) tail.push(`that is ${nm(bp, 'statuses', f.status)}`);
  if (f.adjacent) tail.push('next to this'); if (f.opposite) tail.push('facing this'); if (f.pointed) tail.push('this points to'); if (f.here) tail.push('here');
  if (f.zone) tail.push(`in ${zoneName(bp, f.zone)}`);
  return [bits.length ? `(${bits.join(' ')})` : '', ...tail].filter(Boolean).join(' ');
}
const zoneName = (bp: Blueprint, z: string) => bp.zones?.find((k) => k.id === z)?.name ?? bp.zoneNames[z] ?? ({ grave: 'the discard pile', hand: 'hand', deck: 'the deck', banished: 'the banished pile', resources: 'resources' } as Record<string, string>)[z] ?? z;
export function effectText(e: Effect, bp: Blueprint): string {
  const n = e.kw || e.fromRoll ? 'X' : String(e.n ?? 1);
  const ft = filterText(e.filter, bp);
  const t = TGT_TEXT[e.target ?? 'enemyUnit'] + (ft ? ` ${ft}` : '');
  const stat = nm(bp, 'stats', e.stat) || 'power';
  const who = e.who === 'opp' ? 'the opponent' : e.who === 'each' ? 'each player' : 'you';
  const card = bp.cards.find((k) => k.id === e.card)?.name ?? 'token';
  const type = bp.types.find((k) => k.id === e.type)?.name ?? 'card';
  const counter = nm(bp, 'counters', e.card) || 'counter';
  const xs = e.fromRoll ? ' (X = the roll)' : e.kw ? ` (X = its ${nm(bp, 'keywords', e.kw)} value)` : '';
  const body = ((): string => {
    switch (e.k) {
      case 'draw': return e.who === 'opp' ? `the opponent draws ${n}` : e.who === 'each' ? `each player draws ${n}` : `draw ${n === '1' ? 'a card' : `${n} cards`}`;
      case 'damage': return `deal ${n} damage to ${t}`;
      case 'heal': return `heal ${n} from ${t}`;
      case 'buff': return `${t} gets ${n.startsWith('-') ? '' : '+'}${n} ${stat}${e.until === 'forever' ? '' : e.until === 'battle' ? ' during this battle' : ' until end of turn'}`;
      case 'destroy': return `destroy ${t}`;
      case 'bounce': return `return ${t} to its owner's hand`;
      case 'exhaust': return `exhaust ${t}`;
      case 'ready': return `ready ${t}`;
      case 'token': return `create ${n === '1' ? 'a' : n} ${card} token${n === '1' ? '' : 's'}`;
      case 'gain': return `gain ${n} ${bp.resource.recycle ? 'energy' : bp.resource.name}`;
      case 'discard': return `${who === 'you' ? 'discard' : `${who} discards`} ${n} card${n === '1' ? '' : 's'}`;
      case 'mill': return `${who === 'you' ? 'put' : `${who} puts`} the top ${n} of ${who === 'you' ? 'your' : 'their'} deck into the discard pile`;
      case 'search': return `put a ${type} from your deck into your hand, then shuffle`;
      case 'recover': return `return a ${type} from your discard pile to your hand`;
      case 'counter': return 'cancel the opponent\'s last spell or ability';
      case 'lifeGain': return `gain ${n} life`;
      case 'lifeLoss': return `${who === 'you' ? 'lose' : `${who} loses`} ${n} life`;
      case 'score': return e.who === 'opp' ? `your opponent loses ${n} point${n === '1' ? '' : 's'}` : `score ${n} point${n === '1' ? '' : 's'}`;
      case 'addLife': return `add the top ${n} card${n === '1' ? '' : 's'} of your deck to your life`;
      case 'aura': return `${TGT_TEXT[e.target ?? 'allOwnUnits'].replace(/^each/, 'all')}${ft ? ` ${ft}` : ''} get${e.target === 'self' ? 's' : ''} +${n} ${stat}`;
      case 'addCounter': return `put ${n} ${counter} counter${n === '1' ? '' : 's'} on ${t}`;
      case 'removeCounter': return `remove ${n} ${counter} counter${n === '1' ? '' : 's'} from ${t}`;
      case 'strike': return `attack the opponent with ${n} power`;
      case 'deploy': return 'put this into play as a unit';
      case 'restrict': { const r = e.rule ?? 'noAttack'; const what = r === 'noAttack' ? "can't attack" : r === 'noBlock' ? "can't block" : r === 'noBeAttacked' ? "can't be attacked" : r === 'unblockable' ? "can't be blocked"
        : r === 'entersExhausted' ? 'enters play exhausted' : `has ${nm(bp, 'keywords', bp.keywords.find((k) => k.rule === r)?.id) || r}`;
        return `${TGT_TEXT[e.target ?? 'enemyUnit'].replace(/^each/, 'all')}${ft ? ` ${ft}` : ''} ${what}${e.until === 'turn' ? ' until end of turn' : ''}`; }
      case 'prevent': return `damage dealt to ${TGT_TEXT[e.target ?? 'allOwnUnits'].replace(/^each/, 'all')}${ft ? ` ${ft}` : ''} is reduced by ${n}`;
      case 'costMod': return `your ${e.type ? type : 'card'}s cost ${n} less`;
      case 'moveTo': return e.zone === 'banished' ? `banish ${t}` : `put ${t} ${e.zone === 'deck' ? 'on the bottom of its owner\'s deck' : `into ${zoneName(bp, e.zone ?? 'grave')}`}`;
      case 'insteadDestroy': return `if this would be destroyed, ${e.to === 'deck' ? 'put it on the bottom of your deck' : 'return it to your hand'} instead`;
      case 'dig': return `look at the top ${n} cards of your deck; reveal up to 1 ${ft ? `${ft} ` : ''}${e.type ? type : 'card'} and add it to your hand, then put the rest on the bottom`;
      case 'putIntoPlay': return `play up to 1 ${ft ? `${ft} ` : ''}${e.type ? type : 'unit'} from your ${e.zone === 'grave' ? 'discard pile' : 'hand'} for free`;
      case 'addRes': return `add ${n} ${bp.resource.name} from your ${bp.resource.name} deck (spent this turn)`;
      case 'readyRes': return `set up to ${n} spent ${bp.resource.name} active again`;
      case 'giveRes': return `give ${t} up to ${n} spent ${bp.resource.name}`;
      case 'lifeToHand': return `add the top ${n === '1' ? 'card' : `${n} cards`} of your life to your hand`;
      case 'handToLife': return 'you may put a card from your hand on top of your life';
      case 'inflict': { const st = bp.statuses?.find((s) => s.id === e.status); return `${t} becomes ${st?.name ?? 'affected'}${st?.stacks && n !== '1' ? ` (${n})` : ''}`; }
      case 'cure': return `${t} recovers from ${e.status ? nm(bp, 'statuses', e.status) : 'every status'}`;
      case 'flip': {
        const hs = (e.heads ?? []).map((f) => effectText(f, bp)).join(', then '), ts = (e.tails ?? []).map((f) => effectText(f, bp)).join(', then ');
        const c = e.n ?? 1;
        return c === 1 ? `flip a coin${hs ? `: if heads, ${hs}` : ''}${ts ? `${hs ? ';' : ':'} if tails, ${ts}` : ''}`
          : e.perHeads ? `flip ${c} coins: for each heads, ${hs || 'nothing happens'}` : `flip ${c} coins${hs ? `: if all are heads, ${hs}` : ''}${ts ? `; otherwise ${ts}` : ''}`;
      }
      case 'fusion': return `fusion summon from your extra deck${ft ? ` a ${ft} unit` : ''}, sending its listed materials from your hand or board to the discard pile`;
      case 'ritual': return `ritual summon a ritual unit from your hand, sending units from your hand or board whose levels total at least its level`;
      case 'roll': {
        const dice = `${(e.n ?? 1) === 1 ? 'a' : e.n} ${e.sides ?? 6}-sided ${(e.n ?? 1) === 1 ? 'die' : 'dice'}`;
        const rs = (e.ranges ?? []).map((r) => `on ${r.min === r.max ? r.min : `${r.min}–${r.max}`}, ${r.do.map((f) => effectText(f, bp)).join(', then ') || 'nothing happens'}`);
        const th = (e.then ?? []).map((f) => effectText(f, bp)).join(', then ');
        return `roll ${dice}${rs.length ? `: ${rs.join('; ')}` : ''}${th ? `${rs.length ? '; then' : ', then'} ${th}` : ''}`;
      }
      case 'switch': return e.who === 'opp' ? "switch one of your opponent's benched units with their active unit" : 'switch your active unit with one of your benched units';
      case 'tutor': return `search your deck for up to ${n} ${ft ? `${ft} ` : ''}${e.type ? type : 'card'}${n === '1' ? '' : 's'}, put ${n === '1' ? 'it' : 'them'} ${e.to === 'play' ? 'into play' : 'into your hand'}, then shuffle`;
      case 'attachFrom': return `attach a ${ft ? `${ft} ` : ''}${bp.resource.name} card from your ${zoneName(bp, e.zone ?? 'deck')} to ${t}`;
      case 'drawTo': return `draw until you have ${n} cards in hand`;
      case 'endRun': return 'end the run';
      case 'wound': return `deal ${n} wound${n === '1' ? '' : 's'} (random discards from hand; more than the hand flatlines)`;
      case 'tag': return `give your opponent ${n} tag${n === '1' ? '' : 's'}`;
      case 'drops': return `gain ${n} saved ${bp.resource.name} (spend each for 1 ${bp.resource.name} on any turn)`;
      case 'fight': return `one of your units fights ${t} (each deals damage equal to its power to the other)`;
      case 'surveil': return `look at the top ${n === '1' ? 'card' : `${n} cards`} of your deck; you may put ${n === '1' ? 'it' : 'any of them'} into your discard pile`;
      case 'skipEvolve': return 'evolve one of your units straight to a card two stages above it from your hand';
      case 'scry': return n === '1' ? 'look at the top card of your deck; you may put it on the bottom' : `look at the top ${n} cards of your deck one by one; you may put any on the bottom`;
      case 'win': return 'you win the game';
      case 'raw': return '(custom script)';
    }
  })();
  return body + xs;
}
const WHEN_TEXT: Record<string, string> = {
  play: 'When played: ', access: 'When accessed: ', leave: 'When destroyed: ', attack: 'When this attacks: ', hit: 'When this hits the opponent: ', quest: 'When this quests: ',
  startTurn: 'At the start of your turn: ', endTurn: 'At the end of your turn: ', static: '', opAttack: 'Spring when an enemy attacks: ',
  conquer: 'When you conquer here: ', hold: 'When you hold here: ', block: 'When this blocks: ', flip: 'FLIP: ', castSpell: 'Whenever you cast a spell: ', landfall: 'Whenever a resource enters under your control: ',
};
const condText = (k: Cond | undefined, bp: Blueprint) => !k ? '' : k.k === 'units' ? `if you control ${k.n ?? 1} or more units, ` : k.k === 'life' ? `if you have ${k.n ?? 5} or less life, `
  : k.k === 'hand' ? `if you have ${k.n ?? 0} or fewer cards in hand, ` : k.k === 'yourTurn' ? 'during your turn, ' : k.k === 'res' ? `if you have ${k.n ?? 1} or more ${bp.resource.name}, `
    : k.k === 'counter' ? `if this has ${k.n ?? 1} or more ${nm(bp, 'counters', k.counter)} counters, ` : k.k === 'zone' ? `if you have ${k.n ?? 1} or more cards in ${zoneName(bp, k.zone ?? 'grave')}, `
      : k.k === 'played' ? `if you played ${(k.n ?? 1) === 1 ? 'another card' : `${k.n} other cards`} this turn, `
        : k.k === 'attached' ? `if this has ${k.n ?? 1} or more ${bp.resource.name} given to it, ` : k.k === 'oppTurn' ? 'during your opponent\'s turn, '
          : k.k === 'oppLife' ? `if your opponent has ${k.n ?? 2} or less life, ` : k.k === 'status' ? `if this is ${nm(bp, 'statuses', k.status)}, ` : k.k === 'kicked' ? 'if it was kicked, ' : k.k === 'linked' ? 'if this is linked, ' : k.k === 'charged' ? `if this has ${k.n ?? 1} or more charge, ` : k.k === 'under' ? `if this has ${k.n ?? 1} or more cards under it, ` : k.k === 'attacking' ? 'while you are attacking, ' : k.k === 'defending' ? 'while you are being attacked, ' : k.k === 'here' ? 'while this is at a location (or a location has a unit here), ' : 'if the custom condition holds, ';
/** Servers in an asymmetric runs game: three central servers and N remotes, each with an ICE zone (outermost last). */
export function runServers(bp: Blueprint): { name: string; ice: string; access: 'hq' | 'rd' | 'arc' | 'remote'; content?: string }[] {
  const z = bp.zoneNames ?? {};
  return [{ name: z.server_hq ?? 'HQ', ice: 'ice_hq', access: 'hq' }, { name: z.server_rd ?? 'R&D', ice: 'ice_rd', access: 'rd' }, { name: z.server_arc ?? 'Archives', ice: 'ice_arc', access: 'arc' },
    ...Array.from({ length: Math.max(1, bp.combat.remotes ?? 3) }, (_, i) => ({ name: z[`srv${i + 1}`] ?? `Remote ${i + 1}`, ice: `ice_r${i + 1}`, access: 'remote' as const, content: `srv${i + 1}` }))];
}
/** A card's character name: the part before " - " ("Red Riding Hood - Wolf Hunter" -> "Red Riding Hood"). */
export const baseName = (n: string) => n.split(/\s+[-–—]\s+/)[0].trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function costText(a: Ability, bp: Blueprint): string {
  const give = bp.resource.give;
  return [a.detach && `detach ${a.detach}`, a.loyalty !== undefined && `${a.loyalty >= 0 ? '+' : ''}${a.loyalty} loyalty`, a.sacSelf && 'Sacrifice this', a.tap && 'Exhaust', a.cost && (give ? `rest ${a.cost} ${bp.resource.name}` : `pay ${a.cost}`), a.discard && `discard ${a.discard}`, a.sacrifice && 'sacrifice a unit',
    a.life && (bp.win.life > 0 ? `pay ${a.life} life` : `add ${a.life} life card${a.life === 1 ? '' : 's'} to your hand`),
    a.uncount && `remove ${a.uncount.n} ${nm(bp, 'counters', a.uncount.id)} counter${a.uncount.n === 1 ? '' : 's'}`, a.banish && `banish ${a.banish} from your discard pile`,
    a.returnRes && `return ${a.returnRes} ${bp.resource.name}${bp.resource.mode === 'deck' ? ` to your ${bp.resource.name} deck` : ''}`].filter(Boolean).join(', ');
}
export function abilityText(a: Ability, bp: Blueprint, role: Role): string {
  const head = a.when === 'activated' ? `${a.from === 'hand' ? 'From your hand — ' : a.from === 'grave' ? 'From your discard pile — ' : ''}${a.quick ? '(Quick) ' : ''}${cap(costText(a, bp)) || 'Activate'}: ` : a.when === 'play' && SPELLISH.includes(role) ? ''
    : a.when === 'opAttack' && !SPELLISH.includes(role) ? 'When your opponent attacks: '
    : (a.when === 'conquer' || a.when === 'hold') && role !== 'battlefield' ? (a.when === 'conquer' ? 'When this conquers a battlefield: ' : 'When you hold its battlefield: ') : WHEN_TEXT[a.when] ?? '';
  const body = a.do.map((e) => effectText(e, bp)).join(', then ');
  return `${head}${cap(condText(a.if, bp) + body)}.${a.oncePerName ? ' (Once per turn per name.)' : a.once === 'game' ? ' (Once per game.)' : a.once ? ' (Once per turn.)' : ''}`;
}
export function cardText(k: CardBP, bp: Blueprint): string {
  if (k.text) return k.text;
  const role = bp.types.find((t) => t.id === k.type)?.role ?? 'unit';
  const valued = Object.entries(k.kwv ?? {}).filter(([id]) => k.keywords.includes(id)).map(([id, v]) => `${nm(bp, 'keywords', id)} ${v}`).join(', ');
  const parts = [k.traits?.length ? `{${k.traits.join(' / ')}}` : '', valued, ...k.abilities.map((a) => abilityText(a, bp, role))];
  if (k.bonus) parts.push(`Attach to one of your units: ${Object.entries(k.bonus).map(([s, n]) => `${n >= 0 ? '+' : ''}${n} ${nm(bp, 'stats', s)}`).join(', ')}.`);
  if (role === 'evolution' && k.evolvesFrom) parts.unshift(`Evolves from ${k.evolvesFrom}.`);
  if (k.shift) parts.unshift(`Shift ${k.shift} (you may pay ${k.shift} to play this on top of your ${baseName(k.name)}).`);
  if (bp.combat.zones) {
    const Z = ['', 'Low', 'Mid', 'High'];
    if (k.stats.bzone) parts.push(`Block: ${Z[k.stats.bzone] ?? '?'} +${k.stats.bmod ?? 0}.`);
    if (role === 'attack' && k.stats.azone) parts.unshift(`${Z[k.stats.azone] ?? '?'} attack.`);
  }
  if (k.combo) parts.unshift(`Combo (${k.combo}): play only right after a ${k.combo} card.`);
  if (k.breaker) parts.unshift(`Breaks ${k.breaker.breaks === 'all' ? 'any guardian' : k.breaker.breaks}. ${k.breaker.boostCost}: +${k.breaker.boostBy} strength. ${k.breaker.breakCost} per subroutine: break them.`);
  for (const e of k.subs ?? []) parts.push(`↳ ${cap(effectText(e, bp))}.`);
  if (role === 'extra' && k.materials) parts.unshift(`Summon from your extra deck by sending ${k.materials} of your units to the discard pile.`);
  const per: Record<string, string> = { energy: 'for each energy attached to this', targetDamage: 'for each damage counter on the target', benched: 'for each of your benched units', oppBenched: "for each of your opponent's benched units", heads: 'for each heads' };
  for (const mv of k.moves ?? []) parts.push(`${mv.name} [${costLabel(mv.cost, bp)}]: ${mv.damage} damage${mv.plus ? ` +${mv.plus.n} ${per[mv.plus.per]}${mv.plus.per === 'heads' ? ` (flip ${mv.plus.coins ?? 1} coin${(mv.plus.coins ?? 1) === 1 ? '' : 's'})` : ''}` : ''}`
    + `${mv.do?.length ? `; ${mv.do.map((e) => effectText(e, bp)).join(', then ')}` : ''}${mv.discard ? `; discard ${mv.discard} energy from this` : ''}.`);
  if (k.kicker) parts.unshift(`Kicker ${k.kicker} (you may pay ${k.kicker} more as you play it).`);
  if (k.flashback) parts.push(`Flashback ${k.flashback} (play it from your discard pile for ${k.flashback}, then banish it).`);
  if (k.cycling) parts.push(`Cycling ${k.cycling} (pay ${k.cycling}, discard this: draw a card).`);
  if (k.equipCost) parts.push(`Equip ${k.equipCost}.`);
  if (k.crew) parts.unshift(`Crew ${k.crew} (tap your units with total power ${k.crew}: it can attack and block this turn).`);
  if (k.station) parts.unshift(`Station (tap another unit: put charge equal to its power here). ${k.station}+ charge: it can attack and block.`);
  if (k.isToken) parts.unshift('Token.');
  const ty = bp.types.find((t) => t.id === k.type);
  const matText = (f: Filter) => filterText(f, bp) || 'unit';
  if (ty?.method === 'fusion' && k.mats?.length) parts.unshift(`${k.mats.map(matText).join(' + ')}.`);
  if (ty?.method === 'synchro') parts.unshift('1 Tuner + 1 or more non-Tuner units (levels add up to its level).');
  if (ty?.method === 'xyz') parts.unshift(`${k.materials || 2} level ${k.stats.rank ?? '?'} units.`);
  if (ty?.method === 'link') parts.unshift(`${k.arrows?.length ?? 1} ${k.mats?.[0] ? matText(k.mats[0]) : 'unit'}${(k.arrows?.length ?? 1) === 1 ? '' : 's'}. Link arrows: ${(k.arrows ?? []).join(' ')}.`);
  if (ty?.ritual) parts.unshift('Ritual: summon it only with a ritual effect.');
  if (k.scale) parts.unshift(`Pendulum scale ${k.scale}.`);
  if ((k.prizes ?? 1) > 1) parts.push(`When destroyed, your opponent takes ${k.prizes} prize cards.`);
  return parts.filter(Boolean).join('\n');
}
export function costLabel(cost: Record<string, number> | number | undefined, bp: Blueprint): string {
  if (cost === undefined) return '0';
  if (typeof cost === 'number') return String(cost);
  return Object.entries(cost).map(([t, n]) => `${n} ${t === 'any' ? (bp.resource.recycle ? 'energy' : 'any') : nm(bp, 'colors', t)}`).join(' + ') || '0';
}

// ---------------------------------------------------------------- effects and abilities
function filterExpr(x: Ctx, f: Filter | undefined): X | null {
  if (!f) return null;
  const parts: X[] = [];
  if (f.type) parts.push(eq(g('$it', 'type'), f.type));
  if (f.color) parts.push(eq(g('$it', 'color'), f.color));
  if (f.keyword) parts.push(has('$it', x.kwKey(f.keyword)));
  if (f.stat && f.val !== undefined) parts.push(f.op === 'ge' ? ge(g('$it', f.stat), f.val) : le(g('$it', f.stat), f.val));
  if (f.exhausted) parts.push(eq(g('$it', 'ex'), 1));
  if (f.name) parts.push(OR(eq(g('$it', 'name'), f.name), eq(g('$it', 'family'), f.name)));
  if (f.trait) parts.push(['in', L(f.trait), def('$it', 'traits')]);
  if (f.status) parts.push(gt(g('$it', `st_${f.status}`), 0));
  if (f.adjacent) parts.push(AND(eq(ctrl('$it'), ctrl('$self')), eq(g('$it', 'zone'), 'field'), eq(g('$self', 'zone'), 'field'), eq(['abs', sub(C('col', '$it'), C('col', '$self'))], 1)));
  if (f.opposite) parts.push(AND(ne(ctrl('$it'), ctrl('$self')), eq(g('$it', 'zone'), 'field'), eq(g('$self', 'zone'), 'field'), eq(C('col', '$it'), sub(x.c.fieldSize + 1, C('col', '$self')))));
  if (f.pointed) parts.push(C('points', '$self', '$it'));
  if (f.here) parts.push(['in', '$it', ['linked', '$self', 'at']]);
  return parts.length ? AND(...parts) : null;
}
function target(x: Ctx, kind: TargetKind | undefined, v: string, prompt: string, f?: Filter): { pre: X[]; ref: X; many: boolean } {
  const fe = filterExpr(x, f);
  const narrow = (l: X) => (fe ? flt(l, fe) : l);
  const units = (xx: Ctx, p: X) => (f?.zone ? cards(p, f.zone) : unitsOf(xx, p));
  const allUnits = (xx: Ctx) => units(xx, '*');
  const vis = (l: X) => flt(l, NOT(AND(has('$it', 'ward'), ne(ctrl('$it'), '$me'))));
  const deflect = x.hasRule('deflect');
  const payN = (n: X): X[] => x.recycle ? [choose({ from: cards('$me', 'resources'), min: n, max: n, as: `${v}r`, prompt: 'Recycle runes to pay the deflect cost' }), ['move', `${v}r`, 'resdeck']] : [['pay', '$me', 'mana', n]];
  const canN = (n: X): X => (x.recycle ? ge(cnt(cards('$me', 'resources')), n) : ['canPay', '$me', 'mana', n]);
  const deflectPre: X[] = deflect ? [IF(AND(isObj(v), ne(ctrl(v), '$me'), gt(def(v, 'kw_deflect'), 0)), [IF(canN(def(v, 'kw_deflect')), [
    choose({ from: L(['Pay the deflect cost', 'Let it fizzle']), min: 1, max: 1, as: `${v}d`, prompt: 'That target has deflect: pay its cost?' }),
    IF(eq(`${v}d`, 'Pay the deflect cost'), payN(def(v, 'kw_deflect')), [SET('game', 'wf', 1)])], [SET('game', 'wf', 1)])])] : [];
  const vanish = x.hasRule('vanish');
  const ward = x.hasRule('wardTax') || deflect || vanish;
  const wardPre: X[] = ward ? [SET('game', 'wf', 0), ...deflectPre, IF(AND(isObj(v), ne(ctrl(v), '$me'), gt(def(v, 'kw_wardTax'), 0)), [IF(['canPay', '$me', 'mana', def(v, 'kw_wardTax')], [
    choose({ from: L(['Pay the ward cost', 'Let it fizzle']), min: 1, max: 1, as: `${v}w`, prompt: 'That target has ward: pay its cost?' }),
    IF(eq(`${v}w`, 'Pay the ward cost'), [['pay', '$me', 'mana', def(v, 'kw_wardTax')]], [SET('game', 'wf', 1)])], [SET('game', 'wf', 1)]), IF(eq(g('game', 'wf'), 1), [emit('warded', { o: v })])]),
    ...(vanish ? [IF(AND(isObj(v), ne(ctrl(v), '$me'), has(v, 'vanish'), inl(def('$self', 'role'), ['spell', 'fast'])), [['destroy', v], emit('vanished', { o: v }), SET('game', 'wf', 1)])] : [])] : [];
  const one = (from: X) => ({ pre: [choose({ from: narrow(from), min: 1, max: 1, as: v, prompt }), ...wardPre], ref: ward ? Q(eq(g('game', 'wf'), 1), 0, v) : v, many: false });
  switch (kind ?? 'enemyUnit') {
    case 'self': return { pre: [], ref: '$self', many: false };
    case 'opponent': return { pre: [], ref: '$opp', many: false };
    case 'you': return { pre: [], ref: '$me', many: false };
    case 'eachPlayer': return { pre: [], ref: ['players'], many: true };
    case 'enemyUnit': return one(vis(units(x, '$opp')));
    case 'anyUnit': return one(cat(units(x, '$me'), vis(units(x, '$opp'))));
    case 'ownUnit': return one(units(x, '$me'));
    case 'otherOwnUnit': return one(flt(units(x, '$me'), ne('$it', '$self')));
    case 'enemyAny': return one(cat(x.leader && !x.lifeCards ? cards('$opp', 'leader') : ['list', '$opp'], vis(units(x, '$opp')), ...(x.hasRole('walker') ? [flt(cards('$opp', 'support'), eq(g('$it', 'role'), 'walker'))] : [])));
    case 'allEnemyUnits': return { pre: [], ref: narrow(units(x, '$opp')), many: true };
    case 'allUnits': return { pre: [], ref: narrow(allUnits(x)), many: true };
    case 'allOwnUnits': return { pre: [], ref: narrow(units(x, '$me')), many: true };
    case 'randomEnemyUnit': return { pre: [['random', { from: narrow(units(x, '$opp')), as: v }]], ref: v, many: false };
    case 'attacker': return { pre: [], ref: Q(gt(g('game', 'bat'), 0), '$win.attacker', 0), many: false };
    case 'battleTarget': return { pre: [], ref: Q(gt(g('game', 'bat'), 0), '$win.target', 0), many: false };
    case 'ownLeader': return { pre: [], ref: first(cards('$me', 'leader')), many: false };
    case 'ownAny': return one(cat(cards('$me', 'leader'), units(x, '$me')));
  }
}
function effect(x: Ctx, e: Effect, i: number): X[] {
  const n: X = e.fromRoll ? g('game', 'roll') : e.kw ? def('$self', `kw_${x.kwKey(e.kw)}`) : e.n ?? 1;
  const p = e.who === 'opp' ? '$opp' : '$me';
  const per = (body: (who: X) => X[]) => (e.who === 'each' ? [EACH(['players'], '$pl', body('$pl'))] : body(p));
  const needsTarget = ['damage', 'heal', 'buff', 'destroy', 'bounce', 'exhaust', 'ready', 'addCounter', 'removeCounter', 'restrict', 'moveTo', 'giveRes', 'inflict', 'cure', 'attachFrom', 'fight'].includes(e.k);
  if (needsTarget) {
    const t = target(x, e.target, `$t${i}`, cap(`${effectText(e, x.bp)}: choose`), e.filter);
    const cv = `c_${e.card ?? 'x'}`;
    const one = (r: X): X[] => {
      switch (e.k) {
        case 'damage': return [C('dmgTo', r, n, '$self')];
        case 'heal': return [C('healTo', r, n)];
        case 'buff': return [IF(isObj(r), [e.until === 'forever' ? INC(r, e.stat ?? x.POW, n) : e.until === 'battle' && x.battle && (e.stat ?? x.POW) === x.POW ? INC(r, 'bb', n)
          : ['modify', r, { layer: 'add', mods: [{ op: 'add', stat: e.stat ?? x.POW, value: n }], until: 'turn' }]])];
        case 'inflict': return statusApply(x, r, e.status ?? '', n);
        case 'fight': return [IF(isObj(r), [choose({ from: units(x, '$me'), min: 1, max: 1, as: `$fo${i}`, prompt: 'Which of your units fights?' }),
          IF(isObj(`$fo${i}`), [LET(`$fa${i}`, C('pw', `$fo${i}`)), LET(`$fb${i}`, C('pw', r)), ['damage', r, `$fa${i}`, `$fo${i}`], ['damage', `$fo${i}`, `$fb${i}`, r]])])];
        case 'cure': return [IF(isObj(r), (x.bp.statuses ?? []).filter((s) => !e.status || s.id === e.status).map((s) => SET(r, `st_${s.id}`, 0)))];
        case 'attachFrom': {
          const pred = AND(eq(g('$it', 'role'), 'resource'), filterExpr(x, e.filter) ?? L(true));
          return [IF(isObj(r), [choose({ from: flt(cards('$me', e.zone ?? 'deck'), pred), min: 0, max: 1, as: `$af${i}`, prompt: `Attach which ${x.bp.resource.name}?` }),
            IF(isObj(`$af${i}`), [['move', `$af${i}`, 'support', { as: `$an${i}` }], ['link', `$an${i}`, 'bearer', r], SET(`$an${i}`, 'att', 1)]), ...(e.zone === 'deck' || !e.zone ? [['shuffle', '$me', 'deck']] : [])])];
        }
        case 'giveRes': return [IF(isObj(r), [EACH(range(n), `$gv${i}`, [['modify', r, { layer: 'add', mods: [{ op: 'add', stat: x.POW, value: x.r.boost || 1 }], until: 'turn' }], INC(r, 'don', 1)]), emit('given', { o: r, p: '$me' })])];
        case 'destroy': return [IF(isObj(r), [['destroy', r]])];
        case 'bounce': return [IF(isObj(r), [['move', r, 'hand']])];
        case 'exhaust': return [IF(isObj(r), [SET(r, 'ex', 1)])];
        case 'addCounter': { const mxv = x.bp.counters?.find((k) => k.id === e.card)?.max; return [IF(isObj(r), [mxv ? SET(r, cv, mn(mxv, add(g(r, cv), n))) : INC(r, cv, n)])]; }
        case 'removeCounter': return [IF(isObj(r), [SET(r, cv, mx(0, sub(g(r, cv), n)))])];
        case 'moveTo': return [IF(isObj(r), [['move', r, e.zone ?? 'banished']])];
        case 'restrict': return [IF(isObj(r), [e.until === 'turn' ? ['modify', r, { layer: 'add', mods: [{ op: 'grant', kw: e.rule ?? 'noAttack' }], until: 'turn' }] : INC(r, `kw:${e.rule ?? 'noAttack'}`, 1)])];
        default: return [IF(isObj(r), [SET(r, 'ex', 0)])];
      }
    };
    return [...t.pre, ...(t.many ? [EACH(t.ref, `$x${i}`, one(`$x${i}`))] : one(t.ref))];
  }
  switch (e.k) {
    case 'draw': return per((w) => [['draw', w, n]]);
    case 'token': {
      const tokType = x.bp.cards.find((k) => k.id === e.card)?.type;
      const tokRole = x.roleOf.get(tokType ?? '') ?? 'token';
      const zone = !UNIT_ROLES.includes(tokRole) ? 'support' : x.c.mode === 'duel' ? 'bench' : x.bp.types.find((t) => t.id === tokType)?.zone ?? x.UZ[0];
      return [EACH(range(n), `$k${i}`, [IF(zone === 'support' ? L(true) : C('roomIn', '$me', zone), [['create', e.card ?? 'token', '$me', zone, { as: `$n${i}` }], SET(`$n${i}`, 'newT', '$turn')])])];
    }
    case 'gain': return x.pool ? [C('gainRes', '$me', 'c', n)] : x.r.mode === 'pitch' ? [INC('$me', 'pp', n)] : [];
    case 'discard': return per((w) => [C('discardN', w, n)]);
    case 'mill': return per((w) => [['move', ['top', w, 'deck', n], 'grave']]);
    case 'search': return [LET(`$s${i}`, first(flt(cards('$me', 'deck'), AND(e.type ? eq(g('$it', 'type'), e.type) : L(true), filterExpr(x, e.filter) ?? L(true))))),
      IF(isObj(`$s${i}`), [['move', `$s${i}`, 'hand']]), ['shuffle', '$me', 'deck']];
    case 'recover': return [choose({ from: flt(cards('$me', 'grave'), AND(e.type ? eq(g('$it', 'type'), e.type) : L(true), filterExpr(x, e.filter) ?? L(true))), min: 1, max: 1, as: `$s${i}`, prompt: 'Return which card?' }),
      IF(isObj(`$s${i}`), [['move', `$s${i}`, 'hand']])];
    case 'counter': return x.bp.timing === 'simple' ? [] : [IF(ANY(['stack'], ne(g('$it', 'controller'), '$me')), [['counter', ['slice', flt(['stack'], ne(g('$it', 'controller'), '$me')), 0, 1]]])];
    case 'lifeGain': return x.life ? [INC('$me', 'life', n)] : x.lifeCards ? [['move', ['top', '$me', 'deck', n], 'life']] : [];
    case 'lifeLoss': return per((w) => (x.life ? [INC(w, 'life', ['neg', n])] : [C('hitN', w, n, n, '$self')]));
    case 'score': return e.who === 'opp' ? [SET('$opp', 'score', mx(0, sub(g('$opp', 'score'), n)))] : [INC('$me', 'score', n)];
    case 'addLife': return [['move', ['top', '$me', 'deck', n], 'life']];
    case 'win': return [['win', '$me']];
    case 'strike': return x.battle ? [['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blockers: L([]), power: n, guard: 0 } }], SET('game', 'bat', 0)]
      : [C('hitN', '$opp', 1, n, '$self')];
    case 'deploy': return [IF(eq(g('$self', 'zone'), 'leader'), [['move', '$self', x.UZ[0], { as: `$dp${i}` }], SET(`$dp${i}`, 'newT', '$turn'), emit('deployed', { p: '$me' })])];
    case 'fusion': return [C('fusionDo')];
    case 'ritual': return [C('ritualDo')];
    case 'roll': {
      const nd = e.n ?? 1, sd = e.sides ?? 6, base = 300 + i * 20;
      return [SET('game', 'roll', 0), EACH(range(nd), `$dr${i}`, [['random', { min: 1, max: sd, as: `$dv${i}` }], INC('game', 'roll', `$dv${i}`), emit('dice', { p: '$me', value: `$dv${i}`, sides: sd })]),
        emit('rolled', { p: '$me', total: g('game', 'roll'), dice: nd, sides: sd }),
        ...(e.ranges ?? []).map((r, ri) => IF(AND(ge(g('game', 'roll'), r.min), le(g('game', 'roll'), r.max)), effectsAt(x, r.do, base + ri * 2))),
        ...effectsAt(x, e.then ?? [], base + 15)];
    }
    case 'flip': {
      const nC = e.n ?? 1, base = 100 + i * 10;
      return [SET('game', 'hd', 0), EACH(range(nC), `$fc${i}`, [['random', { min: 0, max: 1, as: `$cf${i}` }], IF(eq(`$cf${i}`, 1), [INC('game', 'hd', 1)]), emit('coin', { p: '$me', heads: `$cf${i}` })]),
        ...(e.perHeads ? [EACH(range(g('game', 'hd')), `$ph${i}`, effectsAt(x, e.heads ?? [], base))] : [IF(eq(g('game', 'hd'), nC), effectsAt(x, e.heads ?? [], base), effectsAt(x, e.tails ?? [], base + 5))])];
    }
    case 'switch': {
      if (x.c.mode !== 'duel') return [];
      const w = e.who === 'opp' ? '$opp' : '$me';
      return [IF(AND(gt(cnt(cards(w, 'bench')), 0), gt(cnt(cards(w, 'active')), 0)), [choose({ from: cards(w, 'bench'), min: 1, max: 1, as: `$sw${i}`, prompt: e.who === 'opp' ? "Bring which of your opponent's benched units in?" : 'Switch in which benched unit?' }),
        LET(`$sa${i}`, first(cards(w, 'active'))), C('moveKeep', `$sa${i}`, 'bench'), C('moveKeep', `$sw${i}`, 'active'), emit('switched', { p: w })])];
    }
    case 'tutor': {
      const pred = AND(e.type ? eq(g('$it', 'type'), e.type) : L(true), filterExpr(x, e.filter) ?? L(true), e.to === 'play' ? inl(g('$it', 'role'), UNIT_ROLES) : L(true));
      const dest = e.to === 'play' ? (x.c.mode === 'duel' ? 'bench' : x.UZ[0]) : 'hand';
      return [['move', cards('$me', 'deck'), 'look'], choose({ from: flt(cards('$me', 'look'), pred), min: 0, max: e.to === 'play' ? mn(n, mx(0, sub(x.c.mode === 'duel' ? x.c.benchSize : x.c.fieldSize, cnt(cards('$me', dest))))) : n,
        as: `$tu${i}`, prompt: 'Search your deck: choose cards' }),
        EACH(['concat', ['list'], `$tu${i}`], `$tx${i}`, [emit('revealed', { p: '$me', card: g(`$tx${i}`, 'card') }), ['move', `$tx${i}`, dest, { as: `$ty${i}` }], ...(e.to === 'play' ? [SET(`$ty${i}`, 'newT', '$turn')] : [])]),
        ['move', cards('$me', 'look'), 'deck'], ['shuffle', '$me', 'deck']];
    }
    case 'surveil': return [EACH(range(n), `$sv${i}`, [LET(`$st${i}`, first(['top', '$me', 'deck', 1])), IF(isObj(`$st${i}`), [['emit', 'peek', { p: '$me', card: g(`$st${i}`, 'card') }, { to: ['list', '$me'] }],
      choose({ from: L(['Keep it on top', 'Put it in the discard pile']), min: 1, max: 1, as: `$sq${i}`, prompt: 'You look at the top card of your deck (see the log).' }),
      IF(eq(`$sq${i}`, 'Put it in the discard pile'), [['move', `$st${i}`, 'grave']])])])];
    case 'drawTo': return [['draw', '$me', mx(0, sub(n, cnt(cards('$me', 'hand'))))]];
    case 'skipEvolve': return x.hasRole('evolution') ? [choose({ from: flt(cards('$me', 'hand'), AND(eq(g('$it', 'role'), 'evolution'), NOT(NOT(def('$it', 'evolvesFrom2'))),
        ['let', '$e2', def('$it', 'evolvesFrom2'), ANY(units(x, '$me'), AND(OR(eq(g('$it', 'name'), '$e2'), eq(g('$it', 'family'), '$e2')), lt(g('$it', 'newT'), '$turn')))])), min: 0, max: 1, as: `$sk${i}`, prompt: 'Evolve into which card?' }),
      IF(isObj(`$sk${i}`), [LET(`$e2${i}`, def(`$sk${i}`, 'evolvesFrom2')), choose({ from: flt(units(x, '$me'), AND(OR(eq(g('$it', 'name'), `$e2${i}`), eq(g('$it', 'family'), `$e2${i}`)), lt(g('$it', 'newT'), '$turn'))), min: 1, max: 1, as: `$sb${i}`, prompt: 'Evolve which unit?' }),
        C('evolveOnto', `$sk${i}`, `$sb${i}`)])] : [];
    case 'dig': {
      const pred = AND(e.type ? eq(g('$it', 'type'), e.type) : L(true), filterExpr(x, e.filter) ?? L(true));
      return [['move', ['top', '$me', 'deck', n], 'look'], choose({ from: flt(cards('$me', 'look'), pred), min: 0, max: 1, as: `$dg${i}`, prompt: 'Reveal a card to add to your hand (the rest go to the bottom)' }),
        IF(isObj(`$dg${i}`), [emit('revealed', { p: '$me', card: g(`$dg${i}`, 'card') }), ['move', `$dg${i}`, 'hand']]), ['move', cards('$me', 'look'), 'deck']];
    }
    case 'putIntoPlay': {
      const pred = AND(inl(g('$it', 'role'), UNIT_ROLES), e.type ? eq(g('$it', 'type'), e.type) : L(true), filterExpr(x, e.filter) ?? L(true));
      return [choose({ from: flt(cards('$me', e.zone === 'grave' ? 'grave' : 'hand'), pred), min: 0, max: 1, as: `$pi${i}`, prompt: 'Play which unit for free?' }),
        IF(isObj(`$pi${i}`), [...(x.c.replaceFull ? [IF(NOT(C('roomIn', '$me', x.UZ[0])), [choose({ from: cards('$me', x.UZ[0]), min: 1, max: 1, as: `$rf${i}`, prompt: 'Your board is full: trash which unit?' }), ['move', `$rf${i}`, 'grave']])] : []),
          IF(C('roomIn', '$me', x.UZ[0]), [['move', `$pi${i}`, x.UZ[0], { as: `$pn${i}` }], SET(`$pn${i}`, 'newT', '$turn')])])];
    }
    case 'addRes': return x.r.mode === 'deck' ? [['move', ['top', '$me', 'resdeck', n], 'resources']] : [];
    case 'readyRes': return x.pool ? [C('gainRes', '$me', 'c', mn(n, mx(0, sub(cnt(cards('$me', 'resources')), SUM(['values', ['pool', '$me', 'mana']], '$it')))))] : [];
    case 'lifeToHand': return [['move', ['top', '$me', 'life', n], 'hand']];
    case 'handToLife': return [choose({ from: cards('$me', 'hand'), min: 0, max: 1, as: `$hl${i}`, prompt: 'Put a card from your hand on top of your life?' }), IF(isObj(`$hl${i}`), [['move', `$hl${i}`, 'life', { pos: 'top' }]])];
    case 'scry': return [EACH(range(n), `$sy${i}`, [LET(`$tc${i}`, first(['top', '$me', 'deck', 1])), IF(isObj(`$tc${i}`), [['emit', 'peek', { p: '$me', card: g(`$tc${i}`, 'card') }, { to: ['list', '$me'] }],
      choose({ from: L(['Keep it on top', 'Put it on the bottom']), min: 1, max: 1, as: `$sk${i}`, prompt: 'You look at the top card of your deck (see the log). Keep it on top?' }),
      IF(eq(`$sk${i}`, 'Put it on the bottom'), [['move', `$tc${i}`, 'deck']])])])];
    case 'drops': return [INC('$me', 'drops', n), emit('drops', { p: '$me', n })];
    case 'endRun': return [SET('game', 'live', 0), emit('runEnded', { p: '$opp' })];
    case 'tag': return [INC('$opp', 'tags', n), emit('tagged', { p: '$opp', n })];
    case 'wound': return [LET(`$wn${i}`, n), IF(gt(`$wn${i}`, cnt(cards('$opp', 'hand'))), [['move', cards('$opp', 'hand'), 'grave'], emit('flatline', { p: '$opp' }), ['lose', '$opp']],
      [EACH(range(`$wn${i}`), `$wi${i}`, [['random', { from: cards('$opp', 'hand'), as: `$wc${i}` }], IF(isObj(`$wc${i}`), [['move', `$wc${i}`, 'grave']])]), emit('wounded', { p: '$opp', n: `$wn${i}` })])];
    case 'raw': return Array.isArray(e.raw) ? (e.raw as X[]) : [];
    default: return [];
  }
}
function condExpr(x: Ctx, k: Cond | undefined): X | null {
  if (!k || !k.k) return null;
  switch (k.k) {
    case 'units': return ge(cnt(units(x, '$me')), k.n ?? 1);
    case 'life': return x.life ? le(g('$me', 'life'), k.n ?? 5) : le(cnt(cards('$me', 'life')), k.n ?? 2);
    case 'hand': return le(cnt(cards('$me', 'hand')), k.n ?? 0);
    case 'yourTurn': return eq('$active', '$me');
    case 'res': return ge(resCount(x, '$me'), k.n ?? 1);
    case 'counter': return ge(g('$self', `c_${k.counter ?? 'x'}`), k.n ?? 1);
    case 'zone': return ge(cnt(cards('$me', k.zone ?? 'grave')), k.n ?? 1);
    case 'played': return ge(g('$me', 'plays'), (k.n ?? 1) + 1);
    case 'oppTurn': return ne('$active', '$me');
    case 'status': return gt(g('$self', `st_${k.status ?? 'x'}`), 0);
    case 'kicked': return eq(g('game', 'kick'), 1);
    case 'charged': return ge(g('$self', 'chg'), k.n ?? 1);
    case 'under': return ge(cnt(['linked', '$self', 'host']), k.n ?? 1);
    case 'attacking': return AND(gt(g('game', 'bat'), 0), isObj('$win.attacker'), eq(ctrl('$win.attacker'), '$me'));
    case 'defending': return AND(gt(g('game', 'bat'), 0), isObj('$win.attacker'), ne(ctrl('$win.attacker'), '$me'));
    case 'here': return OR(AND(isObj(g('$self', 'at')), eq(g(g('$self', 'at'), 'zone'), 'locations')), ge(cnt(['linked', '$self', 'at']), k.n ?? 1));
    case 'linked': return OR(ANY(allUnits(x), C('points', '$self', '$it')), ANY(allUnits(x), C('points', '$it', '$self')));
    case 'oppLife': return x.life ? le(g('$opp', 'life'), k.n ?? 2) : le(cnt(cards('$opp', 'life')), k.n ?? 2);
    case 'attached': return ge(g('$self', 'don'), k.n ?? 1);
    case 'raw': return k.raw ?? true;
  }
}
const effects = (x: Ctx, list: Effect[]) => list.flatMap((e, i) => effect(x, e, i));
const effectsAt = (x: Ctx, list: Effect[], base: number) => list.flatMap((e, i) => effect(x, e, base + i));
/** Puts status `sid` on unit r (clearing others in its group), level n (stacking statuses add). */
function statusApply(x: Ctx, r: X, sid: string, n: X): X[] {
  const s = x.bp.statuses?.find((k) => k.id === sid);
  if (!s) return [];
  const v = `st_${s.id}`;
  return [IF(AND(isObj(r), s.activeOnly && x.c.mode === 'duel' ? eq(g(r, 'zone'), 'active') : L(true)), [
    ...(s.group ? (x.bp.statuses ?? []).filter((o) => o.group === s.group && o.id !== s.id).map((o) => SET(r, `st_${o.id}`, 0)) : []),
    SET(r, v, s.stacks ? add(g(r, v), n) : mx(g(r, v), n)), SET(r, `sT_${s.id}`, '$turn'), emit('status', { o: r, s: s.id })])];
}
const scopeOf = (x: Ctx, t: TargetKind | undefined, f?: Filter): X => {
  const base = t === 'self' ? ['list', '$self'] : t === 'allEnemyUnits' ? units(x, '$opp') : t === 'allUnits' ? allUnits(x)
    : t === 'otherOwnUnit' ? flt(units(x, '$me'), ne('$it', '$self')) : units(x, '$me');
  const fe = filterExpr(x, f);
  return fe ? flt(base, fe) : base;
};

function compileCard(x: Ctx, k: CardBP): Record<string, X> {
  const bp = x.bp;
  const role: Role = x.roleOf.get(k.type) ?? 'unit';
  const type = bp.types.find((t) => t.id === k.type);
  const out: Record<string, any> = { id: k.id, name: k.name, type: k.type, role, text: cardText(k, bp) };
  if (k.flavor) out.flavor = k.flavor;
  out.cost = k.cost ?? 0;
  if (typeof out.cost === 'object' && !Object.keys(out.cost).length) out.cost = 0;
  if (x.recycle && role !== 'resource') {
    const cm: Record<string, number> = typeof out.cost === 'object' ? out.cost : { any: out.cost };
    out.en = cm.any ?? 0;
    const pw = Object.fromEntries(Object.entries(cm).filter(([t, v]) => t !== 'any' && v > 0));
    if (Object.keys(pw).length) out.pw = pw;
    if (!Object.keys(pw).length) out.cost = out.en;
  }
  if (k.color2) out.color2 = k.color2;
  if (k.traits?.length) out.traits = k.traits;
  for (const [s, v] of Object.entries(k.stats ?? {})) if (s !== 'cost') out[s] = v;
  if (k.color) out.color = k.color;
  out.res = k.color && x.colorIds.includes(k.color) && !x.r.faceDown ? k.color : 'c';
  if (role === 'resource' && k.color && k.color2) out.res = [k.color, k.color2].sort().join('_');
  if (x.duals.length && typeof out.cost === 'number' && out.cost > 0) out.cost = { any: out.cost };
  if (type?.playTo && bp.zones?.some((z) => z.id === type.playTo)) out.playTo = type.playTo;
  out.zone = x.c.mode === 'duel' || x.c.mode === 'lanes' ? x.UZ[0] : type?.zone && x.UZ.includes(type.zone) ? type.zone : x.UZ[0];
  const kws = k.keywords.map((id) => x.kwKey(id));
  for (const [id, v] of Object.entries(k.kwv ?? {})) if (k.keywords.includes(id)) out[`kw_${x.kwKey(id)}`] = v;
  if (role === 'token' || k.isToken) { kws.push('token'); out.maxCopies = 0; }
  if (role === 'resource') out.maxCopies = 99;
  if (kws.length) out.keywords = [...new Set(kws)];
  const glyph = k.art || type?.icon;
  if (glyph) out.glyph = glyph;
  const hex = bp.colors.find((cl) => cl.id === k.color)?.hex;
  if (hex) out.hue = hexHue(hex);
  if (k.evolvesFrom) {
    out.evolvesFrom = k.evolvesFrom;
    const parent = bp.cards.find((p) => p.name === k.evolvesFrom || (p.family && p.family === k.evolvesFrom));
    if (parent?.evolvesFrom) out.evolvesFrom2 = parent.evolvesFrom;
  }
  if (k.prizes && k.prizes !== 1) out.prizes = k.prizes;
  if (k.shift) out.shift = k.shift;
  if (k.combo) out.combo = k.combo;
  if (UNIT_ROLES.includes(role)) out.base = baseName(k.name);
  if (k.resist) out.resist = k.resist;
  if (k.provides && k.provides !== 1) out.pv = k.provides;
  if (k.rainbow) out.rainbow = 1;
  if (type?.perUnit) out.perUnit = type.perUnit;
  for (const f of ['kicker', 'flashback', 'cycling', 'equipCost', 'crew', 'station'] as const) if (k[f]) out[f] = k[f];
  if (type?.equipment) out.equipment = 1;
  if (type?.anyUnit) out.anyUnit = 1;
  if (type?.method) out.method = type.method;
  if (type?.ritual) out.ritual = 1;
  if (type?.speed3) out.spd3 = 1;
  if (type?.continuous) out.cont = 1;
  if (k.arrows?.length) { out.arrows = k.arrows; out.linkN = k.arrows.length; }
  if (k.scale) out.scale = k.scale;
  if (k.family) out.family = k.family;
  if (k.materials) out.materials = k.materials;
  if (k.weakness) out.weakness = k.weakness;
  if (k.retreat !== undefined) out.retreat = k.retreat;
  const bundle = k.keywords.flatMap((id) => x.kw.get(id)?.abilities ?? []);
  const onAcc: X[] = [];
  const abilities: X[] = [], statics: X[] = [], acts: X[] = [], actsNow: X[] = [], actsQ: X[] = [], actsHand: X[] = [], actsGrave: X[] = [], effs: X[] = [], onHit: X[] = [], replacements: X[] = [], onConq: X[] = [], onHold: X[] = [];
  for (const a of [...k.abilities, ...bundle]) {
    const cond = condExpr(x, a.if);
    const body = effects(x, a.do);
    const lim = a.once ? { limit: { per: a.once === 'game' ? 'game' : 'turn', by: 'source' } } : {};
    if (a.when === 'static') {
      for (const e of a.do) {
        const iff = cond ? { if: cond } : {};
        if (e.k === 'aura') statics.push({ layer: 'add', affects: scopeOf(x, e.target, e.filter), mods: [{ op: 'add', stat: e.stat ?? x.POW, value: e.n ?? 1 }], ...iff });
        else if (e.k === 'restrict') statics.push({ layer: 'add', affects: scopeOf(x, e.target, e.filter), mods: [{ op: 'grant', kw: e.rule ?? 'noAttack' }], ...iff });
        else if (e.k === 'prevent') replacements.push({ replace: 'damage', text: 'Prevent', if: AND(isObj('$e.target'), ['in', '$e.target', scopeOf(x, e.target ?? 'allOwnUnits', e.filter)], ...(cond ? [cond] : [])),
          modify: { amount: mx(0, sub('$e.amount', e.n ?? 1)) } });
        else if (e.k === 'insteadDestroy') replacements.push({ replace: 'destroy', text: 'Instead', if: AND(eq('$e.obj', '$self'), ...(cond ? [cond] : [])), instead: [['move', '$self', e.to === 'deck' ? 'deck' : 'hand']] });
        else if (e.k === 'costMod') { out.cmN = -(e.n ?? 1); if (e.type) out.cmType = e.type; }
      }
      continue;
    }
    if ((a.when === 'play' || a.when === 'opAttack') && SPELLISH.includes(role)) {
      effs.push(...(cond ? [IF(cond, body)] : body));
      if (a.when === 'opAttack') out.trapOn = 'opAttack';
      continue;
    }
    if (a.when === 'access') { onAcc.push(...(cond ? [IF(cond, body)] : body)); continue; }
    if (a.when === 'hit' && role === 'attack') { onHit.push(...(cond ? [IF(cond, body)] : body)); continue; }
    if (a.when === 'conquer' || a.when === 'hold') { (a.when === 'conquer' ? onConq : onHold).push(...(cond ? [IF(cond, body)] : body)); continue; }
    if (a.when === 'activated') {
      const req: X[] = [];
      const cost: X[] = [];
      if (a.tap) { req.push({ if: eq(g('$self', 'ex'), 0), why: 'Already exhausted' }); cost.push(SET('$self', 'ex', 1)); }
      if (a.loyalty !== undefined) { if (a.loyalty < 0) req.push({ if: ge(g('$self', 'loy'), -a.loyalty), why: 'Not enough loyalty' }); cost.push(INC('$self', 'loy', a.loyalty)); }
      if (a.sacSelf) cost.push(['move', '$self', a.from === 'grave' ? 'banished' : 'grave']);
      if (a.detach) { req.push({ if: ge(cnt(['linked', '$self', 'bearer']), a.detach), why: `Needs ${a.detach} attached material(s)` });
        cost.push(choose({ from: ['linked', '$self', 'bearer'], min: a.detach, max: a.detach, as: '$dt', prompt: 'Detach which materials?', required: true }), ['move', '$dt', 'grave']); }
      if (a.cost && x.pool) { req.push({ if: ['canPay', '$me', 'mana', a.cost], why: `Needs ${a.cost} ${bp.resource.name}` }); cost.push(['pay', '$me', 'mana', a.cost]); }
      if (a.cost && x.r.mode === 'pitch') { req.push({ if: ge(add(g('$me', 'pp'), SUM(cards('$me', 'hand'), def('$it', x.r.pitchStat ?? 'pitch'))), a.cost), why: `Needs ${a.cost} ${bp.resource.name}` }); cost.push(C('pitchPay', '$self', a.cost)); }
      if (a.discard) { req.push({ if: ge(cnt(cards('$me', 'hand')), a.discard), why: `Needs ${a.discard} card(s) to discard` }); cost.push(choose({ from: cards('$me', 'hand'), min: a.discard, max: a.discard, as: '$cd', prompt: 'Discard as a cost', required: true }), ['move', '$cd', 'grave']); }
      if (a.sacrifice) { req.push({ if: gt(cnt(units(x, '$me')), 0), why: 'Needs a unit to sacrifice' }); cost.push(choose({ from: units(x, '$me'), min: 1, max: 1, as: '$sc', prompt: 'Sacrifice which unit?', required: true }), ['destroy', '$sc']); }
      if (a.life && x.life) { req.push({ if: gt(g('$me', 'life'), a.life), why: `Needs more than ${a.life} life` }); cost.push(INC('$me', 'life', -a.life)); }
      else if (a.life && x.lifeCards) { req.push({ if: ge(cnt(cards('$me', 'life')), a.life), why: `Needs ${a.life} life card(s)` }); cost.push(['move', ['top', '$me', 'life', a.life], 'hand']); }
      if (a.banish) { req.push({ if: ge(cnt(cards('$me', 'grave')), a.banish), why: `Needs ${a.banish} card(s) in your discard pile` }); cost.push(choose({ from: cards('$me', 'grave'), min: a.banish, max: a.banish, as: '$bn', prompt: 'Banish which cards from your discard pile?', required: true }), ['move', '$bn', 'banished']); }
      if (a.returnRes) { req.push({ if: ge(cnt(cards('$me', 'resources')), a.returnRes), why: `Needs ${a.returnRes} ${bp.resource.name} in play` }); cost.push(choose({ from: cards('$me', 'resources'), min: a.returnRes, max: a.returnRes, as: '$rr', prompt: `Return which ${bp.resource.name}?`, required: true }), ['move', '$rr', x.r.mode === 'deck' ? 'resdeck' : 'hand'],
        ...(x.pool ? [LET('$ov', sub(SUM(['values', ['pool', '$me', 'mana']], '$it'), cnt(cards('$me', 'resources')))), IF(gt('$ov', 0), [['pay', '$me', 'mana', '$ov']])] : [])); }
      if (a.uncount) { const cv = `c_${a.uncount.id}`; req.push({ if: ge(g('$self', cv), a.uncount.n), why: 'Not enough counters' }); cost.push(INC('$self', cv, -a.uncount.n)); }
      if (cond) req.push({ if: cond, why: 'Condition not met' });
      const list = a.from === 'hand' ? actsHand : a.from === 'grave' ? actsGrave : a.sacSelf ? actsNow : a.quick ? actsQ : acts;
      list.push({ label: a.label || abilityText(a, bp, role).slice(0, 60), req, cost, do: body,
        ...(a.loyalty !== undefined ? { limit: { per: 'turn', by: 'source', group: 'loyalty' } } : a.oncePerName ? { limit: { per: 'turn', by: 'name', group: `n_${k.id}` } } : lim) });
      continue;
    }
    const on = a.when === 'play' ? 'enter' : a.when === 'leave' ? 'destroyed' : a.when === 'attack' || a.when === 'opAttack' ? 'attack' : a.when === 'hit' ? 'hit' : a.when === 'quest' ? 'quest'
      : a.when === 'block' ? 'blocked' : a.when === 'flip' ? 'flipped' : a.when === 'castSpell' ? 'action' : a.when === 'landfall' ? 'moved' : a.when === 'startTurn' ? 'turnStart' : 'turnEnd';
    const own = a.when === 'castSpell' ? AND(eq('$e.player', '$me'), inl('$e.action', ['cast', 'quick', 'fbSpell', 'fbQuick'])) : a.when === 'landfall' ? AND(eq('$e.to', 'resources'), isObj('$e.newObj'), eq(ctrl('$e.newObj'), '$me'))
      : a.when === 'flip' ? AND(eq('$e.obj', '$self'), eq('$e.up', L(true)))
      : a.when === 'attack' || a.when === 'quest' || a.when === 'block' ? eq('$e.o', '$self') : a.when === 'opAttack' ? ne('$e.p', '$me') : a.when === 'hit' ? eq('$e.src', '$self')
      : a.when === 'startTurn' || a.when === 'endTurn' ? eq('$e.p', '$me') : null;
    const iff = [own, cond].filter(Boolean) as X[];
    abilities.push({ on, do: body, ...(iff.length ? { if: AND(...iff) } : {}), ...lim, text: abilityText(a, bp, role) });
  }
  if (k.bonus && Object.keys(k.bonus).length) statics.push({ layer: 'add', affects: flt(['list', g('$self', 'bearer')], isObj('$it')), mods: Object.entries(k.bonus).map(([stat, value]) => ({ op: 'add', stat, value })) });
  if (effs.length) { out.effects = effs; out.hasEff = 1; }
  if (onHit.length) { out.onHit = onHit; out.hasHit = 1; }
  if (onAcc.length) { out.onAccess = onAcc; out.hasAcc = 1; }
  if (k.subs?.length) { out.subs = k.subs.map((e, i) => IF(eq(g('game', 'live'), 1), effect(x, e, 200 + i))); out.nsubs = k.subs.length; }
  if (k.iceType) out.iceType = k.iceType;
  if (k.breaker) Object.assign(out, { breaks: k.breaker.breaks, bCost: k.breaker.boostCost, bBy: Math.max(1, k.breaker.boostBy), brk: k.breaker.breakCost });
  const tside = x.bp.types.find((t) => t.id === k.type)?.side;
  if (tside !== undefined) out.side = tside;
  if (onConq.length) { out.onConquer = onConq; out.hasConq = 1; }
  if (onHold.length) { out.onHold = onHold; out.hasHold = 1; }
  if (abilities.length) out.abilities = abilities;
  if (statics.length) out.statics = statics;
  if (replacements.length) out.replacements = replacements;
  if (acts.length) out.acts = acts;
  if (actsNow.length) out.actsNow = actsNow;
  if (actsQ.length) out.actsQ = actsQ;
  if (actsHand.length) out.actsHand = actsHand;
  if (actsGrave.length) out.actsGrave = actsGrave;
  if (k.moves?.length && x.c.mode === 'duel') out.moves = k.moves.map((mv) => moveAbility(x, mv));
  if (k.raw) Object.assign(out, k.raw);
  return out;
}
function moveAbility(x: Ctx, mv: NonNullable<CardBP['moves']>[number]): X {
  const total = Object.values(mv.cost).reduce((a, b) => a + b, 0);
  const typed = Object.entries(mv.cost).filter(([t]) => t !== 'any');
  const E = C('energy', '$self');
  const units = SUM(E, mx(1, def('$it', 'pv')));
  const ok = AND(ge(units, total), ...typed.map(([t, n]) => ge(SUM(flt(E, OR(eq(g('$it', 'res'), t), eq(def('$it', 'rainbow'), 1))), mx(1, def('$it', 'pv'))), n)));
  const p = mv.plus;
  const cs = x.c.counterSize ?? 1;
  const bonus: X = !p ? 0 : p.per === 'energy' ? mul(p.n, units) : p.per === 'targetDamage' ? mul(p.n, ['/', g('$tg', 'dmg'), cs]) : p.per === 'benched' ? mul(p.n, cnt(cards('$me', 'bench')))
    : p.per === 'oppBenched' ? mul(p.n, cnt(cards('$opp', 'bench'))) : mul(p.n, g('game', 'hd'));
  const weak = Q(AND(gt(L(x.c.weakness), 1), eq(def('$tg', 'weakness'), def('$self', 'color')), NOT(NOT(def('$self', 'color')))), x.c.weakness, 1);
  const resist = x.c.resistance ? Q(AND(eq(def('$tg', 'resist'), def('$self', 'color')), NOT(NOT(def('$self', 'color')))), x.c.resistance, 0) : 0;
  const coins: X[] = p?.per === 'heads' ? [SET('game', 'hd', 0), EACH(range(p.coins ?? 1), '$mc', [['random', { min: 0, max: 1, as: '$mh' }], IF(eq('$mh', 1), [INC('game', 'hd', 1)]), emit('coin', { p: '$me', heads: '$mh' })])] : [];
  const body: X[] = [LET('$tg', first(cards('$opp', 'active'))), ...coins,
    LET('$dm', mx(0, sub(mul(add(mv.damage, bonus), weak), resist))),
    IF(AND(isObj('$tg'), gt('$dm', 0)), [['damage', '$tg', '$dm', '$self']]),
    emit('attack', { o: '$self', p: '$me', t: '$tg' }),
    ...effects(x, mv.do ?? []),
    ...(mv.discard ? [EACH(['slice', C('energy', '$self'), 0, mv.discard], '$de', [['move', '$de', 'grave']])] : [])];
  const flips = (x.bp.statuses ?? []).filter((s) => s.attackFlip);
  const guarded: X[] = flips.length ? [SET('game', 'af', 0), ...flips.map((s) => IF(gt(g('$self', `st_${s.id}`), 0), [['random', { min: 0, max: 1, as: '$af' }], emit('coin', { p: '$me', heads: '$af' }),
    IF(eq('$af', 0), [SET('game', 'af', 1), ['damage', '$self', s.attackFlip!, '$self'], emit('attackFailed', { o: '$self', p: '$me', s: s.id })])])), IF(eq(g('game', 'af'), 0), body)] : body;
  const bonusText = !p ? '' : p.per === 'heads' ? `, +${p.n} per heads (${p.coins ?? 1} coin${(p.coins ?? 1) === 1 ? '' : 's'})` : '+';
  return {
    label: `${mv.name} (${mv.damage}${bonusText})`,
    req: [{ if: ok, why: `Needs ${costLabel(mv.cost, x.bp)} energy attached` }],
    limit: { per: 'turn', group: 'attack' },
    do: [...guarded, ...(x.c.attackEndsTurn ? [['gotoPhase', x.endP]] : [])],
  };
}

// ---------------------------------------------------------------- the module
export function compileBlueprint(bp0: Blueprint): ModuleDef {
  const x = context(bp0);
  const bp = x.bp;
  const { c, r, UZ, atkZ, lanes, arenas, POW, HP, DEF, conq } = x;
  const usesPlayed = bp.cards.some((k) => k.abilities.some((a) => a.if?.k === 'played'));
  const F: Record<string, { params: string[]; body: X }> = {};
  const P: Record<string, { params: string[]; do: X[] }> = {};
  const fn = (n: string, params: string[], body: X) => { F[n] = { params, body }; };
  const proc = (n: string, params: string[], d: X[]) => { P[n] = { params, do: d }; };
  const types = (...roles: Role[]) => x.typesOf(...roles);
  const isRole = (o: X, ...roles: Role[]) => inl(g(o, 'role'), roles);
  const hpOf = (o: X) => (HP ? g(o, HP) : g(o, POW));
  const hpl = (o: X) => sub(hpOf(o), g(o, 'dmg'));
  const alive = (o: X) => AND(isObj(o), HP ? lt(g(o, 'dmg'), g(o, HP)) : L(true));
  const atLeader = (o: X) => AND(isRole(o, 'leader'), eq(g(o, 'zone'), 'leader'));
  const sizeOf = (z: string) => (z === 'emz' ? 1 : c.mode === 'duel' ? (z === 'active' ? 1 : c.benchSize) : arenas?.find((a) => a.id === z)?.size ?? c.fieldSize);
  const pitchStat = r.pitchStat ?? 'pitch';
  const ap = (r.actions ?? 0) > 0;

  // ---- functions
  fn('pw', ['$o'], mx(0, g('$o', POW)));
  fn('fpw', ['$o'], Q(OR(L(false), ...(bp.statuses ?? []).filter((s) => s.noDamage).map((s) => gt(g('$o', `st_${s.id}`), 0))), 0, mx(0, g('$o', POW))));
  const reducers = (p: X) => flt(cat(units(x, p), cards(p, 'support'), ...(x.leader ? [cards(p, 'leader')] : [])), NOT(NOT(def('$it', 'cmN'))));
  const hasReducers = bp.cards.some((k) => k.abilities.some((a) => a.do.some((e) => e.k === 'costMod'))) && !bp.colors.length;
  const baseCost = x.recycle ? def('$c', 'en') : def('$c', 'cost');
  const dog: X = x.hasRule('underdog') ? Q(AND(has('$c', 'underdog'), eq(g('$p', 'turns'), 1), ne(seat('$p'), g('game', 'first'))), 1, 0) : 0;
  const baseCost2: X = x.hasRule('underdog') ? mx(0, sub(baseCost, dog)) : baseCost;
  fn('costOf', ['$c', '$p'], hasReducers ? mx(0, add(baseCost2, SUM(reducers('$p'), Q(OR(NOT(def('$it', 'cmType')), eq(def('$it', 'cmType'), def('$c', 'type'))), def('$it', 'cmN'), 0)))) : baseCost2);
  const runesOf = (p: X, col: X) => flt(cards(p, 'resources'), eq(g('$it', 'res'), col));
  fn('powOK', ['$c', '$p', '$x'], x.recycle ? AND(...x.colorIds.map((col) => ge(cnt(runesOf('$p', col)), add(mx(0, ['at', def('$c', 'pw'), col]), Q(eq(def('$c', 'color'), col), '$x', 0))))) : L(true));
  if (x.duals.length) {
    const P = (t: string) => mx(0, ['at', ['pool', '$p', 'mana'], t]);
    const need = (col: string) => mx(0, ['at', def('$c', 'cost'), col]);
    const dualsOf = (cols: string[]) => x.duals.filter((d) => d.split('_').some((q) => cols.includes(q)));
    const covers = (cols: string[]) => le(add(0, ...cols.map(need)), add(0, ...cols.map(P), ...dualsOf(cols).map(P)));
    const pairs = x.colorIds.flatMap((a, i) => x.colorIds.slice(i + 1).map((b) => [a, b]));
    fn('dualOK', ['$c', '$p'], AND(ge(SUM(['values', ['pool', '$p', 'mana']], '$it'), add(mx(0, ['at', def('$c', 'cost'), 'any']), ...x.colorIds.map(need))),
      ...x.colorIds.map((col) => covers([col])), ...pairs.map((pr) => covers(pr))));
  }
  fn('payable', ['$c', '$p'], AND(
    x.pool ? (x.duals.length ? C('dualOK', '$c', '$p') : ['canPay', '$p', 'mana', C('costOf', '$c', '$p')]) : r.mode === 'pitch' ? ge(add(g('$p', 'pp'), SUM(flt(cards('$p', 'hand'), ne('$it', '$c')), def('$it', pitchStat))), C('costOf', '$c', '$p')) : L(true),
    x.recycle ? C('powOK', '$c', '$p', 0) : L(true),
    r.levelGate ? le(def('$c', r.levelGate), resCount(x, '$p')) : L(true),
    r.need ? ge(SUM(units(x, '$p'), g('$it', r.need.gen)), def('$c', r.need.stat)) : L(true)));
  fn('roomIn', ['$p', '$z'], OR(...UZ.map((z) => AND(eq('$z', z), lt(cnt(cards('$p', z)), sizeOf(z)))), L(false)));
  fn('room', ['$p'], c.mode === 'duel' ? OR(eq(cnt(cards('$p', 'active')), 0), lt(cnt(cards('$p', 'bench')), c.benchSize)) : C('roomIn', '$p', UZ[0]));
  fn('roomFor', ['$c', '$p'], c.mode === 'duel' ? C('room', '$p') : C('roomIn', '$p', def('$c', 'zone')));
  const stopped = (o: X, what: 'attack' | 'block' | 'retreat' | 'abilities') => [
    ...(bp.counters ?? []).filter((k) => k.stops?.includes(what as 'attack')).map((k) => eq(g(o, `c_${k.id}`), 0)),
    ...(bp.statuses ?? []).filter((s) => s.stops?.includes(what)).map((s) => eq(g(o, `st_${s.id}`), 0))];
  const vehicleOK = (o: X): X[] => [...(bp.cards.some((k) => k.crew) ? [OR(NOT(gt(def(o, 'crew'), 0)), eq(g(o, 'crewT'), '$turn'))] : []),
    ...(bp.cards.some((k) => k.station) ? [OR(NOT(gt(def(o, 'station'), 0)), ge(g(o, 'chg'), def(o, 'station')))] : [])];
  fn('canAtk', ['$o'], AND(eq(g('$o', 'ex'), 0), eq(g('$o', 'pos'), 0), NOT(g('$o', 'faceDown')), NOT(has('$o', 'noAttack')), ...stopped('$o', 'attack'), ...vehicleOK('$o'),
    c.sickness ? OR(lt(g('$o', 'newT'), '$turn'), has('$o', 'haste'), has('$o', 'rushUnits'), atLeader('$o')) : L(true),
    c.firstTurnAttack ? L(true) : c.firstTurnEach ? gt(g(ctrl('$o'), 'turns'), 1) : ne('$turn', 1),
    atkZ.length < UZ.length ? OR(atLeader('$o'), inl(g('$o', 'zone'), atkZ)) : L(true)));
  fn('energy', ['$u'], flt(['linked', '$u', 'bearer'], eq(g('$it', 'role'), 'resource')));
  // ---- grid boards: columns, link arrows (TL T TR L R BL B BR, from the controller's side), extra zones shared by both players
  if (x.grid) {
    const N = c.fieldSize;
    fn('col', ['$o'], add(0, ...Array.from({ length: N }, (_, i) => Q(eq(g('$o', 'slot'), `m${i + 1}`), i + 1, 0)), Q(eq(g('$o', 'zone'), 'emz'), Q(eq(g('$o', 'slot'), 'L'), 2, N - 1), 0)));
    const eL = 2, eR = N - 1;
    type Cell = { side: 'me' | 'opp'; zone: string; slot: string };
    const cellAt = (r: number, col: number): Cell[] => {
      if (col < 1 || col > N) return [];
      if (r === 3) return [{ side: 'me', zone: 'field', slot: `m${col}` }];
      if (r === 1) return [{ side: 'opp', zone: 'field', slot: `m${N + 1 - col}` }];
      if (r === 2 && x.emz && col === eL) return [{ side: 'me', zone: 'emz', slot: 'L' }, { side: 'opp', zone: 'emz', slot: 'R' }];
      if (r === 2 && x.emz && col === eR) return [{ side: 'me', zone: 'emz', slot: 'R' }, { side: 'opp', zone: 'emz', slot: 'L' }];
      return [];
    };
    const DIRS: Record<string, [number, number]> = { TL: [-1, -1], T: [-1, 0], TR: [-1, 1], L: [0, -1], R: [0, 1], BL: [1, -1], B: [1, 0], BR: [1, 1] };
    const places = [...Array.from({ length: N }, (_, i) => ({ zone: 'field', slot: `m${i + 1}`, r: 3, col: i + 1 })), ...(x.emz ? [{ zone: 'emz', slot: 'L', r: 2, col: eL }, { zone: 'emz', slot: 'R', r: 2, col: eR }] : [])];
    const rays = places.flatMap((p) => Object.entries(DIRS).flatMap(([a, [dr, dc]]) => cellAt(p.r + dr, p.col + dc).map((t) => ({ p, a, t }))));
    const at = (o: X, p: { zone: string; slot: string }) => AND(eq(g(o, 'zone'), p.zone), eq(g(o, 'slot'), p.slot));
    // does link $l point at object $u?
    fn('points', ['$l', '$u'], AND(isObj('$l'), isObj('$u'), gt(def('$l', 'linkN'), 0), OR(L(false), ...rays.map(({ p, a, t }) => AND(at('$l', p), ['in', L(a), def('$l', 'arrows')], at('$u', t),
      t.side === 'me' ? eq(ctrl('$u'), ctrl('$l')) : ne(ctrl('$u'), ctrl('$l')))))));
    // is field slot $s of player $p pointed at by one of $p's links?
    const mine = rays.filter((r) => r.t.side === 'me' && r.t.zone === 'field');
    fn('ptdSlot', ['$p', '$s'], ANY(flt(units(x, '$p'), gt(def('$it', 'linkN'), 0)), OR(L(false), ...mine.map(({ p, a, t }) => AND(at('$it', p), ['in', L(a), def('$it', 'arrows')], eq('$s', t.slot))))));
    fn('freeEMZ', ['$p'], x.emz ? Q(gt(cnt(cards('$p', 'emz')), 0), L([]), flt(L(['L', 'R']), AND(eq(cnt(['inSlot', '$p', 'emz', '$it']), 0), eq(cnt(['inSlot', ['opp', '$p'], 'emz', Q(eq('$it', 'L'), 'R', 'L')]), 0)))) : L([]));
    fn('mmz', ['$p'], ['freeSlots', '$p', 'field']);
    fn('edDest', ['$p'], cat(C('freeEMZ', '$p'), flt(['freeSlots', '$p', 'field'], C('ptdSlot', '$p', '$it'))));
    fn('anyDest', ['$p'], cat(C('freeEMZ', '$p'), ['freeSlots', '$p', 'field']));
    // place $c (in hand / extra deck) at one of $opts, attaching $mats under it
    const putMats = (pn: string): X[] => (bp.types.some((t) => t.method === 'xyz') ? [EACH('$mats', '$mt', [IF(eq(g('$mt', 'zone'), 'overlay'), [['link', '$mt', 'bearer', pn]], [['move', '$mt', 'overlay', { as: '$om' }], ['link', '$om', 'bearer', pn]])])] : []);
    const putAt = (z: string): X[] => [['move', '$c', z, { slot: '$ps', as: '$pn' }], IF(isObj('$pn'), [SET('$pn', 'newT', '$turn'), ...putMats('$pn'), emit('placed', { o: '$pn', p: ctrl('$pn') })])];
    proc('place', ['$c', '$opts', '$mats'], [IF(gt(cnt('$opts'), 0), [choose({ from: '$opts', min: 1, max: 1, as: '$ps', prompt: 'Which zone?' }),
      ...(x.emz ? [IF(inl('$ps', ['L', 'R']), putAt('emz'), putAt('field'))] : putAt('field'))])]);
  } else {
    fn('points', ['$l', '$u'], L(false));
  }
  const trib = [...r.tribute].sort((a, b) => b.level - a.level);
  fn('tribs', ['$c'], trib.reduce<X>((acc, t) => Q(ge(def('$c', 'level'), t.level), t.n, acc), 0));

  // ---- procedures
  proc('gainRes', ['$p', '$t', '$n'], x.pool ? [['gain', '$p', 'mana', ['tally', range('$n'), '$t']]] : []);
  proc('refill', ['$p'], x.pool && r.mode !== 'bank' ? [['empty', '$p', 'mana'],
    r.mode === 'ramp' ? ['gain', '$p', 'mana', ['tally', range(g('$p', 'cap')), 'c']] : ['gain', '$p', 'mana', ['tally', cards('$p', 'resources'), r.faceDown || x.recycle ? 'c' : g('$it', 'res')]]] : []);
  // skill checks: discard the top card of the deck and compare its check value with the need; ready foundations may make up the difference
  const foundT = bp.types.filter((t) => t.foundation).map((t) => t.id);
  const readyFound = (p: X) => flt(cat(cards(p, 'support'), ...(x.check ? [cards(p, 'pool')] : [])), AND(eq(g('$it', 'ex'), 0), inl(g('$it', 'type'), foundT)));
  if (x.check) proc('check', ['$p', '$need'], [SET('game', 'ck', 0),
    IF(eq(cnt(cards('$p', 'deck')), 0), [emit('emptyDeck', { p: '$p' }), ['lose', '$p']], [
      LET('$cc', first(['top', '$p', 'deck', 1])), LET('$cv', mx(0, def('$cc', x.CK))), LET('$cn', g('$cc', 'card')), ['move', '$cc', 'grave'],
      LET('$nd', add('$need', g('$p', 'pen'))), SET('$p', 'pen', 0),
      IF(ge('$cv', '$nd'), [SET('game', 'ck', 1), emit('checked', { p: '$p', card: '$cn', v: '$cv', need: '$nd', ok: 1 })], [
        LET('$sh', sub('$nd', '$cv')), LET('$fs', readyFound('$p')),
        IF(AND(gt(cnt('$fs'), 0), ge(cnt('$fs'), '$sh')), [
          choose({ who: '$p', from: L(['Commit foundations to pass', 'Let the check fail']), min: 1, max: 1, as: '$cq', prompt: 'Check failed: commit foundations (one per point short) to pass it?' }),
          IF(eq('$cq', 'Commit foundations to pass'), [choose({ who: '$p', from: '$fs', min: '$sh', max: '$sh', as: '$cm', prompt: 'Commit which foundations?', required: true }),
            EACH('$cm', '$cf', [SET('$cf', 'ex', 1)]), SET('game', 'ck', 1)])]),
        emit('checked', { p: '$p', card: '$cn', v: '$cv', need: '$nd', ok: g('game', 'ck') })])])]);
  proc('pitchPay', ['$c', '$need'], r.mode === 'pitch' ? [EACH(range('$need'), '$i', [IF(lt(g('$me', 'pp'), '$need'), [
    choose({ from: flt(cards('$me', 'hand'), AND(ne('$it', '$c'), gt(def('$it', pitchStat), 0))), min: 1, max: 1, as: '$pz', prompt: `Pitch a card for ${r.name}` }),
    IF(isObj('$pz'), [INC('$me', 'pp', def('$pz', pitchStat)), ['move', '$pz', 'pitch']])])]), INC('$me', 'pp', ['neg', '$need'])] : []);
  const triggerPlay = (card: string, pl: string): X[] => [IF(inl(g(card, 'role'), SPELLISH), [['move', card, 'limbo', { as: '$tl' }], IF(eq(def('$tl', 'hasEff'), 1), [['run', '$tl', 'effects']]),
    IF(eq(g('$tl', 'zone'), 'limbo'), [['move', '$tl', 'grave']])],
  [IF(AND(inl(g(card, 'role'), UNIT_ROLES), C('roomFor', card, pl)), [...UZ.map((z) => IF(eq(def(card, 'zone'), z), [['move', card, z, { as: '$tn' }], SET('$tn', 'newT', '$turn')]))])])];
  proc('hitN', ['$p', '$hits', '$amt', '$src'], [
    ...(x.lifeCards ? [EACH(range('$hits'), '$i', [IF(eq(cnt(cards('$p', 'life')), 0), [['lose', '$p']], [LET('$lc', first(['top', '$p', 'life', 1])), ...(x.hasRule('banish') ? [IF(AND(isObj('$src'), has('$src', 'banish')), [['move', '$lc', 'grave'], emit('lifeLost', { p: '$p', banished: 1 })], [
      ['move', '$lc', 'hand', { as: '$lh' }], emit('lifeLost', { p: '$p' }),
      ...(bp.win.lifeTriggers ? [IF(has('$lh', 'trigger'), [choose({ who: '$p', from: L(['Use its trigger', 'Keep it in hand']), min: 1, max: 1, as: '$tu', prompt: 'A life card with a trigger! Use it for free?' }),
        IF(eq('$tu', 'Use its trigger'), triggerPlay('$lh', '$p'))])] : [])])] : [['move', '$lc', 'hand', { as: '$lh' }], emit('lifeLost', { p: '$p' }),
      ...(bp.win.lifeTriggers ? [IF(has('$lh', 'trigger'), [choose({ who: '$p', from: L(['Use its trigger', 'Keep it in hand']), min: 1, max: 1, as: '$tu', prompt: 'A life card with a trigger! Use it for free?' }),
        IF(eq('$tu', 'Use its trigger'), triggerPlay('$lh', '$p'))])] : [])])])])]
      : x.life ? [['damage', '$p', '$amt', '$src']] : [])]);
  proc('discardN', ['$p', '$n'], [LET('$k', mn('$n', cnt(cards('$p', 'hand')))), IF(gt('$k', 0), [
    choose({ who: '$p', from: cards('$p', 'hand'), min: '$k', max: '$k', as: '$ds', prompt: 'Discard' }), ['move', '$ds', 'grave']])]);
  const kept = (bp.statuses ?? []).filter((s) => !(s.activeOnly && c.mode === 'duel'));
  proc('moveKeep', ['$u', '$z'], [LET('$atts', ['linked', '$u', 'bearer']), LET('$d', g('$u', 'dmg')), LET('$nt', g('$u', 'newT')), LET('$ex', g('$u', 'ex')),
    ...kept.flatMap((s) => [LET(`$k_${s.id}`, g('$u', `st_${s.id}`)), LET(`$kt_${s.id}`, g('$u', `sT_${s.id}`))]),
    ...UZ.map((z) => IF(eq('$z', z), [['move', '$u', z, { as: '$nw' }], SET('$nw', 'dmg', '$d'), SET('$nw', 'newT', '$nt'), SET('$nw', 'ex', '$ex'),
      ...kept.flatMap((s) => [SET('$nw', `st_${s.id}`, `$k_${s.id}`), SET('$nw', `sT_${s.id}`, `$kt_${s.id}`)]),
      IF(gt(cnt('$atts'), 0), [['link', '$atts', 'bearer', '$nw']])]))]);
  proc('dmgTo', ['$o', '$n', '$src'], [IF(isP('$o'), [C('hitN', '$o', '$n', '$n', '$src')], [IF(AND(isObj('$o'), eq(g('$o', 'role'), 'walker')), [INC('$o', 'loy', ['neg', '$n']), emit('walkerHit', { o: '$o', n: '$n', src: '$src' })], [IF(isObj('$o'),
    HP ? [IF(atLeader('$o'), [C('hitN', ctrl('$o'), '$n', '$n', '$src')], [['damage', '$o', '$n', '$src']])]
      : [IF(atLeader('$o'), [C('hitN', ctrl('$o'), 1, '$n', '$src')], [IF(ge('$n', C('pw', '$o')), [['destroy', '$o']])])])])])]);
  proc('healTo', ['$o', '$n'], [IF(isP('$o'), x.life ? [INC('$o', 'life', '$n')] : [], [IF(isObj('$o'), [SET('$o', 'dmg', mx(0, sub(g('$o', 'dmg'), '$n')))])])]);
  proc('strike', ['$s', '$t', '$n'], [IF(AND(gt('$n', 0), isObj('$t')), [
    HP ? ['damage', '$t', '$n', '$s'] : IF(ge('$n', C('pw', '$t')), [['destroy', '$t']]),
    IF(has('$s', 'deadly'), [['destroy', '$t']]),
    ...(x.life ? [IF(has('$s', 'lifesteal'), [INC(ctrl('$s'), 'life', '$n')])] : [])])]);
  proc('hitBy', ['$p', '$a', '$amt'], [C('hitN', '$p', Q(has('$a', 'double'), 2, 1), Q(has('$a', 'double'), mul('$amt', 2), '$amt'), '$a'),
    ...(x.life ? [IF(has('$a', 'lifesteal'), [INC(ctrl('$a'), 'life', '$amt')])] : []), emit('hit', { src: '$a', p: ctrl('$a'), d: '$p' })]);

  // ---- battle (block / target / cards modes)
  const A = '$win.attacker', T = '$win.target', D = '$win.defender';
  proc('declare', [], [SET('game', 'bat', add(seat(ctrl(A)), 1)), IF(AND(NOT(has(A, 'vigilance')), inl(g(A, 'zone'), [...UZ, 'leader'])), [SET(A, 'ex', 1)]),
    ...(x.hasRule('extraAttack') ? [IF(AND(has(A, 'extraAttack'), ne(g(A, 'xa'), '$turn')), [SET(A, 'ex', 0), SET(A, 'xa', '$turn')])] : []),
    IF(AND(isObj(T), g(T, 'faceDown')), [['flip', T]]),
    IF(gt(def(A, 'kw_challenger'), 0), [['modify', A, { layer: 'add', mods: [{ op: 'add', stat: POW, value: def(A, 'kw_challenger') }], until: 'turn' }]]),
    emit('attack', { o: A, p: ctrl(A), t: T })]);
  const canBlock = AND(eq(g('$it', 'ex'), 0), NOT(has('$it', 'noBlock')), NOT(has(A, 'unblockable')), ...stopped('$it', 'block'), ...vehicleOK('$it'));
  const blockers = (who: X) => flt(units(x, who, atkZ), AND(canBlock, OR(NOT(has(A, 'flying')), has('$it', 'flying'), has('$it', 'reach'))));
  if (c.mode === 'block') {
    const many = (c.maxBlockers ?? 1) > 1;
    proc('block', [], many
      ? [choose({ who: D, from: blockers(D), min: 0, max: c.maxBlockers, as: '$bs', prompt: `Block with up to ${c.maxBlockers} units (none: take the hit)` }),
        IF(gt(cnt('$bs'), 0), [['winSet', 'blockers', '$bs'], emit('blocked', { n: cnt('$bs') })])]
      : [choose({ who: D, from: blockers(D), min: 0, max: 1, as: '$b', prompt: 'Block with which unit? (none: take the hit)' }),
        IF(isObj('$b'), [['winSet', 'blockers', ['list', '$b']], emit('blocked', { o: '$b' })])]);
    const fsA = has(A, 'firstStrike');
    proc('battle', [], [IF(isObj(A), [LET('$bl', flt('$win.blockers', isObj('$it'))), IF(gt(cnt('$bl'), 0), [
      LET('$bFirst', AND(ANY('$bl', has('$it', 'firstStrike')), NOT(fsA))),
      IF('$bFirst', [EACH(flt('$bl', has('$it', 'firstStrike')), '$b', [C('strike', '$b', A, C('pw', '$b'))])]),
      IF(alive(A), [SET('game', 'rem', C('pw', A)), EACH('$bl', '$b', [LET('$k', mn(g('game', 'rem'), mx(1, hpl('$b')))), C('strike', A, '$b', '$k'), INC('game', 'rem', ['neg', '$k'])]),
        IF(AND(has(A, 'overflow'), gt(g('game', 'rem'), 0)), [C('hitN', D, 1, g('game', 'rem'), A)])]),
      EACH('$bl', '$b', [IF(AND(NOT(AND('$bFirst', has('$b', 'firstStrike'))), OR(NOT(AND(fsA, NOT(has('$b', 'firstStrike')))), alive('$b')), isObj(A)), [C('strike', '$b', A, C('pw', '$b'))])])],
    [C('hitBy', D, A, C('pw', A))])])]);
  } else if (c.mode === 'target') {
    proc('block', [], [choose({ who: D, from: flt(units(x, D, atkZ), AND(has('$it', 'blocker'), canBlock, ne('$it', T))), min: 0, max: 1, as: '$b', prompt: 'Redirect the attack to a blocker? (none: let it through)' }),
      IF(isObj('$b'), [SET('$b', 'ex', 1), ['winSet', 'target', '$b'], emit('blocked', { o: '$b' })])]);
    const cmp = c.compare;
    const wins = cmp.ties === 'defender' ? ge('$pa', '$dv') : gt('$pa', '$dv');
    const unitFight = HP
      ? [LET('$pa', C('pw', A)), LET('$pb', C('pw', T)), LET('$left', hpl(T)), C('strike', A, T, '$pa'), C('strike', T, A, '$pb'),
        IF(AND(has(A, 'overflow'), gt(sub('$pa', '$left'), 0)), [C('hitN', D, 1, sub('$pa', '$left'), A)])]
      : [LET('$pa', C('pw', A)), LET('$def', eq(g(T, 'pos'), 1)), LET('$dv', Q('$def', DEF ? g(T, DEF) : C('pw', T), C('pw', T))),
        IF(wins, [['destroy', T], ...(cmp.overflow ? [IF(AND(OR(NOT('$def'), has(A, 'overflow')), gt(sub('$pa', '$dv'), 0)), [C('hitN', D, 1, sub('$pa', '$dv'), A)])] : [])],
          [IF(lt('$pa', '$dv'), [...(cmp.loser ? [IF(NOT('$def'), [['destroy', A]])] : []), ...(cmp.overflow ? [C('hitN', ctrl(A), 1, sub('$dv', '$pa'), T)] : [])],
            cmp.ties === 'both' ? [IF(NOT('$def'), [['destroy', A], ['destroy', T]])] : [])])];
    proc('battle', [], [IF(AND(isObj(A)), [
      IF(isP(T), [C('hitBy', T, A, C('pw', A))], [IF(isObj(T), [
        IF(atLeader(T), c.leaderDefends ? [IF(ge(C('pw', A), C('pw', T)), [C('hitBy', ctrl(T), A, C('pw', A))])] : [C('hitBy', ctrl(T), A, C('pw', A))], unitFight)])])])]);
  } else if (c.mode === 'cards' && c.zones) {
    // zone combat: block from hand with a card whose block zone is the attack's zone or next to it, passing a check of speed + its block modifier
    proc('block', [], [LET('$zA', g(A, 'azone')),
      choose({ who: D, from: flt(cards(D, 'hand'), AND(gt(def('$it', 'bzone'), 0), le(['abs', sub(def('$it', 'bzone'), '$zA')], 1))), min: 0, max: 1, as: '$bk', prompt: 'Block with which card? (none: take the hit)' }),
      IF(isObj('$bk'), [LET('$bz', def('$bk', 'bzone')), LET('$need', add(g(A, 'speed'), mx(0, def('$bk', 'bmod')), cnt(cards(D, 'pool')))),
        ['move', '$bk', x.check ? 'pool' : 'grave', { as: '$bp' }], ...(x.check ? [C('check', D, '$need')] : [SET('game', 'ck', 1)]),
        IF(eq(g('game', 'ck'), 1), [['winSet', 'guard', Q(eq('$bz', '$zA'), 2, 1)], emit('blocked', { o: '$bp', p: D, full: eq('$bz', '$zA') }),
          ...(x.hasRule('breaker') ? [IF(gt(def('$bp', 'kw_breaker'), 0), [INC(ctrl(A), 'pen', def('$bp', 'kw_breaker')), emit('breaker', { p: ctrl(A), n: def('$bp', 'kw_breaker') })])] : [])],
          [IF(isObj('$bp'), [['move', '$bp', 'grave']]), emit('blockFailed', { p: D })])])]);
    proc('battle', [], [LET('$dm', mx(0, C('pw', A))), LET('$hit', Q(eq('$win.guard', 2), 0, Q(eq('$win.guard', 1), ['/', add('$dm', 1), 2], '$dm'))),
      IF(gt('$hit', 0), [C('hitN', D, 1, '$hit', A), IF(isObj(A), [SET(A, 'hitd', 1)]), emit('hit', { src: A, p: ctrl(A), d: D, n: '$hit' }), IF(AND(isObj(A), eq(def(A, 'hasHit'), 1)), [['run', A, 'onHit']])])]);
  } else if (c.mode === 'cards') {
    const bs = c.blockStat ?? 'defense';
    proc('block', [], [choose({ who: D, from: cat(flt(cards(D, 'hand'), gt(def('$it', bs), 0)), flt(cards(D, 'support'), AND(gt(g('$it', bs), 0), eq(g('$it', 'ex'), 0)))), min: 0, max: 6, as: '$bs', prompt: 'Block with cards from your hand (and ready equipment)' }),
      IF(gt(cnt('$bs'), 0), [['winSet', 'guard', SUM('$bs', g('$it', bs))], EACH('$bs', '$bc', [IF(eq(g('$bc', 'zone'), 'hand'), [['move', '$bc', 'grave']], [SET('$bc', 'ex', 1)])]),
        emit('blocked', { n: cnt('$bs') })])]);
    proc('battle', [], [LET('$pw', Q(gt('$win.power', 0), '$win.power', C('pw', A))), LET('$hit', mx(0, sub('$pw', '$win.guard'))),
      IF(gt('$hit', 0), [C('hitN', D, 1, '$hit', A), emit('hit', { src: A, p: ctrl(A), d: D }), IF(AND(isObj(A), eq(def(A, 'hasHit'), 1)), [['run', A, 'onHit']])])]);
  }

  // ---- lanes (shared battlefields)
  if (c.mode === 'lanes') {
    const spread = (list: X, amount: string): X[] => [SET('game', 'rem', amount), EACH(['sortBy', list, hpl('$it')], '$u', [LET('$k', mn(g('game', 'rem'), mx(0, hpl('$u')))),
      IF(gt('$k', 0), [HP ? ['damage', '$u', '$k', '$p'] : IF(ge('$k', C('pw', '$u')), [['destroy', '$u']])]), INC('game', 'rem', ['neg', '$k'])])];
    proc('showdown', ['$z', '$p'], [...lanes.map((z) => IF(eq('$z', z), [LET('$mine', cards('$p', z)), LET('$theirs', cards(['opp', '$p'], z)),
      IF(AND(gt(cnt('$mine'), 0), gt(cnt('$theirs'), 0)), [LET('$a', SUM('$mine', C('pw', '$it'))), LET('$b', SUM('$theirs', C('pw', '$it'))),
        emit('showdownFight', { z, p: '$p', a: '$a', b: '$b' }), ...spread('$theirs', '$a'), ...spread('$mine', '$b')])])), emit('showdown', { z: '$z', p: '$p' })]);
  }
  // ---- mass combat (block mode): all attackers at once, blockers per attacker, first-strike and regular damage steps
  const walkers = (p: X) => flt(cards(p, 'support'), eq(g('$it', 'role'), 'walker'));
  if (c.mode === 'block' && c.mass) {
    const AP = '$win.attacker', DP = '$win.defender';
    const ATK = flt(units(x, AP), eq(g('$it', 'atk'), 1));
    const BLK = (a: X) => ['linked', a, 'blocks'];
    proc('cdmg', ['$s', '$t', '$n'], [IF(AND(gt('$n', 0), isObj('$t')), [['damage', '$t', '$n', '$s'], IF(has('$s', 'deadly'), [SET('$t', 'dtd', 1)]),
      ...(x.life ? [IF(has('$s', 'lifesteal'), [INC(ctrl('$s'), 'life', '$n')])] : [])])]);
    proc('mHit', ['$a', '$n'], [LET('$tg', g('$a', 'atkTo')), IF(isObj('$tg'), [INC('$tg', 'loy', ['neg', '$n']), emit('walkerHit', { o: '$tg', n: '$n', src: '$a' }),
      ...(x.life ? [IF(has('$a', 'lifesteal'), [INC(ctrl('$a'), 'life', '$n')])] : [])], [C('hitBy', DP, '$a', '$n')])]);
    proc('mDeclare', [], [EACH(ATK, '$a', [IF(NOT(has('$a', 'vigilance')), [SET('$a', 'ex', 1)]),
      emit('attack', { o: '$a', p: ctrl('$a'), t: Q(isObj(g('$a', 'atkTo')), g('$a', 'atkTo'), DP) })])]);
    proc('mBlocks', [], [EACH(ATK, '$a', [LET('$el', flt(units(x, DP), AND(eq(g('$it', 'ex'), 0), NOT(isObj(g('$it', 'blocks'))), NOT(has('$it', 'noBlock')), ...stopped('$it', 'block'), ...vehicleOK('$it'),
        OR(NOT(has('$a', 'flying')), has('$it', 'flying'), has('$it', 'reach'))))),
      IF(AND(gt(cnt('$el'), 0), NOT(has('$a', 'unblockable'))), [emit('blockAsk', { a: '$a', p: DP }),
        choose({ who: DP, from: '$el', min: 0, max: 30, as: '$bs', prompt: 'Block the attacker shown in the caption: choose any of your units (none: no block)' }),
        IF(AND(has('$a', 'menace'), eq(cnt('$bs'), 1)), [emit('menace', { a: '$a' })],
          [EACH('$bs', '$b', [['link', '$b', 'blocks', '$a'], emit('blocked', { o: '$b', a: '$a' })]), IF(gt(cnt('$bs'), 0), [SET('$a', 'blkd', 1)])])])])]);
    const deals = (u: X, step: 1 | 2) => (step === 1 ? OR(has(u, 'firstStrike'), has(u, 'doubleStrike')) : OR(NOT(has(u, 'firstStrike')), has(u, 'doubleStrike')));
    const dmgStep = (step: 1 | 2): X[] => [
      EACH(flt(ATK, deals('$it', step)), '$a', [LET('$bl', ['sortBy', BLK('$a'), hpl('$it')]), LET('$pa', C('fpw', '$a')),
        IF(eq(g('$a', 'blkd'), 1), [SET('game', 'rem', '$pa'),
          EACH('$bl', '$b', [LET('$k', mn(g('game', 'rem'), mx(0, Q(has('$a', 'deadly'), mn(1, hpl('$b')), hpl('$b'))))), IF(gt('$k', 0), [C('cdmg', '$a', '$b', '$k')]), INC('game', 'rem', ['neg', '$k'])]),
          IF(gt(g('game', 'rem'), 0), [IF(has('$a', 'overflow'), [C('mHit', '$a', g('game', 'rem'))], [IF(gt(cnt('$bl'), 0), [C('cdmg', '$a', first('$bl'), g('game', 'rem'))])])])],
        [C('mHit', '$a', '$pa')])]),
      EACH(flt(units(x, DP), AND(isObj(g('$it', 'blocks')), deals('$it', step))), '$b', [LET('$ta', g('$b', 'blocks')), IF(isObj('$ta'), [C('cdmg', '$b', '$ta', C('fpw', '$b'))])])];
    proc('mFirst', [], [IF(ANY(cat(ATK, flt(units(x, DP), isObj(g('$it', 'blocks')))), OR(has('$it', 'firstStrike'), has('$it', 'doubleStrike'))), dmgStep(1))]);
    proc('mDamage', [], [...dmgStep(2), EACH(cat(units(x, AP), units(x, DP)), '$q', [SET('$q', 'atk', 0), SET('$q', 'blkd', 0)]), ['unlink', cat(units(x, AP), units(x, DP)), 'blocks'], ['unlink', cat(units(x, AP), units(x, DP)), 'atkTo']]);
  }
  // ---- conquest lanes: showdown window -> fight (Tank first, lethal damage, heal, recall on a tie) -> settle control -> conquer scoring
  const pts = bp.win.points || (c.mode === 'lanes' ? 8 : c.quest ? 20 : 0);
  if (conq) {
    const OPP = ['opp', '$p'];
    const spreadT = (list: X, amount: string, src: X): X[] => [SET('game', 'rem', amount), EACH(['sortBy', list, add(hpl('$it'), Q(has('$it', 'tank'), -1000, 0))], '$u', [LET('$k', mn(g('game', 'rem'), mx(0, hpl('$u')))),
      IF(gt('$k', 0), [['damage', '$u', '$k', src]]), INC('game', 'rem', ['neg', '$k'])])];
    const fightPw = (u: X) => C('fpw', u);
    // the assigner picks who receives lethal damage next (Tank units first); damage is dealt after both sides assign
    const assign = (list: X, amount: string, who: X): X[] => [SET('game', 'rem', amount), EACH(range(12), '$ag', [LET('$cands', flt(list, gt(sub(hpl('$it'), g('$it', 'pd')), 0))),
      IF(AND(gt(g('game', 'rem'), 0), gt(cnt('$cands'), 0)), [
        choose({ who, from: Q(ANY('$cands', has('$it', 'tank')), flt('$cands', has('$it', 'tank')), '$cands'), min: 1, max: 1, as: '$at', prompt: 'Assign lethal damage to which enemy unit next?' }),
        LET('$k', mn(g('game', 'rem'), sub(hpl('$at'), g('$at', 'pd')))), INC('$at', 'pd', '$k'), INC('game', 'rem', ['neg', '$k'])])])];
    const runAll = (field: string, flag: string, lane: string, i: number): X[] => [
      ...(x.sites ? [LET('$st', first(cards('*', `site${i + 1}`))), IF(AND(isObj('$st'), eq(def('$st', flag), 1)), [['run', '$st', field]])] : []),
      EACH(flt(cards('$p', lane), eq(def('$it', flag), 1)), '$cu', [['run', '$cu', field]])];
    proc('conquer', ['$i', '$p'], lanes.map((z, i) => IF(eq('$i', i + 1), [SET('game', `c${i + 1}`, add(seat('$p'), 1)),
      ...(x.sites ? [LET('$st', first(cards('*', `site${i + 1}`))), IF(AND(isObj('$st'), ne(ctrl('$st'), '$p')), [['control', '$st', '$p']])] : []),
      IF(ne(g('game', `s${i + 1}`), '$turn'), [SET('game', `s${i + 1}`, '$turn'),
        ...(c.finalPoint ? [IF(AND(ge(add(g('$p', 'score'), 1), pts), NOT(AND(L(true), ...lanes.map((_, j) => (j === i ? L(true) : eq(g('game', `s${j + 1}`), '$turn')))))),
          [['draw', '$p', 1], emit('finalPoint', { p: '$p', z })], [INC('$p', 'score', 1), emit('conquer', { p: '$p', z })])] : [INC('$p', 'score', 1), emit('conquer', { p: '$p', z })])],
        [emit('retaken', { p: '$p', z })]),
      ...runAll('onConquer', 'hasConq', z, i)])));
    proc('settle', ['$i', '$p'], lanes.map((z, i) => IF(eq('$i', i + 1), [LET('$m', cnt(cards('$p', z))), LET('$o', cnt(cards(OPP, z))),
      IF(AND(gt('$m', 0), eq('$o', 0), ne(g('game', `c${i + 1}`), add(seat('$p'), 1))), [C('conquer', i + 1, '$p')]),
      IF(AND(eq('$m', 0), gt('$o', 0)), [SET('game', `c${i + 1}`, add(seat(OPP), 1))])])));
    proc('fight', ['$i', '$p'], [...lanes.map((z, i) => IF(eq('$i', i + 1), [LET('$mine', cards('$p', z)), LET('$theirs', cards(OPP, z)),
      IF(AND(gt(cnt('$mine'), 0), gt(cnt('$theirs'), 0)), [EACH('$mine', '$q', [SET('$q', 'atk', 1)]), EACH('$theirs', '$q', [SET('$q', 'dfn', 1)]),
        LET('$a', SUM('$mine', fightPw('$it'))), LET('$b', SUM('$theirs', fightPw('$it'))), emit('showdownFight', { z, p: '$p', a: '$a', b: '$b' }),
        ...(c.assignDamage ? [...assign('$theirs', '$a', '$p'), ...assign('$mine', '$b', OPP), EACH(cat('$mine', '$theirs'), '$q', [IF(gt(g('$q', 'pd'), 0), [['damage', '$q', g('$q', 'pd')], SET('$q', 'pd', 0)])])]
          : [...spreadT('$theirs', '$a', '$p'), ...spreadT('$mine', '$b', OPP)]),
        EACH(flt(cat(cards('$p', z), cards(OPP, z)), ge(g('$it', 'dmg'), hpOf('$it'))), '$dd', [['destroy', '$dd']]),
        EACH(cat(cards('$p', z), cards(OPP, z)), '$q', [SET('$q', 'atk', 0), SET('$q', 'dfn', 0), SET('$q', 'dmg', 0)]),
        IF(AND(gt(cnt(cards('$p', z)), 0), gt(cnt(cards(OPP, z)), 0)), [EACH(cards('$p', z), '$q', [C('moveKeep', '$q', 'base')]), emit('recalled', { p: '$p', z })])])])),
      C('settle', '$i', '$p')]);
    proc('arrive', ['$i', '$p'], lanes.map((z, i) => IF(eq('$i', i + 1), [
      IF(OR(gt(cnt(cards(OPP, z)), 0), eq(g('game', `c${i + 1}`), add(seat(OPP), 1))),
        [['openWindow', 'showdown', { data: { i: i + 1, p: '$p', defender: OPP } }]], [C('settle', i + 1, '$p')])])));
  }

  // ---- zones
  const usesUnder = bp.cards.some((k) => k.shift) || x.hasRule('boost');
  const zones: Record<string, any>[] = [
    { id: 'deck', vis: 'hidden', ordered: true },
    { id: 'hand', vis: 'owner' },
  ];
  if (r.mode === 'deck') zones.push({ id: 'resdeck', vis: 'hidden', ordered: true, hideEmpty: true });
  if (x.leader) zones.push({ id: 'leader', vis: 'public', abilities: true, hideEmpty: true });
  if (bp.setup.champion) zones.push({ id: 'champion', vis: 'public', hideEmpty: true });
  if (x.sites) zones.push({ id: 'sites', vis: 'owner', hideEmpty: true });
  for (const z of x.emz ? ['emz', ...UZ.filter((q) => q !== 'emz')] : UZ) {
    if (x.sites && z.startsWith('lane')) zones.push({ id: `site${z.slice(4)}`, vis: 'public', abilities: true, hideEmpty: true });
    const gridSlots = x.grid && z === 'field' ? { slots: Array.from({ length: c.fieldSize }, (_, i) => ({ id: `m${i + 1}`, tags: ['board'] })) }
      : z === 'emz' ? { slots: [{ id: 'L', tags: ['extra'] }, { id: 'R', tags: ['extra'] }] } : {};
    zones.push({ id: z, vis: 'public', abilities: true, ...(z.startsWith('lane') || arenas || z === 'emz' ? { showIf: L(true) } : {}), ...(!x.hasRole(...UNIT_ROLES) ? { hideEmpty: true } : {}), ...gridSlots });
  }
  zones.push({ id: 'support', vis: 'public', abilities: true, hideEmpty: !x.grid, ...(x.grid ? { showIf: L(true), slots: Array.from({ length: 5 }, (_, i) => ({ id: `s${i + 1}`, tags: ['support'] })) } : {}) });
  if (bp.types.some((t) => t.method === 'xyz')) zones.push({ id: 'overlay', vis: 'public', hideEmpty: true });
  if (x.hasRole('location')) zones.push({ id: 'locations', vis: 'public', abilities: true, showIf: L(true) });
  if (usesUnder) zones.push({ id: 'under', vis: 'public', hideEmpty: true });
  if (conq && x.hasRule('hidden')) lanes.forEach((_, i) => zones.push({ id: `hid${i + 1}`, vis: 'owner', hideEmpty: true }));
  if (bp.cards.some((k) => k.scale)) zones.push({ id: 'pextra', vis: 'public', hideEmpty: true });
  const usesEff = (...ks: string[]) => { const walk = (l: Effect[] = []): boolean => l.some((e) => ks.includes(e.k) || walk(e.heads) || walk(e.tails) || walk(e.then) || (e.ranges ?? []).some((r) => walk(r.do)));
    return bp.cards.some((k) => k.abilities.some((a) => walk(a.do)) || (k.moves ?? []).some((m) => walk(m.do))) || bp.keywords.some((k) => (k.abilities ?? []).some((a) => walk(a.do))); };
  if (usesEff('dig', 'tutor')) zones.push({ id: 'look', vis: 'owner', hideEmpty: true });
  if (['cards', 'anycard', 'deck'].includes(r.mode)) zones.push({ id: 'resources', vis: 'public', compact: true });
  if (r.mode === 'pitch') zones.push({ id: 'pitch', vis: 'public', hideEmpty: true });
  if (x.check) zones.push({ id: 'pool', vis: 'public', abilities: true, ordered: true, showIf: L(true) });
  if (x.zonesC) zones.push({ id: 'momentum', vis: 'public', hideEmpty: true });
  if (x.runs) { for (const v of runServers(bp)) { if (v.content) zones.push({ id: v.content, vis: 'public', abilities: true, hideEmpty: true }); zones.push({ id: v.ice, vis: 'public', abilities: true, hideEmpty: true }); }
    zones.push({ id: 'scored', vis: 'public', hideEmpty: true }); }
  if (x.lifeCards) zones.push({ id: 'life', vis: 'hidden', ordered: true });
  if (x.prizes) zones.push({ id: 'prizes', vis: 'hidden' });
  if (x.hasRole('extra')) zones.push({ id: 'extra', vis: 'owner', hideEmpty: true });
  for (const z of bp.zones ?? []) zones.push({ id: z.id, vis: z.vis, hideEmpty: true, ...(z.inPlay ? { abilities: true } : {}), ...(z.vis !== 'public' ? { ordered: true } : {}) });
  zones.push({ id: 'banished', vis: 'public', hideEmpty: true }, { id: 'limbo', vis: 'public', hideEmpty: true }, { id: 'grave', vis: 'public', ordered: true }, { id: 'void', vis: 'public', offTable: true });

  // ---- setup
  const P0 = '$p';
  const H0: X = bp.setup.leaderHand && x.leader ? mx(1, def(first(cards(P0, 'leader')), bp.setup.leaderHand)) : bp.setup.hand;
  const setup: X[] = [['random', { from: ['players'], as: '$f' }], ['firstPlayer', '$f'], SET('game', 'first', seat('$f')),
    EACH(['players'], P0, [
      ['shuffle', P0, 'deck'], ...(r.mode === 'deck' ? [['shuffle', P0, 'resdeck']] : []),
      ...(r.mode === 'ramp' ? [SET(P0, 'cap', r.start - r.perTurn)] : []),
      ['draw', P0, H0],
      ...(x.sides && x.leader ? [SET(P0, 'side', mx(0, def(first(cards(P0, 'leader')), 'side')))] : []),
      ...(r.mode === 'bank' ? [C('gainRes', P0, 'c', r.start)] : []),
      ...(bp.setup.leaderLife && x.leader ? [SET(P0, 'life', mx(1, def(first(cards(P0, 'leader')), bp.setup.leaderLife)))] : []),
      ...(x.sites ? [['random', { from: cards(P0, 'sites'), as: '$sp' }], IF(isObj('$sp'), lanes.slice(0, 2).map((_, i) => IF(eq(seat(P0), i), [['move', '$sp', `site${i + 1}`]])))] : []),
      ...(bp.setup.mulligan && (bp.setup.mulliganN ?? 0) > 0 ? [choose({ who: P0, from: cards(P0, 'hand'), min: 0, max: bp.setup.mulliganN, as: '$mg', prompt: `Mulligan: choose up to ${bp.setup.mulliganN} cards to put on the bottom of your deck and redraw (or none to keep)` }),
        IF(gt(cnt('$mg'), 0), [['move', '$mg', 'deck'], ['draw', P0, cnt('$mg')]])] : []),
      ...(bp.setup.mulligan && bp.setup.london ? [EACH(range(6), '$lm', [IF(eq(g(P0, 'kept'), 0), [
          choose({ who: P0, from: L(['Keep', 'Mulligan']), min: 1, max: 1, as: '$mu', prompt: 'Keep this hand, or mulligan? (a mulligan draws a new hand; then you put 1 card on the bottom per mulligan)' }),
          IF(eq('$mu', 'Mulligan'), [['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, H0], INC(P0, 'mulls', 1), emit('mulligan', { p: P0 })], [SET(P0, 'kept', 1)])])]),
        IF(gt(g(P0, 'mulls'), 0), [choose({ who: P0, from: cards(P0, 'hand'), min: g(P0, 'mulls'), max: g(P0, 'mulls'), as: '$lb', prompt: 'Put that many cards (one per mulligan) on the bottom of your deck' }), ['move', '$lb', 'deck']])] : []),
      ...(bp.setup.mulligan && !bp.setup.london && !((bp.setup.mulliganN ?? 0) > 0) ? [choose({ who: P0, from: L(['Keep', 'Mulligan']), min: 1, max: 1, as: '$mu', prompt: `Keep this hand, or mulligan (shuffle it back and draw ${bp.setup.hand})?` }),
        IF(eq('$mu', 'Mulligan'), [['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, H0]])] : []),
      ...(c.mode === 'duel' ? [EACH(range(bp.setup.mulliganBonus ? 20 : 4), '$try', [IF(eq(cnt(cards(P0, 'active')), 0), [
        IF(ANY(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), [
          choose({ who: P0, from: flt(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), min: 1, max: 1, as: '$ac', prompt: 'Choose your starting active unit' }),
          ['move', '$ac', 'active', { as: '$an' }]],
        [...(bp.setup.mulliganBonus ? [INC(P0, 'mull', 1), emit('mulligan', { p: P0 })] : []), ['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, H0]])])]),
        ...(bp.setup.benchSetup ? [IF(gt(cnt(cards(P0, 'active')), 0), [choose({ who: P0, from: flt(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), min: 0, max: c.benchSize, as: '$bz', prompt: 'Put any basic units on your bench' }),
          ['move', '$bz', 'bench']])] : [])] : []),
      ...(x.lifeCards ? [x.leader ? LET('$ld', first(cards(P0, 'leader'))) : LET('$ld', 0), ['move', ['top', P0, 'deck', Q(AND(isObj('$ld'), gt(g('$ld', 'life'), 0)), g('$ld', 'life'), bp.win.lifeCards || 5)], 'life']] : []),
      ...(x.prizes ? [['move', ['top', P0, 'deck', bp.win.prizes], 'prizes']] : []),
    ]),
    ...(c.mode === 'duel' && bp.setup.mulliganBonus ? [EACH(['players'], '$p', [LET('$om', g(['opp', '$p'], 'mull')), IF(gt('$om', 0), [['draw', '$p', '$om'], emit('mulliganBonus', { p: '$p', n: '$om' })])])] : []),
    ...(x.sides ? [LET('$s0', first(flt(['players'], eq(g('$it', 'side'), 0)))), IF(isP('$s0'), [['firstPlayer', '$s0'], SET('game', 'first', seat('$s0'))])] : []),
    SET('game', 'started', 1)];

  // ---- turn
  const ME = '$active';
  const untapOf = (p: X) => EACH(cat(units(x, p), cards(p, 'support'), ...(x.leader ? [cards(p, 'leader')] : []), ...(zones.some((z) => z.id === 'resources') ? [cards(p, 'resources')] : [])), '$x', [SET('$x', 'ex', 0)]);
  const resourceStep: X[] = [
    ...(r.mode === 'ramp' ? [SET(ME, 'cap', mn(r.max, add(g(ME, 'cap'), r.perTurn)))] : []),
    ...(r.mode === 'deck' ? [['move', ['top', ME, 'resdeck', Q(AND(eq(g(ME, 'turns'), 1), eq(seat(ME), g('game', 'first'))), r.start,
      r.secondBonus ? Q(eq(g(ME, 'turns'), 1), r.perTurn + r.secondBonus, r.perTurn) : r.perTurn)], 'resources']] : []),
    C('refill', ME)];
  const hold: X[] = conq ? [LET('$p', ME), ...lanes.map((z, i) => IF(AND(eq(g('game', `c${i + 1}`), add(seat(ME), 1)), gt(cnt(cards(ME, z)), 0)), [INC(ME, 'score', 1), SET('game', `s${i + 1}`, '$turn'), emit('hold', { p: ME, z }),
    ...(x.sites ? [LET('$st', first(cards('*', `site${i + 1}`))), IF(AND(isObj('$st'), eq(def('$st', 'hasHold'), 1)), [['run', '$st', 'onHold']])] : []),
    EACH(flt(cards(ME, z), eq(def('$it', 'hasHold'), 1)), '$cu', [['run', '$cu', 'onHold']])]))]
    : c.mode === 'lanes' ? lanes.map((z, i) => IF(AND(eq(g('game', `c${i + 1}`), add(seat(ME), 1)), gt(cnt(cards(ME, z)), 0)), [INC(ME, 'score', 1), emit('hold', { p: ME, z })])) : [];
  const temp: X[] = x.hasRule('temporary') ? [EACH(flt(units(x, ME), AND(has('$it', 'temporary'), lt(g('$it', 'newT'), '$turn'))), '$tq', [['destroy', '$tq']])] : [];
  const hasResPhase = bp.turn.some((p) => p.kind === 'resource');
  const ST = bp.statuses ?? [];
  const stTicks = (when: string, list: X): X[] => ST.filter((s) => (s.tickWhen ?? 'betweenTurns') === when && (s.tickDamage || s.tickFlip)).map((s) => EACH(flt(list, gt(g('$it', `st_${s.id}`), 0)), '$su', [
    ...(s.tickDamage ? [['damage', '$su', mul(s.tickDamage, g('$su', `st_${s.id}`))], emit('statusTick', { o: '$su', s: s.id, n: mul(s.tickDamage, g('$su', `st_${s.id}`)) })] : []),
    ...(s.tickFlip ? [IF(isObj('$su'), [['random', { min: 0, max: 1, as: '$sh' }], emit('coin', { p: ctrl('$su'), heads: '$sh' }), IF(eq('$sh', 1), [SET('$su', `st_${s.id}`, 0), emit('cured', { o: '$su', s: s.id })])])] : [])]));
  const stExpire: X[] = ST.filter((s) => s.lasts === 'ownerNextTurnEnd' || s.lasts === 'endOfTurn').map((s) =>
    EACH(flt(s.lasts === 'endOfTurn' ? allUnits(x) : units(x, ME), AND(gt(g('$it', `st_${s.id}`), 0), s.lasts === 'endOfTurn' ? L(true) : lt(g('$it', `sT_${s.id}`), '$turn'))), '$su', [SET('$su', `st_${s.id}`, 0), emit('cured', { o: '$su', s: s.id })]));
  const limitedReset: X[] = bp.types.filter((t) => t.perTurn).length ? [EACH(['players'], '$pq', bp.types.filter((t) => t.perTurn).map((t) => SET('$pq', `tp_${t.id}`, 0)))] : [];
  const forPlayers = (each: boolean | undefined, body: (p: string) => X[]): X[] => (each ? [EACH(['players'], '$pp', body('$pp'))] : body(ME));
  // questing: Reckless units can't quest; units that may attack the turn they are played (rush) still can't quest that turn
  const canQuestFn = (u: X) => AND(C('canAtk', u), gt(g(u, c.quest ?? 'lore'), 0), ...(x.hasRule('reckless') ? [NOT(has(u, 'reckless'))] : []),
    ...(c.sickness ? [OR(lt(g(u, 'newT'), '$turn'), has(u, 'haste'))] : []));
  const phases: X[] = bp.turn.map((ph) => {
    switch (ph.kind) {
      case 'ready': return { id: ph.id, auto: true, do: [INC(ME, 'turns', 1), ...forPlayers(ph.each, (p) => [untapOf(p), ...(ap ? [SET(p, 'ap', r.actionsStat && x.leader ? mx(1, def(first(cards(p, 'leader')), r.actionsStat)) : r.actions)] : [])]),
        ...(usesPlayed ? [EACH(['players'], '$pq', [SET('$pq', 'plays', 0)])] : []), ...stTicks('ownerStart', units(x, ME)), ...limitedReset, ...(r.give ? [EACH(cat(units(x, ME), ...(x.leader ? [cards(ME, 'leader')] : [])), '$dq', [SET('$dq', 'don', 0)])] : []), ...temp, ...hold,
        ...(hasResPhase ? [] : resourceStep),
        ...(x.hasRole('location') && c.quest ? [EACH(flt(cards(ME, 'locations'), gt(g('$it', c.quest), 0)), '$lo', [INC(ME, 'score', g('$lo', c.quest)), emit('locLore', { o: '$lo', p: ME, n: g('$lo', c.quest) })])] : []),
        emit('turnStart', { p: ME })] };
      case 'draw': return { id: ph.id, auto: true, do: [IF(AND(NOT(AND(eq('$turn', 1), L(bp.setup.skipFirstDraw))), ph.side !== undefined ? eq(g(ME, 'side'), ph.side) : L(true)), forPlayers(ph.each, (p) =>
        [ph.drawTo ? ['draw', p, mx(0, sub(bp.setup.leaderHand && x.leader ? mx(1, def(first(cards(p, 'leader')), bp.setup.leaderHand)) : ph.drawTo, cnt(cards(p, 'hand'))))] : ['draw', p, ph.n ?? 1]]))] };
      case 'resource': return { id: ph.id, auto: true, do: resourceStep };
      case 'end': return { id: ph.id, auto: true, do: [emit('turnEnd', { p: ME }),
        ...(x.check ? [EACH(['players'], '$pq', [EACH(cards('$pq', 'pool'), '$pk', [IF(eq(g('$pk', 'role'), 'permanent'), [['move', '$pk', 'support', { as: '$pb' }], IF(isObj('$pb'), [SET('$pb', 'ex', g('$pk', 'ex'))])],
          x.zonesC ? [IF(AND(eq(g('$pk', 'role'), 'attack'), eq(g('$pk', 'hitd'), 1)), [['move', '$pk', 'momentum'], emit('momentum', { p: '$pq' })], [['move', '$pk', 'grave']])] : [['move', '$pk', 'grave']])])])] : []), ...(bp.win.emptyEnd ? [IF(eq(cnt(cards(ME, 'deck')), 0), [emit('emptyDeck', { p: ME }), ['lose', ME]])] : []), ...stTicks('betweenTurns', allUnits(x)), ...stTicks('ownerEnd', units(x, ME)), ...stExpire,
        ...(c.damage === 'heal' && HP ? [EACH(allUnits(x), '$x', [SET('$x', 'dmg', 0)])] : []),
        ...(r.mode === 'pitch' ? [['move', cards(ME, 'pitch'), 'deck'], SET(ME, 'pp', 0)] : []),
        ...((bp.counters ?? []).some((k) => k.expires) ? [EACH(units(x, ME), '$x', (bp.counters ?? []).filter((k) => k.expires).map((k) => SET('$x', `c_${k.id}`, 0)))] : []),
        IF(gt(cnt(cards(ME, 'hand')), bp.setup.handLimit), [C('discardN', ME, sub(cnt(cards(ME, 'hand')), bp.setup.handLimit))])] };
      case 'custom': return { id: ph.id, auto: true, do: Array.isArray(ph.raw) ? ph.raw : [] };
      default: return { id: ph.id, ...(ph.alternate ? { timing: { mode: 'alternate', first: '$active' } } : {}) };
    }
  });
  if (!bp.turn.some((p) => p.kind === 'end')) phases.push({ id: 'end', auto: true, do: [emit('turnEnd', { p: ME })] });
  // "must attack / must quest if able" (Reckless, Adventurous): the active player can't end the phase while one of them can act
  const mustAct: { if: X; why: string }[] = [];
  if (x.hasRule('reckless') && c.mode === 'target') {
    const foes = cat(c.targetUnits === 'any' ? units(x, ['opp', '$me']) : c.targetUnits === 'exhausted' ? flt(units(x, ['opp', '$me']), eq(g('$it', 'ex'), 1)) : L([]),
      ...(x.hasRole('location') ? [cards(['opp', '$me'], 'locations')] : []));
    mustAct.push({ if: ANY(units(x, '$me'), AND(has('$it', 'reckless'), C('canAtk', '$it'), ['let', '$ru', '$it', ANY(foes, AND(NOT(has('$it', 'noBeAttacked')),
      OR(NOT(has('$it', 'flying')), has('$ru', 'flying'), has('$ru', 'reach'))))])), why: 'A Reckless unit must attack first.' });
  }
  if (x.hasRule('adventurous') && c.quest) mustAct.push({ if: ANY(units(x, '$me'), AND(has('$it', 'adventurous'), canQuestFn('$it'))), why: 'An Adventurous unit must quest first.' });
  if (r.spendAll && ap) mustAct.push({ if: gt(g('$me', 'ap'), 0), why: 'Spend all your actions first.' });
  if (mustAct.length) for (const ph of phases as Record<string, any>[]) if (x.atkPhases.includes(ph.id) && !ph.auto) ph.mustAct = mustAct;

  // ---- actions
  const stackish = bp.timing !== 'simple';
  const sp = (speed: number, onStack = false) => (stackish ? { speed, ...(onStack ? {} : { stack: false }) } : {});
  const apReq = ap ? [{ if: gt(g('$me', 'ap'), 0), why: 'No action points left' }] : [];
  const apCost: X[] = ap ? [INC('$me', 'ap', -1)] : [];
  const goAgain: X[] = ap ? [IF(has('$self', 'goAgain'), [INC('$me', 'ap', 1)])] : [];
  const limited = bp.types.filter((t) => t.perTurn || t.notFirstTurn);
  const typeOK: X[] = limited.map((t) => OR(ne(g('$it', 'type'), t.id), AND(t.perTurn ? lt(g('$me', `tp_${t.id}`), t.perTurn) : L(true), t.notFirstTurn ? ne('$turn', 1) : L(true))));
  const hand = (pred: X) => flt(cards('$me', 'hand'), AND(pred, C('payable', '$it', '$me'), ...typeOK));
  const recyclePay: X[] = x.recycle ? x.colorIds.map((col) => [LET(`$nd_${col}`, mx(0, ['at', def('$self', 'pw'), col])), IF(gt(`$nd_${col}`, 0), [
    choose({ from: runesOf('$me', col), min: `$nd_${col}`, max: `$nd_${col}`, as: `$rc_${col}`, prompt: `Recycle ${bp.colors.find((k) => k.id === col)?.name ?? col} ${bp.resource.name.toLowerCase()} for power`, required: true }),
    ['move', `$rc_${col}`, 'resdeck']])]).flat() : [];
  const typed = (t: string, n: X): X => ['pay', '$me', 'mana', ['tally', ['map', range(n), L(t)]]];
  const poolOf = (t: string) => mx(0, ['at', ['pool', '$me', 'mana'], t]);
  const dualPay: X[] = x.duals.length ? [...x.colorIds.flatMap((col) => {
    const need = mx(0, ['at', def('$self', 'cost'), col]);
    const ds = x.duals.filter((d) => d.split('_').includes(col));
    const other = (d: string) => d.split('_').find((q) => q !== col)!;
    return [LET(`$r_${col}`, sub(need, mn(need, poolOf(col)))), typed(col, mn(need, poolOf(col))),
      ...ds.flatMap((d) => [LET(`$k_${col}`, Q(eq(mx(0, ['at', def('$self', 'cost'), other(d)]), 0), mn(`$r_${col}`, poolOf(d)), 0)), typed(d, `$k_${col}`), LET(`$r_${col}`, sub(`$r_${col}`, `$k_${col}`))]),
      ...ds.flatMap((d) => [LET(`$k_${col}`, mn(`$r_${col}`, poolOf(d))), typed(d, `$k_${col}`), LET(`$r_${col}`, sub(`$r_${col}`, `$k_${col}`))])];
  }), ['pay', '$me', 'mana', mx(0, ['at', def('$self', 'cost'), 'any'])]] : [];
  const kicker: X[] = x.pool && bp.cards.some((k) => k.kicker) ? [IF(gt(def('$self', 'kicker'), 0), [IF(['canPay', '$me', 'mana', def('$self', 'kicker')], [
    choose({ from: L(['Kick it', 'No']), min: 1, max: 1, as: '$kk', prompt: 'Pay the kicker cost for the extra effect?' }),
    IF(eq('$kk', 'Kick it'), [['pay', '$me', 'mana', def('$self', 'kicker')], SET('game', 'kick', 1), emit('kicked', { p: '$me' })], [SET('game', 'kick', 0)])], [SET('game', 'kick', 0)])])] : [];
  const payCost: X[] = [...(x.pool ? (x.duals.length ? dualPay : [['pay', '$me', 'mana', C('costOf', '$self', '$me')]]) : r.mode === 'pitch' ? [C('pitchPay', '$self', C('costOf', '$self', '$me'))] : []), ...recyclePay,
    ...kicker, ...(usesPlayed ? [INC('$me', 'plays', 1)] : []), ...limited.filter((t) => t.perTurn).map((t) => IF(eq(g('$self', 'type'), t.id), [INC('$me', `tp_${t.id}`, 1)]))];
  const Aa: Record<string, any> = {};
  const unitT = types('unit');
  const sumLimit = r.summonsPerTurn > 0 ? { limit: { per: 'turn', n: r.summonsPerTurn, group: 'summon' } } : {};
  const tribCost: X[] = trib.length ? [LET('$tn', C('tribs', '$self')), IF(gt('$tn', 0), [choose({ from: units(x, '$me'), min: '$tn', max: '$tn', as: '$tr', prompt: 'Tribute which units?', required: true }), ['move', '$tr', 'grave']])] : [];
  const summonTo = (asVar: string): X[] => c.mode === 'duel'
    ? [IF(eq(cnt(cards('$me', 'active')), 0), [['move', '$self', 'active', { as: asVar }], SET(asVar, 'newT', '$turn')], [['move', '$self', 'bench', { as: asVar }], SET(asVar, 'newT', '$turn')])]
    : x.grid ? [choose({ from: ['freeSlots', '$me', 'field'], min: 1, max: 1, as: '$zs', prompt: 'Which zone?' }), ['move', '$self', 'field', { slot: '$zs', as: asVar }], SET(asVar, 'newT', '$turn')]
    : UZ.length === 1 ? [...(c.replaceFull ? [IF(NOT(C('roomIn', '$me', UZ[0])), [choose({ from: cards('$me', UZ[0]), min: 1, max: 1, as: '$rfu', prompt: 'Your board is full: trash which unit to make room?' }), ['move', '$rfu', 'grave']])] : []),
      ['move', '$self', UZ[0], { as: asVar }], SET(asVar, 'newT', '$turn')]
      : [...(conq && c.playToControlled ? [choose({ from: cat(['list', L('Base')], ...lanes.map((z, i) => Q(eq(g('game', `c${i + 1}`), add(seat('$me'), 1)), ['list', L(c.lanes[i])], ['list']))),
          min: 1, max: 1, as: '$pdn', prompt: 'Play it where? (your base or a battlefield you control)' }),
          LET('$pdz', lanes.reduceRight<X>((acc, z, i) => Q(eq('$pdn', c.lanes[i]), z, acc), 'base'))] : []),
        ...UZ.map((z) => IF(eq(conq && c.playToControlled ? '$pdz' : def('$self', 'zone'), z), [['move', '$self', z, { as: asVar }], SET(asVar, 'newT', '$turn'), ...(conq ? [SET(asVar, 'ex', 1),
        IF(AND(has(asVar, 'accelerate'), ['canPay', '$me', 'mana', 1], x.recycle ? gt(cnt(runesOf('$me', def(asVar, 'color'))), 0) : L(true)), [
          choose({ from: L(['Accelerate: pay 1 more (and recycle 1) to enter ready', 'No']), min: 1, max: 1, as: '$acc', prompt: 'Accelerate this unit?' }),
          IF(eq('$acc', 'No'), [], [['pay', '$me', 'mana', 1], ...(x.recycle ? [choose({ from: runesOf('$me', def(asVar, 'color')), min: 1, max: 1, as: '$ar', prompt: 'Recycle which rune?' }), ['move', '$ar', 'resdeck']] : []), SET(asVar, 'ex', 0)])])] : [])]))];
  if (unitT.length) {
    const uPred = AND(inl(g('$it', 'type'), unitT), NOT(def('$it', 'ritual')), OR(C('roomFor', '$it', '$me'), gt(C('tribs', '$it'), 0), L(!!c.replaceFull)), ge(cnt(units(x, '$me')), C('tribs', '$it')));
    const src = bp.setup.champion ? cat(hand(uPred), flt(cards('$me', 'champion'), AND(uPred, C('payable', '$it', '$me')))) : hand(uPred);
    Aa.summon = { label: c.mode === 'duel' ? 'Play' : 'Summon', phases: x.main, source: src, ...sumLimit, ...sp(1, bp.timing === 'stack'), req: apReq, cost: [...payCost, ...tribCost, ...apCost], do: summonTo('$u') };
    if (c.positions) {
      Aa.setUnit = { label: 'Set face down', phases: x.main, source: src, ...sumLimit, ...sp(1), req: apReq, cost: [...payCost, ...tribCost, ...apCost],
        do: [...(x.grid ? [choose({ from: ['freeSlots', '$me', 'field'], min: 1, max: 1, as: '$zs', prompt: 'Which zone?' })] : []), ['move', '$self', UZ[0], { as: '$u', faceDown: true, ...(x.grid ? { slot: '$zs' } : {}) }], SET('$u', 'newT', '$turn'), SET('$u', 'pos', 1)] };
      Aa.position = { label: 'Change position', phases: x.main, source: flt(units(x, '$me'), lt(g('$it', 'newT'), '$turn')), limit: { per: 'turn', by: 'source' }, ...sp(1),
        do: [IF(g('$self', 'faceDown'), [['flip', '$self'], SET('$self', 'pos', 0)], [SET('$self', 'pos', sub(1, g('$self', 'pos')))])] };
    }
  }
  const spellDo = (extra: X[] = []): X[] => [IF(eq(def('$self', 'hasEff'), 1), [['run', '$self', 'effects']]), ...extra, IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])];
  if (x.hasRole('spell')) Aa.cast = { label: 'Cast', phases: x.main, source: hand(inl(g('$it', 'type'), types('spell'))), ...sp(1, true), req: apReq,
    cost: [...payCost, ...apCost, ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(goAgain), countered: [['move', '$self', 'grave']] };
  if (x.hasRole('fast')) Aa.quick = { label: c.counterOnly ? 'Counter' : 'Cast (quick)', phases: c.counterOnly && x.battle ? ['respond'] : x.fast,
    source: hand(AND(inl(g('$it', 'type'), types('fast')), c.counterOnly && x.battle ? eq('$win.defender', '$me') : L(true))), ...sp(2, true),
    cost: [...payCost, ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(), countered: [['move', '$self', 'grave']] };
  if (x.hasRole('attack')) Aa.attackCard = { label: 'Attack', phases: x.atkPhases, source: hand(AND(inl(g('$it', 'type'), types('attack')), c.firstTurnAttack ? L(true) : ne('$turn', 1))), ...sp(1), req: apReq,
    cost: [...payCost, ...apCost, ['move', '$self', 'limbo', { as: '$self' }]],
    do: [IF(eq(def('$self', 'hasEff'), 1), [['run', '$self', 'effects']]), ['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blockers: L([]), power: 0, guard: 0 } }],
      SET('game', 'bat', 0), ...goAgain, IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])] };
  const customTo = (bp.zones ?? []).map((z) => IF(eq(def('$self', 'playTo'), z.id), [
    ...(z.size > 0 ? [IF(ge(cnt(cards(z.global ? '*' : '$me', z.id)), z.size), [['move', cards(z.global ? '*' : '$me', z.id), 'grave']])] : []),
    ['move', '$self', z.id, { as: '$pz' }], SET('$pz', 'newT', '$turn')]));
  const globalZ = (bp.zones ?? []).filter((z) => z.global).map((z) => z.id);
  const notInPlay = globalZ.length ? ['let', '$cn', g('$it', 'name'), NOT(ANY(cat(...globalZ.map((z) => cards('*', z))), eq(g('$it', 'name'), '$cn')))] : L(true);
  if (x.hasRole('permanent', 'walker')) Aa.deploy = { label: 'Play', phases: x.main, source: hand(AND(inl(g('$it', 'type'), types('permanent', 'walker')), notInPlay)), ...sp(1, bp.timing === 'stack'), req: apReq, cost: [...payCost, ...apCost],
    do: [IF(NOT(def('$self', 'playTo')), [['move', '$self', 'support', { as: '$pm' }], SET('$pm', 'newT', '$turn'), IF(eq(g('$pm', 'role'), 'walker'), [SET('$pm', 'loy', mx(0, def('$pm', 'loyalty')))])], customTo)] };
  if (bp.cards.some((k) => k.keywords.some((w) => x.kwKey(w) === 'flash'))) Aa.flashUnit = { label: 'Play (flash)', phases: x.fast.filter((p) => !x.main.includes(p)), ...sp(2, bp.timing === 'stack'),
    source: hand(AND(inl(g('$it', 'type'), unitT), has('$it', 'flash'), C('roomFor', '$it', '$me'))), cost: [...payCost], do: summonTo('$fu') };
  const fbFrom = (t: string[]) => flt(cards('$me', 'grave'), AND(inl(g('$it', 'type'), t), gt(def('$it', 'flashback'), 0), ['canPay', '$me', 'mana', def('$it', 'flashback')]));
  const fbDo: X[] = [IF(eq(def('$self', 'hasEff'), 1), [['run', '$self', 'effects']]), IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'banished']])];
  if (x.pool && bp.cards.some((k) => k.flashback)) {
    Aa.fbSpell = { label: 'Flashback', phases: x.main, ...sp(1, true), source: fbFrom(types('spell')), cost: [['pay', '$me', 'mana', def('$self', 'flashback')], ['move', '$self', 'limbo', { as: '$self' }]], do: fbDo, countered: [['move', '$self', 'banished']] };
    Aa.fbQuick = { label: 'Flashback', phases: x.fast, ...sp(2, true), source: fbFrom(types('fast')), cost: [['pay', '$me', 'mana', def('$self', 'flashback')], ['move', '$self', 'limbo', { as: '$self' }]], do: fbDo, countered: [['move', '$self', 'banished']] };
  }
  if (x.pool && bp.cards.some((k) => k.cycling)) Aa.cycle = { label: 'Cycle', phases: x.fast, ...sp(2), source: flt(cards('$me', 'hand'), AND(gt(def('$it', 'cycling'), 0), ['canPay', '$me', 'mana', def('$it', 'cycling')])),
    cost: [['pay', '$me', 'mana', def('$self', 'cycling')], ['move', '$self', 'grave']], do: [['draw', '$me', 1], emit('cycled', { p: '$me' })] };
  if (x.pool && bp.cards.some((k) => k.equipCost)) Aa.reequip = { label: 'Equip', phases: x.main, ...sp(1), source: flt(cards('$me', 'support'), AND(eq(def('$it', 'equipment'), 1), gt(def('$it', 'equipCost'), 0), ['canPay', '$me', 'mana', def('$it', 'equipCost')], gt(cnt(units(x, '$me')), 0))),
    targets: [{ as: '$b', from: flt(units(x, '$me'), ne('$it', g('$self', 'bearer'))), prompt: 'Equip which unit?' }], cost: [['pay', '$me', 'mana', def('$self', 'equipCost')]], do: [['link', '$self', 'bearer', '$b'], SET('$self', 'att', 1)] };
  if (bp.cards.some((k) => k.crew)) {
    const crewers = flt(units(x, '$me'), AND(eq(g('$it', 'ex'), 0), NOT(gt(def('$it', 'crew'), 0)), NOT(gt(def('$it', 'station'), 0))));
    Aa.crew = { label: 'Crew', phases: x.fast, ...sp(2), source: flt(units(x, '$me'), AND(gt(def('$it', 'crew'), 0), ne(g('$it', 'crewT'), '$turn'), ['let', '$vc', '$it', ge(SUM(crewers, C('pw', '$it')), def('$vc', 'crew'))])),
      do: [SET('game', 'rem', def('$self', 'crew')), EACH(['sortBy', crewers, C('pw', '$it')], '$cu', [IF(gt(g('game', 'rem'), 0), [SET('$cu', 'ex', 1), INC('game', 'rem', ['neg', C('pw', '$cu')])])]),
        SET('$self', 'crewT', '$turn'), emit('crewed', { o: '$self', p: '$me' })] };
  }
  if (bp.cards.some((k) => k.station)) Aa.station = { label: 'Station', phases: x.main, ...sp(1), source: flt(units(x, '$me'), gt(def('$it', 'station'), 0)),
    targets: [{ as: '$sx', from: flt(units(x, '$me'), AND(ne('$it', '$self'), eq(g('$it', 'ex'), 0), NOT(gt(def('$it', 'station'), 0)), gt(C('pw', '$it'), 0))), prompt: 'Tap which unit to charge it?' }],
    do: [SET('$sx', 'ex', 1), INC('$self', 'chg', C('pw', '$sx')), emit('stationed', { o: '$self', p: '$me', n: C('pw', '$sx') })] };
  if (x.hasRole('attachment')) Aa.equip = { label: 'Attach', phases: x.main, source: hand(AND(inl(g('$it', 'type'), types('attachment')), gt(cnt(Q(eq(def('$it', 'anyUnit'), 1), allUnits(x), units(x, '$me'))), 0))), ...sp(1), req: apReq,
    targets: [{ as: '$b', from: flt(Q(eq(def('$self', 'anyUnit'), 1), cat(units(x, '$me'), flt(units(x, '$opp'), NOT(has('$it', 'ward')))), units(x, '$me')), OR(NOT(def('$self', 'perUnit')), lt(cnt(flt(['linked', '$it', 'bearer'], eq(g('$it', 'type'), g('$self', 'type')))), def('$self', 'perUnit')))), prompt: 'Attach to which unit?' }], cost: [...payCost, ...apCost],
    do: [['move', '$self', 'support', { as: '$at' }], ['link', '$at', 'bearer', '$b'], SET('$at', 'att', 1)] };
  const settable = [...types('trap'), ...bp.types.filter((t) => t.role === 'fast' && t.settable).map((t) => t.id)];
  if (settable.length) {
    Aa.setTrap = { label: 'Set', phases: x.main, source: hand(AND(inl(g('$it', 'type'), settable), x.grid ? gt(cnt(['freeSlots', '$me', 'support']), 0) : L(true))), ...sp(1), cost: payCost,
      do: [['move', '$self', 'support', { as: '$tp', faceDown: true }], SET('$tp', 'newT', '$turn')] };
    const setReady = (spd3: boolean, cont = false) => flt(cards('$me', 'support'), AND(inl(g('$it', 'type'), settable), g('$it', 'faceDown'), lt(g('$it', 'newT'), '$turn'), spd3 ? eq(def('$it', 'spd3'), 1) : NOT(def('$it', 'spd3')),
      cont ? eq(def('$it', 'cont'), 1) : NOT(def('$it', 'cont')),
      OR(ne(g('$it', 'trapOn'), 'opAttack'), AND(gt(g('game', 'bat'), 0), ne(g('game', 'bat'), add(seat('$me'), 1))))));
    const springCost: X[] = [['flip', '$self'], ['move', '$self', 'limbo', { as: '$self' }]];
    Aa.spring = { label: 'Spring', phases: x.fast, ...sp(2, true), source: setReady(false), cost: springCost, do: spellDo(), countered: [['move', '$self', 'grave']] };
    if (bp.types.some((t) => t.continuous)) Aa.springCont = { label: 'Spring', phases: x.fast, ...sp(2, true), source: setReady(false, true), cost: [['flip', '$self']],
      do: [IF(eq(def('$self', 'hasEff'), 1), [['run', '$self', 'effects']])], countered: [['move', '$self', 'grave']] };
    if (bp.types.some((t) => t.speed3)) Aa.springCounter = { label: 'Spring (counter)', phases: x.fast, ...sp(3, true), source: setReady(true), cost: springCost, do: spellDo(), countered: [['move', '$self', 'grave']] };
  }
  if (x.hasRule('song')) {
    const singCost = (u: X) => (x.hasRule('singer') ? mx(def(u, 'cost'), def(u, 'kw_singer')) : def(u, 'cost'));
    const canSing = (u: X) => AND(eq(g(u, 'ex'), 0), c.sickness ? OR(lt(g(u, 'newT'), '$turn'), has(u, 'haste')) : L(true));
    const singers = (card: X) => flt(units(x, '$me'), AND(canSing('$it'), ge(singCost('$it'), def(card, 'cost'))));
    if (x.hasRule('singTogether')) {
      const need = (cd: X) => def(cd, 'kw_singTogether');
      Aa.singTogether = { label: 'Sing together', phases: x.main, ...sp(1, true),
        source: flt(cards('$me', 'hand'), AND(has('$it', 'singTogether'), ge(SUM(flt(units(x, '$me'), canSing('$it')), singCost('$it')), need('$it')))),
        cost: [SET('game', 'sgt', 0), ...Array.from({ length: 10 }, (_, i) => IF(lt(g('game', 'sgt'), need('$self')), [
          choose({ from: flt(units(x, '$me'), canSing('$it')), min: 1, max: 1, as: `$sg${i}`, prompt: 'Sing together: exhaust which unit? (their costs must add up to the number)', required: true }),
          IF(isObj(`$sg${i}`), [SET(`$sg${i}`, 'ex', 1), INC('game', 'sgt', singCost(`$sg${i}`))])])), ['move', '$self', 'limbo', { as: '$self' }]],
        do: spellDo(), countered: [['move', '$self', 'grave']] };
    }
    Aa.sing = { label: 'Sing', phases: x.main, ...sp(1, true), source: flt(cards('$me', 'hand'), AND(has('$it', 'song'), gt(cnt(singers('$it')), 0))),
      targets: [{ as: '$sg', from: singers('$self'), prompt: 'Which unit sings it?' }],
      cost: [SET('$sg', 'ex', 1), ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(), countered: [['move', '$self', 'grave']] };
  }
  if (x.hasRole('evolution')) {
    const base = (o: X) => flt(units(x, '$me'), AND(OR(eq(g('$it', 'name'), def(o, 'evolvesFrom')), eq(g('$it', 'family'), def(o, 'evolvesFrom'))), lt(g('$it', 'newT'), '$turn')));
    proc('evolveOnto', ['$c', '$b'], [LET('$atts', ['linked', '$b', 'bearer']), LET('$d', g('$b', 'dmg')), LET('$ex', g('$b', 'ex')), ...UZ.map((z) => IF(eq(g('$b', 'zone'), z), [
      ['move', '$c', z, { as: '$ev' }], SET('$ev', 'dmg', '$d'), SET('$ev', 'ex', '$ex'), SET('$ev', 'newT', '$turn'), IF(gt(cnt('$atts'), 0), [['link', '$atts', 'bearer', '$ev']]), ['move', '$b', 'grave'],
      emit('evolved', { o: '$ev', p: '$me' })]))]);
    Aa.evolve = { label: 'Evolve', phases: x.main, source: hand(AND(eq(g('$it', 'role'), 'evolution'), ['let', '$ec', '$it', gt(cnt(base('$ec')), 0)], bp.setup.noEvolveFirstTurn ? gt(g('$me', 'turns'), 1) : L(true))), ...sp(1), req: apReq,
      targets: [{ as: '$b', from: base('$self'), prompt: 'Evolve which unit?' }], cost: [...payCost, ...apCost], do: [C('evolveOnto', '$self', '$b')] };
  }
  if (x.hasRole('extra')) Aa.fuse = { label: 'Summon from extra deck', phases: x.main, ...sp(1), req: apReq,
    source: flt(cards('$me', 'extra'), AND(OR(NOT(def('$it', 'method')), eq(def('$it', 'method'), 'materials')), ge(cnt(units(x, '$me')), mx(1, def('$it', 'materials'))), C('payable', '$it', '$me'))),
    cost: [...payCost, ...apCost, choose({ from: units(x, '$me'), min: mx(1, def('$self', 'materials')), max: mx(1, def('$self', 'materials')), as: '$ms', prompt: 'Which units become the materials?', required: true }), ['move', '$ms', 'grave']],
    do: summonTo('$fx') };
  if (conq && x.hasRule('hidden')) {
    const freeLane = (i: number) => AND(eq(g('game', `c${i + 1}`), add(seat('$me'), 1)), eq(cnt(cards('$me', `hid${i + 1}`)), 0));
    const canPay1 = x.recycle ? gt(cnt(cards('$me', 'resources')), 0) : ['canPay', '$me', 'mana', 1];
    Aa.hide = { label: 'Hide', phases: x.main, ...sp(1), source: flt(cards('$me', 'hand'), AND(has('$it', 'hidden'), canPay1, OR(L(false), ...lanes.map((_, i) => freeLane(i))))),
      do: [choose({ from: cat(...lanes.map((_, i) => Q(freeLane(i), ['list', L(c.lanes[i])], ['list']))), min: 1, max: 1, as: '$hl', prompt: 'Hide it at which battlefield?' }),
        ...(x.recycle ? [choose({ from: cards('$me', 'resources'), min: 1, max: 1, as: '$hr', prompt: 'Recycle a rune to pay 1 power' }), ['move', '$hr', 'resdeck']] : [['pay', '$me', 'mana', 1]]),
        ...lanes.map((_, i) => IF(eq('$hl', c.lanes[i]), [['move', '$self', `hid${i + 1}`, { as: '$hd' }], SET('$hd', 'newT', '$turn'), emit('hidden', { p: '$me', z: lanes[i] })]))] };
    Aa.playHidden = { label: 'Play from hiding', phases: x.fast, ...sp(2), source: flt(cat(...lanes.map((_, i) => cards('$me', `hid${i + 1}`))), lt(g('$it', 'newT'), '$turn')),
      do: lanes.map((z, i) => IF(eq(g('$self', 'zone'), `hid${i + 1}`), [emit('revealed', { p: '$me', card: g('$self', 'card') }),
        IF(inl(g('$self', 'role'), UNIT_ROLES), [['move', '$self', z, { as: '$hu' }], SET('$hu', 'newT', '$turn'), SET('$hu', 'ex', 1)],
          [['move', '$self', 'limbo', { as: '$hs' }], IF(eq(def('$hs', 'hasEff'), 1), [['run', '$hs', 'effects']]), IF(eq(g('$hs', 'zone'), 'limbo'), [['move', '$hs', 'grave']])])])) };
  }
  const showdownTypes = bp.types.filter((t) => t.role === 'spell' && t.showdown).map((t) => t.id);
  if (conq && showdownTypes.length) Aa.castShowdown = { label: 'Cast (action)', phases: ['respond'], ...sp(1, true), source: hand(inl(g('$it', 'type'), showdownTypes)),
    cost: [...payCost, ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(), countered: [['move', '$self', 'grave']] };
  // ---- extra-deck summon methods, rituals, pendulums (grid boards place them; other boards use the first unit zone)
  const faceUp = flt(units(x, '$me'), NOT(g('$it', 'faceDown')));
  const lv = (o: X) => mx(0, g(o, 'level'));
  const meth = (m: string) => bp.types.some((t) => t.method === m);
  const placeOr = (c: X, dest: X, mats: X): X[] => (x.grid ? [C('place', c, dest, mats)] : [['move', c, UZ[0], { as: '$pq' }], SET('$pq', 'newT', '$turn'),
    ...(meth('xyz') ? [EACH(mats, '$mt', [IF(eq(g('$mt', 'zone'), 'overlay'), [['link', '$mt', 'bearer', '$pq']], [['move', '$mt', 'overlay', { as: '$om' }], ['link', '$om', 'bearer', '$pq']])])] : [])]);
  const anyDest = x.grid ? C('anyDest', '$me') : 0, edDest = x.grid ? (x.emz ? C('edDest', '$me') : C('mmz', '$me')) : 0, mmz = x.grid ? C('mmz', '$me') : 0;
  const levels = (l: X) => ['map', l, lv('$it')];
  const matsMarked = flt(cat(cards('$me', 'hand'), units(x, '$me')), eq(g('$it', 'mat'), 1));
  const clearMarks: X[] = [EACH(cat(cards('$me', 'hand'), units(x, '$me')), '$cm', [SET('$cm', 'mat', 0)])];
  if (meth('synchro') || bp.cards.some((k) => k.abilities.some((a) => a.do.some((e) => e.k === 'ritual')))) fn('ssum', ['$l', '$t'], OR(eq('$t', 0), AND(gt('$t', 0), gt(cnt('$l'), 0),
    OR(C('ssum', ['slice', '$l', 1], sub('$t', first('$l'))), C('ssum', ['slice', '$l', 1], '$t')))));
  if (meth('synchro')) {
    const nonT = flt(faceUp, AND(NOT(has('$it', 'tuner')), eq(g('$it', 'mat'), 0)));
    const tunerOK = (s: X, t: X) => AND(gt(sub(def(s, 'level'), lv(t)), 0), C('ssum', levels(flt(faceUp, NOT(has('$it', 'tuner')))), sub(def(s, 'level'), lv(t))));
    Aa.synchro = { label: 'Synchro summon', phases: x.main, ...sp(1), source: flt(cards('$me', 'extra'), AND(eq(def('$it', 'method'), 'synchro'), ['let', '$sc', '$it', ANY(flt(faceUp, has('$it', 'tuner')), tunerOK('$sc', '$it'))])),
      do: [...clearMarks, choose({ from: flt(faceUp, AND(has('$it', 'tuner'), tunerOK('$self', '$it'))), min: 1, max: 1, as: '$tn', prompt: 'Choose the Tuner' }), SET('$tn', 'mat', 1),
        SET('game', 'rem', sub(def('$self', 'level'), lv('$tn'))),
        EACH(range(8), '$sy', [IF(gt(g('game', 'rem'), 0), [choose({ from: flt(nonT, ['let', '$nt', '$it', AND(le(lv('$nt'), g('game', 'rem')),
          C('ssum', levels(flt(nonT, ne('$it', '$nt'))), sub(g('game', 'rem'), lv('$nt'))))]), min: 1, max: 1, as: '$nx', prompt: 'Choose a non-Tuner material (levels must add up exactly)' }),
          IF(isObj('$nx'), [SET('$nx', 'mat', 1), INC('game', 'rem', ['neg', lv('$nx')])], [SET('game', 'rem', 0)])])]),
        LET('$sm', flt(faceUp, eq(g('$it', 'mat'), 1))), ['move', '$sm', 'grave'], emit('synchro', { p: '$me' }), ...placeOr('$self', anyDest, L([]))] };
  }
  if (meth('xyz')) Aa.xyz = { label: 'Xyz summon', phases: x.main, ...sp(1),
    source: flt(cards('$me', 'extra'), AND(eq(def('$it', 'method'), 'xyz'), ['let', '$xc', '$it', ge(cnt(flt(faceUp, eq(lv('$it'), def('$xc', 'rank')))), mx(2, def('$xc', 'materials')))])),
    do: [choose({ from: flt(faceUp, eq(lv('$it'), def('$self', 'rank'))), min: mx(2, def('$self', 'materials')), max: mx(2, def('$self', 'materials')), as: '$xm', prompt: 'Choose the materials (same level as its rank)' }),
      ['move', '$xm', 'overlay', { as: '$xo' }], emit('xyz', { p: '$me' }), ...placeOr('$self', anyDest, '$xo')] };
  const linkCards = bp.cards.filter((k) => x.roleOf.get(k.type) === 'extra' && bp.types.find((t) => t.id === k.type)?.method === 'link');
  for (const k of linkCards) if (k.mats?.[0]) fn(`lm_${k.id}`, ['$it'], filterExpr(x, k.mats[0]) ?? L(true));
  const linkOK = (lc: X, u: X) => OR(L(false), ...linkCards.map((k) => AND(eq(g(lc, 'card'), k.id), k.mats?.[0] ? C(`lm_${k.id}`, u) : L(true))));
  if (meth('link')) Aa.linkSum = { label: 'Link summon', phases: x.main, ...sp(1),
    source: flt(cards('$me', 'extra'), AND(eq(def('$it', 'method'), 'link'), ['let', '$lc', '$it', AND(ge(cnt(flt(faceUp, linkOK('$lc', '$it'))), def('$lc', 'linkN')),
      x.grid ? OR(gt(cnt(edDest), 0), ANY(faceUp, eq(g('$it', 'zone'), 'emz'))) : L(true))])),
    do: [choose({ from: flt(faceUp, linkOK('$self', '$it')), min: def('$self', 'linkN'), max: def('$self', 'linkN'), as: '$lm', prompt: 'Choose the link materials' }),
      ['move', '$lm', 'grave'], emit('linkSummon', { p: '$me' }), ...placeOr('$self', edDest, L([]))] };
  const fusions = bp.cards.filter((k) => x.roleOf.get(k.type) === 'extra' && bp.types.find((t) => t.id === k.type)?.method === 'fusion' && k.mats?.length);
  if (bp.cards.some((k) => k.abilities.some((a) => a.do.some((e) => e.k === 'fusion')))) {
    const pool = cat(cards('$me', 'hand'), faceUp);
    for (const k of fusions) {
      k.mats!.forEach((f, j) => fn(`fm_${k.id}_${j}`, ['$it'], filterExpr(x, f) ?? L(true)));
      fn(`fc_${k.id}`, [], AND(ge(cnt(pool), k.mats!.length), ...k.mats!.map((_, j) => ANY(pool, C(`fm_${k.id}_${j}`, '$it')))));
    }
    proc('fusionDo', [], [...clearMarks, choose({ from: flt(cards('$me', 'extra'), OR(L(false), ...fusions.map((k) => AND(eq(g('$it', 'card'), k.id), C(`fc_${k.id}`))))), min: 0, max: 1, as: '$fz', prompt: 'Fusion summon which unit?' }),
      ...fusions.map((k) => IF(AND(isObj('$fz'), eq(g('$fz', 'card'), k.id)), [
        ...k.mats!.flatMap((_, j) => [choose({ from: flt(pool, AND(C(`fm_${k.id}_${j}`, '$it'), eq(g('$it', 'mat'), 0))), min: 1, max: 1, as: `$fj${j}`, prompt: `Fusion material ${j + 1}: ${filterText(k.mats![j], bp) || 'any unit'}` }),
          IF(isObj(`$fj${j}`), [SET(`$fj${j}`, 'mat', 1)])]),
        IF(eq(cnt(matsMarked), k.mats!.length), [['move', matsMarked, 'grave'], emit('fusion', { p: '$me' }), ...placeOr('$fz', anyDest, L([]))], clearMarks)]))]);
  }
  if (bp.cards.some((k) => k.abilities.some((a) => a.do.some((e) => e.k === 'ritual')))) {
    const pool = (r: X) => flt(cat(cards('$me', 'hand'), faceUp), AND(ne('$it', r), inl(g('$it', 'role'), UNIT_ROLES), eq(g('$it', 'mat'), 0)));
    proc('ritualDo', [], [...clearMarks, choose({ from: flt(cards('$me', 'hand'), AND(eq(def('$it', 'ritual'), 1), ['let', '$rc', '$it', ge(SUM(pool('$rc'), lv('$it')), def('$rc', 'level'))])),
      min: 0, max: 1, as: '$rt', prompt: 'Ritual summon which unit?' }),
      IF(isObj('$rt'), [SET('game', 'rem', def('$rt', 'level')), EACH(range(8), '$ry', [IF(gt(g('game', 'rem'), 0), [
        choose({ from: pool('$rt'), min: 1, max: 1, as: '$rx', prompt: 'Tribute a unit (levels must reach the ritual unit\'s level)' }), IF(isObj('$rx'), [SET('$rx', 'mat', 1), INC('game', 'rem', ['neg', lv('$rx')])], [SET('game', 'rem', 0)])])]),
        ['move', matsMarked, 'grave'], emit('ritual', { p: '$me' }), ...placeOr('$rt', mmz, L([]))])]);
  }
  if (bp.cards.some((k) => k.scale) && x.grid) {
    const scales = (p: X) => flt(cards(p, 'support'), AND(gt(def('$it', 'scale'), 0), inl(g('$it', 'slot'), ['s1', 's5'])));
    Aa.scale = { label: 'Set as pendulum scale', phases: x.main, ...sp(1), source: flt(cards('$me', 'hand'), AND(gt(def('$it', 'scale'), 0), ANY(['freeSlots', '$me', 'support'], inl('$it', ['s1', 's5'])))),
      do: [choose({ from: flt(['freeSlots', '$me', 'support'], inl('$it', ['s1', 's5'])), min: 1, max: 1, as: '$sz', prompt: 'Which pendulum zone?' }), ['move', '$self', 'support', { slot: '$sz', as: '$sn' }], emit('scale', { p: '$me', o: '$sn' })] };
    const lo = ['min', def(first(scales('$me')), 'scale'), def(['nth', scales('$me'), 1], 'scale')], hi = ['max', def(first(scales('$me')), 'scale'), def(['nth', scales('$me'), 1], 'scale')];
    const cands = flt(cat(flt(cards('$me', 'hand'), AND(eq(g('$it', 'role'), 'unit'), NOT(def('$it', 'ritual')))), cards('$me', 'pextra')), AND(gt(lv('$it'), lo), lt(lv('$it'), hi)));
    Aa.pendulum = { label: 'Pendulum summon', phases: x.main, limit: { per: 'turn', group: 'pendulum' }, ...sp(1),
      req: [{ if: eq(cnt(scales('$me')), 2), why: 'Needs two pendulum scales' }, { if: gt(cnt(cands), 0), why: 'No unit has a level between the scales' }, { if: gt(cnt(C('mmz', '$me')), 0), why: 'No free zone' }],
      do: [choose({ from: cands, min: 1, max: mn(5, cnt(C('anyDest', '$me'))), as: '$pd', prompt: 'Pendulum summon which units?' }), emit('pendulum', { p: '$me' }),
        EACH(['concat', ['list'], '$pd'], '$pu', [IF(eq(g('$pu', 'zone'), 'pextra'), [C('place', '$pu', edDest, L([]))], [C('place', '$pu', C('mmz', '$me'), L([]))])])] };
  }
  if (r.mode === 'cards' && x.hasRole('resource')) Aa.resource = { label: `Play ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: flt(cards('$me', 'hand'), eq(g('$it', 'role'), 'resource')), do: [['move', '$self', 'resources', { as: '$rs' }], IF(NOT(has('$rs', 'entersExhausted')), [C('gainRes', '$me', g('$rs', 'res'), 1)])] };
  if (r.mode === 'anycard') Aa.resource = { label: `Place as ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: r.onlyKeyword ? flt(cards('$me', 'hand'), has('$it', x.kwKey(r.onlyKeyword))) : cards('$me', 'hand'),
    do: [['move', '$self', 'resources', { as: '$rs', ...(r.faceDown ? { faceDown: true } : {}) }], C('gainRes', '$me', r.faceDown ? 'c' : g('$rs', 'res'), 1)] };
  if (r.mode === 'attach' && x.hasRole('resource')) Aa.energy = { label: `Attach ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: flt(cards('$me', 'hand'), AND(eq(g('$it', 'role'), 'resource'), gt(cnt(units(x, '$me')), 0))),
    targets: [{ as: '$b', from: units(x, '$me'), prompt: `Attach ${r.name} to which unit?` }],
    do: [['move', '$self', 'support', { as: '$en' }], ['link', '$en', 'bearer', '$b'], SET('$en', 'att', 1)] };
  if (r.boost > 0 && x.pool) Aa.boost = { label: r.give ? `Give 1 ${r.name}: +${r.boost} ${nm(bp, 'stats', POW)}` : `Spend 1 ${r.name}: +${r.boost} ${nm(bp, 'stats', POW)}`, phases: r.give ? x.main : x.fast, ...sp(2),
    source: flt(cat(units(x, '$me'), ...(x.leader ? [cards('$me', 'leader')] : [])), ['canPay', '$me', 'mana', 1]),
    cost: [['pay', '$me', 'mana', 1]], do: [['modify', '$self', { layer: 'add', mods: [{ op: 'add', stat: POW, value: r.boost }], until: 'turn' }], ...(r.give ? [INC('$self', 'don', 1), emit('given', { o: '$self', p: '$me' })] : [])] };
  if (c.counterStep && x.battle && bp.stats.some((s) => s.id === 'counter')) Aa.counterCard = { label: 'Counter', phases: ['respond'], ...sp(2),
    source: flt(cards('$me', 'hand'), AND(gt(def('$it', 'counter'), 0), eq('$win.defender', '$me'))),
    do: [['move', '$self', 'grave'], LET('$ct', Q(isP(T), x.leader ? first(cards('$me', 'leader')) : 0, T)),
      IF(isObj('$ct'), [INC('$ct', 'bb', def('$self', 'counter'))])] };
  if (bp.cards.some((k) => k.abilities.some((a) => a.when === 'activated')) || bp.keywords.some((k) => k.abilities?.some((a) => a.when === 'activated')))
    if (bp.cards.some((k) => k.abilities.some((ab) => ab.when === 'activated' && ab.sacSelf))) Aa.actNow = { label: 'Use', phases: x.fast, activated: 'actsNow', ...sp(2),
      source: cat(units(x, '$me'), cards('$me', 'support'), ...(x.check ? [cards('$me', 'pool')] : []), ...(x.runs ? runServers(bp).flatMap((v) => [flt(cards('$me', v.ice), NOT(g('$it', 'faceDown'))), ...(v.content ? [flt(cards('$me', v.content), NOT(g('$it', 'faceDown')))] : [])]) : []), ...(x.leader ? [cards('$me', 'leader')] : [])), do: [] };
    const anyAb = (f: (a: Ability) => boolean) => bp.cards.some((k) => k.abilities.some((ab) => ab.when === 'activated' && f(ab)));
    if (anyAb((a) => !!a.quick && !a.from && !a.sacSelf)) Aa.actQ = { label: 'Use (quick)', phases: x.fast, activated: 'actsQ', ...sp(2, true),
      source: cat(flt(units(x, '$me'), AND(NOT(g('$it', 'faceDown')), ...stopped('$it', 'abilities'))), cards('$me', 'support'), ...(x.check ? [cards('$me', 'pool')] : []), ...(x.runs ? runServers(bp).flatMap((v) => [flt(cards('$me', v.ice), NOT(g('$it', 'faceDown'))), ...(v.content ? [flt(cards('$me', v.content), NOT(g('$it', 'faceDown')))] : [])]) : []), ...(x.leader ? [cards('$me', 'leader')] : [])), do: [] };
    if (anyAb((a) => a.from === 'hand')) Aa.actHand = { label: 'Use from hand', phases: x.fast, activated: 'actsHand', ...sp(2), source: cards('$me', 'hand'), do: [] };
    if (anyAb((a) => a.from === 'grave')) Aa.actGrave = { label: 'Use from discard pile', phases: x.main, activated: 'actsGrave', ...sp(1), source: cards('$me', 'grave'), do: [] };
    Aa.act = { label: 'Use', phases: x.main, activated: 'acts', ...sp(1, true), source: cat(flt(units(x, '$me'), AND(L(true), ...stopped('$it', 'abilities'))), cards('$me', 'support'), ...(x.check ? [cards('$me', 'pool')] : []), ...(x.runs ? runServers(bp).flatMap((v) => [flt(cards('$me', v.ice), NOT(g('$it', 'faceDown'))), ...(v.content ? [flt(cards('$me', v.content), NOT(g('$it', 'faceDown')))] : [])]) : []), ...(x.leader ? [cards('$me', 'leader')] : [])), do: [] };
  if (arenas && atkZ.length < UZ.length) {
    const front = atkZ[0];
    Aa.advance = { label: `Move to ${arenas.find((a) => a.id === front)!.name}`, phases: x.main, limit: { per: 'turn', by: 'source' }, ...sp(1),
      source: flt(units(x, '$me', UZ.filter((z) => !atkZ.includes(z))), C('roomIn', '$me', front)), do: [C('moveKeep', '$self', front)] };
  }
  if (c.quest) Aa.quest = { label: 'Quest', phases: x.atkPhases, limit: { per: 'turn', by: 'source' }, ...sp(1), source: flt(units(x, '$me'), canQuestFn('$it')),
    do: [SET('$self', 'ex', 1), INC('$me', 'score', g('$self', c.quest)), emit('quest', { o: '$self', p: '$me', n: g('$self', c.quest) }),
      ...(x.hasRule('support') ? [IF(has('$self', 'support'), [choose({ from: flt(units(x, '$me'), ne('$it', '$self')), min: 0, max: 1, as: '$sup', prompt: 'Support: give which unit this power this turn?' }),
        IF(isObj('$sup'), [['modify', '$sup', { layer: 'add', mods: [{ op: 'add', stat: POW, value: C('pw', '$self') }], until: 'turn' }], emit('supported', { o: '$sup', n: C('pw', '$self') })])])] : [])] };
  // locations: play them, move units to them for their move cost
  if (x.hasRole('location')) {
    Aa.locate = { label: 'Play location', phases: x.main, source: hand(inl(g('$it', 'type'), types('location'))), ...sp(1, bp.timing === 'stack'), req: apReq, cost: [...payCost, ...apCost],
      do: [['move', '$self', 'locations', { as: '$lc' }], IF(isObj('$lc'), [SET('$lc', 'newT', '$turn')])] };
    const dests = (u: X) => flt(cards('$me', 'locations'), AND(ne('$it', g(u, 'at')), ['canPay', '$me', 'mana', mx(0, def('$it', 'move'))]));
    Aa.moveLoc = { label: 'Move to a location', phases: x.main, ...sp(1), source: flt(units(x, '$me'), ['let', '$mu', '$it', gt(cnt(dests('$mu')), 0)]),
      targets: [{ as: '$lc', from: dests('$self'), prompt: 'Move it to which location?' }],
      cost: [['pay', '$me', 'mana', mx(0, def('$lc', 'move'))]], do: [['link', '$self', 'at', '$lc'], emit('movedTo', { o: '$self', loc: '$lc', p: '$me' })] };
  }
  // Shift: play on top of your unit with the same name, keeping its damage, exhaustion, play turn, location and cards under it
  if (bp.cards.some((k) => k.shift)) {
    const bases = (cd: X) => flt(units(x, '$me'), eq(def('$it', 'base'), def(cd, 'base')));
    proc('shiftOnto', ['$c', '$b'], [LET('$under', ['linked', '$b', 'host']), LET('$d', g('$b', 'dmg')), LET('$ex', g('$b', 'ex')), LET('$nt', g('$b', 'newT')), LET('$at', g('$b', 'at')),
      ...UZ.map((z) => IF(eq(g('$b', 'zone'), z), [['move', '$c', z, { as: '$sh' }], IF(isObj('$sh'), [SET('$sh', 'dmg', '$d'), SET('$sh', 'ex', '$ex'), SET('$sh', 'newT', '$nt'),
        IF(isObj('$at'), [['link', '$sh', 'at', '$at']]), IF(gt(cnt('$under'), 0), [['link', '$under', 'host', '$sh']]),
        ['move', '$b', 'under', { as: '$bu' }], IF(isObj('$bu'), [['link', '$bu', 'host', '$sh']]), emit('shifted', { o: '$sh', p: '$me' })])]))]);
    Aa.shift = { label: 'Shift', phases: x.main, ...sp(1, bp.timing === 'stack'), req: apReq,
      source: flt(cards('$me', 'hand'), AND(gt(def('$it', 'shift'), 0), ['canPay', '$me', 'mana', def('$it', 'shift')], ['let', '$sc', '$it', gt(cnt(bases('$sc')), 0)])),
      targets: [{ as: '$b', from: bases('$self'), prompt: 'Shift onto which unit?' }], cost: [['pay', '$me', 'mana', def('$self', 'shift')], ...apCost], do: [C('shiftOnto', '$self', '$b')] };
  }
  // Boost N: once a turn, pay N to put the top card of your deck face down under the unit
  if (x.hasRule('boost')) Aa.boostUnder = { label: 'Boost', phases: x.main, limit: { per: 'turn', by: 'source' }, ...sp(1),
    source: flt(units(x, '$me'), AND(has('$it', 'boost'), ['canPay', '$me', 'mana', mx(0, def('$it', 'kw_boost'))], gt(cnt(cards('$me', 'deck')), 0))),
    cost: [['pay', '$me', 'mana', mx(0, def('$self', 'kw_boost'))]],
    do: [['move', ['top', '$me', 'deck', 1], 'under', { as: '$bc', faceDown: true }], IF(isObj('$bc'), [['link', '$bc', 'host', '$self'], emit('boosted', { o: '$self', p: '$me' })])] };
  // saved resources (ink drops): spend one for 1 of your resource this turn
  if (x.pool && usesEff('drops')) Aa.useDrop = { label: `Spend a saved ${r.name}`, phases: x.fast, ...sp(2), req: [{ if: gt(g('$me', 'drops'), 0), why: `No saved ${r.name}` }],
    do: [INC('$me', 'drops', -1), C('gainRes', '$me', 'c', 1), emit('dropSpent', { p: '$me' })] };

  // attacks
  if (c.mode === 'block' || c.mode === 'target') {
    const attackers = cat(units(x, '$me'), ...(x.leader && c.leaderAttacks ? [cards('$me', 'leader')] : []));
    const base: Record<string, any> = { label: 'Attack', phases: x.atkPhases, limit: { per: 'turn', by: 'source', ...(x.hasRule('extraAttack') ? { n: 2 } : {}) }, ...sp(1),
      source: flt(attackers, AND(C('canAtk', '$it'), ...(x.hasRule('adventurous') ? [NOT(has('$it', 'adventurous'))] : []))) };
    if (c.mode === 'block') {
      Aa.attack = { ...base, do: [['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blockers: L([]) } }], SET('game', 'bat', 0)] };
    } else {
      const ouAll = units(x, '$opp');
      const ou = c.sameArena && arenas ? flt(ouAll, eq(g('$it', 'zone'), g('$self', 'zone'))) : ouAll;
      const reach = (l: X) => flt(l, AND(NOT(has('$it', 'noBeAttacked')), OR(NOT(has('$it', 'flying')), has('$self', 'flying'), has('$self', 'reach'))));
      const hitable = reach(c.targetUnits === 'any' ? ou : c.targetUnits === 'exhausted' ? flt(ou, eq(g('$it', 'ex'), 1)) : L([]));
      const face = x.leader ? cards('$opp', 'leader') : ['list', '$opp'];
      const open = c.direct === 'never' ? hitable : c.direct === 'ifEmpty' ? Q(gt(cnt(ouAll), 0), hitable, face) : cat(face, hitable);
      const locs: X = x.hasRole('location') ? cards('$opp', 'locations') : L([]);
      const guards = x.hasRule('bodyguard') ? flt(hitable, OR(has('$it', 'guard'), has('$it', 'bodyguard'))) : flt(ou, has('$it', 'guard'));
      const from0 = Q(AND(gt(cnt(guards), 0), NOT(has('$self', 'saboteur'))), cat(guards, locs), cat(open, locs));
      const from1 = x.hasRule('directAttack') ? Q(has('$self', 'directAttack'), cat(face, hitable), from0) : from0;
      const from = x.hasRule('rushUnits') ? Q(AND(has('$self', 'rushUnits'), eq(g('$self', 'newT'), '$turn'), NOT(has('$self', 'haste'))), hitable, from1) : from1;
      Aa.attack = { ...base, targets: [{ as: '$t', from, prompt: 'Attack what?' }],
        do: [['openWindow', 'battle', { data: { attacker: '$self', target: '$t', defender: '$opp', blockers: L([]) } }], SET('game', 'bat', 0)] };
    }
  }
  if (c.mode === 'block' && c.mass) {
    const attackers = flt(cat(units(x, '$me'), ...(x.leader && c.leaderAttacks ? [cards('$me', 'leader')] : [])), C('canAtk', '$it'));
    Aa.attack = { label: 'Attack', phases: x.atkPhases, limit: { per: 'turn', group: 'combat' }, ...sp(1), req: [{ if: gt(cnt(attackers), 0), why: 'No unit can attack' }],
      do: [choose({ from: attackers, min: 1, max: 30, as: '$as', prompt: 'Attack with which units?' }),
        EACH('$as', '$a', [...(x.hasRole('walker') ? [IF(gt(cnt(walkers('$opp')), 0), [choose({ from: cat(['list', '$opp'], walkers('$opp')), min: 1, max: 1, as: '$at', prompt: 'Attack the opponent or one of their walkers?' }),
          IF(isObj('$at'), [['link', '$a', 'atkTo', '$at']])])] : []), SET('$a', 'atk', 1)]),
        ['openWindow', 'combat', { data: { attacker: '$me', defender: '$opp' } }]] };
  }
  if (c.mode === 'duel') {
    Aa.useMove = { label: 'Attack', phases: x.atkPhases, activated: 'moves', ...sp(1), source: flt(cards('$me', 'active'), AND(c.firstTurnAttack ? L(true) : ne('$turn', 1), ...stopped('$it', 'attack'))), do: [] };
    Aa.retreat = { label: 'Retreat', phases: x.main, limit: { per: 'turn' }, ...sp(1),
      source: flt(cards('$me', 'active'), AND(ge(cnt(C('energy', '$it')), def('$it', 'retreat')), gt(cnt(cards('$me', 'bench')), 0), ...stopped('$it', 'retreat'))),
      targets: [{ as: '$b', from: cards('$me', 'bench'), prompt: 'Swap in which benched unit?' }],
      do: [EACH(['slice', C('energy', '$self'), 0, def('$self', 'retreat')], '$e', [['move', '$e', 'grave']]), C('moveKeep', '$self', 'bench'), C('moveKeep', '$b', 'active')] };
  }
  if (conq) {
    const from = g('$self', 'zone');
    const canGo = (u: X) => OR(eq(g(u, 'zone'), 'base'), has(u, 'ganking'));
    Aa.march = { label: 'Move', phases: x.atkPhases, ...sp(1), source: flt(units(x, '$me'), C('canAtk', '$it')),
      do: [LET('$from', from),
        choose({ from: cat(...lanes.map((z, i) => Q(AND(ne('$from', z), canGo('$self')), ['list', L(c.lanes[i])], ['list'])), Q(ne('$from', 'base'), ['list', L('Base')], ['list'])),
          min: 1, max: 1, as: '$l', prompt: 'Move to where?' }),
        choose({ from: flt(units(x, '$me'), AND(ne('$it', '$self'), eq(g('$it', 'zone'), '$from'), C('canAtk', '$it'), Q(eq('$l', 'Base'), L(true), canGo('$it')))), min: 0, max: 30, as: '$grp', prompt: 'Move any other units with it?' }),
        LET('$all', cat(['list', '$self'], '$grp')),
        ...lanes.map((z, i) => IF(eq('$l', c.lanes[i]), [EACH('$all', '$mv', [SET('$mv', 'ex', 1), C('moveKeep', '$mv', z)]), emit('marched', { p: '$me', z, n: cnt('$all') }), C('arrive', i + 1, '$me')])),
        IF(eq('$l', 'Base'), [EACH('$all', '$mv', [SET('$mv', 'ex', 1), C('moveKeep', '$mv', 'base')])])] };
  } else if (c.mode === 'lanes') {
    Aa.march = { label: 'Move', phases: x.atkPhases, ...sp(1), source: flt(units(x, '$me'), C('canAtk', '$it')),
      do: [choose({ from: L([...c.lanes, 'Base']), min: 1, max: 1, as: '$l', prompt: 'Move to which battlefield?' }),
        ...lanes.map((z, i) => IF(AND(eq('$l', c.lanes[i]), ne(g('$self', 'zone'), z)), [SET('$self', 'ex', 1), C('moveKeep', '$self', z), C('showdown', z, '$me')])),
        IF(AND(eq('$l', 'Base'), ne(g('$self', 'zone'), 'base')), [SET('$self', 'ex', 1), C('moveKeep', '$self', 'base')])] };
  }

  // ---- skill checks: one Play action for every card; the card waits in your card pool until the end of the turn
  if (x.check) {
    for (const k of ['summon', 'cast', 'deploy', 'attackCard', 'quick', 'locate', 'flashUnit']) delete Aa[k];
    const lastPool = ['nth', cards('$me', 'pool'), sub(cnt(cards('$me', 'pool')), 1)];
    const comboOK = bp.cards.some((k) => k.combo) ? OR(NOT(def('$it', 'combo')), ['let', '$lp', lastPool, AND(isObj('$lp'), OR(['in', def('$it', 'combo'), def('$lp', 'traits')], eq(g('$lp', 'type'), def('$it', 'combo'))))]) : L(true);
    const atkOK = OR(ne(g('$it', 'role'), 'attack'), c.firstTurnAttack ? L(true) : c.firstTurnEach ? gt(g('$me', 'turns'), 1) : ne('$turn', 1));
    const roleBody = (o: string): X[] => [
      IF(eq(g(o, 'role'), 'attack'), [IF(eq(def(o, 'hasEff'), 1), [['run', o, 'effects']]),
        ['openWindow', 'battle', { data: { attacker: o, target: '$opp', defender: '$opp', blockers: L([]), power: 0, guard: 0 } }], SET('game', 'bat', 0)]),
      IF(inl(g(o, 'role'), ['spell', 'fast', 'permanent']), [IF(eq(def(o, 'hasEff'), 1), [['run', o, 'effects']])]),
      IF(inl(g(o, 'role'), UNIT_ROLES), [['move', o, UZ[0], { as: '$pu' }], IF(isObj('$pu'), [SET('$pu', 'newT', '$turn')])])];
    Aa.play = { label: 'Play', phases: x.atkPhases, ...sp(1), req: apReq,
      source: flt(cards('$me', 'hand'), AND(NOT(inl(g('$it', 'role'), ['resource', 'token', 'leader', 'extra'])), atkOK, comboOK, ...typeOK)),
      cost: apCost,
      do: [LET('$need', add(C('costOf', '$self', '$me'), cnt(cards('$me', 'pool')))), ['move', '$self', 'pool', { as: '$pc' }], SET('$pc', 'newT', '$turn'),
        C('check', '$me', '$need'),
        IF(eq(g('game', 'ck'), 1), roleBody('$pc'), [IF(isObj('$pc'), [['move', '$pc', 'grave']]), emit('checkFail', { p: '$me' }), ['gotoPhase', x.endP]])] };
  }
  // enhances (zone combat): spend momentum for speed or damage, stun the rival's foundations
  if (x.zonesC) {
    const myAtk = (rule: string, extra: X = L(true)) => flt(cards('$me', x.check ? 'pool' : 'limbo'), AND(eq('$it', '$win.attacker'), has('$it', rule), NOT(has('$it', 'flashAtk')), extra));
    const hasMom = gt(cnt(cards('$me', 'momentum')), 0);
    if (x.hasRule('ex')) Aa.exEnh = { label: 'EX: momentum for speed', phases: ['respond'], ...sp(2), limit: { per: 'turn', by: 'source' }, source: myAtk('ex', hasMom),
      do: [['move', first(cards('$me', 'momentum')), 'grave'], ['modify', '$self', { layer: 'add', mods: [{ op: 'add', stat: 'speed', value: def('$self', 'kw_ex') }], until: 'turn' }], emit('enhanced', { o: '$self', what: 'speed', n: def('$self', 'kw_ex') })] };
    if (x.hasRule('powerful')) Aa.powEnh = { label: 'Powerful: momentum for damage', phases: ['respond'], ...sp(2), limit: { per: 'turn', by: 'source' }, source: myAtk('powerful', hasMom),
      do: [['move', first(cards('$me', 'momentum')), 'grave'], ['modify', '$self', { layer: 'add', mods: [{ op: 'add', stat: POW, value: def('$self', 'kw_powerful') }], until: 'turn' }], emit('enhanced', { o: '$self', what: 'damage', n: def('$self', 'kw_powerful') })] };
    if (x.hasRule('stun')) Aa.stunEnh = { label: 'Stun', phases: ['respond'], ...sp(2), limit: { per: 'turn', by: 'source' }, source: myAtk('stun', gt(cnt(readyFound('$opp')), 0)),
      do: [LET('$sn', mn(def('$self', 'kw_stun'), cnt(readyFound('$opp')))), choose({ who: '$opp', from: readyFound('$opp'), min: '$sn', max: '$sn', as: '$st', prompt: 'Stunned: commit which foundations?', required: true }),
        EACH('$st', '$sf', [SET('$sf', 'ex', 1)]), emit('stunned', { p: '$opp', n: '$sn' })] };
  }

  // ---- asymmetric runs: servers guarded by ICE; the raider runs them, breaks subroutines and accesses cards
  if (x.runs) {
    const SV = runServers(bp);
    const RZ = SV.filter((v) => v.content).map((v) => v.content!);
    const POWs = POW;
    const zn = (p: X, list: string[]) => cat(...list.map((z) => cards(p, z)));
    const ceilDiv = (a: X, b: X) => ['/', add(a, sub(b, 1)), b];
    const brCost = (b: X, ic: X) => add(mul(ceilDiv(mx(0, sub(g(ic, POWs), g(b, POWs))), mx(1, def(b, 'bBy'))), def(b, 'bCost')), mul(mx(1, def(ic, 'nsubs')), def(b, 'brk')));
    const side = (n: number) => eq(g('$me', 'side'), n);
    // the defender (side 0): install face down, rez, advance and score schemes
    Aa.installC = { label: 'Install', phases: x.main, ...sp(1), req: [{ if: side(0), why: 'Only the defender installs here' }, ...apReq],
      source: flt(cards('$me', 'hand'), OR(inl(g('$it', 'role'), ['ice', 'agenda']), AND(eq(g('$it', 'role'), 'permanent'), eq(def('$it', 'side'), 0)))), cost: apCost,
      do: [IF(eq(g('$self', 'role'), 'ice'), [
        choose({ from: cat(...SV.map((v) => Q(['canPay', '$me', 'mana', cnt(cards('$me', v.ice))], ['list', L(v.name)], ['list']))), min: 1, max: 1, as: '$isv', prompt: 'Install it in front of which server? (costs 1 per guardian already there)' }),
        ...SV.map((v) => IF(eq('$isv', v.name), [['pay', '$me', 'mana', cnt(cards('$me', v.ice))], ['move', '$self', v.ice, { faceDown: true, as: '$ii' }], emit('installed', { p: '$me', z: v.ice })]))],
        [choose({ from: L(SV.filter((v) => v.content).map((v) => v.name)), min: 1, max: 1, as: '$isv', prompt: 'Install it in which remote server? (anything already there is trashed)' }),
          ...SV.filter((v) => v.content).map((v) => IF(eq('$isv', v.name), [['move', cards('$me', v.content!), 'grave'], ['move', '$self', v.content!, { faceDown: true, as: '$ii' }], emit('installed', { p: '$me', z: v.content })]))])] };
    Aa.rez = { label: 'Rez', phases: x.main, ...sp(1), source: flt(zn('$me', RZ), AND(g('$it', 'faceDown'), ne(g('$it', 'role'), 'agenda'), ['canPay', '$me', 'mana', mx(0, def('$it', 'rez'))])),
      do: [['pay', '$me', 'mana', mx(0, def('$self', 'rez'))], ['flip', '$self'], emit('rezzed', { o: '$self', p: '$me' })] };
    Aa.advance = { label: 'Advance', phases: x.main, ...sp(1), req: apReq, source: flt(zn('$me', RZ), AND(eq(g('$it', 'role'), 'agenda'), ['canPay', '$me', 'mana', 1])),
      cost: [...apCost, ['pay', '$me', 'mana', 1]], do: [INC('$self', 'adv', 1), emit('advanced', { o: '$self', p: '$me', n: g('$self', 'adv') })] };
    Aa.scoreAg = { label: 'Score', phases: x.main, ...sp(1), source: flt(zn('$me', RZ), AND(eq(g('$it', 'role'), 'agenda'), ge(g('$it', 'adv'), mx(1, def('$it', 'req'))))),
      do: [LET('$pts', def('$self', 'points')), LET('$scn', g('$self', 'card')), IF(g('$self', 'faceDown'), [['flip', '$self']]), ['move', '$self', 'scored'], INC('$me', 'score', '$pts'), emit('scoredAgenda', { p: '$me', n: '$pts', card: '$scn' })] };
    // the raider (side 1): run a server, remove tags; the defender may trash tagged resources
    Aa.run = { label: 'Run', phases: x.main, ...sp(1), req: [{ if: side(1), why: 'Only the raider runs' }, ...apReq], cost: apCost,
      do: [choose({ from: cat(...SV.map((v) => (v.content ? Q(gt(add(cnt(cards(['opp', '$me'], v.content)), cnt(cards(['opp', '$me'], v.ice))), 0), ['list', L(v.name)], ['list']) : ['list', L(v.name)]))),
        min: 1, max: 1, as: '$rsv', prompt: 'Run which server?' }), ...SV.map((v, i) => IF(eq('$rsv', v.name), [C('runOn', i)]))] };
    Aa.untag = { label: 'Remove a tag', phases: x.main, ...sp(1), req: [{ if: gt(g('$me', 'tags'), 0), why: 'No tags' }, { if: ['canPay', '$me', 'mana', 2], why: 'Needs 2' }, ...apReq],
      cost: [...apCost, ['pay', '$me', 'mana', 2]], do: [INC('$me', 'tags', -1), emit('untagged', { p: '$me' })] };
    const tagT = bp.types.filter((t) => t.tagTarget).map((t) => t.id);
    if (tagT.length) Aa.trashTagged = { label: 'Trash a tagged resource', phases: x.main, ...sp(1), req: [{ if: gt(g('$opp', 'tags'), 0), why: 'The opponent has no tags' }, { if: ['canPay', '$me', 'mana', 2], why: 'Needs 2' }, ...apReq],
      source: flt(cards('$opp', 'support'), inl(g('$it', 'type'), tagT)), cost: [...apCost, ['pay', '$me', 'mana', 2]], do: [['move', '$self', 'grave'], emit('trashedTagged', { p: '$me' })] };
    // runner installs need memory for programs; defender cards never go to the rig
    const memT = bp.types.filter((t) => t.memory).map((t) => t.id);
    const muUsed = SUM(flt(cards('$me', 'support'), inl(g('$it', 'type'), memT)), mx(0, def('$it', 'mu')));
    const muMax = add(c.memory ?? 4, SUM(cards('$me', 'support'), mx(0, def('$it', 'muPlus'))));
    if (Aa.deploy) Aa.deploy.source = flt(Aa.deploy.source, AND(ne(def('$it', 'side'), 0), OR(NOT(inl(g('$it', 'type'), memT)), le(add(muUsed, mx(0, def('$it', 'mu'))), muMax))));
    // a run: approach each ICE from the outside in (the defender may rez it), encounter it (break or let it fire), then access
    proc('runOn', ['$sv'], [LET('$co', ['opp', '$me']), SET('game', 'live', 1), SET('game', 'nth', 0), emit('run', { p: '$me' }),
      ...SV.map((v, i) => IF(eq('$sv', i), [
        EACH(['reverse', cards('$co', v.ice)], '$ic', [IF(eq(g('game', 'live'), 1), [
          IF(gt(g('game', 'nth'), 0), [choose({ from: L(['Keep going', 'Jack out']), min: 1, max: 1, as: '$jo', prompt: 'Keep going, or jack out (end the run safely)?' }),
            IF(eq('$jo', 'Jack out'), [SET('game', 'live', 0), emit('jackOut', { p: '$me' })])]),
          IF(eq(g('game', 'live'), 1), [INC('game', 'nth', 1), emit('approach', { o: '$ic', p: '$me' }),
            IF(AND(g('$ic', 'faceDown'), ['canPay', '$co', 'mana', mx(0, def('$ic', 'rez'))]), [
              choose({ who: '$co', from: L(['Rez it', 'Leave it']), min: 1, max: 1, as: '$rz', prompt: 'Raiders approach: rez this guardian?' }),
              IF(eq('$rz', 'Rez it'), [['pay', '$co', 'mana', mx(0, def('$ic', 'rez'))], ['flip', '$ic'], emit('rezzed', { o: '$ic', p: '$co' })])]),
            IF(NOT(g('$ic', 'faceDown')), [C('encounter', '$ic')])])])]),
        IF(eq(g('game', 'live'), 1), [emit('runSuccess', { p: '$me', z: v.name }),
          ...(v.access === 'hq' ? [['random', { from: cards('$co', 'hand'), as: '$ah' }], IF(isObj('$ah'), [C('access', '$ah', 1)])]
            : v.access === 'rd' ? [LET('$ar', first(['top', '$co', 'deck', 1])), IF(isObj('$ar'), [C('access', '$ar', 1)])]
              : v.access === 'arc' ? [EACH(cards('$co', 'grave'), '$aa', [C('access', '$aa', 0)])]
                : [EACH(cards('$co', v.content!), '$am', [C('access', '$am', 1)])])], [emit('runFailed', { p: '$me' })])])),
      SET('game', 'live', 0)]);
    proc('encounter', ['$ic'], [emit('encounter', { o: '$ic' }),
      choose({ from: cat(flt(cards('$me', 'support'), AND(NOT(NOT(def('$it', 'breaks'))), OR(eq(def('$it', 'breaks'), def('$ic', 'iceType')), eq(def('$it', 'breaks'), 'all')), ['canPay', '$me', 'mana', brCost('$it', '$ic')])),
        ['list', L('Let it fire')]), min: 1, max: 1, as: '$br', prompt: 'Encounter: break its subroutines with which breaker (or let them fire)?' }),
      IF(isObj('$br'), [['pay', '$me', 'mana', brCost('$br', '$ic')], emit('broken', { o: '$ic', by: '$br' })], [emit('fired', { o: '$ic' }), ['run', '$ic', 'subs']])]);
    proc('access', ['$ac', '$tr'], [emit('accessed', { p: '$me', o: '$ac', card: g('$ac', 'card') }),
      IF(eq(g('$ac', 'role'), 'agenda'), [LET('$pts', def('$ac', 'points')), IF(g('$ac', 'faceDown'), [['flip', '$ac']]), ['move', '$ac', 'scored', { player: '$me' }], INC('$me', 'score', '$pts'), emit('stolen', { p: '$me', n: '$pts' })],
        [IF(eq(def('$ac', 'hasAcc'), 1), [['run', '$ac', 'onAccess']]),
          IF(AND(eq('$tr', 1), isObj('$ac'), gt(def('$ac', 'trash'), 0), ['canPay', '$me', 'mana', def('$ac', 'trash')]), [
            choose({ from: L(['Trash it', 'Leave it']), min: 1, max: 1, as: '$tq', prompt: 'Pay its trash cost to trash it?' }),
            IF(eq('$tq', 'Trash it'), [['pay', '$me', 'mana', def('$ac', 'trash')], ['move', '$ac', 'grave'], emit('trashedAccess', { p: '$me' })])])])]);
  }
  if (r.basicActions && ap) {
    Aa.takeOne = { label: `Take 1 ${r.name}`, phases: x.main, ...sp(1), req: apReq, cost: apCost, do: [C('gainRes', '$me', 'c', 1), emit('tookOne', { p: '$me' })] };
    Aa.drawOne = { label: 'Draw a card', phases: x.main, ...sp(1), req: [...apReq, { if: gt(cnt(cards('$me', 'deck')), 0), why: 'Your deck is empty' }], cost: apCost, do: [['draw', '$me', 1]] };
  }

  // ---- triggers, state checks, replacements
  const triggers: X[] = [];
  if (bp.win.burnOut) triggers.push({ on: 'drawFail', do: [INC(['opp', '$e.player'], 'score', 1), emit('burnOut', { p: '$e.player' }), ['move', cards('$e.player', 'grave'), 'deck'], ['shuffle', '$e.player', 'deck'],
    IF(gt(cnt(cards('$e.player', 'deck')), 0), [['draw', '$e.player', 1]])] });
  else if (bp.win.deckOut) triggers.push({ on: 'drawFail', do: [['lose', '$e.player']] });
  triggers.push({ on: 'moved', if: AND(OR(eq(def('$e.card', 'role'), 'token'), ['in', 'token', def('$e.card', 'keywords')]), NOT(inl('$e.to', [...UZ, 'support'])), ne('$e.to', 'void')), do: [IF(isObj('$e.newObj'), [['move', '$e.newObj', 'void']])] });
  triggers.push({ on: 'moved', if: AND(inl('$e.to', UZ), NOT(inl('$e.from', UZ)), isObj('$e.newObj'), has('$e.newObj', 'entersExhausted')), do: [SET('$e.newObj', 'ex', 1)] });
  if (x.hasRule('bodyguard')) triggers.push({ on: 'moved', if: AND(inl('$e.to', UZ), eq('$e.from', 'hand'), isObj('$e.newObj'), has('$e.newObj', 'bodyguard')),
    do: [choose({ who: ctrl('$e.newObj'), from: L(['Enter ready', 'Enter exhausted (Bodyguard)']), min: 1, max: 1, as: '$bgc', prompt: 'Bodyguard: enter exhausted, ready to protect?' }),
      IF(eq('$bgc', 'Enter exhausted (Bodyguard)'), [SET('$e.newObj', 'ex', 1)])] });
  const unitDied = AND(inl('$e.from', UZ), inl(def('$e.card', 'role'), UNIT_ROLES));
  if (x.hasRule('legendary')) triggers.push({ on: 'moved', if: AND(isObj('$e.newObj'), inl('$e.to', [...UZ, 'support']), NOT(inl('$e.from', [...UZ, 'support'])), has('$e.newObj', 'legendary')),
    do: [EACH(flt(cat(units(x, ctrl('$e.newObj')), cards(ctrl('$e.newObj'), 'support')), AND(ne('$it', '$e.newObj'), has('$it', 'legendary'), eq(g('$it', 'name'), g('$e.newObj', 'name')))), '$old',
      [['move', '$old', 'grave'], emit('legendRule', { p: ctrl('$e.newObj'), card: g('$e.newObj', 'card') })])] });
  if (x.prizes) triggers.push({ on: 'destroyed', if: unitDied, do: [LET('$tk', ['opp', '$e.controller']), IF(gt(cnt(cards('$tk', 'prizes')), 0), [LET('$pv', mx(1, def('$e.card', 'prizes'))), ['move', ['top', '$tk', 'prizes', '$pv'], 'hand'], emit('prize', { p: '$tk', n: '$pv' })])] });
  if (c.mode === 'duel') triggers.push({ on: 'destroyed', if: AND(eq('$e.from', 'active'), gt(cnt(cards('$e.controller', 'bench')), 0)), do: [
    choose({ who: '$e.controller', from: cards('$e.controller', 'bench'), min: 1, max: 1, as: '$pr', prompt: 'Promote which benched unit to active?' }), C('moveKeep', '$pr', 'active')] });
  if (c.mode === 'lanes' && !conq) triggers.push({ on: 'showdown', do: lanes.map((z, i) => IF(eq('$e.z', z), [LET('$m', cnt(cards('$e.p', z))), LET('$o', cnt(cards(['opp', '$e.p'], z))),
    IF(AND(gt('$m', 0), eq('$o', 0), ne(g('game', `c${i + 1}`), add(seat('$e.p'), 1))), [SET('game', `c${i + 1}`, add(seat('$e.p'), 1)), INC('$e.p', 'score', 1), emit('conquer', { p: '$e.p', z })]),
    IF(AND(eq('$m', 0), gt('$o', 0)), [SET('game', `c${i + 1}`, add(seat(['opp', '$e.p']), 1))])])) });
  const checks: X[] = [];
  if (HP) checks.push(EACH(flt(allUnits(x), AND(gt(g('$it', HP), 0), ge(g('$it', 'dmg'), g('$it', HP)), ...(x.hasRule('indestructible') ? [NOT(has('$it', 'indestructible'))] : []))), '$u', [['destroy', '$u']]));
  if (HP && x.hasRole('location')) checks.push(EACH(flt(cards('*', 'locations'), AND(gt(g('$it', HP), 0), ge(g('$it', 'dmg'), g('$it', HP)))), '$u', [['destroy', '$u']]));
  if (usesUnder) checks.push(EACH(flt(cards('*', 'under'), NOT(AND(isObj(g('$it', 'host')), OR(inl(g(g('$it', 'host'), 'zone'), UZ), eq(g(g('$it', 'host'), 'zone'), 'locations'))))), '$a', [['move', '$a', 'grave']]));
  if (c.mode === 'block' && c.mass) checks.push(EACH(flt(allUnits(x), eq(g('$it', 'dtd'), 1)), '$u', [SET('$u', 'dtd', 0), ['destroy', '$u']]));
  if (x.hasRole('walker')) checks.push(EACH(flt(cards('*', 'support'), AND(eq(g('$it', 'role'), 'walker'), le(g('$it', 'loy'), 0))), '$w', [['move', '$w', 'grave'], emit('walkerDown', { p: ctrl('$w') })]));
  checks.push(EACH(flt(cards('*', 'support'), AND(eq(g('$it', 'att'), 1), NOT(isObj(g('$it', 'bearer'))), ne(def('$it', 'equipment'), 1))), '$a', [['move', '$a', 'grave']]));
  if (conq && x.hasRule('hidden')) lanes.forEach((_, i) => checks.push(EACH(['players'], '$hp', [IF(AND(ne(g('game', `c${i + 1}`), add(seat('$hp'), 1)), gt(cnt(cards('$hp', `hid${i + 1}`)), 0)), [['move', cards('$hp', `hid${i + 1}`), 'grave'], emit('hiddenLost', { p: '$hp' })])])));
  if (meth('xyz')) checks.push(EACH(flt(cards('*', 'overlay'), NOT(isObj(g('$it', 'bearer')))), '$a', [['move', '$a', 'grave']]));
  if (x.life) checks.push(EACH(['players'], '$p', [IF(le(g('$p', 'life'), 0), [['lose', '$p']])]));
  if (pts) checks.push(EACH(['players'], '$p', [IF(ge(g('$p', 'score'), pts), [['win', '$p']])]));
  if (x.prizes) checks.push(IF(eq(g('game', 'started'), 1), [EACH(['players'], '$p', [IF(eq(cnt(cards('$p', 'prizes')), 0), [['win', '$p']])])]));
  if (bp.win.noUnits) checks.push(IF(eq(g('game', 'started'), 1), [EACH(['players'], '$p', [IF(eq(cnt(units(x, '$p')), 0), [['lose', '$p']])])]));
  const replacements: X[] = [
    ...(bp.cards.some((k) => k.scale) && x.grid ? [{ replace: 'destroy', text: 'Pendulum', if: AND(gt(def('$e.obj', 'scale'), 0), inl(g('$e.obj', 'zone'), [...UZ, 'support'])), instead: [['move', '$e.obj', 'pextra']] }] : []),
    ...(x.hasRule('indestructible') ? [{ replace: 'destroy', text: 'Indestructible', if: has('$e.obj', 'indestructible'), instead: [] }] : []),
    ...(x.hasRule('noKO') ? [{ replace: 'destroy', text: "Can't be destroyed in battle", if: AND(has('$e.obj', 'noKO'), gt(g('game', 'bat'), 0)), instead: [] }] : []),
    { replace: 'damage', text: 'Shield', if: AND(isObj('$e.target'), has('$e.target', 'shield'), eq(g('$e.target', 'shu'), 0)), instead: [SET('$e.target', 'shu', 1)] },
    { replace: 'destroy', text: 'Shield', if: AND(has('$e.obj', 'shield'), eq(g('$e.obj', 'shu'), 0), inl(g('$e.obj', 'zone'), UZ)), instead: [SET('$e.obj', 'shu', 1), SET('$e.obj', 'dmg', 0)] },
    ...(x.hasRule('resist') ? [{ replace: 'damage', text: 'Resist', if: AND(isObj('$e.target'), gt(def('$e.target', 'kw_resist'), 0)), modify: { amount: mx(0, sub('$e.amount', def('$e.target', 'kw_resist'))) } }] : []),
  ];
  const counters = bp.counters ?? [];
  const stStatics: X[] = (bp.statuses ?? []).filter((s) => s.adds && Object.keys(s.adds).length).map((s) => ({ layer: 'add', text: s.name, affects: flt(allUnits(x), gt(g('$it', `st_${s.id}`), 0)),
    mods: Object.entries(s.adds!).map(([stat, n]) => ({ op: 'add', stat, value: mul(g('$it', `st_${s.id}`), n) })) }));
  const kwStatic = (rule: string, flag: string) => ({ layer: 'add', text: rule, affects: flt(allUnits(x), AND(eq(g('$it', flag), 1), gt(def('$it', `kw_${rule}`), 0))), mods: [{ op: 'add', stat: POW, value: def('$it', `kw_${rule}`) }] });
  const statics: X[] = [...(x.battle ? [{ layer: 'add', text: 'battle', affects: flt(cat(allUnits(x), ...(x.leader ? [cards('*', 'leader')] : [])), ne(g('$it', 'bb'), 0)), mods: [{ op: 'add', stat: POW, value: g('$it', 'bb') }] }] : []),
    ...(conq && x.hasRule('challenger') ? [kwStatic('challenger', 'atk')] : []), ...(conq && x.hasRule('bulwark') ? [kwStatic('bulwark', 'dfn')] : [])];
  statics.push(...stStatics, ...counters.filter((k) => k.adds && Object.keys(k.adds).length).map((k) => ({ layer: 'add', text: k.name, affects: flt(allUnits(x), gt(g('$it', `c_${k.id}`), 0)),
    mods: Object.entries(k.adds!).map(([stat, n]) => ({ op: 'add', stat, value: mul(g('$it', `c_${k.id}`), n) })) })));

  // ---- windows and timing
  const respond: Record<string, any> = { id: 'respond', ...(stackish ? {} : { timing: { mode: 'alternate', first: '$win.defender' } }) };
  const respond2: Record<string, any> = { id: 'respond2', ...(stackish ? {} : { timing: { mode: 'alternate', first: '$win.attacker' } }) };
  const massWin = c.mode === 'block' && c.mass ? { combat: { steps: [{ id: 'declare', auto: true, do: [C('mDeclare')] }, respond, { id: 'blocks', auto: true, do: [C('mBlocks')] }, respond2,
    { id: 'firstStrike', auto: true, do: [C('mFirst')] }, { id: 'damage', auto: true, do: [C('mDamage')] }] } } : {};
  const windows0 = conq ? { showdown: { steps: [{ id: 'respond', timing: { mode: 'alternate', first: '$win.p' } }, { id: 'fight', auto: true, do: [C('fight', '$win.i', '$win.p')] }] } } : x.battle ? { battle: { steps: [...(x.zonesC ? [{ id: 'declare', auto: true, do: [C('declare'), IF(has(A, 'flashAtk'), [['gotoPhase', 'block']])] }, { ...respond, timing: { mode: 'alternate', first: '$win.attacker' } }, { id: 'block', auto: true, do: [C('block')] }] : [{ id: 'declare', auto: true, do: [C('declare')] }, { id: 'block', auto: true, do: [C('block')] }, respond]), { id: 'damage', auto: true, do: [C('battle'), EACH(flt(cat(allUnits(x), ...(x.leader ? [cards('*', 'leader')] : [])), ne(g('$it', 'bb'), 0)), '$q', [SET('$q', 'bb', 0)])] }] } } : undefined;
  const windows = windows0 || Object.keys(massWin).length ? { ...(windows0 ?? {}), ...massWin } : undefined;

  const sections = x.leader || x.hasRole('extra') || r.mode === 'deck' || !!bp.setup.champion || x.sites;
  const statIds = bp.stats.map((s) => s.id).filter((s) => s !== 'cost');
  const rules: Record<string, any> = {
    players: { min: 2, max: 2 },
    playerVars: { life: bp.win.life, score: 0, cap: 0, turns: 0, ap: 0, pp: 0, ...(x.sides ? { side: 0 } : {}), ...(x.runs ? { tags: 0 } : {}), ...(x.check ? { pen: 0 } : {}), ...(usesEff('drops') ? { drops: 0 } : {}), ...(usesPlayed ? { plays: 0 } : {}), ...(bp.setup.mulliganBonus ? { mull: 0 } : {}), ...(bp.setup.london ? { kept: 0, mulls: 0 } : {}), ...Object.fromEntries(bp.types.filter((t) => t.perTurn).map((t) => [`tp_${t.id}`, 0])) },
    objectVars: { dmg: 0, ex: 0, newT: 0, pos: 0, shu: 0, att: 0, ...(x.runs ? { adv: 0 } : {}), ...(x.zonesC ? { hitd: 0 } : {}), ...(conq ? { atk: 0, dfn: 0, pd: 0 } : {}), ...(r.give ? { don: 0 } : {}), ...(x.battle ? { bb: 0 } : {}), mat: 0, xa: 0, ...(c.mode === 'block' && c.mass ? { atk: 0, blkd: 0, dtd: 0 } : {}), ...(x.hasRole('walker') ? { loy: 0 } : {}), ...(bp.cards.some((k) => k.crew) ? { crewT: 0 } : {}), ...(bp.cards.some((k) => k.station) ? { chg: 0 } : {}), ...Object.fromEntries((bp.statuses ?? []).flatMap((s) => [[`st_${s.id}`, 0], [`sT_${s.id}`, 0]])), ...Object.fromEntries(counters.map((k) => [`c_${k.id}`, 0])) },
    gameVars: { first: 0, started: 0, bat: 0, rem: 0, hd: 0, af: 0, wf: 0, kick: 0, roll: 0, ...(x.runs ? { live: 0, nth: 0 } : {}), ...(x.check ? { ck: 0 } : {}), ...(x.hasRule('singTogether') ? { sgt: 0 } : {}), ...Object.fromEntries(lanes.map((_, i) => [`c${i + 1}`, 0])), ...(conq ? Object.fromEntries(lanes.map((_, i) => [`s${i + 1}`, 0])) : {}) },
    zones,
    deckZone: 'deck', handZone: 'hand', graveZone: 'grave',
    format: {
      deckMin: bp.setup.deckMin, deckMax: bp.setup.deckMax, maxCopies: bp.setup.maxCopies,
      ...(sections ? { zones: [
        { zone: 'deck', min: bp.setup.deckMin, max: bp.setup.deckMax, types: bp.types.filter((t) => !['leader', 'extra', 'token', 'battlefield'].includes(t.role) && !(r.mode === 'deck' && t.role === 'resource')).map((t) => t.id) },
        ...(bp.setup.champion ? [{ zone: 'champion', min: 1, max: 1, types: unitT }] : []),
        ...(x.sites ? [{ zone: 'sites', min: bp.setup.sites, max: bp.setup.sites, types: types('battlefield'), maxCopies: 1 }] : []),
        ...(x.leader ? [{ zone: 'leader', min: 1, max: 1, types: types('leader') }] : []),
        ...(x.hasRole('extra') ? [{ zone: 'extra', min: 0, max: bp.setup.extraMax, types: types('extra') }] : []),
        ...(r.mode === 'deck' ? [{ zone: 'resdeck', min: r.deckSize, max: r.deckSize, types: types('resource'), maxCopies: r.deckSize }] : []),
      ] } : {}),
      ...(bp.keywords.some((k) => k.deckMax) || (x.leader && bp.setup.leaderColors) || bp.setup.maxColors || (x.sides && x.leader) ? { rules: [
        ...(x.sides && x.leader ? [{ if: ['all', '$sections.deck', OR(eq(def('$it', 'side'), null), eq(def('$it', 'side'), def(first('$sections.leader'), 'side')))], why: "Every card must belong to your identity's side" }] : []),
        ...(bp.setup.maxColors ? [{ if: le(cnt(['distinct', flt(['map', '$deck', def('$it', 'color')], NOT(NOT('$it')))]), bp.setup.maxColors), why: `A deck may use at most ${bp.setup.maxColors} color${bp.setup.maxColors === 1 ? '' : 's'}` }] : []),...bp.keywords.filter((k) => k.deckMax).map((k) => ({
        if: le(cnt(flt('$deck', ['in', L(x.kwKey(k.id)), def('$it', 'keywords')])), k.deckMax!), why: `At most ${k.deckMax} ${k.name} card${k.deckMax === 1 ? '' : 's'} per deck` })),
        ...(x.leader && bp.setup.leaderColors ? [{ if: ['all', cat('$sections.deck', ...(bp.setup.champion ? ['$sections.champion'] : []), ...(r.mode === 'deck' ? ['$sections.resdeck'] : [])),
        OR(NOT(def('$it', 'color')), eq(def('$it', 'color'), def(first('$sections.leader'), 'color')), eq(def('$it', 'color'), def(first('$sections.leader'), 'color2')))], why: "Every card must match one of the leader's two colors" }] : [])] } : {}),
    },
    turnLimit: bp.setup.turnLimit,
    stats: statIds, layers: ['set', 'add'],
    ...(statics.length ? { statics } : {}),
    ...(x.pool ? { resources: { mana: { types: [...x.colorIds, ...x.duals, 'c'], generic: 'any' } } } : {}),
    functions: F, procedures: P,
    timing: { mode: bp.timing === 'simple' ? 'immediate' : bp.timing },
    ...(windows ? { windows } : {}),
    setup, phases, actions: Aa, triggers: [...triggers, ...(bp.advanced?.triggers ?? [])], stateChecks: checks, replacements,
  };
  if (bp.advanced?.functions) Object.assign(F, bp.advanced.functions);
  if (bp.advanced?.procedures) Object.assign(P, bp.advanced.procedures);
  if (bp.advanced?.rules) deepMerge(rules, bp.advanced.rules);

  // ---- cards, decks, presentation
  const compiledCards = bp.cards.map((k) => compileCard(x, k));
  const decks: Record<string, any> = {};
  for (const d of bp.decks) {
    const list = (m: Record<string, number> | undefined) => Object.entries(m ?? {}).flatMap(([id, n]) => Array(Math.max(0, n | 0)).fill(id));
    decks[d.id] = sections ? { deck: list(d.main), ...(x.leader ? { leader: d.leader ? [d.leader] : [] } : {}), ...(bp.setup.champion ? { champion: d.champion ? [d.champion] : [] } : {}), ...(x.sites ? { sites: d.sites ?? [] } : {}), ...(x.hasRole('extra') ? { extra: list(d.extra) } : {}), ...(r.mode === 'deck' ? { resdeck: list(d.res) } : {}) } : list(d.main);
  }
  const templates: Record<string, any> = {};
  const byType: Record<string, string> = {};
  for (const t of bp.types) {
    const f = t.frame;
    templates[`mk-${t.id}`] = { base: f.base, layout: f.layout ?? 'portrait', cost: f.cost, stats: f.stats.map((s) => ({ field: s.stat, pos: s.pos, ...(s.icon ? { icon: s.icon } : {}), ...(s.label ? { label: s.label } : {}) })), ...(f.level ? { level: f.level } : {}), text: f.text, label: t.name, art: f.art };
    byType[t.id] = `mk-${t.id}`;
  }
  const labels: Record<string, string> = { look: 'Looking at', ...Object.fromEntries(bp.types.map((t) => [t.id, t.name])), ...Object.fromEntries(bp.stats.map((s) => [s.id, s.name])),
    ...Object.fromEntries(bp.keywords.map((k) => [x.kwKey(k.id), k.name])), ...Object.fromEntries(counters.map((k) => [`c_${k.id}`, `${k.icon ?? ''}${k.name}`])),
    life: x.lifeCards && !x.life ? 'Life cards' : 'Life', score: 'Points', dmg: 'damage', field: 'Board', support: 'Support', resources: bp.resource.name, resdeck: `${bp.resource.name} deck`,
    leader: 'Leader', prizes: 'Prizes', banished: 'Banished', ...Object.fromEntries((bp.zones ?? []).map((z) => [z.id, z.name])), extra: 'Extra deck', active: 'Active', bench: 'Bench', base: 'Base', limbo: 'Resolving', grave: 'Discard', pitch: 'Pitched', ap: 'Actions', pp: bp.resource.name,
    ...Object.fromEntries(lanes.map((z, i) => [z, c.lanes[i]])), ...(x.sites ? Object.fromEntries(lanes.map((z, i) => [`site${i + 1}`, `⚑ ${c.lanes[i]}`])) : {}), champion: 'Champion', sites: 'Battlefields in reserve', don: `${bp.resource.name} given`, ...Object.fromEntries(lanes.map((_, i) => [`hid${i + 1}`, `Hidden at ${c.lanes[i]}`])), loy: 'Loyalty', chg: 'Charge', ...Object.fromEntries((arenas ?? []).map((a) => [a.id, a.name])),
    ...bp.zoneNames };
  for (const k of bp.colors) labels[`mana:${k.id}`] = k.name;
  for (const d of x.duals) labels[`mana:${d}`] = d.split('_').map((q) => nm(bp, 'colors', q)).join('/');
  labels['mana:c'] = x.recycle ? 'Energy' : bp.resource.name;
  labels.drops = `Saved ${bp.resource.name}`;
  labels.pen = 'Check penalty';
  if (x.runs) { labels.tags = 'Tags'; labels.scored = 'Scored'; labels.adv = 'Advanced'; for (const v of runServers(bp)) { labels[v.ice] = `${v.name} guards`; if (v.content) labels[v.content] = v.name; } }
  for (const s of bp.statuses ?? []) labels[`st_${s.id}`] = `${s.icon ?? ''}${s.name}`;
  const kwFields = [...new Set(bp.cards.flatMap((k) => Object.keys(k.kwv ?? {}).map((id) => `kw_${x.kwKey(id)}`)))];
  const manifest = {
    moduleId: bp.id, displayName: bp.name, semanticVersion: '1.0.0', engineApiRange: `^${ENGINE_API}`,
    licensing: `Made with the Universal Card Battles Game Maker${bp.author ? ` by ${bp.author}` : ''}.`,
    tagline: bp.tagline,
    theme: { accent: bp.look.accent, accent2: bp.look.accent2, glyph: bp.look.glyph, tapVar: c.positions ? 'pos' : 'ex', labels, ...(bp.look.board ? { board: bp.look.board } : {}), ...(x.grid ? { mirror: true, mat: { rows: ['field', 'support'], center: x.emz ? 'emz' : null } } : {}),
      ...(c.mode === 'lanes' ? { lanes: c.lanes.map((name, i) => ({ name, units: `lane${i + 1}`, ...(x.sites ? { site: `site${i + 1}` } : {}), ...(conq && x.hasRule('hidden') ? { hidden: `hid${i + 1}` } : {}), ctrl: `c${i + 1}` })) } : {}),
      hideStats: [...(x.zonesC ? ['azone', 'bzone', 'bmod'] : []), ...(x.runs ? ['side', 'iceType', 'breaks', 'bCost', 'bBy', 'brk', 'nsubs', 'hasAcc'] : []), 'base', 'shift', 'combo', 'role', 'res', 'trapOn', 'playTo', 'evolvesFrom', 'materials', 'retreat', 'hue', 'glyph', 'zone', 'family', 'hasEff', 'hasHit', 'hasConq', 'hasHold', 'traits', 'actsNow', 'evolvesFrom2', 'method', 'ritual', 'spd3', 'cont', 'linkN', 'arrows', 'actsQ', 'actsHand', 'actsGrave', 'prizes', 'resist', 'pv', 'rainbow', 'perUnit', 'kicker', 'flashback', 'cycling', 'equipCost', 'equipment', 'anyUnit', 'crew', 'station', 'loyalty', 'onConquer', 'onHold', 'en', 'pw', 'color2', 'cmN', 'cmType', ...kwFields, ...(c.mode === 'duel' ? [] : ['weakness'])],
      hideVars: [...(x.sides ? ['side'] : []), 'ex', 'newT', 'pos', 'shu', 'att', 'bb', 'mat', 'xa', 'pd', 'hd', 'af', 'roll', 'mull', 'atkT', 'blk', 'blkd', 'dtd', 'crewT', 'wf', 'kick', 'kept', 'mulls', ...(bp.statuses ?? []).map((s) => `sT_${s.id}`), ...bp.types.map((t) => `tp_${t.id}`), 'cap', 'turns', 'first', 'started', 'bat', 'rem', 'atk', 'dfn', 'plays', ...lanes.map((_, i) => `s${i + 1}`), ...(x.points ? [] : ['score']), ...(x.life ? [] : ['life']), ...(ap ? [] : ['ap']), ...(r.mode === 'pitch' ? [] : ['pp'])],
      hideKeywords: ['token'] },
    presentation: { templates, byType },
  };
  const ai = { eval: aiEval(x), samples: 1, horizon: 'pass' };
  return { manifest, rules, cards: compiledCards, decks, ai: bp.advanced?.ai ? { ...ai, ...bp.advanced.ai } : ai } as unknown as ModuleDef;
}

function aiEval(x: Ctx): X {
  const { bp, c, POW, HP } = x;
  const unitPow = bp.cards.filter((k) => UNIT_ROLES.includes(x.roleOf.get(k.type) ?? 'spell')).map((k) => k.stats[POW] ?? 0).sort((a, b) => a - b);
  const scale = Math.max(1, unitPow[Math.floor(unitPow.length / 2)] ?? 1);
  const hpScale = HP ? Math.max(1, ...bp.cards.map((k) => k.stats[HP] ?? 0)) / 4 : 1;
  const val = add(20, ['/', mul(C('pw', '$it'), 10), scale], ...(HP ? [['/', mul(sub(g('$it', HP), g('$it', 'dmg')), 10), Math.ceil(hpScale)]] : []),
    ...(c.mode === 'duel' ? [mul(6, cnt(C('energy', '$it')))] : []), ...(c.quest ? [mul(6, g('$it', c.quest))] : []));
  const side = (p: string): X => add(
    SUM(units(x, p), val), mul(bp.resource.mode === 'pitch' ? 10 : 6, cnt(cards(p, 'hand'))),
    ...(x.life ? [['/', mul(g(p, 'life'), 300), Math.max(1, bp.win.life)]] : []),
    ...(x.lifeCards ? [mul(60, cnt(cards(p, 'life')))] : []),
    ...(x.prizes ? [mul(-90, cnt(cards(p, 'prizes')))] : []),
    ...(x.points ? [mul(c.quest ? 40 : 120, g(p, 'score'))] : []),
    ...(['cards', 'anycard', 'deck'].includes(bp.resource.mode) ? [mul(12, cnt(cards(p, 'resources')))] : []),
    ...(bp.resource.mode === 'ramp' ? [mul(8, g(p, 'cap'))] : []),
    mul(8, cnt(cards(p, 'support'))));
  if (x.runs) {
    const SV = runServers(bp);
    const ices = (p: X) => cat(...SV.map((v) => cards(p, v.ice)));
    const rside = (p: X): X => add(mul(150, g(p, 'score')), mul(4, g(p, 'mana:c')), mul(5, cnt(cards(p, 'hand'))), mul(14, cnt(ices(p))), mul(6, cnt(flt(ices(p), NOT(g('$it', 'faceDown'))))),
      mul(30, SUM(cat(...SV.filter((v) => v.content).map((v) => cards(p, v.content!))), g('$it', 'adv'))), mul(10, cnt(cat(...SV.filter((v) => v.content).map((v) => cards(p, v.content!))))), mul(12, cnt(cards(p, 'support'))), mul(-20, g(p, 'tags')));
    return sub(rside('$me'), rside('$opp'));
  }
  return sub(side('$me'), side('$opp'));
}

function deepMerge(a: Record<string, any>, b: Record<string, any>) {
  for (const [k, v] of Object.entries(b)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v);
    else a[k] = v;
  }
}
export { slug };
/** The hue (0-359) of a #rrggbb color, used to tint card frames by color. */
export function hexHue(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 220;
  const [r, g2, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const mxv = Math.max(r, g2, b), mnv = Math.min(r, g2, b), d = mxv - mnv;
  if (!d) return 220;
  const h = mxv === r ? ((g2 - b) / d) % 6 : mxv === g2 ? (b - r) / d + 2 : (r - g2) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}
