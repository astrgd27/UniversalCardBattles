#!/usr/bin/env python3
"""Generates Shadow Earth 2.0 (packages/reference-games/shadow-earth) from cards2.py. Rules: docs/SHADOW_EARTH.md.

    python3 tools/shadowearth/build.py      (SE_<LEVER>=n overrides a lever; SE_OUT=<dir> writes elsewhere)
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsl import *
import lib
from lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SE_OUT') or os.path.join(HERE, '..', '..', 'packages', 'reference-games', 'shadow-earth')
LEVERS = {'WIN': 7, 'MAX_CAP': 7, 'HAND': 7, 'DECK': 40, 'TEAM': 3, 'DEFENDERS': 3, 'PLAN_NEED': 5, 'PLAN_DOM': 3, 'HQ_SEC': 3,
          'SITE_RES': 2, 'PLAN_RES': 2, 'WETWORK': 3, 'DECISIVE': 3, 'TOKEN_CAP': 10, 'ROW': 3, 'PLAN_SCORE': 0, 'CATCHUP': 0}
for k in LEVERS:
    if os.environ.get('SE_' + k) is not None: LEVERS[k] = int(os.environ['SE_' + k])
lib.LEVERS = LEVERS

import cards2  # noqa: E402  (registers every card, token and starter deck)

FNO = {'psylist': 1, 'prendick': 2, 'dawnstar': 3, 'illuminati': 4, 'children': 5}
for i, c in enumerate(CARDS):
    c['num'] = c.get('num') or f'SE2-{i + 1:03d}'
    c.setdefault('rarity', 'C')
    if c['type'] == 'headquarters': c['fno'] = FNO[c['faction']]; c['security'] = LEVERS['HQ_SEC']
    if c['type'] == 'plan': c['need'] = LEVERS['PLAN_NEED']; c['res'] = LEVERS['PLAN_RES']; c['dom'] = LEVERS['PLAN_DOM']
    if c['type'] == 'operation':
        for ab in c['op']:
            ab['do'] = [IF(eq(g('game', 'ocan'), 0), ab['do']), C('opEnd', '$cx')]
            ab.setdefault('phases', ['main'])
    if c['type'] == 'response':
        for ab in c['resp']: ab['do'] = [IF(eq(g('game', 'ocan'), 0), ab['do']), C('opEnd', '$cx')]
    for k in ('abil', 'rabil'):
        for ab in c.get(k, []): ab.setdefault('do', [])
    for k in ('deploy', 'onScore', 'onEnact'):
        if k in c: c['has_' + k] = 1

# ---------------------------------------------------------------- functions
F, P = {}, {}
def fn(name, params, body): F[name] = {'params': params, 'body': body}
def proc(name, params, body): P[name] = {'params': params, 'do': body}

fn('avail', ['$p'], add(g('$p', 'inf'), g('$p', 'tmp')))
fn('printed', ['$o', '$a'], Q(eq('$a', 1), g('$o', 'force'), Q(eq('$a', 2), g('$o', 'trade'), g('$o', 'will'))))
fn('tmpA', ['$o', '$a'], Q(eq('$a', 1), g('$o', 'cF'), Q(eq('$a', 2), g('$o', 'cT'), g('$o', 'cW'))))
fn('attr', ['$o', '$a'], mx(0, add(C('printed', '$o', '$a'), C('tmpA', '$o', '$a'), *(ATTR or [0]))))
fn('hpOf', ['$o'], mx(1, add(g('$o', 'hp'), *(HP or [0]))))
fn('val', ['$o'], Q(eq(g('$o', 'z0'), 1), 0, add(C('attr', '$o', g('game', 'ma')), g('$o', 'mb'))))
fn('cost', ['$c', '$p'], mx(0, add(g('$c', 'cost'), *(COST or [0]))))
fn('canPay', ['$c', '$p'], ge(C('avail', '$p'), C('cost', '$c', '$p')))
fn('swift', ['$o'], OR(has('$o', 'swift'), eq(g('$o', 'swiftT'), '$turn'), *SWIFT))
fn('canAtk', ['$o'], AND(eq(g('$o', 'ex'), 0), OR(ne(g('$o', 'newT'), '$turn'), C('swift', '$o')), ne(g('$o', 'nomis'), '$turn')))
fn('canDef', ['$o'], AND(OR(eq(g('$o', 'ex'), 0), has('$o', 'ambush')), lt(g('$o', 'nodef'), '$turn'), NOT(OR(lit(False), *NODEF))))
fn('covert', ['$o'], OR(has('$o', 'covert'), *COVERT))
fn('tokens', ['$p'], cnt(flt(OPS('$p'), has('$it', 'token'))))
fn('tgtOk', ['$o', '$p'], NOT(OR(lit(False), *TGTDENY)))
fn('targets', ['$p'], ['concat', ROW, flt(['cards', '$p', 'plan'], eq(g('$it', 'done'), 0)),
    flt(['cards', ['opp', '$p'], 'plan'], AND(eq(g('$it', 'done'), 0), gt(g('$it', 'prog'), 0))),
    flt(['concat', OPS(['opp', '$p']), SITES(['opp', '$p']), GEAR(['opp', '$p'])], C('tgtOk', '$it', '$p')), ['list', ['opp', '$p']]])
fn('mattrOf', ['$t'], Q(['isPlayer', '$t'], 3, Q(typ('$t', 'operative'), 1, Q(OR(typ('$t', 'facility'), typ('$t', 'asset')), 2, g('$t', 'mattr')))))
fn('resOf', ['$t'], add(Q(['isPlayer', '$t'], LEVERS['HQ_SEC'], Q(OR(typ('$t', 'facility'), typ('$t', 'asset')), LEVERS['SITE_RES'], g('$t', 'res'))), *RES))
fn('plan', ['$p'], first(['cards', '$p', 'plan']))
fn('progOf', ['$a', '$p'], Q(typ('$a', 'plan'), g('$a', 'prog'), Q(eq(seat('$p'), 0), g('$a', 'pr0'), g('$a', 'pr1'))))
fn('hasProg', ['$p'], ANY(ROW, gt(C('progOf', '$it', '$p'), 0)))
fn('maxForce', ['$l'], Q(gt(cnt('$l'), 0), C('attr', ['maxBy', '$l', C('attr', '$it', 1)], 1), 0))

# ---------------------------------------------------------------- procedures
proc('gainTmp', ['$p', '$n'], [IF(gt('$n', 0), [INC('$p', 'tmp', '$n'), emit('tmpGained', p='$p', n='$n')])])
proc('spend', ['$p', '$n'], [LET('$a', mn('$n', g('$p', 'tmp'))), INC('$p', 'tmp', neg('$a')), INC('$p', 'inf', neg(sub('$n', '$a'))), emit('spent', p='$p', n='$n')])
proc('payFor', ['$c'], [C('spend', '$me', C('cost', '$c', '$me'))])
proc('gainDom', ['$p', '$n'], [IF(gt('$n', 0), [INC('$p', 'dom', '$n'), emit('dominance', p='$p', n='$n'),
    IF(ge(g('$p', 'dom'), LEVERS['WIN']), [['win', ['list', '$p']]])])])
proc('gainRev', ['$p', '$n'], [IF(gt('$n', 0), [INC('$p', 'rev', '$n'), INC('$p', 'revT', '$n'), emit('revelation', p='$p', n='$n')])])
proc('hurt', ['$o', '$n'], [IF(AND(isObj('$o'), gt('$n', 0)), [['damage', '$o', '$n', '$me']])])
proc('heal', ['$o', '$n'], [IF(isObj('$o'), [SET('$o', 'dmg', mx(0, sub(g('$o', 'dmg'), '$n')))])])
proc('putCtl', ['$o'], [IF(AND(isObj('$o'), eq(g('$o', 'ctl'), 0), typ('$o', 'operative')), [SET('$o', 'ctl', 1), emit('control', o='$o', p='$me')])])
proc('makeTokens', ['$p', '$card', '$n', '$r'], [EACH(['range', mx(0, mn('$n', sub(LEVERS['TOKEN_CAP'], C('tokens', '$p'))))], '$i', [
    ['create', '$card', '$p', 'ops', {'as': '$tk'}], SET('$tk', 'ex', sub(1, '$r')), SET('$tk', 'newT', '$turn')])])
proc('peekHand', ['$p', '$q'], [IF(gt(cnt(HAND('$q')), 0), [['random', {'from': HAND('$q'), 'as': '$r'}],
    emit('peeked', to=['list', '$p'], card=g('$r', 'card'), p='$p', from_='hand')])])
proc('peekTop', ['$p', '$q'], [IF(gt(cnt(DECK('$q')), 0), [emit('peeked', to=['list', '$p'], card=g(first(DECK('$q')), 'card'), p='$p', from_='deck')])])
proc('lookTop', ['$p', '$n'], [['move', ['top', '$p', 'deck', '$n'], 'look']])
proc('topBack', ['$p'], [['move', ['reverse', LOOK('$p')], 'deck', {'pos': 'top'}]])
proc('lookBottom', ['$p'], [['move', LOOK('$p'), 'deck']])
proc('scry', ['$p', '$n'], [IF(gt(cnt(DECK('$p')), 0), [C('lookTop', '$p', '$n'),
    choose(LOOK('$p'), '$bs', 'Scry: choose cards to put on the bottom (the rest stay on top)', 0, '$n', who='$p'),
    ['move', '$bs', 'deck'], C('topBack', '$p'), emit('scried', p='$p')])])
proc('showHand', ['$p'], [['move', HAND('$p'), 'shown']])
proc('hideHand', ['$p'], [['move', ['cards', '$p', 'shown'], 'hand']])
proc('lookHand', ['$p', '$q'], [emit('lookedHand', to=['list', '$p'], cards=['map', HAND('$q'), g('$it', 'card')], p='$p')])
proc('discardN', ['$p', '$n'], [LET('$k', mn('$n', cnt(HAND('$p')))), IF(gt('$k', 0), [
    choose(HAND('$p'), '$ds', 'Discard', '$k', '$k', who='$p'), ['move', '$ds', 'grave'], emit('discarded', p='$p', n='$k')])])
proc('loot', ['$p', '$n'], [['draw', '$p', '$n'], C('discardN', '$p', '$n')])
proc('detach', ['$o'], [EACH(gearOn('$o'), '$a', [['move', '$a', 'grave']])])
proc('gone', ['$o'], [C('detach', '$o'), IF(has('$o', 'token'), [['move', '$o', 'void']],
    [IF(eq(g('$o', 'exileOnLeave'), 1), [['move', '$o', 'exile']], [['move', '$o', 'grave']])])])
proc('eliminate', ['$o'], [IF(isObj('$o'), [SET('game', 'saved', 0), IF(eq(g('game', 'saved'), 0), [
    emit('eliminated', o='$o', card=g('$o', 'card'), owner=g('$o', 'owner'), ctrl=ctrl('$o'), type=g('$o', 'type')), C('gone', '$o')])])])
proc('sacrifice', ['$o'], [IF(isObj('$o'), [emit('sacrificed', o='$o', card=g('$o', 'card'), p=ctrl('$o')), INC(ctrl('$o'), 'sacT', 1), C('gone', '$o')])])
proc('toHand', ['$o'], [IF(isObj('$o'), [IF(has('$o', 'token'), [C('gone', '$o')], [C('detach', '$o'), ['move', '$o', 'hand']])])])
proc('opEnd', ['$c'], [IF(isObj('$c'), [['move', '$c', 'grave']]), SET('game', 'ocan', 0)])
proc('played', ['$c', '$p'], [INC('$p', 'acted', 1), emit('played', c='$c', p='$p', card=g('$c', 'card'), type=g('$c', 'type'))])
proc('opStart', ['$c'], [SET('game', 'ocan', 0), C('played', '$c', '$me'), LET('$c2', '$c'), *OPSTART])

# Agendas and Master Plans
proc('scoreAgenda', ['$a', '$p'], [
    emit('agendaScored', p='$p', card=g('$a', 'card'), dom=g('$a', 'dom')),
    LET('$v', g('$a', 'dom')), ['move', '$a', 'scored', {'player': '$p', 'as': '$s'}], C('gainDom', '$p', '$v'),
    *([C('addProg', C('plan', '$p'), '$p', LEVERS['PLAN_SCORE'])] if LEVERS['PLAN_SCORE'] else []),
    IF(eq(g('$s', 'has_onScore'), 1), [['run', '$s', 'onScore']]),
    IF(gt(cnt(['cards', 'p0', 'agdeck']), 0), [['move', first(['cards', 'p0', 'agdeck']), 'agendas', {'as': '$n'}], emit('agendaRevealed', card=g('$n', 'card'))])])
proc('enact', ['$pl', '$p'], [SET('$pl', 'done', 1), emit('planEnacted', p='$p', card=g('$pl', 'card')), C('gainDom', '$p', g('$pl', 'dom')),
    IF(eq(g('$pl', 'has_onEnact'), 1), [['run', '$pl', 'onEnact']])])
proc('addProg', ['$a', '$p', '$n'], [IF(AND(isObj('$a'), gt('$n', 0)), [
    IF(typ('$a', 'plan'), [IF(eq(g('$a', 'done'), 0), [INC('$a', 'prog', '$n'), emit('progress', p='$p', card=g('$a', 'card'), n='$n'),
                                                    IF(ge(g('$a', 'prog'), g('$a', 'need')), [C('enact', '$a', '$p')])])],
       [IF(eq(seat('$p'), 0), [INC('$a', 'pr0', '$n')], [INC('$a', 'pr1', '$n')]), emit('progress', p='$p', card=g('$a', 'card'), n='$n'),
        IF(ge(C('progOf', '$a', '$p'), g('$a', 'need')), [C('scoreAgenda', '$a', '$p')])])])])
proc('loseProg', ['$a', '$p', '$n'], [IF(isObj('$a'), [
    IF(typ('$a', 'plan'), [SET('$a', 'prog', mx(0, sub(g('$a', 'prog'), '$n')))],
       [IF(eq(seat('$p'), 0), [SET('$a', 'pr0', mx(0, sub(g('$a', 'pr0'), '$n')))], [SET('$a', 'pr1', mx(0, sub(g('$a', 'pr1'), '$n')))])]),
    emit('progressLost', p='$p', card=g('$a', 'card'), n='$n')])])

# ---------------------------------------------------------------- missions
proc('startMission', ['$t', '$team'], [
    SET('game', 'ma', C('mattrOf', '$t')), SET('game', 'mp', add(seat('$me'), 1)), SET('game', 'am', 0), SET('game', 'dm', 0), SET('game', 'mcan', 0),
    SET('game', 'hqT', Q(isObj('$t'), 0, 1)), IF(isObj('$t'), [SET('$t', 'tgt', 1)]),
    EACH('$team', '$x', [SET('$x', 'atk', 1), IF(ne(g('$x', 'freeJoin'), '$turn'), [SET('$x', 'ex', 1)])]),
    INC('$me', 'missT', 1),
    emit('missionDeclared', p='$me', attr=g('game', 'ma'), t='$t', n=cnt('$team')),
    ['openWindow', 'mission', {'data': {'p': '$me', 'def': '$opp'}}],
    C('missionEnd')])
proc('missionEnd', [], [
    EACH(['concat', PERMS(), ROW, ['cards', '*', 'plan']], '$x', [IF(OR(gt(g('$x', 'atk'), 0), gt(g('$x', 'dfn'), 0), gt(g('$x', 'tgt'), 0), ne(g('$x', 'mb'), 0), gt(g('$x', 'z0'), 0)), [
        SET('$x', 'atk', 0), SET('$x', 'dfn', 0), SET('$x', 'tgt', 0), SET('$x', 'mb', 0), SET('$x', 'z0', 0)])]),
    *[SET('game', k, 0) for k in ['mp', 'ma', 'am', 'dm', 'mcan', 'hqT']]])
proc('assignDefense', [], [
    IF(AND(isObj(TGT), typ(TGT, 'operative')), [SET(TGT, 'dfn', 1)]),
    LET('$can', flt(OPS('$opp'), AND(C('canDef', '$it'), NOT(defending('$it'))))),
    IF(AND(eq(cnt(ATK), 1), ANY(ATK, C('covert', '$it'))),
       [choose('$can', '$d1', 'Assign a defender (a Covert attacker allows only one)', 0, 1, who='$opp'), IF(isObj('$d1'), [SET('$d1', 'dfn', 1), SET('$d1', 'ex', Q(has('$d1', 'ambush'), g('$d1', 'ex'), 1))])],
       [choose('$can', '$ds', f'Assign defenders (up to {LEVERS["DEFENDERS"]})', 0, LEVERS['DEFENDERS'], who='$opp'),
        EACH('$ds', '$d', [SET('$d', 'dfn', 1), SET('$d', 'ex', Q(has('$d', 'ambush'), g('$d', 'ex'), 1))])]),
    emit('defenders', p='$opp', n=cnt(DFN)), *AFTER_DEFEND])
proc('preDefend', [], PRE_DEFEND or [])
proc('bloodshed', [], [IF(AND(gt(cnt(DFN), 0), gt(cnt(ATK), 0)), [
    LET('$ad', add(C('maxForce', ATK), *[b for side, b in BLOOD if side == 'atk'] or [0])),
    LET('$dd', add(C('maxForce', DFN), *[b for side, b in BLOOD if side == 'def'] or [0])),
    emit('bloodshed', a='$ad', d='$dd'),
    IF(gt('$ad', 0), [choose(DFN, '$hv', 'Bloodshed: your side deals damage to which defender?', 1, 1, who='$me'), ['damage', '$hv', '$ad', '$me']]),
    IF(gt('$dd', 0), [choose(ATK, '$hv2', 'Bloodshed: your side deals damage to which attacker?', 1, 1, who='$opp'), ['damage', '$hv2', '$dd', '$opp']])])])
proc('reward', ['$t', '$n'], [
    IF(['isPlayer', '$t'], [
        choose(['concat', Q(C('hasProg', '$opp'), opts('Steal 1 progress'), lit([])), opts('They discard 2 cards')], '$r', 'Blackmail succeeded: choose'),
        IF(eq('$r', 'Steal 1 progress'), [choose(flt(ROW, gt(C('progOf', '$it', '$opp'), 0)), '$sa', 'Steal progress from which Agenda?'),
                                          C('loseProg', '$sa', '$opp', 1), C('addProg', '$sa', '$me', 1)], [C('discardN', '$opp', 2)])],
       [IF(typ('$t', 'agenda'), [C('addProg', '$t', '$me', '$n')]),
        IF(typ('$t', 'plan'), [IF(eq(ctrl('$t'), '$me'), [C('addProg', '$t', '$me', '$n')], [C('loseProg', '$t', ctrl('$t'), 2)])]),
        IF(typ('$t', 'operative'), [C('hurt', '$t', LEVERS['WETWORK'])]),
        IF(OR(typ('$t', 'facility'), typ('$t', 'asset')), [emit('sabotaged', card=g('$t', 'card'), p=ctrl('$t')), C('gone', '$t')])])])
proc('resolveMission', [], [
    LET('$at', add(SUM(ATK, C('val', '$it')), g('game', 'am'))),
    LET('$t', Q(isObj(TGT), TGT, '$opp')),
    LET('$dt', Q(gt(cnt(DFN), 0), add(SUM(DFN, C('val', '$it')), g('game', 'dm')), add(C('resOf', '$t'), g('game', 'dm')))),
    LET('$ok', AND(eq(g('game', 'mcan'), 0), gt(cnt(ATK), 0), gt('$at', '$dt'))),
    LET('$ndef', cnt(DFN)),
    C('bloodshed'),
    IF('$ok', [C('reward', '$t', Q(ge('$at', add('$dt', LEVERS['DECISIVE'])), 2, 1)), SET('$me', 'winT', add(g('$me', 'winT'), 1))],
        [IF(gt('$ndef', 0), [INC('$opp', 'held', 1), emit('defended', p='$opp')])]),
    emit('missionResult', p='$me', ok=Q('$ok', 1, 0), at='$at', dt='$dt', ndef='$ndef', attr=g('game', 'ma'),
         kind=Q(['isPlayer', '$t'], 'hq', g('$t', 'type')))])

# ---------------------------------------------------------------- turn
proc('refresh', [], [
    INC('$me', 'turns', 1), SET('$me', 'tmp', 0),
    EACH(PERMS('$me'), '$x', [SET('$x', 'ex', 0)]),
    SET('$me', 'cap', mn(LEVERS['MAX_CAP'], add(g('$me', 'cap'), 1))), SET('$me', 'inf', g('$me', 'cap')),
    IF(AND(eq(g('$me', 'turns'), 1), ne(seat('$me'), g('game', 'first'))), [C('gainTmp', '$me', 1)]),
    *([IF(lt(g('$me', 'dom'), g('$opp', 'dom')), [C('gainTmp', '$me', LEVERS['CATCHUP'])])] if LEVERS['CATCHUP'] else []),
    *[SET('$me', k, 0) for k in ['missT', 'winT', 'sacT', 'revT', 'acted', 'skipDraw']],
    emit('refresh', p='$me')])
proc('drawStep', [], [IF(eq(g('$me', 'skipDraw'), 0), [draw(1)])])
proc('endTurn', [], [emit('endturn', p='$me')])
proc('cleanup', [], [
    EACH(PERMS(), '$x', [IF(OR(ne(g('$x', 'cF'), 0), ne(g('$x', 'cT'), 0), ne(g('$x', 'cW'), 0), gt(g('$x', 'pv'), 0)), [
        SET('$x', 'cF', 0), SET('$x', 'cT', 0), SET('$x', 'cW', 0), SET('$x', 'pv', 0)])]),
    EACH(flt(OPS(), AND(gt(g('$it', 'ctlT'), 0), le(g('$it', 'ctlT'), '$turn'))), '$x', [SET('$x', 'ctlT', 0), SET('$x', 'ex', 1), ['control', '$x', g('$x', 'owner')]]),
    SET('$me', 'tmp', 0),
    IF(gt(cnt(HAND('$me')), LEVERS['HAND']), [C('discardN', '$me', sub(cnt(HAND('$me')), LEVERS['HAND']))])])
proc('setupPlayer', ['$p'], [
    SET('$p', 'faction', g(first(['cards', '$p', 'hq']), 'fno')), SET('$p', 'cap', 1),
    ['shuffle', '$p', 'deck'], ['draw', '$p', 5],
    IF(eq(g('game', 'noMulligan'), 0), [
        choose(opts('Keep', 'Mulligan'), '$mu', 'Keep this hand, or mulligan (shuffle it in, draw 5, put 1 on the bottom)?', who='$p'),
        IF(eq('$mu', 'Mulligan'), [['move', HAND('$p'), 'deck'], ['shuffle', '$p', 'deck'], ['draw', '$p', 5],
            choose(HAND('$p'), '$bot', 'Mulligan: put one card on the bottom of your deck', 1, 1, who='$p'), ['move', '$bot', 'deck']])])])

# ---------------------------------------------------------------- actions
A = {}
inHand = lambda pred: flt(HAND('$me'), AND(pred, C('canPay', '$it', '$me'), AND(*(PLAYREQ or [lit(True)]))))
A['deploy'] = {'label': 'Play', 'phases': ['main'], 'source': inHand(inl(g('$it', 'type'), lit(['operative', 'asset', 'facility']))),
    'targets': [{'as': '$b', 'prompt': 'Attach to which operative?',
                 'from': flt(OPS('$me'), Q(eq(g('$self', 'bearerKw'), 0), lit(True), has('$it', g('$self', 'bearerKw')))),
                 'min': Q(eq(g('$self', 'attach'), 1), 1, 0), 'max': Q(eq(g('$self', 'attach'), 1), 1, 0)}],
    'req': [{'if': OR(NOT(AND(has('$self', 'unique'), typ('$self', 'operative'))), NOT(ANY(OPS('$me'), eq(g('$it', 'card'), g('$self', 'card'))))), 'why': 'Unique: already in play'}],
    'cost': [C('payFor', '$self')],
    'do': [['move', '$self', Q(typ('$self', 'operative'), 'ops', Q(typ('$self', 'asset'), 'gear', 'sites')), {'as': '$c'}],
           IF(AND(typ('$c', 'asset'), isObj('$b')), [['link', '$c', 'bearer', '$b'], emit('attached', a='$c', o='$b', p='$me')]),
           SET('$c', 'newT', '$turn'), C('played', '$c', '$me'),
           IF(eq(g('$c', 'has_deploy'), 1), [['run', '$c', 'deploy']]), emit('deployed', c='$c', p='$me', card=g('$c', 'card'), type=g('$c', 'type'))]}
A['op'] = {'label': 'Play', 'phases': ['main'], 'activated': 'op', 'source': inHand(typ('$it', 'operation')),
    'cost': [C('payFor', '$self')], 'do': [['move', '$self', 'limbo', {'as': '$cx'}], C('opStart', '$cx')]}
A['respond'] = {'label': 'Respond', 'phases': ['respond'], 'activated': 'resp', 'source': inHand(typ('$it', 'response')),
    'cost': [C('payFor', '$self')], 'do': [['move', '$self', 'limbo', {'as': '$cx'}], C('opStart', '$cx')]}
A['use'] = {'label': 'Use', 'phases': ['main'], 'activated': 'abil', 'source': ['concat', PERMS('$me'), ['cards', '$me', 'hq'], flt(['cards', '$me', 'plan'], eq(g('$it', 'done'), 1))], 'do': []}
A['useR'] = {'label': 'Use', 'phases': ['respond'], 'activated': 'rabil', 'source': ['concat', PERMS('$me'), ['cards', '$me', 'hq']], 'do': []}
A['mission'] = {'label': 'Launch a mission', 'phases': ['main'],
    'req': [{'if': gt(cnt(flt(OPS('$me'), C('canAtk', '$it'))), 0), 'why': 'No operative can go on a mission'}],
    'targets': [{'as': '$t', 'from': C('targets', '$me'),
                 'prompt': 'Mission target: a Conspiracy Agenda, your Master Plan, their Master Plan, an operative (Wetwork), a Facility or Asset (Sabotage), or their Headquarters (Blackmail)'},
                {'as': '$team', 'from': flt(OPS('$me'), C('canAtk', '$it')), 'min': 1, 'max': LEVERS['TEAM'], 'prompt': f'Send which operatives? (1 to {LEVERS["TEAM"]})'}],
    'do': [C('startMission', '$t', '$team')]}

# ---------------------------------------------------------------- rules
AGENDAS = [c['id'] for c in CARDS if c['type'] == 'agenda']
RULES = {
    'players': {'min': 2, 'max': 2},
    'playerVars': {'dom': 0, 'faction': 0, 'cap': 0, 'inf': 0, 'tmp': 0, 'rev': 0},
    'gameVars': {'first': 0, 'noMulligan': 0, 'mp': 0, 'ma': 0, 'am': 0, 'dm': 0, 'mcan': 0, 'hqT': 0, 'ocan': 0, 'saved': 0},
    'objectVars': {'ex': 0, 'dmg': 0, 'atk': 0, 'dfn': 0, 'tgt': 0, 'mb': 0, 'z0': 0, 'cF': 0, 'cT': 0, 'cW': 0, 'newT': 0, 'ctl': 0, 'prog': 0,
                   'pr0': 0, 'pr1': 0, 'done': 0, 'pv': 0, 'nodef': 0, 'nomis': 0, 'ctlT': 0, 'freeJoin': 0, 'swiftT': 0, 'mand': 0, 'exileOnLeave': 0},
    'zones': [
        {'id': 'deck', 'vis': 'hidden', 'ordered': True},
        {'id': 'hand', 'vis': 'owner'},
        {'id': 'hq', 'vis': 'public', 'abilities': True},
        {'id': 'plan', 'vis': 'public', 'abilities': True},
        {'id': 'agendas', 'vis': 'public', 'shared': True},
        {'id': 'sites', 'vis': 'public', 'abilities': True},
        {'id': 'gear', 'vis': 'public', 'abilities': True},
        {'id': 'ops', 'vis': 'public', 'abilities': True},
        {'id': 'limbo', 'vis': 'public', 'hideEmpty': True},
        {'id': 'look', 'vis': 'owner', 'ordered': True, 'hideEmpty': True},
        {'id': 'shown', 'vis': 'public', 'hideEmpty': True},
        {'id': 'scored', 'vis': 'public', 'hideEmpty': True},
        {'id': 'grave', 'vis': 'public', 'ordered': True},
        {'id': 'exile', 'vis': 'public', 'hideEmpty': True},
        {'id': 'agdeck', 'vis': 'hidden', 'shared': True, 'ordered': True, 'offTable': True},
        {'id': 'void', 'vis': 'public', 'offTable': True},
    ],
    'deckZone': 'deck', 'handZone': 'hand', 'graveZone': 'grave',
    'format': {
        'deckMin': LEVERS['DECK'], 'deckMax': LEVERS['DECK'], 'maxCopies': 3, 'copiesBy': 'name',
        'zones': [
            {'zone': 'hq', 'min': 1, 'max': 1, 'types': ['headquarters']},
            {'zone': 'plan', 'min': 1, 'max': 1, 'types': ['plan']},
            {'zone': 'deck', 'min': LEVERS['DECK'], 'max': LEVERS['DECK'], 'types': ['operative', 'asset', 'facility', 'operation', 'response']},
        ],
        'rules': [
            {'if': ['all', '$deck', OR(eq(['def', '$it', 'faction'], 'neutral'), eq(['def', '$it', 'faction'], ['def', ['first', '$sections.hq'], 'faction']))],
             'why': "Every card must be Neutral or from your Headquarters' faction"},
            {'if': eq(['def', ['first', '$sections.plan'], 'faction'], ['def', ['first', '$sections.hq'], 'faction']), 'why': 'Your Master Plan must match your Headquarters'},
        ],
    },
    'turnLimit': 60,
    'damage': {'player': 'hqdmg', 'object': 'dmg'},
    'sharedDecks': {'agdeck': AGENDAS},
    'functions': F, 'procedures': P,
    'timing': {'mode': 'immediate'},
    'windows': {'mission': {'steps': [
        {'id': 'declare', 'auto': True, 'do': [C('preDefend')]},
        {'id': 'defend', 'auto': True, 'do': [C('assignDefense')]},
        {'id': 'respond', 'timing': {'mode': 'alternate', 'first': '$win.def'}},
        {'id': 'resolve', 'auto': True, 'do': [C('resolveMission')]}]}},
    'setup': [['random', {'from': ['players'], 'as': '$f'}], ['firstPlayer', '$f'], SET('game', 'first', seat('$f')),
              ['shuffle', 'p0', 'agdeck'], ['move', ['top', 'p0', 'agdeck', LEVERS['ROW']], 'agendas'],
              EACH(['players'], '$p', [C('setupPlayer', '$p')])],
    'phases': [
        {'id': 'refresh', 'auto': True, 'do': [C('refresh')]},
        {'id': 'draw', 'auto': True, 'do': [C('drawStep')]},
        {'id': 'main'},
        {'id': 'end', 'auto': True, 'do': [C('endTurn')]},
        {'id': 'cleanup', 'auto': True, 'do': [C('cleanup')]},
    ],
    'actions': A,
    'replacements': [
        {'replace': 'damage', 'if': AND(isObj('$e.target'), gt(g('$e.target', 'pv'), 0)),
         'instead': [LET('$s', mn('$e.amount', g('$e.target', 'pv'))), INC('$e.target', 'pv', neg('$s')),
                     IF(gt(sub('$e.amount', '$s'), 0), [['damage', '$e.target', sub('$e.amount', '$s'), '$e.source']])], 'text': 'Prevent damage'},
    ] + lib.REPLACEMENTS,
    'triggers': [{'on': 'drawFail', 'do': [['lose', '$e.player']]}] + lib.RULE_TRIGGERS,
    'stateChecks': [EACH(flt(OPS(), ge(g('$it', 'dmg'), C('hpOf', '$it'))), '$u', [C('eliminate', '$u')])],
}

# ---------------------------------------------------------------- AI
fn('board', ['$p'], add(
    mul(12, g('$p', 'dom')),
    SUM(ROW, mul(C('progOf', '$it', '$p'), add(2, g('$it', 'dom')))),
    mul(5, C('progOf', C('plan', '$p'), '$p')),
    SUM(OPS('$p'), add(C('attr', '$it', 1), C('attr', '$it', 2), C('attr', '$it', 3), mx(0, sub(C('hpOf', '$it'), g('$it', 'dmg'))),
                       Q(eq(g('$it', 'ex'), 0), add(1, ['/', mx(C('attr', '$it', 1), mx(C('attr', '$it', 2), C('attr', '$it', 3))), 2]), 0))),
    mul(2, cnt(SITES('$p'))), cnt(GEAR('$p')), ['/', C('avail', '$p'), 2], ['/', cnt(HAND('$p')), 2], g('$p', 'rev'),
    mul(2, cnt(flt(OPS(['opp', '$p']), eq(g('$it', 'ctl'), 1))))))
AI = {'eval': sub(C('board', '$me'), C('board', '$opp')), 'samples': 1, 'horizon': 'pass'}

# ---------------------------------------------------------------- manifest
MANIFEST = {
    'moduleId': 'shadow-earth', 'displayName': 'Shadow Earth', 'semanticVersion': '2.0.0', 'engineApiRange': '^0.3.1', 'official': True,
    'requiredCapabilities': ['windows', 'multiDeck', 'sharedDecks', 'gameVars', 'scripts', 'deckRules', 'limits', 'control', 'relationships'],
    'licensing': 'Original game by @Astral. Shadow Earth 2.0.',
    'tagline': 'Five conspiracies. Three Agendas on the table. First to 7 Dominance rewrites history.',
    'theme': {'accent': '#b45309', 'accent2': '#38bdf8', 'glyph': '◉', 'tapVar': 'ex',
              'hideStats': ['num', 'fno', 'attach', 'bearerKw', 'has_deploy', 'has_onScore', 'has_onEnact', 'mattr', 'need', 'res', 'dom', 'security', 'flavor'],
              'hideVars': ['faction', 'cap', 'ex', 'atk', 'dfn', 'tgt', 'mb', 'z0', 'cF', 'cT', 'cW', 'newT', 'nodef', 'nomis', 'ctlT', 'freeJoin', 'swiftT', 'exileOnLeave',
                           'hqdmg', 'turns', 'missT', 'winT', 'sacT', 'revT', 'acted', 'skipDraw', 'held', 'done', 'pv'],
              'hideKeywords': ['token'],
              'labels': {'dom': 'Dominance', 'inf': 'Influence', 'tmp': 'temporary', 'rev': 'Revelation', 'ops': 'Operatives', 'sites': 'Facilities', 'gear': 'Assets',
                         'hq': 'Headquarters', 'plan': 'Master Plan', 'agendas': 'Conspiracy Agendas', 'scored': 'Scored', 'limbo': 'Resolving', 'grave': 'Discard',
                         'dmg': 'damage', 'ctl': 'Control', 'prog': 'progress', 'pr0': 'P1 progress', 'pr1': 'P2 progress', 'mand': 'Mandate',
                         'force': 'Force', 'trade': 'Tradecraft', 'will': 'Will', 'hp': 'Health', 'plan_': 'Master Plan', 'response': 'Response'},
              'announce': {'agendaScored': 'Agenda scored: {card}', 'planEnacted': 'Master Plan enacted: {card}', 'agendaRevealed': 'New Agenda: {card}'}},
    'presentation': {
        'templates': {
            'operative': {'base': 'skirmisher', 'art': 52, 'stats': [{'field': 'force', 'pos': 'line', 'label': 'F'}, {'field': 'trade', 'pos': 'line', 'label': 'T'},
                                                                       {'field': 'will', 'pos': 'line', 'label': 'W'}, {'field': 'hp', 'pos': 'br', 'icon': '♥'}], 'label': 'Operative'},
            'card': {'base': 'spell', 'art': 52, 'label': 'Card'},
            'agenda': {'base': 'vital', 'art': 40, 'stats': [{'field': 'need', 'pos': 'tl', 'icon': '◆'}, {'field': 'dom', 'pos': 'tr', 'icon': '♛'}], 'label': 'Agenda — progress needed, Dominance'},
            'hq': {'base': 'leader', 'art': 52, 'stats': [{'field': 'security', 'pos': 'tr', 'icon': '⛨'}], 'label': 'Headquarters'},
        },
        'byType': {'operative': 'operative', 'headquarters': 'hq', 'plan': 'agenda', 'agenda': 'agenda', 'facility': 'card', 'asset': 'card', 'operation': 'card', 'response': 'card'}},
}

# ---------------------------------------------------------------- write
os.makedirs(os.path.join(OUT, 'ai'), exist_ok=True)
for stale in ['campaign']:
    pass
def dump(name, obj):
    with open(os.path.join(OUT, name), 'w') as f: json.dump(obj, f, indent=1, ensure_ascii=False); f.write('\n')
dump('manifest.json', MANIFEST)
dump('rules.json', RULES)
dump('cards.json', CARDS)
dump('decks.json', DECKS)
dump('ai/ai.json', AI)
n = sum(1 for c in CARDS if c.get('rarity') != 'T')
print(f'shadow-earth 2.0: {n} cards ({len(AGENDAS)} Agendas), {len(DECKS)} decks, {len(F)} functions, {len(P)} procedures')
