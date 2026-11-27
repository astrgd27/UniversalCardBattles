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
  const UZ = c.mode === 'duel' ? ['active', 'bench'] : c.mode === 'lanes' ? ['base', ...lanes] : arenas ? arenas.map((a) => a.id) : ['field'];
  const atkZ = arenas && arenas.some((a) => a.attack) ? arenas.filter((a) => a.attack).map((a) => a.id) : UZ;
  const main = bp.turn.filter((p) => p.kind === 'main').map((p) => p.id);
  const combatP = bp.turn.filter((p) => p.kind === 'combat').map((p) => p.id);
  const endP = bp.turn.find((p) => p.kind === 'end')?.id ?? 'end';
  const battle = c.mode === 'block' || c.mode === 'target' || c.mode === 'cards';
  const pool = ['ramp', 'cards', 'anycard', 'deck'].includes(r.mode);
  const colorIds = bp.colors.map((k) => k.id);
  const leader = bp.setup.leader || hasRole('leader');
  const kw = new Map(bp.keywords.map((k) => [k.id, k]));
  const conq = c.mode === 'lanes' && !!c.conquest;
  return {
    bp, c, r, conq, recycle: r.mode === 'deck' && !!r.recycle, sites: c.mode === 'lanes' && (bp.setup.sites ?? 0) > 0 && hasRole('battlefield'), roleOf, typesOf, hasRole, lanes, arenas, UZ, atkZ, main: main.length ? main : ['main'], combatP, endP, battle, pool, colorIds, leader, kw,
    atkPhases: combatP.length ? combatP : main.length ? main : ['main'],
    fast: [...new Set([...(main.length ? main : ['main']), ...combatP, ...(battle || conq ? ['respond'] : [])])],
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
const resCount = (x: Ctx, p: X) => (x.r.mode === 'ramp' ? g(p, 'cap') : cnt(cards(p, 'resources')));

// ---------------------------------------------------------------- rules text
const TGT_TEXT: Record<TargetKind, string> = {
  self: 'this', enemyUnit: 'an enemy unit', anyUnit: 'a unit', ownUnit: 'one of your units', otherOwnUnit: 'another of your units', enemyAny: 'an enemy unit or the opponent',
  opponent: 'the opponent', you: 'you', eachPlayer: 'each player', allEnemyUnits: 'each enemy unit', allUnits: 'each unit', allOwnUnits: 'each of your units',
  randomEnemyUnit: 'a random enemy unit', attacker: 'the attacking unit', battleTarget: 'the unit being attacked',
};
const nm = (bp: Blueprint, list: 'stats' | 'types' | 'colors' | 'keywords' | 'counters', id: string | undefined) => ((bp as any)[list] ?? []).find((s: any) => s.id === id)?.name ?? id ?? '';
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
  if (f.zone) tail.push(`in ${zoneName(bp, f.zone)}`);
  return [bits.length ? `(${bits.join(' ')})` : '', ...tail].filter(Boolean).join(' ');
}
const zoneName = (bp: Blueprint, z: string) => bp.zones?.find((k) => k.id === z)?.name ?? bp.zoneNames[z] ?? ({ grave: 'the discard pile', hand: 'hand', deck: 'the deck', banished: 'the banished pile', resources: 'resources' } as Record<string, string>)[z] ?? z;
export function effectText(e: Effect, bp: Blueprint): string {
  const n = e.kw ? 'X' : String(e.n ?? 1);
  const ft = filterText(e.filter, bp);
  const t = TGT_TEXT[e.target ?? 'enemyUnit'] + (ft ? ` ${ft}` : '');
  const stat = nm(bp, 'stats', e.stat) || 'power';
  const who = e.who === 'opp' ? 'the opponent' : e.who === 'each' ? 'each player' : 'you';
  const card = bp.cards.find((k) => k.id === e.card)?.name ?? 'token';
  const type = bp.types.find((k) => k.id === e.type)?.name ?? 'card';
  const counter = nm(bp, 'counters', e.card) || 'counter';
  const xs = e.kw ? ` (X = its ${nm(bp, 'keywords', e.kw)} value)` : '';
  const body = ((): string => {
    switch (e.k) {
      case 'draw': return e.who === 'opp' ? `the opponent draws ${n}` : e.who === 'each' ? `each player draws ${n}` : `draw ${n === '1' ? 'a card' : `${n} cards`}`;
      case 'damage': return `deal ${n} damage to ${t}`;
      case 'heal': return `heal ${n} from ${t}`;
      case 'buff': return `${t} gets ${n.startsWith('-') ? '' : '+'}${n} ${stat}${e.until === 'forever' ? '' : ' until end of turn'}`;
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
      case 'score': return `score ${n} point${n === '1' ? '' : 's'}`;
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
      case 'scry': return n === '1' ? 'look at the top card of your deck; you may put it on the bottom' : `look at the top ${n} cards of your deck one by one; you may put any on the bottom`;
      case 'win': return 'you win the game';
      case 'raw': return '(custom script)';
    }
  })();
  return body + xs;
}
const WHEN_TEXT: Record<string, string> = {
  play: 'When played: ', leave: 'When destroyed: ', attack: 'When this attacks: ', hit: 'When this hits the opponent: ', quest: 'When this quests: ',
  startTurn: 'At the start of your turn: ', endTurn: 'At the end of your turn: ', static: '', opAttack: 'Spring when an enemy attacks: ',
  conquer: 'When you conquer here: ', hold: 'When you hold here: ',
};
const condText = (k: Cond | undefined, bp: Blueprint) => !k ? '' : k.k === 'units' ? `if you control ${k.n ?? 1} or more units, ` : k.k === 'life' ? `if you have ${k.n ?? 5} or less life, `
  : k.k === 'hand' ? `if you have ${k.n ?? 0} or fewer cards in hand, ` : k.k === 'yourTurn' ? 'during your turn, ' : k.k === 'res' ? `if you have ${k.n ?? 1} or more ${bp.resource.name}, `
    : k.k === 'counter' ? `if this has ${k.n ?? 1} or more ${nm(bp, 'counters', k.counter)} counters, ` : k.k === 'zone' ? `if you have ${k.n ?? 1} or more cards in ${zoneName(bp, k.zone ?? 'grave')}, `
      : k.k === 'played' ? `if you played ${(k.n ?? 1) === 1 ? 'another card' : `${k.n} other cards`} this turn, `
        : k.k === 'attached' ? `if this has ${k.n ?? 1} or more ${bp.resource.name} given to it, ` : 'if the custom condition holds, ';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function costText(a: Ability, bp: Blueprint): string {
  return [a.tap && 'Exhaust', a.cost && `pay ${a.cost}`, a.discard && `discard ${a.discard}`, a.sacrifice && 'sacrifice a unit', a.life && `pay ${a.life} life`,
    a.uncount && `remove ${a.uncount.n} ${nm(bp, 'counters', a.uncount.id)} counter${a.uncount.n === 1 ? '' : 's'}`, a.banish && `banish ${a.banish} from your discard pile`,
    a.returnRes && `return ${a.returnRes} ${bp.resource.name}`].filter(Boolean).join(', ');
}
export function abilityText(a: Ability, bp: Blueprint, role: Role): string {
  const head = a.when === 'activated' ? `${cap(costText(a, bp)) || 'Activate'}: ` : a.when === 'play' && SPELLISH.includes(role) ? ''
    : (a.when === 'conquer' || a.when === 'hold') && role !== 'battlefield' ? (a.when === 'conquer' ? 'When this conquers a battlefield: ' : 'When you hold its battlefield: ') : WHEN_TEXT[a.when] ?? '';
  const body = a.do.map((e) => effectText(e, bp)).join(', then ');
  return `${head}${cap(condText(a.if, bp) + body)}.${a.once === 'game' ? ' (Once per game.)' : a.once ? ' (Once per turn.)' : ''}`;
}
export function cardText(k: CardBP, bp: Blueprint): string {
  if (k.text) return k.text;
  const role = bp.types.find((t) => t.id === k.type)?.role ?? 'unit';
  const valued = Object.entries(k.kwv ?? {}).filter(([id]) => k.keywords.includes(id)).map(([id, v]) => `${nm(bp, 'keywords', id)} ${v}`).join(', ');
  const parts = [valued, ...k.abilities.map((a) => abilityText(a, bp, role))];
  if (k.bonus) parts.push(`Attach to one of your units: ${Object.entries(k.bonus).map(([s, n]) => `${n >= 0 ? '+' : ''}${n} ${nm(bp, 'stats', s)}`).join(', ')}.`);
  if (role === 'evolution' && k.evolvesFrom) parts.unshift(`Evolves from ${k.evolvesFrom}.`);
  if (role === 'extra' && k.materials) parts.unshift(`Summon from your extra deck by sending ${k.materials} of your units to the discard pile.`);
  for (const mv of k.moves ?? []) parts.push(`${mv.name} [${costLabel(mv.cost, bp)}]: ${mv.damage} damage${mv.do?.length ? `; ${mv.do.map((e) => effectText(e, bp)).join(', then ')}` : ''}.`);
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
  return parts.length ? AND(...parts) : null;
}
function target(x: Ctx, kind: TargetKind | undefined, v: string, prompt: string, f?: Filter): { pre: X[]; ref: X; many: boolean } {
  const fe = filterExpr(x, f);
  const narrow = (l: X) => (fe ? flt(l, fe) : l);
  const units = (xx: Ctx, p: X) => (f?.zone ? cards(p, f.zone) : unitsOf(xx, p));
  const allUnits = (xx: Ctx) => units(xx, '*');
  const vis = (l: X) => flt(l, NOT(AND(has('$it', 'ward'), ne(ctrl('$it'), '$me'))));
  const one = (from: X) => ({ pre: [choose({ from: narrow(from), min: 1, max: 1, as: v, prompt })], ref: v, many: false });
  switch (kind ?? 'enemyUnit') {
    case 'self': return { pre: [], ref: '$self', many: false };
    case 'opponent': return { pre: [], ref: '$opp', many: false };
    case 'you': return { pre: [], ref: '$me', many: false };
    case 'eachPlayer': return { pre: [], ref: ['players'], many: true };
    case 'enemyUnit': return one(vis(units(x, '$opp')));
    case 'anyUnit': return one(cat(units(x, '$me'), vis(units(x, '$opp'))));
    case 'ownUnit': return one(units(x, '$me'));
    case 'otherOwnUnit': return one(flt(units(x, '$me'), ne('$it', '$self')));
    case 'enemyAny': return one(cat(x.leader && !x.lifeCards ? cards('$opp', 'leader') : ['list', '$opp'], vis(units(x, '$opp'))));
    case 'allEnemyUnits': return { pre: [], ref: narrow(units(x, '$opp')), many: true };
    case 'allUnits': return { pre: [], ref: narrow(allUnits(x)), many: true };
    case 'allOwnUnits': return { pre: [], ref: narrow(units(x, '$me')), many: true };
    case 'randomEnemyUnit': return { pre: [['random', { from: narrow(units(x, '$opp')), as: v }]], ref: v, many: false };
    case 'attacker': return { pre: [], ref: Q(gt(g('game', 'bat'), 0), '$win.attacker', 0), many: false };
    case 'battleTarget': return { pre: [], ref: Q(gt(g('game', 'bat'), 0), '$win.target', 0), many: false };
  }
}
function effect(x: Ctx, e: Effect, i: number): X[] {
  const n: X = e.kw ? def('$self', `kw_${x.kwKey(e.kw)}`) : e.n ?? 1;
  const p = e.who === 'opp' ? '$opp' : '$me';
  const per = (body: (who: X) => X[]) => (e.who === 'each' ? [EACH(['players'], '$pl', body('$pl'))] : body(p));
  const needsTarget = ['damage', 'heal', 'buff', 'destroy', 'bounce', 'exhaust', 'ready', 'addCounter', 'removeCounter', 'restrict', 'moveTo'].includes(e.k);
  if (needsTarget) {
    const t = target(x, e.target, `$t${i}`, cap(`${effectText(e, x.bp)}: choose`), e.filter);
    const cv = `c_${e.card ?? 'x'}`;
    const one = (r: X): X[] => {
      switch (e.k) {
        case 'damage': return [C('dmgTo', r, n, '$self')];
        case 'heal': return [C('healTo', r, n)];
        case 'buff': return [IF(isObj(r), [e.until === 'forever' ? INC(r, e.stat ?? x.POW, n) : ['modify', r, { layer: 'add', mods: [{ op: 'add', stat: e.stat ?? x.POW, value: n }], until: 'turn' }]])];
        case 'destroy': return [IF(isObj(r), [['destroy', r]])];
        case 'bounce': return [IF(isObj(r), [['move', r, 'hand']])];
        case 'exhaust': return [IF(isObj(r), [SET(r, 'ex', 1)])];
        case 'addCounter': return [IF(isObj(r), [INC(r, cv, n)])];
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
      const zone = x.c.mode === 'duel' ? 'bench' : x.bp.types.find((t) => t.id === tokType)?.zone ?? x.UZ[0];
      return [EACH(range(n), `$k${i}`, [IF(C('roomIn', '$me', zone), [['create', e.card ?? 'token', '$me', zone, { as: `$n${i}` }], SET(`$n${i}`, 'newT', '$turn')])])];
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
    case 'score': return [INC('$me', 'score', n)];
    case 'addLife': return [['move', ['top', '$me', 'deck', n], 'life']];
    case 'win': return [['win', '$me']];
    case 'strike': return x.battle ? [['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blockers: L([]), power: n, guard: 0 } }], SET('game', 'bat', 0)]
      : [C('hitN', '$opp', 1, n, '$self')];
    case 'deploy': return [IF(eq(g('$self', 'zone'), 'leader'), [['move', '$self', x.UZ[0], { as: `$dp${i}` }], SET(`$dp${i}`, 'newT', '$turn'), emit('deployed', { p: '$me' })])];
    case 'scry': return [EACH(range(n), `$sy${i}`, [LET(`$tc${i}`, first(['top', '$me', 'deck', 1])), IF(isObj(`$tc${i}`), [['emit', 'peek', { p: '$me', card: g(`$tc${i}`, 'card') }, { to: ['list', '$me'] }],
      choose({ from: L(['Keep it on top', 'Put it on the bottom']), min: 1, max: 1, as: `$sk${i}`, prompt: 'You look at the top card of your deck (see the log). Keep it on top?' }),
      IF(eq(`$sk${i}`, 'Put it on the bottom'), [['move', `$tc${i}`, 'deck']])])])];
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
    case 'attached': return ge(g('$self', 'don'), k.n ?? 1);
    case 'raw': return k.raw ?? true;
  }
}
const effects = (x: Ctx, list: Effect[]) => list.flatMap((e, i) => effect(x, e, i));
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
  for (const [s, v] of Object.entries(k.stats ?? {})) if (s !== 'cost') out[s] = v;
  if (k.color) out.color = k.color;
  out.res = k.color && x.colorIds.includes(k.color) && !x.r.faceDown ? k.color : 'c';
  if (type?.playTo && bp.zones?.some((z) => z.id === type.playTo)) out.playTo = type.playTo;
  out.zone = x.c.mode === 'duel' || x.c.mode === 'lanes' ? x.UZ[0] : type?.zone && x.UZ.includes(type.zone) ? type.zone : x.UZ[0];
  const kws = k.keywords.map((id) => x.kwKey(id));
  for (const [id, v] of Object.entries(k.kwv ?? {})) if (k.keywords.includes(id)) out[`kw_${x.kwKey(id)}`] = v;
  if (role === 'token') { kws.push('token'); out.maxCopies = 0; }
  if (role === 'resource') out.maxCopies = 99;
  if (kws.length) out.keywords = [...new Set(kws)];
  const glyph = k.art || type?.icon;
  if (glyph) out.glyph = glyph;
  const hex = bp.colors.find((cl) => cl.id === k.color)?.hex;
  if (hex) out.hue = hexHue(hex);
  if (k.evolvesFrom) out.evolvesFrom = k.evolvesFrom;
  if (k.family) out.family = k.family;
  if (k.materials) out.materials = k.materials;
  if (k.weakness) out.weakness = k.weakness;
  if (k.retreat !== undefined) out.retreat = k.retreat;
  const bundle = k.keywords.flatMap((id) => x.kw.get(id)?.abilities ?? []);
  const abilities: X[] = [], statics: X[] = [], acts: X[] = [], effs: X[] = [], onHit: X[] = [], replacements: X[] = [], onConq: X[] = [], onHold: X[] = [];
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
    if (a.when === 'hit' && role === 'attack') { onHit.push(...(cond ? [IF(cond, body)] : body)); continue; }
    if (a.when === 'conquer' || a.when === 'hold') { (a.when === 'conquer' ? onConq : onHold).push(...(cond ? [IF(cond, body)] : body)); continue; }
    if (a.when === 'activated') {
      const req: X[] = [];
      const cost: X[] = [];
      if (a.tap) { req.push({ if: eq(g('$self', 'ex'), 0), why: 'Already exhausted' }); cost.push(SET('$self', 'ex', 1)); }
      if (a.cost && x.pool) { req.push({ if: ['canPay', '$me', 'mana', a.cost], why: `Needs ${a.cost} ${bp.resource.name}` }); cost.push(['pay', '$me', 'mana', a.cost]); }
      if (a.cost && x.r.mode === 'pitch') { req.push({ if: ge(add(g('$me', 'pp'), SUM(cards('$me', 'hand'), def('$it', x.r.pitchStat ?? 'pitch'))), a.cost), why: `Needs ${a.cost} ${bp.resource.name}` }); cost.push(C('pitchPay', '$self', a.cost)); }
      if (a.discard) { req.push({ if: ge(cnt(cards('$me', 'hand')), a.discard), why: `Needs ${a.discard} card(s) to discard` }); cost.push(choose({ from: cards('$me', 'hand'), min: a.discard, max: a.discard, as: '$cd', prompt: 'Discard as a cost', required: true }), ['move', '$cd', 'grave']); }
      if (a.sacrifice) { req.push({ if: gt(cnt(units(x, '$me')), 0), why: 'Needs a unit to sacrifice' }); cost.push(choose({ from: units(x, '$me'), min: 1, max: 1, as: '$sc', prompt: 'Sacrifice which unit?', required: true }), ['destroy', '$sc']); }
      if (a.life && x.life) { req.push({ if: gt(g('$me', 'life'), a.life), why: `Needs more than ${a.life} life` }); cost.push(INC('$me', 'life', -a.life)); }
      if (a.banish) { req.push({ if: ge(cnt(cards('$me', 'grave')), a.banish), why: `Needs ${a.banish} card(s) in your discard pile` }); cost.push(choose({ from: cards('$me', 'grave'), min: a.banish, max: a.banish, as: '$bn', prompt: 'Banish which cards from your discard pile?', required: true }), ['move', '$bn', 'banished']); }
      if (a.returnRes) { req.push({ if: ge(cnt(cards('$me', 'resources')), a.returnRes), why: `Needs ${a.returnRes} ${bp.resource.name} in play` }); cost.push(choose({ from: cards('$me', 'resources'), min: a.returnRes, max: a.returnRes, as: '$rr', prompt: `Return which ${bp.resource.name}?`, required: true }), ['move', '$rr', x.r.mode === 'deck' ? 'resdeck' : 'hand']); }
      if (a.uncount) { const cv = `c_${a.uncount.id}`; req.push({ if: ge(g('$self', cv), a.uncount.n), why: 'Not enough counters' }); cost.push(INC('$self', cv, -a.uncount.n)); }
      if (cond) req.push({ if: cond, why: 'Condition not met' });
      acts.push({ label: a.label || abilityText(a, bp, role).slice(0, 60), req, cost, do: body, ...lim });
      continue;
    }
    const on = a.when === 'play' ? 'enter' : a.when === 'leave' ? 'destroyed' : a.when === 'attack' ? 'attack' : a.when === 'hit' ? 'hit' : a.when === 'quest' ? 'quest'
      : a.when === 'startTurn' ? 'turnStart' : 'turnEnd';
    const own = a.when === 'attack' || a.when === 'quest' ? eq('$e.o', '$self') : a.when === 'hit' ? eq('$e.src', '$self') : a.when === 'startTurn' || a.when === 'endTurn' ? eq('$e.p', '$me') : null;
    const iff = [own, cond].filter(Boolean) as X[];
    abilities.push({ on, do: body, ...(iff.length ? { if: AND(...iff) } : {}), ...lim, text: abilityText(a, bp, role) });
  }
  if (k.bonus && Object.keys(k.bonus).length) statics.push({ layer: 'add', affects: flt(['list', g('$self', 'bearer')], isObj('$it')), mods: Object.entries(k.bonus).map(([stat, value]) => ({ op: 'add', stat, value })) });
  if (effs.length) { out.effects = effs; out.hasEff = 1; }
  if (onHit.length) { out.onHit = onHit; out.hasHit = 1; }
  if (onConq.length) { out.onConquer = onConq; out.hasConq = 1; }
  if (onHold.length) { out.onHold = onHold; out.hasHold = 1; }
  if (abilities.length) out.abilities = abilities;
  if (statics.length) out.statics = statics;
  if (replacements.length) out.replacements = replacements;
  if (acts.length) out.acts = acts;
  if (k.moves?.length && x.c.mode === 'duel') out.moves = k.moves.map((mv) => moveAbility(x, mv));
  if (k.raw) Object.assign(out, k.raw);
  return out;
}
function moveAbility(x: Ctx, mv: NonNullable<CardBP['moves']>[number]): X {
  const total = Object.values(mv.cost).reduce((a, b) => a + b, 0);
  const typed = Object.entries(mv.cost).filter(([t]) => t !== 'any');
  const E = C('energy', '$self');
  const ok = AND(ge(cnt(E), total), ...typed.map(([t, n]) => ge(cnt(flt(E, eq(g('$it', 'res'), t))), n)));
  return {
    label: `${mv.name} (${mv.damage})`,
    req: [{ if: ok, why: `Needs ${costLabel(mv.cost, x.bp)} energy attached` }],
    limit: { per: 'turn', group: 'attack' },
    do: [LET('$tg', first(cards('$opp', 'active'))),
      IF(AND(isObj('$tg'), gt(mv.damage, 0)), [['damage', '$tg', mul(mv.damage, Q(AND(gt(L(x.c.weakness), 1), eq(def('$tg', 'weakness'), def('$self', 'color')), ne(def('$self', 'color'), 0)), x.c.weakness, 1)), '$self']]),
      emit('attack', { o: '$self', p: '$me', t: '$tg' }),
      ...effects(x, mv.do ?? []),
      ...(x.c.attackEndsTurn ? [['gotoPhase', x.endP]] : [])],
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
  const sizeOf = (z: string) => (c.mode === 'duel' ? (z === 'active' ? 1 : c.benchSize) : arenas?.find((a) => a.id === z)?.size ?? c.fieldSize);
  const pitchStat = r.pitchStat ?? 'pitch';
  const ap = (r.actions ?? 0) > 0;

  // ---- functions
  fn('pw', ['$o'], mx(0, g('$o', POW)));
  const reducers = (p: X) => flt(cat(units(x, p), cards(p, 'support'), ...(x.leader ? [cards(p, 'leader')] : [])), ne(def('$it', 'cmN'), 0));
  const hasReducers = bp.cards.some((k) => k.abilities.some((a) => a.do.some((e) => e.k === 'costMod'))) && !bp.colors.length;
  const baseCost = x.recycle ? def('$c', 'en') : def('$c', 'cost');
  fn('costOf', ['$c', '$p'], hasReducers ? mx(0, add(baseCost, SUM(reducers('$p'), Q(OR(eq(def('$it', 'cmType'), 0), eq(def('$it', 'cmType'), def('$c', 'type'))), def('$it', 'cmN'), 0)))) : baseCost);
  const runesOf = (p: X, col: X) => flt(cards(p, 'resources'), eq(g('$it', 'res'), col));
  fn('powOK', ['$c', '$p', '$x'], x.recycle ? AND(...x.colorIds.map((col) => ge(cnt(runesOf('$p', col)), add(mx(0, ['at', def('$c', 'pw'), col]), Q(eq(def('$c', 'color'), col), '$x', 0))))) : L(true));
  fn('payable', ['$c', '$p'], AND(
    x.pool ? ['canPay', '$p', 'mana', C('costOf', '$c', '$p')] : r.mode === 'pitch' ? ge(add(g('$p', 'pp'), SUM(flt(cards('$p', 'hand'), ne('$it', '$c')), def('$it', pitchStat))), C('costOf', '$c', '$p')) : L(true),
    x.recycle ? C('powOK', '$c', '$p', 0) : L(true),
    r.levelGate ? le(def('$c', r.levelGate), resCount(x, '$p')) : L(true),
    r.need ? ge(SUM(units(x, '$p'), g('$it', r.need.gen)), def('$c', r.need.stat)) : L(true)));
  fn('roomIn', ['$p', '$z'], OR(...UZ.map((z) => AND(eq('$z', z), lt(cnt(cards('$p', z)), sizeOf(z)))), L(false)));
  fn('room', ['$p'], c.mode === 'duel' ? OR(eq(cnt(cards('$p', 'active')), 0), lt(cnt(cards('$p', 'bench')), c.benchSize)) : C('roomIn', '$p', UZ[0]));
  fn('roomFor', ['$c', '$p'], c.mode === 'duel' ? C('room', '$p') : C('roomIn', '$p', def('$c', 'zone')));
  const stopped = (o: X, what: 'attack' | 'block') => (bp.counters ?? []).filter((k) => k.stops?.includes(what)).map((k) => eq(g(o, `c_${k.id}`), 0));
  fn('canAtk', ['$o'], AND(eq(g('$o', 'ex'), 0), eq(g('$o', 'pos'), 0), NOT(g('$o', 'faceDown')), NOT(has('$o', 'noAttack')), ...stopped('$o', 'attack'),
    c.sickness ? OR(lt(g('$o', 'newT'), '$turn'), has('$o', 'haste'), atLeader('$o')) : L(true),
    c.firstTurnAttack ? L(true) : c.firstTurnEach ? gt(g(ctrl('$o'), 'turns'), 1) : ne('$turn', 1),
    atkZ.length < UZ.length ? OR(atLeader('$o'), inl(g('$o', 'zone'), atkZ)) : L(true)));
  fn('energy', ['$u'], flt(['linked', '$u', 'bearer'], eq(g('$it', 'role'), 'resource')));
  const trib = [...r.tribute].sort((a, b) => b.level - a.level);
  fn('tribs', ['$c'], trib.reduce<X>((acc, t) => Q(ge(def('$c', 'level'), t.level), t.n, acc), 0));

  // ---- procedures
  proc('gainRes', ['$p', '$t', '$n'], x.pool ? [['gain', '$p', 'mana', ['tally', range('$n'), '$t']]] : []);
  proc('refill', ['$p'], x.pool ? [['empty', '$p', 'mana'],
    r.mode === 'ramp' ? ['gain', '$p', 'mana', ['tally', range(g('$p', 'cap')), 'c']] : ['gain', '$p', 'mana', ['tally', cards('$p', 'resources'), r.faceDown || x.recycle ? 'c' : g('$it', 'res')]]] : []);
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
  proc('moveKeep', ['$u', '$z'], [LET('$atts', ['linked', '$u', 'bearer']), LET('$d', g('$u', 'dmg')), LET('$nt', g('$u', 'newT')), LET('$ex', g('$u', 'ex')),
    ...UZ.map((z) => IF(eq('$z', z), [['move', '$u', z, { as: '$nw' }], SET('$nw', 'dmg', '$d'), SET('$nw', 'newT', '$nt'), SET('$nw', 'ex', '$ex'),
      IF(gt(cnt('$atts'), 0), [['link', '$atts', 'bearer', '$nw']])]))]);
  proc('dmgTo', ['$o', '$n', '$src'], [IF(isP('$o'), [C('hitN', '$o', '$n', '$n', '$src')], [IF(isObj('$o'),
    HP ? [IF(atLeader('$o'), [C('hitN', ctrl('$o'), '$n', '$n', '$src')], [['damage', '$o', '$n', '$src']])]
      : [IF(atLeader('$o'), [C('hitN', ctrl('$o'), 1, '$n', '$src')], [IF(ge('$n', C('pw', '$o')), [['destroy', '$o']])])])])]);
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
    IF(AND(isObj(T), g(T, 'faceDown')), [['flip', T]]),
    IF(gt(def(A, 'kw_challenger'), 0), [['modify', A, { layer: 'add', mods: [{ op: 'add', stat: POW, value: def(A, 'kw_challenger') }], until: 'turn' }]]),
    emit('attack', { o: A, p: ctrl(A), t: T })]);
  const canBlock = AND(eq(g('$it', 'ex'), 0), NOT(has('$it', 'noBlock')), NOT(has(A, 'unblockable')), ...stopped('$it', 'block'));
  const blockers = (who: X) => flt(units(x, who, atkZ), AND(canBlock, OR(NOT(has(A, 'flying')), has('$it', 'flying'))));
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
  // ---- conquest lanes: showdown window -> fight (Tank first, lethal damage, heal, recall on a tie) -> settle control -> conquer scoring
  const pts = bp.win.points || (c.mode === 'lanes' ? 8 : c.quest ? 20 : 0);
  if (conq) {
    const OPP = ['opp', '$p'];
    const spreadT = (list: X, amount: string, src: X): X[] => [SET('game', 'rem', amount), EACH(['sortBy', list, add(hpl('$it'), Q(has('$it', 'tank'), -1000, 0))], '$u', [LET('$k', mn(g('game', 'rem'), mx(0, hpl('$u')))),
      IF(gt('$k', 0), [['damage', '$u', '$k', src]]), INC('game', 'rem', ['neg', '$k'])])];
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
        LET('$a', SUM('$mine', C('pw', '$it'))), LET('$b', SUM('$theirs', C('pw', '$it'))), emit('showdownFight', { z, p: '$p', a: '$a', b: '$b' }),
        ...spreadT('$theirs', '$a', '$p'), ...spreadT('$mine', '$b', OPP),
        EACH(flt(cat(cards('$p', z), cards(OPP, z)), ge(g('$it', 'dmg'), hpOf('$it'))), '$dd', [['destroy', '$dd']]),
        EACH(cat(cards('$p', z), cards(OPP, z)), '$q', [SET('$q', 'atk', 0), SET('$q', 'dfn', 0), SET('$q', 'dmg', 0)]),
        IF(AND(gt(cnt(cards('$p', z)), 0), gt(cnt(cards(OPP, z)), 0)), [EACH(cards('$p', z), '$q', [C('moveKeep', '$q', 'base')]), emit('recalled', { p: '$p', z })])])])),
      C('settle', '$i', '$p')]);
    proc('arrive', ['$i', '$p'], lanes.map((z, i) => IF(eq('$i', i + 1), [
      IF(OR(gt(cnt(cards(OPP, z)), 0), eq(g('game', `c${i + 1}`), add(seat(OPP), 1))),
        [['openWindow', 'showdown', { data: { i: i + 1, p: '$p', defender: OPP } }]], [C('settle', i + 1, '$p')])])));
  }

  // ---- zones
  const zones: Record<string, any>[] = [
    { id: 'deck', vis: 'hidden', ordered: true },
    { id: 'hand', vis: 'owner' },
  ];
  if (r.mode === 'deck') zones.push({ id: 'resdeck', vis: 'hidden', ordered: true, hideEmpty: true });
  if (x.leader) zones.push({ id: 'leader', vis: 'public', abilities: true, hideEmpty: true });
  if (bp.setup.champion) zones.push({ id: 'champion', vis: 'public', hideEmpty: true });
  if (x.sites) zones.push({ id: 'sites', vis: 'owner', hideEmpty: true });
  for (const z of UZ) {
    if (x.sites && z.startsWith('lane')) zones.push({ id: `site${z.slice(4)}`, vis: 'public', abilities: true, hideEmpty: true });
    zones.push({ id: z, vis: 'public', abilities: true, ...(z.startsWith('lane') || arenas ? { showIf: L(true) } : {}) });
  }
  zones.push({ id: 'support', vis: 'public', abilities: true, hideEmpty: true });
  if (['cards', 'anycard', 'deck'].includes(r.mode)) zones.push({ id: 'resources', vis: 'public', compact: true });
  if (r.mode === 'pitch') zones.push({ id: 'pitch', vis: 'public', hideEmpty: true });
  if (x.lifeCards) zones.push({ id: 'life', vis: 'hidden', ordered: true });
  if (x.prizes) zones.push({ id: 'prizes', vis: 'hidden' });
  if (x.hasRole('extra')) zones.push({ id: 'extra', vis: 'owner', hideEmpty: true });
  for (const z of bp.zones ?? []) zones.push({ id: z.id, vis: z.vis, hideEmpty: true, ...(z.inPlay ? { abilities: true } : {}), ...(z.vis !== 'public' ? { ordered: true } : {}) });
  zones.push({ id: 'banished', vis: 'public', hideEmpty: true }, { id: 'limbo', vis: 'public', hideEmpty: true }, { id: 'grave', vis: 'public', ordered: true }, { id: 'void', vis: 'public', offTable: true });

  // ---- setup
  const P0 = '$p';
  const setup: X[] = [['random', { from: ['players'], as: '$f' }], ['firstPlayer', '$f'], SET('game', 'first', seat('$f')),
    EACH(['players'], P0, [
      ['shuffle', P0, 'deck'], ...(r.mode === 'deck' ? [['shuffle', P0, 'resdeck']] : []),
      ...(r.mode === 'ramp' ? [SET(P0, 'cap', r.start - r.perTurn)] : []),
      ['draw', P0, bp.setup.hand],
      ...(x.sites ? [['random', { from: cards(P0, 'sites'), as: '$sp' }], IF(isObj('$sp'), lanes.slice(0, 2).map((_, i) => IF(eq(seat(P0), i), [['move', '$sp', `site${i + 1}`]])))] : []),
      ...(bp.setup.mulligan && (bp.setup.mulliganN ?? 0) > 0 ? [choose({ who: P0, from: cards(P0, 'hand'), min: 0, max: bp.setup.mulliganN, as: '$mg', prompt: `Mulligan: choose up to ${bp.setup.mulliganN} cards to put on the bottom of your deck and redraw (or none to keep)` }),
        IF(gt(cnt('$mg'), 0), [['move', '$mg', 'deck'], ['draw', P0, cnt('$mg')]])] : []),
      ...(bp.setup.mulligan && !((bp.setup.mulliganN ?? 0) > 0) ? [choose({ who: P0, from: L(['Keep', 'Mulligan']), min: 1, max: 1, as: '$mu', prompt: `Keep this hand, or mulligan (shuffle it back and draw ${bp.setup.hand})?` }),
        IF(eq('$mu', 'Mulligan'), [['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, bp.setup.hand]])] : []),
      ...(c.mode === 'duel' ? [EACH(range(4), '$try', [IF(eq(cnt(cards(P0, 'active')), 0), [
        IF(ANY(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), [
          choose({ who: P0, from: flt(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), min: 1, max: 1, as: '$ac', prompt: 'Choose your starting active unit' }),
          ['move', '$ac', 'active', { as: '$an' }]],
        [['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, bp.setup.hand]])])])] : []),
      ...(x.lifeCards ? [x.leader ? LET('$ld', first(cards(P0, 'leader'))) : LET('$ld', 0), ['move', ['top', P0, 'deck', Q(AND(isObj('$ld'), gt(g('$ld', 'life'), 0)), g('$ld', 'life'), bp.win.lifeCards || 5)], 'life']] : []),
      ...(x.prizes ? [['move', ['top', P0, 'deck', bp.win.prizes], 'prizes']] : []),
    ]),
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
  const forPlayers = (each: boolean | undefined, body: (p: string) => X[]): X[] => (each ? [EACH(['players'], '$pp', body('$pp'))] : body(ME));
  const phases: X[] = bp.turn.map((ph) => {
    switch (ph.kind) {
      case 'ready': return { id: ph.id, auto: true, do: [INC(ME, 'turns', 1), ...forPlayers(ph.each, (p) => [untapOf(p), ...(ap ? [SET(p, 'ap', r.actions)] : [])]),
        ...(usesPlayed ? [EACH(['players'], '$pq', [SET('$pq', 'plays', 0)])] : []), ...(r.give ? [EACH(cat(units(x, ME), ...(x.leader ? [cards(ME, 'leader')] : [])), '$dq', [SET('$dq', 'don', 0)])] : []), ...temp, ...hold,
        ...(hasResPhase ? [] : resourceStep), emit('turnStart', { p: ME })] };
      case 'draw': return { id: ph.id, auto: true, do: [IF(NOT(AND(eq('$turn', 1), L(bp.setup.skipFirstDraw))), forPlayers(ph.each, (p) =>
        [ph.drawTo ? ['draw', p, mx(0, sub(ph.drawTo, cnt(cards(p, 'hand'))))] : ['draw', p, ph.n ?? 1]]))] };
      case 'resource': return { id: ph.id, auto: true, do: resourceStep };
      case 'end': return { id: ph.id, auto: true, do: [emit('turnEnd', { p: ME }),
        ...(c.damage === 'heal' && HP ? [EACH(allUnits(x), '$x', [SET('$x', 'dmg', 0)])] : []),
        ...(r.mode === 'pitch' ? [['move', cards(ME, 'pitch'), 'deck'], SET(ME, 'pp', 0)] : []),
        ...((bp.counters ?? []).some((k) => k.expires) ? [EACH(units(x, ME), '$x', (bp.counters ?? []).filter((k) => k.expires).map((k) => SET('$x', `c_${k.id}`, 0)))] : []),
        IF(gt(cnt(cards(ME, 'hand')), bp.setup.handLimit), [C('discardN', ME, sub(cnt(cards(ME, 'hand')), bp.setup.handLimit))])] };
      case 'custom': return { id: ph.id, auto: true, do: Array.isArray(ph.raw) ? ph.raw : [] };
      default: return { id: ph.id, ...(ph.alternate ? { timing: { mode: 'alternate', first: '$active' } } : {}) };
    }
  });
  if (!bp.turn.some((p) => p.kind === 'end')) phases.push({ id: 'end', auto: true, do: [emit('turnEnd', { p: ME })] });

  // ---- actions
  const stackish = bp.timing !== 'simple';
  const sp = (speed: number, onStack = false) => (stackish ? { speed, ...(onStack ? {} : { stack: false }) } : {});
  const apReq = ap ? [{ if: gt(g('$me', 'ap'), 0), why: 'No action points left' }] : [];
  const apCost: X[] = ap ? [INC('$me', 'ap', -1)] : [];
  const goAgain: X[] = ap ? [IF(has('$self', 'goAgain'), [INC('$me', 'ap', 1)])] : [];
  const hand = (pred: X) => flt(cards('$me', 'hand'), AND(pred, C('payable', '$it', '$me')));
  const recyclePay: X[] = x.recycle ? x.colorIds.map((col) => [LET(`$nd_${col}`, mx(0, ['at', def('$self', 'pw'), col])), IF(gt(`$nd_${col}`, 0), [
    choose({ from: runesOf('$me', col), min: `$nd_${col}`, max: `$nd_${col}`, as: `$rc_${col}`, prompt: `Recycle ${bp.colors.find((k) => k.id === col)?.name ?? col} ${bp.resource.name.toLowerCase()} for power`, required: true }),
    ['move', `$rc_${col}`, 'resdeck']])]).flat() : [];
  const payCost: X[] = [...(x.pool ? [['pay', '$me', 'mana', C('costOf', '$self', '$me')]] : r.mode === 'pitch' ? [C('pitchPay', '$self', C('costOf', '$self', '$me'))] : []), ...recyclePay,
    ...(usesPlayed ? [INC('$me', 'plays', 1)] : [])];
  const Aa: Record<string, any> = {};
  const unitT = types('unit');
  const sumLimit = r.summonsPerTurn > 0 ? { limit: { per: 'turn', n: r.summonsPerTurn, group: 'summon' } } : {};
  const tribCost: X[] = trib.length ? [LET('$tn', C('tribs', '$self')), IF(gt('$tn', 0), [choose({ from: units(x, '$me'), min: '$tn', max: '$tn', as: '$tr', prompt: 'Tribute which units?', required: true }), ['move', '$tr', 'grave']])] : [];
  const summonTo = (asVar: string): X[] => c.mode === 'duel'
    ? [IF(eq(cnt(cards('$me', 'active')), 0), [['move', '$self', 'active', { as: asVar }], SET(asVar, 'newT', '$turn')], [['move', '$self', 'bench', { as: asVar }], SET(asVar, 'newT', '$turn')])]
    : UZ.length === 1 ? [['move', '$self', UZ[0], { as: asVar }], SET(asVar, 'newT', '$turn')]
      : UZ.map((z) => IF(eq(def('$self', 'zone'), z), [['move', '$self', z, { as: asVar }], SET(asVar, 'newT', '$turn'), ...(conq ? [SET(asVar, 'ex', 1),
        IF(AND(has(asVar, 'accelerate'), ['canPay', '$me', 'mana', 1], x.recycle ? gt(cnt(runesOf('$me', def(asVar, 'color'))), 0) : L(true)), [
          choose({ from: L(['Accelerate: pay 1 more (and recycle 1) to enter ready', 'No']), min: 1, max: 1, as: '$acc', prompt: 'Accelerate this unit?' }),
          IF(eq('$acc', 'No'), [], [['pay', '$me', 'mana', 1], ...(x.recycle ? [choose({ from: runesOf('$me', def(asVar, 'color')), min: 1, max: 1, as: '$ar', prompt: 'Recycle which rune?' }), ['move', '$ar', 'resdeck']] : []), SET(asVar, 'ex', 0)])])] : [])]));
  if (unitT.length) {
    const uPred = AND(inl(g('$it', 'type'), unitT), OR(C('roomFor', '$it', '$me'), gt(C('tribs', '$it'), 0)), ge(cnt(units(x, '$me')), C('tribs', '$it')));
    const src = bp.setup.champion ? cat(hand(uPred), flt(cards('$me', 'champion'), AND(uPred, C('payable', '$it', '$me')))) : hand(uPred);
    Aa.summon = { label: c.mode === 'duel' ? 'Play' : 'Summon', phases: x.main, source: src, ...sumLimit, ...sp(1, bp.timing === 'stack'), req: apReq, cost: [...payCost, ...tribCost, ...apCost], do: summonTo('$u') };
    if (c.positions) {
      Aa.setUnit = { label: 'Set face down', phases: x.main, source: src, ...sumLimit, ...sp(1), req: apReq, cost: [...payCost, ...tribCost, ...apCost],
        do: [['move', '$self', UZ[0], { as: '$u', faceDown: true }], SET('$u', 'newT', '$turn'), SET('$u', 'pos', 1)] };
      Aa.position = { label: 'Change position', phases: x.main, source: flt(units(x, '$me'), lt(g('$it', 'newT'), '$turn')), limit: { per: 'turn', by: 'source' }, ...sp(1),
        do: [IF(g('$self', 'faceDown'), [['flip', '$self'], SET('$self', 'pos', 0)], [SET('$self', 'pos', sub(1, g('$self', 'pos')))])] };
    }
  }
  const spellDo = (extra: X[] = []): X[] => [IF(eq(def('$self', 'hasEff'), 1), [['run', '$self', 'effects']]), ...extra, IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])];
  if (x.hasRole('spell')) Aa.cast = { label: 'Cast', phases: x.main, source: hand(inl(g('$it', 'type'), types('spell'))), ...sp(1, true), req: apReq,
    cost: [...payCost, ...apCost, ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(goAgain), countered: [['move', '$self', 'grave']] };
  if (x.hasRole('fast')) Aa.quick = { label: 'Cast (quick)', phases: x.fast, source: hand(inl(g('$it', 'type'), types('fast'))), ...sp(2, true),
    cost: [...payCost, ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(), countered: [['move', '$self', 'grave']] };
  if (x.hasRole('attack')) Aa.attackCard = { label: 'Attack', phases: x.atkPhases, source: hand(AND(inl(g('$it', 'type'), types('attack')), c.firstTurnAttack ? L(true) : ne('$turn', 1))), ...sp(1), req: apReq,
    cost: [...payCost, ...apCost, ['move', '$self', 'limbo', { as: '$self' }]],
    do: [IF(eq(def('$self', 'hasEff'), 1), [['run', '$self', 'effects']]), ['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blockers: L([]), power: 0, guard: 0 } }],
      SET('game', 'bat', 0), ...goAgain, IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])] };
  const customTo = (bp.zones ?? []).map((z) => IF(eq(def('$self', 'playTo'), z.id), [
    ...(z.size > 0 ? [IF(ge(cnt(cards(z.global ? '*' : '$me', z.id)), z.size), [['move', cards(z.global ? '*' : '$me', z.id), 'grave']])] : []),
    ['move', '$self', z.id, { as: '$pz' }], SET('$pz', 'newT', '$turn')]));
  if (x.hasRole('permanent')) Aa.deploy = { label: 'Play', phases: x.main, source: hand(inl(g('$it', 'type'), types('permanent'))), ...sp(1), req: apReq, cost: [...payCost, ...apCost],
    do: [IF(eq(def('$self', 'playTo'), 0), [['move', '$self', 'support', { as: '$pm' }], SET('$pm', 'newT', '$turn')], customTo)] };
  if (x.hasRole('attachment')) Aa.equip = { label: 'Attach', phases: x.main, source: hand(AND(inl(g('$it', 'type'), types('attachment')), gt(cnt(units(x, '$me')), 0))), ...sp(1), req: apReq,
    targets: [{ as: '$b', from: units(x, '$me'), prompt: 'Attach to which unit?' }], cost: [...payCost, ...apCost],
    do: [['move', '$self', 'support', { as: '$at' }], ['link', '$at', 'bearer', '$b'], SET('$at', 'att', 1)] };
  if (x.hasRole('trap')) {
    Aa.setTrap = { label: 'Set', phases: x.main, source: hand(inl(g('$it', 'type'), types('trap'))), ...sp(1), cost: payCost, do: [['move', '$self', 'support', { as: '$tp', faceDown: true }], SET('$tp', 'newT', '$turn')] };
    Aa.spring = { label: 'Spring', phases: x.fast, ...sp(2, true),
      source: flt(cards('$me', 'support'), AND(eq(g('$it', 'role'), 'trap'), g('$it', 'faceDown'), lt(g('$it', 'newT'), '$turn'),
        OR(ne(g('$it', 'trapOn'), 'opAttack'), AND(gt(g('game', 'bat'), 0), ne(g('game', 'bat'), add(seat('$me'), 1)))))),
      cost: [['flip', '$self'], ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(), countered: [['move', '$self', 'grave']] };
  }
  if (x.hasRule('song')) {
    const singers = (card: X) => flt(units(x, '$me'), AND(eq(g('$it', 'ex'), 0), c.sickness ? OR(lt(g('$it', 'newT'), '$turn'), has('$it', 'haste')) : L(true), ge(def('$it', 'cost'), def(card, 'cost'))));
    Aa.sing = { label: 'Sing', phases: x.main, ...sp(1, true), source: flt(cards('$me', 'hand'), AND(has('$it', 'song'), gt(cnt(singers('$it')), 0))),
      targets: [{ as: '$sg', from: singers('$self'), prompt: 'Which unit sings it?' }],
      cost: [SET('$sg', 'ex', 1), ['move', '$self', 'limbo', { as: '$self' }]], do: spellDo(), countered: [['move', '$self', 'grave']] };
  }
  if (x.hasRole('evolution')) {
    const base = (o: X) => flt(units(x, '$me'), AND(OR(eq(g('$it', 'name'), def(o, 'evolvesFrom')), eq(g('$it', 'family'), def(o, 'evolvesFrom'))), lt(g('$it', 'newT'), '$turn')));
    Aa.evolve = { label: 'Evolve', phases: x.main, source: hand(AND(eq(g('$it', 'role'), 'evolution'), gt(cnt(base('$it')), 0))), ...sp(1), req: apReq,
      targets: [{ as: '$b', from: base('$self'), prompt: 'Evolve which unit?' }], cost: [...payCost, ...apCost],
      do: [LET('$atts', ['linked', '$b', 'bearer']), LET('$d', g('$b', 'dmg')), LET('$ex', g('$b', 'ex')), ...UZ.map((z) => IF(eq(g('$b', 'zone'), z), [
        ['move', '$self', z, { as: '$ev' }], SET('$ev', 'dmg', '$d'), SET('$ev', 'ex', '$ex'), SET('$ev', 'newT', '$turn'), IF(gt(cnt('$atts'), 0), [['link', '$atts', 'bearer', '$ev']]), ['move', '$b', 'grave']]))] };
  }
  if (x.hasRole('extra')) Aa.fuse = { label: 'Summon from extra deck', phases: x.main, ...sp(1), req: apReq,
    source: flt(cards('$me', 'extra'), AND(ge(cnt(units(x, '$me')), mx(1, def('$it', 'materials'))), C('payable', '$it', '$me'))),
    cost: [...payCost, ...apCost, choose({ from: units(x, '$me'), min: mx(1, def('$self', 'materials')), max: mx(1, def('$self', 'materials')), as: '$ms', prompt: 'Which units become the materials?', required: true }), ['move', '$ms', 'grave']],
    do: summonTo('$fx') };
  if (r.mode === 'cards' && x.hasRole('resource')) Aa.resource = { label: `Play ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: flt(cards('$me', 'hand'), eq(g('$it', 'role'), 'resource')), do: [['move', '$self', 'resources', { as: '$rs' }], C('gainRes', '$me', g('$rs', 'res'), 1)] };
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
      IF(isObj('$ct'), [['modify', '$ct', { layer: 'add', mods: [{ op: 'add', stat: POW, value: def('$self', 'counter') }], until: 'turn' }]])] };
  if (bp.cards.some((k) => k.abilities.some((a) => a.when === 'activated')) || bp.keywords.some((k) => k.abilities?.some((a) => a.when === 'activated')))
    Aa.act = { label: 'Use', phases: x.main, activated: 'acts', ...sp(1, true), source: cat(units(x, '$me'), cards('$me', 'support'), ...(x.leader ? [cards('$me', 'leader')] : [])), do: [] };
  if (arenas && atkZ.length < UZ.length) {
    const front = atkZ[0];
    Aa.advance = { label: `Move to ${arenas.find((a) => a.id === front)!.name}`, phases: x.main, limit: { per: 'turn', by: 'source' }, ...sp(1),
      source: flt(units(x, '$me', UZ.filter((z) => !atkZ.includes(z))), C('roomIn', '$me', front)), do: [C('moveKeep', '$self', front)] };
  }
  if (c.quest) Aa.quest = { label: 'Quest', phases: x.atkPhases, limit: { per: 'turn', by: 'source' }, ...sp(1), source: flt(units(x, '$me'), AND(C('canAtk', '$it'), gt(g('$it', c.quest), 0))),
    do: [SET('$self', 'ex', 1), INC('$me', 'score', g('$self', c.quest)), emit('quest', { o: '$self', p: '$me', n: g('$self', c.quest) })] };

  // attacks
  if (c.mode === 'block' || c.mode === 'target') {
    const attackers = cat(units(x, '$me'), ...(x.leader && c.leaderAttacks ? [cards('$me', 'leader')] : []));
    const base: Record<string, any> = { label: 'Attack', phases: x.atkPhases, limit: { per: 'turn', by: 'source' }, ...sp(1), source: flt(attackers, C('canAtk', '$it')) };
    if (c.mode === 'block') {
      Aa.attack = { ...base, do: [['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blockers: L([]) } }], SET('game', 'bat', 0)] };
    } else {
      const ouAll = units(x, '$opp');
      const ou = c.sameArena && arenas ? flt(ouAll, eq(g('$it', 'zone'), g('$self', 'zone'))) : ouAll;
      const reach = (l: X) => flt(l, AND(NOT(has('$it', 'noBeAttacked')), OR(NOT(has('$it', 'flying')), has('$self', 'flying'))));
      const hitable = reach(c.targetUnits === 'any' ? ou : c.targetUnits === 'exhausted' ? flt(ou, eq(g('$it', 'ex'), 1)) : L([]));
      const face = x.leader ? cards('$opp', 'leader') : ['list', '$opp'];
      const open = c.direct === 'never' ? hitable : c.direct === 'ifEmpty' ? Q(gt(cnt(ouAll), 0), hitable, face) : cat(face, hitable);
      const guards = flt(ou, has('$it', 'guard'));
      const from = Q(AND(ANY(ou, has('$it', 'guard')), NOT(has('$self', 'saboteur'))), guards, open);
      Aa.attack = { ...base, targets: [{ as: '$t', from, prompt: 'Attack what?' }],
        do: [['openWindow', 'battle', { data: { attacker: '$self', target: '$t', defender: '$opp', blockers: L([]) } }], SET('game', 'bat', 0)] };
    }
  }
  if (c.mode === 'duel') {
    Aa.useMove = { label: 'Attack', phases: x.atkPhases, activated: 'moves', ...sp(1), source: flt(cards('$me', 'active'), c.firstTurnAttack ? L(true) : ne('$turn', 1)), do: [] };
    Aa.retreat = { label: 'Retreat', phases: x.main, limit: { per: 'turn' }, ...sp(1),
      source: flt(cards('$me', 'active'), AND(ge(cnt(C('energy', '$it')), def('$it', 'retreat')), gt(cnt(cards('$me', 'bench')), 0))),
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

  // ---- triggers, state checks, replacements
  const triggers: X[] = [];
  if (bp.win.deckOut) triggers.push({ on: 'drawFail', do: [['lose', '$e.player']] });
  triggers.push({ on: 'moved', if: AND(eq(def('$e.card', 'role'), 'token'), NOT(inl('$e.to', UZ)), ne('$e.to', 'void')), do: [IF(isObj('$e.newObj'), [['move', '$e.newObj', 'void']])] });
  triggers.push({ on: 'moved', if: AND(inl('$e.to', UZ), NOT(inl('$e.from', UZ)), isObj('$e.newObj'), has('$e.newObj', 'entersExhausted')), do: [SET('$e.newObj', 'ex', 1)] });
  const unitDied = AND(inl('$e.from', UZ), inl(def('$e.card', 'role'), UNIT_ROLES));
  if (x.prizes) triggers.push({ on: 'destroyed', if: unitDied, do: [LET('$tk', ['opp', '$e.controller']), IF(gt(cnt(cards('$tk', 'prizes')), 0), [['move', ['top', '$tk', 'prizes', 1], 'hand'], emit('prize', { p: '$tk' })])] });
  if (c.mode === 'duel') triggers.push({ on: 'destroyed', if: AND(eq('$e.from', 'active'), gt(cnt(cards('$e.controller', 'bench')), 0)), do: [
    choose({ who: '$e.controller', from: cards('$e.controller', 'bench'), min: 1, max: 1, as: '$pr', prompt: 'Promote which benched unit to active?' }), C('moveKeep', '$pr', 'active')] });
  if (c.mode === 'lanes' && !conq) triggers.push({ on: 'showdown', do: lanes.map((z, i) => IF(eq('$e.z', z), [LET('$m', cnt(cards('$e.p', z))), LET('$o', cnt(cards(['opp', '$e.p'], z))),
    IF(AND(gt('$m', 0), eq('$o', 0), ne(g('game', `c${i + 1}`), add(seat('$e.p'), 1))), [SET('game', `c${i + 1}`, add(seat('$e.p'), 1)), INC('$e.p', 'score', 1), emit('conquer', { p: '$e.p', z })]),
    IF(AND(eq('$m', 0), gt('$o', 0)), [SET('game', `c${i + 1}`, add(seat(['opp', '$e.p']), 1))])])) });
  const checks: X[] = [];
  if (HP) checks.push(EACH(flt(allUnits(x), AND(gt(g('$it', HP), 0), ge(g('$it', 'dmg'), g('$it', HP)))), '$u', [['destroy', '$u']]));
  checks.push(EACH(flt(cards('*', 'support'), AND(eq(g('$it', 'att'), 1), NOT(isObj(g('$it', 'bearer'))))), '$a', [['move', '$a', 'grave']]));
  if (x.life) checks.push(EACH(['players'], '$p', [IF(le(g('$p', 'life'), 0), [['lose', '$p']])]));
  if (pts) checks.push(EACH(['players'], '$p', [IF(ge(g('$p', 'score'), pts), [['win', '$p']])]));
  if (x.prizes) checks.push(IF(eq(g('game', 'started'), 1), [EACH(['players'], '$p', [IF(eq(cnt(cards('$p', 'prizes')), 0), [['win', '$p']])])]));
  if (bp.win.noUnits) checks.push(IF(eq(g('game', 'started'), 1), [EACH(['players'], '$p', [IF(eq(cnt(units(x, '$p')), 0), [['lose', '$p']])])]));
  const replacements: X[] = [
    { replace: 'damage', text: 'Shield', if: AND(isObj('$e.target'), has('$e.target', 'shield'), eq(g('$e.target', 'shu'), 0)), instead: [SET('$e.target', 'shu', 1)] },
    { replace: 'destroy', text: 'Shield', if: AND(has('$e.obj', 'shield'), eq(g('$e.obj', 'shu'), 0), inl(g('$e.obj', 'zone'), UZ)), instead: [SET('$e.obj', 'shu', 1), SET('$e.obj', 'dmg', 0)] },
    ...(x.hasRule('resist') ? [{ replace: 'damage', text: 'Resist', if: AND(isObj('$e.target'), gt(def('$e.target', 'kw_resist'), 0)), modify: { amount: mx(0, sub('$e.amount', def('$e.target', 'kw_resist'))) } }] : []),
  ];
  const counters = bp.counters ?? [];
  const kwStatic = (rule: string, flag: string) => ({ layer: 'add', text: rule, affects: flt(allUnits(x), AND(eq(g('$it', flag), 1), gt(def('$it', `kw_${rule}`), 0))), mods: [{ op: 'add', stat: POW, value: def('$it', `kw_${rule}`) }] });
  const statics: X[] = [...(conq && x.hasRule('challenger') ? [kwStatic('challenger', 'atk')] : []), ...(conq && x.hasRule('bulwark') ? [kwStatic('bulwark', 'dfn')] : [])];
  statics.push(...counters.filter((k) => k.adds && Object.keys(k.adds).length).map((k) => ({ layer: 'add', text: k.name, affects: flt(allUnits(x), gt(g('$it', `c_${k.id}`), 0)),
    mods: Object.entries(k.adds!).map(([stat, n]) => ({ op: 'add', stat, value: mul(g('$it', `c_${k.id}`), n) })) })));

  // ---- windows and timing
  const respond: Record<string, any> = { id: 'respond', ...(stackish ? {} : { timing: { mode: 'alternate', first: '$win.defender' } }) };
  const windows = conq ? { showdown: { steps: [{ id: 'respond', timing: { mode: 'alternate', first: '$win.defender' } }, { id: 'fight', auto: true, do: [C('fight', '$win.i', '$win.p')] }] } } : x.battle ? { battle: { steps: [{ id: 'declare', auto: true, do: [C('declare')] }, { id: 'block', auto: true, do: [C('block')] }, respond, { id: 'damage', auto: true, do: [C('battle')] }] } } : undefined;

  const sections = x.leader || x.hasRole('extra') || r.mode === 'deck' || !!bp.setup.champion || x.sites;
  const statIds = bp.stats.map((s) => s.id).filter((s) => s !== 'cost');
  const rules: Record<string, any> = {
    players: { min: 2, max: 2 },
    playerVars: { life: bp.win.life, score: 0, cap: 0, turns: 0, ap: 0, pp: 0, ...(usesPlayed ? { plays: 0 } : {}) },
    objectVars: { dmg: 0, ex: 0, newT: 0, pos: 0, shu: 0, att: 0, ...(conq ? { atk: 0, dfn: 0 } : {}), ...(r.give ? { don: 0 } : {}), ...Object.fromEntries(counters.map((k) => [`c_${k.id}`, 0])) },
    gameVars: { first: 0, started: 0, bat: 0, rem: 0, ...Object.fromEntries(lanes.map((_, i) => [`c${i + 1}`, 0])), ...(conq ? Object.fromEntries(lanes.map((_, i) => [`s${i + 1}`, 0])) : {}) },
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
      ...(x.leader && bp.setup.leaderColors ? { rules: [{ if: ['all', cat('$sections.deck', ...(bp.setup.champion ? ['$sections.champion'] : []), ...(r.mode === 'deck' ? ['$sections.resdeck'] : [])),
        OR(NOT(def('$it', 'color')), eq(def('$it', 'color'), def(first('$sections.leader'), 'color')), eq(def('$it', 'color'), def(first('$sections.leader'), 'color2')))], why: "Every card must match one of the leader's two colors" }] } : {}),
    },
    turnLimit: bp.setup.turnLimit,
    stats: statIds, layers: ['set', 'add'],
    ...(statics.length ? { statics } : {}),
    ...(x.pool ? { resources: { mana: { types: [...x.colorIds, 'c'], generic: 'any' } } } : {}),
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
  const labels: Record<string, string> = { ...Object.fromEntries(bp.types.map((t) => [t.id, t.name])), ...Object.fromEntries(bp.stats.map((s) => [s.id, s.name])),
    ...Object.fromEntries(bp.keywords.map((k) => [x.kwKey(k.id), k.name])), ...Object.fromEntries(counters.map((k) => [`c_${k.id}`, `${k.icon ?? ''}${k.name}`])),
    life: x.lifeCards && !x.life ? 'Life cards' : 'Life', score: 'Points', dmg: 'damage', field: 'Board', support: 'Support', resources: bp.resource.name, resdeck: `${bp.resource.name} deck`,
    leader: 'Leader', prizes: 'Prizes', banished: 'Banished', ...Object.fromEntries((bp.zones ?? []).map((z) => [z.id, z.name])), extra: 'Extra deck', active: 'Active', bench: 'Bench', base: 'Base', limbo: 'Resolving', grave: 'Discard', pitch: 'Pitched', ap: 'Actions', pp: bp.resource.name,
    ...Object.fromEntries(lanes.map((z, i) => [z, c.lanes[i]])), ...(x.sites ? Object.fromEntries(lanes.map((z, i) => [`site${i + 1}`, `⚑ ${c.lanes[i]}`])) : {}), champion: 'Champion', sites: 'Battlefields in reserve', don: `${bp.resource.name} given`, ...Object.fromEntries((arenas ?? []).map((a) => [a.id, a.name])),
    ...bp.zoneNames };
  for (const k of bp.colors) labels[`mana:${k.id}`] = k.name;
  labels['mana:c'] = x.recycle ? 'Energy' : bp.resource.name;
  const kwFields = [...new Set(bp.cards.flatMap((k) => Object.keys(k.kwv ?? {}).map((id) => `kw_${x.kwKey(id)}`)))];
  const manifest = {
    moduleId: bp.id, displayName: bp.name, semanticVersion: '1.0.0', engineApiRange: `^${ENGINE_API}`,
    licensing: `Made with the Universal Card Battles Game Maker${bp.author ? ` by ${bp.author}` : ''}.`,
    tagline: bp.tagline,
    theme: { accent: bp.look.accent, accent2: bp.look.accent2, glyph: bp.look.glyph, tapVar: 'ex', labels,
      hideStats: ['role', 'res', 'trapOn', 'playTo', 'evolvesFrom', 'materials', 'retreat', 'hue', 'glyph', 'zone', 'family', 'hasEff', 'hasHit', 'hasConq', 'hasHold', 'onConquer', 'onHold', 'en', 'pw', 'color2', 'cmN', 'cmType', ...kwFields, ...(c.mode === 'duel' ? [] : ['weakness'])],
      hideVars: ['ex', 'newT', 'pos', 'shu', 'att', 'cap', 'turns', 'first', 'started', 'bat', 'rem', 'atk', 'dfn', 'plays', ...lanes.map((_, i) => `s${i + 1}`), ...(x.points ? [] : ['score']), ...(x.life ? [] : ['life']), ...(ap ? [] : ['ap']), ...(r.mode === 'pitch' ? [] : ['pp'])],
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
