"""Shadow Earth: Dawn Star Society (Occultists, Scriptures, Pacts, Demons, sacrifice)."""
from lib import *

OCC = lambda p='$me': flt(OPS(p), has('$it', 'occultist'))
DEMONS = lambda p='$me': flt(OPS(p), has('$it', 'demon'))
SCRIPTS = lambda p='$me': flt(GEAR(p), has('$it', 'scripture'))
PACTS = lambda p='$me': flt(GEAR(p), has('$it', 'pact'))
RITUALS = lambda p='$me': flt(SITES(p), has('$it', 'ritual'))
def distinct_names(l): return cnt(['distinct', ['map', l, g('$it', 'card')]])
MY = myMission(); THEIRS = theirMission()
TOKENS = lambda p='$me': flt(OPS(p), has('$it', 'token'))

fx('Dawn Star Grand Lodge', abilities=[on_played(has('$e.c', 'scripture'), [tmp(1)], once_per_turn=True)])

# ---------------------------------------------------------------- Infernal Pact
fx('Ambitious Initiate')
RULE_TRIGGERS.append({'on': 'sacrificed', 'if': eq('$e.card', slug('Ambitious Initiate')), 'do': [C('gainTmp', '$e.p', 1)]})
fx('Written in Blood', op=op([sacrifice('$t'), draw(2), lose_dom(1)], targets=[slot(MY_SAC(), prompt='Sacrifice which operative?')]))
fx('Contract Notary')
cost_term(Q(AND(has('$c', 'pact'), eq(g('$p', 'pl_pact'), 0), own('Contract Notary', '$p')), -1, 0))
# Pact obligations: pay the stated Influence (1 less with The Devil's Ledger, minimum 1) or suffer the penalty
fx('The Lesser Bargain', attach=1, bearerKw='occultist', abilities=[at_cleanup([
    choose(Q(ge(C('avail', '$me'), 1), opts('Pay 1 Influence', 'Take 1 damage'), opts('Take 1 damage')), '$y', 'The Lesser Bargain: pay the obligation?'),
    IF(eq('$y', 'Pay 1 Influence'), [C('spend', '$me', 1), emit('pactPaid', p='$me', n=1)], [dmg(bearerOf('$self'), 1)])])])
attr_term(bearer_term('The Lesser Bargain', 'W', 2))
fx('Unpaid Debt', resp=op([IF(attr_is('W'), [mission_bonus('$t', -3)]), SET('$t', 'drawAfter', 1)],
    targets=[slot(flt(OPS('$opp'), participating('$it')), prompt='Which opposing operative gets -3 Will?')], req=[(IN_MISSION, 'Only during a mission')]))
fx('Infernal Benefactor', deploy=[draw(2), choose(Q(gt(cnt(flt(MY_SAC(), ne('$it', '$self'))), 0), opts('Discard two cards', 'Sacrifice another operative'), opts('Discard two cards')),
    '$y', 'Infernal Benefactor: discard two cards, or sacrifice another operative?'),
    IF(eq('$y', 'Discard two cards'), [C('discardN', '$me', 2)], [pick(flt(MY_SAC(), ne('$it', '$self')), '$v', 'Sacrifice which operative?'), sacrifice('$v')])])
fx('The Price of Dominion', op=op([tmp(4), choose(flt(OCC(), eq(g('$it', 'ex'), 1)), '$rs', 'Ready up to two Occultists (one is sacrificed at Cleanup)', 0, 2),
    EACH('$rs', '$x', [ready('$x'), SET('$x', 'sacCleanup', '$turn')])]))
RULE_TRIGGERS.append({'on': 'cleanup', 'if': ANY(OPS('$e.p'), eq(g('$it', 'sacCleanup'), '$turn')), 'do': [
    choose(flt(OPS('$e.p'), eq(g('$it', 'sacCleanup'), '$turn')), '$v', 'The Price of Dominion: sacrifice one of them', 1, 1, who='$e.p'), C('sacrifice', '$v'),
    EACH(flt(OPS('$e.p'), eq(g('$it', 'sacCleanup'), '$turn')), '$x', [SET('$x', 'sacCleanup', 0)])]})
fx("The Devil's Ledger", abilities=[trig('pactPaid', [dom(1)], AND(eq('$e.p', SELF_P), eq('$active', SELF_P)), once_per_turn=True)])

# ---------------------------------------------------------------- Grand Summoning
fx('Archivist of the First Seal', deploy=[scry(2)])
fx('Scripture Fragment: Ash'); attr_term(Q(AND(A_('W'), has('$o', 'occultist'), defending('$o'), kind_is('subvert')), src_count('Scripture Fragment: Ash', ctrl('$o')), 0))
fx('Scripture Fragment: Iron'); attr_term(Q(AND(A_('F'), has('$o', 'occultist'), defending('$o'), kind_is('strike')), src_count('Scripture Fragment: Iron', ctrl('$o')), 0))
fx('Scripture Fragment: Dawn', abilities=[at_refresh([scry(1)])])
fx('Forbidden Translation', op=op([choose(flt(['top', '$me', 'deck', 5], has('$it', 'scripture')), '$v', 'Forbidden Translation: take which Scripture?', 0, 1),
    IF(isObj('$v'), [['move', '$v', 'hand']]), ['move', ['top', '$me', 'deck', Q(isObj('$v'), 4, 5)], 'deck']]))
fx('The Seventh Circle', abil=[abil('Exhaust two Occultists: 2 Influence for Rituals and Scriptures this turn',
    [EACH('$t', '$x', [exhaust('$x')]), SET('$me', 'r7', 2), SET('$me', 'r7T', '$turn')], ('development',),
    targets=[slot(flt(OCC(), eq(g('$it', 'ex'), 0)), prompt='Exhaust two Occultists', mn_=2, mx_=2)])],
   abilities=[on_played(AND(OR(has('$e.c', 'ritual'), has('$e.c', 'scripture')), eq(g('$me', 'r7T'), '$turn')),
                        [SET('$me', 'r7', mx(0, sub(g('$me', 'r7'), g('$e.c', 'cost'))))])])
cost_term(Q(AND(OR(has('$c', 'ritual'), has('$c', 'scripture')), eq(g('$p', 'r7T'), '$turn')), neg(mn(g('$p', 'r7'), g('$c', 'cost'))), 0))
fx('Rite of the Broken Seal', mattr=3, mop=[{'label': 'Rite of the Broken Seal (Will mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[IF(ge(distinct_names(SCRIPTS()), 3), [dom(2)])])
fx('The Unwritten Gospel', abilities=[at_refresh([choose(opts('Ash', 'Iron', 'Dawn'), '$r', 'The Unwritten Gospel: which Scripture designation this turn?'),
    SET('$self', 'gospel', Q(eq('$r', 'Ash'), 1, Q(eq('$r', 'Iron'), 2, 3)))])])
PRE_DEFEND.append(IF(AND(own('The Unwritten Gospel', '$me'), attr_is('W'), ANY(ATK, has('$it', 'occultist')), ge(distinct_names(SCRIPTS('$me')), 3)), [INC('game', 'am', 4)]))

# ---------------------------------------------------------------- Inner Lodge
fx('Lodge Steward', deploy=[choose(Q(ge(C('avail', '$me'), 1), opts('Pay 1: draw, then discard', 'No'), opts('No')), '$y', 'Lodge Steward'),
    IF(eq('$y', 'Pay 1: draw, then discard'), [C('spend', '$me', 1), loot(1)])])
fx('Hereditary Patron', abilities=[on_played(typ('$e.c', 'facility'), [tmp(1)], once_per_turn=True)])
fx('Private Lodge', rabil=[abil('An Occultist gets +1 Tradecraft in this mission', [mission_bonus('$t', 1)], ('respond',), req=[(attr_is('T'), 'Only in a Tradecraft mission')],
    targets=[slot(flt(OCC(), participating('$it')), prompt='Which Occultist?')])])
fx('Masonic Favor', resp=op([choose(Q(ge(C('avail', ATTACKER), 2), opts('Pay 2', 'Cancel the mission'), opts('Cancel the mission')), '$y',
                                   'Masonic Favor: pay 2 or your mission is cancelled', who=ATTACKER),
    IF(eq('$y', 'Pay 2'), [C('spend', ATTACKER, 2)], [SET('game', 'mcan', 1), emit('missionCancelled', by='$me')])],
    req=[(AND(THEIRS, typ(TGT, 'facility')), 'Only against a mission targeting your Facility')]))
fx('Senior Adept', abilities=[on_played(typ('$e.c', 'asset'), [scry(1), IF(has('$e.c', 'scripture'), [loot(1)])])])
fx('The Patronage List', abilities=[trig('deployed', [tmp(1)], AND(eq('$e.p', SELF_P), eq('$e.type', 'operative'), ge(g('$e.c', 'cost'), 3)), once_per_turn=True)])
fx('Grand Master of the Lodge', abilities=[
    trig('missionDeclared', [pick(flt(ATK, ne('$it', '$self')), '$v', 'Grand Master: which other operative gets +2 Tradecraft?', 0, 1), IF(isObj('$v'), [mission_bonus('$v', 2)])],
         AND(eq('$e.p', SELF_P), eq('$e.kind', 2), attacking('$self'))),
    on_success('infiltrate', [dom(1)], attacking('$self'), once_per_turn=True)])
fx('The Invisible Chapter', abilities=[on_success('any', [
    choose(flt(HAND('$me'), AND(typ('$it', 'facility'), le(g('$it', 'cost'), 3), eq(g('$it', 'ready'), 1))), '$f', 'The Invisible Chapter: play a Facility (cost 3 or less) for free?', 0, 1),
    IF(isObj('$f'), [['move', '$f', 'sites', {'as': '$c'}], SET('$c', 'newT', '$turn'), C('played', '$c', '$me'), IF(eq(g('$c', 'hasDeploy'), 1), [['run', '$c', 'deploy']]),
                     emit('deployed', c='$c', p='$me', card=g('$c', 'card'), type='facility')])], once_per_turn=True)])

# ---------------------------------------------------------------- Demonic Legions
fx('Lesser Imp')
RULE_TRIGGERS.append({'on': 'eliminated', 'if': AND(eq('$e.card', slug('Lesser Imp')), IN_MISSION, eq(ATTACKER, '$e.ctrl'), attr_is('F')), 'do': [
    choose(flt(ATK, ne('$it', '$e.o')), '$v', 'Lesser Imp: which other attacker gets +1 Force?', 0, 1, who='$e.ctrl'), IF(isObj('$v'), [mission_bonus('$v', 1)])]})
fx('Pact Summoner')
cost_term(Q(AND(has('$c', 'demon'), typ('$c', 'operative'), eq(g('$p', 'pl_demon'), 0), own('Pact Summoner', '$p')), -1, 0))
fx('Circle of Summoning', abilities=[trig('deployed', [until_cleanup('$e.c', 'F', 1)], AND(eq('$e.p', SELF_P), has('$e.c', 'demon')), once_per_turn=True)])
fx('Hellfire Lash', resp=op([mission_bonus('$t', 2), pick(DFN, '$v', 'Hellfire Lash: 1 damage to which defender?', 0, 1), dmg('$v', 1)],
    targets=[slot(flt(DEMONS(), attacking('$it')), prompt='Which attacking Demon?')], req=[(AND(MY, attr_is('F')), 'Only in your Force mission')]))
fx('Bound Fiend')
NODEF.append(AND(isc('$o', 'Bound Fiend'), eq(cnt(RITUALS(ctrl('$o'))), 0)))
fx('Chain of Command', attach=1, bearerKw='occultist')
attr_term(Q(AND(A_('F'), has('$o', 'demon'), kind_is('strike'), participating('$o'), ANY(OPS(ctrl('$o')), AND(participating('$it'), gt(gear_n('$it', 'Chain of Command'), 0)))), 1, 0))
fx('Furnace of the Pit', abilities=[on_success('strike', [EACH(flt(DFN, ne(ctrl('$it'), '$me')), '$x', [dmg('$x', 1)])], attacking('$self'))])
fx('Infernal Muster', op=op([choose(flt(GRAVE('$me'), AND(has('$it', 'demon'), typ('$it', 'operative'), le(g('$it', 'cost'), 3))), '$ds', 'Put up to two Demons into play', 0, 2),
    EACH('$ds', '$x', [['move', '$x', 'ops', {'as': '$n'}], SET('$n', 'ex', 1), SET('$n', 'newT', '$turn'), SET('$n', 'exileOnLeave', 1), SET('$n', 'musterT', '$turn')])]))
RULE_TRIGGERS.append({'on': 'cleanup', 'do': [EACH(flt(OPS('$e.p'), eq(g('$it', 'musterT'), '$turn')), '$x', [C('detach', '$x'), ['move', '$x', 'exile']])]})

# ---------------------------------------------------------------- 1.4 bridge cards
fx('Archivist of the Eighth Seal', abilities=[on_played(OR(has('$e.c', 'scripture'), has('$e.c', 'pact')), [scry(2)]),
    trig('sacrificed', [loot(1)], eq('$e.p', SELF_P), once_per_turn=True, optional=True, text='Draw, then discard?')])
fx('The Ashen Reliquary', deploy=[pick(flt(GRAVE('$me'), AND(OR(has('$it', 'pact'), has('$it', 'scripture')), le(g('$it', 'cost'), 2))), '$v',
    'Return which Pact or Scripture (cost 2 or less)?', 0, 1), IF(isObj('$v'), [['move', '$v', 'hand']])],
   abil=[abil('Exhaust: your next Ritual Facility or Scripture this turn costs 1 less', [exhaust('$self'), SET('$me', 'arT', '$turn')], ('development',),
              req=[(eq(g('$self', 'ex'), 0), 'Already exhausted')])],
   abilities=[on_played(AND(OR(has('$e.c', 'ritual'), has('$e.c', 'scripture')), eq(g('$me', 'arT'), '$turn')), [SET('$me', 'arT', 0)])])
cost_term(Q(AND(OR(has('$c', 'ritual'), has('$c', 'scripture')), eq(g('$p', 'arT'), '$turn')), -1, 0))
fx('The Chapel Beneath St. Bartholomew’s', abilities=[trig('missionDeclared', [
    pick(TOKENS(), '$tk', 'The Chapel: sacrifice a token to add Will?', 0, 1),
    IF(isObj('$tk'), [sacrifice('$tk'), team_bonus('atk', Q(gt(cnt(SCRIPTS()), 0), 4, 3))])],
    AND(eq('$e.p', SELF_P), eq('$e.attr', 3), ANY(ATK, has('$it', 'occultist')), gt(cnt(TOKENS()), 0), C('active', '$self')), once_per_turn=True)])
fx('Initiation at the Black Stair', op=op([IF(has('$t', 'occultist'), [loot(1)], [SET('$t', 'kw:occultist', 1)])], targets=[slot(OPS(), prompt='Which operative is initiated?')]))
fx('The Sixth Translation', abilities=[on_played(has('$e.c', 'scripture'), [SET('$self', 'prog', mn(3, add(g('$self', 'prog'), 1)))])],
   abil=[abil('Remove three Study counters: return an Occultist (cost 3 or less) to play',
    [INC('$self', 'prog', -3), ['move', '$t', 'ops', {'as': '$n'}], SET('$n', 'ex', 1), SET('$n', 'newT', '$turn'), SET('$n', 'exileOnLeave', 1)], ('development',),
    req=[(ge(g('$self', 'prog'), 3), 'Needs three Study counters')],
    targets=[slot(flt(GRAVE('$me'), AND(has('$it', 'occultist'), typ('$it', 'operative'), le(g('$it', 'cost'), 3))), prompt='Return which Occultist?')])])
fx('Marquis Vale, Lodge Benefactor', abilities=[at_refresh([tmp(1)], gt(cnt(RITUALS()), 0)),
    trig('pactPaid', [dom(1)], eq('$e.p', SELF_P), once_per_turn=True)])
fx('The Door Opens Inward', mattr=3, mop=[{'label': 'The Door Opens Inward (Will mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[pick(flt(GRAVE('$me'), OR(has('$it', 'artifact'), has('$it', 'scripture'))), '$v', 'Return which Artifact or Scripture?', 0, 1), IF(isObj('$v'), [['move', '$v', 'hand']]),
         dom(Q(gt(g('$me', 'sacTurn'), 0), 2, 1))])
fx('Censer of the Unspoken Name', attach=1, bearerKw='occultist', deploy=[until_cleanup(bearerOf('$self'), 'W', 2)],
   abilities=[trig('missionResult', [pick(TOKENS(), '$tk', 'Censer: sacrifice a token to draw a card?', 0, 1), IF(isObj('$tk'), [sacrifice('$tk'), draw(1)])],
                   AND(eq('$e.p', SELF_P), eq('$e.ok', 1), eq('$e.attr', 3), attacking(bearerOf('$self')), gt(cnt(TOKENS()), 0)), once_per_turn=True)])

# ---------------------------------------------------------------- Agendas
fx('Library of the Unspoken', **agenda([(ge(distinct_names(SCRIPTS()), 2), 'Control two Scriptures with different names'),
                                         (eq(g('$me', 'sucWill'), 1), 'Succeed at a Will mission this turn')], imm=[draw(1), tmp(1)]))
cost_term(Q(AND(OR(has('$c', 'scripture'), has('$c', 'pact')), eq(add(g('$p', 'pl_scripture'), g('$p', 'pl_pact')), 0), agenda_on('Library of the Unspoken', '$p')), -1, 0))
fx('Covenant of the Fallen', **agenda([(gt(cnt(PACTS()), 0), 'Control a Pact'), (ge(cnt(OCC()), 2), 'Control two Occultists'),
                                        (ge(g('$me', 'sacN'), 2), 'Have sacrificed two operatives this game')], imm=[dom(2), draw(1)]))
RULE_TRIGGERS.append({'on': 'pactPaid', 'if': AND(agenda_on('Covenant of the Fallen', '$e.p'), lt(g('$e.p', 'covT'), 2)),
                      'do': [INC('$e.p', 'covT', 1), C('gainTmp', '$e.p', 1)]})
RULE_TRIGGERS.append({'on': 'refresh', 'do': [SET('$e.p', 'covT', 0), IF(agenda_on('The Morning Star Descends', '$e.p'), [SET('$e.p', 'attMax', 3)])]})
fx('The Morning Star Descends', **agenda([(ge(distinct_names(SCRIPTS()), 3), 'Control three Scriptures with different names'), (gt(cnt(RITUALS()), 0), 'Control a Ritual Facility'),
                                           (ge(cnt(OCC()), 3), 'Control three Occultists'), (ge(C('avail', '$me'), 8), 'Spend 8 Influence')],
    imm=[token('tok-morning-star', 1, ready_=True), SET('$me', 'attMax', 3)], phases=('operations',), cost=[C('spend', '$me', 8)]))
RULE_TRIGGERS.append({'on': 'eliminated', 'if': AND(gt('$e.by', 0), ne(g(['nth', ['players'], sub('$e.by', 1)], 'seat'), g('$e.owner', 'seat')),
                                                      agenda_on('The Morning Star Descends', ['nth', ['players'], sub('$e.by', 1)]),
                                                      ne(g(['nth', ['players'], sub('$e.by', 1)], 'msT'), '$turn')),
                      'do': [LET('$k', ['nth', ['players'], sub('$e.by', 1)]), SET('$k', 'msT', '$turn'), C('gainDom', '$k', 1)]})
fx('Infernal Legislature', **agenda([(gt(cnt(PACTS()), 0), 'Control a Pact'), (gt(cnt(RITUALS()), 0), 'Control a Ritual Facility'), (ge(cnt(OCC()), 3), 'Control three Occultists'),
                                      (ge(recent('$me', 'W'), 2), 'Succeed at Subvert on two consecutive turns')],
    imm=[pick(facs('$opp'), '$f', 'Infernal Legislature: Disable which opposing Facility?', 0, 1), disable('$f')]))
cost_term(Q(AND(typ('$c', 'response'), IN_MISSION, attr_is('W'), ne(ATTACKER, '$p'), eq(g('$p', 'respM'), 0), agenda_on('Infernal Legislature', ['opp', '$p'])), 1, 0))
