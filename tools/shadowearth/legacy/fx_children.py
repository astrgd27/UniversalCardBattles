"""Shadow Earth: Children of the High-Ones (Cultists, Revelation, Alien Artifacts, Entities)."""
from lib import *

CULT = lambda p='$me': flt(OPS(p), has('$it', 'cultist'))
ENT = lambda p='$me': flt(OPS(p), has('$it', 'entity'))
ARTS = lambda p='$me': flt(GEAR(p), has('$it', 'artifact'))
ALIENS = lambda p='$me': flt(GEAR(p), has('$it', 'alien'))
def distinct_names(l): return cnt(['distinct', ['map', l, g('$it', 'card')]])
REV = g('$me', 'rev')
MY = myMission(); THEIRS = theirMission()

fx('The First Contact House', abilities=[trig('revelation', [scry(1)], eq('$e.p', SELF_P), once_per_turn=True)])

# ---------------------------------------------------------------- Cult Proliferation
fx('Street Preacher', abilities=[on_success('subvert', [rev(1)], attacking('$self'), once_per_turn=True)])
fx('Recruitment Circle', abil=[abil('Pay 1: create a 0/1/1 Cultist token', [token('tok-cultist', 1)], ('development', 'operations'), cost=[C('spend', '$me', 1)],
    req=[(ge(C('avail', '$me'), 1), 'Needs 1 Influence')])])
attr_term(self_term('Ecstatic Convert', 'W', 1, AND(participating('$o'), ANY(OPS(ctrl('$o')), AND(ne('$it', '$o'), participating('$it'), has('$it', 'cultist'))))))
fx('Ecstatic Convert')
fx('Community Outreach', op=op([token('tok-cultist', 1), IF(ge(cnt(CULT()), 3), [scry(1)])]))
fx('Cell Organizer')
attr_term(Q(AND(A_('W'), has('$o', 'cultist'), has('$o', 'token'), defending('$o'), own('Cell Organizer', ctrl('$o'))), 1, 0))
fx('The Gathering', mattr=3, mop=[{'label': 'The Gathering (Will mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[dom(Q(ge(cnt(CULT()), 5), 2, 1))])
fx('Pilgrimage Convoy', abilities=[at_refresh([token('tok-cultist', Q(ge(REV, 5), 2, 1))])])
fx('The Chosen Multitude', abilities=[at_refresh([dom(1)], ge(cnt(CULT()), 7))])
CHEAP_CULTIST = lambda name, extra=None: cost_term(Q(AND(has('$c', 'cultist'), typ('$c', 'operative'), eq(g('$p', 'pl_cultist'), 0),
                                                        *( [extra] if extra is not None else []), own(name, '$p')), -1, 0))
CHEAP_CULTIST('The Chosen Multitude')

# ---------------------------------------------------------------- Extraterrestrial Technology
fx('Recovered Probe', attach=1, abilities=[on_success('infiltrate', [scry(1)], attacking(bearerOf('$self')))])
attr_term(bearer_term('Recovered Probe', 'T', 1))
fx('Contact Engineer')
cost_term(Q(AND(has('$c', 'artifact'), eq(g('$p', 'pl_artifact'), 0), own('Contact Engineer', '$p')), -1, 0))
fx('Unidentified Alloy', attach=1); SHIELD.append(gear_n('$o', 'Unidentified Alloy')); attr_term(bearer_term('Unidentified Alloy', 'F', 1))
fx('Antigravity Harness', attach=1); HASTE.append(gt(gear_n('$o', 'Antigravity Harness'), 0)); attr_term(bearer_term('Antigravity Harness', 'T', 1))
fx('Device from the Crash Site', op=op([C('lookTop', '$me', 4), choose(flt(['cards', '$me', 'look'], has('$it', 'artifact')), '$v', 'Device from the Crash Site: take which Artifact?', 0, 1),
    IF(isObj('$v'), [['move', '$v', 'hand']]), C('lookBottom', '$me')]))
fx('Neural Disruptor', attach=1)
PRE_DEFEND.append(IF(AND(kind_is('subvert'), ANY(ATK, gt(gear_n('$it', 'Neural Disruptor'), 0)), ne(g('$me', 'ndT'), '$turn')), [SET('$me', 'ndT', '$turn'),
    choose(flt(OPS('$opp'), AND(eq(g('$it', 'ex'), 0), le(g('$it', 'will'), 2))), '$v', 'Neural Disruptor: exhaust which opposing operative (printed Will 2 or less)?', 0, 1),
    IF(isObj('$v'), [exhaust('$v')])]))
fx('Nonlocal Transmitter', abilities=[on_played(has('$e.c', 'artifact'), [rev(1), tmp(1)], once_per_turn=True)])
fx('Recovered Mothercraft Core', abilities=[at_refresh([draw(1), tmp(1)], ge(distinct_names(ALIENS()), 2))])
attr_term(Q(AND(A_('W'), ANY(gearOn('$o'), has('$it', 'alien')), own('Recovered Mothercraft Core', ctrl('$o'))), 1, 0))

# ---------------------------------------------------------------- Cosmic Manifestation
fx('Whispering Devotee')
RULE_TRIGGERS.append({'on': 'eliminated', 'if': eq('$e.card', slug('Whispering Devotee')), 'do': [C('gainRev', '$e.ctrl', 1)]})
fx('Rift Attendant')
cost_term(Q(AND(has('$c', 'entity'), ge(g('$p', 'rev'), 4), own('Rift Attendant', '$p')), -1, 0))
fx('Thinning Veil', abilities=[on_success('subvert', [rev(1)], once_per_turn=True)])
fx('Distorted Geometry', resp=op([choose(['concat', Q(AND(attr_is('W'), ANY(ENT(), participating('$it'))), opts('An Entity gets +3 Will'), lit([])),
                                                 Q(attr_is('T'), opts('The enemy team gets -2 Tradecraft'), lit([]))], '$y', 'Distorted Geometry: choose one'),
    IF(eq('$y', 'An Entity gets +3 Will'), [pick(flt(ENT(), participating('$it')), '$v', 'Which Entity?'), mission_bonus('$v', 3)]),
    IF(eq('$y', 'The enemy team gets -2 Tradecraft'), [IF(MY, [team_bonus('def', -2)], [team_bonus('atk', -2)])])],
    req=[(OR(AND(attr_is('W'), ANY(ENT(), participating('$it'))), attr_is('T')), 'Needs your Entity in a Will mission, or a Tradecraft mission')]))
fx('Manifestation of Hunger', abilities=[at_cleanup([
    choose(Q(gt(cnt(flt(MY_SAC(), AND(has('$it', 'cultist'), ne('$it', '$self')))), 0), opts('Sacrifice a Cultist', 'Take 2 damage'), opts('Take 2 damage')), '$y',
           'Manifestation of Hunger hungers'),
    IF(eq('$y', 'Sacrifice a Cultist'), [pick(flt(MY_SAC(), has('$it', 'cultist')), '$v', 'Sacrifice which Cultist?'), sacrifice('$v')], [dmg('$self', 2)])])])
fx('Scream Across Dimensions', mattr=3, mop=[{'label': 'Scream Across Dimensions (Will mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   succ=[pick(flt(ENT(), eq(g('$it', 'ex'), 1)), '$e1', 'Ready which Entity?', 0, 1), IF(isObj('$e1'), [ready('$e1')]),
         pick(flt(OPS('$opp'), eq(g('$it', 'ex'), 0)), '$v', 'Exhaust which enemy operative?', 0, 1), IF(isObj('$v'), [exhaust('$v')]), dom(1)])
fx('Gateway Custodian', deploy=[choose(OPS('$opp'), '$xs', 'Gateway Custodian: exhaust up to two opposing operatives', 0, 2), EACH('$xs', '$x', [exhaust('$x')])])
PLAYREQ.append(OR(NOT(isc('$c', 'Gateway Custodian')), ge(g('$p', 'rev'), 3)))
fx('The First Unmaking', op=op([LET('$n', mn(4, cnt(flt(OPS('$opp'), ge(add(g('$it', 'dmg'), 3), C('dur', '$it')))))),
    EACH(OPS('$opp'), '$x', [dmg('$x', 3)]), dom('$n')], req=[(ge(REV, 7), 'Needs 7 Revelation')]))

# ---------------------------------------------------------------- Prophetic Cells
fx('Visionary Contactee', abilities=[at_refresh([peek_top('$me')])])
fx('Radio Prophet', abilities=[trig('scried', [until_cleanup('$self', 'T', 1)], eq('$e.p', SELF_P), once_per_turn=True)])
fx('Night-Sky Vigil', abil=[abil('Exhaust a Cultist: Scry 2', [exhaust('$t'), scry(2)], ('development', 'operations'),
    targets=[slot(flt(CULT(), eq(g('$it', 'ex'), 0)), prompt='Exhaust which Cultist?')])])
fx('Prophecy of Misfortune', resp=op([SET('$me', 'pomT', '$turn')], req=[(THEIRS, 'Only after an opponent declares a mission')]))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': eq(g(['opp', '$e.p'], 'pomT'), '$turn'), 'do': [LET('$q', ['opp', '$e.p']), SET('$q', 'pomT', 0),
    IF(eq('$e.ok', 1), [['draw', '$q', 2]], [C('gainRev', '$q', 1)])]})
fx('Uncertain Tomorrow', op=op([scry(4), draw(1)]))
fx('The Apparition Log', abil=[abil('Reveal your top card (an Operation makes your next Response cost 1 less)',
    [IF(gt(cnt(DECK('$me')), 0), [C('revealTop', '$me', '$me'),
        IF(inl(g(first(DECK('$me')), 'type'), lit(['operation', 'response', 'mission'])), [SET('$me', 'aplog', 1)])])], ('development', 'operations'))],
   abilities=[on_played(typ('$e.c', 'response'), [SET('$me', 'aplog', 0)])])
cost_term(Q(AND(typ('$c', 'response'), eq(g('$p', 'aplog'), 1)), -1, 0))
fx('Foretold Collision', mattr=2, mop=[{'label': 'Foretold Collision (Tradecraft mission)', 'targets': [slot(['list', '$opp'], prompt='Target: the opposing Headquarters')]}],
   pre=[SET('$me', 'fcCost', -1), IF(gt(cnt(DECK('$me')), 0), [
       C('lookTop', '$me', 2), emit('revealed', cards=['map', ['cards', '$me', 'look'], g('$it', 'card')], p='$me', owner='$me'),
       choose(['cards', '$me', 'look'], '$v', 'Foretold Collision: discard one of them for +3 Tradecraft?', 0, 1),
       IF(isObj('$v'), [SET('$me', 'fcCost', g('$v', 'cost')), ['move', '$v', 'grave'], INC('game', 'am', 3)]), C('topBack', '$me')])],
   succ=[dom(Q(ge(g('$me', 'fcCost'), 3), 2, 1))])
fx('The Hundredth Warning', abilities=[trig('scried', [IF(gt(cnt(DECK('$me')), 0), [C('revealTop', '$me', '$me'),
    IF(ge(g(first(DECK('$me')), 'cost'), 3), [pick(flt(CULT(), eq(g('$it', 'ex'), 1)), '$v', 'Ready which Cultist?', 0, 1), IF(isObj('$v'), [ready('$v')]), tmp(1)])])],
    eq('$e.p', SELF_P), once_per_turn=True)])

# ---------------------------------------------------------------- 1.4 bridge cards
fx('Reverend Silas Hark, Contactee', abilities=[on_played(has('$e.c', 'alien'), [rev(1)], once_per_turn=True)])
attr_term(self_term('Reverend Silas Hark, Contactee', 'W', 2, AND(defending('$o'), ge(cnt(flt(OPS(ctrl('$o')), AND(ne('$it', '$o'), has('$it', 'cultist')))), 2))))
fx('The Listening Dish at Black Mesa', abilities=[at_refresh([IF(ge(cnt(DECK('$me')), 1), [C('lookTop', '$me', 2),
    choose(flt(['cards', '$me', 'look'], OR(has('$it', 'entity'), has('$it', 'alien'))), '$v', 'The Listening Dish: take an Entity or Alien Asset (and skip your draw)?', 0, 1),
    IF(isObj('$v'), [emit('revealed', card=g('$v', 'card'), p='$me', owner='$me'), ['move', '$v', 'hand'], SET('$me', 'skipDraw', 1), C('lookBottom', '$me')],
       [C('topBack', '$me')])])])])
fx('Stellar Alignment Almanac', deploy=[scry(3)], abilities=[
    trig('refresh', [choose(opts('Strike', 'Infiltrate', 'Subvert'), '$r', 'Stellar Alignment Almanac: name a basic mission'),
                     SET('$self', 'almK', Q(eq('$r', 'Strike'), 1, Q(eq('$r', 'Infiltrate'), 2, 3)))], AND(ne('$e.p', SELF_P), C('active', '$self'))),
    trig('missionDeclared', [rev(1), loot(1)], AND(ne('$e.p', SELF_P), eq('$e.kind', g('$self', 'almK'))), once_per_turn=True)])
fx('The First Vigil', abilities=[at_refresh([rev(1)], ge(cnt(CULT()), 3))])
CHEAP_CULTIST('The First Vigil', ge(g('$p', 'rev'), 5))
fx('Non-Euclidean Field Camera', attach=1, deploy=[C('revealTop', '$me', '$me'), C('revealTop', '$me', '$opp')],
   abilities=[trig('missionResult', [IF(gt(cnt(DECK('$me')), 0), [['move', first(DECK('$me')), 'deck'], draw(1)])],
                   AND(eq('$e.p', SELF_P), eq('$e.ok', 1), eq('$e.kind', 3), attacking(bearerOf('$self'))), optional=True, text='Put your top card on the bottom and draw?')])
fx('The Man Who Heard Jupiter', abilities=[trig('revelation', [pick(flt(CULT(), eq(g('$it', 'ex'), 1)), '$v', 'The Man Who Heard Jupiter: ready which Cultist?', 0, 1),
    IF(isObj('$v'), [ready('$v')])], AND(eq('$e.p', SELF_P), ge(g('$me', 'revT'), 3), lt(sub(g('$me', 'revT'), '$e.n'), 3)), once_per_turn=True)])
SUBV_OPTS.append(('Exhaust it and gain 1 Revelation (Jupiter)', ANY(ATK, isc('$it', 'The Man Who Heard Jupiter')), [exhaust('$t'), rev(1)]))
fx('Rite of the Empty Sky', mattr=3, mop=[{'label': 'Rite of the Empty Sky (Will mission)', 'targets': [slot(['concat', ['list', '$opp'], facs('$opp')],
                                          prompt='Target: the opposing Headquarters (or designate an opposing Facility too)')]}],
   succ=[rev(2), choose(['concat', opts('1 Dominance'), Q(AND(ge(REV, 7), isObj(TGT)), opts('Disable the designated Facility'), lit([]))], '$r', 'Rite of the Empty Sky: choose one'),
         IF(eq('$r', '1 Dominance'), [dom(1)], [disable(TGT)])])
fx('The Color Between Stations', resp=op([SET('$t', 'z0', 1), ['draw', ctrl('$t'), 1]], targets=[slot(ATK, prompt='Which attacking operative contributes nothing?')],
    req=[(THEIRS, 'Only when an opponent declares a mission')]))

# ---------------------------------------------------------------- Agendas
fx('Communion of the Faithful', **agenda([(ge(cnt(CULT()), 4), 'Control four Cultists'), (ge(REV, 4), 'Have four Revelation')], imm=[token('tok-cultist', 2)]))
CHEAP_CULTIST('Communion of the Faithful') if False else cost_term(Q(AND(has('$c', 'cultist'), typ('$c', 'operative'), eq(g('$p', 'pl_cultist'), 0),
                                                                         agenda_on('Communion of the Faithful', '$p')), -1, 0))
fx('The Crash-Site Gospel', **agenda([(ge(distinct_names(ARTS()), 3), 'Control three Artifacts with different names'), (ge(REV, 5), 'Have five Revelation')], imm=[draw(3)]))
cost_term(Q(AND(has('$c', 'artifact'), agenda_on('The Crash-Site Gospel', '$p')), -1, 0))
RULE_TRIGGERS.append({'on': 'played', 'if': AND(has('$e.c', 'artifact'), agenda_on('The Crash-Site Gospel', '$e.p')), 'do': [C('gainTmp', '$e.p', 1), C('scry', '$e.p', 1)]})
fx('The Great Arrival', **agenda([(ge(cnt(CULT()), 3), 'Control three Cultists'), (ge(REV, 7), 'Have seven Revelation'),
                                   (ge(g('$me', 'willMaxG'), 9), 'Succeed at a Will mission with attacking power 9 or more')],
    imm=[token('tok-high-one', 1, ready_=True), EACH(OPS('$opp'), '$x', [exhaust('$x')])]))
RULE_TRIGGERS.append({'on': 'refresh', 'if': agenda_on('The Great Arrival', '$e.p'), 'do': [LET('$q', ['opp', '$e.p']),
    choose(['concat', Q(ge(C('avail', '$q'), 3), opts('Pay 3 to prevent it'), lit([])), Q(gt(cnt(OPS('$q')), 0), opts('Sacrifice an operative'), lit([])),
            Q(gt(cnt(HAND('$q')), 0), opts('Discard a card'), lit([])), opts('Grant 1 Dominance')], '$y', 'The Great Arrival: choose your tribute', who='$q'),
    IF(eq('$y', 'Pay 3 to prevent it'), [C('spend', '$q', 3)]),
    IF(eq('$y', 'Sacrifice an operative'), [choose(OPS('$q'), '$v', 'Sacrifice which operative?', 1, 1, who='$q'), C('sacrifice', '$v')]),
    IF(eq('$y', 'Discard a card'), [C('discardN', '$q', 1)]), IF(eq('$y', 'Grant 1 Dominance'), [C('gainDom', '$e.p', 1)])]})
fx('The Night Abductions', **agenda([(ge(cnt(CULT()), 3), 'Control three Cultists'), (ge(distinct_names(ALIENS()), 2), 'Control two Alien Artifacts with different names'),
                                      (ge(g('$me', 'revG'), 5), 'Have gained five Revelation this game'), (eq(g('$me', 'sucI'), 1), 'Succeed at Infiltrate this turn')],
    imm=[pick(flt(GEAR('$opp'), le(g('$it', 'cost'), 3)), '$v', 'Return which opposing Asset (cost 3 or less)?', 0, 1), bounce('$v'), dom(1)]))
RULE_TRIGGERS.append({'on': 'missionResult', 'if': AND(eq('$e.ok', 1), eq('$e.kind', 2), agenda_on('The Night Abductions', '$e.p'), ne(g('$e.p', 'naT'), '$turn')),
    'do': [SET('$e.p', 'naT', '$turn'), choose(flt(OPS(['opp', '$e.p']), eq(g('$it', 'ex'), 0)), '$v', 'The Night Abductions: exhaust which operative?', 0, 1, who='$e.p'),
           IF(isObj('$v'), [SET('$v', 'ex', 1)]), C('gainRev', '$e.p', 1)]})
