// Compiles a Game Maker blueprint into an engine module (manifest, rules, cards, decks, AI hints).
// The blueprint picks systems (resources, combat, winning, turn) and the compiler writes the DSL for each one.
import type { ModuleDef } from '#engine';
import { ENGINE_API } from '#engine';
import type { Ability, Blueprint, CardBP, Cond, Effect, Role, TargetKind } from './blueprint.ts';

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

export const UNIT_ROLES: Role[] = ['unit', 'evolution', 'extra', 'token'];
const slug = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

/** Everything the compiler derives once from a blueprint. */
export function context(bp: Blueprint) {
  const c = bp.combat, r = bp.resource;
  const roleOf = new Map(bp.types.map((t) => [t.id, t.role]));
  const typesOf = (...roles: Role[]) => bp.types.filter((t) => roles.includes(t.role)).map((t) => t.id);
  const hasRole = (...roles: Role[]) => typesOf(...roles).length > 0;
  const lanes = c.mode === 'lanes' ? c.lanes.map((_, i) => `lane${i + 1}`) : [];
  const UZ = c.mode === 'duel' ? ['active', 'bench'] : c.mode === 'lanes' ? ['base', ...lanes] : ['field'];
  const main = bp.turn.filter((p) => p.kind === 'main').map((p) => p.id);
  const combatP = bp.turn.filter((p) => p.kind === 'combat').map((p) => p.id);
  const endP = bp.turn.find((p) => p.kind === 'end')?.id ?? 'end';
  const battle = c.mode === 'block' || c.mode === 'target';
  const pool = ['ramp', 'cards', 'anycard', 'deck'].includes(r.mode);
  const colorIds = bp.colors.map((k) => k.id);
  const leader = bp.setup.leader || hasRole('leader');
  return {
    bp, c, r, roleOf, typesOf, hasRole, lanes, UZ, main: main.length ? main : ['main'], combatP, endP, battle, pool, colorIds, leader,
    atkPhases: combatP.length ? combatP : main.length ? main : ['main'],
    fast: [...new Set([...(main.length ? main : ['main']), ...combatP, ...(battle ? ['respond'] : [])])],
    POW: c.power, HP: c.health, DEF: c.defense,
    life: bp.win.life > 0, lifeCards: bp.win.lifeCards > 0 || (leader && bp.cards.some((k) => roleOf.get(k.type) === 'leader' && (k.stats.life ?? 0) > 0)),
    prizes: bp.win.prizes > 0, points: bp.win.points > 0 || c.mode === 'lanes',
    kw: new Map(bp.keywords.map((k) => [k.id, k])),
  };
}
type Ctx = ReturnType<typeof context>;

const units = (x: Ctx, p: X) => (x.UZ.length === 1 ? cards(p, x.UZ[0]) : ['concat', ...x.UZ.map((z) => cards(p, z))]);
const allUnits = (x: Ctx) => units(x, '*');

// ---------------------------------------------------------------- rules text
const NUM = (n: number | undefined) => String(n ?? 1);
const TGT_TEXT: Record<TargetKind, string> = {
  self: 'this', enemyUnit: 'an enemy unit', anyUnit: 'a unit', ownUnit: 'one of your units', otherOwnUnit: 'another of your units', enemyAny: 'an enemy unit or the opponent',
  opponent: 'the opponent', you: 'you', eachPlayer: 'each player', allEnemyUnits: 'each enemy unit', allUnits: 'each unit', allOwnUnits: 'each of your units',
  randomEnemyUnit: 'a random enemy unit', attacker: 'the attacking unit', battleTarget: 'the unit being attacked',
};
export function effectText(e: Effect, bp: Blueprint): string {
  const n = NUM(e.n), t = TGT_TEXT[e.target ?? 'enemyUnit'];
  const stat = bp.stats.find((s) => s.id === e.stat)?.name ?? e.stat ?? 'power';
  const who = e.who === 'opp' ? 'the opponent' : e.who === 'each' ? 'each player' : 'you';
  const card = bp.cards.find((k) => k.id === e.card)?.name ?? 'token';
  const type = bp.types.find((k) => k.id === e.type)?.name ?? 'card';
  switch (e.k) {
    case 'draw': return e.who === 'opp' ? `the opponent draws ${n}` : e.who === 'each' ? `each player draws ${n}` : `draw ${n === '1' ? 'a card' : `${n} cards`}`;
    case 'damage': return `deal ${n} damage to ${t}`;
    case 'heal': return `heal ${n} from ${t}`;
    case 'buff': return `${t} gets ${+n >= 0 ? '+' : ''}${n} ${stat}${e.until === 'forever' ? '' : ' until end of turn'}`;
    case 'destroy': return `destroy ${t}`;
    case 'bounce': return `return ${t} to its owner's hand`;
    case 'exhaust': return `exhaust ${t}`;
    case 'ready': return `ready ${t}`;
    case 'token': return `create ${n === '1' ? 'a' : n} ${card} token${n === '1' ? '' : 's'}`;
    case 'gain': return `gain ${n} ${bp.resource.name}`;
    case 'discard': return `${who === 'you' ? 'discard' : `${who} discards`} ${n} card${n === '1' ? '' : 's'}`;
    case 'mill': return `${who === 'you' ? 'put' : `${who} puts`} the top ${n} of ${who === 'you' ? 'your' : 'their'} deck into the discard pile`;
    case 'search': return `put a ${type} from your deck into your hand, then shuffle`;
    case 'recover': return `return a ${type} from your discard pile to your hand`;
    case 'counter': return 'cancel the opponent\'s last spell or ability';
    case 'lifeGain': return `gain ${n} life`;
    case 'lifeLoss': return `${who === 'you' ? 'lose' : `${who} loses`} ${n} life`;
    case 'score': return `score ${n} point${n === '1' ? '' : 's'}`;
    case 'addLife': return `add the top ${n} card${n === '1' ? '' : 's'} of your deck to your life`;
    case 'aura': return `${TGT_TEXT[e.target ?? 'allOwnUnits'].replace(/^each/, 'all')} get${e.target === 'self' ? 's' : ''} +${n} ${stat}`;
    case 'win': return 'you win the game';
    case 'raw': return '(custom script)';
  }
}
const WHEN_TEXT: Record<string, string> = {
  play: 'When played: ', leave: 'When destroyed: ', attack: 'When this attacks: ', hit: 'When this hits the opponent: ', startTurn: 'At the start of your turn: ',
  endTurn: 'At the end of your turn: ', static: '', opAttack: 'Spring when an enemy attacks: ',
};
const condText = (k: Cond | undefined) => !k ? '' : k.k === 'units' ? `if you control ${k.n ?? 1} or more units, ` : k.k === 'life' ? `if you have ${k.n ?? 5} or less life, `
  : k.k === 'hand' ? `if you have ${k.n ?? 0} or fewer cards in hand, ` : k.k === 'yourTurn' ? 'during your turn, ' : 'if the custom condition holds, ';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function abilityText(a: Ability, bp: Blueprint, role: Role): string {
  const spellish = role === 'spell' || role === 'fast' || role === 'trap';
  const head = a.when === 'activated' ? `${[a.tap && 'Exhaust', a.cost && `pay ${a.cost}`].filter(Boolean).join(', ') || 'Activate'}: ` : a.when === 'play' && spellish ? '' : WHEN_TEXT[a.when] ?? '';
  const body = a.do.map((e) => effectText(e, bp)).join(', then ');
  return `${head}${cap(condText(a.if) + body)}.${a.once === 'game' ? ' (Once per game.)' : a.once ? ' (Once per turn.)' : ''}`;
}
export function cardText(k: CardBP, bp: Blueprint): string {
  if (k.text) return k.text;
  const role = bp.types.find((t) => t.id === k.type)?.role ?? 'unit';
  const parts = k.abilities.map((a) => abilityText(a, bp, role));
  if (k.bonus) parts.push(`Attach to one of your units: ${Object.entries(k.bonus).map(([s, n]) => `${n >= 0 ? '+' : ''}${n} ${bp.stats.find((x) => x.id === s)?.name ?? s}`).join(', ')}.`);
  if (role === 'evolution' && k.evolvesFrom) parts.unshift(`Evolves from ${k.evolvesFrom}.`);
  if (role === 'extra' && k.materials) parts.unshift(`Summon from your extra deck by sending ${k.materials} of your units to the discard pile.`);
  for (const mv of k.moves ?? []) parts.push(`${mv.name} [${costLabel(mv.cost, bp)}]: ${mv.damage} damage${mv.do?.length ? `; ${mv.do.map((e) => effectText(e, bp)).join(', then ')}` : ''}.`);
  return parts.filter(Boolean).join('\n');
}
export function costLabel(cost: Record<string, number> | number | undefined, bp: Blueprint): string {
  if (cost === undefined) return '0';
  if (typeof cost === 'number') return String(cost);
  return Object.entries(cost).map(([t, n]) => `${n} ${t === 'any' ? 'any' : bp.colors.find((k) => k.id === t)?.name ?? t}`).join(' + ') || '0';
}

// ---------------------------------------------------------------- effects and abilities
function target(x: Ctx, kind: TargetKind | undefined, v: string, prompt: string): { pre: X[]; ref: X; many: boolean } {
  const vis = (l: X) => flt(l, NOT(AND(has('$it', 'ward'), ne(ctrl('$it'), '$me'))));
  const one = (from: X) => ({ pre: [choose({ from, min: 1, max: 1, as: v, prompt })], ref: v, many: false });
  switch (kind ?? 'enemyUnit') {
    case 'self': return { pre: [], ref: '$self', many: false };
    case 'opponent': return { pre: [], ref: '$opp', many: false };
    case 'you': return { pre: [], ref: '$me', many: false };
    case 'eachPlayer': return { pre: [], ref: ['players'], many: true };
    case 'enemyUnit': return one(vis(units(x, '$opp')));
    case 'anyUnit': return one(['concat', units(x, '$me'), vis(units(x, '$opp'))]);
    case 'ownUnit': return one(units(x, '$me'));
    case 'otherOwnUnit': return one(flt(units(x, '$me'), ne('$it', '$self')));
    case 'enemyAny': return one(['concat', x.leader && !x.lifeCards ? cards('$opp', 'leader') : ['list', '$opp'], vis(units(x, '$opp'))]);
    case 'allEnemyUnits': return { pre: [], ref: units(x, '$opp'), many: true };
    case 'allUnits': return { pre: [], ref: allUnits(x), many: true };
    case 'allOwnUnits': return { pre: [], ref: units(x, '$me'), many: true };
    case 'randomEnemyUnit': return { pre: [['random', { from: units(x, '$opp'), as: v }]], ref: v, many: false };
    case 'attacker': return { pre: [], ref: Q(gt(g('game', 'bat'), 0), '$win.attacker', 0), many: false };
    case 'battleTarget': return { pre: [], ref: Q(gt(g('game', 'bat'), 0), '$win.target', 0), many: false };
  }
}
function effect(x: Ctx, e: Effect, i: number): X[] {
  const n = e.n ?? 1;
  const p = e.who === 'opp' ? '$opp' : '$me';
  const per = (body: (who: X) => X[]) => (e.who === 'each' ? [EACH(['players'], '$pl', body('$pl'))] : body(p));
  const needsTarget = ['damage', 'heal', 'buff', 'destroy', 'bounce', 'exhaust', 'ready'].includes(e.k);
  if (needsTarget) {
    const t = target(x, e.target, `$t${i}`, cap(`${effectText(e, x.bp)}: choose`));
    const one = (r: X): X[] => {
      switch (e.k) {
        case 'damage': return [C('dmgTo', r, n, '$self')];
        case 'heal': return [C('healTo', r, n)];
        case 'buff': return [IF(isObj(r), [e.until === 'forever' ? INC(r, e.stat ?? x.POW, n) : ['modify', r, { layer: 'add', mods: [{ op: 'add', stat: e.stat ?? x.POW, value: n }], until: 'turn' }]])];
        case 'destroy': return [IF(isObj(r), [['destroy', r]])];
        case 'bounce': return [IF(isObj(r), [['move', r, 'hand']])];
        case 'exhaust': return [IF(isObj(r), [SET(r, 'ex', 1)])];
        default: return [IF(isObj(r), [SET(r, 'ex', 0)])];
      }
    };
    return [...t.pre, ...(t.many ? [EACH(t.ref, `$x${i}`, one(`$x${i}`))] : one(t.ref))];
  }
  switch (e.k) {
    case 'draw': return per((w) => [['draw', w, n]]);
    case 'token': return [EACH(range(n), `$k${i}`, [IF(C('room', '$me'), [['create', e.card ?? 'token', '$me', x.c.mode === 'duel' ? 'bench' : x.UZ[0], { as: `$n${i}` }], SET(`$n${i}`, 'newT', '$turn')])])];
    case 'gain': return x.pool ? [C('gainRes', '$me', 'c', n)] : [];
    case 'discard': return per((w) => [C('discardN', w, n)]);
    case 'mill': return per((w) => [['move', ['top', w, 'deck', n], 'grave']]);
    case 'search': return [LET(`$s${i}`, first(flt(cards('$me', 'deck'), e.type ? eq(g('$it', 'type'), e.type) : L(true)))),
      IF(isObj(`$s${i}`), [['move', `$s${i}`, 'hand']]), ['shuffle', '$me', 'deck']];
    case 'recover': return [choose({ from: flt(cards('$me', 'grave'), e.type ? eq(g('$it', 'type'), e.type) : L(true)), min: 1, max: 1, as: `$s${i}`, prompt: 'Return which card?' }),
      IF(isObj(`$s${i}`), [['move', `$s${i}`, 'hand']])];
    case 'counter': return x.bp.timing === 'simple' ? [] : [IF(ANY(['stack'], ne(g('$it', 'controller'), '$me')), [['counter', ['slice', flt(['stack'], ne(g('$it', 'controller'), '$me')), 0, 1]]])];
    case 'lifeGain': return x.life ? [INC('$me', 'life', n)] : x.lifeCards ? [['move', ['top', '$me', 'deck', n], 'life']] : [];
    case 'lifeLoss': return per((w) => (x.life ? [INC(w, 'life', -n)] : [C('hitN', w, n, n, '$self')]));
    case 'score': return [INC('$me', 'score', n)];
    case 'addLife': return [['move', ['top', '$me', 'deck', n], 'life']];
    case 'win': return [['win', '$me']];
    case 'raw': return Array.isArray(e.raw) ? (e.raw as X[]) : [];
    default: return [];
  }
}
function condExpr(x: Ctx, k: Cond | undefined): X | null {
  if (!k) return null;
  switch (k.k) {
    case 'units': return ge(cnt(units(x, '$me')), k.n ?? 1);
    case 'life': return x.life ? le(g('$me', 'life'), k.n ?? 5) : le(cnt(cards('$me', 'life')), k.n ?? 2);
    case 'hand': return le(cnt(cards('$me', 'hand')), k.n ?? 0);
    case 'yourTurn': return eq('$active', '$me');
    case 'raw': return k.raw ?? true;
  }
}
const effects = (x: Ctx, list: Effect[]) => list.flatMap((e, i) => effect(x, e, i));
const scopeOf = (x: Ctx, t: TargetKind | undefined): X => t === 'self' ? ['list', '$self'] : t === 'allEnemyUnits' ? units(x, '$opp') : t === 'allUnits' ? allUnits(x)
  : t === 'otherOwnUnit' ? flt(units(x, '$me'), ne('$it', '$self')) : units(x, '$me');

function compileCard(x: Ctx, k: CardBP): Record<string, X> {
  const bp = x.bp;
  const role: Role = x.roleOf.get(k.type) ?? 'unit';
  const out: Record<string, any> = { id: k.id, name: k.name, type: k.type, role, text: cardText(k, bp) };
  if (k.flavor) out.flavor = k.flavor;
  out.cost = k.cost ?? 0;
  if (typeof out.cost === 'object' && !Object.keys(out.cost).length) out.cost = 0;
  for (const [s, v] of Object.entries(k.stats ?? {})) if (s !== 'cost') out[s] = v;
  if (k.color) out.color = k.color;
  out.res = k.color && x.colorIds.includes(k.color) ? k.color : 'c';
  const kws = k.keywords.map((id) => { const w = x.kw.get(id); return w && w.rule !== 'none' ? w.rule : id; });
  if (role === 'token') { kws.push('token'); out.maxCopies = 0; }
  if (role === 'resource') out.maxCopies = 99;
  if (kws.length) out.keywords = [...new Set(kws)];
  const glyph = k.art || bp.types.find((t) => t.id === k.type)?.icon;
  if (glyph) out.glyph = glyph;
  const hex = bp.colors.find((cl) => cl.id === k.color)?.hex;
  if (hex) out.hue = hexHue(hex);
  if (k.evolvesFrom) out.evolvesFrom = k.evolvesFrom;
  if (k.materials) out.materials = k.materials;
  if (k.weakness) out.weakness = k.weakness;
  if (k.retreat !== undefined) out.retreat = k.retreat;
  const spellish = role === 'spell' || role === 'fast' || role === 'trap';
  const abilities: X[] = [], statics: X[] = [], acts: X[] = [], effs: X[] = [];
  for (const a of k.abilities) {
    const cond = condExpr(x, a.if);
    const body = effects(x, a.do);
    const lim = a.once ? { limit: { per: a.once === 'game' ? 'game' : 'turn', by: 'source' } } : {};
    if (a.when === 'static') {
      for (const e of a.do.filter((d) => d.k === 'aura')) statics.push({ layer: 'add', affects: scopeOf(x, e.target), mods: [{ op: 'add', stat: e.stat ?? x.POW, value: e.n ?? 1 }], ...(cond ? { if: cond } : {}) });
      continue;
    }
    if ((a.when === 'play' || a.when === 'opAttack') && spellish) {
      effs.push(...(cond ? [IF(cond, body)] : body));
      if (a.when === 'opAttack') out.trapOn = 'opAttack';
      continue;
    }
    if (a.when === 'activated') {
      const req: X[] = [];
      const cost: X[] = [];
      if (a.tap) { req.push({ if: eq(g('$self', 'ex'), 0), why: 'Already exhausted' }); cost.push(SET('$self', 'ex', 1)); }
      if (a.cost && x.pool) { req.push({ if: ['canPay', '$me', 'mana', a.cost], why: `Needs ${a.cost} ${bp.resource.name}` }); cost.push(['pay', '$me', 'mana', a.cost]); }
      if (cond) req.push({ if: cond, why: 'Condition not met' });
      acts.push({ label: a.label || abilityText(a, bp, role).slice(0, 60), req, cost, do: body, ...lim });
      continue;
    }
    const on = a.when === 'play' ? 'enter' : a.when === 'leave' ? 'destroyed' : a.when === 'attack' ? 'attack' : a.when === 'hit' ? 'hit' : a.when === 'startTurn' ? 'turnStart' : 'turnEnd';
    const own = a.when === 'attack' ? eq('$e.o', '$self') : a.when === 'hit' ? eq('$e.src', '$self') : a.when === 'startTurn' || a.when === 'endTurn' ? eq('$e.p', '$me') : null;
    const iff = [own, cond].filter(Boolean) as X[];
    abilities.push({ on, do: body, ...(iff.length ? { if: AND(...iff) } : {}), ...lim, text: abilityText(a, bp, role) });
  }
  if (k.bonus && Object.keys(k.bonus).length) statics.push({ layer: 'add', affects: flt(['list', g('$self', 'bearer')], isObj('$it')), mods: Object.entries(k.bonus).map(([stat, value]) => ({ op: 'add', stat, value })) });
  if (effs.length) out.effects = effs;
  if (abilities.length) out.abilities = abilities;
  if (statics.length) out.statics = statics;
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
export function compileBlueprint(bp: Blueprint): ModuleDef {
  const x = context(bp);
  const { c, r, UZ, lanes, POW, HP, DEF } = x;
  const F: Record<string, { params: string[]; body: X }> = {};
  const P: Record<string, { params: string[]; do: X[] }> = {};
  const fn = (n: string, params: string[], body: X) => { F[n] = { params, body }; };
  const proc = (n: string, params: string[], d: X[]) => { P[n] = { params, do: d }; };
  const types = (...roles: Role[]) => x.typesOf(...roles);
  const isRole = (o: X, ...roles: Role[]) => inl(g(o, 'role'), roles);
  const hpl = (o: X) => sub(HP ? g(o, HP) : g(o, POW), g(o, 'dmg'));

  // ---- functions
  fn('pw', ['$o'], mx(0, g('$o', POW)));
  fn('payable', ['$c', '$p'], x.pool ? ['canPay', '$p', 'mana', def('$c', 'cost')] : L(true));
  fn('room', ['$p'], c.mode === 'duel' ? OR(eq(cnt(cards('$p', 'active')), 0), lt(cnt(cards('$p', 'bench')), c.benchSize))
    : lt(cnt(cards('$p', UZ[0])), c.fieldSize));
  fn('canAtk', ['$o'], AND(eq(g('$o', 'ex'), 0), eq(g('$o', 'pos'), 0), NOT(g('$o', 'faceDown')),
    c.sickness ? OR(lt(g('$o', 'newT'), '$turn'), has('$o', 'haste'), isRole('$o', 'leader')) : L(true),
    c.firstTurnAttack ? L(true) : ne('$turn', 1)));
  fn('energy', ['$u'], flt(['linked', '$u', 'bearer'], eq(g('$it', 'role'), 'resource')));
  const trib = [...r.tribute].sort((a, b) => b.level - a.level);
  fn('tribs', ['$c'], trib.reduce<X>((acc, t) => Q(ge(def('$c', 'level'), t.level), t.n, acc), 0));

  // ---- procedures
  proc('gainRes', ['$p', '$t', '$n'], x.pool ? [['gain', '$p', 'mana', ['tally', range('$n'), '$t']]] : []);
  proc('refill', ['$p'], x.pool ? [['empty', '$p', 'mana'],
    r.mode === 'ramp' ? ['gain', '$p', 'mana', ['tally', range(g('$p', 'cap')), 'c']] : ['gain', '$p', 'mana', ['tally', cards('$p', 'resources'), g('$it', 'res')]]] : []);
  proc('hitN', ['$p', '$hits', '$amt', '$src'], [
    ...(x.lifeCards ? [EACH(range('$hits'), '$i', [IF(eq(cnt(cards('$p', 'life')), 0), [['lose', '$p']], [['move', ['top', '$p', 'life', 1], 'hand'], emit('lifeLost', { p: '$p' })])])]
      : x.life ? [['damage', '$p', '$amt', '$src']] : [])]);
  proc('discardN', ['$p', '$n'], [LET('$k', mn('$n', cnt(cards('$p', 'hand')))), IF(gt('$k', 0), [
    choose({ who: '$p', from: cards('$p', 'hand'), min: '$k', max: '$k', as: '$ds', prompt: 'Discard' }), ['move', '$ds', 'grave']])]);
  proc('moveKeep', ['$u', '$z'], [LET('$atts', ['linked', '$u', 'bearer']), LET('$d', g('$u', 'dmg')), LET('$nt', g('$u', 'newT')), LET('$ex', g('$u', 'ex')),
    ...UZ.map((z) => IF(eq('$z', z), [['move', '$u', z, { as: '$nw' }], SET('$nw', 'dmg', '$d'), SET('$nw', 'newT', '$nt'), SET('$nw', 'ex', '$ex'),
      IF(gt(cnt('$atts'), 0), [['link', '$atts', 'bearer', '$nw']])]))]);
  proc('dmgTo', ['$o', '$n', '$src'], [IF(isP('$o'), [C('hitN', '$o', '$n', '$n', '$src')], [IF(isObj('$o'),
    HP ? [IF(isRole('$o', 'leader'), [C('hitN', ctrl('$o'), '$n', '$n', '$src')], [['damage', '$o', '$n', '$src']])]
      : [IF(isRole('$o', 'leader'), [C('hitN', ctrl('$o'), 1, '$n', '$src')], [IF(ge('$n', C('pw', '$o')), [['destroy', '$o']])])])])]);
  proc('healTo', ['$o', '$n'], [IF(isP('$o'), x.life ? [INC('$o', 'life', '$n')] : [], [IF(isObj('$o'), [SET('$o', 'dmg', mx(0, sub(g('$o', 'dmg'), '$n')))])])]);
  proc('strike', ['$s', '$t', '$n'], [IF(AND(gt('$n', 0), isObj('$t')), [
    HP ? ['damage', '$t', '$n', '$s'] : IF(ge('$n', C('pw', '$t')), [['destroy', '$t']]),
    IF(has('$s', 'deadly'), [['destroy', '$t']]),
    ...(x.life ? [IF(has('$s', 'lifesteal'), [INC(ctrl('$s'), 'life', '$n')])] : [])])]);
  proc('hitBy', ['$p', '$a', '$amt'], [C('hitN', '$p', Q(has('$a', 'double'), 2, 1), Q(has('$a', 'double'), mul('$amt', 2), '$amt'), '$a'),
    ...(x.life ? [IF(has('$a', 'lifesteal'), [INC(ctrl('$a'), 'life', '$amt')])] : []), emit('hit', { src: '$a', p: ctrl('$a'), d: '$p' })]);

  // ---- battle (block / target modes)
  const A = '$win.attacker', T = '$win.target', B = '$win.blocker', D = '$win.defender';
  proc('declare', [], [SET('game', 'bat', add(seat(ctrl(A)), 1)), IF(NOT(has(A, 'vigilance')), [SET(A, 'ex', 1)]),
    IF(AND(isObj(T), g(T, 'faceDown')), [['flip', T]]), emit('attack', { o: A, p: ctrl(A), t: T })]);
  if (c.mode === 'block') {
    proc('block', [], [choose({ who: D, from: flt(units(x, D), AND(eq(g('$it', 'ex'), 0), OR(NOT(has(A, 'flying')), has('$it', 'flying')))), min: 0, max: 1, as: '$b', prompt: 'Block with which unit? (none: take the hit)' }),
      IF(isObj('$b'), [['winSet', 'blocker', '$b'], emit('blocked', { o: '$b' })])]);
    proc('battle', [], [IF(isObj(A), [IF(isObj(B), [LET('$pa', C('pw', A)), LET('$pb', C('pw', B)), LET('$left', hpl(B)),
      C('strike', A, B, '$pa'), C('strike', B, A, '$pb'),
      IF(AND(has(A, 'overflow'), gt(sub('$pa', '$left'), 0)), [C('hitN', D, 1, sub('$pa', '$left'), A)])],
    [C('hitBy', D, A, C('pw', A))])])]);
  } else if (c.mode === 'target') {
    proc('block', [], [choose({ who: D, from: flt(units(x, D), AND(has('$it', 'blocker'), eq(g('$it', 'ex'), 0), ne('$it', T))), min: 0, max: 1, as: '$b', prompt: 'Redirect the attack to a blocker? (none: let it through)' }),
      IF(isObj('$b'), [SET('$b', 'ex', 1), ['winSet', 'target', '$b'], emit('blocked', { o: '$b' })])]);
    const cmp = c.compare;
    const wins = cmp.ties === 'defender' ? ge('$pa', '$dv') : gt('$pa', '$dv');
    const unitFight = HP
      ? [LET('$pa', C('pw', A)), LET('$pb', C('pw', T)), C('strike', A, T, '$pa'), C('strike', T, A, '$pb')]
      : [LET('$pa', C('pw', A)), LET('$def', eq(g(T, 'pos'), 1)), LET('$dv', Q('$def', DEF ? g(T, DEF) : C('pw', T), C('pw', T))),
        IF(wins, [['destroy', T], ...(cmp.overflow ? [IF(AND(NOT('$def'), gt(sub('$pa', '$dv'), 0)), [C('hitN', D, 1, sub('$pa', '$dv'), A)])] : [])],
          [IF(lt('$pa', '$dv'), [...(cmp.loser ? [IF(NOT('$def'), [['destroy', A]])] : []), ...(cmp.overflow ? [C('hitN', ctrl(A), 1, sub('$dv', '$pa'), T)] : [])],
            cmp.ties === 'both' ? [IF(NOT('$def'), [['destroy', A], ['destroy', T]])] : [])])];
    proc('battle', [], [IF(AND(isObj(A)), [
      IF(isP(T), [C('hitBy', T, A, C('pw', A))], [IF(isObj(T), [
        IF(eq(g(T, 'role'), 'leader'), c.leaderDefends ? [IF(ge(C('pw', A), C('pw', T)), [C('hitBy', ctrl(T), A, C('pw', A))])] : [C('hitBy', ctrl(T), A, C('pw', A))], unitFight)])])])]);
  }

  // ---- lanes (shared battlefields)
  if (c.mode === 'lanes') {
    const spread = (list: X, amount: string): X[] => [SET('game', 'rem', amount), EACH(['sortBy', list, hpl('$it')], '$u', [LET('$k', mn(g('game', 'rem'), mx(0, hpl('$u')))),
      IF(gt('$k', 0), [HP ? ['damage', '$u', '$k', '$p'] : IF(ge('$k', C('pw', '$u')), [['destroy', '$u']])]), INC('game', 'rem', ['neg', '$k'])])];
    proc('showdown', ['$z', '$p'], [...lanes.map((z) => IF(eq('$z', z), [LET('$mine', cards('$p', z)), LET('$theirs', cards(['opp', '$p'], z)),
      IF(AND(gt(cnt('$mine'), 0), gt(cnt('$theirs'), 0)), [LET('$a', SUM('$mine', C('pw', '$it'))), LET('$b', SUM('$theirs', C('pw', '$it'))),
        emit('showdownFight', { z, p: '$p', a: '$a', b: '$b' }), ...spread('$theirs', '$a'), ...spread('$mine', '$b')])])), emit('showdown', { z: '$z', p: '$p' })]);
  }

  // ---- zones
  const zones: Record<string, any>[] = [
    { id: 'deck', vis: 'hidden', ordered: true },
    { id: 'hand', vis: 'owner' },
  ];
  if (r.mode === 'deck') zones.push({ id: 'resdeck', vis: 'hidden', ordered: true, hideEmpty: true });
  if (x.leader) zones.push({ id: 'leader', vis: 'public', abilities: true });
  for (const z of UZ) zones.push({ id: z, vis: 'public', abilities: true, ...(z.startsWith('lane') ? { showIf: L(true) } : {}) });
  zones.push({ id: 'support', vis: 'public', abilities: true, hideEmpty: true });
  if (['cards', 'anycard', 'deck'].includes(r.mode)) zones.push({ id: 'resources', vis: 'public' });
  if (x.lifeCards) zones.push({ id: 'life', vis: 'hidden', ordered: true });
  if (x.prizes) zones.push({ id: 'prizes', vis: 'hidden' });
  if (x.hasRole('extra')) zones.push({ id: 'extra', vis: 'owner', hideEmpty: true });
  zones.push({ id: 'limbo', vis: 'public', hideEmpty: true }, { id: 'grave', vis: 'public', ordered: true }, { id: 'void', vis: 'public', offTable: true });

  // ---- setup
  const P0 = '$p';
  const setup: X[] = [['random', { from: ['players'], as: '$f' }], ['firstPlayer', '$f'], SET('game', 'first', seat('$f')),
    EACH(['players'], P0, [
      ['shuffle', P0, 'deck'], ...(r.mode === 'deck' ? [['shuffle', P0, 'resdeck']] : []),
      ...(r.mode === 'ramp' ? [SET(P0, 'cap', r.start - r.perTurn)] : []),
      ['draw', P0, bp.setup.hand],
      ...(bp.setup.mulligan ? [choose({ who: P0, from: L(['Keep', 'Mulligan']), min: 1, max: 1, as: '$mu', prompt: `Keep this hand, or mulligan (shuffle it back and draw ${bp.setup.hand})?` }),
        IF(eq('$mu', 'Mulligan'), [['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, bp.setup.hand]])] : []),
      ...(c.mode === 'duel' ? [EACH(range(4), '$try', [IF(eq(cnt(cards(P0, 'active')), 0), [
        IF(ANY(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), [
          choose({ who: P0, from: flt(cards(P0, 'hand'), eq(g('$it', 'role'), 'unit')), min: 1, max: 1, as: '$ac', prompt: 'Choose your starting active unit' }),
          ['move', '$ac', 'active', { as: '$an' }]],
        [['move', cards(P0, 'hand'), 'deck'], ['shuffle', P0, 'deck'], ['draw', P0, bp.setup.hand]])])])] : []),
      ...(x.lifeCards ? [LET('$ld', first(cards(P0, 'leader'))), ['move', ['top', P0, 'deck', Q(AND(isObj('$ld'), gt(g('$ld', 'life'), 0)), g('$ld', 'life'), bp.win.lifeCards || 5)], 'life']] : []),
      ...(x.prizes ? [['move', ['top', P0, 'deck', bp.win.prizes], 'prizes']] : []),
    ]),
    SET('game', 'started', 1)];

  // ---- turn
  const ME = '$active';
  const untap = EACH(['concat', units(x, ME), cards(ME, 'support'), ...(x.leader ? [cards(ME, 'leader')] : []), ...(zones.some((z) => z.id === 'resources') ? [cards(ME, 'resources')] : [])], '$x', [SET('$x', 'ex', 0)]);
  const resourceStep: X[] = [
    ...(r.mode === 'ramp' ? [SET(ME, 'cap', mn(r.max, add(g(ME, 'cap'), r.perTurn)))] : []),
    ...(r.mode === 'deck' ? [['move', ['top', ME, 'resdeck', Q(AND(eq(g(ME, 'turns'), 1), eq(seat(ME), g('game', 'first'))), r.start, r.perTurn)], 'resources']] : []),
    C('refill', ME)];
  const hold: X[] = c.mode === 'lanes' ? lanes.map((z, i) => IF(AND(eq(g('game', `c${i + 1}`), add(seat(ME), 1)), gt(cnt(cards(ME, z)), 0)), [INC(ME, 'score', 1), emit('hold', { p: ME, z })])) : [];
  const hasResPhase = bp.turn.some((p) => p.kind === 'resource');
  const phases: X[] = bp.turn.map((ph) => {
    switch (ph.kind) {
      case 'ready': return { id: ph.id, auto: true, do: [INC(ME, 'turns', 1), untap, ...hold, ...(hasResPhase ? [] : resourceStep), emit('turnStart', { p: ME })] };
      case 'draw': return { id: ph.id, auto: true, do: [IF(NOT(AND(eq('$turn', 1), L(bp.setup.skipFirstDraw))), [['draw', ME, ph.n ?? 1]])] };
      case 'resource': return { id: ph.id, auto: true, do: resourceStep };
      case 'end': return { id: ph.id, auto: true, do: [emit('turnEnd', { p: ME }),
        ...(c.damage === 'heal' && HP ? [EACH(allUnits(x), '$x', [SET('$x', 'dmg', 0)])] : []),
        IF(gt(cnt(cards(ME, 'hand')), bp.setup.handLimit), [C('discardN', ME, sub(cnt(cards(ME, 'hand')), bp.setup.handLimit))])] };
      case 'custom': return { id: ph.id, auto: true, do: Array.isArray(ph.raw) ? ph.raw : [] };
      default: return { id: ph.id };
    }
  });
  if (!bp.turn.some((p) => p.kind === 'end')) phases.push({ id: 'end', auto: true, do: [emit('turnEnd', { p: ME })] });

  // ---- actions
  const stackish = bp.timing !== 'simple';
  const sp = (speed: number, onStack = false) => (stackish ? { speed, ...(onStack ? {} : { stack: false }) } : {});
  const hand = (pred: X) => flt(cards('$me', 'hand'), AND(pred, C('payable', '$it', '$me')));
  const payCost: X[] = x.pool ? [['pay', '$me', 'mana', def('$self', 'cost')]] : [];
  const Aa: Record<string, any> = {};
  const unitT = types('unit');
  const sumLimit = r.summonsPerTurn > 0 ? { limit: { per: 'turn', n: r.summonsPerTurn, group: 'summon' } } : {};
  const tribCost: X[] = trib.length ? [LET('$tn', C('tribs', '$self')), IF(gt('$tn', 0), [choose({ from: units(x, '$me'), min: '$tn', max: '$tn', as: '$tr', prompt: 'Tribute which units?', required: true }), ['move', '$tr', 'grave']])] : [];
  const summonTo = (asVar: string): X[] => c.mode === 'duel'
    ? [IF(eq(cnt(cards('$me', 'active')), 0), [['move', '$self', 'active', { as: asVar }], SET(asVar, 'newT', '$turn')], [['move', '$self', 'bench', { as: asVar }], SET(asVar, 'newT', '$turn')])]
    : [['move', '$self', UZ[0], { as: asVar }], SET(asVar, 'newT', '$turn')];
  if (unitT.length) {
    const src = hand(AND(inl(g('$it', 'type'), unitT), OR(C('room', '$me'), gt(C('tribs', '$it'), 0)), ge(cnt(units(x, '$me')), C('tribs', '$it'))));
    Aa.summon = { label: c.mode === 'duel' ? 'Play' : 'Summon', phases: x.main, source: src, ...sumLimit, ...sp(1, bp.timing === 'stack'), cost: [...payCost, ...tribCost], do: summonTo('$u') };
    if (c.positions) {
      Aa.setUnit = { label: 'Set face down', phases: x.main, source: src, ...sumLimit, ...sp(1), cost: [...payCost, ...tribCost],
        do: [['move', '$self', UZ[0], { as: '$u', faceDown: true }], SET('$u', 'newT', '$turn'), SET('$u', 'pos', 1)] };
      Aa.position = { label: 'Change position', phases: x.main, source: flt(units(x, '$me'), lt(g('$it', 'newT'), '$turn')), limit: { per: 'turn', by: 'source' }, ...sp(1),
        do: [IF(g('$self', 'faceDown'), [['flip', '$self'], SET('$self', 'pos', 0)], [SET('$self', 'pos', sub(1, g('$self', 'pos')))])] };
    }
  }
  if (x.hasRole('spell')) Aa.cast = { label: 'Cast', phases: x.main, source: hand(inl(g('$it', 'type'), types('spell'))), ...sp(1, true),
    cost: [...payCost, ['move', '$self', 'limbo', { as: '$self' }]], do: [['run', '$self', 'effects'], IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])], countered: [['move', '$self', 'grave']] };
  if (x.hasRole('fast')) Aa.quick = { label: 'Cast (quick)', phases: x.fast, source: hand(inl(g('$it', 'type'), types('fast'))), ...sp(2, true),
    cost: [...payCost, ['move', '$self', 'limbo', { as: '$self' }]], do: [['run', '$self', 'effects'], IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])], countered: [['move', '$self', 'grave']] };
  if (x.hasRole('permanent')) Aa.deploy = { label: 'Play', phases: x.main, source: hand(inl(g('$it', 'type'), types('permanent'))), ...sp(1), cost: payCost, do: [['move', '$self', 'support', { as: '$pm' }], SET('$pm', 'newT', '$turn')] };
  if (x.hasRole('attachment')) Aa.equip = { label: 'Attach', phases: x.main, source: hand(AND(inl(g('$it', 'type'), types('attachment')), gt(cnt(units(x, '$me')), 0))), ...sp(1),
    targets: [{ as: '$b', from: units(x, '$me'), prompt: 'Attach to which unit?' }], cost: payCost,
    do: [['move', '$self', 'support', { as: '$at' }], ['link', '$at', 'bearer', '$b'], SET('$at', 'att', 1)] };
  if (x.hasRole('trap')) {
    Aa.setTrap = { label: 'Set', phases: x.main, source: hand(inl(g('$it', 'type'), types('trap'))), ...sp(1), cost: payCost, do: [['move', '$self', 'support', { as: '$tp', faceDown: true }], SET('$tp', 'newT', '$turn')] };
    Aa.spring = { label: 'Spring', phases: x.fast, ...sp(2, true),
      source: flt(cards('$me', 'support'), AND(eq(g('$it', 'role'), 'trap'), g('$it', 'faceDown'), lt(g('$it', 'newT'), '$turn'),
        OR(ne(g('$it', 'trapOn'), 'opAttack'), AND(gt(g('game', 'bat'), 0), ne(g('game', 'bat'), add(seat('$me'), 1)))))),
      cost: [['flip', '$self'], ['move', '$self', 'limbo', { as: '$self' }]], do: [['run', '$self', 'effects'], IF(eq(g('$self', 'zone'), 'limbo'), [['move', '$self', 'grave']])], countered: [['move', '$self', 'grave']] };
  }
  if (x.hasRole('evolution')) {
    const base = (o: X) => flt(units(x, '$me'), AND(eq(g('$it', 'name'), def(o, 'evolvesFrom')), lt(g('$it', 'newT'), '$turn')));
    Aa.evolve = { label: 'Evolve', phases: x.main, source: hand(AND(eq(g('$it', 'role'), 'evolution'), gt(cnt(base('$it')), 0))), ...sp(1),
      targets: [{ as: '$b', from: base('$self'), prompt: 'Evolve which unit?' }], cost: payCost,
      do: [LET('$atts', ['linked', '$b', 'bearer']), LET('$d', g('$b', 'dmg')), ...UZ.map((z) => IF(eq(g('$b', 'zone'), z), [
        ['move', '$self', z, { as: '$ev' }], SET('$ev', 'dmg', '$d'), SET('$ev', 'newT', '$turn'), IF(gt(cnt('$atts'), 0), [['link', '$atts', 'bearer', '$ev']]), ['move', '$b', 'grave']]))] };
  }
  if (x.hasRole('extra')) Aa.fuse = { label: 'Summon from extra deck', phases: x.main, ...sp(1),
    source: flt(cards('$me', 'extra'), AND(ge(cnt(units(x, '$me')), mx(1, def('$it', 'materials'))), C('payable', '$it', '$me'))),
    cost: [...payCost, choose({ from: units(x, '$me'), min: mx(1, def('$self', 'materials')), max: mx(1, def('$self', 'materials')), as: '$ms', prompt: 'Which units become the materials?', required: true }), ['move', '$ms', 'grave']],
    do: summonTo('$fx') };
  if (r.mode === 'cards' && x.hasRole('resource')) Aa.resource = { label: `Play ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: flt(cards('$me', 'hand'), eq(g('$it', 'role'), 'resource')), do: [['move', '$self', 'resources', { as: '$rs' }], C('gainRes', '$me', g('$rs', 'res'), 1)] };
  if (r.mode === 'anycard') Aa.resource = { label: `Place as ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: cards('$me', 'hand'), do: [['move', '$self', 'resources', { as: '$rs' }], C('gainRes', '$me', g('$rs', 'res'), 1)] };
  if (r.mode === 'attach' && x.hasRole('resource')) Aa.energy = { label: `Attach ${r.name}`, phases: x.main, limit: { per: 'turn', group: 'res' }, ...sp(1),
    source: flt(cards('$me', 'hand'), AND(eq(g('$it', 'role'), 'resource'), gt(cnt(units(x, '$me')), 0))),
    targets: [{ as: '$b', from: units(x, '$me'), prompt: `Attach ${r.name} to which unit?` }],
    do: [['move', '$self', 'support', { as: '$en' }], ['link', '$en', 'bearer', '$b'], SET('$en', 'att', 1)] };
  if (r.boost > 0 && x.pool) Aa.boost = { label: `Spend 1 ${r.name}: +${r.boost} ${bp.stats.find((s) => s.id === POW)?.name ?? POW}`, phases: x.fast, ...sp(2),
    source: flt(['concat', units(x, '$me'), ...(x.leader ? [cards('$me', 'leader')] : [])], ['canPay', '$me', 'mana', 1]),
    cost: [['pay', '$me', 'mana', 1]], do: [['modify', '$self', { layer: 'add', mods: [{ op: 'add', stat: POW, value: r.boost }], until: 'turn' }]] };
  if (c.counterStep && x.battle && bp.stats.some((s) => s.id === 'counter')) Aa.counterCard = { label: 'Counter', phases: ['respond'], ...sp(2),
    source: flt(cards('$me', 'hand'), AND(gt(def('$it', 'counter'), 0), eq('$win.defender', '$me'))),
    do: [['move', '$self', 'grave'], LET('$ct', Q(isP(T), first(cards('$me', 'leader')), T)),
      IF(isObj('$ct'), [['modify', '$ct', { layer: 'add', mods: [{ op: 'add', stat: POW, value: def('$self', 'counter') }], until: 'turn' }]])] };
  if (bp.cards.some((k) => k.abilities.some((a) => a.when === 'activated'))) Aa.act = { label: 'Use', phases: x.main, activated: 'acts', ...sp(1, true),
    source: ['concat', units(x, '$me'), cards('$me', 'support'), ...(x.leader ? [cards('$me', 'leader')] : [])], do: [] };

  // attacks
  if (x.battle) {
    const attackers = ['concat', units(x, '$me'), ...(x.leader && c.leaderAttacks ? [cards('$me', 'leader')] : [])];
    const base: Record<string, any> = { label: 'Attack', phases: x.atkPhases, limit: { per: 'turn', by: 'source' }, ...sp(1), source: flt(attackers, C('canAtk', '$it')) };
    if (c.mode === 'block') {
      Aa.attack = { ...base, do: [['openWindow', 'battle', { data: { attacker: '$self', target: '$opp', defender: '$opp', blocker: 0 } }], SET('game', 'bat', 0)] };
    } else {
      const ou = units(x, '$opp');
      const hitable = c.targetUnits === 'any' ? ou : c.targetUnits === 'exhausted' ? flt(ou, eq(g('$it', 'ex'), 1)) : L([]);
      const face = x.leader ? cards('$opp', 'leader') : ['list', '$opp'];
      const open = c.directOnlyIfEmpty ? Q(gt(cnt(ou), 0), hitable, face) : ['concat', face, hitable];
      const from = Q(ANY(ou, has('$it', 'guard')), flt(ou, has('$it', 'guard')), open);
      Aa.attack = { ...base, targets: [{ as: '$t', from, prompt: 'Attack what?' }],
        do: [['openWindow', 'battle', { data: { attacker: '$self', target: '$t', defender: '$opp', blocker: 0 } }], SET('game', 'bat', 0)] };
    }
  }
  if (c.mode === 'duel') {
    Aa.useMove = { label: 'Attack', phases: x.atkPhases, activated: 'moves', ...sp(1), source: flt(cards('$me', 'active'), c.firstTurnAttack ? L(true) : ne('$turn', 1)), do: [] };
    Aa.retreat = { label: 'Retreat', phases: x.main, limit: { per: 'turn' }, ...sp(1),
      source: flt(cards('$me', 'active'), AND(ge(cnt(C('energy', '$it')), def('$it', 'retreat')), gt(cnt(cards('$me', 'bench')), 0))),
      targets: [{ as: '$b', from: cards('$me', 'bench'), prompt: 'Swap in which benched unit?' }],
      do: [EACH(['slice', C('energy', '$self'), 0, def('$self', 'retreat')], '$e', [['move', '$e', 'grave']]), C('moveKeep', '$self', 'bench'), C('moveKeep', '$b', 'active')] };
  }
  if (c.mode === 'lanes') {
    Aa.march = { label: 'Move', phases: x.atkPhases, ...sp(1), source: flt(units(x, '$me'), C('canAtk', '$it')),
      do: [choose({ from: L([...c.lanes, 'Base']), min: 1, max: 1, as: '$l', prompt: 'Move to which battlefield?' }),
        ...lanes.map((z, i) => IF(AND(eq('$l', c.lanes[i]), ne(g('$self', 'zone'), z)), [SET('$self', 'ex', 1), C('moveKeep', '$self', z), C('showdown', z, '$me')])),
        IF(AND(eq('$l', 'Base'), ne(g('$self', 'zone'), 'base')), [SET('$self', 'ex', 1), C('moveKeep', '$self', 'base')])] };
  }

  // ---- triggers, state checks, replacements
  const triggers: X[] = [];
  if (bp.win.deckOut) triggers.push({ on: 'drawFail', do: [['lose', '$e.player']] });
  triggers.push({ on: 'moved', if: AND(eq(def('$e.card', 'role'), 'token'), NOT(inl('$e.to', UZ)), ne('$e.to', 'void')), do: [IF(isObj('$e.newObj'), [['move', '$e.newObj', 'void']])] });
  const unitDied = AND(inl('$e.from', UZ), inl(def('$e.card', 'role'), UNIT_ROLES));
  if (x.prizes) triggers.push({ on: 'destroyed', if: unitDied, do: [LET('$tk', ['opp', '$e.controller']), IF(gt(cnt(cards('$tk', 'prizes')), 0), [['move', ['top', '$tk', 'prizes', 1], 'hand'], emit('prize', { p: '$tk' })])] });
  if (c.mode === 'duel') triggers.push({ on: 'destroyed', if: AND(eq('$e.from', 'active'), gt(cnt(cards('$e.controller', 'bench')), 0)), do: [
    choose({ who: '$e.controller', from: cards('$e.controller', 'bench'), min: 1, max: 1, as: '$pr', prompt: 'Promote which benched unit to active?' }), C('moveKeep', '$pr', 'active')] });
  if (c.mode === 'lanes') triggers.push({ on: 'showdown', do: lanes.map((z, i) => IF(eq('$e.z', z), [LET('$m', cnt(cards('$e.p', z))), LET('$o', cnt(cards(['opp', '$e.p'], z))),
    IF(AND(gt('$m', 0), eq('$o', 0), ne(g('game', `c${i + 1}`), add(seat('$e.p'), 1))), [SET('game', `c${i + 1}`, add(seat('$e.p'), 1)), INC('$e.p', 'score', 1), emit('conquer', { p: '$e.p', z })]),
    IF(AND(eq('$m', 0), gt('$o', 0)), [SET('game', `c${i + 1}`, add(seat(['opp', '$e.p']), 1))])])) });
  const checks: X[] = [];
  if (HP) checks.push(EACH(flt(allUnits(x), AND(gt(g('$it', HP), 0), ge(g('$it', 'dmg'), g('$it', HP)))), '$u', [['destroy', '$u']]));
  checks.push(EACH(flt(cards('*', 'support'), AND(eq(g('$it', 'att'), 1), NOT(isObj(g('$it', 'bearer'))))), '$a', [['move', '$a', 'grave']]));
  if (x.life) checks.push(EACH(['players'], '$p', [IF(le(g('$p', 'life'), 0), [['lose', '$p']])]));
  const pts = bp.win.points || (c.mode === 'lanes' ? 8 : 0);
  if (pts) checks.push(EACH(['players'], '$p', [IF(ge(g('$p', 'score'), pts), [['win', '$p']])]));
  if (x.prizes) checks.push(IF(eq(g('game', 'started'), 1), [EACH(['players'], '$p', [IF(eq(cnt(cards('$p', 'prizes')), 0), [['win', '$p']])])]));
  if (bp.win.noUnits) checks.push(IF(eq(g('game', 'started'), 1), [EACH(['players'], '$p', [IF(eq(cnt(units(x, '$p')), 0), [['lose', '$p']])])]));
  const replacements: X[] = [
    { replace: 'damage', text: 'Shield', if: AND(isObj('$e.target'), has('$e.target', 'shield'), eq(g('$e.target', 'shu'), 0)), instead: [SET('$e.target', 'shu', 1)] },
    { replace: 'destroy', text: 'Shield', if: AND(has('$e.obj', 'shield'), eq(g('$e.obj', 'shu'), 0), inl(g('$e.obj', 'zone'), UZ)), instead: [SET('$e.obj', 'shu', 1), SET('$e.obj', 'dmg', 0)] },
  ];

  // ---- windows and timing
  const respond: Record<string, any> = { id: 'respond', ...(stackish ? {} : { timing: { mode: 'alternate', first: '$win.defender' } }) };
  const windows = x.battle ? { battle: { steps: [{ id: 'declare', auto: true, do: [C('declare')] }, { id: 'block', auto: true, do: [C('block')] }, respond, { id: 'damage', auto: true, do: [C('battle')] }] } } : undefined;

  const statIds = bp.stats.map((s) => s.id).filter((s) => s !== 'cost');
  const rules: Record<string, any> = {
    players: { min: 2, max: 2 },
    playerVars: { life: bp.win.life, score: 0, cap: 0, turns: 0 },
    objectVars: { dmg: 0, ex: 0, newT: 0, pos: 0, shu: 0, att: 0 },
    gameVars: { first: 0, started: 0, bat: 0, rem: 0, ...Object.fromEntries(lanes.map((_, i) => [`c${i + 1}`, 0])) },
    zones,
    deckZone: 'deck', handZone: 'hand', graveZone: 'grave',
    format: {
      deckMin: bp.setup.deckMin, deckMax: bp.setup.deckMax, maxCopies: bp.setup.maxCopies,
      ...((x.leader || x.hasRole('extra') || r.mode === 'deck') ? { zones: [
        { zone: 'deck', min: bp.setup.deckMin, max: bp.setup.deckMax, types: bp.types.filter((t) => !['leader', 'extra', 'token'].includes(t.role) && !(r.mode === 'deck' && t.role === 'resource')).map((t) => t.id) },
        ...(x.leader ? [{ zone: 'leader', min: 1, max: 1, types: types('leader') }] : []),
        ...(x.hasRole('extra') ? [{ zone: 'extra', min: 0, max: bp.setup.extraMax, types: types('extra') }] : []),
        ...(r.mode === 'deck' ? [{ zone: 'resdeck', min: r.deckSize, max: r.deckSize, types: types('resource'), maxCopies: r.deckSize }] : []),
      ] } : {}),
    },
    turnLimit: bp.setup.turnLimit,
    stats: statIds, layers: ['set', 'add'],
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
    const sections = x.leader || x.hasRole('extra') || r.mode === 'deck';
    decks[d.id] = sections ? { deck: list(d.main), ...(x.leader ? { leader: d.leader ? [d.leader] : [] } : {}), ...(x.hasRole('extra') ? { extra: list(d.extra) } : {}), ...(r.mode === 'deck' ? { resdeck: list(d.res) } : {}) } : list(d.main);
  }
  const templates: Record<string, any> = {};
  const byType: Record<string, string> = {};
  for (const t of bp.types) {
    const f = t.frame;
    templates[`mk-${t.id}`] = { base: f.base, layout: f.layout ?? 'portrait', cost: f.cost, stats: f.stats.map((s) => ({ field: s.stat, pos: s.pos, ...(s.icon ? { icon: s.icon } : {}), ...(s.label ? { label: s.label } : {}) })), ...(f.level ? { level: f.level } : {}), text: f.text, label: t.name, art: f.art };
    byType[t.id] = `mk-${t.id}`;
  }
  const labels: Record<string, string> = { ...Object.fromEntries(bp.types.map((t) => [t.id, t.name])), ...Object.fromEntries(bp.stats.map((s) => [s.id, s.name])),
    ...Object.fromEntries(bp.keywords.map((k) => [k.rule !== 'none' ? k.rule : k.id, k.name])),
    life: x.lifeCards && !x.life ? 'Life cards' : 'Life', score: 'Points', dmg: 'damage', field: 'Board', support: 'Support', resources: bp.resource.name, resdeck: `${bp.resource.name} deck`,
    leader: 'Leader', prizes: 'Prizes', extra: 'Extra deck', active: 'Active', bench: 'Bench', base: 'Base', limbo: 'Resolving', grave: 'Discard', ...Object.fromEntries(lanes.map((z, i) => [z, c.lanes[i]])),
    ...bp.zoneNames };
  for (const k of bp.colors) labels[`mana:${k.id}`] = k.name;
  labels['mana:c'] = bp.resource.name;
  const manifest = {
    moduleId: bp.id, displayName: bp.name, semanticVersion: '1.0.0', engineApiRange: `^${ENGINE_API}`,
    licensing: `Made with the Universal Card Battles Game Maker${bp.author ? ` by ${bp.author}` : ''}.`,
    tagline: bp.tagline,
    theme: { accent: bp.look.accent, accent2: bp.look.accent2, glyph: bp.look.glyph, tapVar: 'ex', labels,
      hideStats: ['role', 'res', 'trapOn', 'evolvesFrom', 'materials', 'retreat', 'hue', 'glyph', ...(c.mode === 'duel' ? [] : ['weakness'])],
      hideVars: ['ex', 'newT', 'pos', 'shu', 'att', 'cap', 'turns', 'first', 'started', 'bat', 'rem', ...(x.points ? [] : ['score']), ...(x.life ? [] : ['life'])],
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
  const val = add(20, ['/', mul(C('pw', '$it'), 10), scale], ...(HP ? [['/', mul(sub(g('$it', HP), g('$it', 'dmg')), 10), Math.ceil(hpScale)]] : []), ...(c.mode === 'duel' ? [mul(6, cnt(C('energy', '$it')))] : []));
  const side = (p: string): X => add(
    SUM(units(x, p), val), mul(6, cnt(cards(p, 'hand'))),
    ...(x.life ? [['/', mul(g(p, 'life'), 300), Math.max(1, bp.win.life)]] : []),
    ...(x.lifeCards ? [mul(60, cnt(cards(p, 'life')))] : []),
    ...(x.prizes ? [mul(-90, cnt(cards(p, 'prizes')))] : []),
    ...(x.points ? [mul(120, g(p, 'score'))] : []),
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
