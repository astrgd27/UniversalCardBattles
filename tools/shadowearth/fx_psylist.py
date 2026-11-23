"""Shadow Earth: PsyList (Psychics, hand-reading, Control counters)."""
from lib import *

MY_OPS = OPS('$me')
PSY = lambda p='$me': flt(OPS(p), has('$it', 'psychic'))
CTL_ENEMY = flt(OPS('$opp'), eq(g('$it', 'ctl'), 1))
MY = myMission(); THEIRS = theirMission()

fx('PsyList Central Station', abilities=[at_refresh([scry(1)], gt(cnt(PSY()), 0))])

# ---------------------------------------------------------------- Clairvoyance
fx('Remote Viewer', deploy=[peek_top(), IF(gt(cnt(DECK('$opp')), 0), [choose(opts('Leave it', 'Put it on the bottom'), '$y', 'Remote Viewer: their top card'),
    IF(eq('$y', 'Put it on the bottom'), [['move', first(DECK('$opp')), 'deck']])])])
fx('Probability Analyst', abilities=[on_success('infiltrate', [peek()], once_per_turn=True)])
fx('Sensory Deprivation Tank', abil=[abil('Exhaust a Psychic: Scry 2', [exhaust('$t'), scry(2)], ('development', 'operations'),
    targets=[slot(flt(PSY(), eq(g('$it', 'ex'), 0)), prompt='Exhaust which Psychic?')])])
fx('Precognitive Flash', resp=op([mission_bonus('$t', 2)], targets=[slot(flt(PSY(), participating('$it')), prompt='Which Psychic gets +2?')],
    req=[(IN_MISSION, 'Only during a mission')]))
fx('Chronicle of Possible Deaths', attach=1, bearerKw='psychic', abilities=[trig('missionDeclared', [
    peek_top(), IF(gt(cnt(DECK('$opp')), 0), [choose(opts('Reveal it (+1 to the team)', 'No'), '$y', 'Chronicle of Possible Deaths: reveal their top card?'),
        IF(eq('$y', 'Reveal it (+1 to the team)'), [C('revealTop', '$me', '$opp'), team_bonus('atk', 1)])])],
    AND(eq('$e.p', SELF_P), attacking(bearerOf('$self'))), once_per_turn=True)])
OPSTART.append(IF(AND(IN_MISSION, eq(g('$opp', 'revealedT'), 1), typ('$c2', 'response'),
                      ANY(HAND('$opp'), AND(isc('$it', 'Foresight Interdiction'), ge(C('avail', '$opp'), C('cost', '$it', '$opp'))))), [
    LET('$fi', first(flt(HAND('$opp'), isc('$it', 'Foresight Interdiction')))),
    choose(opts('Cancel it with Foresight Interdiction', 'No'), '$y', 'The opponent played a Response: cancel it with Foresight Interdiction?', who='$opp'),
    IF(eq('$y', 'Cancel it with Foresight Interdiction'), [C('spend', '$opp', C('cost', '$fi', '$opp')), ['move', '$fi', 'grave'], SET('game', 'ocan', 1),
                                                          emit('cancelled', card=g('$c2', 'card'))])]))
fx('Foresight Interdiction')
fx('Statistical Aberration', abilities=[trig('missionDeclared', [
    choose(opts('Operative', 'Facility', 'Asset', 'Project', 'Operation'), '$nm', 'Statistical Aberration: name a card type'),
    IF(gt(cnt(DECK('$opp')), 0), [LET('$top', first(DECK('$opp'))), C('revealTop', '$me', '$opp'),
        LET('$ty', g('$top', 'type')),
        IF(OR(AND(eq('$nm', 'Operative'), eq('$ty', 'operative')), AND(eq('$nm', 'Facility'), eq('$ty', 'facility')), AND(eq('$nm', 'Asset'), eq('$ty', 'asset')),
              AND(eq('$nm', 'Project'), eq('$ty', 'project')), AND(eq('$nm', 'Operation'), inl('$ty', lit(['operation', 'response', 'mission'])))),
           [draw(1), SET('$self', 'readyAfter', '$turn')])])],
    AND(eq('$e.p', SELF_P), attacking('$self')), once_per_turn=True)])
OPSTART.append(IF(AND(ANY(PERMS('$opp'), AND(isc('$it', 'Operation GLASSHOUSE'), C('active', '$it'))), ne(g('$opp', 'ghT'), '$turn'),
                      ge(C('avail', '$opp'), Q(IN_MISSION, 3, 2))), [
    choose(opts('Cancel it', 'No'), '$y', Q(IN_MISSION, 'Operation GLASSHOUSE: pay 3 to cancel this Operation?', 'Operation GLASSHOUSE: pay 2 to cancel this Operation?'), who='$opp'),
    IF(eq('$y', 'Cancel it'), [SET('$opp', 'ghT', '$turn'), C('spend', '$opp', Q(IN_MISSION, 3, 2)), SET('game', 'ocan', 1), emit('cancelled', card=g('$c2', 'card'))])]))
fx('Operation GLASSHOUSE', abilities=[trig('refresh', [peek('$e.p')], AND(ne('$e.p', SELF_P), C('active', '$self')))])

# ---------------------------------------------------------------- Psychic Assault
attr_term(self_term('Telekinetic Recruit', 'F', 1, AND(attacking('$o'), kind_is('strike'), ANY(ATK, AND(ne('$it', '$o'), has('$it', 'psychic'))))))
fx('Telekinetic Recruit')
fx('Pyrokinetic Enforcer', abilities=[on_success('strike', [pick(flt(OPS(['opp', SELF_P]), ne('$it', TGT)), '$v', 'Pyrokinetic Enforcer: 1 damage to a second enemy operative', 0, 1),
    dmg('$v', 1)], attacking('$self'))])
fx('Poltergeist Burst', resp=op([team_bonus('atk', 2)], req=[(AND(MY, attr_is('F')), 'Only in your Force mission')]))
fx('Psychic Shock Trooper', abilities=[on_success('strike', [
    IF(ge(C('avail', '$me'), 1), [pick(flt(PSY(), AND(ne('$it', '$self'), eq(g('$it', 'ex'), 1))), '$v', 'Psychic Shock Trooper: pay 1 to ready another Psychic?', 0, 1),
        IF(isObj('$v'), [C('spend', '$me', 1), ready('$v')])])])])
fx('Violent Telekinesis', mattr=1, mop=[{'label': 'Violent Telekinesis (Force mission)', 'targets': [slot(flt(OPS('$opp'), eq(g('$it', 'ex'), 0)), prompt='Target: a ready opposing operative')]}],
   succ=[IF(isObj(TGT), [eliminate(TGT)])])
fx('Pyrokinetic Test Chamber Six', abilities=[on_success('strike', [pick(OPS(['opp', SELF_P]), '$v', 'Test Chamber Six: 1 damage to an enemy operative', 0, 1), dmg('$v', 1)],
    ANY(ATK, has('$it', 'psychic')), once_per_turn=True)])
fx('Kinetic Shielding', attach=1, bearerKw='psychic', deploy=[INC(bearerOf('$self'), 'pv', 2)])
SHIELD.append(gear_n('$o', 'Kinetic Shielding'))
attr_term(bearer_term('Kinetic Shielding', 'F', 1, AND(defending('$o'), kind_is('strike'))))
fx('Subject Zero', abilities=[trig('missionDeclared', [ready('$self')], AND(eq('$e.p', SELF_P), eq('$e.kind', 1), attacking('$self')), once_per_turn=True),
                              trig('missionResult', [dmg('$self', 1)], AND(eq('$e.p', SELF_P), eq('$e.kind', 1), attacking('$self')))])

# ---------------------------------------------------------------- Mental Conditioning
fx('Compulsion Technician', abilities=[on_success('subvert', [pick(flt(DFN, ne(ctrl('$it'), '$me')), '$v', 'Compulsion Technician: exhaust a defending operative', 0, 1),
    IF(isObj('$v'), [exhaust('$v')])])])
fx('Hypnotic Trigger', resp=op([mission_bonus('$t', -2)], targets=[slot(flt(DFN, ne(ctrl('$it'), '$me')), prompt='Which opposing defender gets -2 Will?')],
    req=[(AND(MY, attr_is('W')), 'Only in your Will mission')]))
fx('The White Noise Suite', abilities=[on_success('subvert', [pick(flt(OPS('$opp'), eq(g('$it', 'ctl'), 0)), '$v', 'The White Noise Suite: Control counter on which operative?', 0, 1),
    control('$v')], once_per_turn=True)])
fx('Sleeper Handler', abil=[abil('Pay 2: an enemy with Control cannot defend this turn', [SET('$t', 'nodef', '$turn')], ('operations',),
    cost=[C('spend', '$me', 2)], req=[(ge(C('avail', '$me'), 2), 'Needs 2 Influence')], targets=[slot(CTL_ENEMY, prompt='Which controlled enemy?')], once=False)])
fx('Compromised Witness', deploy=[IF(gt(cnt(CTL_ENEMY), 0), [loot(1)])])
fx('Reprogram Identity', op=op([['control', '$t', '$me'], SET('$t', 'ctlT', '$turn'), ready('$t'), SET('$t', 'nodomT', '$turn'), emit('controlled', o='$t', p='$me')],
    targets=[slot(CTL_ENEMY, prompt='Take control of which operative?')]))
fx('Collective Suggestion', mattr=3, mop=[{'label': 'Collective Suggestion (Will mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[choose(flt(OPS('$opp'), eq(g('$it', 'ctl'), 0)), '$cs', 'Collective Suggestion: Control counters on up to two operatives', 0, 2), EACH('$cs', '$x', [control('$x')]), dom(1)])
fx('Protocol VESPER: Obedience Conditioning', abil=[abil('Remove Control: take control of that operative until your next Refresh',
    [SET('$t', 'ctl', 0), ['control', '$t', '$me'], SET('$t', 'ctlT', add('$turn', 1)), emit('controlled', o='$t', p='$me')], ('development', 'operations'),
    targets=[slot(CTL_ENEMY, prompt='Take which operative?')])])

# ---------------------------------------------------------------- Psionic Collective
attr_term(self_term('Untrained Sensitive', 'W', 1, ANY(OPS(ctrl('$o')), AND(ne('$it', '$o'), has('$it', 'psychic'), eq(g('$it', 'ex'), 0)))))
fx('Untrained Sensitive')
fx('Circle Coordinator')
PRE_DEFEND.append(IF(AND(own('Circle Coordinator', '$me'), attr_is('W'), ge(cnt(flt(ATK, has('$it', 'psychic'))), 2)), [INC('game', 'am', 1)]))
AFTER_DEFEND.append(IF(AND(own('Circle Coordinator', '$opp'), attr_is('W'), ge(cnt(flt(DFN, has('$it', 'psychic'))), 2)), [INC('game', 'dm', 1)]))
fx('Neural Link', attach=1, bearerKw='psychic', deploy=[scry(2)],
   abilities=[on_success('subvert', [loot(1)], attacking(bearerOf('$self')), once_per_turn=True)])
attr_term(Q(AND(A_('T'), defending('$o'), kind_is('infiltrate'), gt(gear_n('$o', 'Neural Link'), 0)), mx(0, sub(C('attr', '$o', 3), C('printed', '$o', 2))), 0))
fx('Group Meditation', op=op([choose(flt(PSY(), AND(eq(g('$it', 'ex'), 1), le(g('$it', 'will'), 2))), '$rs', 'Ready up to two Psychics (printed Will 2 or less)', 0, 2),
    EACH('$rs', '$x', [ready('$x')])]))
fx('Psi Amplifier')
PRE_DEFEND.append(IF(AND(own('Psi Amplifier', '$me'), attr_is('W'), eq(cnt(ATK), 2), ALL(ATK, has('$it', 'psychic'))), [INC('game', 'am', 2)]))
AFTER_DEFEND.append(IF(AND(own('Psi Amplifier', '$opp'), attr_is('W'), eq(cnt(DFN), 2), ALL(DFN, has('$it', 'psychic'))), [INC('game', 'dm', 2)]))
fx('Overload of Empathy', resp=op([IF(MY, [team_bonus('atk', mn(5, cnt(PSY())))], [team_bonus('def', mn(5, cnt(PSY())))]),
    pick(flt(PSY(), participating('$it')), '$v', 'Overload of Empathy: 1 damage to a participating Psychic'), dmg('$v', 1)],
    req=[(AND(IN_MISSION, ANY(PSY(), participating('$it'))), 'Only in a mission with your Psychic')]))
fx('Communal Mind', rabil=[abil('A Psychic uses this operative\'s Will', [mission_bonus('$t', mx(0, sub(C('attr', '$self', 3), C('attr', '$t', 3))))], ('respond',),
    req=[(attr_is('W'), 'Only in a Will mission')], targets=[slot(flt(PSY(), AND(participating('$it'), ne('$it', '$self'))), prompt='Which Psychic?')])])
fx('Human Antenna Array')
MCOST.append(Q(AND(eq(cnt(flt('$team', has('$it', 'psychic'))), 2), eq(g('$p', 'haaT'), 0), own('Human Antenna Array', '$p')), -9, 0))
PRE_DEFEND.append(IF(AND(eq(cnt(flt(ATK, has('$it', 'psychic'))), 2), eq(g('$me', 'haaT'), 0), own('Human Antenna Array', '$me')),
                     [SET('$me', 'haaT', 1), SET('$me', 'haaM', '$turn')]))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 1), eq(g('$e.p', 'haaM'), '$turn')), 'do': [SET('$e.p', 'haaM', 0), C('gainDom', '$e.p', 1)]})
RULE_TRIGGERS.append({'on': 'refresh', 'do': [SET('$e.p', 'haaT', 0)]})

# ---------------------------------------------------------------- 1.4 bridge cards
fx('Dr. Livia Saye, Containment Ethicist', deploy=[pick(flt(PSY(), AND(ne('$it', '$self'), eq(g('$it', 'ex'), 1))), '$v', 'Ready which Psychic? (it cannot start a mission this turn)', 0, 1),
    IF(isObj('$v'), [ready('$v'), SET('$v', 'nomis', '$turn')]), IF(eq(g('$me', 'revealedT'), 1), [loot(1)])])
fx('Psi-Restraint Harness', attach=1, bearerKw='psychic', deploy=[ready(bearerOf('$self')), SET(bearerOf('$self'), 'nomis', '$turn')])
SHIELD.append(gear_n('$o', 'Psi-Restraint Harness'))
fx('The Listening Annex, Room 4', abilities=[
    trig('peeked', [IF(ge(C('avail', '$me'), 1), [pick(flt(OPS('$opp'), eq(g('$it', 'ctl'), 0)), '$v', 'The Listening Annex: pay 1 for a Control counter?', 0, 1),
        IF(isObj('$v'), [C('spend', '$me', 1), control('$v')])])], AND(eq('$e.p', SELF_P), eq('$e.from', 'hand')), once_per_turn=True)])
SAVE.append(IF(AND(eq(g('game', 'saved'), 0), IN_MISSION, has('$o', 'psychic'),
                   ANY(HAND(ctrl('$o')), AND(isc('$it', 'A Name Spoken in Two Minds'), ge(C('avail', ctrl('$o')), C('cost', '$it', ctrl('$o')))))), [
    LET('$nm', first(flt(HAND(ctrl('$o')), isc('$it', 'A Name Spoken in Two Minds')))),
    choose(opts('Return it to hand instead', 'No'), '$sv', 'A Name Spoken in Two Minds: return your Psychic to hand instead of losing it?', who=ctrl('$o')),
    IF(eq('$sv', 'Return it to hand instead'), [C('spend', ctrl('$o'), C('cost', '$nm', ctrl('$o'))), ['move', '$nm', 'grave'], SET('game', 'saved', 1),
        pick(flt(PSY(ctrl('$o')), AND(ne('$it', '$o'), eq(g('$it', 'ex'), 0))), '$v2', 'Exhaust a different Psychic', 0, 1, who=ctrl('$o')), IF(isObj('$v2'), [exhaust('$v2')]),
        C('toHand', '$o')])]))
fx('A Name Spoken in Two Minds')
fx('Voluntary Subject Registry', abilities=[at_refresh([IF(ge(cnt(DECK('$me')), 2), [
    C('lookTop', '$me', 2), choose(['cards', '$me', 'look'], '$b', 'Voluntary Subject Registry: which of the top two goes to the bottom?'), ['move', '$b', 'deck'], C('topBack', '$me')])], ge(cnt(PSY()), 2))])
fx('Dr. Asha Bell, Group Conductor')
PRE_DEFEND.append(IF(AND(own('Dr. Asha Bell, Group Conductor', '$me'), ne(g('$me', 'abT'), '$turn'), eq(cnt(ATK), 2), ALL(ATK, has('$it', 'psychic')),
                         OR(attr_is('F'), attr_is('T')), gt(SUM(ATK, C('attr', '$it', 3)), SUM(ATK, C('attr', '$it', g('game', 'ma'))))), [
    choose(opts('Use their combined Will', 'No'), '$y', 'Dr. Asha Bell: use the two Psychics\' combined Will for this mission?'),
    IF(eq('$y', 'Use their combined Will'), [SET('$me', 'abT', '$turn'), INC('game', 'am', sub(SUM(ATK, C('attr', '$it', 3)), SUM(ATK, C('attr', '$it', g('game', 'ma')))))])]))
fx('Induced Suggestibility', mattr=3, mop=[{'label': 'Induced Suggestibility (Will mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[pick(flt(DFN, eq(g('$it', 'ctl'), 0)), '$v', 'Induced Suggestibility: Control counter on which defender?', 0, 1), control('$v'), dom(1),
         IF(eq(g('$me', 'sawT'), 1), [draw(1)])])
fx('Operation MIRROR-HEART', abilities=[on_success('subvert', [
    pick(CTL_ENEMY, '$v', 'Operation MIRROR-HEART: remove a Control counter to ready a Psychic?', 0, 1),
    IF(isObj('$v'), [SET('$v', 'ctl', 0), pick(flt(PSY(), eq(g('$it', 'ex'), 1)), '$r', 'Ready which Psychic?', 0, 1), IF(isObj('$r'), [ready('$r')]),
                     SET('$me', 'mhT', '$turn')])], once_per_turn=True)])
MCOST.append(Q(AND(eq('$k', 1), eq(g('$p', 'mhT'), '$turn')), -1, 0))
RULE_TRIGGERS.append({'on': 'missionDeclared', 'if': AND(eq('$e.kind', 1), eq(g('$e.p', 'mhT'), '$turn')), 'do': [SET('$e.p', 'mhT', 0)]})

# ---------------------------------------------------------------- Agendas
fx('The Listening World', **agenda([(ge(cnt(PSY()), 3), 'Control three Psychics'), (ge(recent('$me', 'I'), 2), 'Succeed at Infiltrate on two consecutive turns')],
    imm=[draw(2)]))
PRE_DEFEND.append(IF(AND(agenda_on('The Listening World'), attr_is('T'), ANY(ATK, has('$it', 'psychic')), ne(g('$me', 'lwT'), '$turn')),
                     [SET('$me', 'lwT', '$turn'), INC('game', 'am', 2)]))
fx('The Obedient Nation', **agenda([(ge(g('$me', 'ctlPlaced'), 2), 'Have placed two Control counters this game'),
                                     (ge(recent('$me', 'W'), 2), 'Succeed at Subvert on your two most recent turns')],
    imm=[choose(OPS('$opp'), '$xs', 'Exhaust up to two opposing operatives', 0, 2), EACH('$xs', '$x', [exhaust('$x')])]))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 1), eq('$e.kind', 3), agenda_on('The Obedient Nation', '$e.p'), ne(g('$e.p', 'onT'), '$turn')),
    'do': [SET('$e.p', 'onT', '$turn'), choose(flt(OPS(['opp', '$e.p']), eq(g('$it', 'ctl'), 0)), '$v', 'The Obedient Nation: Control counter on which operative?', 0, 1, who='$e.p'),
           IF(isObj('$v'), [SET('$v', 'ctl', 1), INC('$e.p', 'ctlPlaced', 1)])]})
fx('Project OVERMIND', **agenda([(ge(cnt(PSY()), 5), 'Control five Psychics'), (ge(g('$me', 'ctlPlaced'), 3), 'Have placed three Control counters this game'),
                                  (ge(g('$me', 'willMaxG'), 12), 'Succeed at a Will mission with an attacking total of 12 or more')],
    imm=[choose(flt(PSY(), eq(g('$it', 'ex'), 1)), '$rs', 'Ready up to three Psychics', 0, 3), EACH('$rs', '$x', [ready('$x')]),
         pick(OPS('$opp'), '$v', 'Gain control of which operative until Cleanup?', 0, 1),
         IF(isObj('$v'), [['control', '$v', '$me'], SET('$v', 'ctlT', '$turn'), emit('controlled', o='$v', p='$me')])]),
   abil=[abil('Exhaust one opposing operative (Project OVERMIND)', [exhaust('$t')], ('development', 'operations'),
              targets=[slot(flt(OPS('$opp'), eq(g('$it', 'ex'), 0)), prompt='Exhaust which operative?')])])
attr_term(Q(AND(IN_MISSION, has('$o', 'psychic'), participating('$o'), ne('$a', 3), eq('$a', g('game', 'ma')), agenda_on('Project OVERMIND', ctrl('$o'))),
            mx(0, sub(add(C('printed', '$o', 3), C('tmpA', '$o', 3)), C('printed', '$o', '$a'))), 0))
fx('The Open Circuit', **agenda([(ge(cnt(PSY()), 3), 'Control three Psychics'), (eq(g('$me', 'revealedT'), 1), 'Reveal a card from the opponent\'s hand or deck this turn'),
                                  (eq(g('$me', 'sucW'), 1), 'Succeed at Subvert this turn')],
    imm=[choose(flt(PSY(), eq(g('$it', 'ex'), 1)), '$rs', 'Ready two Psychics', 0, 2), EACH('$rs', '$x', [ready('$x')]), draw(2)]))
PRE_DEFEND.append(IF(AND(agenda_on('The Open Circuit'), attr_is('W'), ne(g('$me', 'ocT'), '$turn')), [SET('$me', 'ocT', '$turn'), SET('$me', 'ocM', '$turn'),
    LET('$ob', ['maxBy', ATK, sub(C('attr', '$it', 2), C('attr', '$it', 3))]), IF(isObj('$ob'), [INC('game', 'am', mx(0, sub(C('attr', '$ob', 2), C('attr', '$ob', 3))))])]))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 1), eq(g('$e.p', 'ocM'), '$turn')), 'do': [SET('$e.p', 'ocM', 0),
    choose(flt(OPS(['opp', '$e.p']), eq(g('$it', 'ctl'), 0)), '$v', 'The Open Circuit: Control counter on which operative?', 0, 1, who='$e.p'),
    IF(isObj('$v'), [SET('$v', 'ctl', 1), INC('$e.p', 'ctlPlaced', 1)])]})
