"""Shadow Earth: Illuminati (Banks, Institutions, Contractors, regulation)."""
from lib import *

BANKS = lambda p='$me': flt(SITES(p), has('$it', 'bank'))
INST = lambda p='$me': flt(SITES(p), has('$it', 'institution'))
CONTR = lambda p='$me': flt(OPS(p), has('$it', 'contractor'))
def distinct_names(l): return cnt(['distinct', ['map', l, g('$it', 'card')]])
MY = myMission(); THEIRS = theirMission()
SIDE_BONUS = lambda p, n: IF(eq(ATTACKER, p), [INC('game', 'am', n)], [INC('game', 'dm', n)])

fx('The Central Committee', abilities=[on_played(has('$e.c', 'institution'), [tmp(1)], once_per_turn=True)])

# ---------------------------------------------------------------- Financial Empire
fx('Junior Broker', abilities=[at_refresh([tmp(1)], gt(cnt(BANKS()), 0))])
fx('Offshore Holding Company', abilities=[at_refresh([tmp(1)])])
fx('Cash Transfer', op=op([tmpc(2)]))
fx('Investment Analyst', abilities=[trig('tmpGained', [scry(1)], eq('$e.p', SELF_P), once_per_turn=True)])
OPSTART.append(IF(AND(IN_MISSION, typ('$c2', 'response'), ANY(HAND('$opp'), AND(isc('$it', 'Risk Arbitrage'), ge(C('avail', '$opp'), C('cost', '$it', '$opp'))))), [
    LET('$ra', first(flt(HAND('$opp'), isc('$it', 'Risk Arbitrage')))),
    choose(Q(ge(C('avail', '$opp'), add(C('cost', '$ra', '$opp'), 2)), opts('No', 'Play it, +1', 'Play it, +2'),
             Q(ge(C('avail', '$opp'), add(C('cost', '$ra', '$opp'), 1)), opts('No', 'Play it, +1'), opts('No'))), '$y',
           'The opponent played a Response: play Risk Arbitrage (pay up to 2 more for that much +Tradecraft)?', who='$opp'),
    IF(ne('$y', 'No'), [LET('$x', Q(eq('$y', 'Play it, +2'), 2, 1)), C('spend', '$opp', add(C('cost', '$ra', '$opp'), '$x')), ['move', '$ra', 'grave'],
                        IF(attr_is('T'), [SIDE_BONUS('$opp', '$x')])])]))
fx('Risk Arbitrage')
fx('Private Reserve Bank', abilities=[at_refresh([tmp(2)])])
PLAYREQ.append(NOT(AND(isc('$c', 'Private Reserve Bank'), own('Private Reserve Bank', '$p'))))
fx('Liquidity Injection', op=op([draw(3), C('discardN', '$me', mx(0, sub(3, cnt(facs('$me')))))]))
fx('Sovereign Wealth Network', abilities=[at_refresh([tmp(3)])],
   abil=[abil('Pay 3: gain 1 Dominance', [dom(1)], ('development', 'operations'), cost=[C('spend', '$me', 3)],
              req=[(AND(ge(C('avail', '$me'), 3), ge(cnt(facs('$me')), 4)), 'Needs 3 Influence and four Facilities')])])

# ---------------------------------------------------------------- Political Hegemony
attr_term(self_term('Municipal Fixer', 'T', 2, AND(defending('$o'), kind_is('infiltrate'))))
fx('Municipal Fixer')
fx('Lobbying Office', abilities=[at_refresh([SET('$self', 'prog', mn(2, add(g('$self', 'prog'), 1)))], eq(g('$me', 'lastSuc'), 1))])
fx('Public Affairs Director', rabil=[abil('Remove a Mandate counter: your team gets +2 Tradecraft', [INC('$t', 'prog', -1), SIDE_BONUS('$me', 2)], ('respond',),
    req=[(AND(attr_is('T'), ANY(OPS('$me'), participating('$it'))), 'Only in a Tradecraft mission you are part of')],
    targets=[slot(flt(INST(), gt(g('$it', 'prog'), 0)), prompt='Remove a Mandate counter from which Institution?')])])
fx('Coalition Bargaining', mattr=2, mop=[{'label': 'Coalition Bargaining (Tradecraft mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[dom(1), IF(AND(ANY(INST(), gt(g('$it', 'prog'), 0)), ge(cnt(INST()), 2)), [
       choose(flt(INST(), gt(g('$it', 'prog'), 0)), '$src', 'Move a Mandate counter from which Institution? (for 1 more Dominance)', 0, 1),
       IF(isObj('$src'), [choose(flt(INST(), ne('$it', '$src')), '$dst', 'To which Institution?'), INC('$src', 'prog', -1), INC('$dst', 'prog', 1), dom(1)])])])
fx('Compromised Minister')
cost_term(Q(AND(has('$c', 'institution'), eq(g('$p', 'pl_institution'), 0), own('Compromised Minister', '$p')), -1, 0))
fx('International Forum', abilities=[at_refresh([dom(1)], ge(distinct_names(INST()), 3))])
fx('The Invisible Caucus', resp=op([IF(gt(cnt(flt(facs('$me'), AND(ne('$it', TGT), NOT(has('$it', 'institution'))))), 0), [
    choose(flt(facs('$me'), AND(ne('$it', TGT), NOT(has('$it', 'institution')))), '$nf', 'The Invisible Caucus: the mission now targets which of your Facilities?'),
    SET(TGT, 'tgt', 0), SET('$nf', 'tgt', 1)], [SET('game', 'mcan', 1), emit('missionCancelled', by='$me')])],
    req=[(AND(THEIRS, has(TGT, 'institution')), 'Only when a mission targets your Institution')]))
fx('Permanent World Council', abilities=[at_refresh([IF(ge(distinct_names(INST()), 5), [dom(2)], [tmp(1)])])])

# ---------------------------------------------------------------- Proxy Operations
fx('Contracted Surveillance'); HASTE.append(AND(eq('$k', 2), isc('$o', 'Contracted Surveillance')))
fx('Disposable Fixer')
RULE_TRIGGERS.append({'on': 'eliminated', 'if': eq('$e.card', slug('Disposable Fixer')), 'do': [C('loot', '$e.ctrl', 1)]})
fx('Cutout Company')
cost_term(Q(AND(has('$c', 'contractor'), typ('$c', 'operative'), eq(g('$p', 'pl_contractor'), 0), own('Cutout Company', '$p')), -1, 0))
fx('Deniable Payment', resp=op([mission_bonus('$t', 2), SET('$t', 'sacEnd', '$turn')], targets=[slot(flt(CONTR(), participating('$it')), prompt='Which Contractor?')],
    req=[(IN_MISSION, 'Only during a mission')]))
fx('Mercenary Handler')
attr_term(Q(AND(OR(A_('F'), A_('T')), has('$o', 'contractor'), attacking('$o'), own('Mercenary Handler', ctrl('$o'))), 1, 0))
fx('False-Flag Operation', mattr=2, mop=[{'label': 'False-Flag Operation (Tradecraft mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[pick(OPS('$opp'), '$v', 'False-Flag Operation: which operative cannot defend during your next turn?', 0, 1), IF(isObj('$v'), [SET('$v', 'nodef', add('$turn', 2))]), dom(1)])
fx('Corporate Intervention Force', deploy=[choose(flt(CONTR(), AND(ne('$it', '$self'), eq(g('$it', 'ex'), 1))), '$rs', 'Ready up to two Contractors (they cannot attack this turn)', 0, 2),
    EACH('$rs', '$x', [ready('$x'), SET('$x', 'nomis', '$turn')])])
fx('Global Subcontractors', abilities=[at_refresh([token('tok-contractor', 2), EACH(flt(OPS('$me'), AND(isc('$it', 'Contractor'), eq(g('$it', 'newT'), '$turn'))), '$x',
    [SET('$x', 'upkeep', 1)])])])

# ---------------------------------------------------------------- Regulatory Suppression
attr_term(self_term('Compliance Officer', 'T', 2, AND(defending('$o'), typ(TGT, 'facility'))))
fx('Compliance Officer')
OPSTART.append(IF(AND(eq(g('$c2', 'tFac'), 1), ANY(HAND('$opp'), AND(isc('$it', 'Emergency Injunction'), ge(C('avail', '$opp'), C('cost', '$it', '$opp'))))), [
    LET('$ei', first(flt(HAND('$opp'), isc('$it', 'Emergency Injunction')))),
    choose(opts('Play Emergency Injunction', 'No'), '$w', 'The opponent played an Operation that targets Facilities: play Emergency Injunction (they pay 2 more or it is cancelled)?', who='$opp'),
    IF(eq('$w', 'Play Emergency Injunction'), [C('spend', '$opp', C('cost', '$ei', '$opp')), ['move', '$ei', 'grave'], *taxed('$me', 2, 'Let it be cancelled'),
        IF(ne('$y', 'Pay 2'), [SET('game', 'ocan', 1), emit('cancelled', card=g('$c2', 'card'))])])]))
fx('Emergency Injunction')
OPSTART.append(IF(AND(eq(g('$c2', 'tFac'), 1), ANY(HAND('$opp'), AND(isc('$it', 'An Offer in Writing'), ge(C('avail', '$opp'), C('cost', '$it', '$opp'))))), [
    LET('$aw', first(flt(HAND('$opp'), isc('$it', 'An Offer in Writing')))),
    choose(opts('Play An Offer in Writing', 'No'), '$w', 'The opponent played an Operation that targets Facilities: play An Offer in Writing?', who='$opp'),
    IF(eq('$w', 'Play An Offer in Writing'), [C('spend', '$opp', C('cost', '$aw', '$opp')), ['move', '$aw', 'grave'], *taxed('$me', 2, 'Let it be cancelled'),
        IF(ne('$y', 'Pay 2'), [SET('game', 'ocan', 1), emit('cancelled', card=g('$c2', 'card'))], [C('loot', '$opp', 1)])])]))
fx('An Offer in Writing')
USEHOOK.append(IF(AND(own('Audit Office', '$opp'), ne(g('$opp', 'auditT'), '$turn')), [SET('$opp', 'auditT', '$turn'), *taxed('$me', 1, 'Let the activation fizzle'),
    IF(ne('$y', 'Pay 1'), [SET('game', 'ucan', 1), emit('cancelled', card=g('$self', 'card'))])]))
fx('Audit Office')
fx('Asset Freeze', op=op([SET('$t', 'frozenT', Q(eq(ctrl('$t'), '$me'), add('$turn', 2), add('$turn', 1)))], targets=[slot(facs('*'), prompt='Freeze which Facility?')]), tFac=1)
fx('Special Prosecutor', abilities=[on_success('infiltrate', [
    choose(Q(AND(ge(C('avail', '$opp'), 2), gt(cnt(HAND('$opp')), 0)), opts('Pay 2', 'Discard a card'), Q(gt(cnt(HAND('$opp')), 0), opts('Discard a card'), opts('Pay 2'))),
           '$y', 'Special Prosecutor: pay 2 or discard a card?', who='$opp'),
    IF(eq('$y', 'Pay 2'), [IF(ge(C('avail', '$opp'), 2), [C('spend', '$opp', 2), emit('taxPaid', p='$opp', n=2)])], [C('discardN', '$opp', 1)])])])
fx('Public Scandal', mattr=2, mop=[{'label': 'Public Scandal (Tradecraft mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[pick(facs('$opp'), '$f', 'Public Scandal: Disable which Facility?', 0, 1), disable('$f'), dom(1)])
USEHOOK.append(IF(own('The Geneva Blacklist', '$opp'), [*taxed('$me', 1, 'Let the activation fizzle'),
    IF(ne('$y', 'Pay 1'), [SET('game', 'ucan', 1), emit('cancelled', card=g('$self', 'card'))])]))
fx('The Geneva Blacklist')
USEHOOK.append(IF(AND(eq(g('game', 'ucan'), 0), own('The Administrative State', '$opp'), ne(g('$opp', 'admT'), '$turn')), [SET('$opp', 'admT', '$turn'),
    *taxed('$me', 2, 'Let the activation be cancelled'),
    IF(ne('$y', 'Pay 2'), [SET('game', 'ucan', 1), emit('cancelled', card=g('$self', 'card'))], [C('gainDom', '$opp', 1)])]))
fx('The Administrative State')

# ---------------------------------------------------------------- 1.4 bridge cards
fx('Deputy Minister Corinne Voss', abilities=[trig('disabled', [tmp(1)], AND(ne('$e.p', SELF_P)), once_per_turn=True)])
attr_term(self_term('Deputy Minister Corinne Voss', 'T', 2, AND(defending('$o'), kind_is('infiltrate'))))
fx('The Zurich Clearinghouse', abilities=[at_refresh([tmp(1)])],
   abil=[abil('Spend 2: move a Loadout to another operative, then draw and discard',
    [choose(flt(OPS('$me'), AND(ne('$it', bearerOf('$t')), C('bearerOk', '$t', '$it'))), '$b', 'Move it to which operative?'),
     ['unlink', '$t', 'bearer'], ['link', '$t', 'bearer', '$b'], loot(1)], ('development', 'operations'), cost=[C('spend', '$me', 2)],
    req=[(ge(C('avail', '$me'), 2), 'Needs 2 Influence')], targets=[slot(flt(GEAR('$me'), AND(has('$it', 'loadout'), isObj(bearerOf('$it')))), prompt='Move which Loadout?')])])
fx('Bilateral Immunity Agreement', abilities=[at_refresh([choose(opts('Strike', 'Infiltrate'), '$r', 'Bilateral Immunity Agreement: which mission costs the attacker 1 more?'),
    SET('$me', 'biaK', Q(eq('$r', 'Strike'), 1, 2))])])
MCOST.append(Q(AND(own('Bilateral Immunity Agreement', ['opp', '$p']), eq(g(['opp', '$p'], 'biaK'), '$k'),
                   eq(Q(eq('$k', 1), g('$p', 'mk1'), g('$p', 'mk2')), 0)), 1, 0))
fx('Executive Protection Detail', kws=['ambush'])
attr_term(self_term('Executive Protection Detail', 'F', 1, AND(defending('$o'), typ(TGT, 'facility'))))
fx('The Vienna Arbitration Room', abilities=[trig('taxPaid', [loot(1), tmp(1)], AND(ne('$e.p', SELF_P), ge('$e.n', 2)), once_per_turn=True)])
fx('Public-Private Security Charter', deploy=[token('tok-contractor-111', 1),
    choose(flt(OPS('$me'), AND(has('$it', 'contractor'), C('bearerOk', '$self', '$it'))), '$b', 'Attach the Charter to which Contractor?', 0, 1),
    IF(isObj('$b'), [['link', '$self', 'bearer', '$b'], emit('attached', a='$self', o='$b', p='$me')])], kws=['loadout'])
attr_term(bearer_term('Public-Private Security Charter', 'F', 2, defending('$o')))
AFTER_DEFEND.append(EACH(flt(DFN, AND(gt(gear_n('$it', 'Public-Private Security Charter'), 0), ne(g('$it', 'pcT'), '$turn'))), '$x', [SET('$x', 'pcT', '$turn'), ready('$x')]))
fx('Managed Opposition Caucus', abilities=[trig('disabled', [loot(1)], C('active', '$self'), once_per_turn=True)])
INFIL_OPTS.append(('Forego Dominance: Disable a Facility and gain 2 temporary Influence (Caucus)', AND(own('Managed Opposition Caucus', '$me'), gt(cnt(facs('$opp')), 0)),
    [choose(facs('$opp'), '$f', 'Disable which Facility?'), disable('$f'), tmp(2)]))

# ---------------------------------------------------------------- Agendas
RULE_TRIGGERS.append({'on': 'refresh', 'do': [
    IF(agenda_on('The Invisible Hand', '$e.p'), [C('gainTmp', '$e.p', 1)]),
    IF(agenda_on('The New World Compact', '$e.p'), [C('gainTmp', '$e.p', 1)]),
    IF(agenda_on('The Final Settlement', '$e.p'), [C('gainTmp', '$e.p', 2), C('gainDom', '$e.p', 1)])]})
fx('The Invisible Hand', **agenda([(ge(cnt(facs('$me')), 3), 'Control three Facilities'),
                                    (AND(eq('$phase', 'operations'), eq(g('$me', 'missT'), 0), ge(C('avail', '$me'), 5)), 'Have 5 Influence available at the start of Operations')],
    imm=[dom(2), draw(1)], phases=('operations',)))
fx('The New World Compact', **agenda([(ge(distinct_names(INST()), 3), 'Control three Institutions with different names'),
                                       (ge(C('avail', '$me'), 6), 'Have 6 Influence available during Operations')], imm=[dom(2), draw(2)], phases=('operations',)))
cost_term(Q(AND(inl(g('$c', 'type'), lit(['operation', 'response', 'mission'])), agenda_on('The New World Compact', ['opp', '$p']),
                eq(add(g('$p', 'pl_operation'), g('$p', 'pl_response')), 0)), 1, 0))
fx('Permanent Emergency', **agenda([(ge(cnt(INST()), 2), 'Control two Institutions'),
                                     (OR(ge(g('$me', 'defended'), 2), ge(g('$me', 'disOpp'), 2)), 'Have defended two missions or Disabled two opposing Facilities this game')],
    imm=[dom(2)]))
RULE_TRIGGERS.append({'on': 'defended', 'if': AND(agenda_on('Permanent Emergency', '$e.p'), ne(g('$e.p', 'peT'), '$turn')), 'do': [SET('$e.p', 'peT', '$turn'), C('gainDom', '$e.p', 1)]})
fx('The Final Settlement', **agenda([(AND(eq('$phase', 'operations'), eq(g('$me', 'missT'), 0)), 'Complete it at the start of your Operations phase'),
                                      (ge(distinct_names(facs('$me')), 5), 'Control five Facilities with different names'), (ge(g('$me', 'cap'), 8), 'Have Influence capacity 8'),
                                      (OR(ge(g('$me', 'defended'), 2), ge(g('$me', 'disOpp'), 2)), 'Have defended two missions or Disabled two opposing Facilities this game')],
    imm=[dom(3), draw(2)], phases=('operations',)))
