#!/usr/bin/env python3
"""Generates the Shadow Earth module (Core Set 1.7) from tools/shadowearth/cards.csv and the fx_*.py effect files.

    python3 tools/shadowearth/build.py        (SE_<LEVER>=n overrides a lever; SE_OUT=<dir> writes elsewhere)

Card statistics come from the CSV verbatim. A card is deck-legal only once its text is implemented (fx_*.py),
so the engine never has to ask players to adjudicate a printed effect.
"""
import csv, glob, importlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsl import *
import lib
from lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SE_OUT') or os.path.join(HERE, '..', '..', 'packages', 'reference-games', 'shadow-earth')
LEVERS = {'WIN': 20, 'MAX_CAP': 8, 'HAND': 7, 'DECK': 50, 'MISSIONS': 2, 'MISSION_MAX': 3, 'SECURITY': 2, 'DOM_CAP': 0, 'TOKEN_CAP': 12}
for k in LEVERS:
    if os.environ.get('SE_' + k) is not None: LEVERS[k] = int(os.environ['SE_' + k])

FACTIONS = {'PsyList': 1, 'Prendick Holdings': 2, 'Dawn Star Society': 3, 'Illuminati': 4, 'Children of the High-Ones': 5, 'Neutral': 0}
FKEY = {'PsyList': 'psylist', 'Prendick Holdings': 'prendick', 'Dawn Star Society': 'dawnstar', 'Illuminati': 'illuminati', 'Children of the High-Ones': 'children', 'Neutral': 'neutral'}

# ---------------------------------------------------------------- cards from the CSV
ROWS = list(csv.DictReader(open(os.path.join(HERE, 'cards.csv'), encoding='utf-8-sig')))
def parse_type(t):
    parts = [p.strip() for p in t.split(' - ')]
    main = parts[0].lower()
    subs = [p.lower() for p in parts[1:]]
    if main == 'operation' and 'response' in subs: return 'response', [s for s in subs if s != 'response']
    if main == 'operation' and 'mission' in subs: return 'mission', [s for s in subs if s != 'mission']
    return main, subs

CARDS, BYNAME = [], {}
for i, r in enumerate(ROWS):
    t, subs = parse_type(r['Type'])
    c = {'id': slug(r['Name']), 'name': r['Name'], 'type': t, 'faction': FKEY[r['Faction']], 'num': f'SE-{i + 1:03d}',
         'rarity': r['Rarity'], 'text': r['Text'].strip(), 'archetype': r['Archetype']}
    if r['Cost'] != '': c['cost'] = int(r['Cost'])
    if r['Force'] != '':
        c['force'], c['trade'], c['will'] = int(r['Force']), int(r['Tradecraft'] or 0), int(r['Will'] or 0)
        c['dur'] = max(2, 2 + c['force'])
    kws = list(subs)
    if r['Unique'] == 'Yes': kws.append('unique'); c['maxCopies'] = 1
    if kws: c['keywords'] = kws
    if t == 'headquarters': c['fno'] = FACTIONS[r['Faction']]; c['security'] = LEVERS['SECURITY']
    if t == 'agenda':
        tier = r['Text'].split('.')[0].replace('Tier ', '')
        c['tier'] = tier
    CARDS.append(c)
    BYNAME[r['Name']] = c

# tokens created by cards (not in the CSV)
def token_card(cid, name, f, t, w, kws, dur=None, text=''):
    c = {'id': cid, 'name': name, 'type': 'operative', 'faction': 'neutral', 'force': f, 'trade': t, 'will': w, 'dur': dur or max(2, 2 + f),
         'keywords': ['token'] + kws, 'maxCopies': 0, 'cost': 0, 'text': text or 'Token.', 'rarity': 'T', 'num': 'SE-T', 'ready': 1}
    CARDS.append(c)
    BYNAME[name] = c
token_card('tok-cultist', 'Cultist', 0, 1, 1, ['cultist'])
token_card('tok-hybrid', 'Hybrid', 1, 1, 0, ['specimen'])
token_card('tok-contractor', 'Contractor', 1, 1, 0, ['contractor'])
token_card('tok-contractor-111', 'Contractor Agent', 1, 1, 1, ['contractor'])
token_card('tok-specimen', 'Specimen', 1, 1, 1, ['specimen'])
token_card('tok-specimen-2', 'Specimen Brute', 2, 1, 1, ['specimen'])
token_card('tok-recruit', 'Recruit', 1, 1, 1, [])
token_card('tok-morning-star', 'Morning Star Demon', 8, 6, 8, ['demon'], dur=8)
token_card('tok-high-one', 'High-One Manifestation', 7, 4, 8, ['entity'], dur=9)

# ---------------------------------------------------------------- card effects
for path in sorted(glob.glob(os.path.join(HERE, 'fx_*.py'))):
    importlib.import_module(os.path.basename(path)[:-3])
unknown = [n for n in FX if n not in BYNAME]
assert not unknown, f'effects for unknown cards: {unknown}'
for name, kw in FX.items():
    c = BYNAME[name]
    for k, v in kw.items():
        if k == 'op' or k == 'resp':  # operations and responses: run only if not cancelled, then go to the discard pile
            for ab in v:
                ab['label'] = ab.get('label', name)
                ab['do'] = [IF(eq(g('game', 'ocan'), 0), ab['do'])] + [C('opEnd', '$self')]
            c[k] = v
        elif k in ('mop', 'agenda', 'abil', 'rabil'):
            for ab in v: ab.setdefault('do', [])
            c[k] = v
        elif k == 'kws': c['keywords'] = c.get('keywords', []) + v
        else: c[k] = v
    c['ready'] = 1
    if 'deploy' in kw: c['hasDeploy'] = 1
    if 'succ' in kw: c['hasSucc'] = 1
    if 'pre' in kw: c['hasPre'] = 1
    if 'imm' in kw: c['hasImm'] = 1
for c in CARDS:
    c.setdefault('ready', 0)

# ---------------------------------------------------------------- functions
F = {}
def fn(name, params, body): F[name] = {'params': params, 'body': body}
P = {}
def proc(name, params, body): P[name] = {'params': params, 'do': body}

def seat(p): return g(p, 'seat')
fn('active', ['$o'], AND(eq(g('$o', 'dis'), 0), lt(g('$o', 'noab'), '$turn')))
fn('avail', ['$p'], add(g('$p', 'inf'), g('$p', 'tmp'), g('$p', 'tmpc')))
fn('printed', ['$o', '$a'], Q(eq('$a', 1), g('$o', 'force'), Q(eq('$a', 2), g('$o', 'trade'), g('$o', 'will'))))
fn('ovr', ['$o', '$a'], Q(eq('$a', 1), g('$o', 'oF'), Q(eq('$a', 2), g('$o', 'oT'), g('$o', 'oW'))))
fn('tmpA', ['$o', '$a'], Q(eq('$a', 1), g('$o', 'cF'), Q(eq('$a', 2), g('$o', 'cT'), g('$o', 'cW'))))
# current attribute: printed + until-Cleanup changes + every static term, never below 0; a mission override wins
fn('attr', ['$o', '$a'], Q(gt(C('ovr', '$o', '$a'), 0), sub(C('ovr', '$o', '$a'), 1),
    mx(0, add(C('printed', '$o', '$a'), C('tmpA', '$o', '$a'), *(ATTR or [0])))))
# an operative's contribution to the current mission
fn('val', ['$o'], Q(eq(g('$o', 'z0'), 1), 0, add(C('attr', '$o', Q(AND(defending('$o'), eq(g('game', 'dwill'), 1)), 3, g('game', 'ma'))), g('$o', 'mb'))))
fn('dur', ['$o'], add(g('$o', 'dur'), *(DUR or [0])))
fn('sec', ['$p'], mx(0, add(LEVERS['SECURITY'], *(SEC or [0]))))
fn('cost', ['$c', '$p'], mx(Q(ge(g('$c', 'cost'), 1), 1, 0), add(g('$c', 'cost'), *(COST or [0]))))
fn('canPay', ['$c', '$p'], ge(C('avail', '$p'), C('cost', '$c', '$p')))
fn('tokens', ['$p'], cnt(flt(OPS('$p'), has('$it', 'token'))))
fn('isNew', ['$o'], eq(g('$o', 'newT'), '$turn'))
fn('canDef', ['$o'], AND(OR(eq(g('$o', 'ex'), 0), has('$o', 'ambush')), lt(g('$o', 'nodef'), '$turn'), NOT(OR(*(NODEF or [lit(False)])))))
fn('canJoin', ['$o', '$k'], AND(OR(eq(g('$o', 'ex'), 0), AND(C('isNew', '$o'), OR(eq(g('$o', 'hasteT'), '$turn'), *(HASTE or [lit(False)])))),
    ne(g('$o', 'nomis'), '$turn'), NOT(OR(*(NOATK or [lit(False)])))))
fn('attackers', ['$p', '$k'], flt(OPS('$p'), C('canJoin', '$it', '$k')))
# mission targets: the opposing Headquarters (a player id) or a legal opposing permanent
fn('tgtOk', ['$o', '$k'], NOT(OR(*(lib.TGTDENY or [lit(False)]))))
fn('targets', ['$p', '$k'], ['concat', ['list', ['opp', '$p']],
    Q(eq('$k', 1), flt(['concat', OPS(['opp', '$p']), facs(['opp', '$p'])], C('tgtOk', '$it', '$k')),
    Q(eq('$k', 2), flt(GEAR(['opp', '$p']), AND(typ('$it', 'asset'), le(g('$it', 'cost'), 3), C('tgtOk', '$it', '$k'))),
    Q(eq('$k', 3), flt(OPS(['opp', '$p']), C('tgtOk', '$it', '$k')), lit([]))))])
fn('missionCost', ['$p', '$k', '$t', '$team'], mx(0, add(1, *(lib.MCOST or [0]))))
fn('shield', ['$o'], add(0, *(lib.SHIELD or [0])))
fn('missionsLeft', ['$p'], lt(g('$p', 'att'), mn(LEVERS['MISSION_MAX'], g('$p', 'attMax'))))
fn('agendaOn', ['$a'], AND(eq(g('$a', 'done'), 1), lt(g('$a', 'sup'), '$turn')))
fn('agendaDone', ['$p', '$name'], ANY(['cards', '$p', 'agenda'], AND(eq(g('$it', 'card'), '$name'), C('agendaOn', '$it'))))
fn('loadouts', ['$o'], cnt(flt(gearOn('$o'), has('$it', 'loadout'))))
fn('bearerOk', ['$c', '$o'], AND(Q(eq(g('$c', 'bearerKw'), 0), lit(True), has('$o', g('$c', 'bearerKw'))),
    OR(NOT(has('$c', 'loadout')), lt(C('loadouts', '$o'), 2)), NOT(ANY(gearOn('$o'), eq(g('$it', 'card'), g('$c', 'card'))))))
fn('playOk', ['$c', '$p'], AND(*(lib.PLAYREQ or [lit(True)]),
    OR(NOT(AND(has('$c', 'unique'), typ('$c', 'operative'))), NOT(ANY(OPS('$p'), eq(g('$it', 'card'), g('$c', 'card')))))))
fn('pick1', ['$l'], first('$l'))
fn('covertT', ['$o'], OR(lit(False), *lib.COVERT))
fn('canAttachAny', ['$c', '$p'], ANY(OPS('$p'), C('bearerOk', '$c', '$it')))
# The Hidden Treasury: temporary Influence can't pay for Responses
fn('treasury', ['$p'], ANY(PERMS('$p'), AND(isc('$it', 'The Hidden Treasury'), C('active', '$it'))))
fn('canPayR', ['$c', '$p'], Q(C('treasury', '$p'), ge(g('$p', 'inf'), C('cost', '$c', '$p')), C('canPay', '$c', '$p')))

# ---------------------------------------------------------------- procedures
proc('gainTmp', ['$p', '$n'], [IF(gt('$n', 0), [INC('$p', 'tmp', '$n'), emit('tmpGained', p='$p', n='$n')])])
proc('gainTmpC', ['$p', '$n'], [IF(gt('$n', 0), [INC('$p', 'tmpc', '$n'), emit('tmpGained', p='$p', n='$n')])])
proc('spend', ['$p', '$n'], [
    LET('$a', mn('$n', g('$p', 'tmpc'))), INC('$p', 'tmpc', neg('$a')),
    LET('$b', mn(sub('$n', '$a'), g('$p', 'tmp'))), INC('$p', 'tmp', neg('$b')),
    INC('$p', 'inf', neg(sub(sub('$n', '$a'), '$b'))), emit('spent', p='$p', n='$n')])
proc('payFor', ['$c'], [C('spend', '$me', C('cost', '$c', '$me'))])
proc('payResp', ['$c'], [IF(C('treasury', '$me'), [INC('$me', 'inf', neg(C('cost', '$c', '$me'))), emit('spent', p='$me', n=C('cost', '$c', '$me'))], [C('payFor', '$c')])])
proc('gainDom', ['$p', '$n'], [
    LET('$k', mn('$n', sub(g('$p', 'domMax'), g('$p', 'domT')))),
    LET('$k2', Q(AND(IN_MISSION, ANY(ATK, eq(g('$it', 'nodomT'), '$turn'))), 0, Q(AND(gt(LEVERS['DOM_CAP'], 0), IN_MISSION), mn('$k', sub(LEVERS['DOM_CAP'], g('$p', 'mDom'))), '$k'))),
    IF(gt('$k2', 0), [INC('$p', 'dom', '$k2'), INC('$p', 'domT', '$k2'), INC('$p', 'mDom', '$k2'), emit('dominance', p='$p', n='$k2'),
        IF(ge(g('$p', 'dom'), LEVERS['WIN']), [['win', ['list', '$p']]])])])
proc('loseDom', ['$p', '$n'], [SET('$p', 'dom', mx(0, sub(g('$p', 'dom'), '$n')))])
proc('gainRev', ['$p', '$n'], [LET('$k', mn('$n', sub(10, g('$p', 'rev')))), IF(gt('$k', 0), [
    INC('$p', 'rev', '$k'), INC('$p', 'revG', '$k'), INC('$p', 'revT', '$k'), emit('revelation', p='$p', n='$k')])])
proc('hurt', ['$o', '$n'], [IF(AND(isObj('$o'), gt('$n', 0)), [['damage', '$o', '$n', '$me']])])
proc('heal', ['$o', '$n'], [IF(isObj('$o'), [SET('$o', 'dmg', mx(0, sub(g('$o', 'dmg'), '$n')))])])
proc('disable', ['$o'], [IF(AND(isObj('$o'), eq(g('$o', 'dis'), 0)), [
    IF(AND(C('agendaDone', ctrl('$o'), 'the-final-settlement'), ne(g(ctrl('$o'), 'fsT'), '$turn'), typ('$o', 'facility')),
        [SET(ctrl('$o'), 'fsT', '$turn'), emit('prevented', o='$o', what='disable')],
        [SET('$o', 'dis', 1), IF(ne(ctrl('$o'), '$me'), [INC('$me', 'disOpp', 1)]), emit('disabled', o='$o', p=ctrl('$o'), by='$me')])])])
proc('putCtl', ['$o'], [IF(AND(isObj('$o'), eq(g('$o', 'ctl'), 0)), [SET('$o', 'ctl', 1), INC('$me', 'ctlPlaced', 1), emit('control', o='$o', p='$me')])])
proc('makeTokens', ['$p', '$card', '$n', '$r'], [EACH(['range', mx(0, mn('$n', sub(LEVERS['TOKEN_CAP'], C('tokens', '$p'))))], '$i', [
    ['create', '$card', '$p', 'ops', {'as': '$tk'}], SET('$tk', 'ex', sub(1, '$r')), SET('$tk', 'newT', '$turn')])])
proc('peekHand', ['$p', '$q'], [IF(gt(cnt(HAND('$q')), 0), [
    ['random', {'from': HAND('$q'), 'as': '$r'}], SET('$p', 'sawT', 1), emit('peeked', to=['list', '$p'], card=g('$r', 'card'), p='$p', from_='hand')])])
proc('peekTop', ['$p', '$q'], [IF(gt(cnt(DECK('$q')), 0), [emit('peeked', to=['list', '$p'], card=g(first(DECK('$q')), 'card'), p='$p', from_='deck')])])
proc('revealTop', ['$p', '$q'], [IF(gt(cnt(DECK('$q')), 0), [LET('$r', first(DECK('$q'))), emit('revealed', card=g('$r', 'card'), p='$p', owner='$q'),
    IF(ne('$p', '$q'), [SET('$p', 'revealedT', 1)])])])
proc('detach', ['$o'], [EACH(gearOn('$o'), '$a', [IF(has('$a', 'loadout'), [['unlink', '$a', 'bearer']], [['move', '$a', 'grave']])])])
proc('gone', ['$o'], [C('detach', '$o'), IF(has('$o', 'token'), [['move', '$o', 'void']], [IF(eq(g('$o', 'exileOnLeave'), 1), [['move', '$o', 'exile']], [['move', '$o', 'grave']])])])
proc('lookHand', ['$p', '$q'], [SET('$p', 'sawT', 1), emit('lookedHand', to=['list', '$p'], cards=['map', HAND('$q'), g('$it', 'card')], p='$p')])
proc('eliminate', ['$o'], [IF(isObj('$o'), [SET('game', 'saved', 0), *lib.SAVE, IF(eq(g('game', 'saved'), 0), [
    emit('eliminated', o='$o', card=g('$o', 'card'), owner=g('$o', 'owner'), ctrl=ctrl('$o'), by=g('$o', 'lastBy')), C('gone', '$o')])])])
proc('sacrifice', ['$o'], [IF(isObj('$o'), [emit('sacrificed', o='$o', card=g('$o', 'card'), p=ctrl('$o')), INC(ctrl('$o'), 'sacN', 1), C('gone', '$o')])])
proc('toHand', ['$o'], [IF(isObj('$o'), [IF(has('$o', 'token'), [C('gone', '$o')], [C('detach', '$o'), ['move', '$o', 'hand']])])])
proc('discardN', ['$p', '$n'], [LET('$k', mn('$n', cnt(HAND('$p')))), IF(gt('$k', 0), [
    choose(HAND('$p'), '$ds', 'Discard', '$k', '$k', who='$p'), ['move', '$ds', 'grave'], emit('discarded', p='$p', n='$k')])])
proc('loot', ['$p', '$n'], [['draw', '$p', '$n'], C('discardN', '$p', '$n')])
proc('scry', ['$p', '$n'], [IF(gt(cnt(DECK('$p')), 0), [
    choose(['top', '$p', 'deck', '$n'], '$bs', 'Scry: choose cards to put on the bottom (the rest stay on top)', 0, '$n', who='$p'),
    ['move', '$bs', 'deck'], INC('$p', 'scryT', 1), emit('scried', p='$p')])])
proc('opEnd', ['$c'], [IF(isObj('$c'), [['move', '$c', 'grave']]), SET('game', 'ocan', 0)])
proc('played', ['$c', '$p'], [INC('$p', 'acted', 1),
    *[IF(has('$c', k), [INC('$p', 'pl_' + k, 1)]) for k in ['psychic', 'specimen', 'adaptation', 'scripture', 'pact', 'demon', 'cultist', 'institution',
                                                            'artifact', 'contractor', 'entity', 'occultist', 'alien', 'ritual', 'scientist', 'loadout']],
    INC('$p', ['+', 'pl_', g('$c', 'type')] if False else 'plAny', 1),
    IF(typ('$c', 'operative'), [INC('$p', 'pl_operative', 1)]), IF(typ('$c', 'facility'), [INC('$p', 'pl_facility', 1)]),
    IF(typ('$c', 'asset'), [INC('$p', 'pl_asset', 1), IF(ge(g('$c', 'cost'), 4), [INC('$p', 'bigAssetT', 1)])]), IF(typ('$c', 'project'), [INC('$p', 'pl_project', 1)]),
    IF(typ('$c', 'operation'), [INC('$p', 'pl_operation', 1)]), IF(typ('$c', 'response'), [INC('$p', 'pl_response', 1)]),
    emit('played', c='$c', p='$p', card=g('$c', 'card'), type=g('$c', 'type'))])

# Operations: an opponent's cancel effects get their chance here (set game.ocan to cancel)
proc('opStart', ['$c'], [SET('game', 'ocan', 0), C('played', '$c', '$me'), LET('$c2', '$c'), *lib.OPSTART])

# ---------------------------------------------------------------- missions
PRE_DEFEND, AFTER_DEFEND = lib.PRE_DEFEND, lib.AFTER_DEFEND
proc('startMission', ['$k', '$a', '$t', '$team'], [
    SET('game', 'mk', '$k'), SET('game', 'ma', '$a'), SET('game', 'mp', add(seat('$me'), 1)), SET('game', 'am', 0), SET('game', 'dm', 0),
    SET('game', 'mcan', 0), SET('game', 'dwill', 0), SET('game', 'hqT', Q(isObj('$t'), 0, 1)), SET('$me', 'mDom', 0), SET('$opp', 'mDom', 0),
    IF(isObj('$t'), [SET('$t', 'tgt', 1)]),
    EACH('$team', '$x', [SET('$x', 'atk', 1), IF(ne(g('$x', 'freeJoin'), '$turn'), [SET('$x', 'ex', 1)])]),
    INC('$me', 'att', 1), INC('$me', 'missT', 1), IF(le('$k', 3), [INC('$me', 'basicT', 1)]),
    IF(AND(isObj('$t'), typ('$t', 'facility')), [INC('$me', 'facMis', 1)]),
    emit('missionDeclared', p='$me', kind='$k', attr='$a', t='$t'),
    ['openWindow', 'mission', {'data': {'p': '$me', 'def': '$opp'}}],
    C('missionEnd')])
proc('missionEnd', [], [
    EACH(['concat', PERMS(), ['cards', '*', 'agenda']], '$x', [IF(OR(gt(g('$x', 'atk'), 0), gt(g('$x', 'dfn'), 0), gt(g('$x', 'tgt'), 0), ne(g('$x', 'mb'), 0), gt(g('$x', 'z0'), 0)), [
        SET('$x', 'atk', 0), SET('$x', 'dfn', 0), SET('$x', 'tgt', 0), SET('$x', 'mb', 0), SET('$x', 'z0', 0), SET('$x', 'oF', 0), SET('$x', 'oT', 0), SET('$x', 'oW', 0)])]),
    EACH(flt(['cards', '*', 'limbo'], eq(g('$it', 'mopc'), 1)), '$m', [['move', '$m', 'grave']]),
    *[SET('game', k, 0) for k in ['mp', 'mk', 'ma', 'am', 'dm', 'mcan', 'hqT', 'dwill']]])
proc('assignDefense', [], [
    LET('$cov', AND(eq(cnt(ATK), 1), ANY(ATK, OR(has('$it', 'covert'), C('covertT', '$it'))))),
    LET('$can', flt(OPS('$opp'), C('canDef', '$it'))),
    IF('$cov', [choose('$can', '$d1', 'Assign a defender (a Covert attacker allows only one)', 0, 1, who='$opp'), IF(isObj('$d1'), [SET('$d1', 'dfn', 1)])],
        [choose('$can', '$ds', 'Assign defenders (up to 2)', 0, 2, who='$opp'), EACH('$ds', '$d', [SET('$d', 'dfn', 1)])]),
    EACH(DFN, '$d', [IF(NOT(has('$d', 'ambush')), [SET('$d', 'ex', 1)])]),
    emit('defenders', p='$opp', n=cnt(DFN)), *AFTER_DEFEND])
REWARD_EXTRA = {'strike_opt': [], 'reward': []}
proc('basicReward', [], [
    LET('$t', TGT),
    IF(isObj('$t'), [
        IF(eq(g('game', 'mk'), 1), [
            choose(Q(typ('$t', 'operative'), opts('1 Dominance', '3 damage'),
                     Q(AND(typ('$t', 'facility'), ANY(ATK, isc('$it', 'Prototype Behemoth'))), opts('1 Dominance', 'Disable', 'Destroy (and 1 Dominance)'), opts('1 Dominance', 'Disable'))),
                   '$r', 'Strike succeeded: choose your reward'),
            IF(eq('$r', '1 Dominance'), [dom(1)]), IF(eq('$r', '3 damage'), [dmg('$t', add(3, *(lib.STRIKE_EXTRA or [0])))]), IF(eq('$r', 'Disable'), [disable('$t')]),
            IF(eq('$r', 'Destroy (and 1 Dominance)'), [C('gone', '$t'), dom(1)])]),
        IF(eq(g('game', 'mk'), 2), [choose(['concat', opts('1 Dominance', 'Return the Asset'), Q(ANY(ATK, isc('$it', 'Courier with No Name')), opts('Return the Courier to hand instead'), lit([])),
                                                *[Q(cond, opts(lab), lit([])) for lab, cond, eff in lib.INFIL_OPTS]], '$r', 'Infiltrate succeeded: choose your reward'),
            IF(eq('$r', '1 Dominance'), [dom(1)]), IF(eq('$r', 'Return the Asset'), [bounce('$t')]),
            IF(eq('$r', 'Return the Courier to hand instead'), [bounce(first(flt(ATK, isc('$it', 'Courier with No Name'))))]),
            *[IF(eq('$r', lab), eff) for lab, cond, eff in lib.INFIL_OPTS]]),
        IF(eq(g('game', 'mk'), 3), [choose(opts('1 Dominance', 'Exhaust it and draw'), '$r', 'Subvert succeeded: choose your reward'),
            IF(eq('$r', '1 Dominance'), [dom(1)], [exhaust('$t'), draw(1)])])],
        [IF(AND(eq(g('game', 'mk'), 2), gt(len(lib.INFIL_OPTS), 0), OR(lit(False), *[cond for lab, cond, eff in lib.INFIL_OPTS])), [
            choose(['concat', opts('1 Dominance'), *[Q(cond, opts(lab), lit([])) for lab, cond, eff in lib.INFIL_OPTS]], '$r', 'Infiltrate succeeded: choose your reward'),
            IF(eq('$r', '1 Dominance'), [dom(1)]), *[IF(eq('$r', lab), eff) for lab, cond, eff in lib.INFIL_OPTS]],
        [IF(ANY(ATK, isc('$it', 'Courier with No Name')), [
            choose(opts('1 Dominance', 'Return the Courier to hand instead'), '$r', 'Mission succeeded: choose your reward'),
            IF(eq('$r', '1 Dominance'), [dom(1)], [bounce(first(flt(ATK, isc('$it', 'Courier with No Name'))))])], [dom(1)])])])])
proc('resolveMission', [], [
    LET('$at', add(SUM(ATK, C('val', '$it')), g('game', 'am'))),
    LET('$dt', Q(gt(cnt(DFN), 0), add(SUM(DFN, C('val', '$it')), g('game', 'dm')), add(C('sec', '$opp'), g('game', 'dm')))),
    LET('$ok', AND(eq(g('game', 'mcan'), 0), gt(cnt(ATK), 0), gt('$at', '$dt'))),
    LET('$mc', first(flt(['cards', '*', 'limbo'], eq(g('$it', 'mopc'), 1)))),
    IF('$ok', [
        IF(le(g('game', 'mk'), 3), [C('basicReward')]),
        IF(AND(eq(g('game', 'mk'), 4), isObj('$mc')), [IF(eq(g('$mc', 'hasSucc'), 1), [['run', '$mc', 'succ']])]),
        IF(eq(g('game', 'mk'), 5), [LET('$t', TGT), choose(Q(gt(g('$t', 'prog'), 0), opts('Disable', 'Remove a counter'), opts('Disable')), '$r', 'Investigate succeeded'),
            IF(eq('$r', 'Disable'), [disable('$t')], [INC('$t', 'prog', -1)])]),
        IF(eq(g('game', 'mk'), 6), [SET(TGT, 'sup', add('$turn', 2)), emit('suppressed', o=TGT), dom(1)]),
        IF(eq(g('game', 'mk'), 1), [SET('$me', 'sucS', 1)]), IF(eq(g('game', 'mk'), 2), [SET('$me', 'sucI', 1)]),
        IF(eq(g('game', 'mk'), 3), [SET('$me', 'sucW', 1)]),
        IF(eq(g('game', 'ma'), 3), [SET('$me', 'willBest', mx(g('$me', 'willBest'), '$at')), SET('$me', 'willMaxG', mx(g('$me', 'willMaxG'), '$at')), SET('$me', 'sucWill', 1)])],
        [IF(AND(gt(cnt(DFN), 0), eq(g('game', 'mcan'), 0)), [INC('$opp', 'defended', 1), emit('defended', p='$opp')])]),
    emit('missionResult', p='$me', kind=g('game', 'mk'), attr=g('game', 'ma'), ok=Q('$ok', 1, 0), at='$at', dt='$dt',
         ndef=cnt(DFN), tgt=Q(isObj(TGT), TGT, '$opp'))])
proc('preDefend', [], [LET('$mc', first(flt(['cards', '*', 'limbo'], eq(g('$it', 'mopc'), 1)))),
    IF(AND(isObj('$mc'), eq(g('$mc', 'hasPre'), 1)), [['run', '$mc', 'pre']]), *PRE_DEFEND])

# ---------------------------------------------------------------- turn
proc('refresh', [], [
    INC('$me', 'turns', 1), SET('$me', 'tmp', 0), SET('$me', 'tmpc', 0),
    EACH(['concat', SITES('$me'), GEAR('$me')], '$x', [IF(gt(g('$x', 'dis'), 0), [SET('$x', 'dis', 0), emit('enabled', o='$x')])]),
    EACH(PERMS('$me'), '$x', [IF(lt(g('$x', 'noready'), '$turn'), [SET('$x', 'ex', 0)])]),
    SET('$me', 'cap', mn(LEVERS['MAX_CAP'], add(g('$me', 'cap'), 1))), SET('$me', 'inf', g('$me', 'cap')),
    IF(AND(eq(g('$me', 'turns'), 1), ne(seat('$me'), g('game', 'first'))), [C('gainTmp', '$me', 1)]),
    *[SET('$me', k, 0) for k in ['att', 'missT', 'basicT', 'facMis', 'bigAssetT', 'sucS', 'sucI', 'sucW', 'sucWill', 'willBest', 'revealedT', 'sawT', 'domT', 'revT', 'scryT', 'acted',
                                 'plAny', 'pl_operative', 'pl_facility', 'pl_asset', 'pl_project', 'pl_operation', 'pl_response', 'skipDraw',
                                 'pl_psychic', 'pl_specimen', 'pl_adaptation', 'pl_scripture', 'pl_pact', 'pl_demon', 'pl_cultist', 'pl_institution',
                                 'pl_artifact', 'pl_contractor', 'pl_entity', 'pl_occultist', 'pl_alien', 'pl_ritual', 'pl_scientist', 'pl_loadout']],
    SET('$me', 'attMax', LEVERS['MISSIONS']), SET('$me', 'domMax', 99),
    emit('refresh', p='$me')])
proc('drawStep', [], [IF(eq(g('$me', 'skipDraw'), 0), [draw(1)])])
proc('cleanup', [], [emit('cleanup', p='$me')])
proc('endTurn', [], [
    EACH(PERMS(), '$x', [IF(OR(ne(g('$x', 'cF'), 0), ne(g('$x', 'cT'), 0), ne(g('$x', 'cW'), 0), gt(g('$x', 'pv'), 0)), [
        SET('$x', 'cF', 0), SET('$x', 'cT', 0), SET('$x', 'cW', 0), SET('$x', 'pv', 0)])]),
    EACH(flt(OPS(), AND(gt(g('$it', 'ctlT'), 0), le(g('$it', 'ctlT'), '$turn'))), '$x', [SET('$x', 'ctlT', 0), SET('$x', 'ex', 1), ['control', '$x', g('$x', 'owner')]]),
    SET('$me', 'tmpc', 0),
    SET('$me', 'stS', Q(eq(g('$me', 'sucS'), 1), add(g('$me', 'stS'), 1), 0)),
    SET('$me', 'stI', Q(eq(g('$me', 'sucI'), 1), add(g('$me', 'stI'), 1), 0)),
    SET('$me', 'stW', Q(eq(g('$me', 'sucW'), 1), add(g('$me', 'stW'), 1), 0)),
    INC('$me', 'infTurns', g('$me', 'sucI')), SET('$me', 'lastMiss', g('$me', 'missT')), SET('$me', 'lastSuc', Q(OR(eq(g('$me', 'sucS'), 1), eq(g('$me', 'sucI'), 1), eq(g('$me', 'sucW'), 1), eq(g('$me', 'sucOp'), 1)), 1, 0)),
    SET('$me', 'sucOp', 0),
    IF(gt(cnt(HAND('$me')), LEVERS['HAND']), [C('discardN', '$me', sub(cnt(HAND('$me')), LEVERS['HAND']))])])

proc('setupPlayer', ['$p'], [
    SET('$p', 'faction', g(first(['cards', '$p', 'hq']), 'fno')), SET('$p', 'cap', 1), SET('$p', 'domMax', 99), SET('$p', 'attMax', LEVERS['MISSIONS']),
    ['shuffle', '$p', 'deck'], ['draw', '$p', 5],
    IF(eq(g('game', 'noMulligan'), 0), [
        choose(opts('Keep', 'Mulligan'), '$mu', 'Keep this hand, or mulligan (shuffle it in, draw 5, put 1 on the bottom)?', who='$p'),
        IF(eq('$mu', 'Mulligan'), [['move', HAND('$p'), 'deck'], ['shuffle', '$p', 'deck'], ['draw', '$p', 5],
            choose(HAND('$p'), '$bot', 'Mulligan: put one card on the bottom of your deck', 1, 1, who='$p'), ['move', '$bot', 'deck']])])])

# ---------------------------------------------------------------- actions
A = {}
PERM_TYPES = lit(['operative', 'facility', 'asset', 'project'])
inHand = lambda pred: flt(HAND('$me'), AND(pred, eq(g('$it', 'ready'), 1), C('canPay', '$it', '$me'), C('playOk', '$it', '$me')))
A['deploy'] = {'label': 'Play', 'phases': ['development'], 'source': inHand(inl(g('$it', 'type'), PERM_TYPES)),
    'targets': [{'as': '$b', 'prompt': 'Attach to which operative?', 'from': flt(OPS('$me'), C('bearerOk', '$self', '$it')),
                 'min': Q(eq(g('$self', 'attach'), 1), 1, 0), 'max': Q(eq(g('$self', 'attach'), 1), 1, 0)}],
    'cost': [C('payFor', '$self')],
    'do': [['move', '$self', Q(typ('$self', 'operative'), 'ops', Q(typ('$self', 'asset'), 'gear', 'sites')), {'as': '$c'}],
           IF(typ('$c', 'operative'), [SET('$c', 'ex', Q(eq(g('$c', 'entersReady'), 1), 0, 1))]),
           IF(AND(typ('$c', 'asset'), isObj('$b')), [['link', '$c', 'bearer', '$b'], emit('attached', a='$c', o='$b', p='$me')]),
           SET('$c', 'newT', '$turn'), C('played', '$c', '$me'),
           IF(eq(g('$c', 'hasDeploy'), 1), [['run', '$c', 'deploy']]), emit('deployed', c='$c', p='$me', card=g('$c', 'card'), type=g('$c', 'type'))]}
A['op'] = {'label': 'Play', 'phases': ['development'], 'activated': 'op', 'source': inHand(typ('$it', 'operation')),
    'cost': [C('payFor', '$self')], 'do': [C('opStart', '$self')]}
A['respond'] = {'label': 'Respond', 'phases': ['respond'], 'activated': 'resp',
    'source': flt(HAND('$me'), AND(typ('$it', 'response'), eq(g('$it', 'ready'), 1), C('canPayR', '$it', '$me'))),
    'cost': [C('payResp', '$self')], 'do': [C('opStart', '$self')]}
A['use'] = {'label': 'Use', 'phases': ['development', 'operations'], 'activated': 'abil',
    'source': ['concat', flt(PERMS('$me'), C('active', '$it')), flt(['cards', '$me', 'agenda'], C('agendaOn', '$it'))], 'do': []}
A['useR'] = {'label': 'Use', 'phases': ['respond'], 'activated': 'rabil', 'source': flt(PERMS('$me'), C('active', '$it')), 'do': []}
A['equip'] = {'label': 'Attach / transfer (1 Influence)', 'phases': ['development'],
    'source': flt(GEAR('$me'), AND(has('$it', 'loadout'), ge(C('avail', '$me'), 1))),
    'targets': [{'as': '$b', 'prompt': 'Attach to which operative?', 'from': flt(OPS('$me'), AND(ne('$it', bearerOf('$self')), C('bearerOk', '$self', '$it')))}],
    'cost': [C('spend', '$me', 1)], 'do': [['unlink', '$self', 'bearer'], ['link', '$self', 'bearer', '$b'], emit('attached', a='$self', o='$b', p='$me', transfer=1)]}
MISSION_REQ = [{'if': C('missionsLeft', '$me'), 'why': 'No mission attempts left this turn'}]
def basic(kind, attr, label):
    k = MK[kind]
    return {'label': label, 'phases': ['operations'], 'req': MISSION_REQ + [{'if': ge(C('avail', '$me'), C('missionCost', '$me', k, NULL, lit([]))), 'why': 'Not enough Influence'}],
            'targets': [{'as': '$t', 'from': C('targets', '$me', k), 'prompt': f'{label}: choose the target (the opposing Headquarters or a permanent)'},
                        {'as': '$team', 'from': C('attackers', '$me', k), 'min': 1, 'max': 2, 'prompt': f'{label}: the attacking team (1 or 2 ready operatives)'}],
            'cost': [C('spend', '$me', C('missionCost', '$me', k, '$t', '$team'))], 'do': [C('startMission', k, MA[attr], '$t', '$team')]}
A['strike'] = basic('strike', 'F', 'Strike (Force)')
A['infiltrate'] = basic('infiltrate', 'T', 'Infiltrate (Tradecraft)')
A['subvert'] = basic('subvert', 'W', 'Subvert (Will)')
A['investigate'] = {'label': 'Investigate Project (Tradecraft, 2)', 'phases': ['operations'], 'req': MISSION_REQ + [{'if': ge(C('avail', '$me'), 2), 'why': 'Needs 2 Influence'}],
    'targets': [{'as': '$t', 'from': projs('$opp'), 'prompt': 'Which opposing Project?'},
                {'as': '$team', 'from': C('attackers', '$me', 5), 'min': 1, 'max': 2, 'prompt': 'The attacking team'}],
    'cost': [C('spend', '$me', 2)], 'do': [C('startMission', 5, 2, '$t', '$team')]}
A['disrupt'] = {'label': 'Disrupt Breakthrough (Tradecraft, 2)', 'phases': ['operations'], 'req': MISSION_REQ + [{'if': ge(C('avail', '$me'), 2), 'why': 'Needs 2 Influence'}],
    'targets': [{'as': '$t', 'from': flt(['cards', '$opp', 'agenda'], eq(g('$it', 'done'), 1)), 'prompt': 'Which completed opposing Agenda?'},
                {'as': '$team', 'from': C('attackers', '$me', 6), 'min': 1, 'max': 2, 'prompt': 'The attacking team'}],
    'cost': [C('spend', '$me', 2)], 'do': [SET('game', 'dwill', 1), C('startMission', 6, 2, '$t', '$team'), SET('game', 'dwill', 0)]}
# a Mission Operation: its card supplies the target (ability slot $t) and the success effect (field succ); it costs printed + 1
A['mop'] = {'label': 'Mission', 'phases': ['operations'], 'activated': 'mop',
    'source': flt(HAND('$me'), AND(typ('$it', 'mission'), eq(g('$it', 'ready'), 1), ge(C('avail', '$me'), add(C('cost', '$it', '$me'), 1)))),
    'req': MISSION_REQ,
    'targets': [{'as': '$team', 'from': C('attackers', '$me', 4), 'min': 1, 'max': 2, 'prompt': 'The attacking team (1 or 2 ready operatives)'}],
    'cost': [C('spend', '$me', add(C('cost', '$self', '$me'), C('missionCost', '$me', 4, '$t', '$team')))],
    'do': [['move', '$self', 'limbo', {'as': '$mc'}], SET('$mc', 'mopc', 1), C('played', '$mc', '$me'), SET('$me', 'sucOp', 0),
           C('startMission', 4, g('$mc', 'mattr'), '$t', '$team')]}
A['complete'] = {'label': 'Complete Agenda', 'phases': ['development', 'operations'], 'activated': 'agenda',
    'source': flt(['cards', '$me', 'agenda'], eq(g('$it', 'done'), 0)),
    'do': [SET('$self', 'done', 1), emit('agendaCompleted', p='$me', card=g('$self', 'card')), IF(eq(g('$self', 'hasImm'), 1), [['run', '$self', 'imm']])]}

# ---------------------------------------------------------------- rules
HQS = [c['id'] for c in CARDS if c['type'] == 'headquarters']
RULES = {
    'players': {'min': 2, 'max': 2},
    'playerVars': {'dom': 0, 'faction': 0, 'cap': 0, 'inf': 0, 'tmp': 0, 'tmpc': 0, 'rev': 0, 'att': 0, 'attMax': 2, 'domMax': 99},
    'gameVars': {'first': 0, 'noMulligan': 0, 'mp': 0, 'mk': 0, 'ma': 0, 'am': 0, 'dm': 0, 'mcan': 0, 'hqT': 0, 'ocan': 0, 'dwill': 0},
    'objectVars': {'ex': 0, 'dmg': 0, 'atk': 0, 'dfn': 0, 'tgt': 0, 'mb': 0, 'z0': 0, 'oF': 0, 'oT': 0, 'oW': 0, 'cF': 0, 'cT': 0, 'cW': 0,
                   'newT': 0, 'dis': 0, 'ctl': 0, 'prog': 0, 'pv': 0, 'nodef': 0, 'noab': 0, 'nomis': 0, 'noready': 0, 'ctlT': 0, 'freeJoin': 0,
                   'hasteT': 0, 'lastBy': 0, 'done': 0, 'sup': 0, 'mopc': 0},
    'zones': [
        {'id': 'deck', 'vis': 'hidden', 'ordered': True},
        {'id': 'hand', 'vis': 'owner'},
        {'id': 'hq', 'vis': 'public', 'abilities': True},
        {'id': 'agenda', 'vis': 'public', 'abilities': True},
        {'id': 'sites', 'vis': 'public', 'abilities': True},
        {'id': 'gear', 'vis': 'public', 'abilities': True},
        {'id': 'ops', 'vis': 'public', 'abilities': True},
        {'id': 'limbo', 'vis': 'public', 'hideEmpty': True},
        {'id': 'grave', 'vis': 'public', 'ordered': True},
        {'id': 'exile', 'vis': 'public', 'hideEmpty': True},
        {'id': 'void', 'vis': 'public', 'offTable': True},
    ],
    'deckZone': 'deck', 'handZone': 'hand', 'graveZone': 'grave',
    'format': {
        'deckMin': LEVERS['DECK'], 'deckMax': LEVERS['DECK'], 'maxCopies': 3, 'copiesBy': 'name',
        'zones': [
            {'zone': 'hq', 'min': 1, 'max': 1, 'types': ['headquarters']},
            {'zone': 'agenda', 'min': 1, 'max': 1, 'types': ['agenda']},
            {'zone': 'deck', 'min': LEVERS['DECK'], 'max': LEVERS['DECK'],
             'types': ['operative', 'facility', 'asset', 'project', 'operation', 'response', 'mission']},
        ],
        'rules': [
            {'if': ['all', '$deck', OR(eq(['def', '$it', 'faction'], 'neutral'), eq(['def', '$it', 'faction'], ['def', ['first', '$sections.hq'], 'faction']))],
             'why': "Every card must be Neutral or from your Headquarters' faction"},
            {'if': ['all', '$deck', eq(['def', '$it', 'ready'], 1)], 'why': 'Every card must be implemented (see the Shadow Earth status page)'},
        ],
    },
    'turnLimit': 80,
    'damage': {'player': 'hqdmg', 'object': 'dmg'},
    'functions': F, 'procedures': P,
    'timing': {'mode': 'immediate'},
    'windows': {'mission': {'steps': [
        {'id': 'declare', 'auto': True, 'do': [C('preDefend')]},
        {'id': 'defend', 'auto': True, 'do': [C('assignDefense')]},
        {'id': 'respond', 'timing': {'mode': 'alternate', 'first': '$win.def'}},
        {'id': 'resolve', 'auto': True, 'do': [C('resolveMission')]}]}},
    'setup': [['random', {'from': ['players'], 'as': '$f'}], ['firstPlayer', '$f'], SET('game', 'first', seat('$f')),
              EACH(['players'], '$p', [C('setupPlayer', '$p')])],
    'phases': [
        {'id': 'refresh', 'auto': True, 'do': [C('refresh')]},
        {'id': 'draw', 'auto': True, 'do': [C('drawStep')]},
        {'id': 'development'},
        {'id': 'operations'},
        {'id': 'cleanup', 'auto': True, 'do': [C('cleanup')]},
        {'id': 'end', 'auto': True, 'do': [C('endTurn')]},
    ],
    'actions': A,
    'replacements': [
        {'replace': 'damage', 'if': AND(isObj('$e.target'), ne(g('$e.target', 'shT'), '$turn'), gt(C('shield', '$e.target'), 0)),
         'instead': [SET('$e.target', 'shT', '$turn'), IF(gt(sub('$e.amount', C('shield', '$e.target')), 0), [['damage', '$e.target', sub('$e.amount', C('shield', '$e.target')), '$e.source']])],
         'text': 'Prevent the first damage each turn'},
        {'replace': 'damage', 'if': AND(isObj('$e.target'), gt(g('$e.target', 'pv'), 0)),
         'instead': [LET('$s', mn('$e.amount', g('$e.target', 'pv'))), INC('$e.target', 'pv', neg('$s')),
                     IF(gt(sub('$e.amount', '$s'), 0), [['damage', '$e.target', sub('$e.amount', '$s'), '$e.source']])], 'text': 'Prevent damage'},
    ],
    'triggers': [
        {'on': 'drawFail', 'do': [['lose', '$e.player']]},
        {'on': 'missionResult', 'do': [EACH(flt(OPS(), eq(g('$it', 'readyAfter'), '$turn')), '$x', [SET('$x', 'ex', 0), SET('$x', 'readyAfter', 0)]),
            EACH(flt(OPS(), gt(g('$it', 'hurtAfter'), 0)), '$x', [LET('$h', g('$x', 'hurtAfter')), SET('$x', 'hurtAfter', 0), ['damage', '$x', '$h', '$e.p']])]},
        {'on': 'cleanup', 'do': [EACH(flt(OPS('$e.p'), eq(g('$it', 'upkeep'), 1)), '$tk', [
            IF(ge(C('avail', '$e.p'), 1), [choose(opts('Pay 1 to keep it', 'Let it go'), '$u', 'Keep this token?', who='$e.p')], [LET('$u', 'Let it go')]),
            IF(eq('$u', 'Pay 1 to keep it'), [C('spend', '$e.p', 1)], [C('eliminate', '$tk')])])]},
        {'on': 'damage', 'if': isObj('$e.target'), 'do': [SET('$e.target', 'lastBy', Q(['isPlayer', '$e.source'], add(seat('$e.source'), 1), add(seat(ctrl('$e.source')), 1)))]},
    ],
    'stateChecks': [EACH(flt(OPS(), AND(gt(C('dur', '$it'), 0), ge(g('$it', 'dmg'), C('dur', '$it')))), '$u', [C('eliminate', '$u')])],
}
for t in lib.RULE_TRIGGERS: RULES['triggers'].append(t)
for r in lib.REPLACEMENTS: RULES['replacements'].append(r)

# ---------------------------------------------------------------- decks (fx_decks.py may define them)
DECKS = lib.DECKS

# ---------------------------------------------------------------- AI
fn('board', ['$p'], add(mul(10, g('$p', 'dom')), SUM(OPS('$p'), add(C('attr', '$it', 1), C('attr', '$it', 2), C('attr', '$it', 3), Q(eq(g('$it', 'ex'), 0), 1, 0))),
    mul(2, cnt(SITES('$p'))), cnt(GEAR('$p')), ['/', C('avail', '$p'), 2], ['/', cnt(HAND('$p')), 2], mul(6, cnt(flt(['cards', '$p', 'agenda'], eq(g('$it', 'done'), 1)))),
    g('$p', 'rev'), cnt(flt(OPS(['opp', '$p']), eq(g('$it', 'ctl'), 1)))))
AI = {'eval': sub(C('board', '$me'), C('board', '$opp')), 'samples': 1, 'horizon': 'pass'}

# ---------------------------------------------------------------- manifest
MANIFEST = {
    'moduleId': 'shadow-earth', 'displayName': 'Shadow Earth', 'semanticVersion': '0.1.0', 'engineApiRange': '^0.3.1', 'official': True,
    'requiredCapabilities': ['windows', 'multiDeck', 'gameVars', 'scripts', 'deckRules', 'limits', 'control', 'relationships'],
    'licensing': 'Original game by @Astral (Core Set 1.7 prototype).',
    'tagline': 'Covert missions, secret agendas and five conspiracies racing to 20 Dominance.',
    'theme': {'accent': '#b45309', 'accent2': '#38bdf8', 'glyph': '◉', 'tapVar': 'ex',
              'hideStats': ['tFac', 'num', 'fno', 'archetype', 'ready', 'hasDeploy', 'hasSucc', 'hasPre', 'hasImm', 'attach', 'bearerKw', 'mattr', 'tier', 'security', 'entersReady'],
              'hideVars': ['faction', 'att', 'attMax', 'domMax', 'cap', 'tmpc', 'ex', 'atk', 'dfn', 'tgt', 'mb', 'z0', 'oF', 'oT', 'oW', 'cF', 'cT', 'cW', 'newT', 'nodef',
                           'noab', 'nomis', 'noready', 'ctlT', 'freeJoin', 'hasteT', 'lastBy', 'mopc', 'sup', 'done', 'hqdmg'],
              'hideKeywords': ['token'],
              'labels': {'dom': 'Dominance', 'inf': 'Influence', 'tmp': 'temporary', 'rev': 'Revelation', 'ops': 'Operatives', 'sites': 'Facilities & Projects',
                         'gear': 'Assets', 'hq': 'Headquarters', 'agenda': 'Agenda', 'limbo': 'Resolving', 'grave': 'Discard', 'exile': 'Exile',
                         'dmg': 'damage', 'ctl': 'Control', 'prog': 'progress', 'dis': 'Disabled', 'response': 'Operation — Response', 'mission': 'Operation — Mission',
                         'force': 'Force', 'trade': 'Tradecraft', 'will': 'Will', 'dur': 'Durability'},
              'announce': {'agendaCompleted': 'Agenda: {card}', 'missionDeclared': 'Mission!'}},
    'presentation': {
        'templates': {
            'operative': {'base': 'skirmisher', 'art': 52, 'stats': [{'field': 'force', 'pos': 'line', 'label': 'F'}, {'field': 'trade', 'pos': 'line', 'label': 'T'},
                                                                       {'field': 'will', 'pos': 'line', 'label': 'W'}, {'field': 'dur', 'pos': 'br', 'icon': '♥'}], 'label': 'Operative — Force / Tradecraft / Will'},
            'card': {'base': 'spell', 'art': 52, 'label': 'Card'},
            'hq': {'base': 'leader', 'art': 52, 'stats': [{'field': 'security', 'pos': 'tr', 'icon': '⛨'}], 'label': 'Headquarters — Security'},
        },
        'byType': {'operative': 'operative', 'headquarters': 'hq', 'agenda': 'card', 'facility': 'card', 'project': 'card', 'asset': 'card',
                   'operation': 'card', 'response': 'card', 'mission': 'card'}},
}

# ---------------------------------------------------------------- write
os.makedirs(os.path.join(OUT, 'ai'), exist_ok=True)
def dump(name, obj):
    with open(os.path.join(OUT, name), 'w') as f: json.dump(obj, f, indent=1, ensure_ascii=False); f.write('\n')
dump('manifest.json', MANIFEST)
dump('rules.json', RULES)
dump('cards.json', CARDS)
dump('decks.json', DECKS)
dump('ai/ai.json', AI)
done = sum(1 for c in CARDS if c['ready'] and c['rarity'] != 'T')
print(f'shadow-earth: {len(CARDS)} cards ({done}/{len(ROWS)} implemented), {len(F)} functions, {len(P)} procedures, {len(A)} actions')
