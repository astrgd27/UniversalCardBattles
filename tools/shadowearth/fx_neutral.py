"""Shadow Earth: Neutral cards."""
from lib import *

ENEMY_OPS = OPS('$opp')
MY_OPS = OPS('$me')
DAMAGED = lambda p: flt(OPS(p), gt(g('$it', 'dmg'), 0))
ANYOP = OPS()

# ---------------------------------------------------------------- operatives
fx('Freelance Investigator', abilities=[on_success('infiltrate', [scry(1)], attacking('$self'))])
fx('Street Informant', deploy=[peek()])
attr_term(self_term('Ex-Military Bodyguard', 'F', 2, AND(defending('$o'), eq(g('game', 'hqT'), 1))))
fx('Ex-Military Bodyguard')
fx('Courier with No Name')  # its reward option is built into the basic mission rewards
attr_term(self_term('Black-Bag Specialist', 'F', 1, AND(attacking('$o'), kind_is('strike'), typ(TGT, 'facility'))))
fx('Black-Bag Specialist')
fx('Interrogation Officer', abilities=[on_success('subvert', [peek()])])
fx('Emergency Physician', abil=[abil('Heal 1 damage (pay 1)', [heal('$t', 1)], ('development', 'operations'), cost=[C('spend', '$me', 1)],
    req=[(ge(C('avail', '$me'), 1), 'Needs 1 Influence')], targets=[slot(DAMAGED('*'), prompt='Heal which operative?')])])
fx('Communications Engineer', abilities=[at_refresh([scry(1)], gt(cnt(GEAR('$me')), 0))])
fx('Forensic Accountant', abilities=[trig('tmpGained', [tmp(1)], AND(ne('$e.p', SELF_P), ne('$phase', 'refresh')), once_per_turn=True)])
attr_term(self_term('Safehouse Custodian', 'T', 1, AND(defending('$o'), eq(g('game', 'hqT'), 1))))
fx('Safehouse Custodian')
fx('Mercenary Sniper', abilities=[on_success('strike', [
    pick(flt(OPS(['opp', SELF_P]), NOT(participating('$it'))), '$v', 'Mercenary Sniper: 1 damage to which non-participating enemy operative?', 0, 1),
    dmg('$v', 1)], attacking('$self'))])
MCOST.append(Q(AND(isObj('$t'), typ('$t', 'facility'), own('Compromised Judge', ['opp', '$p']), eq(g('$p', 'facMis'), 0)), 1, 0))
fx('Compromised Judge')
fx('Field Archaeologist', abilities=[on_played(OR(has('$e.c', 'artifact'), has('$e.c', 'scripture')), [loot(1)])])
fx('Crisis Negotiator', abilities=[trig('missionResult', [draw(1)], AND(ne('$e.p', SELF_P), eq('$e.ok', 0), eq('$e.kind', 3), defending('$self')))])
fx('Professional Cleaner', deploy=[pick(flt(ANYOP, AND(ne('$it', '$self'), gt(g('$it', 'dmg'), 0))), '$v', 'Remove all damage from which operative?', 0, 1),
    IF(isObj('$v'), [SET('$v', 'dmg', 0), SET('$v', 'nomis', '$turn')])])
cost_term(Q(eq(g('$c', 'taxT'), '$turn'), 1, 0))
fx('Intelligence Defector', deploy=[look_hand(), pick(flt(HAND('$opp'), inl(g('$it', 'type'), lit(['operation', 'response', 'mission']))), '$v',
    'Intelligence Defector: which Operation costs 1 more on their next turn?', 0, 1), IF(isObj('$v'), [SET('$v', 'taxT', add('$turn', 1))])])
SAVE.append(IF(AND(eq(g('game', 'saved'), 0), own('Unregistered Surgeon', ctrl('$o')), ge(C('avail', ctrl('$o')), 2), ne(g(ctrl('$o'), 'surgT'), '$turn')), [
    choose(opts('Save it (pay 2)', 'No'), '$sv', 'Unregistered Surgeon: prevent this elimination?', who=ctrl('$o')),
    IF(eq('$sv', 'Save it (pay 2)'), [C('spend', ctrl('$o'), 2), SET(ctrl('$o'), 'surgT', '$turn'), SET('$o', 'ex', 1),
        SET('$o', 'dmg', sub(C('dur', '$o'), 1)), SET('game', 'saved', 1), emit('saved', o='$o', by='unregistered-surgeon')])]))
fx('Unregistered Surgeon')
fx('Legendary Fixer', deploy=[pick(flt(GRAVE('$me'), AND(typ('$it', 'asset'), le(g('$it', 'cost'), 2))), '$v', 'Return which Asset (cost 2 or less) to your hand?', 0, 1),
    IF(isObj('$v'), [['move', '$v', 'hand']])])
fx('The Untraceable Asset', abilities=[on_success('any', [
    choose(opts('Draw a card', 'Heal 2', 'Gain 2 temporary Influence'), '$r', 'The Untraceable Asset: choose one'),
    IF(eq('$r', 'Draw a card'), [draw(1)]), IF(eq('$r', 'Heal 2'), [heal('$self', 2)]), IF(eq('$r', 'Gain 2 temporary Influence'), [tmp(2)])], once_per_turn=True)])
fx('The Whistleblower')
RULE_TRIGGERS.append({'on': 'eliminated', 'if': AND(eq('$e.card', slug('The Whistleblower')), gt('$e.by', 0), ne('$e.by', add(g('$e.owner', 'seat'), 1))),
                      'do': [C('gainDom', '$e.owner', 2), ['draw', '$e.owner', 1]]})
fx('Public Scapegoat', abil=[abil('Sacrifice: prevent the next 2 damage to another operative', [INC('$t', 'pv', 2), sacrifice('$self')], ('development', 'operations'),
    targets=[slot(flt(MY_OPS, ne('$it', '$self')), prompt='Protect which operative?')])],
    rabil=[abil('Sacrifice: prevent the next 2 damage to another operative', [INC('$t', 'pv', 2), sacrifice('$self')], ('respond',),
    targets=[slot(flt(MY_OPS, ne('$it', '$self')), prompt='Protect which operative?')])])
attr_term(self_term('False Flag Contractors', 'F', 2, lt(cnt(OPS(ctrl('$o'))), cnt(OPS(['opp', ctrl('$o')])))))
fx('False Flag Contractors')

# ---------------------------------------------------------------- Assets
fx('Encrypted Radio', attach=1); attr_term(bearer_term('Encrypted Radio', 'T', 1, defending('$o')))
fx('Silenced Sidearm', attach=1); attr_term(bearer_term('Silenced Sidearm', 'F', 1, kind_is('strike')))
fx('Body Armor', attach=1); SHIELD.append(gear_n('$o', 'Body Armor'))
fx('Forged Passport', attach=1); HASTE.append(AND(eq('$k', 2), gt(gear_n('$o', 'Forged Passport'), 0)))
fx('False Identity File', attach=1)
TGTDENY.append(AND(gt(gear_n('$o', 'False Identity File'), 0), ANY(OPS(ctrl('$o')), AND(ne('$it', '$o'), eq(g('$it', 'ex'), 0)))))
fx('Burner Phone Network', abilities=[on_played(typ('$e.c', 'response'), [scry(1)], once_per_turn=True)])
fx('Surveillance Van', abilities=[trig('missionDeclared', [peek()], AND(eq('$e.p', SELF_P), eq('$e.kind', 2)), once_per_turn=True)])
fx('Explosive Charges', attach=1, abilities=[trig('missionResult', [disable(TGT), sacrifice('$self')],
    AND(eq('$e.p', SELF_P), eq('$e.ok', 1), eq('$e.kind', 1), attacking(bearerOf('$self')), isObj(TGT), typ(TGT, 'facility')), optional=True,
    text='Sacrifice Explosive Charges to Disable the Facility?')])
fx('Medical Supply Cache', abilities=[at_refresh([choose(DAMAGED('$me'), '$hs', 'Medical Supply Cache: heal 1 from up to two operatives', 0, 2),
    EACH('$hs', '$h', [heal('$h', 1)])])])
fx('Encrypted Hard Drive', abilities=[trig('costDiscard', [loot(1)], eq('$e.p', SELF_P), once_per_turn=True)])
fx('Prototype Exoskeleton', attach=1); attr_term(bearer_term('Prototype Exoskeleton', 'F', 2)); attr_term(bearer_term('Prototype Exoskeleton', 'T', -1))
fx('Undercover Credentials', attach=1); attr_term(bearer_term('Undercover Credentials', 'T', 2, attacking('$o'))); attr_term(bearer_term('Undercover Credentials', 'F', -1, defending('$o')))
fx('Portable Containment Rig', attach=1)
SAVE.append(IF(AND(eq(g('game', 'saved'), 0), gt(gear_n('$o', 'Portable Containment Rig'), 0)), [
    ['move', first(flt(gearOn('$o'), isc('$it', 'Portable Containment Rig'))), 'grave'], SET('game', 'saved', 1), C('toHand', '$o')]))
fx('Experimental Stimulant', attach=1, abilities=[trig('missionResult', [ready(bearerOf('$self')), dmg(bearerOf('$self'), 2)],
    participating(bearerOf('$self')), once_per_turn=True, optional=True, text='Ready the bearer, then deal 2 damage to it?')])
fx('Unmarked Cargo Plane', abil=[abil('Fly an operative into an Infiltrate (it joins without exhausting, then returns to hand)',
    [SET('$t', 'freeJoin', '$turn'), SET('$t', 'cargo', '$turn')], ('operations',), targets=[slot(flt(MY_OPS, eq(g('$it', 'ex'), 0)), prompt='Which operative?')])])
RULE_TRIGGERS.append({'on': 'missionResult', 'if': eq('$e.kind', 2), 'do': [EACH(flt(ATK, eq(g('$it', 'cargo'), '$turn')), '$x', [C('toHand', '$x')])]})
fx('Plasma Cutter', attach=1); attr_term(bearer_term('Plasma Cutter', 'F', Q(AND(kind_is('strike'), typ(TGT, 'facility')), 3, 1)))
fx('Archive of Stolen Files', abilities=[at_refresh([IF(gt(cnt(HAND('$opp')), 0), [
    ['random', {'from': HAND('$opp'), 'as': '$r'}], emit('peeked', to=['list', '$me'], card=g('$r', 'card'), p='$me', from_='hand'), SET('$me', 'sawT', 1),
    IF(AND(inl(g('$r', 'type'), lit(['operation', 'response', 'mission'])), ge(C('avail', '$me'), 1)), [
        choose(opts('Pay 1 to draw', 'No'), '$y', 'It is an Operation: pay 1 to draw a card?'), IF(eq('$y', 'Pay 1 to draw'), [C('spend', '$me', 1), draw(1)])])])])])
fx('The Black Case', abilities=[at_refresh([choose(opts('Force', 'Tradecraft', 'Will'), '$r', 'The Black Case: your operatives get +1 to which attribute this turn?'),
    SET('$me', 'bcA', Q(eq('$r', 'Force'), 1, Q(eq('$r', 'Tradecraft'), 2, 3))), SET('$me', 'bcT', '$turn'),
    IF(ge(cnt(GEAR('$me')), 5), [draw(1)])])])
attr_term(Q(AND(eq(g(ctrl('$o'), 'bcT'), '$turn'), eq(g(ctrl('$o'), 'bcA'), '$a'), own('The Black Case', ctrl('$o'))), 1, 0))
fx("Martyr's Manifesto", deploy=[loot(1)], abilities=[trig('sacrificed', [loot(1)], eq('$e.p', SELF_P), once_per_turn=True)])

# ---------------------------------------------------------------- Responses (played in a mission's Response window)
MY = myMission(); THEIRS = theirMission()
fx('Ambush', resp=op([mission_bonus('$t', 2)], targets=[slot(flt(MY_OPS, defending('$it')), prompt='Which defender gets +2 Force?')],
    req=[(AND(THEIRS, kind_is('strike')), 'Only while defending a Strike')]))
fx('Forced Entry', resp=op([team_bonus('atk', 2)], req=[(AND(MY, attr_is('F'), typ(TGT, 'facility')), 'Only in your Force mission against a Facility')]))
fx('Inside Tip', resp=op([team_bonus('atk', 2)], req=[(AND(MY, kind_is('infiltrate')), 'Only in your Infiltrate')]))
fx('Mental Fortitude', resp=op([team_bonus('def', 2)], req=[(AND(THEIRS, kind_is('subvert')), 'Only while defending a Subvert')]))
fx('False Alarm', resp=op([choose(Q(ge(C('avail', ATTACKER), 1), opts('Pay 1', 'Cancel the mission'), opts('Cancel the mission')), '$y', 'False Alarm: pay 1 or cancel your mission?', who=ATTACKER),
    IF(eq('$y', 'Pay 1'), [C('spend', ATTACKER, 1)], [SET('game', 'mcan', 1), emit('missionCancelled', by='$me')])], req=[(THEIRS, 'Only against an opposing mission')]))
fx('Emergency Lockdown', resp=op([choose(Q(ge(C('avail', ATTACKER), 2), opts('Pay 2', 'Cancel the mission'), opts('Cancel the mission')), '$y', 'Emergency Lockdown: pay 2 or cancel your mission?', who=ATTACKER),
    IF(eq('$y', 'Pay 2'), [C('spend', ATTACKER, 2)], [SET('game', 'mcan', 1), emit('missionCancelled', by='$me')])],
    req=[(AND(THEIRS, eq(g('game', 'hqT'), 1)), 'Only against a mission targeting your Headquarters')]))
fx('Disinformation', resp=op([IF(MY, [team_bonus('def', -2)], [team_bonus('atk', -2)])], req=[(attr_is('T'), 'Only in a Tradecraft mission')]))
fx('Tactical Withdrawal', resp=op([SET('$t', 'atk', 0), SET('$t', 'dfn', 0), SET('$t', 'pv', 99)],
    targets=[slot(flt(MY_OPS, participating('$it')), prompt='Withdraw which operative?')], req=[(IN_MISSION, 'Only during a mission')]))
fx('Deep Cover', resp=op([SET('$t', 'oF', 1), SET('$t', 'oT', 6), loot(1)], targets=[slot(flt(MY_OPS, participating('$it')), prompt='Which operative goes deep?')],
    req=[(IN_MISSION, 'Only after a mission is declared')]))
# Contingency Plan: after your mission fails, you may play it (4): ready both attackers and draw; no more missions this turn
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 0), ANY(HAND('$e.p'), AND(isc('$it', 'Contingency Plan'), ge(C('avail', '$e.p'), C('cost', '$it', '$e.p'))))), 'do': [
    LET('$cp', first(flt(HAND('$e.p'), isc('$it', 'Contingency Plan')))),
    choose(opts('Play Contingency Plan', 'No'), '$y', 'Your mission failed: play Contingency Plan (ready both attackers, draw 1, no more missions this turn)?', who='$e.p'),
    IF(eq('$y', 'Play Contingency Plan'), [C('spend', '$e.p', C('cost', '$cp', '$e.p')), ['move', '$cp', 'grave'], EACH(ATK, '$x', [ready('$x')]), ['draw', '$e.p', 1],
                                           SET('$e.p', 'attMax', 0), emit('played', c='$cp', p='$e.p', card=g('$cp', 'card'), type='response')])]})
fx('Contingency Plan')
# Counterintelligence Sweep: when the opponent plays an Operation during a mission, you may play it (3) to cancel it unless they discard a card
OPSTART.append(IF(AND(IN_MISSION, ANY(HAND('$opp'), AND(isc('$it', 'Counterintelligence Sweep'), ge(C('avail', '$opp'), C('cost', '$it', '$opp'))))), [
    LET('$cs', first(flt(HAND('$opp'), isc('$it', 'Counterintelligence Sweep')))),
    choose(opts('Play Counterintelligence Sweep', 'No'), '$y', 'The opponent played an Operation: play Counterintelligence Sweep to cancel it unless they discard a card?', who='$opp'),
    IF(eq('$y', 'Play Counterintelligence Sweep'), [C('spend', '$opp', C('cost', '$cs', '$opp')), ['move', '$cs', 'grave'],
        choose(Q(gt(cnt(HAND('$me')), 0), opts('Discard a card', 'Let it be cancelled'), opts('Let it be cancelled')), '$z', 'Counterintelligence Sweep: discard a card or your Operation is cancelled'),
        IF(eq('$z', 'Discard a card'), [C('discardN', '$me', 1), emit('costDiscard', p='$me')], [SET('game', 'ocan', 1), emit('cancelled', card=g('$c2', 'card'))])])]))
fx('Counterintelligence Sweep')

# ---------------------------------------------------------------- Operations
fx('Quiet Extraction', op=op([bounce('$t')], targets=[slot(flt(MY_OPS, AND(gt(g('$it', 'dmg'), 0), eq(g('$it', 'owner'), '$me'))), prompt='Return which damaged operative?')]))
fx('Routine Surveillance', op=op([scry(3), loot(1)]))
fx('Covert Transfer', op=op([choose(flt(OPS('$me'), AND(ne('$it', bearerOf('$t')), C('bearerOk', '$t', '$it'))), '$b', 'Move it to which operative?'),
    ['unlink', '$t', 'bearer'], ['link', '$t', 'bearer', '$b'], IF(le(g('$b', 'cost'), 2), [ready('$b')])],
    targets=[slot(flt(GEAR('$me'), isObj(bearerOf('$it'))), prompt='Move which attached Asset?')]))
fx('Extraction Team', op=op([['move', '$t', 'hand']], targets=[slot(flt(GRAVE('$me'), AND(typ('$it', 'operative'), le(g('$it', 'cost'), 3))), prompt='Return which operative?')]))
fx('The Perfect Cover-Up', op=op([choose(flt(['concat', PERMS('$opp'), ['cards', '$opp', 'agenda']], OR(gt(g('$it', 'ctl'), 0), gt(g('$it', 'prog'), 0))), '$xs',
                                         'Remove a counter from up to three opposing cards', 0, 3),
    EACH('$xs', '$x', [IF(gt(g('$x', 'prog'), 0), [INC('$x', 'prog', -1)], [SET('$x', 'ctl', 0)])]), draw(2)]))
fx('Backroom Bargain', op=op([choose(HAND('$me'), '$ds', 'Discard up to two cards (2 temporary Influence each)', 0, 2), LET('$n', cnt('$ds')),
    ['move', '$ds', 'grave'], IF(gt('$n', 0), [emit('costDiscard', p='$me')]), tmp(mul(2, '$n'))]))
fx('Risky Funding', op=op([tmp(4), SET('$me', 'riskyT', '$turn')]))
RULE_TRIGGERS.append({'on': 'cleanup', 'if': eq(g('$e.p', 'riskyT'), '$turn'), 'do': [
    choose(Q(ge(cnt(HAND('$e.p')), 2), opts('Discard two cards', 'Lose 2 Dominance'), opts('Lose 2 Dominance')), '$y', 'Risky Funding comes due', who='$e.p'),
    IF(eq('$y', 'Discard two cards'), [C('discardN', '$e.p', 2)], [C('loseDom', '$e.p', 2)])]})
fx('Open Recruitment Drive', op=op([token('tok-recruit', 2), EACH(flt(OPS('$me'), AND(isc('$it', 'Recruit'), eq(g('$it', 'newT'), '$turn'))), '$x', [SET('$x', 'upkeep', 1)])]))
fx('Counter-Cabal Alliance', op=op([choose(opts('Force', 'Tradecraft', 'Will'), '$r', 'Counter-Cabal Alliance: your mission teams get +3 in which attribute this turn?'),
    SET('$me', 'ccA', Q(eq('$r', 'Force'), 1, Q(eq('$r', 'Tradecraft'), 2, 3))), SET('$me', 'ccT', '$turn'), SET('$me', 'domMax', mx(2, g('$me', 'domT')))]))
PRE_DEFEND.append(IF(AND(eq(g('$me', 'ccT'), '$turn'), eq(g('$me', 'ccA'), g('game', 'ma'))), [INC('game', 'am', 3)]))
fx('Scorched Earth Protocol', op=op([choose(facs('$me'), '$a', 'Destroy which of your Facilities?'), LET('$lim', add(g('$a', 'cost'), 2)), C('gone', '$a'),
    choose(flt(facs('$opp'), le(g('$it', 'cost'), '$lim')), '$b', 'Destroy which opposing Facility?', 0, 1), IF(isObj('$b'), [C('gone', '$b')])],
    req=[(AND(gt(cnt(facs('$me')), 0), gt(cnt(facs('$opp')), 0)), 'Needs a Facility on each side')]), tFac=1)

# ---------------------------------------------------------------- Mission Operations ($t = the declared target; succ runs on success)
HQ_ONLY = [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]
fx('Interrogation', mattr=3, mop=[{'label': 'Interrogation (Will mission)', 'targets': HQ_ONLY}],
   succ=[look_hand(), pick(HAND('$opp'), '$v', 'Interrogation: which card do they discard?', 0, 1), IF(isObj('$v'), [['move', '$v', 'grave']])])
fx('Smash and Grab', mattr=1, mop=[{'label': 'Smash and Grab (Force mission)', 'targets': [slot(['concat', ['list', '$opp'], assets('$opp')], prompt='Target: an opposing Asset or the Headquarters')]}],
   succ=[LET('$t', TGT), IF(isObj('$t'), [choose(opts('Return the Asset', '1 Dominance'), '$r', 'Smash and Grab: choose one'),
                                          IF(eq('$r', '1 Dominance'), [dom(1)], [bounce('$t')])], [dom(1)])])
fx('Sabotage', mattr=2, mop=[{'label': 'Sabotage (Tradecraft mission)', 'targets': [slot(['concat', ['list', '$opp'], facs('$opp')], prompt='Target: an opposing Facility (or the Headquarters)')]}],
   succ=[LET('$t', Q(isObj(TGT), TGT, first(facs('$opp')))), IF(isObj(TGT), [disable(TGT)], [pick(facs('$opp'), '$f', 'Sabotage: Disable which Facility?', 0, 1), disable('$f')]), dom(1)])
fx('Planted Evidence', mattr=2, mop=[{'label': 'Planted Evidence (Tradecraft mission)', 'targets': HQ_ONLY}], succ=[C('discardN', '$opp', 2)])
fx('Coordinated Raid', mattr=1, mop=[{'label': 'Coordinated Raid (Force mission)', 'targets': HQ_ONLY}],
   succ=[choose(facs('$opp'), '$fs', 'Coordinated Raid: Disable two different opposing Facilities', 0, 2), EACH('$fs', '$f', [disable('$f')]), dom(1)])

# ---------------------------------------------------------------- Facilities
fx('Safehouse', abil=[abil('Prevent 1 damage to an operative (pay 1)', [INC('$t', 'pv', 1)], ('development', 'operations'), cost=[C('spend', '$me', 1)],
    req=[(ge(C('avail', '$me'), 1), 'Needs 1 Influence')], targets=[slot(MY_OPS, prompt='Protect which operative?')])],
    rabil=[abil('Prevent 1 damage to an operative (pay 1)', [INC('$t', 'pv', 1)], ('respond',), cost=[C('spend', '$me', 1)],
    req=[(ge(C('avail', '$me'), 1), 'Needs 1 Influence')], targets=[slot(MY_OPS, prompt='Protect which operative?')])])
fx('Shell Corporation', abilities=[at_refresh([tmp(1)], ge(cnt(facs('$me')), 2))])
fx('Westgate Data Brokerage Office', abilities=[on_success('infiltrate', [scry(1)], once_per_turn=True)])
fx('Private Clinic', abilities=[at_refresh([pick(DAMAGED('$me'), '$h', 'Private Clinic: heal 1 from which operative?', 0, 1), heal('$h', 1)])])
fx('Secure Archive')
TGTDENY.append(AND(typ('$o', 'asset'), own('Secure Archive', ctrl('$o')), ANY(OPS(ctrl('$o')), AND(eq(g('$it', 'ex'), 0), ge(C('attr', '$it', 2), 3)))))
fx('The Luxembourg Regional Office', abilities=[at_refresh([tmp(Q(eq(g('$me', 'lastMiss'), 0), 2, 1))])])
fx('The Halden Street Laboratory', abilities=[trig('deployed', [scry(2)], AND(eq('$e.p', SELF_P), eq('$e.type', 'operative'), ge(g('$e.c', 'cost'), 4)), once_per_turn=True)])
fx('Arms Depot', abilities=[on_success('strike', [loot(1)], once_per_turn=True)])
fx('Encrypted Server Farm', abilities=[on_played(typ('$e.c', 'response'), [tmp(1)], le(g('$me', 'pl_response'), 2))])
fx('Emergency Bunker')
sec_term(Q(AND(own('Emergency Bunker', '$p'), kind_is('strike')), 2, 0))
SHIELD.append(Q(AND(defending('$o'), typ(TGT, 'facility'), own('Emergency Bunker', ctrl('$o'))), 1, 0))
fx('The Lydian Auction House', abil=[abil('Discard an Asset: draw two, then discard one', [['move', '$t', 'grave'], emit('costDiscard', p='$me'), draw(2), C('discardN', '$me', 1)],
    ('development', 'operations'), targets=[slot(flt(HAND('$me'), typ('$it', 'asset')), prompt='Discard which Asset?')])])
fx('Offshore Research Platform', abilities=[at_refresh([scry(1)])])
cost_term(Q(AND(typ('$c', 'asset'), ge(g('$c', 'cost'), 4), eq(g('$p', 'bigAssetT'), 0), own('Offshore Research Platform', '$p')), -1, 0))
fx('Crown & Vale Legal Offices')
OPSTART.append(IF(AND(eq(g('$c2', 'tFac'), 1), own('Crown & Vale Legal Offices', '$opp'), ne(g('$opp', 'cvT'), '$turn')), [SET('$opp', 'cvT', '$turn'),
    choose(Q(ge(C('avail', '$me'), 2), opts('Pay 2', 'Let it be cancelled'), opts('x')), '$y', 'Crown & Vale Legal Offices: pay 2 more or your Operation is cancelled'),
    IF(eq('$y', 'Pay 2'), [C('spend', '$me', 2)], [SET('game', 'ocan', 1), emit('cancelled', card=g('$c2', 'card'))])]))
fx('Private Intelligence Firm', abilities=[on_success('infiltrate', [draw(1)], once_per_turn=True)])
fx('The Third-Rail Arms Bazaar')
RULE_TRIGGERS.append({'on': 'eliminated', 'if': AND(own('The Third-Rail Arms Bazaar', '$e.ctrl'), ne(g('$e.ctrl', 'bazT'), '$turn')),
                      'do': [SET('$e.ctrl', 'bazT', '$turn'), ['draw', '$e.ctrl', 1], C('gainTmp', '$e.ctrl', 1)]})
fx('Disaster Recovery Trust', abilities=[trig('disabled', [draw(1)], AND(eq('$e.p', SELF_P), ne('$e.o', '$self')), once_per_turn=True)])
fx('The Hidden Treasury', abilities=[at_refresh([tmp(3)])])

# ---------------------------------------------------------------- Projects
sec_term(Q(AND(own('St. Louis Police Liaison Desk', '$p'), kind_is('strike')), 1, 0))
fx('St. Louis Police Liaison Desk')
fx('The Anonymous Donor Network', abilities=[at_refresh([tmp(1)], ge(cnt(OPS('$me')), 3))])
fx('Global Shipping Network', abilities=[at_refresh([tmp(1)]),
    trig('deployed', [SET('$e.c', 'hasteT', '$turn')], AND(eq('$e.p', SELF_P), eq('$e.type', 'operative'), eq(g('$me', 'pl_operative'), 1)))])
fx('Citizen Intercept Clearinghouse', abilities=[trig('lookedHand', [loot(1)], eq('$e.p', SELF_P), once_per_turn=True),
                                                 trig('peeked', [loot(1)], AND(eq('$e.p', SELF_P), eq('$e.from', 'hand')), once_per_turn=True)])
fx('Operation LONG VIEW', abilities=[at_refresh([IF(lt(g('$self', 'prog'), 3), [INC('$self', 'prog', 1)])])],
   abil=[abil('Remove three Plot counters: draw two and gain 1 Dominance', [INC('$self', 'prog', -3), draw(2), dom(1)], ('development', 'operations'),
              req=[(ge(g('$self', 'prog'), 3), 'Needs three Plot counters')])])
fx('The Untraceable Funding Protocol')
MCOST.append(Q(AND(le('$k', 3), eq(g('$p', 'basicT'), 0), own('The Untraceable Funding Protocol', '$p')), -1, 0))
sec_term(Q(own('The Untraceable Funding Protocol', '$p'), -1, 0))
fx('Memetic Contagion Program', abilities=[on_success('subvert', [SET('$opp', 'memeT', '$turn')], once_per_turn=True)])
attr_term(Q(AND(A_('W'), eq(g(ctrl('$o'), 'memeT'), '$turn')), -1, 0))
fx('Contingency Insurance Pact')
SAVE.append(IF(AND(eq(g('game', 'saved'), 0), own('Contingency Insurance Pact', ctrl('$o')), ge(C('avail', ctrl('$o')), 2), ne(g(ctrl('$o'), 'cipT'), '$turn')), [
    choose(opts('Prevent it (pay 2, exhaust it)', 'No'), '$sv', 'Contingency Insurance Pact: prevent this elimination?', who=ctrl('$o')),
    IF(eq('$sv', 'Prevent it (pay 2, exhaust it)'), [C('spend', ctrl('$o'), 2), SET(ctrl('$o'), 'cipT', '$turn'), SET('$o', 'ex', 1),
        SET('$o', 'dmg', sub(C('dur', '$o'), 1)), SET('game', 'saved', 1), emit('saved', o='$o', by='contingency-insurance-pact')])]))
fx('Alias Renewal Program', abil=[abil('Discard an operative card: an operative gets +3 Tradecraft until Cleanup',
    [['move', '$d', 'grave'], emit('costDiscard', p='$me'), until_cleanup('$t', 'T', 3)], ('development', 'operations'),
    targets=[slot(flt(HAND('$me'), typ('$it', 'operative')), '$d', 'Discard which operative card?'), slot(MY_OPS, prompt='Which operative gets +3 Tradecraft?')])])
fx('Shadow Procurement Office', abil=[abil('Play an Asset (cost 2 or less) from your discard pile for its cost + 1',
    [C('spend', '$me', add(g('$t', 'cost'), 1)), ['move', '$t', 'gear', {'as': '$c'}], SET('$c', 'exileOnLeave', 1),
     IF(eq(g('$c', 'attach'), 1), [choose(flt(OPS('$me'), C('bearerOk', '$c', '$it')), '$b', 'Attach to which operative?'), ['link', '$c', 'bearer', '$b']]),
     C('played', '$c', '$me'), IF(eq(g('$c', 'hasDeploy'), 1), [['run', '$c', 'deploy']])], ('development',),
    targets=[slot(flt(GRAVE('$me'), AND(typ('$it', 'asset'), le(g('$it', 'cost'), 2), eq(g('$it', 'ready'), 1), ge(C('avail', '$me'), add(g('$it', 'cost'), 1)),
                                       OR(ne(g('$it', 'attach'), 1), C('canAttachAny', '$it', '$me')))), prompt='Play which Asset?')])])
fx('The Other Side of the Table', deploy=[loot(1)], rabil=[abil('Pay 2: assign one more defender', [SET('$t', 'dfn', 1), SET('$t', 'ex', 1)], ('respond',),
    cost=[C('spend', '$me', 2)], req=[(AND(THEIRS, lt(cnt(DFN), 2), ge(C('avail', '$me'), 2)), 'Only while defending with fewer than two defenders')],
    targets=[slot(flt(MY_OPS, AND(eq(g('$it', 'ex'), 0), NOT(defending('$it')))), prompt='Which ready operative joins the defense?')])])

# ---------------------------------------------------------------- the trickier Neutral cards
fx('The Frankfurt Tip Network', abilities=[trig('moved', [tmp(1)], AND(eq('$e.from', 'deck'), eq('$e.to', 'hand'), ne('$e.toPlayer', SELF_P),
    NOT(inl('$phase', lit(['refresh', 'draw']))), C('active', '$self')), once_per_turn=True)])
fx('Improvised Scrambler')
OPSTART.append(IF(AND(IN_MISSION, typ('$c2', 'response'), own('Improvised Scrambler', '$opp'), ANY(OPS('$opp'), participating('$it')), ne(g('$opp', 'scrT'), '$turn')), [
    SET('$opp', 'scrT', '$turn'), *taxed('$me', 1, 'Let it be cancelled'), IF(ne('$y', 'Pay 1'), [SET('game', 'ocan', 1), emit('cancelled', card=g('$c2', 'card'))])]))
fx('Portable Null Field')
USEHOOK_ANY.append(IF(AND(IN_MISSION, own('Portable Null Field', '$opp'), ge(C('avail', '$opp'), 2), ne(g('$opp', 'pnfT'), '$turn')), [
    choose(opts('Pay 2 to cancel it', 'No'), '$w', 'Portable Null Field: cancel this ability?', who='$opp'),
    IF(eq('$w', 'Pay 2 to cancel it'), [SET('$opp', 'pnfT', '$turn'), C('spend', '$opp', 2), SET('game', 'ucan', 1), emit('cancelled', card=g('$self', 'card'))])]))
fx('Rogue Systems Architect', abil=[abil('Ready a Facility (activating it again this turn costs 2 more)', [ready('$t'), SET('$t', 'rsaT', '$turn')], ('development', 'operations'),
    targets=[slot(flt(facs('$me'), gt(cnt(['def', '$it', 'abil']), 0)), prompt='Ready which Facility?')])])
USEHOOK.append(IF(eq(g('$self', 'rsaT'), '$turn'), [*taxed('$me', 2, 'Let the activation fizzle'), IF(ne('$y', 'Pay 2'), [SET('game', 'ucan', 1)])]))
fx('A Favor Called In', op=[{'label': 'A Favor Called In', 'phases': ['operations'], 'do': [
    choose(flt(OPS('$me'), eq(g('$it', 'ex'), 1)), '$rs', 'Ready up to three operatives', 0, 3), EACH('$rs', '$x', [ready('$x')]), draw(2),
    SET('$me', 'attMax', mn(3, add(g('$me', 'attMax'), 1)))]}])
