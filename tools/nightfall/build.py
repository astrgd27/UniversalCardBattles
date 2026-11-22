#!/usr/bin/env python3
"""Builds the NIGHTFALL module (packages/reference-games/nightfall) from this script.

NIGHTFALL: The City Will Fall, the design by @Astral (Game Design Document v0.1). Run:
    python3 tools/nightfall/build.py && npm run -s validate packages/reference-games/nightfall
Rules live in RULES (functions/procedures), cards in CARDS. Everything is plain DSL data; see docs/DSL.md.
"""
import json, os

# Balance levers, tuned by AI-vs-AI playtests (tools/nightfall/playtest.ts; see docs/NIGHTFALL.md "Balance").
# NF_<NAME>=value overrides any of them for an experiment; NF_OUT=<dir> writes the module there instead.
LEVERS = {
    # income: resource gained at Gather (Cabal also gains 1 per Thrall) and extra cards at Draw
    'GATHER_CABAL': 1, 'GATHER_HARVEST': 3, 'GATHER_ZOMBIE': 0, 'GATHER_SLASHER': 3, 'GATHER_DEVIL': 2,
    'DRAW_SLASHER': 1, 'DRAW_DEVIL': 1, 'DRAW_HARVEST': 0, 'CABAL_PREY': 2, 'SHAMBLER_RES': 1,
    # Strikes: at most this many per district per turn, each dealing at most STRIKE_DAMAGE (0 = full Menace)
    'STRIKE_PER_DISTRICT': 1, 'STRIKE_DAMAGE': 2,
    # Blood Cabal: Domination also needs one of your Vampires in the district
    'DOM_VAMPIRE': 1,
    # Zombie Horde: Shamblers are mindless (no Prey, no Strike); Spread infects one chosen district per Rise
    'SHAMBLER_PREY': 0, 'SHAMBLER_STRIKE': 0, 'SHAMBLER_DOMINION': 1, 'SPREAD_ONCE': 1, 'SPREAD_MIN': 3, 'OVERRUN_RATIO': 2,
    'SACRIFICE_IS_DEATH': 0,
    # Slasher Killers
    # The Final Act: at FINAL_ACT Victims the Killers and Old Hollow are empowered (BODYCOUNT_WIN > 0 restores the old instant win)
    'BODYCOUNT_WIN': 0, 'FINAL_ACT': 11, 'FA_BUFF': 2, 'LURKS': 1,
    # Harvest Cult
    'AWAKEN': 6,
    # Devil's Own: Gestation starts at GEST_START and gains GESTATION_RISE at each Rise with a Vessel
    'GEST_START': 0, 'GESTATION_RISE': 2, 'VESSEL_HALVES': 1,
}
for k in LEVERS:
    if os.environ.get('NF_' + k) is not None: LEVERS[k] = int(os.environ['NF_' + k])
BC, AW, FA = LEVERS['BODYCOUNT_WIN'], LEVERS['AWAKEN'], LEVERS['FINAL_ACT']
FA_TEXT = (f"The Final Act: when your Body Count reaches {FA}, your Killers get +{LEVERS['FA_BUFF']}/+{LEVERS['FA_BUFF']}, Strike for their full Menace and can't be Ended, "
           "destroyed Killers return at your next Rise, and at your Toll each revealed Killer Slays a Citizen in its district. Strikes against you deal at most 1.")
OUT = os.environ.get('NF_OUT') or os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'reference-games', 'nightfall')

# ---------------------------------------------------------------- DSL helpers
def lit(x): return ['lit', x]
def g(o, k): return ['get', o, k]
def C(f, *a): return ['call', f, *a]
def eq(a, b): return ['=', a, b]
def ne(a, b): return ['!=', a, b]
def AND(*a): return ['and', *a]
def OR(*a): return ['or', *a]
def NOT(a): return ['not', a]
def IF(c, t, e=None): return ['if', c, t] + ([e] if e is not None else [])
def Q(c, a, b): return ['?', c, a, b]
def has(o, k): return ['has', o, k]
def flt(l, p): return ['filter', l, p]
def cnt(l): return ['count', l]
def inl(x, l): return ['in', x, l]
def ANY(l, p): return ['any', l, p]
def SUM(l, e): return ['sum', l, e]
def add(*a): return ['+', *a]
def sub(a, b): return ['-', a, b]
def ge(a, b): return ['>=', a, b]
def gt(a, b): return ['>', a, b]
def lt(a, b): return ['<', a, b]
def le(a, b): return ['<=', a, b]
def EACH(l, v, body): return ['each', l, v, body]
def LET(v, e): return ['let', v, e]
def choose(frm, as_, prompt, mn=1, mx=1, who=None):
    o = {'from': frm, 'as': as_, 'prompt': prompt, 'min': mn, 'max': mx}
    if who: o['who'] = who
    return ['choose', o]
def emit(t, **d): return ['emit', t, d]

UNITS = lit(['horror', 'hunter', 'puppet', 'folk', 'disciple', 'killer', 'oldone', 'child'])
STRUCTS = lit(['influence', 'effigy'])
EVENTISH = lit(['event', 'scheme', 'rite', 'outbreak', 'scene', 'bargain'])
ALLU = ['cards', '*', 'units']
CITY = ['cards', 'p0', 'city']
HOUR = g('game', 'hour')
RES = {'1': 'vitae', '2': 'bounty', '3': 'biomass', '4': 'terror', '5': 'sin'}
SEQ = {'the-groundskeeper': 'sqA', 'mister-lullaby': 'sqB', 'the-hook-handed-man': 'sqC', 'the-caller': 'sqD'}

def fac(p): return g(p, 'faction')
def isF(p, n): return eq(fac(p), n)
def res(p): return C('res', p)
def addRes(p, n): return C('addRes', p, n)
def cit(x): return g(C('dAt', x), 'cit')
def mine(o): return eq(g(o, 'controller'), '$me')

# ---------------------------------------------------------------- functions
F = {}
def fn(name, params, body): F[name] = {'params': params, 'body': body}

fn('rn', ['$p'], ['at', lit(RES), fac('$p')])
fn('res', ['$p'], ['get', '$p', C('rn', '$p')])
fn('side', ['$p'], Q(eq(g('$p', 'seat'), 0), 2, 0))
fn('s1', ['$p'], add(g('$p', 'seat'), 1))
fn('dAt', ['$x'], ['first', flt(CITY, eq(g('$it', 'x'), '$x'))])
fn('dkey', ['$x'], g(C('dAt', '$x'), 'key'))
fn('living', ['$x'], eq(g(C('dAt', '$x'), 'claim'), 0))
fn('livingIs', ['$x', '$k'], AND(C('living', '$x'), eq(C('dkey', '$x'), '$k')))
fn('fallenFor', ['$x', '$k', '$p'], AND(eq(g(C('dAt', '$x'), 'claim'), C('s1', '$p')), eq(C('dkey', '$x'), '$k')))
fn('claims', ['$p', '$k'], ANY(CITY, AND(eq(g('$it', 'key'), '$k'), eq(g('$it', 'claim'), C('s1', '$p')))))
fn('face', ['$o'], NOT(g('$o', 'faceDown')))
fn('isUnit', ['$o'], AND(C('face', '$o'), inl(g('$o', 'type'), UNITS)))
fn('isStruct', ['$o'], AND(C('face', '$o'), inl(g('$o', 'type'), STRUCTS)))
fn('unitsAt', ['$x'], flt(ALLU, AND(C('isUnit', '$it'), eq(g('$it', 'x'), '$x'))))
fn('mineAt', ['$x', '$p'], flt(C('unitsAt', '$x'), eq(g('$it', 'controller'), '$p')))
fn('enemyAt', ['$x', '$p'], flt(C('unitsAt', '$x'), ne(g('$it', 'controller'), '$p')))
fn('structsAt', ['$x', '$p'], flt(ALLU, AND(C('isStruct', '$it'), eq(g('$it', 'x'), '$x'), eq(g('$it', 'controller'), '$p'))))
fn('lurkersAt', ['$x', '$p'], flt(['cards', '$p', 'units'], AND(g('$it', 'faceDown'), eq(g('$it', 'x'), '$x'))))
fn('inPlay', ['$p', '$id'], ANY(['concat', ['cards', '$p', 'units'], ['cards', '$p', 'labs'], ['cards', '$p', 'gear'], ['cards', '$p', 'lair']],
                                 AND(eq(g('$it', 'card'), '$id'), C('face', '$it'))))
fn('gearOn', ['$o'], flt(['cards', '*', 'gear'], eq(g('$it', 'on'), '$o')))
fn('seq', ['$o'], g(g('$o', 'controller'), ['at', lit(SEQ), g('$o', 'card')]))
fn('menace', ['$o'], ['max', 0, add(
    g('$o', 'menace'), g('$o', 'plus'), ['*', 2, g('$o', 'amb')], C('seq', '$o'), SUM(C('gearOn', '$o'), g('$it', 'gm')),
    Q(AND(eq(HOUR, 4), eq(g('$o', 'type'), 'horror')), 1, 0),
    Q(AND(eq(HOUR, 9), has('$o', 'vampire')), -1, 0),
    Q(AND(has('$o', 'vampire'), ANY(C('structsAt', g('$o', 'x'), g('$o', 'controller')), eq(g('$it', 'card'), 'the-velvet-club'))), 1, 0),
    Q(AND(has('$o', 'folk'), ANY(C('structsAt', g('$o', 'x'), g('$o', 'controller')), eq(g('$it', 'card'), 'the-standing-stone'))), 1, 0),
    Q(AND(has('$o', 'shambler'), C('inPlay', g('$o', 'controller'), 'lazarus-7')), 1, 0),
    Q(AND(has('$o', 'mortal'), ANY(C('enemyAt', g('$o', 'x'), g('$o', 'controller')), eq(g('$it', 'card'), 'countess-ilse-varga'))), -1, 0),
    Q(AND(eq(g('$o', 'type'), 'hunter'), ANY(C('unitsAt', g('$o', 'x')), eq(g('$it', 'card'), 'the-possessed-girl'))), -2, 0),
    Q(AND(OR(has('$o', 'demon'), has('$o', 'possessed')), ANY(C('unitsAt', g('$o', 'x')), eq(g('$it', 'card'), 'father-moreno'))), -2, 0),
    Q(C('livingIs', g('$o', 'x'), 'cathedral'), Q(eq(g('$o', 'type'), 'hunter'), 1, Q(has('$o', 'demon'), -1, 0)), 0),
    Q(AND(eq(g('$o', 'card'), 'hollow-eyed-farmhand'), eq(g(g('$o', 'controller'), 'season'), 3)), 1, 0),
    Q(C('finalKiller', '$o'), LEVERS['FA_BUFF'], 0))])
fn('finalKiller', ['$o'], AND(eq(g('$o', 'type'), 'killer'), eq(g(g('$o', 'controller'), 'finalAct'), 1)))
fn('endur', ['$o'], add(
    g('$o', 'endurance'), g('$o', 'plus'), SUM(C('gearOn', '$o'), g('$it', 'ge')), Q(C('finalKiller', '$o'), LEVERS['FA_BUFF'], 0),
    Q(AND(C('isUnit', '$o'), C('livingIs', g('$o', 'x'), 'oldtown')), 1, 0),
    Q(AND(has('$o', 'folk'), ANY(C('structsAt', g('$o', 'x'), g('$o', 'controller')), eq(g('$it', 'card'), 'the-standing-stone'))), 1, 0),
    Q(AND(eq(g('$o', 'type'), 'hunter'), C('livingIs', g('$o', 'x'), 'cathedral')), 1, 0),
    Q(AND(eq(g('$o', 'card'), 'something-in-the-stalks'), eq(g(g('$o', 'controller'), 'season'), 2)), 2, 0),
    Q(AND(eq(g('$o', 'type'), 'effigy'), isF(g('$o', 'controller'), 2)), 2, 0)))
# Menace in a Clash against $b ($i = 1 when $a is intercepting).
fn('mvs', ['$a', '$b', '$i'], add(C('menace', '$a'),
    Q(AND(eq(g('$a', 'card'), 'the-hook-handed-man'), has('$b', 'mortal')), 2, 0),
    Q(AND(has('$b', 'mortal'), C('fallenFor', g('$a', 'x'), 'campground', g('$a', 'controller'))), 1, 0),
    Q(AND(eq(g('$a', 'card'), 'hellhound'), eq('$i', 1)), 1, 0)))
fn('guardOf', ['$o'], AND(C('isUnit', '$o'), eq(g('$o', 'ex'), 0), OR(
    has('$o', 'guard'), ANY(C('gearOn', '$o'), eq(g('$it', 'gg'), 1)),
    C('fallenFor', g('$o', 'x'), 'maple', g('$o', 'controller')),
    AND(OR(has('$o', 'disciple'), has('$o', 'demon')), ANY(C('mineAt', g('$o', 'x'), g('$o', 'controller')), eq(g('$it', 'card'), 'the-child'))))))
fn('guarded', ['$x', '$p'], ANY(C('enemyAt', '$x', '$p'), C('guardOf', '$it')))
# Guard holds a unit back until that unit has Clashed with a Guard this turn.
fn('guardedFor', ['$u'], AND(ne(g('$u', 'gcl'), '$turn'), C('guarded', g('$u', 'x'), g('$u', 'controller'))))
fn('readyEnemy', ['$x', '$p'], ANY(C('enemyAt', '$x', '$p'), eq(g('$it', 'ex'), 0)))
fn('dominion', ['$x', '$p'], add(SUM(C('mineAt', '$x', '$p'), (add(C('menace', '$it'), g('$it', 'dominion')) if LEVERS['SHAMBLER_DOMINION'] else Q(has('$it', 'shambler'), 0, add(C('menace', '$it'), g('$it', 'dominion'))))), SUM(C('structsAt', '$x', '$p'), g('$it', 'dominion'))))
fn('influence', ['$x', '$p'], ['*', Q(C('livingIs', '$x', 'financial'), 2, 1),
    add(SUM(C('structsAt', '$x', '$p'), g('$it', 'inf')), SUM(C('mineAt', '$x', '$p'), g('$it', 'inf')))])
fn('adj', ['$a', '$b'], AND(ne('$a', '$b'), OR(eq(['abs', sub('$a', '$b')], 1), eq(C('dkey', '$a'), 'subway'), eq(C('dkey', '$b'), 'subway'))))
fn('adjD', ['$x'], flt(CITY, C('adj', '$x', g('$it', 'x'))))
fn('vessel', ['$p'], ['first', flt(['cards', '$p', 'units'], AND(C('isUnit', '$it'), has('$it', 'vessel')))])
fn('master', ['$p'], ['first', ['cards', '$p', 'lair']])
fn('cost', ['$c', '$p'], Q(
    AND(eq(g('$c', 'type'), 'planting'), eq(g('$p', 'season'), 1), eq(g('$p', 'plantPlayed'), 0)), 0,
    ['max', 0, sub(g('$c', 'cost'), add(
        Q(AND(eq(g('$c', 'type'), 'influence'), eq(g('$p', 'infPlayed'), 0)), 1, 0),
        Q(AND(eq(g('$c', 'type'), 'rite'), C('inPlay', '$p', 'sheaf-masked-elder')), 1, 0),
        Q(AND(eq(g('$c', 'type'), 'omen'), C('inPlay', '$p', 'the-black-priest')), 1, 0),
        Q(AND(eq(g('$c', 'type'), 'bargain'), isF('$p', 5)), 1, 0),
        Q(AND(inl(g('$c', 'type'), lit(['rite', 'omen'])), C('claims', '$p', 'cathedral')), 1, 0),
        Q(eq(g('$c', 'card'), 'the-amalgam'), cnt(flt(['cards', '$p', 'units'], AND(C('isUnit', '$it'), has('$it', 'shambler')))), 0)))]))
fn('canPay', ['$c', '$p'], AND(ge(C('res', '$p'), C('cost', '$c', '$p')), ge(g('$p', 'souls'), g('$c', 'souls'))))
fn('uniqueOk', ['$c', '$p'], OR(NOT(has('$c', 'unique')), NOT(ANY(['concat', ['cards', '$p', 'units'], ['cards', '$p', 'gear']], eq(g('$it', 'card'), g('$c', 'card'))))))
fn('canHunt', ['$u'], AND(C('isUnit', '$u'), mine('$u'), eq(g('$u', 'ex'), 0), OR(eq(g('$u', 'fresh'), 0), has('$u', 'swift')), NOT(has('$u', 'nohunt'))))
fn('canPrey', ['$u'], AND(gt(cit(g('$u', 'x')), 0), NOT(C('guardedFor', '$u')), *([] if LEVERS['SHAMBLER_PREY'] else [NOT(has('$u', 'shambler'))]), OR(
    AND(C('canHunt', '$u'), OR(inl(g('$u', 'type'), lit(['horror', 'killer', 'oldone'])),
        AND(has('$u', 'folk'), OR(eq(g('$me', 'season'), 3), eq(g('$u', 'mayPrey'), 1))))),
    AND(C('isUnit', '$u'), mine('$u'), eq(g('$u', 'xprey'), 1)),
    AND(g('$u', 'faceDown'), mine('$u'), eq(g('$u', 'type'), 'killer'), eq(g('$u', 'ex'), 0), eq(g('$u', 'fresh'), 0),
        ANY(C('gearOn', '$u'), eq(g('$it', 'card'), 'garden-shears'))))))
fn('canIntercept', ['$p', '$x'], OR(
    ANY(C('mineAt', '$x', '$p'), AND(eq(g('$it', 'ex'), 0), eq(['uses', 'act:intercept', 'turn', '$it'], 0), NOT(has('$it', 'nohunt')))),
    AND(ANY(C('mineAt', '$x', '$p'), has('$it', 'vessel')),
        ANY(['cards', '$p', 'units'], AND(eq(g('$it', 'card'), 'the-governess'), C('isUnit', '$it'), eq(g('$it', 'ex'), 0))))))
fn('respWho', ['$k', '$d', '$x'], Q(OR(isF('$d', 1), AND(inl('$k', lit(['prey', 'raid'])), C('canIntercept', '$d', '$x'))), ['list', '$d'], lit([])))
fn('evOk', ['$u', '$c'], NOT(AND(inl(g('$c', 'type'), lit(['event'])), OR(has('$u', 'aloof'),
    C('fallenFor', g('$u', 'x'), 'oldtown', g('$u', 'controller'))))))
fn('hostOk', ['$c', '$h'], Q(eq(g('$c', 'type'), 'mutation'), AND(C('isUnit', '$h'), mine('$h'), has('$h', 'zombie')),
    Q(eq(g('$c', 'type'), 'weapon'), AND(mine('$h'), eq(g('$h', 'type'), 'killer'), eq(g('$h', 'zone'), 'units')),
    Q(eq(g('$c', 'card'), 'silver-etched-revolver'), AND(C('isUnit', '$h'), mine('$h'), eq(g('$h', 'type'), 'hunter')),
    Q(eq(g('$c', 'card'), 'the-black-grimoire'), AND(mine('$h'), eq(g('$h', 'type'), 'master')),
    Q(eq(g('$c', 'card'), 'unclean-spirit'), AND(C('isUnit', '$h'), NOT(mine('$h')), has('$h', 'mortal')),
      AND(C('isUnit', '$h'), NOT(mine('$h')), eq(g('$h', 'type'), 'horror'), le(g('$h', 'cost'), 4), NOT(has('$h', 'aloof')))))))))
fn('silver', ['$s'], AND(['isObj', '$s'], ANY(C('gearOn', '$s'), eq(g('$it', 'card'), 'silver-etched-revolver'))))
fn('trophyScore', ['$p'], add(['*', 30, g('$p', 'claims')], g('$p', 'essence'), ['*', 2, g('$p', 'trophies')],
    SUM(flt(['cards', '$p', 'units'], C('isUnit', '$it')), add(C('menace', '$it'), ['/', C('endur', '$it'), 2])),
    SUM(flt(['cards', '$p', 'units'], C('isStruct', '$it')), add(2, g('$it', 'dominion'), g('$it', 'inf'))),
    ['*', 3, g('$p', 'bodycount')], ['*', 15, g('$p', 'finalAct')], ['*', 4, g('$p', 'gestation')], ['*', 2, g('$p', 'barrow')], g('$p', 'thralls'), ['/', C('res', '$p'), 2],
    # progress toward claims: each living District where $p leads Dominion is worth more the fewer Citizens remain
    ['*', 2, SUM(flt(CITY, AND(eq(g('$it', 'claim'), 0), gt(C('dominion', g('$it', 'x'), '$p'), C('dominion', g('$it', 'x'), ['opp', '$p'])))),
                 sub(7, ['max', 0, g('$it', 'cit')]))],
    # faction engines: Souls feed Omens, Omens and a living Vessel are the Prophecy's clock
    ['*', 2, g('$p', 'souls')], ['*', 3, cnt(['cards', '$p', 'omens'])], Q(['isObj', C('vessel', '$p')], 6, Q(ANY(['cards', '$p', 'hand'], has('$it', 'vessel')), 3, 0))))

# ---------------------------------------------------------------- procedures
P = {}
def proc(name, params, body): P[name] = {'params': params, 'do': body}

proc('addRes', ['$p', '$n'], [['inc', '$p', C('rn', '$p'), '$n']])
proc('pay', ['$c'], [
    ['inc', '$me', C('rn', '$me'), ['neg', C('cost', '$c', '$me')]],
    IF(gt(g('$c', 'souls'), 0), [['inc', '$me', 'souls', ['neg', g('$c', 'souls')]]]),
    IF(eq(g('$c', 'type'), 'influence'), [['set', '$me', 'infPlayed', 1]]),
    IF(eq(g('$c', 'type'), 'planting'), [['set', '$me', 'plantPlayed', 1]])])
proc('place', ['$u', '$x', '$p'], [['set', '$u', 'x', '$x'], ['set', '$u', 'y', C('side', '$p')]])
# A citizen leaves district $x, taken by $p (bookkeeping shared by every way of taking one).
proc('took', ['$x', '$p'], [['inc', C('dAt', '$x'), 'cit', -1], ['set', C('dAt', '$x'), 'last', C('s1', '$p')], ['inc', '$p', 'trophies', 1], emit('took', player='$p', x='$x')])
proc('infect', ['$x', '$p'], [IF(gt(cit('$x'), 0), [C('took', '$x', '$p'), ['create', 'shambler', '$p', 'units', {'as': '$s'}], C('place', '$s', '$x', '$p'), ['set', '$s', 'fresh', 1]])])
# Gestation only advances while $p controls a Vessel; at 9 the Child is born.
proc('gestFor', ['$p', '$n'], [IF(AND(isF('$p', 5), ['isObj', C('vessel', '$p')]), [
    ['set', '$p', 'gestation', ['min', 9, add(g('$p', 'gestation'), '$n')]],
    IF(AND(ge(g('$p', 'gestation'), 9), ANY(['cards', '$p', 'aside'], eq(g('$it', 'card'), 'the-child'))), [C('nativity', '$p')])])])
proc('gest', ['$n'], [C('gestFor', '$me', '$n')])
proc('nativity', ['$p'], [
    ['move', ['first', flt(['cards', '$p', 'aside'], eq(g('$it', 'card'), 'the-child'))], 'units', {'as': '$ch'}],
    C('place', '$ch', g(C('vessel', '$p'), 'x'), '$p'),
    ['damage', ['opp', '$p'], ['*', 2, g(['opp', '$p'], 'pacts')]], emit('nativity', player='$p')])
proc('fulfill', ['$o'], [IF(['isObj', '$o'], [LET('$p', g('$o', 'controller')), emit('fulfilled', card=g('$o', 'card'), player='$p'), C('gestFor', '$p', g('$o', 'gest')), ['move', '$o', 'grave']])])
proc('panic', ['$x', '$n'], [IF(NOT(C('livingIs', '$x', 'maple')), [EACH(['range', '$n'], '$i', [IF(gt(cit('$x'), 0), [
    choose(C('adjD', '$x'), '$to', 'Panic: where does a Citizen flee?'),
    ['inc', C('dAt', '$x'), 'cit', -1], ['inc', '$to', 'cit', 1]])])])])
proc('victimFor', ['$p'], [['inc', '$p', 'bodycount', 1], C('addRes', '$p', 1)] +
    ([IF(ge(g('$p', 'bodycount'), BC), [['win', ['list', '$p']]])] if BC else []) +
    ([IF(AND(eq(g('$p', 'finalAct'), 0), ge(g('$p', 'bodycount'), FA)), [['set', '$p', 'finalAct', 1], emit('finalAct', player='$p')])] if FA else []))
proc('slay', ['$x'], [IF(gt(cit('$x'), 0), [C('took', '$x', '$me'), C('victimFor', '$me')])])
# Prey: take a Citizen by the hunting unit's faction method.
proc('take', ['$u', '$x'], [IF(gt(cit('$x'), 0), [
    LET('$p', g('$u', 'controller')),
    IF(isF('$p', 1), [C('took', '$x', '$p'),
        IF(lt(g('$p', 'thralls'), 6), [['inc', '$p', 'thralls', 1], C('addRes', '$p', LEVERS['CABAL_PREY'])], [C('addRes', '$p', LEVERS['CABAL_PREY'] + 1)]),
        IF(eq(g('$u', 'card'), 'associate-of-the-firm'), [C('addRes', '$p', 1)])]),
    IF(isF('$p', 2), [C('took', '$x', '$p'), ['inc', '$p', 'barrow', 1],
        IF(eq(g('$u', 'card'), 'the-corn-bride'), [C('addRes', '$p', 2)]),
        IF(eq(g('$u', 'card'), 'the-little-people'), [['draw', '$p', 1]])]),
    IF(isF('$p', 3), [IF(AND(has('$u', 'shambler'), NOT(ANY(C('gearOn', '$u'), eq(g('$it', 'card'), 'exposed-ribcage-maw')))),
        [C('took', '$x', '$p'), C('addRes', '$p', LEVERS['SHAMBLER_RES'])], [C('infect', '$x', '$p')])]),
    IF(isF('$p', 4), [C('slay', '$x'), C('panic', '$x', Q(eq(g('$u', 'card'), 'the-groundskeeper'), 2, 1))]),
    IF(isF('$p', 5), [C('took', '$x', '$p'), ['inc', '$p', 'souls', Q(eq(g('$u', 'card'), 'the-possessed-girl'), 2, 1)], C('addRes', '$p', 1),
        IF(ANY(C('mineAt', '$x', '$p'), has('$it', 'disciple')), [C('fulfill', ['first', flt(['cards', '$p', 'omens'], eq(g('$it', 'card'), 'the-jackals-birthmark'))])])])])])
proc('clash', ['$a', '$b', '$bi'], [
    LET('$ma', C('mvs', '$a', '$b', 0)), LET('$mb', C('mvs', '$b', '$a', '$bi')),
    ['damage', '$b', '$ma', '$a'], ['damage', '$a', '$mb', '$b'],
    IF(AND(['isObj', '$a'], C('guardOf', '$b')), [['set', '$a', 'gcl', '$turn']]),
    IF(AND(eq(g('$b', 'card'), 'the-final-girl'), eq(g('$a', 'type'), 'killer')), [['set', '$a', 'ended', 1]]),
    IF(AND(eq(g('$a', 'card'), 'the-final-girl'), eq(g('$b', 'type'), 'killer')), [['set', '$b', 'ended', 1]]),
    C('victim', '$a', '$b'), C('victim', '$b', '$a'),
    IF(AND(eq(g('$a', 'card'), 'the-amalgam'), ge(g('$b', 'dmg'), C('endur', '$b'))), [['inc', '$a', 'plus', 1]]),
    emit('clashed', a='$a', b='$b')])
proc('victim', ['$k', '$v'], [IF(AND(['isObj', '$k'], eq(g('$k', 'type'), 'killer'), has('$v', 'mortal'), ge(g('$v', 'dmg'), C('endur', '$v')),
    NOT(AND(eq(g('$v', 'card'), 'the-final-girl'), eq(g('$v', 'saved'), 0)))), [
    C('victimFor', g('$k', 'controller'))])])
proc('spring', ['$t', '$v'], [IF(['isObj', '$t'], [
    LET('$o', g('$t', 'controller')),
    IF(ge(res('$o'), g('$t', 'cost')), [
        ['flip', '$t'], C('addRes', '$o', ['neg', g('$t', 'cost')]), C('addRes', '$o', 1), emit('sprung', card=g('$t', 'card'), x=g('$t', 'x')),
        IF(eq(g('$t', 'card'), 'bear-trap'), [['damage', '$v', 3, '$t'], ['set', '$v', 'ex', 1]]),
        IF(eq(g('$t', 'card'), 'the-basement-door'), [IF(has('$v', 'mortal'), [['set', '$v', 'dmg', 99]], [['damage', '$v', 2, '$t']])]),
        IF(eq(g('$t', 'card'), 'just-the-cat'), [['set', '$v', 'ex', 1], ['set', '$v', 'stun', 1], C('addRes', '$o', 1), ['draw', '$o', 1]])],
        [emit('fizzled', x=g('$t', 'x'))]),
    ['move', '$t', 'grave']])])
proc('investigate', ['$u', '$t'], [IF(AND(['isObj', '$t'], g('$t', 'faceDown')), [
    IF(eq(g('$t', 'type'), 'killer'), [['flip', '$t'], emit('exposed', card=g('$t', 'card'))],
        [IF(eq(g('$t', 'type'), 'trap'), [C('spring', '$t', '$u')], [['flip', '$t'], ['move', '$t', 'grave']])])])])
proc('resolveHunt', [], [IF(['isObj', '$win.u'], [
    LET('$u', '$win.u'),
    IF(AND(['isObj', '$win.icpt'], ne('$win.icpt', None)), [C('clash', '$u', '$win.icpt', 1)], [
        IF(eq('$win.kind', 'prey'), [C('take', '$u', '$win.x'),
            IF(OR(eq(g('$u', 'card'), 'countess-ilse-varga'), ANY(C('gearOn', '$u'), eq(g('$it', 'card'), 'chainsaw'))), [C('take', '$u', '$win.x')])]),
        IF(AND(eq('$win.kind', 'clash'), ['isObj', '$win.t']), [C('clash', '$u', '$win.t', 0)]),
        IF(eq('$win.kind', 'strike'), [['damage', '$win.def', Q(AND(isF('$win.def', 4), eq(g('$win.def', 'finalAct'), 1)), ['min', 1, C('menace', '$u')],
            Q(C('finalKiller', '$u'), C('menace', '$u'), C('menace', '$u') if not LEVERS['STRIKE_DAMAGE'] else ['min', LEVERS['STRIKE_DAMAGE'], C('menace', '$u')])), '$u'],
            IF(AND(isF('$win.def', 4), gt(cnt(flt(['cards', '$win.def', 'units'], g('$it', 'faceDown'))), 0)), [
                choose(flt(['cards', '$win.def', 'units'], g('$it', 'faceDown')), '$l', 'Old Hollow: move a Lurker into the striker\'s district?', 0, 1, '$win.def'),
                IF(['isObj', '$l'], [['set', '$l', 'x', '$win.x']])])]),
        IF(AND(eq('$win.kind', 'raid'), ['isObj', '$win.t']), [['damage', '$win.t', C('menace', '$u'), '$u']]),
        IF(eq('$win.kind', 'investigate'), [C('investigate', '$u', '$win.t')])]),
    IF(['isObj', '$u'], [['set', '$u', 'amb', 0]])])])
proc('afterResp', [], [IF(ne('$win.kind', 'play'), [C('resolveHunt')])])
# Declares a Hunt: exhaust (Relentless hunts twice), let Traps spring, then the response step (Intercept, Fast Schemes).
proc('hunt', ['$u', '$kind', '$t'], [
    IF(AND(eq(g('$u', 'xprey'), 1), eq('$kind', 'prey'), eq(g('$u', 'ex'), 1)), [['set', '$u', 'xprey', 0]], [
        ['inc', '$u', 'hunted', 1],
        IF(OR(NOT(has('$u', 'relentless')), ge(g('$u', 'hunted'), 2)), [['set', '$u', 'ex', 1]])]),
    emit('hunt', u='$u', x=g('$u', 'x'), p='$me', kind='$kind'),
    ['openWindow', 'resp', {'data': {'u': '$u', 'kind': '$kind', 't': '$t', 'x': g('$u', 'x'), 'def': '$opp', 'p': '$me', 'icpt': None,
                                     'who': C('respWho', '$kind', '$opp', g('$u', 'x'))}}]])
proc('react', ['$c'], [['openWindow', 'resp', {'data': {'u': '$c', 'kind': 'play', 'def': '$opp', 'p': '$me', 'x': -1, 'who': Q(isF('$opp', 1), ['list', '$opp'], lit([]))}}]])
proc('claim', ['$d', '$p'], [IF(eq(g('$d', 'claim'), 0), [
    ['set', '$d', 'claim', C('s1', '$p')], ['inc', '$p', 'claims', 1], ['become', '$d', {'copy': g('$d', 'fallen')}],
    emit('claimed', district=g('$d', 'card'), player='$p'),
    IF(AND(eq(g('$d', 'key'), 'cathedral'), isF('$p', 5)), [['call', 'gestFor', '$p', 1]]),
    IF(ge(g('$p', 'claims'), 3), [['win', ['list', '$p']]])])])
proc('kill', ['$u'], [
    emit('dying', u='$u', x=g('$u', 'x'), ctrl=g('$u', 'controller'), card=g('$u', 'card'), type=g('$u', 'type'), mortal=has('$u', 'mortal'), vessel=has('$u', 'vessel')),
    IF(eq(g('$u', 'type'), 'killer'), [
        IF(AND(eq(g('$u', 'ended'), 1), eq(g(g('$u', 'owner'), 'finalAct'), 0)), [['move', '$u', 'removed'], emit('ended', card=g('$u', 'card'))],
            [['move', '$u', 'dark', {'as': '$k'}], ['set', '$k', 'sc', Q(eq(g(g('$u', 'owner'), 'finalAct'), 1), 1, 2)]])], [
        IF(eq(g('$u', 'type'), 'oldone'), [['set', g('$u', 'owner'), 'barrow', 0], ['move', '$u', 'aside']], [
            IF(eq(g('$u', 'type'), 'child'), [['set', g('$u', 'owner'), 'gestation', 4], ['move', '$u', 'aside']], [
                IF(has('$u', 'token'), [['move', '$u', 'removed']], [['destroy', '$u']])])])])])
proc('discardTo7', [], [IF(gt(cnt(['cards', '$me', 'hand']), 7), [
    choose(['cards', '$me', 'hand'], '$dis', 'Toll: discard down to 7', sub(cnt(['cards', '$me', 'hand']), 7), sub(cnt(['cards', '$me', 'hand']), 7)),
    ['move', '$dis', 'grave']])])
proc('dawn', [], [
    LET('$a', ['players']),
    LET('$sa', add(['*', 10000, g('p0', 'claims')], ['*', 100, g('p0', 'trophies')], g('p0', 'essence'))),
    LET('$sb', add(['*', 10000, g('p1', 'claims')], ['*', 100, g('p1', 'trophies')], g('p1', 'essence'))),
    emit('dawn'),
    ['win', Q(gt('$sa', '$sb'), ['list', 'p0'], Q(gt('$sb', '$sa'), ['list', 'p1'], lit([])))]])

# ---- phases
proc('rise', [], [
    EACH(ALLU, '$o', [['set', '$o', 'hz', 0]]),
    EACH(CITY, '$d', [['set', '$d', 'struck', 0]]),
    EACH(['concat', ['cards', '$me', 'units'], ['cards', '$me', 'lair']], '$o', [
        IF(eq(g('$o', 'stun'), 1), [['set', '$o', 'stun', 0]], [['set', '$o', 'ex', 0]]),
        ['set', '$o', 'fresh', 0], ['set', '$o', 'hunted', 0], ['set', '$o', 'frenzy', 0], ['set', '$o', 'moves', 0], ['set', '$o', 'xprey', 0], ['set', '$o', 'mayPrey', 0]]),
    ['set', '$me', 'infPlayed', 0], ['set', '$me', 'plantPlayed', 0], ['set', '$me', 'lurks', 0], ['set', '$me', 'velvet', 0], ['set', '$me', 'extraLurk', 0], ['set', '$me', 'grim', 0], ['set', '$me', 'tunnel', 0],
    IF(isF('$me', 5), [
        IF(ANY(['cards', '$me', 'units'], eq(g('$it', 'card'), 'the-child')), [emit('prophecy', player='$me'), ['win', ['list', '$me']]]),
        C('gestFor', '$me', LEVERS['GESTATION_RISE']),
        EACH(flt(['cards', '$me', 'omens'], eq(g('$it', 'card'), 'the-blood-moon')), '$om', [IF(ge(HOUR, 4), [C('fulfill', '$om')])]),
        EACH(flt(['cards', '$me', 'units'], AND(eq(g('$it', 'card'), 'doting-neighbors'), ['isObj', C('vessel', '$me')])), '$dn', [
            IF(eq(g('$dn', 'x'), g(C('vessel', '$me'), 'x')), [C('addRes', '$me', 1)])])]),
    IF(isF('$me', 1), [EACH(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), has('$it', 'vampire'))), '$v', [
        LET('$th', Q(has('$v', 'elder'), 2, 1)),
        IF(ge(res('$me'), '$th'), [C('addRes', '$me', ['neg', '$th'])], [['damage', '$v', 1], ['set', '$v', 'frenzy', 1], emit('frenzy', u='$v')])])]),
    IF(isF('$me', 2), [
        ['set', '$me', 'season', ['mod', add(g('$me', 'season'), 1), 4]],
        EACH(['cards', '$me', 'field'], '$pl', [['inc', '$pl', 'growth', Q(eq(g('$me', 'season'), 2), 2, 1)]]),
        IF(eq(g('$me', 'season'), 0), [EACH(['cards', '$me', 'units'], '$o', [['set', '$o', 'dmg', 0], ['set', '$o', 'silver', 0]])]),
        IF(AND(ANY(['cards', '$me', 'aside'], eq(g('$it', 'type'), 'oldone')), ge(g('$me', 'barrow'), LEVERS['AWAKEN']),
               ANY(['cards', '$me', 'units'], eq(g('$it', 'type'), 'effigy'))), [
            choose(flt(CITY, ANY(C('structsAt', g('$it', 'x'), '$me'), eq(g('$it', 'type'), 'effigy'))), '$d', 'Awaken the Old One: which district?'),
            ['inc', '$me', 'barrow', -LEVERS['AWAKEN']],
            ['move', ['first', flt(['cards', '$me', 'aside'], eq(g('$it', 'type'), 'oldone'))], 'units', {'as': '$oo'}],
            C('place', '$oo', g('$d', 'x'), '$me'), emit('awakened', player='$me')])]),
    IF(isF('$me', 3), [LET('$spr', flt(CITY, AND(C('living', g('$it', 'x')), gt(cit(g('$it', 'x')), 0), ge(cnt(flt(C('mineAt', g('$it', 'x'), '$me'), has('$it', 'zombie'))),
        Q(C('inPlay', '$me', 'vector-b'), LEVERS['SPREAD_MIN'] - 1, LEVERS['SPREAD_MIN'])))))] + (
        [IF(gt(cnt('$spr'), 0), [choose('$spr', '$d', 'Spread: which district?', 1, 1), C('infect', g('$d', 'x'), '$me')])] if LEVERS['SPREAD_ONCE'] else
        [EACH('$spr', '$d', [C('infect', g('$d', 'x'), '$me')])])),
    IF(isF('$me', 4), [
        EACH(flt(['cards', '$me', 'units'], AND(g('$it', 'faceDown'), eq(g('$it', 'card'), 'the-caller'))), '$cl', [C('addRes', '$me', 1)]),
        EACH(['cards', '$me', 'dark'], '$k', [['inc', '$k', 'sc', -1], IF(le(g('$k', 'sc'), 0), [C('returnKiller', '$k')])])])])
proc('returnKiller', ['$k'], [
    choose(CITY, '$d', 'Sequel: where does the Killer return?'),
    ['inc', '$me', ['at', lit(SEQ), g('$k', 'card')], 1],
    ['move', '$k', 'units', {'faceDown': True, 'as': '$r'}], C('place', '$r', g('$d', 'x'), '$me'), emit('sequel', player='$me')])
proc('drawStep', [], [x for x in [
    IF(ne('$turn', 1), [['draw', '$me', 1]]),
    IF(AND(ne('$turn', 1), isF('$me', 4)), [['draw', '$me', LEVERS['DRAW_SLASHER']]]) if LEVERS['DRAW_SLASHER'] else None,
    IF(AND(ne('$turn', 1), isF('$me', 5)), [['draw', '$me', LEVERS['DRAW_DEVIL']]]) if LEVERS['DRAW_DEVIL'] else None,
    IF(AND(ne('$turn', 1), isF('$me', 2)), [['draw', '$me', LEVERS['DRAW_HARVEST']]]) if LEVERS['DRAW_HARVEST'] else None,
    IF(C('claims', '$me', 'financial'), [['draw', '$me', 1]]),
    IF(AND(isF('$me', 2), eq(g('$me', 'season'), 0)), [['draw', '$me', 2]])] if x])
proc('gather', [], [
    C('addRes', '$me', Q(isF('$me', 1), add(LEVERS['GATHER_CABAL'], g('$me', 'thralls')), ['at', lit({'2': LEVERS['GATHER_HARVEST'], '3': LEVERS['GATHER_ZOMBIE'], '4': LEVERS['GATHER_SLASHER'], '5': LEVERS['GATHER_DEVIL']}), g('$me', 'faction')])),
    IF(C('claims', '$me', 'docks'), [C('addRes', '$me', 1)]),
    IF(isF('$me', 1), [C('addRes', '$me', cnt(flt(['cards', '$me', 'units'], eq(g('$it', 'card'), 'blood-bank-holdings'))))]),
    IF(AND(isF('$me', 2), eq(g('$me', 'season'), 3)), [EACH(flt(['cards', '$me', 'field'], ge(g('$it', 'growth'), g('$it', 'ripen'))), '$pl', [
        C('addRes', '$me', g('$pl', 'yield')),
        IF(eq(g('$pl', 'card'), 'mandrake-patch'), [choose(CITY, '$d', 'Mandrake Patch: create a Mandrake where?'),
            ['create', 'mandrake', '$me', 'units', {'as': '$mk'}], C('place', '$mk', g('$d', 'x'), '$me'), ['set', '$mk', 'fresh', 1]]),
        ['move', '$pl', 'grave']])]),
    EACH(flt(['cards', '$me', 'units'], AND(eq(g('$it', 'frenzy'), 1), C('isUnit', '$it'))), '$v', [C('frenzied', '$v')])])
# A Frenzied Vampire must Hunt this turn if it can, Preying if possible.
proc('frenzied', ['$v'], [IF(C('canPrey', '$v'), [C('hunt', '$v', 'prey', None)], [
    IF(AND(C('canHunt', '$v'), gt(cnt(C('enemyAt', g('$v', 'x'), '$me')), 0)), [
        choose(C('enemyAt', g('$v', 'x'), '$me'), '$t', 'Frenzy: your Vampire must attack. Clash which unit?'), C('hunt', '$v', 'clash', '$t')], [
        IF(AND(C('canHunt', '$v'), NOT(C('readyEnemy', g('$v', 'x'), '$me')), NOT(C('guardedFor', '$v'))), [C('hunt', '$v', 'strike', None)])])])])
proc('toll', [], [
    IF(AND(isF('$me', 4), eq(g('$me', 'finalAct'), 1)), [EACH(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), eq(g('$it', 'type'), 'killer'))), '$k', [
        IF(C('living', g('$k', 'x')), [C('slay', g('$k', 'x'))])])]),
    IF(C('inPlay', '$me', 'silas-whitmore'), [['damage', '$opp', cnt(flt(CITY, ANY(C('structsAt', g('$it', 'x'), '$me'), eq(g('$it', 'type'), 'influence'))))]]),
    EACH(CITY, '$d', [
        IF(AND(eq(g('$d', 'claim'), 0), eq(g('$d', 'key'), 'docks'), ge(g('$d', 'cit'), 2), lt(g('$d', 'cit'), 6)), [['inc', '$d', 'cit', 1]]),
        IF(AND(eq(g('$d', 'claim'), 0), eq(g('$d', 'key'), 'hospital')), [EACH(flt(C('unitsAt', g('$d', 'x')), AND(has('$it', 'mortal'), gt(g('$it', 'dmg'), 0))), '$m', [['inc', '$m', 'dmg', -1]])])]),
    IF(isF('$me', 5), [C('addRes', '$me', g('$opp', 'pacts'))]),
    IF(AND(isF('$me', 2), eq(g('$me', 'season'), 3)), [
        EACH(flt(['cards', '$me', 'units'], eq(g('$it', 'card'), 'the-wicker-colossus')), '$w', [
            choose(lit(['burn', 'keep']), '$b', 'The Wicker Colossus: burn it now?'),
            IF(eq('$b', 'burn'), [
                EACH(['range', 3], '$i', [IF(gt(cit(g('$w', 'x')), 0), [C('took', g('$w', 'x'), '$me'), ['inc', '$me', 'barrow', 1]])]),
                EACH(flt(C('enemyAt', g('$w', 'x'), '$me'), has('$it', 'mortal')), '$m', [['damage', '$m', 2, '$w']]),
                ['move', '$w', 'grave']])]),
        EACH(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), eq(g('$it', 'type'), 'oldone'))), '$oo', [
            LET('$x', g('$oo', 'x')),
            IF(C('living', '$x'), [EACH(['range', cit('$x')], '$i', [C('took', '$x', '$me'), ['inc', '$me', 'barrow', 1]]), C('claim', C('dAt', '$x'), '$me')])])]),
    IF(isF('$me', 4), [EACH(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), eq(g('$it', 'type'), 'killer'))), '$k', [
        IF(ge(res('$me'), 1), [
            choose(['concat', lit(['stay']), ['map', ['list', '$k'], 'vanish']], '$v', 'Vanish this Killer for 1 Terror?'),
            IF(eq('$v', 'vanish'), [C('addRes', '$me', -1), ['flip', '$k', False],
                choose(['concat', ['list', C('dAt', g('$k', 'x'))], C('adjD', g('$k', 'x'))], '$d', 'Vanish: stay or slip to an adjacent district'),
                ['set', '$k', 'x', g('$d', 'x')]])])])]),
    EACH(CITY, '$d', [LET('$x', g('$d', 'x')), IF(AND(eq(g('$d', 'claim'), 0), gt(g('$d', 'cit'), 0)), [
        IF(AND(isF('$me', 1), ge(C('influence', '$x', '$me'), g('$d', 'cit')), *([ANY(C('mineAt', '$x', '$me'), has('$it', 'vampire'))] if LEVERS['DOM_VAMPIRE'] else [])), [
            EACH(['range', g('$d', 'cit')], '$i', [C('took', '$x', '$me'), IF(lt(g('$me', 'thralls'), 6), [['inc', '$me', 'thralls', 1]], [C('addRes', '$me', 2)])]),
            emit('dominated', district=g('$d', 'card')), C('claim', '$d', '$me')]),
        IF(AND(isF('$me', 3), ge(cnt(flt(C('mineAt', '$x', '$me'), has('$it', 'zombie'))), ['*', LEVERS['OVERRUN_RATIO'], g('$d', 'cit')]), eq(cnt(C('enemyAt', '$x', '$me')), 0)), [
            EACH(['range', g('$d', 'cit')], '$i', [C('infect', '$x', '$me')]), emit('overrun', district=g('$d', 'card')), C('claim', '$d', '$me')])])]),
    EACH(CITY, '$d', [LET('$x', g('$d', 'x')), IF(AND(eq(g('$d', 'claim'), 0), eq(g('$d', 'cit'), 0)), [
        LET('$da', C('dominion', '$x', 'p0')), LET('$db', C('dominion', '$x', 'p1')),
        IF(gt('$da', '$db'), [C('claim', '$d', 'p0')], [IF(gt('$db', '$da'), [C('claim', '$d', 'p1')], [
            IF(eq(g('$d', 'last'), 1), [C('claim', '$d', 'p0')]), IF(eq(g('$d', 'last'), 2), [C('claim', '$d', 'p1')])])])])]),
    IF(AND(isF('$me', 2), eq(g('$me', 'season'), 0), gt(res('$me'), 2)), [['set', '$me', 'bounty', 2]]),
    EACH(ALLU, '$o', [['set', '$o', 'amb', 0]]),
    C('discardTo7'),
    IF(ne(g('$me', 'seat'), g('game', 'first')), [IF(ge(HOUR, 9), [C('dawn')], [['inc', 'game', 'hour', 1], emit('hour', hour=add(HOUR, 0))])])])

# ---- setup
proc('setDistrict', ['$d', '$i'], [['set', '$d', 'x', '$i'], ['set', '$d', 'y', 1], ['set', '$d', 'cit', g('$d', 'population')]])
# Advanced play: each player brings 3 Districts; one is removed at random and the other 5 are placed alternately,
# starting with the second player.
proc('draftCity', [], [
    ['move', ['concat', ['cards', 'p0', 'brought'], ['cards', 'p1', 'brought']], 'draft'],
    ['random', {'from': ['cards', 'p0', 'draft'], 'as': '$gone'}], ['move', '$gone', 'unused'], emit('districtRemoved', card=g('$gone', 'card')),
    EACH(['range', 5], '$i', [
        LET('$who', Q(eq(['mod', '$i', 2], 0), Q(eq(g('game', 'first'), 0), 'p1', 'p0'), Q(eq(g('game', 'first'), 0), 'p0', 'p1'))),
        choose(['cards', 'p0', 'draft'], '$d', 'Place the next District of the City', 1, 1, '$who'),
        ['move', '$d', 'city', {'as': '$nd'}], C('setDistrict', '$nd', '$i')])])
proc('setupPlayer', ['$p'], [
    LET('$m', C('master', '$p')),
    ['set', '$p', 'faction', g('$m', 'fno')], ['set', '$p', 'essence', g('$m', 'essence')],
    ['set', '$p', C('rn', '$p'), add(g('$m', 'startRes'), Q(eq(g('$p', 'seat'), g('game', 'first')), 0, 1))],
    IF(isF('$p', 1), [['set', '$p', 'thralls', 0]]),
    IF(isF('$p', 2), [['set', '$p', 'season', 0], ['set', '$p', 'barrow', 0]]),
    IF(isF('$p', 4), [['set', '$p', 'bodycount', 0], ['set', '$p', 'finalAct', 0]]),
    IF(isF('$p', 5), [['set', '$p', 'gestation', LEVERS['GEST_START']], ['set', '$p', 'souls', 0]]),
    ['shuffle', '$p', 'deck'], ['draw', '$p', 6],
    IF(eq(g('game', 'noMulligan'), 0), [
        choose(['cards', '$p', 'hand'], '$mul', 'Mulligan: choose any cards to shuffle back (once)', 0, 6, '$p'),
        ['move', '$mul', 'deck'], ['shuffle', '$p', 'deck'], ['draw', '$p', cnt('$mul')]])])

# ---- set pieces (tutorials and puzzles): arrange the City, hands and board from the players' own decks
proc('tutCity', ['$ids'], [['move', ['cards', 'p0', 'city'], 'pool'],
    EACH(['range', 5], '$i', [['move', ['first', flt(['cards', 'p0', 'pool'], eq(g('$it', 'card'), ['nth', '$ids', '$i']))], 'city', {'as': '$d'}], C('setDistrict', '$d', '$i')])])
proc('tutHand', ['$p', '$ids'], [['move', ['cards', '$p', 'hand'], 'deck'],
    EACH('$ids', '$id', [['move', ['first', flt(['cards', '$p', 'deck'], eq(g('$it', 'card'), '$id'))], 'hand']])])
proc('tutPut', ['$p', '$card', '$x'], [
    ['move', ['first', flt(['concat', ['cards', '$p', 'deck'], ['cards', '$p', 'hand']], eq(g('$it', 'card'), '$card'))], 'units', {'as': '$u'}], C('place', '$u', '$x', '$p')])
proc('tutLurk', ['$p', '$card', '$x'], [
    ['move', ['first', flt(['concat', ['cards', '$p', 'deck'], ['cards', '$p', 'hand']], eq(g('$it', 'card'), '$card'))], 'units', {'faceDown': True, 'as': '$u'}], C('place', '$u', '$x', '$p')])
proc('tutPlant', ['$p', '$card', '$g'], [
    ['move', ['first', flt(['cards', '$p', 'deck'], eq(g('$it', 'card'), '$card'))], 'field', {'as': '$u'}], ['set', '$u', 'growth', '$g']])
proc('tutOmen', ['$p', '$card'], [['move', ['first', flt(['cards', '$p', 'deck'], eq(g('$it', 'card'), '$card'))], 'omens']])

# ---------------------------------------------------------------- actions
def src_hand(*types): return flt(['cards', '$me', 'hand'], AND(inl(g('$it', 'type'), lit(list(types))), C('canPay', '$it', '$me')))
A = {}
A['deploy'] = {'label': 'Play unit', 'phases': ['night'],
    'source': flt(src_hand('horror', 'hunter', 'puppet', 'folk', 'disciple', 'killer'), C('uniqueOk', '$it', '$me')),
    'targets': [{'as': '$d', 'from': CITY, 'prompt': 'district'}],
    'cost': [C('pay', '$self')],
    'do': [['move', '$self', 'units', {'as': '$u'}], C('place', '$u', g('$d', 'x'), '$me'), ['set', '$u', 'fresh', 1]]}
A['build'] = {'label': 'Raise structure', 'phases': ['night'], 'source': src_hand('influence', 'effigy'),
    'targets': [{'as': '$d', 'from': CITY, 'prompt': 'district'}], 'cost': [C('pay', '$self')],
    'do': [['move', '$self', 'units', {'as': '$u'}], C('place', '$u', g('$d', 'x'), '$me')]}
A['cast'] = {'label': 'Play', 'phases': ['night', 'respond'],
    'source': flt(src_hand('event', 'scheme', 'rite', 'outbreak', 'scene', 'bargain'),
        Q(eq('$phase', 'respond'), AND(has('$it', 'fast'), inl('$me', '$win.who')), OR(NOT(eq(g('$it', 'card'), 'a-quiet-word-with-the-mayor')), lit(False)))),
    'req': [{'if': OR(ne('$phase', 'respond'), NOT(eq(g('$self', 'card'), 'a-quiet-word-with-the-mayor')), eq('$win.kind', 'play')), 'why': 'A Quiet Word cancels a card as it is played'}],
    'cost': [C('pay', '$self')],
    'do': [['move', '$self', 'limbo', {'as': '$c'}], ['set', 'game', 'cancel', 0], C('react', '$c'),
        IF(eq(g('game', 'cancel'), 1), [['move', '$c', 'grave'], ['draw', '$me', 1], emit('cancelled', card=g('$c', 'card'))],
           [['run', '$c', 'effect'], IF(['isObj', '$c'], [['move', '$c', 'grave']])])]}
A['attach'] = {'label': 'Attach', 'phases': ['night'], 'source': src_hand('mutation', 'weapon', 'relic', 'possession'),
    'targets': [{'as': '$h', 'from': flt(['concat', ALLU, ['cards', '$me', 'lair']], C('hostOk', '$self', '$it')), 'prompt': 'card to attach to'}],
    'cost': [C('pay', '$self')],
    'do': [['move', '$self', 'gear', {'as': '$g'}], ['link', '$g', 'on', '$h'],
        IF(eq(g('$g', 'type'), 'possession'), [['control', '$h', '$me'], ['set', '$h', 'y', C('side', '$me')]])]}
A['plant'] = {'label': 'Plant', 'phases': ['night'], 'source': flt(src_hand('planting'), gt(cnt(['freeSlots', '$me', 'field']), 0)),
    'cost': [C('pay', '$self')], 'do': [['move', '$self', 'field']]}
A['install'] = {'label': 'Install Strain', 'phases': ['night'], 'source': src_hand('strain'), 'cost': [C('pay', '$self')],
    'do': [IF(eq(cnt(['freeSlots', '$me', 'labs']), 0), [choose(['cards', '$me', 'labs'], '$old', 'Replace which Strain?'), ['move', '$old', 'grave']]), ['move', '$self', 'labs']]}
A['omen'] = {'label': 'Place Omen', 'phases': ['night'], 'source': flt(src_hand('omen'), gt(cnt(['freeSlots', '$me', 'omens']), 0)),
    'cost': [C('pay', '$self')], 'do': [['move', '$self', 'omens']]}
A['lurk'] = {'label': 'Lurk (face down)', 'phases': ['night'],
    'source': flt(['cards', '$me', 'hand'], AND(isF('$me', 4), lt(g('$me', 'lurks'), add(LEVERS['LURKS'], g('$me', 'extraLurk'))))),
    'targets': [{'as': '$d', 'from': flt(CITY, lt(cnt(C('lurkersAt', g('$it', 'x'), '$me')), 2)), 'prompt': 'district'}],
    'do': [['inc', '$me', 'lurks', 1], ['move', '$self', 'units', {'faceDown': True, 'as': '$u'}], C('place', '$u', g('$d', 'x'), '$me'), ['set', '$u', 'fresh', 1]]}
A['reveal'] = {'label': 'Reveal Killer', 'phases': ['night'],
    'source': flt(['cards', '$me', 'units'], AND(g('$it', 'faceDown'), eq(g('$it', 'type'), 'killer'), ge(res('$me'), g('$it', 'cost')))),
    'do': [C('addRes', '$me', ['neg', g('$self', 'cost')]), ['flip', '$self'], ['set', '$self', 'amb', 1],
        IF(eq(g('$self', 'card'), 'the-caller'), [['random', {'from': ['cards', '$opp', 'hand'], 'as': '$r'}], ['move', '$r', 'grave']]),
        IF(eq(g('$self', 'card'), 'mister-lullaby'), [choose(CITY, '$d', 'Dreamwalker: hunt in which district?'), ['set', '$self', 'x', g('$d', 'x')]])]}
A['move'] = {'label': 'Move', 'phases': ['night'],
    'source': flt(['cards', '$me', 'units'], AND(OR(C('isUnit', '$it'), g('$it', 'faceDown')), NOT(has('$it', 'slow')),
        lt(g('$it', 'moves'), Q(eq(g('$it', 'card'), 'sprinter'), 2, 1)))),
    'targets': [{'as': '$d', 'prompt': 'district', 'from': flt(CITY, AND(ne(g('$it', 'x'), g('$self', 'x')), OR(
        C('adj', g('$self', 'x'), g('$it', 'x')), AND(C('claims', '$me', 'subway'), eq(g('$me', 'tunnel'), 0)),
        AND(eq(g('$self', 'card'), 'thing-in-the-hedgerow'), ANY(C('structsAt', g('$it', 'x'), '$me'), eq(g('$it', 'type'), 'effigy'))))))}],
    'do': [IF(AND(NOT(C('adj', g('$self', 'x'), g('$d', 'x'))), C('claims', '$me', 'subway'), ne(g('$self', 'card'), 'thing-in-the-hedgerow')), [['set', '$me', 'tunnel', 1]]),
        ['inc', '$self', 'moves', 1], ['set', '$self', 'x', g('$d', 'x')], emit('unitMoved', u='$self', x=g('$d', 'x'), p='$me')]}
A['prey'] = {'label': 'Prey', 'phases': ['night'], 'source': flt(['cards', '$me', 'units'], C('canPrey', '$it')), 'do': [C('hunt', '$self', 'prey', None)]}
A['clash'] = {'label': 'Clash', 'phases': ['night'], 'source': flt(['cards', '$me', 'units'], C('canHunt', '$it')),
    'targets': [{'as': '$t', 'prompt': 'enemy unit', 'from': flt(ALLU, AND(C('isUnit', '$it'), ne(g('$it', 'controller'), '$me'),
        OR(eq(g('$it', 'x'), g('$self', 'x')), AND(ANY(C('gearOn', '$self'), eq(g('$it', 'card'), 'tendril-lash')), C('adj', g('$self', 'x'), g('$it', 'x')))),
        NOT(AND(eq(g('$it', 'card'), 'margaret-wells'), ANY(C('mineAt', g('$it', 'x'), g('$it', 'controller')), AND(has('$it', 'disciple'), ne(g('$it', 'card'), 'margaret-wells'))))))) }],
    'do': [C('hunt', '$self', 'clash', '$t')]}
A['strike'] = {'label': 'Strike the Master', 'phases': ['night'],
    'source': flt(['cards', '$me', 'units'], AND(C('canHunt', '$it'), ne(g('$it', 'type'), 'hunter'), *([] if LEVERS['SHAMBLER_STRIKE'] else [NOT(has('$it', 'shambler'))]),
        NOT(C('readyEnemy', g('$it', 'x'), '$me')), NOT(C('guardedFor', '$it')),
        lt(g(C('dAt', g('$it', 'x')), 'struck'), LEVERS['STRIKE_PER_DISTRICT']))),
    'do': [['inc', C('dAt', g('$self', 'x')), 'struck', 1], C('hunt', '$self', 'strike', None)]}
A['raid'] = {'label': 'Raid', 'phases': ['night'], 'source': flt(['cards', '$me', 'units'], AND(C('canHunt', '$it'), NOT(C('guardedFor', '$it')))),
    'targets': [{'as': '$t', 'prompt': 'enemy structure', 'from': flt(ALLU, AND(C('isStruct', '$it'), ne(g('$it', 'controller'), '$me'), eq(g('$it', 'x'), g('$self', 'x'))))}],
    'do': [C('hunt', '$self', 'raid', '$t')]}
A['investigate'] = {'label': 'Investigate', 'phases': ['night'], 'source': flt(['cards', '$me', 'units'], C('canHunt', '$it')),
    'targets': [{'as': '$t', 'prompt': 'face-down card', 'from': flt(ALLU, AND(g('$it', 'faceDown'), ne(g('$it', 'controller'), '$me'),
        OR(eq(g('$it', 'x'), g('$self', 'x')), AND(eq(g('$self', 'card'), 'professor-ida-kask'), lit(True))),
        NOT(AND(eq(g('$self', 'fresh'), 1), C('livingIs', g('$it', 'x'), 'campground')))))}],
    'do': [C('hunt', '$self', 'investigate', '$t')]}
A['intercept'] = {'label': 'Intercept', 'phases': ['respond'], 'limit': {'per': 'turn', 'by': 'source'},
    'source': flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), eq(g('$it', 'ex'), 0), NOT(has('$it', 'nohunt')), inl('$win.kind', lit(['prey', 'raid'])),
        eq('$win.def', '$me'), eq('$win.icpt', None),
        OR(eq(g('$it', 'x'), '$win.x'), AND(eq(g('$it', 'card'), 'the-governess'), ANY(C('mineAt', '$win.x', '$me'), has('$it', 'vessel')))))),
    'do': [['set', '$self', 'x', '$win.x'], ['winSet', 'icpt', '$self'], emit('intercept', u='$self', x='$win.x')]}
A['drain'] = {'label': 'Drain a Thrall', 'phases': ['night', 'respond'],
    'source': flt(['cards', '$me', 'lair'], AND(isF('$me', 1), gt(g('$me', 'thralls'), 0), OR(eq('$phase', 'night'), inl('$me', '$win.who')))),
    'do': [['inc', '$me', 'thralls', -1], C('addRes', '$me', add(2, cnt(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), eq(g('$it', 'card'), 'the-sommelier'))))))]}
A['mend'] = {'label': 'Mend', 'phases': ['night', 'respond'],
    'source': flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), has('$it', 'vampire'), gt(g('$it', 'dmg'), g('$it', 'silver')), OR(eq('$phase', 'night'), inl('$me', '$win.who')),
        NOT(ANY(C('unitsAt', g('$it', 'x')), eq(g('$it', 'card'), 'professor-ida-kask'))),
        OR(ge(res('$me'), 1), AND(eq(g('$me', 'velvet'), 0), ANY(C('structsAt', g('$it', 'x'), '$me'), eq(g('$it', 'card'), 'the-velvet-club')))))),
    'do': [IF(AND(eq(g('$me', 'velvet'), 0), ANY(C('structsAt', g('$self', 'x'), '$me'), eq(g('$it', 'card'), 'the-velvet-club'))),
        [['set', '$me', 'velvet', 1]], [C('addRes', '$me', -1)]), ['inc', '$self', 'dmg', -1]]}
A['sacrifice'] = {'label': 'Sacrifice Shambler', 'phases': ['night'],
    'source': flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), has('$it', 'shambler'))),
    'do': [C('addRes', '$me', 1)] + ([C('kill', '$self')] if LEVERS['SACRIFICE_IS_DEATH'] else [['move', '$self', 'removed'], emit('sacrificed', card='shambler', player='$me')])}
A['tithe'] = {'label': 'Spend 3 Souls', 'phases': ['night'],
    'source': flt(['cards', '$me', 'omens'], AND(eq(g('$it', 'card'), 'tithe-of-souls'), ge(g('$me', 'souls'), 3))),
    'do': [['inc', '$me', 'souls', -3], C('fulfill', '$self')]}
A['darkGift'] = {'label': 'Dark Gift', 'phases': ['night'],
    'source': flt(['cards', '$me', 'lair'], AND(eq(g('$it', 'type'), 'master'), eq(g('$it', 'ex'), 0), ge(res('$me'), g('$it', 'giftCost')),
        Q(isF('$me', 1), ANY(['cards', '$me', 'units'], eq(g('$it', 'type'), 'influence')),
        Q(isF('$me', 2), gt(g('$me', 'barrow'), 0),
        Q(isF('$me', 3), ANY(['cards', '$me', 'units'], has('$it', 'shambler')), lit(True)))))),
    'do': [['set', '$self', 'ex', 1], C('addRes', '$me', ['neg', g('$self', 'giftCost')]), ['run', '$self', 'gift']]}
A['grimoire'] = {'label': 'Black Grimoire: draw', 'phases': ['night'],
    'source': flt(['cards', '$me', 'gear'], AND(eq(g('$it', 'card'), 'the-black-grimoire'), eq(g('$me', 'grim'), 0), ge(res('$me'), 2))),
    'do': [['set', '$me', 'grim', 1], C('addRes', '$me', -2), ['draw', '$me', 1]]}
A['exorcise'] = {'label': 'Exorcise', 'phases': ['night'],
    'source': flt(['cards', '$me', 'units'], AND(eq(g('$it', 'card'), 'father-moreno'), C('canHunt', '$it'))),
    'targets': [{'as': '$po', 'prompt': 'Possession', 'from': flt(['cards', '*', 'gear'], AND(eq(g('$it', 'type'), 'possession'), eq(g(g('$it', 'on'), 'x'), g('$self', 'x'))))}],
    'do': [['set', '$self', 'ex', 1], LET('$h', g('$po', 'on')), ['move', '$po', 'grave'],
        IF(['isObj', '$h'], [['control', '$h', g('$h', 'owner')], ['set', '$h', 'y', C('side', g('$h', 'owner'))]])]}
A['study'] = {'label': 'Investigate anywhere', 'phases': ['night'],
    'source': flt(['cards', '$me', 'units'], AND(eq(g('$it', 'card'), 'professor-ida-kask'), C('canHunt', '$it'))),
    'targets': [{'as': '$t', 'prompt': 'face-down card', 'from': flt(ALLU, AND(g('$it', 'faceDown'), ne(g('$it', 'controller'), '$me')))}],
    'do': [['set', '$self', 'ex', 1], C('investigate', '$self', '$t')]}

# ---------------------------------------------------------------- cards
CARDS = []
def card(num, cid, name, typ, faction, cost=None, m=None, e=None, rarity='C', text='', kw=(), **x):
    c = {'id': cid, 'name': name, 'type': typ, 'faction': faction, 'num': num, 'rarity': rarity, 'text': text}
    if cost is not None: c['cost'] = cost
    if m is not None: c['menace'] = m
    if e is not None: c['endurance'] = e
    if kw: c['keywords'] = list(kw)
    if 'unique' in kw: c['maxCopies'] = 1
    c.update(x)
    CARDS.append(c)
    return c

def enter(*eff, text=''): return {'on': 'enter', 'zones': ['units'], 'text': text, 'do': list(eff)}
def dies(*eff, text=''): return {'on': 'dying', 'if': eq('$e.u', '$self'), 'text': text, 'do': list(eff)}
def pickUnit(frm, as_, prompt): return choose(frm, as_, prompt)
ENEMY_UNITS = flt(ALLU, AND(C('isUnit', '$it'), ne(g('$it', 'controller'), '$me')))
ANY_UNITS = flt(ALLU, C('isUnit', '$it'))
EV_UNITS = lambda pred: flt(ALLU, AND(C('isUnit', '$it'), C('evOk', '$it', '$self'), pred))

# -- Masters
def master(num, cid, name, fno, faction, essence, start, gift_cost, gift_text, gift, text):
    return card(num, cid, name, 'master', faction, rarity='L', text=text + ' Dark Gift (exhaust, ' + gift_text + ')', fno=fno, essence=essence, startRes=start, giftCost=gift_cost, gift=gift)

master('NF-001', 'lady-evangeline-marsh', 'Lady Evangeline Marsh', 1, 'cabal', 20, 3, 2, '2 Vitae): move one of your Influence cards to an adjacent district.',
    [choose(flt(['cards', '$me', 'units'], eq(g('$it', 'type'), 'influence')), '$i', 'Move which Influence?'),
     choose(C('adjD', g('$i', 'x')), '$d', 'To which district?'), ['set', '$i', 'x', g('$d', 'x')]],
    'Chairwoman of the Marsh-Whitcombe Trust. Old Money: your first Influence each turn costs 1 less.')
master('NF-017', 'mother-bramble', 'Mother Bramble', 2, 'harvest', 20, 2, 0, 'move 1 Offering from the Barrow to gain 2 Bounty).',
    [['inc', '$me', 'barrow', -1], C('addRes', '$me', 2)], 'Keeper of the Barrow. Your Effigies have +2 Endurance.')
master('NF-034', 'patient-zero', 'Patient Zero, the First Mouth', 3, 'zombie', 18, 2, 1, '1 Biomass): move up to 3 Shamblers from one district to an adjacent district.',
    [choose(flt(CITY, ANY(C('mineAt', g('$it', 'x'), '$me'), has('$it', 'shambler'))), '$from', 'Move Shamblers from which district?'),
     choose(flt(C('mineAt', g('$from', 'x'), '$me'), has('$it', 'shambler')), '$ss', 'Which Shamblers (up to 3)?', 1, 3),
     choose(C('adjD', g('$from', 'x')), '$d', 'To which district?'),
     EACH('$ss', '$s', [['set', '$s', 'x', g('$d', 'x')], emit('unitMoved', u='$s', x=g('$d', 'x'), p='$me')])],
    'Whenever one of your Shamblers dies, gain 1 extra Biomass.')
master('NF-050', 'old-hollow', 'Old Hollow, the Story Told at Campfires', 4, 'slasher', 16, 2, 2, '2 Terror): place an extra Lurker this turn.',
    [['inc', '$me', 'extraLurk', 1]], 'When an enemy unit Strikes you, you may move one of your face-down Lurkers into that unit\'s district.' + (' ' + FA_TEXT if FA else ''))
master('NF-066', 'augustin-vale', 'Augustin Vale, Ambassador of the Morning Star Society', 5, 'devil', 20, 2, 2, '2 Sin): search your deck for a Vessel and put it into your hand.',
    [choose(flt(['cards', '$me', 'deck'], has('$it', 'vessel')), '$v', 'Search for which Vessel?', 0, 1), ['move', '$v', 'hand'], ['shuffle', '$me', 'deck']],
    'Your Bargains cost 1 less.')

# -- Blood Cabal
card('NF-002', 'velvet-rope-fledgling', 'Velvet Rope Fledgling', 'horror', 'cabal', 1, 2, 1, 'C', 'Swift. Thirst 1.', ('vampire', 'swift'), sub_='Vampire')
card('NF-003', 'associate-of-the-firm', 'Associate of the Firm', 'horror', 'cabal', 3, 3, 3, 'C', 'Thirst 1. When it Feeds, gain 1 extra Vitae.', ('vampire',))
card('NF-004', 'the-sommelier', 'The Sommelier', 'horror', 'cabal', 2, 1, 3, 'U', 'Thirst 1. Whenever you Drain a Thrall, gain 1 extra Vitae.', ('vampire',))
card('NF-005', 'mr-kessler', 'Mr. Kessler, Head of Security', 'horror', 'cabal', 4, 3, 5, 'U', 'Thirst 1. Guard.', ('vampire', 'unique', 'guard'))
card('NF-006', 'countess-ilse-varga', 'Countess Ilse Varga, the Old Country', 'horror', 'cabal', 6, 5, 5, 'R', 'Thirst 2. When she Feeds, take a second Citizen from that district. Enemy Mortals in her district have −1 Menace.', ('vampire', 'elder', 'unique'))
card('NF-007', 'silas-whitmore', 'Silas Whitmore, the Old Blood', 'horror', 'cabal', 7, 4, 7, 'L', 'Thirst 2. At your Toll, your opponent loses 1 Essence for each district where you have Influence.', ('vampire', 'elder', 'unique'))
card('NF-008', 'the-familiar', 'The Familiar', 'puppet', 'cabal', 1, 1, 2, 'C', 'When it dies, gain 2 Vitae.', ('mortal',),
     abilities=[dies(C('addRes', '$e.ctrl', 2), text='gain 2 Vitae')])
card('NF-009', 'bought-detective', 'Bought Detective', 'puppet', 'cabal', 2, 2, 2, 'C', 'When it enters, Investigate a face-down card in its district.', ('mortal',),
     abilities=[enter(choose(flt(ALLU, AND(g('$it', 'faceDown'), ne(g('$it', 'controller'), '$me'), eq(g('$it', 'x'), g('$self', 'x')))), '$t', 'Investigate which face-down card?', 0, 1),
                      C('investigate', '$self', '$t'), text='Investigate')])
card('NF-010', 'councilman-doyle', 'Councilman Doyle', 'puppet', 'cabal', 3, 1, 3, 'U', 'Counts as 2 Influence in his district.', ('mortal', 'unique'), inf=2)
card('NF-011', 'blood-bank-holdings', 'Blood Bank Holdings', 'influence', 'cabal', 2, None, 3, 'C', 'At your Gather, gain 1 Vitae.', inf=1)
card('NF-012', 'the-velvet-club', 'The Velvet Club', 'influence', 'cabal', 3, None, 3, 'U', 'Your Vampires here have +1 Menace. Once per turn, Mend one of them for free.', inf=1)
card('NF-013', 'hostile-takeover', 'Hostile Takeover', 'influence', 'cabal', 4, None, 4, 'R', 'When it enters, move up to 2 Citizens from this district to adjacent districts.', inf=2,
     abilities=[enter(EACH(['range', 2], '$i', [IF(gt(cit(g('$self', 'x')), 0), [
         choose(['concat', lit(['stay']), C('adjD', g('$self', 'x'))], '$to', 'Hostile Takeover: move a Citizen where? (stay = no)'),
         IF(ne('$to', 'stay'), [['inc', C('dAt', g('$self', 'x')), 'cit', -1], ['inc', '$to', 'cit', 1]])])]), text='move Citizens out')])
card('NF-014', 'a-quiet-word-with-the-mayor', 'A Quiet Word with the Mayor', 'scheme', 'cabal', 4, None, None, 'U', 'Fast. Cancel a non-unit card as it is played. Its owner draws a card.', ('fast',),
     effect=[['set', 'game', 'cancel', 1]])
card('NF-015', 'exsanguinate', 'Exsanguinate', 'scheme', 'cabal', 0, None, None, 'R', 'Fast. Cost X. Drain X Thralls. Deal 2X wounds to a unit, or X damage to the rival Master.', ('fast',),
     effect=[choose(['map', ['range', ['min', g('$me', 'thralls'), res('$me')]], add('$it', 1)], '$X', 'Choose X'),
             C('addRes', '$me', ['neg', '$X']), ['inc', '$me', 'thralls', ['neg', '$X']], C('addRes', '$me', ['*', 2, '$X']),
             choose(['concat', ['list', '$opp'], ENEMY_UNITS], '$t', 'Exsanguinate: the rival Master or a unit'),
             IF(['isPlayer', '$t'], [['damage', '$t', '$X', '$self']], [['damage', '$t', ['*', 2, '$X'], '$self']])])
card('NF-016', 'nothing-to-see-here', 'Nothing to See Here', 'scheme', 'cabal', 1, None, None, 'C', 'Fast. Return one of your units to your hand, or prevent all damage to one of your Influence cards this turn.', ('fast',),
     effect=[choose(flt(['cards', '$me', 'units'], OR(C('isUnit', '$it'), eq(g('$it', 'type'), 'influence'))), '$t', 'Return a unit, or shield an Influence'),
             IF(eq(g('$t', 'type'), 'influence'), [['set', '$t', 'shield', '$turn']], [['move', '$t', 'hand']])])

# -- Harvest Cult
card('NF-018', 'hollow-eyed-farmhand', 'Hollow-Eyed Farmhand', 'folk', 'harvest', 1, 1, 2, 'C', 'Reaping: +1 Menace.', ('mortal', 'folk'))
card('NF-019', 'maypole-dancers', 'Maypole Dancers', 'folk', 'harvest', 2, 2, 2, 'C', 'When they enter, a Planting gains 1 Growth.', ('mortal', 'folk'),
     abilities=[enter(choose(['cards', '$me', 'field'], '$pl', 'Which Planting grows?', 0, 1), ['inc', '$pl', 'growth', 1], text='a Planting grows')])
card('NF-020', 'the-corn-bride', 'The Corn Bride', 'folk', 'harvest', 3, 2, 3, 'U', 'When she takes an Offering, gain 2 Bounty.', ('mortal', 'folk', 'unique'))
card('NF-021', 'sheaf-masked-elder', 'Sheaf-Masked Elder', 'folk', 'harvest', 4, 3, 4, 'U', 'Your Rites cost 1 less.', ('mortal', 'folk'))
card('NF-022', 'the-little-people', 'The Little People', 'horror', 'harvest', 2, 2, 1, 'C', 'Stolen Away: when it Preys, draw a card.', ('fae',))
card('NF-023', 'thing-in-the-hedgerow', 'Thing in the Hedgerow', 'horror', 'harvest', 3, 3, 2, 'U', 'Swift. It can move to any district with your Effigy.', ('fae', 'swift'))
card('NF-024', 'something-in-the-stalks', 'Something in the Stalks', 'horror', 'harvest', 5, 5, 5, 'R', 'Guard. Growing: +2 Endurance.', ('fae', 'guard'))
card('NF-025', 'scarecrow-sentinel', 'Scarecrow Sentinel', 'effigy', 'harvest', 2, None, 4, 'C', 'Enemy units that move into this district take 1 wound.', dominion=1)
card('NF-026', 'the-standing-stone', 'The Standing Stone', 'effigy', 'harvest', 3, None, 6, 'U', 'Your Folk here have +1/+1.', dominion=2)
card('NF-027', 'the-wicker-colossus', 'The Wicker Colossus', 'effigy', 'harvest', 5, None, 6, 'R', 'Reaping: at your Toll you may burn it. Take up to 3 Citizens here as Offerings and deal 2 wounds to each enemy Mortal here, then discard it.', dominion=2)
card('NF-028', 'blood-barley', 'Blood Barley', 'planting', 'harvest', 1, None, None, 'C', 'Ripen 2. Yield: 3 Bounty.', ripen=2, **{'yield': 3})
card('NF-029', 'mandrake-patch', 'Mandrake Patch', 'planting', 'harvest', 2, None, None, 'U', 'Ripen 3. Yield: 2 Bounty, and create a 2/1 Mandrake Fae token in any district.', ripen=3, **{'yield': 2})
card('NF-030', 'rite-of-the-first-furrow', 'Rite of the First Furrow', 'rite', 'harvest', 1, None, None, 'C', 'Sowing: play a Planting from your hand for free, with 1 Growth. Other seasons: a Planting gains 1 Growth.',
     effect=[IF(eq(g('$me', 'season'), 1), [IF(gt(cnt(['freeSlots', '$me', 'field']), 0), [
         choose(flt(['cards', '$me', 'hand'], eq(g('$it', 'type'), 'planting')), '$pl', 'Plant which card for free?', 0, 1),
         IF(['isObj', '$pl'], [['move', '$pl', 'field', {'as': '$np'}], ['set', '$np', 'growth', 1]])])],
         [choose(['cards', '$me', 'field'], '$pl', 'Which Planting grows?', 0, 1), ['inc', '$pl', 'growth', 1]])])
card('NF-031', 'the-reaping-hymn', 'The Reaping Hymn', 'rite', 'harvest', 3, None, None, 'R', 'Reaping: each of your Folk may Prey once more this turn without exhausting. Other seasons: one Folk may Prey.',
     effect=[IF(eq(g('$me', 'season'), 3), [EACH(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), has('$it', 'folk'))), '$f', [['set', '$f', 'xprey', 1]])],
         [choose(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), has('$it', 'folk'))), '$f', 'Which Folk may Prey?', 0, 1), ['set', '$f', 'mayPrey', 1]])])
card('NF-032', 'fallow-rest', 'Fallow Rest', 'rite', 'harvest', 2, None, None, 'C', 'Fallow: draw 2 cards and a Planting gains 2 Growth. Other seasons: gain 2 Bounty.',
     effect=[IF(eq(g('$me', 'season'), 0), [['draw', '$me', 2], choose(['cards', '$me', 'field'], '$pl', 'Which Planting grows?', 0, 1), ['inc', '$pl', 'growth', 2]],
         [C('addRes', '$me', 2)])])
card('NF-033', 'he-who-wears-the-hill', 'He Who Wears the Hill', 'oldone', 'harvest', None, 8, 12, 'L', f'Set aside. Awaken with {AW} Offerings. Events can\'t target it. Dominion 4. Harvests its district at your Reaping Tolls.',
     ('unique', 'aloof'), awaken=LEVERS['AWAKEN'], dominion=4)

# -- Zombie Horde
card('NF-035', 'fresh-turned', 'Fresh Turned', 'horror', 'zombie', 1, 1, 2, 'C', 'When it dies, create a Shambler here.', ('zombie',),
     abilities=[dies(['create', 'shambler', '$e.ctrl', 'units', {'as': '$s'}], C('place', '$s', '$e.x', '$e.ctrl'), text='a Shambler rises')])
card('NF-036', 'hazmat-shambler', 'Hazmat Shambler', 'horror', 'zombie', 2, 2, 3, 'C', 'Prevent the first wound it takes each turn.', ('zombie',))
card('NF-037', 'sprinter', 'Sprinter', 'horror', 'zombie', 2, 3, 1, 'C', 'Swift. It can move twice each turn.', ('zombie', 'swift'))
card('NF-038', 'bloated-carrier', 'Bloated Carrier', 'horror', 'zombie', 3, 1, 4, 'U', 'When it dies, Infect up to 2 Citizens here and deal 1 wound to every other unit here.', ('zombie',),
     abilities=[dies(['let', '$me', '$e.ctrl'], C('infect', '$e.x', '$e.ctrl'), C('infect', '$e.x', '$e.ctrl'),
                     EACH(C('unitsAt', '$e.x'), '$o', [['damage', '$o', 1]]), text='bursts')])
card('NF-039', 'crawler-swarm', 'Crawler Swarm', 'horror', 'zombie', 3, 2, 2, 'C', 'When it enters, create 2 Shamblers here.', ('zombie',),
     abilities=[enter(EACH(['range', 2], '$i', [['create', 'shambler', '$me', 'units', {'as': '$s'}], C('place', '$s', g('$self', 'x'), '$me'), ['set', '$s', 'fresh', 1]]), text='2 Shamblers')])
card('NF-040', 'subject-12-lockjaw', 'Subject 12, "Lockjaw"', 'horror', 'zombie', 5, 5, 5, 'R', 'Relentless.', ('zombie', 'abomination', 'unique', 'relentless'))
card('NF-041', 'the-amalgam', 'The Amalgam', 'horror', 'zombie', 7, 6, 8, 'L', 'Costs 1 less for each Shambler you control. When it kills a unit in a Clash, put a +1/+1 counter on it.', ('zombie', 'abomination', 'unique'))
card('NF-042', 'exposed-ribcage-maw', 'Exposed Ribcage Maw', 'mutation', 'zombie', 2, None, None, 'U', 'The attached Zombie gets +2 Menace. When it Devours, it Infects instead.', gm=2)
card('NF-043', 'chitin-plating', 'Chitin Plating', 'mutation', 'zombie', 2, None, None, 'C', 'The attached Zombie gets +0/+3 and Guard.', ge=3, gg=1)
card('NF-044', 'tendril-lash', 'Tendril Lash', 'mutation', 'zombie', 3, None, None, 'U', 'The attached Zombie gets +1 Menace and can Clash units in adjacent districts.', gm=1)
card('NF-045', 'lazarus-7', 'LAZARUS-7', 'strain', 'zombie', 3, None, None, 'U', 'Your Shamblers have +1 Menace.')
card('NF-046', 'vector-b', 'VECTOR-B (Airborne)', 'strain', 'zombie', 5, None, None, 'R', 'Spread triggers in districts with 2 or more of your Zombies.')
card('NF-047', 'containment-breach', 'Containment Breach', 'outbreak', 'zombie', 2, None, None, 'C', 'Create a Shambler in each of two different districts.',
     effect=[choose(CITY, '$ds', 'Choose two districts', 2, 2), EACH('$ds', '$d', [['create', 'shambler', '$me', 'units', {'as': '$s'}], C('place', '$s', g('$d', 'x'), '$me'), ['set', '$s', 'fresh', 1]])])
card('NF-048', 'feeding-frenzy', 'Feeding Frenzy', 'outbreak', 'zombie', 3, None, None, 'U', 'Each of your Shamblers in one district Devours a Citizen there without exhausting.',
     effect=[choose(flt(CITY, ANY(C('mineAt', g('$it', 'x'), '$me'), has('$it', 'shambler'))), '$d', 'Feeding Frenzy: which district?', 0, 1),
             IF(['isObj', '$d'], [EACH(flt(C('mineAt', g('$d', 'x'), '$me'), has('$it', 'shambler')), '$s', [C('take', '$s', g('$d', 'x'))])])])
card('NF-049', 'cleanup-crew-lost', 'Cleanup Crew Lost', 'outbreak', 'zombie', 3, None, None, 'C', 'Destroy a Mortal unit with Endurance 3 or less, and create a Shambler in its place.',
     effect=[choose(EV_UNITS(AND(has('$it', 'mortal'), le(C('endur', '$it'), 3))), '$t', 'Destroy which Mortal?', 0, 1),
             IF(['isObj', '$t'], [LET('$x', g('$t', 'x')), ['set', '$t', 'dmg', 99],
                 ['create', 'shambler', '$me', 'units', {'as': '$s'}], C('place', '$s', '$x', '$me'), ['set', '$s', 'fresh', 1]])])
card('NF-T01', 'shambler', 'Shambler', 'horror', 'zombie', 0, 1, 1, 'C', 'Token. Slow: moves only through card effects.' + (" Mindless: it can't Prey or Strike." if not (LEVERS['SHAMBLER_PREY'] or LEVERS['SHAMBLER_STRIKE']) else ''), ('zombie', 'shambler', 'slow', 'token'), maxCopies=0)

# -- Slasher Killers
def killer(num, cid, name, cost, m, e, text, **x):
    return card(num, cid, name, 'killer', 'slasher', cost, m, e, 'R', 'Undying. ' + text, ('unique', 'undying'), **x)
killer('NF-051', 'the-groundskeeper', 'The Groundskeeper', 4, 4, 5, 'When he Slays, Panic moves 2 Citizens instead of 1.')
killer('NF-052', 'mister-lullaby', 'Mister Lullaby', 3, 3, 3, 'Dreamwalker: when he reveals to Hunt, he may Hunt in any district and is moved there.')
killer('NF-053', 'the-hook-handed-man', 'The Hook-Handed Man', 3, 3, 4, '+2 Menace when Clashing Mortals.')
killer('NF-054', 'the-caller', 'The Caller', 2, 2, 2, 'While face down, gain 1 Terror at your Rise. When revealed, your opponent discards a card at random.')
card('NF-055', 'rusted-machete', 'Rusted Machete', 'weapon', 'slasher', 1, None, None, 'C', 'The attached Killer gets +2 Menace.', gm=2)
card('NF-056', 'chainsaw', 'Chainsaw', 'weapon', 'slasher', 3, None, None, 'U', 'The attached Killer gets +3 Menace. Its Slay takes 2 Citizens.', gm=3)
card('NF-057', 'garden-shears', 'Garden Shears', 'weapon', 'slasher', 2, None, None, 'U', 'The attached Killer gets +1 Menace and can Slay while face down without being revealed.', gm=1)
card('NF-058', 'bear-trap', 'Bear Trap', 'trap', 'slasher', 1, None, None, 'C', 'Springs when an enemy unit moves into or Hunts in this district. That unit takes 3 wounds and is exhausted.', springOn=['move', 'hunt', 'investigate'])
card('NF-059', 'the-basement-door', 'The Basement Door', 'trap', 'slasher', 2, None, None, 'U', 'Springs when an enemy unit Investigates here. Destroy it if it is Mortal; otherwise it takes 2 wounds.', springOn=['investigate'])
card('NF-060', 'just-the-cat', 'Just the Cat', 'trap', 'slasher', 0, None, None, 'C', 'Springs when Investigated. The Investigating unit stays exhausted through its owner\'s next Rise. Gain 1 Terror and draw a card.', springOn=['investigate'])
card('NF-061', 'dont-go-in-there', "Don't Go in There", 'scene', 'slasher', 1, None, None, 'C', 'Move a Citizen or an enemy Mortal unit from an adjacent district into a district with your Lurker.',
     effect=[choose(flt(CITY, gt(cnt(C('lurkersAt', g('$it', 'x'), '$me')), 0)), '$d', 'Into which district with your Lurker?', 0, 1),
             IF(['isObj', '$d'], [
                 choose(['concat', flt(C('adjD', g('$d', 'x')), AND(gt(g('$it', 'cit'), 0), NOT(C('livingIs', g('$it', 'x'), 'maple')))),
                         flt(ENEMY_UNITS, AND(has('$it', 'mortal'), C('adj', g('$it', 'x'), g('$d', 'x'))))], '$w', 'Lure a Citizen (pick its district) or an enemy Mortal', 0, 1),
                 IF(eq(g('$w', 'type'), 'district'), [['inc', '$w', 'cit', -1], ['inc', '$d', 'cit', 1]],
                    [IF(['isObj', '$w'], [['set', '$w', 'x', g('$d', 'x')], emit('unitMoved', u='$w', x=g('$d', 'x'), p=g('$w', 'controller'))])])])])
card('NF-062', 'the-phone-call', 'The Phone Call', 'scene', 'slasher', 2, None, None, 'U', 'Your opponent reveals their hand. Discard an Event from it, and gain 1 Terror.',
     effect=[['move', ['cards', '$opp', 'hand'], 'shown', {'as': '$h'}],
             choose(flt(['cards', '$opp', 'shown'], eq(g('$it', 'type'), 'event')), '$ev', 'Discard which Event?', 0, 1),
             ['move', '$ev', 'grave'], ['move', ['cards', '$opp', 'shown'], 'hand'], C('addRes', '$me', 1)])
card('NF-063', 'its-never-over', "It's Never Over", 'scene', 'slasher', 2, None, None, 'R', 'Return a Killer from The Dark now, as a Lurker in any district, with its Sequel badge.',
     effect=[choose(['cards', '$me', 'dark'], '$k', 'Return which Killer?', 0, 1), IF(['isObj', '$k'], [C('returnKiller', '$k')])])
card('NF-064', 'the-party', 'The Party', 'scene', 'slasher', 3, None, None, 'U', 'Move up to 3 Citizens from anywhere into one district. A Killer there may Hunt once more this turn.',
     effect=[choose(CITY, '$d', 'The Party: which district?'),
             EACH(['range', 3], '$i', [choose(['concat', lit(['done']), flt(CITY, AND(ne('$it', '$d'), gt(g('$it', 'cit'), 0), NOT(C('livingIs', g('$it', 'x'), 'maple'))))], '$f', 'Move a Citizen from where? (done = stop)'),
                                       IF(ne('$f', 'done'), [['inc', '$f', 'cit', -1], ['inc', '$d', 'cit', 1]])]),
             EACH(['slice', flt(C('mineAt', g('$d', 'x'), '$me'), eq(g('$it', 'type'), 'killer')), 0, 1], '$k', [['set', '$k', 'ex', 0]])])
card('NF-065', 'final-scream', 'Final Scream', 'scene', 'slasher', 4, None, None, 'R', 'Each of your revealed Killers Slays a Citizen in its district.',
     effect=[EACH(flt(['cards', '$me', 'units'], AND(C('isUnit', '$it'), eq(g('$it', 'type'), 'killer'))), '$k', [C('slay', g('$k', 'x'))])])

# -- Devil's Own
card('NF-067', 'margaret-wells', 'Margaret Wells, the Expectant Mother', 'disciple', 'devil', 2, 0, 4, 'R', "Vessel. While another Disciple is in her district, she can't be Clashed.", ('mortal', 'disciple', 'vessel', 'unique'),
     abilities=[dies(C('halve', '$e.ctrl'), text='the Prophecy falters')])
card('NF-068', 'sister-abigail', 'Sister Abigail, the Chosen', 'disciple', 'devil', 3, 1, 5, 'R', 'Vessel. When she enters, gain 2 Sin.', ('mortal', 'disciple', 'vessel', 'unique'),
     abilities=[enter(C('addRes', '$me', 2), text='gain 2 Sin'), dies(C('halve', '$e.ctrl'), text='the Prophecy falters')])
card('NF-069', 'doting-neighbors', 'Doting Neighbors', 'disciple', 'devil', 2, 1, 2, 'C', "Guard. At your Rise, if they're in your Vessel's district, gain 1 Sin.", ('mortal', 'disciple', 'guard'))
card('NF-070', 'the-governess', 'The Governess', 'disciple', 'devil', 3, 2, 3, 'U', 'Once per turn, she may Intercept for a Vessel in any district, moving there to do it.', ('mortal', 'disciple', 'unique'))
card('NF-071', 'the-black-priest', 'The Black Priest', 'disciple', 'devil', 3, 2, 2, 'U', 'Your Omens cost 1 less.', ('mortal', 'disciple'))
card('NF-072', 'hellhound', 'Hellhound', 'horror', 'devil', 3, 3, 3, 'C', 'Swift. +1 Menace while Intercepting.', ('demon', 'swift'))
card('NF-073', 'the-possessed-girl', 'The Possessed Girl', 'horror', 'devil', 4, 3, 4, 'R', 'When she Corrupts, gain 2 Souls instead of 1. Hunters in her district have −2 Menace.', ('possessed', 'unique'))
card('NF-074', 'azrimoth', 'Azrimoth, Duke Below', 'horror', 'devil', 7, 6, 6, 'L', 'When he enters, take control of an enemy unit in his district with Menace 2 or less.', ('demon', 'unique'),
     abilities=[enter(choose(flt(C('enemyAt', g('$self', 'x'), '$me'), le(C('menace', '$it'), 2)), '$t', 'Take control of which unit?', 0, 1),
                      IF(['isObj', '$t'], [['control', '$t', '$me'], ['set', '$t', 'y', C('side', '$me')]]), text='take a servant')])
def omen(num, cid, name, cost, rarity, text, gest): return card(num, cid, name, 'omen', 'devil', cost, None, None, rarity, text, gest=gest)
omen('NF-075', 'the-jackals-birthmark', "The Jackal's Birthmark", 1, 'C', 'Portent: you Corrupt a Citizen in a district with your Disciple. Fulfilled: Gestation +1.', 1)
omen('NF-076', 'ravens-on-the-steeple', 'Ravens on the Steeple', 2, 'U', 'Portent: an enemy Hunter dies. Fulfilled: Gestation +2.', 2)
omen('NF-077', 'tithe-of-souls', 'Tithe of Souls', 3, 'U', 'Portent: spend 3 Souls, at any time. Fulfilled: Gestation +2.', 2)
omen('NF-078', 'the-blood-moon', 'The Blood Moon', 4, 'R', 'Portent: it is the Witching Hour (12 AM) or later at your Rise. Fulfilled: Gestation +3.', 3)
card('NF-079', 'unclean-spirit', 'Unclean Spirit', 'possession', 'devil', 2, None, None, 'U', 'Costs 2 + 1 Soul. Attach to an enemy Mortal unit. You control it.', souls=1)
card('NF-080', 'the-exorcism-fails', 'The Exorcism Fails', 'possession', 'devil', 5, None, None, 'R', 'Costs 5 + 2 Souls. Attach to an enemy Horror that cost 4 or less. You control it.', souls=2)
card('NF-081', 'the-crossroads-deal', 'The Crossroads Deal', 'bargain', 'devil', 1, None, None, 'U', 'Accept: they draw 3 cards and take a Pact. Refuse: you gain 3 Sin and draw a card.',
     effect=[choose(lit(['accept', 'refuse']), '$a', 'The Crossroads Deal: Accept (draw 3, take a Pact) or Refuse (they gain 3 Sin and draw)?', who='$opp'),
             IF(eq('$a', 'accept'), [['draw', '$opp', 3], ['inc', '$opp', 'pacts', 1]], [C('addRes', '$me', 3), ['draw', '$me', 1]])])
card('NF-082', 'a-name-in-the-ledger', 'A Name in the Ledger', 'bargain', 'devil', 2, None, None, 'R', 'Accept: they gain 4 of their resource and take a Pact. Refuse: Gestation +1.',
     effect=[choose(lit(['accept', 'refuse']), '$a', 'A Name in the Ledger: Accept (gain 4 resource, take a Pact) or Refuse (Gestation +1)?', who='$opp'),
             IF(eq('$a', 'accept'), [C('addRes', '$opp', 4), ['inc', '$opp', 'pacts', 1]], [C('gest', 1)])])
card('NF-083', 'the-child', 'The Child', 'child', 'devil', None, 0, 9, 'L', "Set aside. Born at Gestation 9. Events can't target it, and it can't move or Hunt. Your Disciples and Demons in its district gain Guard. If it is in play at your next Rise, you win.",
     ('unique', 'aloof', 'slow', 'nohunt'))

# -- Neutral
card('NF-084', 'the-final-girl', 'The Final Girl', 'hunter', 'neutral', 3, 2, 4, 'R', 'The first time she would die each game, remove her wounds and exhaust her instead. A Killer she destroys is Ended and removed from the game.', ('mortal', 'unique'))
card('NF-085', 'father-moreno', 'Father Moreno, Exorcist', 'hunter', 'neutral', 4, 2, 4, 'R', 'Demons and Possessed in his district have −2 Menace. Exhaust: remove a Possession from a unit in his district.', ('mortal', 'unique'))
card('NF-086', 'professor-ida-kask', 'Professor Ida Kask, Occultist', 'hunter', 'neutral', 3, 1, 3, 'U', 'Exhaust: Investigate a face-down card in any district. Vampires in her district can\'t Mend.', ('mortal', 'unique'))
card('NF-087', 'sheriff-dale-burke', 'Sheriff Dale Burke', 'hunter', 'neutral', 2, 3, 3, 'C', 'Guard.', ('mortal', 'guard'))
card('NF-088', 'neighborhood-watch', 'Neighborhood Watch', 'hunter', 'neutral', 1, 1, 2, 'C', 'When it dies, its controller draws a card.', ('mortal',),
     abilities=[dies(['draw', '$e.ctrl', 1], text='draw a card')])
card('NF-089', 'pale-morning-light', 'Pale Morning Light', 'event', 'neutral', 2, None, None, 'C', 'Deal 2 wounds to a Horror, or 4 to a Vampire.',
     effect=[choose(EV_UNITS(eq(g('$it', 'type'), 'horror')), '$t', 'Pale Morning Light: which Horror?', 0, 1),
             ['damage', '$t', Q(has('$t', 'vampire'), 4, 2), '$self']])
card('NF-090', 'molotov-cocktail', 'Molotov Cocktail', 'event', 'neutral', 2, None, None, 'C', 'Deal 2 wounds to each unit and 3 to each structure in one district.',
     effect=[choose(CITY, '$d', 'Molotov Cocktail: which district?'),
             EACH(flt(ALLU, AND(eq(g('$it', 'x'), g('$d', 'x')), C('isUnit', '$it'), C('evOk', '$it', '$self'))), '$o', [['damage', '$o', 2, '$self']]),
             EACH(flt(ALLU, AND(eq(g('$it', 'x'), g('$d', 'x')), C('isStruct', '$it'))), '$o', [['damage', '$o', 3, '$self']])])
card('NF-091', 'expose-in-the-evening-herald', 'Exposé in the Evening Herald', 'event', 'neutral', 2, None, None, 'U', 'Destroy an Influence, Effigy or Strain, or Investigate every face-down card in one district.',
     effect=[choose(['concat', flt(['concat', ALLU, ['cards', '*', 'labs']], AND(C('face', '$it'), inl(g('$it', 'type'), lit(['influence', 'effigy', 'strain'])), ne(g('$it', 'controller'), '$me'))),
                     flt(CITY, ANY(ALLU, AND(g('$it', 'faceDown'), ne(g('$it', 'controller'), '$me'))))], '$t', 'Destroy a structure or Strain, or pick a district to expose', 0, 1),
             IF(eq(g('$t', 'type'), 'district'), [EACH(flt(ALLU, AND(g('$it', 'faceDown'), ne(g('$it', 'controller'), '$me'), eq(g('$it', 'x'), g('$t', 'x')))), '$f', [C('investigate', '$self', '$f')])],
                [['destroy', '$t']])])
card('NF-092', 'evacuation-order', 'Evacuation Order', 'event', 'neutral', 1, None, None, 'C', 'Move up to 2 Citizens from one district to an adjacent district. At least 1 Citizen stays behind.',
     effect=[choose(flt(CITY, AND(gt(g('$it', 'cit'), 1), NOT(C('livingIs', g('$it', 'x'), 'maple')))), '$f', 'Evacuate which district?', 0, 1),
             IF(['isObj', '$f'], [choose(C('adjD', g('$f', 'x')), '$to', 'To which adjacent district?'),
                 LET('$n', ['min', 2, sub(g('$f', 'cit'), 1)]), ['inc', '$f', 'cit', ['neg', '$n']], ['inc', '$to', 'cit', '$n']])])
card('NF-093', 'blackout', 'Blackout', 'event', 'neutral', 1, None, None, 'U', 'Exhaust every unit in one district.',
     effect=[choose(CITY, '$d', 'Blackout: which district?'), EACH(flt(C('unitsAt', g('$d', 'x')), C('evOk', '$it', '$self')), '$o', [['set', '$o', 'ex', 1]])])
card('NF-094', 'silver-etched-revolver', 'Silver-Etched Revolver', 'relic', 'neutral', 3, None, None, 'R', "Attach to a Hunter: +2 Menace. Wounds it deals can't be Mended or prevented.", gm=2)
card('NF-095', 'the-black-grimoire', 'The Black Grimoire', 'relic', 'neutral', 2, None, None, 'U', 'Attach to your Master. Once per turn, pay 2 of your resource to draw a card.')
card('NF-T02', 'mandrake', 'Mandrake', 'horror', 'harvest', 0, 2, 1, 'C', 'Token. Fae.', ('fae', 'token'), maxCopies=0)

# -- Districts (both sides)
DISTRICTS = [
    ('NF-096', 'old-town', 'oldtown', 'Old Town', 4, 'Units here have +1 Endurance.', 'The Haunted Quarter', "Events can't target your units here."),
    ('NF-097', 'the-docks', 'docks', 'The Docks', 4, 'At each Toll, if 2 or more Citizens remain, add 1 Citizen, up to 6.', "Smugglers' Wharf", 'Gain 1 extra resource at your Gather.'),
    ('NF-098', 'financial-district', 'financial', 'Financial District', 5, 'Influence here counts double.', 'The Black Tower', 'Draw 1 extra card at your Draw.'),
    ('NF-099', 'st-agnes-hospital', 'hospital', 'St. Agnes Hospital', 5, 'At each Toll, remove 1 wound from each Mortal here.', 'The Morgue', 'Once per turn, when any unit dies, gain 1 resource.'),
    ('NF-100', 'holy-cross-cathedral', 'cathedral', 'Holy Cross Cathedral', 4, 'Hunters here have +1/+1. Demons here have −1 Menace.', 'The Desecrated Nave', 'Your Rites and Omens cost 1 less. If the Devil\'s Own claims it, Gestation +1.'),
    ('NF-101', 'maple-hollow-suburbs', 'maple', 'Maple Hollow Suburbs', 6, "Citizens here can't be moved by Panic or by Events.", 'The Quiet Cul-de-sac', 'Your units here have Guard.'),
    ('NF-102', 'whispering-pines-campground', 'campground', 'Whispering Pines Campground', 3, "Units that arrived this turn can't Investigate Lurkers here.", "Lovers' Lane", 'Your units here have +1 Menace against Mortals.'),
    ('NF-103', 'the-subway', 'subway', 'The Subway', 3, 'Adjacent to every district.', 'The Deep Tunnels', 'Your units may move from any district to any district.'),
]
for num, cid, key, name, pop, living, fname, fallen in DISTRICTS:
    card(num, cid, name, 'district', 'neutral', None, None, None, 'C', f'Population {pop}. {living}', key=key, population=pop, fallen=cid + '-fallen', maxCopies=1)
    card(num, cid + '-fallen', f'{fname} (Fallen)', 'district', 'neutral', None, None, None, 'C', f'Claimed. {fallen}', key=key, maxCopies=0)

# ---------------------------------------------------------------- rules
NEUTRAL_MAX = 10
RULES = {
    'players': {'min': 2, 'max': 2},
    'playerVars': {'essence': 0, 'claims': 0, 'trophies': 0, 'faction': 0},
    'gameVars': {'hour': 0, 'cancel': 0, 'first': 0, 'noMulligan': 0},
    'objectVars': {'x': 0, 'y': 0, 'dmg': 0, 'ex': 0, 'fresh': 0, 'hunted': 0, 'moves': 0, 'cit': -1, 'claim': 0, 'last': 0, 'growth': 0,
                   'plus': 0, 'amb': 0, 'hz': 0, 'shield': 0, 'saved': 0, 'stun': 0, 'xprey': 0, 'mayPrey': 0, 'ended': 0, 'sc': 0, 'frenzy': 0, 'gcl': 0, 'silver': 0, 'struck': 0},
    'grid': {'cols': 5, 'rows': 3, 'zones': ['units', 'city']},
    'zones': [
        {'id': 'deck', 'vis': 'hidden', 'ordered': True},
        {'id': 'hand', 'vis': 'owner'},
        {'id': 'lair', 'vis': 'public', 'abilities': True},
        {'id': 'units', 'vis': 'public', 'abilities': True},
        {'id': 'gear', 'vis': 'public', 'abilities': True, 'hideEmpty': True},
        {'id': 'field', 'vis': 'public', 'hideEmpty': True, 'showIf': eq(g('$me', 'faction'), 2), 'slots': [{'id': 'furrow-1'}, {'id': 'furrow-2'}, {'id': 'furrow-3'}]},
        {'id': 'labs', 'vis': 'public', 'hideEmpty': True, 'showIf': eq(g('$me', 'faction'), 3), 'slots': [{'id': 'lab-a'}, {'id': 'lab-b'}]},
        {'id': 'omens', 'vis': 'public', 'hideEmpty': True, 'showIf': eq(g('$me', 'faction'), 5), 'slots': [{'id': 'omen-1'}, {'id': 'omen-2'}, {'id': 'omen-3'}]},
        {'id': 'limbo', 'vis': 'public', 'hideEmpty': True},
        {'id': 'shown', 'vis': 'public', 'hideEmpty': True},
        {'id': 'aside', 'vis': 'public', 'hideEmpty': True},
        {'id': 'dark', 'vis': 'public', 'hideEmpty': True},
        {'id': 'removed', 'vis': 'public', 'hideEmpty': True},
        {'id': 'grave', 'vis': 'public', 'ordered': True},
        {'id': 'city', 'vis': 'public', 'shared': True},
        {'id': 'brought', 'vis': 'public', 'hideEmpty': True},
        {'id': 'draft', 'vis': 'public', 'shared': True, 'hideEmpty': True},
        {'id': 'unused', 'vis': 'hidden', 'shared': True, 'offTable': True},
        {'id': 'pool', 'vis': 'hidden', 'shared': True, 'offTable': True},
    ],
    'deckZone': 'deck', 'handZone': 'hand', 'graveZone': 'grave',
    'format': {
        'deckMin': 40, 'deckMax': 40, 'maxCopies': 3, 'copiesBy': 'name',
        'zones': [
            {'zone': 'lair', 'min': 1, 'max': 1, 'types': ['master']},
            {'zone': 'deck', 'min': 40, 'max': 40, 'types': ['horror', 'hunter', 'puppet', 'folk', 'disciple', 'killer', 'influence', 'effigy', 'planting', 'event', 'scheme',
                                                            'rite', 'outbreak', 'scene', 'bargain', 'mutation', 'weapon', 'relic', 'possession', 'strain', 'omen', 'trap']},
            {'zone': 'aside', 'min': 0, 'max': 1, 'types': ['oldone', 'child']},
            {'zone': 'brought', 'min': 0, 'max': 3, 'types': ['district'], 'maxCopies': 1},
        ],
        'rules': [
            {'if': ['all', '$deck', OR(eq(['def', '$it', 'faction'], 'neutral'), eq(['def', '$it', 'faction'], ['def', ['first', '$sections.lair'], 'faction']))],
             'why': "Every card must be neutral or from your Master's faction"},
            {'if': le(cnt(flt('$sections.deck', eq(['def', '$it', 'faction'], 'neutral'))), NEUTRAL_MAX), 'why': 'At most 10 neutral cards'},
            {'if': le(cnt(flt('$sections.deck', eq(['def', '$it', 'type'], 'killer'))), 4), 'why': 'At most 4 Killers'},
            {'if': inl(cnt('$sections.brought'), lit([0, 3])), 'why': 'Advanced play: bring exactly 3 Districts (or none for the core-set City)'},
        ],
    },
    'turnLimit': 24,
    'damage': {'player': 'essence', 'object': 'dmg'},
    'sharedDecks': {'pool': [d[1] for d in DISTRICTS]},
    'functions': F, 'procedures': P,
    'windows': {'resp': {'steps': [
        {'id': 'respond', 'timing': {'mode': 'alternate', 'who': '$win.who', 'first': '$win.def'}},
        {'id': 'resolve', 'auto': True, 'do': [C('afterResp')]}]}},
    'targeting': {'deny': AND(['isObj', '$it'], ['isObj', '$self'], NOT(C('evOk', '$it', '$self')))},
    'setup': [
        ['random', {'from': ['players'], 'as': '$f'}], ['firstPlayer', '$f'], ['set', 'game', 'first', g('$f', 'seat')],
        IF(AND(eq(cnt(['cards', 'p0', 'brought']), 3), eq(cnt(['cards', 'p1', 'brought']), 3)), [C('draftCity')], [
            ['shuffle', 'p0', 'pool'],
            EACH(['range', 5], '$i', [['move', ['first', ['cards', 'p0', 'pool']], 'city', {'as': '$d'}], C('setDistrict', '$d', '$i')])]),
        EACH(['players'], '$p', [C('setupPlayer', '$p')])],
    'phases': [
        {'id': 'rise', 'auto': True, 'do': [C('rise')]},
        {'id': 'draw', 'auto': True, 'do': [C('drawStep')]},
        {'id': 'gather', 'auto': True, 'do': [C('gather')]},
        {'id': 'night'},
        {'id': 'toll', 'auto': True, 'do': [C('toll')]},
    ],
    'actions': A,
    'replacements': [
        {'replace': 'damage', 'if': AND(['isObj', '$e.target'], NOT(C('silver', '$e.source')), eq(g('$e.target', 'shield'), '$turn'), eq(g('$e.target', 'type'), 'influence')), 'instead': [], 'text': 'Nothing to See Here'},
        {'replace': 'damage', 'if': AND(['isObj', '$e.target'], NOT(C('silver', '$e.source')), eq(g('$e.target', 'card'), 'hazmat-shambler'), eq(g('$e.target', 'hz'), 0)),
         'instead': [['set', '$e.target', 'hz', 1], ['damage', '$e.target', sub('$e.amount', 1), '$e.source']], 'text': 'Hazmat'},
    ],
    'triggers': [
        {'on': 'dying', 'do': [EACH(flt(['players'], isF('$it', 3)), '$z', [C('addRes', '$z', 1),
            IF(AND(eq('$e.card', 'shambler'), eq('$e.ctrl', '$z')), [C('addRes', '$z', 1)])]),
            EACH(flt(['players'], AND(C('claims', '$it', 'hospital'), ne(g('$it', 'morgue'), '$turn'))), '$h', [['set', '$h', 'morgue', '$turn'], C('addRes', '$h', 1)]),
            IF(eq('$e.type', 'hunter'), [EACH(flt(['players'], AND(isF('$it', 5), ne('$it', '$e.ctrl'))), '$dv', [
                C('fulfill', ['first', flt(['cards', '$dv', 'omens'], eq(g('$it', 'card'), 'ravens-on-the-steeple'))])])])]},
        {'on': 'damage', 'if': AND(['isObj', '$e.target'], C('silver', '$e.source')), 'do': [['inc', '$e.target', 'silver', '$e.amount']]},
        {'on': 'took', 'do': [EACH(flt(['players'], AND(isF('$it', 5), ne('$it', '$e.player'))), '$dv', [C('addRes', '$dv', 1)])]},
        {'on': 'hunt', 'do': [EACH(flt(['cards', ['opp', '$e.p'], 'units'], AND(g('$it', 'faceDown'), eq(g('$it', 'x'), '$e.x'), inl('hunt', g('$it', 'springOn')))), '$t', [C('spring', '$t', '$e.u')])]},
        {'on': 'unitMoved', 'if': C('isUnit', '$e.u'), 'do': [
            EACH(flt(['cards', ['opp', '$e.p'], 'units'], AND(g('$it', 'faceDown'), eq(g('$it', 'x'), '$e.x'), inl('move', g('$it', 'springOn')))), '$t', [C('spring', '$t', '$e.u')]),
            IF(AND(['isObj', '$e.u'], ANY(C('structsAt', '$e.x', ['opp', '$e.p']), eq(g('$it', 'card'), 'scarecrow-sentinel'))), [['damage', '$e.u', 1]])]},
    ],
    'stateChecks': [
        EACH(flt(['concat', ALLU], AND(OR(C('isUnit', '$it'), C('isStruct', '$it')), gt(C('endur', '$it'), 0), ge(g('$it', 'dmg'), C('endur', '$it')))), '$u', [
            IF(AND(eq(g('$u', 'card'), 'the-final-girl'), eq(g('$u', 'saved'), 0)), [['set', '$u', 'saved', 1], ['set', '$u', 'dmg', 0], ['set', '$u', 'ex', 1]],
               [IF(C('isUnit', '$u'), [C('kill', '$u')], [['destroy', '$u']])])]),
        EACH(flt(['cards', '*', 'gear'], AND(NOT(['isObj', g('$it', 'on')]), ne(g(g('$it', 'controller'), 'faction'), 0), ne(g('$it', 'card'), 'the-black-grimoire'))), '$gq', [['move', '$gq', 'grave']]),
        EACH(flt(['players'], le(g('$it', 'essence'), 0)), '$p', [['lose', '$p']]),
    ],
}

# Vessel death halves Gestation (rounding down).
proc('halve', ['$p'], [IF(isF('$p', 5), [['set', '$p', 'gestation', ['/', g('$p', 'gestation'), 2] if LEVERS['VESSEL_HALVES'] else ['max', 0, sub(g('$p', 'gestation'), 2)]]])])

# ---------------------------------------------------------------- decks (the five starters)
def deck(master_id, entries, aside=None):
    d = {'lair': [master_id], 'deck': []}
    for n, cid in entries: d['deck'] += [cid] * n
    if aside: d['aside'] = [aside]
    assert len(d['deck']) == 40, (master_id, len(d['deck']))
    return d
DECKS = {
    'outbreak-at-site-9': deck('patient-zero', [(3, 'fresh-turned'), (3, 'hazmat-shambler'), (3, 'sprinter'), (2, 'bloated-carrier'), (3, 'crawler-swarm'), (1, 'subject-12-lockjaw'),
        (1, 'the-amalgam'), (2, 'exposed-ribcage-maw'), (2, 'chitin-plating'), (1, 'tendril-lash'), (2, 'lazarus-7'), (1, 'vector-b'), (3, 'containment-breach'),
        (2, 'feeding-frenzy'), (2, 'cleanup-crew-lost'), (2, 'sheriff-dale-burke'), (2, 'blackout'), (2, 'pale-morning-light'), (2, 'expose-in-the-evening-herald'), (1, 'evacuation-order')]),
    'the-marsh-whitcombe-trust': deck('lady-evangeline-marsh', [(3, 'velvet-rope-fledgling'), (3, 'associate-of-the-firm'), (2, 'the-sommelier'), (1, 'mr-kessler'),
        (1, 'countess-ilse-varga'), (1, 'silas-whitmore'), (3, 'the-familiar'), (2, 'bought-detective'), (1, 'councilman-doyle'), (3, 'blood-bank-holdings'), (2, 'the-velvet-club'),
        (2, 'hostile-takeover'), (2, 'a-quiet-word-with-the-mayor'), (2, 'exsanguinate'), (2, 'nothing-to-see-here'), (2, 'sheriff-dale-burke'), (2, 'neighborhood-watch'),
        (2, 'molotov-cocktail'), (2, 'evacuation-order'), (1, 'blackout'), (1, 'the-black-grimoire')]),
    'dont-go-in-there': deck('old-hollow', [(1, 'the-groundskeeper'), (1, 'mister-lullaby'), (1, 'the-hook-handed-man'), (1, 'the-caller'), (3, 'rusted-machete'), (2, 'chainsaw'),
        (2, 'garden-shears'), (3, 'bear-trap'), (2, 'the-basement-door'), (3, 'just-the-cat'), (3, 'dont-go-in-there'), (2, 'the-phone-call'), (2, 'its-never-over'), (2, 'the-party'),
        (2, 'final-scream'), (3, 'sheriff-dale-burke'), (3, 'neighborhood-watch'), (2, 'evacuation-order'), (2, 'blackout')]),
    'the-barrow-wakes': deck('mother-bramble', [(3, 'hollow-eyed-farmhand'), (3, 'maypole-dancers'), (1, 'the-corn-bride'), (2, 'sheaf-masked-elder'), (3, 'the-little-people'),
        (2, 'thing-in-the-hedgerow'), (1, 'something-in-the-stalks'), (3, 'scarecrow-sentinel'), (2, 'the-standing-stone'), (1, 'the-wicker-colossus'), (3, 'blood-barley'),
        (2, 'mandrake-patch'), (2, 'rite-of-the-first-furrow'), (2, 'the-reaping-hymn'), (2, 'fallow-rest'), (2, 'sheriff-dale-burke'), (2, 'neighborhood-watch'),
        (2, 'molotov-cocktail'), (1, 'blackout'), (1, 'expose-in-the-evening-herald')], aside='he-who-wears-the-hill'),
    'nine-moons': deck('augustin-vale', [(1, 'margaret-wells'), (1, 'sister-abigail'), (3, 'doting-neighbors'), (1, 'the-governess'), (2, 'the-black-priest'), (3, 'hellhound'),
        (1, 'the-possessed-girl'), (1, 'azrimoth'), (3, 'the-jackals-birthmark'), (2, 'ravens-on-the-steeple'), (2, 'tithe-of-souls'), (2, 'the-blood-moon'), (2, 'unclean-spirit'),
        (2, 'the-exorcism-fails'), (2, 'the-crossroads-deal'), (2, 'a-name-in-the-ledger'), (2, 'sheriff-dale-burke'), (2, 'neighborhood-watch'), (2, 'pale-morning-light'),
        (1, 'molotov-cocktail'), (1, 'blackout'), (1, 'evacuation-order'), (1, 'the-black-grimoire')], aside='the-child'),
}

# ---------------------------------------------------------------- campaign: AI battles, the store, Blood Dawn boosters
def pool(rarities, types_out=('district',), districts=False):
    out = []
    for c in CARDS:
        if c.get('maxCopies') == 0: continue
        if c['type'] == 'district' and not districts: continue
        if c['rarity'] in rarities: out.append(c['id'])
    return out
RARE = pool(['R', 'L'])
FOES = [
    ('cabal', 'the-marsh-whitcombe-trust', 'Lady Evangeline Marsh', 'The Boardroom', '🩸', 'They came for the blood. They stayed for the board meeting.'),
    ('harvest', 'the-barrow-wakes', 'Mother Bramble', 'The Barrow Field', '🌾', 'The corn grows tall where the old gods are fed.'),
    ('zombie', 'outbreak-at-site-9', 'Patient Zero', 'Site 9', '☣', 'It never buys anything. It eats.'),
    ('slasher', 'dont-go-in-there', 'Old Hollow', 'Whispering Pines', '🔪', 'Four face-down cards. One of them is the machete.'),
    ('devil', 'nine-moons', 'Augustin Vale', 'The Morning Star Society', '😈', 'Nine moons. One child. Every bargain brings him closer.'),
]
ENCOUNTERS, BASIC, ELITE = {}, [], []
for fac_, deck_id, master_name, place_, icon, line in FOES:
    ENCOUNTERS[f'{fac_}-dusk'] = {'name': place_, 'opponent': master_name, 'portrait': icon, 'deck': deck_id, 'repeatable': True,
        'intro': [{'speaker': master_name, 'text': line}],
        'rewards': {'first': {'currency': 150, 'packs': ['blood-dawn']}, 'repeat': {'currency': 60}, 'loss': {'currency': 20}}}
    ENCOUNTERS[f'{fac_}-witching'] = {'name': f'{place_} at the Witching Hour', 'opponent': master_name, 'portrait': icon, 'deck': deck_id, 'repeatable': True,
        'requires': [f'{fac_}-dusk'], 'intro': [{'speaker': master_name, 'text': 'You came back. Brave, or foolish. The night decides.'}],
        'scenario': {'setup': [['inc', '$opp', 'essence', 5], ['call', 'addRes', '$opp', 2]]},
        'rewards': {'first': {'currency': 300, 'packs': ['blood-dawn', 'blood-dawn']}, 'repeat': {'currency': 100}, 'loss': {'currency': 30}}}
    BASIC.append(f'{fac_}-dusk'); ELITE.append(f'{fac_}-witching')
# ---------------------------------------------------------------- tutorials (scripted set pieces; see packages/campaign/src/tutorial.ts)
def setpiece(city, hands, put=(), lurk=(), plant=(), omens=(), sets=()):
    s = [['firstPlayer', 'p0'], ['set', 'game', 'first', 0], C('tutCity', lit(city))]
    for p_, ids in hands.items(): s.append(C('tutHand', p_, lit(ids)))
    for p_, cid, x in put: s.append(C('tutPut', p_, cid, x))
    for p_, cid, x in lurk: s.append(C('tutLurk', p_, cid, x))
    for p_, cid, gr in plant: s.append(C('tutPlant', p_, cid, gr))
    for p_, cid in omens: s.append(C('tutOmen', p_, cid))
    for ref, var, val in sets: s.append(['set', ref, var, val])
    return {'vars': {'noMulligan': 1}, 'setup': s}
def say(text, wait=False): return {'say': text, **({'wait': True} if wait else {})}
def do(text, action, card=None, **targets):
    mv = {'action': action}
    if card: mv['card'] = card
    if targets: mv['targets'] = {'$' + k: v for k, v in targets.items()}
    return {'say': text, 'do': mv}
def end(text): return {'say': text, 'pass': True}
def decide(text, *opts): return {'say': text, 'decide': list(opts)}
REWARD = {'currency': 10}
CITY_A = ['old-town', 'the-docks', 'the-subway', 'whispering-pines-campground', 'st-agnes-hospital']
CITY_B = ['the-docks', 'the-subway', 'whispering-pines-campground', 'st-agnes-hospital', 'old-town']
CITY_C = ['the-docks', 'old-town', 'the-subway', 'whispering-pines-campground', 'st-agnes-hospital']
TUTORIALS = [
    {'id': 'basics', 'name': 'Basics: The City at Night', 'icon': '☾', 'opponent': 'Lady Evangeline Marsh',
     'blurb': 'Start here. How the board works, playing cards, attacking, defending, the end of a turn, and how to win.',
     'deck': 'outbreak-at-site-9', 'opponentDeck': 'the-marsh-whitcombe-trust', 'seed': 11, 'rewards': REWARD,
     'scenario': setpiece(CITY_A, {'p0': ['sprinter', 'fresh-turned', 'hazmat-shambler', 'containment-breach', 'blackout', 'pale-morning-light']},
                          put=[('p1', 'velvet-rope-fledgling', 2)], sets=[('p0', 'biomass', 6), ('p1', 'vitae', 5)]),
     'script': [{'action': 'prey', 'card': 'velvet-rope-fledgling'}],
     'steps': [
        say("Welcome to NIGHTFALL, a two-player card game. You control the bottom of the screen; your opponent controls the top. "
            "Each of you has a deck of 40 cards, a hand of cards only you can see, and a Master card in your Lair. "
            "Your Master's Essence (shown next to your name) is your life total: if it reaches 0, you lose."),
        say("The five cards in the middle row are Districts: the shared board. Units you play go into a District, on your side of it: "
            "yours appear in the row below the Districts, your opponent's in the row above. Each District shows a number of Citizens. "
            "Citizens are the main prize of the game. When a District has no Citizens left, someone takes control of it. Control 3 Districts and you win."),
        say("Cards cost resources. Your resource is called Biomass, and you have 8 right now (shown next to your name). "
            "A card's cost is the number in its top-left corner. Cards you can afford and play right now glow. "
            "To play one, tap it, tap where it should go, then tap Confirm. Tip: press and hold any card to read it up close."),
        do("Let's play a unit. Tap Sprinter in your hand (cost 2), tap the Old Town District in the middle row, then tap Confirm.",
           'deploy', 'sprinter', d=['old-town']),
        say("Sprinter is now on the board in Old Town, and your Biomass dropped from 8 to 6. A unit has two numbers along its bottom edge: "
            "Menace (the dagger, how much damage it deals) and Endurance (the heart, how much damage it can take). "
            "Sprinter has 3 Menace and 1 Endurance."),
        do("Units attack by Hunting. Hunting turns the unit sideways (exhausted) until your next turn. Prey is the basic Hunt: "
           "it takes 1 Citizen from the unit's District. Normally a newly played unit must wait a turn before it can Hunt, but Sprinter has the "
           "Swift keyword, so it can Hunt right away. Tap Sprinter to Prey. (In a normal game, tapping a unit lists everything it can do; in a tutorial only the move being taught is offered, so it happens straight away.)", 'prey', 'sprinter'),
        say("Old Town went from 4 Citizens to 3. What you gain from Prey depends on your faction. You are playing the Zombie Horde: "
            "when one of your Zombie units Preys, the Citizen is turned into a Shambler, a small 1-Menace, 1-Endurance token unit that you control, "
            "placed in that same District. You now have 2 units in Old Town, and Sprinter is turned sideways because it has Hunted."),
        do("Play another unit: tap Fresh Turned (cost 1), tap Old Town, then Confirm.", 'deploy', 'fresh-turned', d=['old-town']),
        do("Your opponent has a unit in the Subway District: a Vampire with 2 Menace. Play Hazmat Shambler (cost 2) into the Subway "
           "so you have a defender there.", 'deploy', 'hazmat-shambler', d=['the-subway']),
        say("Fresh Turned and Hazmat Shambler have no Swift keyword, so they are Fresh this turn: they can't Hunt until your next turn. "
            "Units can also move once per turn to a neighbouring District, but we won't need that now. You have done everything for this turn."),
        say("A turn has five steps. Rise: your units stand back up and start-of-turn effects happen. Draw: you draw a card. "
            "Gather: you gain resources. Night: you play cards and Hunt (that's where we are). "
            "Toll: end-of-turn checks, including which Districts are taken. Then your opponent takes a turn."),
        end("Tap End phase to finish your Night. The Toll happens, then your opponent's turn begins."),
        say("It's your opponent's turn, and their Vampire is Preying in the Subway, trying to take a Citizen there. "
            "Because you have a unit in the Subway that is not turned sideways, you may Intercept: your unit steps in, "
            "the Prey is cancelled, and the two units fight each other instead.", wait=True),
        do("Tap Hazmat Shambler to Intercept. Intercepting does not turn your unit sideways.", 'intercept', 'hazmat-shambler'),
        end("You can respond with more than one card in this moment, but that's all we need. Tap Pass to let the fight happen."),
        say("That fight is called a Clash: both units deal their Menace to each other at the same time, as wounds. "
            "Your Hazmat Shambler (2 Menace) dealt 2 wounds to the Vampire (1 Endurance), so the Vampire was destroyed and went to its owner's Grave pile. "
            "The Vampire dealt 2 back, but Hazmat Shambler ignores the first wound it takes each turn, so it kept 1 wound and survived (3 Endurance)."),
        say("Each faction has its own rules. One Zombie Horde rule is the Morgue: whenever any unit is destroyed, yours or the opponent's, "
            "you gain 1 Biomass. Wounds stay on a unit until they are healed; a unit is destroyed when its wounds reach its Endurance."),
        say("It's your turn again. At Rise, your units stood back up so they can Hunt again. Another Zombie Horde rule, Spread, also happened: "
            "at the start of your turn, one District where you have 3 or more Zombie units (Shamblers count) loses 1 Citizen, "
            "and that Citizen becomes another Shambler for you. Old Town went from 3 Citizens to 2.", wait=True),
        do("Tap Sprinter to Prey again and take another Citizen from Old Town.", 'prey', 'sprinter'),
        do("Fresh Turned arrived last turn, so it is no longer Fresh and can Hunt. Tap it to Prey.", 'prey', 'fresh-turned'),
        say("Old Town has 0 Citizens. At the Toll (the end of your turn), any District with no Citizens left is claimed by whoever has the most "
            "Dominion there. Dominion is the total Menace of your units in that District (some structures add more). "
            "Your opponent has nothing in Old Town, so you will claim it."),
        end("Tap End phase to finish your turn and claim Old Town."),
        say("You claimed Old Town! A claimed District flips to its Fallen side, which gives its owner a bonus, and it stays yours for the rest of the game. "
            "You win by claiming 3 Districts, by reducing your opponent's Essence to 0, or by your faction's own special victory. "
            "If nobody has won by the end of the night (the clock at the top, from 8 PM to 5 AM), whoever claimed the most Districts wins. "
            "Each faction plays very differently: try their tutorials next."),
     ]},
    {'id': 'cabal', 'name': 'Blood Cabal: Old Money', 'icon': '🩸', 'opponent': 'Patient Zero',
     'blurb': 'Collecting Thralls for extra resources, Influence cards, claiming a District without emptying it, and playing cards during your opponent\'s turn.',
     'deck': 'the-marsh-whitcombe-trust', 'opponentDeck': 'outbreak-at-site-9', 'seed': 12, 'rewards': REWARD,
     'scenario': setpiece(CITY_B, {'p0': ['blood-bank-holdings', 'velvet-rope-fledgling', 'councilman-doyle', 'a-quiet-word-with-the-mayor', 'nothing-to-see-here', 'the-familiar'],
                                   'p1': ['containment-breach', 'sprinter', 'fresh-turned', 'blackout', 'hazmat-shambler', 'crawler-swarm']},
                          sets=[('p0', 'vitae', 5), ('p1', 'biomass', 4)]),
     'script': [{'action': 'cast', 'card': 'containment-breach'}],
     'steps': [
        say("You are playing the Blood Cabal. Your resource is Vitae (6 right now). The Cabal's special ability is claiming Districts "
            "without taking every Citizen: you place Influence cards, and if your Influence in a District is high enough, you take it over."),
        say("Influence cards are structures: they stay in a District, add Influence there, and can be attacked like units (their Endurance is called Security). "
            "Your Master, Lady Evangeline Marsh, has a passive ability called Old Money: the first Influence card you play each turn costs 1 less."),
        do("Tap Blood Bank Holdings (normally cost 2, only 1 thanks to Old Money), tap the Whispering Pines Campground District, then Confirm. "
           "It gives 1 Influence there, plus 1 extra Vitae at the start of each of your turns.", 'build', 'blood-bank-holdings', d=['whispering-pines-campground']),
        do("Now play Velvet Rope Fledgling (cost 1) into the Campground. It has Swift, so it can Hunt this turn.", 'deploy', 'velvet-rope-fledgling', d=['whispering-pines-campground']),
        do("Tap Velvet Rope Fledgling to Prey and take a Citizen.", 'prey', 'velvet-rope-fledgling'),
        say("When a Blood Cabal unit Preys, the Citizen becomes a Thrall (you can hold up to 6) and you gain 2 Vitae. "
            "Thralls are a second income: at the start of each turn you gain 1 Vitae, plus 1 more for every Thrall you hold. The Campground now has 2 Citizens."),
        say("Here is the Cabal's main way to claim a District, called Domination. At the end of your turn, if you have a Vampire in a District and your total Influence there is equal to "
            "or more than the Citizens left there, you take all of those Citizens as Thralls and claim the District, no matter who has more units there. "
            "Right now the Campground has 2 Citizens and you have 1 Influence there."),
        do("Councilman Doyle is a unit that counts as 2 Influence in his District. Play him into the Campground (cost 3). That makes 3 Influence against 2 Citizens.",
           'deploy', 'councilman-doyle', d=['whispering-pines-campground']),
        do("You can also turn Thralls back into Vitae at any time. This is called Drain: 1 Thrall becomes 2 Vitae. Tap your Master card (Lady Evangeline Marsh, in your Lair) to Drain a Thrall.",
           'drain', 'lady-evangeline-marsh'),
        say("One cost to remember: at the start of each of your turns, every Vampire unit you control costs Vitae to keep (1 each, 2 for powerful Elders). "
            "This is called Thirst. If you can't pay, that Vampire takes 1 wound and must attack that turn."),
        end("Tap End phase. At the end of your turn, your 3 Influence beats the Campground's 2 Citizens."),
        say("You Dominated the Whispering Pines Campground: its 2 Citizens became Thralls and the District is yours. Now it is your opponent's turn."),
        say("Your opponent just played Containment Breach, a card that would put two of their units onto the board. The Blood Cabal has a unique advantage: "
            "whenever your opponent plays a card or attacks, you get a chance to respond, using cards with the Fast keyword.", wait=True),
        do("A Quiet Word with the Mayor is Fast. It cancels a card (other than a unit) as it is being played, and that card's owner draws a replacement card. "
           "It costs 4 Vitae. Tap it and play it now.", 'cast', 'a-quiet-word-with-the-mayor'),
        end("Tap Pass to finish responding."),
        say("Containment Breach was cancelled: it went to your opponent's Grave pile without doing anything, and they drew a card instead. "
            "To play the Cabal well, collect Thralls for income, place Influence where few Citizens are left, and keep Vitae saved for a Fast card on your opponent's turn."),
     ]},
    {'id': 'harvest', 'name': 'Harvest Cult: The Wheel Turns', 'icon': '🌾', 'opponent': 'Lady Evangeline Marsh',
     'blurb': 'The four-turn season cycle, crops that pay out later, Offerings, structures, and summoning a giant that claims a District on its own.',
     'deck': 'the-barrow-wakes', 'opponentDeck': 'the-marsh-whitcombe-trust', 'seed': 13, 'rewards': REWARD,
     'scenario': setpiece(CITY_C, {'p0': ['maypole-dancers', 'the-little-people', 'the-standing-stone', 'rite-of-the-first-furrow', 'blood-barley', 'fallow-rest']},
                          put=[('p0', 'scarecrow-sentinel', 1), ('p0', 'hollow-eyed-farmhand', 0)], plant=[('p0', 'blood-barley', 1)],
                          sets=[('p0', 'bounty', 2), ('p0', 'season', 2), ('p0', 'barrow', AW), ('p1', 'vitae', 5)]),
     'steps': [
        say("You are playing the Harvest Cult. Your resource is Bounty. The Cult follows a cycle of four seasons: at the start of each of your turns, the season "
            "moves one step: Sowing, then Growing, then Reaping, then Fallow, then back to Sowing. Each season changes what your cards can do. "
            "This turn the season is Reaping, the season where your plans pay off."),
        say("Crops: Planting cards go into your Field (up to 3), not into a District. Each one gains Growth at the start of your turns. When its Growth reaches its "
            "Ripen number, the next Reaping pays out its Yield and then it is discarded. Your Blood Barley ripened and paid 3 Bounty this turn, so you have 6 Bounty."),
        say("When Harvest Cult units Prey, the Citizen becomes an Offering, counted on your Barrow. Offerings summon your most powerful card: He Who Wears the Hill, "
            f"which waits off to the side. At the start of your turn, if you have {AW} Offerings and an Effigy (a Cult structure) in play, you spend the {AW} to put it into the "
            "Effigy's District. That just happened: it is now in Old Town, next to your Scarecrow Sentinel."),
        do("Your Hollow-Eyed Farmhand is a Folk unit. Folk are human (Mortal) and can only Prey during Reaping. Tap it (at the Docks) to Prey: the Citizen becomes an Offering.",
           'prey', 'hollow-eyed-farmhand'),
        do("Fae units are monsters and can Prey in any season. Play The Little People (cost 2) into the Docks. Like most units, it must wait a turn before it can Hunt.",
           'deploy', 'the-little-people', d=['the-docks']),
        do("Effigies are your structures: they stay in a District and add Dominion there (strength for claiming that District when its Citizens run out). "
           "Enemies have to attack them directly to remove them. Play The Standing Stone (cost 3) into the Docks.", 'build', 'the-standing-stone', d=['the-docks']),
        say("He Who Wears the Hill has a special rule: at the end of each of your turns in the Reaping season, it Harvests its District. Every Citizen left there "
            "becomes an Offering, and you claim the District, no matter how many units your opponent has there."),
        end("Tap End phase to end your turn. He Who Wears the Hill will Harvest Old Town."),
        say("Old Town is yours. Next turn the season moves to Fallow: you can hold at most 2 Bounty at its end, but you draw 2 extra cards and your units heal. "
            "Plan around the cycle: play crops in Sowing (your first Planting each Sowing turn is free), protect them in Growing, and attack in Reaping. "
            "Your opponent can see the season too, so expect them to defend before your Reaping."),
     ]},
    {'id': 'zombie', 'name': 'Zombie Horde: Outbreak', 'icon': '☣', 'opponent': 'Mother Bramble',
     'blurb': 'Growing a swarm of tokens, gaining resources when units die, upgrades for all or one of your units, and claiming a District by outnumbering it.',
     'deck': 'outbreak-at-site-9', 'opponentDeck': 'the-barrow-wakes', 'seed': 14, 'rewards': REWARD,
     'scenario': setpiece(CITY_B, {'p0': ['crawler-swarm', 'chitin-plating', 'lazarus-7', 'containment-breach', 'sprinter', 'exposed-ribcage-maw']},
                          put=[('p0', 'sprinter', 1), ('p0', 'fresh-turned', 1), ('p0', 'hazmat-shambler', 1)], sets=[('p0', 'biomass', 4 - LEVERS['GATHER_ZOMBIE']), ('p1', 'bounty', 2)]),
     'steps': [
        say("You are playing the Zombie Horde. Your resource is Biomass. " + (f"You gain {LEVERS['GATHER_ZOMBIE']} each turn, plus 1 " if LEVERS['GATHER_ZOMBIE'] else "You don't gain it each turn like other factions: you gain 1 ") + "every time any unit is destroyed (the Morgue rule), yours or the opponent's. "
            "The Horde wins by flooding Districts with lots of small units called Shamblers: 1 Menace, 1 Endurance tokens."),
        say("At the start of this turn, a Horde rule called Spread happened. In one District where you have 3 or more Zombie units (you choose if there are several), "
            "1 Citizen becomes a new Shambler for you. You had 3 Zombies in the Subway, so the Subway went from 3 Citizens to 2 and you gained a Shambler there."),
        do("Tap Sprinter in the Subway to Prey. When a Zombie with a name Preys, the Citizen becomes another Shambler for you (this is called Infect).",
           'prey', 'sprinter'),
        say("Shamblers are mindless: they can't Prey or attack the enemy Master on their own. They fight (Clash), block (Intercept), count toward Spread "
            "and Overrun, and pay for things. Some cards, like Feeding Frenzy, make Shamblers feed (called Devour): the Citizen is removed and you gain 1 Biomass. "
            "Shamblers are also Slow: only card effects can move them."),
        do("Shamblers are also currency. Sacrifice a Shambler: tap one of your Shamblers in the Subway. It is removed and you gain 1 Biomass. "
           "A sacrifice is a payment, not a death, so the Morgue and Patient Zero don't pay extra for it.", 'sacrifice', 'shambler'),
        do("Strains are upgrade cards that affect all your Zombies. They go into your Labs (2 spaces) instead of a District. Play LAZARUS-7 (cost 3): "
           "all your Shamblers get +1 Menace.", 'install', 'lazarus-7'),
        do("Mutations are upgrades you attach to one Zombie. Tap Chitin Plating (cost 2), then tap Hazmat Shambler on the board, then Confirm. It gives +3 Endurance "
           "and Guard: while that unit is upright, enemy units in its District can't Prey or attack your Master until they fight it.", 'attach', 'chitin-plating', h=['hazmat-shambler']),
        say("The Horde's special way to claim a District is called Overrun. At the end of your turn, if your Zombies in a District are at least twice the number of "
            "Citizens left there, and your opponent has no units there, every remaining Citizen becomes a Shambler and you claim the District. "
            "The Subway has 1 Citizen left and you have 4 Zombies there."),
        end("Tap End phase. At the end of your turn, 4 Zombies against 1 Citizen is an Overrun."),
        say("You Overran the Subway. To play the Horde well, get 3 Zombies into a District early so Spread starts working, and use every unit death for Biomass. "
            "Watch out for cards that damage everything in a District, and keep a defender near your Master: the Horde's Master has the lowest Essence after the Slashers."),
     ]},
    {'id': 'slasher', 'name': 'Slasher Killers: Don\'t Go in There', 'icon': '🔪', 'opponent': 'Augustin Vale',
     'blurb': 'Playing cards face down, bluffing, traps, revealing a hidden Killer, scattering Citizens, hiding again, and reaching the Final Act.',
     'deck': 'dont-go-in-there', 'opponentDeck': 'nine-moons', 'seed': 15, 'rewards': REWARD,
     'scenario': setpiece(CITY_C, {'p0': ['bear-trap', 'rusted-machete', 'the-party', 'just-the-cat', 'sheriff-dale-burke', 'dont-go-in-there']},
                          lurk=[('p0', 'the-groundskeeper', 0)], put=[('p1', 'hellhound', 2)],
                          sets=[('p0', 'terror', 8), ('p0', 'bodycount', FA - 2), ('p1', 'sin', 4)]),
     'script': [{'action': 'move', 'card': 'hellhound', 'targets': {'$d': ['old-town']}}],
     'steps': [
        say("You are playing the Slasher Killers. Your resource is Terror. The Slashers have very few units, but they grow deadlier as the Body Count rises. "
            f"Every Citizen your Killers take, and every human unit they destroy, adds 1 Victim. At {FA} Victims the Final Act begins and your Killers become "
            f"monsters that are very hard to stop. You have {FA - 2} Victims now."),
        say("The Slashers hide their cards. Once per turn, you may Lurk: put any card from your hand face down in a District for free. "
            "Your opponent only sees the card back. It might be a Killer, a Trap, or a bluff (any other card, which is simply discarded if your opponent checks it)."),
        do("Lurk the Bear Trap: tap Bear Trap in your hand, tap Old Town, then Confirm. Their Hellhound is in the Subway, right next to it.",
           'lurk', 'bear-trap', d=['old-town']),
        say("A Trap springs when its condition happens. The Bear Trap springs when an enemy unit moves into its District, Hunts there, or Investigates it "
            "(Investigate is a Hunt that flips a face-down card). You pay the Trap's cost only when it springs, and each spring gives you 1 Terror."),
        say("Your face-down card at the Docks is a Killer: The Groundskeeper. You pay a Killer's cost only when you reveal it. "
            "A Killer revealed this way also gets Ambush: +2 Menace for its attack that turn."),
        do("Tap the face-down Groundskeeper at the Docks to reveal it. It costs 4 Terror.", 'reveal', 'the-groundskeeper'),
        do("Now tap The Groundskeeper to Prey. For the Slashers this is called Slay: the Citizen becomes a Victim (+1 Body Count) and you gain 1 Terror.",
           'prey', 'the-groundskeeper'),
        decide("After a Slay comes Panic: another Citizen from that District runs to a neighbouring District that you choose. Use it to move Citizens away from "
               "Districts your opponent is about to claim. The Groundskeeper's ability makes 2 Citizens flee. Choose where the first one goes."),
        decide("Choose where the second Citizen flees."),
        say(f"{FA - 1} Victims. Your Killer is now face up, so your opponent knows where it is. At the end of your turn you may Vanish: pay 1 Terror per revealed Killer to "
            "turn it face down again, and it may move to a neighbouring District. This keeps your opponent guessing."),
        end("Tap End phase to end your turn."),
        decide("The game asks whether to Vanish The Groundskeeper. Choose vanish.", 'vanish'),
        decide("Choose a District: stay at the Docks or slip into a neighbouring District. Any choice works."),
        say("During your opponent's turn their Hellhound moved into Old Town, so your Bear Trap sprang: you paid its cost of 1 Terror, gained 1 Terror back, and the "
            "Hellhound took 3 wounds. With 3 Endurance, it was destroyed.", wait=True),
        do("Your Groundskeeper is face down again. Tap it to reveal it once more (4 Terror).", 'reveal', 'the-groundskeeper'),
        do(f"Tap The Groundskeeper to Prey and Slay Victim number {FA}.", 'prey', 'the-groundskeeper'),
        say(f"{FA} Victims: the Final Act has begun. For the rest of the game your Killers get +{LEVERS['FA_BUFF']} Menace and +{LEVERS['FA_BUFF']} Endurance and "
            "Strike the enemy Master for their full Menace (other units deal at most 2). At the end of each of your turns, every face-up Killer Slays a Citizen "
            "in its District. Strikes against your own Master deal at most 1 damage."),
        say("The Final Act doesn't win by itself: you still win by claiming 3 Districts, by bringing the enemy Master to 0 Essence, or at Dawn. It just makes those "
            "much easier. One more Slasher rule: a destroyed Killer is not gone for good. It returns face down two turns later and stronger (a Sequel), or at your "
            "very next turn during the Final Act. Before the Final Act, The Final Girl (a neutral card) can remove a Killer from the game for good."),
     ]},
    {'id': 'devil', 'name': 'Devil\'s Own: Nine Moons', 'icon': '😈', 'opponent': 'Patient Zero',
     'blurb': 'A countdown to a special victory, objective cards that advance it, offers your opponent must accept or refuse, and protecting a unit for one turn.',
     'deck': 'nine-moons', 'opponentDeck': 'outbreak-at-site-9', 'seed': 16, 'rewards': REWARD,
     'scenario': setpiece(CITY_C, {'p0': ['the-crossroads-deal', 'hellhound', 'the-jackals-birthmark', 'unclean-spirit', 'sister-abigail', 'ravens-on-the-steeple']},
                          put=[('p0', 'margaret-wells', 1), ('p0', 'doting-neighbors', 1)], omens=[('p0', 'the-blood-moon'), ('p0', 'tithe-of-souls')],
                          sets=[('game', 'hour', 4), ('p0', 'sin', 3), ('p0', 'souls', 3), ('p0', 'gestation', 5 - LEVERS['GESTATION_RISE']), ('p1', 'biomass', 2)]),
     'steps': [
        say("You are playing the Devil's Own. Your resource is Sin. Your special victory works like a countdown called Gestation, from 0 to 9 (shown next to your name). "
            "When it reaches 9, a powerful card called The Child enters play. If The Child is still in play at the start of your next turn, you win."),
        say("Gestation only goes up while you control a Vessel: a unit with the Vessel keyword. Yours is Margaret Wells in Old Town. If your Vessel is destroyed, "
            "Gestation is cut in half, so protect it. Doting Neighbors stands guard beside her: its Guard keyword stops enemy units in that District from Preying "
            "or attacking your Master until they fight it."),
        say("You raise Gestation with Omen cards. An Omen sits in your Omen row with a condition; when the condition is met, you add its number to Gestation and "
            "discard it. The Blood Moon's condition is that it is midnight or later at the start of your turn. The clock reads 12 AM, so it just paid +3: "
            f"Gestation went from {5 - LEVERS['GESTATION_RISE']} to 8 ({'+' + str(LEVERS['GESTATION_RISE']) + ' for starting your turn with a Vessel, ' if LEVERS['GESTATION_RISE'] else ''}+3 for the Blood Moon)."),
        do("Bargains are cards your opponent must answer. Play The Crossroads Deal (it costs 0, because your Master makes Bargains 1 cheaper). "
           "Your opponent chooses: Accept (they draw 3 cards and take a Pact) or Refuse (you gain 3 Sin and draw a card).", 'cast', 'the-crossroads-deal'),
        say("Your opponent accepted and took a Pact token. Each Pact gives you 1 Sin at the end of each of your turns, and when The Child is born, "
            "your opponent loses 2 Essence for every Pact they hold."),
        do("Tithe of Souls is an Omen whose condition is that you spend 3 Souls (you gain Souls when your units Prey). Tap it in your Omen row to spend 3 Souls: "
           "Gestation +2.", 'tithe', 'tithe-of-souls'),
        say("Gestation reached 9, so The Child entered play in your Vessel's District (Old Town), and your opponent lost 2 Essence for their Pact. "
            "The Child has 0 Menace and 9 Endurance, can't move or attack, and can't be targeted by Event cards. "
            "Your opponent has one turn to destroy it before your next turn starts."),
        do("Make it harder for them. Your Disciple and Demon units in The Child's District gain Guard. Play Hellhound (cost 3) into Old Town.",
           'deploy', 'hellhound', d=['old-town']),
        end("Tap End phase and let your opponent take their turn."),
        say("The Child survived to the start of your turn, so you win. When you play the Devil's Own, put a Vessel down early, protect it, and line up Omens. "
            "Your opponent can see Gestation rising, so they will come for your Vessel. Expect it.", wait=True),
     ]},
]

CAMPAIGN = {
    'name': 'The Long Night',
    'intro': [{'speaker': 'The Evening Herald', 'text': 'Five powers want the City. Claim a starter deck in the Store, then face them one by one before Dawn.'},
              {'speaker': 'The Evening Herald', 'text': 'Every battle pays Marks, win or lose. Spend them on Blood Dawn boosters to build your collection.'}],
    'currency': {'name': 'Marks', 'start': 0},
    'starter': {'collection': {}, 'decks': {}},
    'chapters': [{'id': 'dusk', 'name': 'Dusk: the five powers', 'nodes': BASIC}, {'id': 'witching', 'name': 'The Witching Hour (stronger rivals)', 'nodes': ELITE}],
    'encounters': ENCOUNTERS,
    'tutorials': TUTORIALS,
    'boosters': {'blood-dawn': {'name': 'Blood Dawn', 'slots': [
        {'count': 6, 'pool': pool(['C'])}, {'count': 3, 'pool': pool(['U'], districts=True)},
        {'count': 1, 'pool': RARE, 'weights': {c['id']: (1 if c['rarity'] == 'L' else 4) for c in CARDS if c['id'] in RARE}}]}},
    'shop': [
        {'id': 'promo-site-9', 'name': 'Outbreak at Site 9', 'deck': 'outbreak-at-site-9', 'price': 0, 'stock': 1, 'group': 'starter-promo',
         'text': 'Promo starter (Zombie Horde): a swarm that snowballs. The easiest deck to learn.'},
        {'id': 'promo-marsh-whitcombe', 'name': 'The Marsh-Whitcombe Trust', 'deck': 'the-marsh-whitcombe-trust', 'price': 0, 'stock': 1, 'group': 'starter-promo',
         'text': 'Promo starter (Blood Cabal): buy the City one district at a time.'},
        {'id': 'promo-dont-go-in-there', 'name': "Don't Go in There", 'deck': 'dont-go-in-there', 'price': 0, 'stock': 1, 'group': 'starter-promo',
         'text': 'Promo starter (Slasher Killers): bluffing, hidden Lurkers and a race to ' + str(BC) + ' Victims.'},
        {'id': 'promo-barrow-wakes', 'name': 'The Barrow Wakes', 'deck': 'the-barrow-wakes', 'price': 0, 'stock': 1, 'group': 'starter-promo',
         'text': 'Promo starter (Harvest Cult): plant, harvest, and wake the Old One.'},
        {'id': 'blood-dawn-pack', 'name': 'Blood Dawn booster', 'booster': 'blood-dawn', 'price': 100,
         'text': 'The NIGHTFALL core set: 10 cards (6 common, 3 uncommon, 1 rare or Legendary).'},
    ],
}

MANIFEST = {
    'moduleId': 'nightfall', 'displayName': 'NIGHTFALL', 'semanticVersion': '0.1.0', 'engineApiRange': '^0.3.1', 'official': True,
    'requiredCapabilities': ['grid', 'windows', 'slots', 'faceDown', 'multiDeck', 'sharedDecks', 'gameVars', 'scripts', 'deckRules', 'limits', 'targeting', 'control', 'identity', 'relationships'],
    'licensing': 'Original game by @Astral. NIGHTFALL is a working title.',
    'tagline': 'The City Will Fall. Two monstrous factions race to claim five districts before Dawn.',
    'theme': {'accent': '#dc2626', 'accent2': '#a78bfa', 'glyph': '☾', 'tapVar': 'ex',
              'hideStats': ['num', 'fno', 'startRes', 'giftCost', 'gm', 'ge', 'gg', 'awaken', 'ripen', 'yield', 'gest', 'souls'],
              'announce': {'finalAct': 'The Final Act', 'nativity': 'The Nativity', 'awakened': 'The Old One wakes', 'dominated': 'Dominated: {district}', 'overrun': 'Overrun: {district}', 'claimed': '{district} falls'},
              'hideVars': ['finalAct', 'fresh', 'hunted', 'moves', 'last', 'amb', 'hz', 'shield', 'saved', 'stun', 'xprey', 'mayPrey', 'ended', 'claim', 'ex', 'faction', 'gcl', 'first', 'struck',
                           'infPlayed', 'plantPlayed', 'lurks', 'velvet', 'extraLurk', 'grim', 'tunnel', 'morgue', 'sqA', 'sqB', 'sqC', 'sqD'],
              'hideKeywords': ['aloof', 'nohunt', 'token', 'shambler'],
              'labels': {'field': 'Field · Plantings', 'labs': 'Labs · Strains', 'omens': 'Omens', 'lair': 'Lair', 'gear': 'Gear', 'dark': 'In the Dark', 'oldone': 'Old One', 'child': 'Horror', 'frenzy': 'Frenzied', 'silver': 'silver wounds', 'dmg': 'wounds', 'cit': 'citizens', 'growth': 'growth', 'sc': 'sequel in', 'plus': '+1/+1', 'essence': 'Essence', 'claims': 'districts',
                         'trophies': 'trophies', 'bodycount': 'Body Count', 'gestation': 'Gestation', 'barrow': 'Offerings', 'season': 'season', 'thralls': 'Thralls', 'souls': 'Souls', 'pacts': 'Pacts'}},
    'presentation': {
        'templates': {
            'unit': {'base': 'skirmisher', 'art': 55, 'stats': [{'field': 'menace', 'pos': 'bl', 'icon': '🗡'}, {'field': 'endurance', 'pos': 'br', 'icon': '♥'}], 'label': 'Unit — Menace and Endurance'},
            'structure': {'base': 'vital', 'art': 55, 'stats': [{'field': 'endurance', 'pos': 'tr', 'icon': '♥', 'label': 'Security / Endurance'}, {'field': 'dominion', 'pos': 'bl', 'icon': '⛨', 'label': 'Dominion'}, {'field': 'inf', 'pos': 'br', 'icon': '✧', 'label': 'Influence'}], 'label': 'Structure'},
            'master': {'base': 'leader', 'art': 55, 'stats': [{'field': 'essence', 'pos': 'tr', 'icon': '☾'}], 'label': 'Master — Essence'},
            'card': {'base': 'spell', 'art': 55, 'label': 'Card — art upper 55%'},
            'district': {'base': 'location', 'stats': [{'field': 'population', 'pos': 'tl', 'icon': '👤'}], 'label': 'District — Population'},
        },
        'byType': {'horror': 'unit', 'hunter': 'unit', 'puppet': 'unit', 'folk': 'unit', 'disciple': 'unit', 'killer': 'unit', 'oldone': 'unit', 'child': 'unit',
                   'influence': 'structure', 'effigy': 'structure', 'master': 'master', 'district': 'district',
                   'event': 'card', 'scheme': 'card', 'rite': 'card', 'outbreak': 'card', 'scene': 'card', 'bargain': 'card', 'omen': 'card',
                   'mutation': 'card', 'weapon': 'card', 'relic': 'card', 'possession': 'card', 'strain': 'card', 'planting': 'card', 'trap': 'card'}},
}
# horizon "pass": Ending the Night runs Strikes and the opponent's Rise, so every line is scored past that point
AI = {'eval': sub(C('trophyScore', '$me'), C('trophyScore', '$opp')), 'samples': 1, 'horizon': 'pass',
      'bias': {'move': -0.2, 'tithe': 3, 'reveal': 0.5}}  # cash in Souls when possible

# ---------------------------------------------------------------- write
for c in CARDS: c.pop('sub_', None)
os.makedirs(os.path.join(OUT, 'ai'), exist_ok=True)
def dump(name, obj):
    with open(os.path.join(OUT, name), 'w') as f: json.dump(obj, f, indent=1, ensure_ascii=False); f.write('\n')
dump('manifest.json', MANIFEST)
dump('rules.json', RULES)
dump('cards.json', CARDS)
dump('decks.json', DECKS)
dump('ai/ai.json', AI)
os.makedirs(os.path.join(OUT, 'campaign'), exist_ok=True)
dump('campaign/campaign.json', CAMPAIGN)
print(f'nightfall: {len(CARDS)} cards, {len(F)} functions, {len(P)} procedures, {len(A)} actions')
