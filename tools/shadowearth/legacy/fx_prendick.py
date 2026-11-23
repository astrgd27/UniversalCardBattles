"""Shadow Earth: Prendick Holdings (Specimens, Adaptations, Scientists, corporate biotech)."""
from lib import *

SPEC = lambda p='$me': flt(OPS(p), has('$it', 'specimen'))
SCI = lambda p='$me': flt(OPS(p), has('$it', 'scientist'))
ADAPTS = lambda p='$me': flt(GEAR(p), has('$it', 'adaptation'))
MY = myMission(); THEIRS = theirMission()
def adapt_n(o): return cnt(flt(gearOn(o), has('$it', 'adaptation')))

fx('Prendick Holdings Headquarters', abilities=[trig('attached', [heal('$e.o', 1)],
    AND(eq('$e.p', SELF_P), has('$e.a', 'adaptation'), ne('$e.transfer', 1)), once_per_turn=True)])

# ---------------------------------------------------------------- Chimera Assault
attr_term(self_term('Security Hound-9', 'F', 1, AND(defending('$o'), typ(TGT, 'facility'))))
fx('Security Hound-9')
fx('Razorback Hybrid', abilities=[on_success('strike', [dmg('$self', 1)], attacking('$self'))])
fx('Specimen Transport', attach=1, bearerKw='specimen', deploy=[SET(bearerOf('$self'), 'hasteT', '$turn')])
attr_term(bearer_term('Specimen Transport', 'F', 1))
DISCARD_SHIELD = lambda name, n: abil(f'Discard {name}: prevent the next {n} damage to the attached Specimen', [INC(bearerOf('$self'), 'pv', n), ['move', '$self', 'grave']],
                                      ('development', 'operations'), once=False)
DISCARD_SHIELD_R = lambda name, n: abil(f'Discard {name}: prevent the next {n} damage to the attached Specimen', [INC(bearerOf('$self'), 'pv', n), ['move', '$self', 'grave']],
                                        ('respond',), once=False)
fx('Anatomical Reinforcement', attach=1, bearerKw='specimen', deploy=[until_cleanup(bearerOf('$self'), 'F', 2)],
   abil=[DISCARD_SHIELD('Anatomical Reinforcement', 3)], rabil=[DISCARD_SHIELD_R('Anatomical Reinforcement', 3)])
attr_term(bearer_term('Anatomical Reinforcement', 'F', 1)); attr_term(bearer_term('Anatomical Reinforcement', 'T', -1))
attr_term(self_term('Alpha Predator', 'F', 2, AND(attacking('$o'), gt(cnt(OPS(['opp', ctrl('$o')])), cnt(OPS(ctrl('$o')))))))
fx('Alpha Predator')
fx('Break Containment', resp=op([mission_bonus('$t', 3), INC('$t', 'hurtAfter', 2)],
    targets=[slot(flt(SPEC(), attacking('$it')), prompt='Which attacking Specimen breaks containment?')], req=[(AND(MY, attr_is('F')), 'Only in your Force mission')]))
fx('The Feeding Pens', abilities=[trig('eliminated', [pick(flt(SPEC(), eq(g('$it', 'ex'), 1)), '$v', 'The Feeding Pens: ready which Specimen?', 0, 1), IF(isObj('$v'), [ready('$v')])],
    AND(kind_is('strike'), eq(ATTACKER, SELF_P), ne('$e.ctrl', SELF_P), C('active', '$self')), once_per_turn=True)])
fx('Prototype Behemoth')
cost_term(Q(AND(isc('$c', 'Prototype Behemoth'), ge(cnt(ADAPTS('$p')), 2)), -2, 0))
fx('Human-Passing Duplicate', abilities=[on_success('infiltrate', [draw(1)], attacking('$self'), once_per_turn=True)])
fx('Perfect Skin Graft', attach=1, bearerKw='specimen', deploy=[SET(bearerOf('$self'), 'covT', '$turn')])
COVERT.append(AND(eq(g('$o', 'covT'), '$turn'), kind_is('infiltrate')))
attr_term(bearer_term('Perfect Skin Graft', 'T', 2)); attr_term(bearer_term('Perfect Skin Graft', 'F', -1))
fx('Mimicry Specialist')
TGTDENY.append(AND(isc('$o', 'Mimicry Specialist'), eq('$k', 1), ANY(OPS(ctrl('$o')), ne('$it', '$o'))))
fx('False Credentials', resp=op([mission_bonus('$t', 2), team_bonus('def', -1)],
    targets=[slot(flt(SPEC(), attacking('$it')), prompt='Which attacking Specimen?')], req=[(AND(MY, attr_is('T')), 'Only in your Tradecraft mission')]))
fx('Replacement Protocol', mattr=2, mop=[{'label': 'Replacement Protocol (Tradecraft mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[pick(OPS('$opp'), '$v', 'Replacement Protocol: which enemy operative is replaced?', 0, 1),
         IF(isObj('$v'), [SET('$v', 'nodef', add('$turn', 1)), SET('$v', 'noab', add('$turn', 1))]), dom(1)])

# ---------------------------------------------------------------- Sleeper Organisms
fx('The S-19 Lineage Fabrication', abilities=[dict(on_success('infiltrate', [scry(1)]), limit={'per': 'turn', 'by': 'source', 'n': 2})])
fx('Infiltrator Brood', abilities=[on_success('infiltrate', [token('tok-hybrid', 1, ready_=True)], once_per_turn=True)])
fx('The Cabinet of Doubles', abilities=[on_success('infiltrate', [pick(flt(OPS('$opp'), eq(g('$it', 'ex'), 0)), '$v', 'The Cabinet of Doubles: exhaust which enemy?', 0, 1),
    IF(isObj('$v'), [exhaust('$v')]), SET('$me', 'cbT', '$turn')], once_per_turn=True)])
PRE_DEFEND.append(IF(AND(eq(g('$me', 'cbT'), '$turn'), kind_is('infiltrate')), [SET('$me', 'cbT', 0), INC('game', 'am', 2)]))
fx('Lab-Born Vertebrate', abilities=[trig('attached', [loot(1)], AND(eq('$e.o', '$self'), has('$e.a', 'adaptation')), once_per_turn=True)])
fx('Hypermetabolic Serum', attach=1, bearerKw='specimen', abil=[abil('Pay 2: ready the attached Specimen', [ready(bearerOf('$self'))], ('development', 'operations'),
    cost=[C('spend', '$me', 2)], req=[(AND(ge(C('avail', '$me'), 2), eq(g(bearerOf('$self'), 'ex'), 1)), 'The Specimen must be exhausted and you need 2 Influence')])])
attr_term(bearer_term('Hypermetabolic Serum', 'F', 1))
fx('Random Splice', op=op([C('lookTop', '$me', 3), choose(flt(['cards', '$me', 'look'], has('$it', 'adaptation')), '$v', 'Random Splice: take which Adaptation?', 0, 1),
    IF(isObj('$v'), [['move', '$v', 'hand']]), C('lookBottom', '$me')]))

# ---------------------------------------------------------------- Rapid Evolution
fx('Mutation Handler')
cost_term(Q(AND(has('$c', 'adaptation'), eq(g('$p', 'pl_adaptation'), 0), own('Mutation Handler', '$p')), -1, 0))
fx('Unstable Polymorph', attach=1, bearerKw='specimen', abilities=[at_refresh([
    choose(opts('Force', 'Tradecraft', 'Will'), '$r', 'Unstable Polymorph: +2 to which attribute until your next Refresh?'),
    LET('$na', Q(eq('$r', 'Force'), 1, Q(eq('$r', 'Tradecraft'), 2, 3))),
    IF(AND(gt(g('$self', 'upA'), 0), ne(g('$self', 'upA'), '$na')), [dmg(bearerOf('$self'), 1)]), SET('$self', 'upA', '$na')])])
attr_term(SUM(flt(gearOn('$o'), isc('$it', 'Unstable Polymorph')), Q(eq(g('$it', 'upA'), '$a'), 2, 0)))
fx('Accelerated Metamorphosis', op=op([choose(flt(gearOn('$s'), has('$it', 'adaptation')), '$as', 'Move up to two Adaptations', 1, 2),
    EACH('$as', '$x', [['unlink', '$x', 'bearer'], ['link', '$x', 'bearer', '$r']]), ready('$r')],
    targets=[slot(flt(SPEC(), gt(adapt_n('$it'), 0)), '$s', 'From which Specimen?'), slot(SPEC(), '$r', 'To which Specimen?')]))
attr_term(Q(isc('$o', 'Recombinant Apex'), mn(3, adapt_n('$o')), 0))
fx('Recombinant Apex')
fx('Evolutionary Cascade Study', abil=[abil('Play an Adaptation from your discard pile (cost + 1)',
    [C('spend', '$me', add(C('cost', '$t', '$me'), 1)), SET('$me', 'adGraveT', '$turn'), ['move', '$t', 'gear', {'as': '$c'}], SET('$c', 'exileOnLeave', 1),
     choose(flt(OPS('$me'), C('bearerOk', '$c', '$it')), '$b', 'Attach to which Specimen?'), ['link', '$c', 'bearer', '$b'], emit('attached', a='$c', o='$b', p='$me'),
     C('played', '$c', '$me'), IF(eq(g('$c', 'hasDeploy'), 1), [['run', '$c', 'deploy']])], ('development',),
    req=[(ne(g('$me', 'adGraveT'), '$turn'), 'Only one Adaptation from a discard pile each turn')],
    targets=[slot(flt(GRAVE('$me'), AND(has('$it', 'adaptation'), eq(g('$it', 'ready'), 1), ge(C('avail', '$me'), add(C('cost', '$it', '$me'), 1)),
                                       C('canAttachAny', '$it', '$me'))), prompt='Play which Adaptation?')])])
cost_term(Q(AND(has('$c', 'adaptation'), eq(g('$p', 'pl_adaptation'), 0), own('Evolutionary Cascade Study', '$p')), -1, 0))

# ---------------------------------------------------------------- Corporate Biotech
fx('Clinical Research Liaison', deploy=[tmpc(1)])
fx('Molecular Patent Examiner', abilities=[on_played(typ('$e.c', 'facility'), [tmp(1)], eq(g('$me', 'pl_facility'), 1))])
fx('Prendick Biomedicine Annex 14', abilities=[at_refresh([tmp(1)], gt(cnt(SCI()), 0))])
fx('Quarterly Earnings', op=op([draw(1), IF(ge(cnt(facs('$me')), 2), [loot(1)])]))
fx('The Night-Shift Clinical Trials', abil=[
    abil('Exhaust a Scientist: place a Research counter', [exhaust('$t'), SET('$self', 'prog', mn(3, add(g('$self', 'prog'), 1)))], ('development',),
         targets=[slot(flt(SCI(), eq(g('$it', 'ex'), 0)), prompt='Exhaust which Scientist?')]),
    abil('Remove three Research counters: draw two', [INC('$self', 'prog', -3), draw(2)], ('development',), req=[(ge(g('$self', 'prog'), 3), 'Needs three Research counters')])])
fx('Venture Consortium', abilities=[on_success('any', [tmpc(2)], once_per_turn=True)])
fx('Chief Development Officer')
cost_term(Q(AND(typ('$c', 'facility'), ge(g('$c', 'cost'), 4), own('Chief Development Officer', '$p')), -1, 0))
attr_term(Q(AND(A_('T'), has('$o', 'scientist'), own('Chief Development Officer', ctrl('$o'))), 1, 0))
fx('Prendick Holdings: Asset Acquisition Fund', abilities=[at_refresh([tmp(2), IF(ge(cnt(facs('$me')), 3), [draw(1)])])])

# ---------------------------------------------------------------- 1.4 bridge cards
fx('Veterinary Surgical Team', deploy=[pick(flt(SPEC(), gt(g('$it', 'dmg'), 0)), '$v', 'Remove 1 damage from which Specimen?', 0, 1), heal('$v', 1)],
   abilities=[trig('attached', [loot(1)], AND(eq('$e.p', SELF_P), has('$e.a', 'adaptation'), ne('$e.transfer', 1)), once_per_turn=True)])
fx('Implantable Adrenal Reservoir', attach=1, bearerKw='specimen', deploy=[until_cleanup(bearerOf('$self'), 'F', 1)],
   abil=[DISCARD_SHIELD('Implantable Adrenal Reservoir', 2)], rabil=[DISCARD_SHIELD_R('Implantable Adrenal Reservoir', 2)])
STRIKE_EXTRA.append(cnt(flt(ATK, AND(gt(gear_n('$it', 'Implantable Adrenal Reservoir'), 0), ne(g('$it', 'iarT'), '$turn')))))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 1), eq('$e.kind', 1)), 'do': [EACH(flt(ATK, gt(gear_n('$it', 'Implantable Adrenal Reservoir'), 0)), '$x', [SET('$x', 'iarT', '$turn')])]})
fx('The Glass Nursery, Ward 8', abilities=[at_refresh([token(Q(ge(cnt(ADAPTS()), 2), 'tok-specimen-2', 'tok-specimen'), 1)], gt(cnt(SCI()), 0))])
fx('Field Necropsy Report 11-B', op=op([['move', '$t', 'hand'], C('discardN', '$me', 1), IF(gt(cnt(SCI()), 0), [tmp(1)])],
    targets=[slot(flt(GRAVE('$me'), has('$it', 'specimen')), prompt='Return which Specimen?')]))
fx('Predictive Gene Sequencing', abilities=[trig('attached', [IF(gt(cnt(DECK('$me')), 0), [
    C('lookTop', '$me', 2), choose(['cards', '$me', 'look'], '$v', 'Predictive Gene Sequencing: put one into your hand (the other goes to the bottom)'), ['move', '$v', 'hand'],
    C('lookBottom', '$me'), C('discardN', '$me', 1)])], AND(eq('$e.p', SELF_P), has('$e.a', 'adaptation')), once_per_turn=True)])
fx('Specimen R-41, The Latchkey')
INFIL_OPTS.append(('Pay 1: Disable a Facility instead (R-41)', AND(ANY(ATK, isc('$it', 'Specimen R-41, The Latchkey')), ge(C('avail', '$me'), 1), gt(cnt(facs('$opp')), 0)),
    [C('spend', '$me', 1), choose(facs('$opp'), '$f', 'Disable which Facility?'), disable('$f'),
     IF(ANY(ATK, AND(isc('$it', 'Specimen R-41, The Latchkey'), gt(adapt_n('$it'), 0))), [dom(1)])]))
fx('Contaminated Lab Credentials', attach=1, deploy=[peek_top()])
attr_term(bearer_term('Contaminated Lab Credentials', 'T', 1))
COVERT.append(AND(has('$o', 'specimen'), gt(gear_n('$o', 'Contaminated Lab Credentials'), 0), kind_is('infiltrate')))
fx('Unscheduled Molting', resp=op([choose(flt(gearOn('$t'), has('$it', 'adaptation')), '$ad', 'Return which Adaptation to your hand?'), ['move', '$ad', 'hand'],
    mission_bonus('$t', 3), SET('$t', 'pv', 99)],
    targets=[slot(flt(SPEC(), AND(participating('$it'), gt(adapt_n('$it'), 0))), prompt='Which Specimen molts?')], req=[(IN_MISSION, 'Only during a mission')]))

# ---------------------------------------------------------------- Agendas
fx('Genome Patent Monopoly', **agenda([(ge(cnt(facs('$me')), 2), 'Control two Facilities'),
                                        (ge(cnt(flt(SPEC(), gt(adapt_n('$it'), 0))), 2), 'Control two Specimens with Adaptations')], imm=[draw(2)]))
cost_term(Q(AND(has('$c', 'specimen'), typ('$c', 'operative'), eq(g('$p', 'pl_specimen'), 0), agenda_on('Genome Patent Monopoly', '$p')), -1, 0))
fx('Project CHIMERA', **agenda([(ge(cnt(['distinct', ['map', ADAPTS(), g('$it', 'card')]]), 3), 'Control three Adaptations with different names'),
                                 (ge(recent('$me', 'S'), 2), 'Succeed at Strike on your two most recent turns')],
    imm=[C('lookTop', '$me', 99), choose(flt(['cards', '$me', 'look'], AND(has('$it', 'specimen'), typ('$it', 'operative'), le(g('$it', 'cost'), 5))), '$v', 'Project CHIMERA: put which Specimen into play?', 0, 1),
         IF(isObj('$v'), [['move', '$v', 'ops', {'as': '$n'}], SET('$n', 'ex', 1), SET('$n', 'newT', '$turn')]), C('lookBottom', '$me'), ['shuffle', '$me', 'deck']]),
   abil=[abil('Play an Adaptation from your discard pile (Project CHIMERA)',
    [C('spend', '$me', C('cost', '$t', '$me')), SET('$me', 'adGraveT', '$turn'), ['move', '$t', 'gear', {'as': '$c'}], SET('$c', 'exileOnLeave', 1),
     choose(flt(OPS('$me'), C('bearerOk', '$c', '$it')), '$b', 'Attach to which Specimen?'), ['link', '$c', 'bearer', '$b'], emit('attached', a='$c', o='$b', p='$me'),
     C('played', '$c', '$me'), IF(eq(g('$c', 'hasDeploy'), 1), [['run', '$c', 'deploy']])], ('development',),
    req=[(ne(g('$me', 'adGraveT'), '$turn'), 'Only one Adaptation from a discard pile each turn')],
    targets=[slot(flt(GRAVE('$me'), AND(has('$it', 'adaptation'), eq(g('$it', 'ready'), 1), C('canPay', '$it', '$me'), C('canAttachAny', '$it', '$me'))), prompt='Play which Adaptation?')])])
PERFECT_OK = AND(has('$it', 'specimen'), ge(cnt(['distinct', ['map', flt(gearOn('$it'), has('$it', 'adaptation')), g('$it', 'card')]]), 3),
                 ANY(gearOn('$it'), AND(has('$it', 'adaptation'), NOT(has('$it', 'loadout')))),
                 ge(add(C('attr', '$it', 1), C('attr', '$it', 2), C('attr', '$it', 3)), 11))
fx('The Perfect Organism', **agenda([(eq(g('$me', 'acted'), 0), 'Complete it at the start of your turn (before playing anything)'),
                                      (ANY(OPS('$me'), PERFECT_OK), 'Control a Specimen with three different Adaptations (one non-Loadout) and total attributes 11+')],
    imm=[choose(flt(OPS('$me'), PERFECT_OK), '$v', 'Which Specimen is the perfected subject?'), SET('$v', 'perfect', 1), ready('$v'), SET('$v', 'dmg', 0)]))
attr_term(Q(AND(eq(g('$o', 'perfect'), 1), agenda_on('The Perfect Organism', ctrl('$o'))), 2, 0))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 1), ANY(ATK, eq(g('$it', 'perfect'), 1)), agenda_on('The Perfect Organism', '$e.p'), ne(g('$e.p', 'poT'), '$turn')),
                      'do': [SET('$e.p', 'poT', '$turn'), C('gainDom', '$e.p', 1)]})
fx('Replacement Population', **agenda([(ge(add(g('$me', 'infTurns'), g('$me', 'sucI')), 3), 'Succeed at Infiltrate on three separate turns'),
                                        (ge(cnt(flt(SPEC(), ge(C('attr', '$it', 2), 3))), 4), 'Control four Specimens with Tradecraft 3+')],
    imm=[choose(OPS('$opp'), '$xs', 'Exhaust two opposing operatives', 0, 2), EACH('$xs', '$x', [exhaust('$x')])]))
attr_term(Q(AND(A_('T'), has('$o', 'specimen'), attacking('$o'), agenda_on('Replacement Population', ctrl('$o'))), 2, 0))
AFTER_DEFEND.append(IF(AND(agenda_on('Replacement Population', '$me'), ANY(ATK, has('$it', 'specimen'))), [EACH(DFN, '$d', [
    IF(ge(C('avail', '$opp'), 1), [C('spend', '$opp', 1)], [SET('$d', 'dfn', 0)])])]))
