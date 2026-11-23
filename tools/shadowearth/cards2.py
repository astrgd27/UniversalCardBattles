"""Shadow Earth 2.0: every card, token and starter deck. Rules text is printed; effects are DSL built with lib.py."""
from lib import *
from lib import _card

ME_OPS, OPP_OPS = OPS('$me'), OPS('$opp')
DAMAGED = flt(OPS(), gt(g('$it', 'dmg'), 0))
MY, THEIRS = myMission(), theirMission()

# ================================================================ Conspiracy Agendas (the shared row)
ANAME = {'F': 'Force', 'T': 'Tradecraft', 'W': 'Will'}
PAIR = {'Silence the Witness': 'FT', 'Doctor the Archives': 'TW', 'Seize the Broadcast': 'WF', 'Rig the Election': 'WT', 'Steal the Prototype': 'TF',
        'Assassinate the Ambassador': 'FW', 'Turn the Senator': 'WF', 'Poison the Reservoir': 'FT', 'Blackout in the Capital': 'TW',
        'Topple the Regime': 'FT', 'Crash the Markets': 'TW', 'The Vatican Files': 'WF'}
def agenda(name, attr, need, res, dom_, text, flavor, on_score=None):
    a, b = PAIR[name]
    text = f'{ANAME[a]} or {ANAME[b]} (your team\'s better one).' + text[text.index('.') + 1:]
    return _card(name, 'agenda', 'neutral', None, text, flavor, mattr=MA[a], mattr2=MA[b], need=need, res=res, dom=dom_, rarity='A',
                 **({'onScore': on_score} if on_score else {}))
agenda('Silence the Witness', 'F', 2, 2, 1, 'Force. 2 progress, worth 1 Dominance. When scored: deal 2 damage to an operative.',
       'She saw the plates on the black sedan. She will not testify.', [pick(OPS(), '$v', 'Silence the Witness: 2 damage to which operative?'), dmg('$v', 2)])
agenda('Doctor the Archives', 'T', 2, 2, 1, 'Tradecraft. 2 progress, worth 1 Dominance. When scored: look at the opponent\'s hand; they discard a card of your choice.',
       'History is a file. Files can be edited.', [C('showHand', '$opp'), pick(['cards', '$opp', 'shown'], '$v', 'Which card do they discard?', 0, 1),
                                                    IF(isObj('$v'), [['move', '$v', 'grave']]), C('hideHand', '$opp')])
agenda('Seize the Broadcast', 'W', 2, 2, 1, 'Will. 2 progress, worth 1 Dominance. When scored: Scry 3, then draw a card.',
       'At 9:14 p.m. every television in the hemisphere showed the same symbol.', [scry(3), draw(1)])
agenda('Rig the Election', 'W', 3, 3, 2, 'Will. 3 progress, worth 2 Dominance. When scored: gain 1 progress on your Master Plan.',
       'The people chose. They were always going to choose.', [plan_prog(1)])
agenda('Steal the Prototype', 'T', 3, 3, 2, 'Tradecraft. 3 progress, worth 2 Dominance. When scored: draw 2 cards.',
       'Lockheed reported it as a fire. There was no fire.', [draw(2)])
agenda('Assassinate the Ambassador', 'F', 3, 3, 2, 'Force. 3 progress, worth 2 Dominance. When scored: eliminate a damaged operative.',
       'Officially, a heart attack. Unofficially, a message.', [pick(DAMAGED, '$v', 'Eliminate which damaged operative?', 0, 1), eliminate('$v')])
agenda('Turn the Senator', 'W', 3, 3, 2, 'Will. 3 progress, worth 2 Dominance. When scored: ready all your operatives.',
       'Everyone has a price. His was a photograph.', [EACH(ME_OPS, '$x', [ready('$x')])])
agenda('Poison the Reservoir', 'F', 3, 3, 2, 'Force. 3 progress, worth 2 Dominance. When scored: deal 1 damage to each enemy operative.',
       'Boil-water notices were issued for six counties. Four were too late.', [EACH(OPP_OPS, '$x', [dmg('$x', 1)])])
agenda('Blackout in the Capital', 'T', 3, 3, 2, 'Tradecraft. 3 progress, worth 2 Dominance. When scored: exhaust up to two enemy operatives.',
       'For eleven hours, the most powerful city on Earth went dark. Things were moved.',
       [choose(OPP_OPS, '$xs', 'Exhaust up to two enemy operatives', 0, 2), EACH('$xs', '$x', [exhaust('$x')])])
agenda('Topple the Regime', 'F', 4, 4, 3, 'Force. 4 progress, worth 3 Dominance. When scored: the opponent discards 2 cards.',
       'The colonels were very sure it was their idea.', [C('discardN', '$opp', 2)])
agenda('Crash the Markets', 'T', 4, 4, 3, 'Tradecraft. 4 progress, worth 3 Dominance. When scored: the opponent loses 2 progress on their Master Plan.',
       'Somebody always knows on Thursday what everybody learns on Monday.', [C('loseProg', PLAN('$opp'), '$opp', 2)])
agenda('The Vatican Files', 'W', 4, 4, 3, 'Will. 4 progress, worth 3 Dominance. When scored: draw 3 cards.',
       'Shelf 1,138 of the Secret Archive is not on any floor plan.', [draw(3)])

# ================================================================ tokens
token_card('Cultist', 0, 1, 1, 1, ['cultist'])
token_card('Hybrid', 1, 1, 0, 1, ['specimen'])
token_card('Contractor', 1, 1, 0, 1, ['contractor'])
token_card('Specimen', 1, 1, 1, 2, ['specimen'])
token_card('The Morning Star', 8, 6, 8, 8, ['demon'], 'Token. The Adversary, made flesh.')
token_card('High-One Manifestation', 7, 4, 8, 9, ['entity'], 'Token. It does not breathe our air.')

def hq(name, faction, text, flavor, **x): return _card(name, 'headquarters', faction, None, text, flavor, rarity='S', **x)
def plan(name, faction, attr, text, flavor, **x): return _card(name, 'plan', faction, None, text, flavor, mattr=MA[attr], rarity='S', **x)
def counted(p, k): return cnt(kind_ops(p, k))

# ================================================================ PsyList: the government's psychic program
PSY = lambda p='$me': kind_ops(p, 'psychic')
CTL_ENEMY = flt(OPP_OPS, eq(g('$it', 'ctl'), 1))
hq('PsyList Central Station', 'psylist', 'Security 3. Doctrine (Psychic Assault): your Wetwork missions use Will instead of Force, and when you win one, put a Control counter on the target. Enemy operatives with Control counters get -1 Force, Tradecraft and Will. At the start of your turn, look at the top card of the opponent\'s deck.',
   'A disused weather station in Nevada. The antennas point down.', abilities=[at_start([peek_top()])])
plan('Project OVERMIND', 'psylist', 'W', 'Master Plan (Will). Enacted: enemy operatives with Control counters can\'t defend, and your Psychics get +1 Will.',
     '"We are not reading their minds, Senator. We are writing them."')
NODEF.append(AND(eq(g('$o', 'ctl'), 1), plan_on(['opp', ctrl('$o')], 'Project OVERMIND')))
ATTR.append(Q(AND(eq(g('$o', 'ctl'), 1), ANY(['cards', ['opp', ctrl('$o')], 'hq'], isc('$it', 'PsyList Central Station'))), -1, 0))
ATTR.append(Q(AND(A_('W'), has('$o', 'psychic'), plan_on(ctrl('$o'), 'Project OVERMIND')), 1, 0))
operative('Remote Viewer', 'psylist', 1, 0, 2, 2, 3, 'Psychic. When played, look at the top card of the opponent\'s deck. You may put it on the bottom.',
          'Coordinates 39°N 77°W. "There is a room under the room."', kws=('psychic',),
          deploy=[peek_top(), IF(gt(cnt(DECK('$opp')), 0), [choose(opts('Leave it', 'Put it on the bottom'), '$y', 'Remote Viewer: their top card'),
                  IF(eq('$y', 'Put it on the bottom'), [['move', first(DECK('$opp')), 'deck']])])])
operative('Precog Analyst', 'psylist', 2, 0, 3, 2, 3, 'Psychic. Your Responses cost 1 less.', 'She files her reports the day before.', kws=('psychic',))
COST.append(Q(AND(typ('$c', 'response'), own('Precog Analyst', '$p')), -1, 0))
response('Precognitive Flash', 'psylist', 1, 'A participating Psychic gets +2 to the mission\'s attribute.', 'He ducked before the shot.',
         do=[mission_bonus('$t', 2)], targets=[slot(flt(PSY(), participating('$it')), prompt='Which Psychic?')], req=[(IN_MISSION, 'Only during a mission')])
response('Foresight', 'psylist', 1, 'Look at the opponent\'s hand. Your side gets +1 to the mission\'s attribute for each Response in it.', '"You were going to say no."',
         do=[C('lookHand', '$me', '$opp'), side_bonus('$me', cnt(flt(HAND('$opp'), typ('$it', 'response'))))], req=[(IN_MISSION, 'Only during a mission')])
facility('Sensory Deprivation Tank', 'psylist', 2, 'Once per turn, exhaust a Psychic: Scry 2, then draw a card.', 'Ninety minutes of nothing. Then everything.',
         abil=[abil('Exhaust a Psychic: Scry 2, draw a card', [exhaust('$t'), scry(2), draw(1)], targets=[slot(flt(PSY(), ready_('$it')), prompt='Which Psychic?')])])
operative('Telekinetic Recruit', 'psylist', 1, 2, 0, 1, 3, 'Psychic. +1 Force while another Psychic participates in its mission.', 'The spoons were only the beginning.', kws=('psychic',))
ATTR.append(self_term('Telekinetic Recruit', 'F', 1, AND(participating('$o'), ANY(OPS(ctrl('$o')), AND(ne('$it', '$o'), participating('$it'), has('$it', 'psychic'))))))
operative('Pyrokinetic Enforcer', 'psylist', 3, 3, 0, 2, 3, 'Psychic. In Bloodshed, its side deals 1 extra damage.', 'Spontaneous combustion is never spontaneous.', kws=('psychic',))
BLOOD.append(('atk', Q(ANY(ATK, isc('$it', 'Pyrokinetic Enforcer')), 1, 0))); BLOOD.append(('def', Q(ANY(DFN, isc('$it', 'Pyrokinetic Enforcer')), 1, 0)))
operative('Subject Zero', 'psylist', 5, 5, 1, 4, 4, 'Unique Psychic. When its side wins a mission, deal 2 damage to an enemy operative.', 'They stopped counting the orderlies.',
          kws=('psychic', 'unique'), rarity='M',
          abilities=[on_win([pick(OPP_OPS, '$v', 'Subject Zero: 2 damage to which enemy?', 0, 1), dmg('$v', 2)], attacking('$self'))])
response('Poltergeist Burst', 'psylist', 1, 'Your side gets +2 Force. Deal 1 damage to an opposing participant.', 'The filing cabinets went first.',
         do=[side_bonus('$me', Q(attr_is('F'), 2, 0)), pick(ENEMY_SIDE(), '$v', 'Poltergeist Burst: 1 damage to which opponent?', 0, 1), dmg('$v', 1)],
         req=[(IN_MISSION, 'Only during a mission')])
operation('Mind Spike', 'psylist', 2, 'Deal 2 damage to an operative, or 3 if it has a Control counter.', 'A nosebleed, then silence.',
          do=[dmg('$t', Q(eq(g('$t', 'ctl'), 1), 3, 2))], targets=[slot(OPP_OPS, prompt='Spike which operative?')])
operative('Compulsion Technician', 'psylist', 2, 1, 2, 3, 3, 'Psychic. When your side wins a Will mission, put a Control counter on an opposing participant or enemy operative.',
          '"Repeat after me."', kws=('psychic',),
          abilities=[on_win([pick(flt(OPP_OPS, eq(g('$it', 'ctl'), 0)), '$v', 'Compulsion Technician: Control counter on which enemy?', 0, 1), control('$v')], eq('$e.attr', 3))])
operative('Sleeper Handler', 'psylist', 3, 1, 3, 3, 3, 'Psychic. Enemy operatives with Control counters can\'t defend against your missions.', '"Wake up, Lieutenant."', kws=('psychic',))
NODEF.append(AND(eq(g('$o', 'ctl'), 1), own('Sleeper Handler', ['opp', ctrl('$o')])))
response('Hypnotic Trigger', 'psylist', 1, 'An opposing participant gets -2 to the mission\'s attribute. Put a Control counter on it.', 'Three words, whispered in 1979.',
         do=[mission_bonus('$t', -2), control('$t')], targets=[slot(ENEMY_SIDE(), prompt='Which opponent?')], req=[(IN_MISSION, 'Only during a mission')])
operation('Reprogram Identity', 'psylist', 3, 'Take control of an enemy operative with a Control counter until end of turn. Ready it; it can attack this turn.',
          'He remembered being someone else. He was wrong about which.',
          do=[['control', '$t', '$me'], SET('$t', 'ctlT', '$turn'), ready('$t'), SET('$t', 'swiftT', '$turn'), emit('controlled', o='$t', p='$me')],
          targets=[slot(CTL_ENEMY, prompt='Take which operative?')])
facility('The White Noise Suite', 'psylist', 3, 'At the start of your turn, put a Control counter on an enemy operative.', 'Room 11. The static never stops.',
         abilities=[at_start([pick(flt(OPP_OPS, eq(g('$it', 'ctl'), 0)), '$v', 'The White Noise Suite: Control counter on which enemy?', 0, 1), control('$v')])])
operative('Collective Mind', 'psylist', 2, 1, 1, 2, 3, 'Psychic. +1 Will for each enemy operative with a Control counter.', 'One thought, many mouths.', kws=('psychic',))
ATTR.append(self_term('Collective Mind', 'W', cnt(flt(OPS(['opp', ctrl('$o')]), eq(g('$it', 'ctl'), 1)))))
asset('Neural Link', 'psylist', 1, 'Implant. Attach to a Psychic: +1 Will. When its side wins a Will mission, draw a card.', 'The interface was the easy part.',
      attach=1, bearerKw='psychic', abilities=[on_win([draw(1)], AND(eq('$e.attr', 3), participating(bearerOf('$self'))))])
ATTR.append(bearer_term('Neural Link', 'W', 1))
operative('Communal Mind', 'psylist', 4, 1, 2, 4, 3, 'Psychic. Other Psychics on its mission get +1 Will.', 'They finish each other\'s sentences. All of them.', kws=('psychic',))
ATTR.append(Q(AND(A_('W'), has('$o', 'psychic'), participating('$o'), ANY(OPS(ctrl('$o')), AND(isc('$it', 'Communal Mind'), ne('$it', '$o'), participating('$it')))), 1, 0))

operation('Mass Suggestion', 'psylist', 3, 'Put a Control counter on each exhausted enemy operative.', 'The broadcast lasted four seconds. The orders lasted for years.',
          do=[EACH(flt(OPP_OPS, eq(g('$it', 'ex'), 1)), '$x', [control('$x')])])

# ================================================================ Prendick Holdings: biotech
SPEC = lambda p='$me': kind_ops(p, 'specimen')
SCI = lambda p='$me': kind_ops(p, 'scientist')
hq('Prendick Holdings Tower', 'prendick', 'Security 3. Doctrine (Harvest): whenever an enemy operative is eliminated during your turn, create a 1/1/1 Specimen token. Your Mutations cost 1 less.', 'Forty floors of glass. Nine more underground.')
RULE_TRIGGERS.append({'on': 'eliminated', 'if': AND(is_fac('$active', 'prendick'), ne('$e.ctrl', '$active')), 'do': [token('Specimen', 1, '$active')]})
COST.append(Q(AND(has('$c', 'mutation'), own('Prendick Holdings Tower', '$p') if False else ANY(['cards', '$p', 'hq'], isc('$it', 'Prendick Holdings Tower'))), -1, 0))
plan('Project CHIMERA', 'prendick', 'F', 'Master Plan (Force). Enacted: your Specimens get +1 Force and +2 Health.', 'Patent pending: the next human.')
ATTR.append(Q(AND(A_('F'), has('$o', 'specimen'), plan_on(ctrl('$o'), 'Project CHIMERA')), 1, 0))
HP.append(Q(AND(has('$o', 'specimen'), plan_on(ctrl('$o'), 'Project CHIMERA')), 2, 0))
operative('Security Hound-9', 'prendick', 1, 2, 0, 1, 2, 'Specimen. +1 Force while defending.', 'Good dog. Very good dog. Do not pet.', kws=('specimen',))
ATTR.append(self_term('Security Hound-9', 'F', 1, defending('$o')))
operative('Razorback Hybrid', 'prendick', 2, 3, 0, 0, 3, 'Specimen.', 'Sixty percent boar. The rest is classified.', kws=('specimen',))
operative('Alpha Predator', 'prendick', 4, 4, 1, 1, 4, 'Specimen. In Bloodshed, its side deals 1 extra damage.', 'It learned to open doors in week two.', kws=('specimen',))
BLOOD.append(('atk', Q(ANY(ATK, isc('$it', 'Alpha Predator')), 1, 0))); BLOOD.append(('def', Q(ANY(DFN, isc('$it', 'Alpha Predator')), 1, 0)))
operative('Prototype Behemoth', 'prendick', 7, 6, 0, 1, 6, 'Unique Specimen. Costs 1 less for each Mutation you control.', 'Containment breach logged as a "minor incident".',
          kws=('specimen', 'unique'), rarity='M')
COST.append(Q(isc('$c', 'Prototype Behemoth'), neg(cnt(flt(GEAR('$p'), has('$it', 'mutation')))), 0))
response('Break Containment', 'prendick', 1, 'A participating Specimen gets +3 Force. After the mission, deal 1 damage to it.', 'Somebody pressed the wrong button. Somebody was paid to.',
         do=[mission_bonus('$t', Q(attr_is('F'), 3, 0)), INC('$t', 'hurtAfter', 1)], targets=[slot(flt(SPEC(), participating('$it')), prompt='Which Specimen?')],
         req=[(IN_MISSION, 'Only during a mission')])
RULE_TRIGGERS.append({'on': 'missionResult', 'do': [EACH(flt(OPS(), gt(g('$it', 'hurtAfter'), 0)), '$x', [LET('$h', g('$x', 'hurtAfter')), SET('$x', 'hurtAfter', 0),
                                                                                                         ['damage', '$x', '$h', '$e.p']])]})
asset('Anatomical Reinforcement', 'prendick', 2, 'Mutation. Attach to a Specimen: +1 Force and +2 Health.', 'Titanium is a lifestyle.', kws=('mutation',), attach=1, bearerKw='specimen')
ATTR.append(bearer_term('Anatomical Reinforcement', 'F', 1)); HP.append(mul(gear_n('$o', 'Anatomical Reinforcement'), 2))
asset('Perfect Skin Graft', 'prendick', 1, 'Mutation. Attach to a Specimen: +2 Tradecraft and Covert.', 'It passes. It passes for anyone.', kws=('mutation',), attach=1, bearerKw='specimen')
ATTR.append(bearer_term('Perfect Skin Graft', 'T', 2)); COVERT.append(gt(gear_n('$o', 'Perfect Skin Graft'), 0))
asset('Hypermetabolic Serum', 'prendick', 2, 'Mutation. Attach to a Specimen: +1 Force. Once per turn, pay 1: ready it.', 'Side effects include everything.',
      kws=('mutation',), attach=1, bearerKw='specimen',
      abil=[abil('Pay 1: ready the Specimen', [ready(bearerOf('$self'))], cost=[C('spend', '$me', 1)],
                 req=[(AND(ge(C('avail', '$me'), 1), eq(g(bearerOf('$self'), 'ex'), 1)), 'The Specimen must be exhausted and you need 1 Influence')])])
ATTR.append(bearer_term('Hypermetabolic Serum', 'F', 1))
asset('Adrenal Reservoir', 'prendick', 2, 'Mutation. Attach to a Specimen: +2 Force while attacking.', 'Fight. Fight. Fight.', kws=('mutation',), attach=1, bearerKw='specimen')
ATTR.append(bearer_term('Adrenal Reservoir', 'F', 2, attacking('$o')))
operative('Mutation Handler', 'prendick', 2, 0, 2, 2, 3, 'Scientist. When you attach a Mutation, draw a card.', '"Hold him down. Gently."', kws=('scientist',),
          abilities=[trig('attached', [draw(1)], AND(eq('$e.p', SELF_P), has('$e.a', 'mutation')))])
operative('Human-Passing Duplicate', 'prendick', 2, 1, 3, 1, 3, 'Specimen. When its side wins a Tradecraft mission, draw a card.', 'Your neighbor. Probably.', kws=('specimen',),
          abilities=[on_win([draw(1)], AND(eq('$e.attr', 2), attacking('$self')))])
operative('Infiltrator Brood', 'prendick', 3, 1, 3, 1, 3, 'Specimen. When its side wins a mission it joined, create a 1/1/0 Hybrid token.', 'They hatch in air ducts.',
          kws=('specimen',), abilities=[on_win([token('Hybrid')], attacking('$self'))])
operative('Mimicry Specialist', 'prendick', 3, 1, 4, 1, 3, 'Specimen. Covert. Can\'t be targeted by Wetwork.', 'Wears your face better than you do.', kws=('specimen', 'covert'))
TGTDENY.append(isc('$o', 'Mimicry Specialist'))
operative('Clinical Research Liaison', 'prendick', 1, 0, 2, 1, 2, 'Scientist. When played, gain 1 temporary Influence.', 'Her badge opens every door on the 40th floor.',
          kws=('scientist',), deploy=[tmp(1)])
facility('Biomedicine Annex 14', 'prendick', 2, 'At the start of your turn, gain 1 temporary Influence.', 'Funded by three ministries that don\'t know about each other.',
         abilities=[at_start([tmp(1)])])
facility('Venture Consortium', 'prendick', 3, 'Whenever you score an Agenda or advance your Master Plan, gain 1 temporary Influence.', 'Returns guaranteed. Investors unidentified.',
         abilities=[trig('progress', [tmp(1)], eq('$e.p', SELF_P), once_per_turn=True)])
operation('Quarterly Earnings', 'prendick', 1, 'Draw a card. If you control two or more Facilities, draw another.', 'Up nine hundred percent. Do not ask about the shrimp.',
          do=[draw(1), IF(ge(cnt(SITES('$me')), 2), [draw(1)])])
facility('The Glass Nursery', 'prendick', 3, 'At the start of your turn, if you control a Scientist, create a 1/1/1 Specimen token.', 'Ward 8. The cribs have restraints.',
         abilities=[at_start([token('Specimen')], gt(cnt(SCI()), 0))])

asset('Regenerative Tissue', 'prendick', 2, 'Mutation. Attach to a Specimen: +1 Health. At the start of your turn, remove all damage from it.', 'Cut it. Burn it. Come back Tuesday.',
      kws=('mutation',), attach=1, bearerKw='specimen', abilities=[at_start([heal(bearerOf('$self'), 99)])])
HP.append(gear_n('$o', 'Regenerative Tissue'))
operation('Feeding Frenzy', 'prendick', 2, 'Ready a Specimen. It gets +2 Force until end of turn.', 'Nobody fed them for three days. That was the experiment.',
          do=[ready('$t'), until_eot('$t', 'F', 2)], targets=[slot(SPEC(), prompt='Which Specimen?')])

# ================================================================ Dawn Star Society: the occult lodge
OCC = lambda p='$me': kind_ops(p, 'occultist')
DEMON = lambda p='$me': kind_ops(p, 'demon')
SACRIFICABLE = flt(ME_OPS, eq(g('$it', 'ctlT'), 0))
SCRIPT = lambda p='$me': flt(GEAR(p), has('$it', 'scripture'))
hq('Dawn Star Grand Lodge', 'dawnstar', 'Security 3. Doctrine (Blood Rite): once per mission, during Responses, sacrifice an operative: your side gets +3 to the mission\'s attribute. Whenever you sacrifice an operative, gain 1 temporary Influence.',
   'Founded 1717. Membership: unchanged since 1717.',
   abilities=[trig('sacrificed', [tmp(1)], eq('$e.p', SELF_P))],
   rabil=[abil('Blood Rite: sacrifice an operative for +3', [SET('game', 'brt', 1), sacrifice('$t'), side_bonus('$me', 3)],
               req=[(AND(IN_MISSION, eq(g('game', 'brt'), 0)), 'Once per mission, during a mission')],
               targets=[slot(SACRIFICABLE, prompt='Blood Rite: sacrifice which operative?')], once=False, phases=('respond',))])
plan('The Morning Star Descends', 'dawnstar', 'W', 'Master Plan (Will). Enacted: create The Morning Star (8/6/8, Health 8), ready.',
     'Lucifer means light-bringer. They intend to be very well lit.', onEnact=[token('The Morning Star')])
operative('Ambitious Initiate', 'dawnstar', 1, 0, 1, 2, 2, 'Occultist. When sacrificed, draw a card.', 'First degree. Eager to reach the second.', kws=('occultist',))
RULE_TRIGGERS.append({'on': 'sacrificed', 'if': eq('$e.card', slug('Ambitious Initiate')), 'do': [['draw', '$e.p', 1]]})
operation('Written in Blood', 'dawnstar', 1, 'As an additional cost, sacrifice an operative. Draw 2 cards.', 'Sign here. And here. And in red, here.',
          do=[sacrifice('$t'), draw(2)], targets=[slot(SACRIFICABLE, prompt='Sacrifice which operative?')])
response('Blood Offering', 'dawnstar', 1, 'As an additional cost, sacrifice an operative. Your side gets +3 to the mission\'s attribute.', 'The altar is never cold.',
         do=[sacrifice('$t'), side_bonus('$me', 3)], targets=[slot(SACRIFICABLE, prompt='Sacrifice which operative?')], req=[(IN_MISSION, 'Only during a mission')])
asset('The Lesser Bargain', 'dawnstar', 2, 'Pact. Attach to an Occultist: +2 Will. At the end of your turn, pay 1 Influence or deal 1 damage to it.',
      'Cheap power. Expensive interest.', kws=('pact',), attach=1, bearerKw='occultist',
      abilities=[at_end([choose(Q(ge(C('avail', '$me'), 1), opts('Pay 1', 'Take 1 damage'), opts('Take 1 damage')), '$y', 'The Lesser Bargain comes due'),
                         IF(eq('$y', 'Pay 1'), [C('spend', '$me', 1)], [dmg(bearerOf('$self'), 1)])])])
ATTR.append(bearer_term('The Lesser Bargain', 'W', 2))
asset("The Devil's Ledger", 'dawnstar', 4, 'Whenever you sacrifice an operative, gain 1 progress on your Master Plan (once per turn).', 'Every name. Every price. Every due date.',
      rarity='R', abilities=[trig('sacrificed', [plan_prog(1)], eq('$e.p', SELF_P), once_per_turn=True)])
operative('Lesser Imp', 'dawnstar', 1, 2, 0, 1, 1, 'Demon. When eliminated or sacrificed, deal 1 damage to an enemy operative.', 'Small. Spiteful. Bound by contract.', kws=('demon',))
RULE_TRIGGERS.append({'on': 'sacrificed', 'if': eq('$e.card', slug('Lesser Imp')), 'do': [
    choose(OPS(['opp', '$e.p']), '$v', 'Lesser Imp: 1 damage to which enemy?', 0, 1, who='$e.p'), IF(isObj('$v'), [['damage', '$v', 1, '$e.p']])]})
RULE_TRIGGERS.append({'on': 'eliminated', 'if': eq('$e.card', slug('Lesser Imp')), 'do': [
    choose(OPS(['opp', '$e.ctrl']), '$v', 'Lesser Imp: 1 damage to which enemy?', 0, 1, who='$e.ctrl'), IF(isObj('$v'), [['damage', '$v', 1, '$e.ctrl']])]})
operative('Bound Fiend', 'dawnstar', 3, 4, 1, 2, 4, 'Demon. Can\'t defend unless you control a Ritual.', 'It does what it is told. Only that.', kws=('demon',))
NODEF.append(AND(isc('$o', 'Bound Fiend'), NOT(ANY(SITES(ctrl('$o')), has('$it', 'ritual')))))
operative('Furnace of the Pit', 'dawnstar', 5, 6, 0, 3, 5, 'Demon. In Bloodshed, its side deals damage to every opposing participant.', 'The thermostat reads 666.', kws=('demon',), rarity='R')
RULE_TRIGGERS.append({'on': 'bloodshed', 'if': ANY(OPS(), AND(isc('$it', 'Furnace of the Pit'), participating('$it'))), 'do': [
    LET('$fp', first(flt(OPS(), AND(isc('$it', 'Furnace of the Pit'), participating('$it'))))),
    EACH(flt(OPS(['opp', ctrl('$fp')]), participating('$it')), '$x', [['damage', '$x', 1, ctrl('$fp')]])]})
operative('Pact Summoner', 'dawnstar', 2, 0, 1, 3, 2, 'Occultist. Your Demons cost 1 less.', 'Knows all the names. Pronounces them carefully.', kws=('occultist',))
COST.append(Q(AND(has('$c', 'demon'), own('Pact Summoner', '$p')), neg(cnt(live('Pact Summoner', '$p'))), 0))
facility('Circle of Summoning', 'dawnstar', 2, 'Ritual. Demons you play are Swift (they can attack the turn they arrive).', 'Salt, chalk, and a borrowed heartbeat.', kws=('ritual',))
SWIFT.append(AND(has('$o', 'demon'), ANY(SITES(ctrl('$o')), isc('$it', 'Circle of Summoning'))))
asset('Scripture Fragment: Ash', 'dawnstar', 1, 'Scripture. Your Occultists get +1 Will.', 'The first page burned for three hundred years.', kws=('scripture',))
ATTR.append(team_term('Scripture Fragment: Ash', 'W', 1, has('$o', 'occultist')))
asset('Scripture Fragment: Iron', 'dawnstar', 1, 'Scripture. Your Occultists get +1 Force.', 'Written on the inside of a sword.', kws=('scripture',))
ATTR.append(team_term('Scripture Fragment: Iron', 'F', 1, has('$o', 'occultist')))
operative('Archivist of the First Seal', 'dawnstar', 2, 0, 2, 2, 2, 'Occultist. When played, Scry 2; if you control two Scriptures, draw a card.', 'The library has no catalogue. She is the catalogue.',
          kws=('occultist',), deploy=[scry(2), IF(ge(cnt(SCRIPT()), 2), [draw(1)])])
operative('Senior Adept', 'dawnstar', 2, 1, 1, 4, 3, 'Occultist.', 'Thirty-second degree. Still climbing.', kws=('occultist',))
operative('Grand Master of the Lodge', 'dawnstar', 5, 2, 3, 5, 4, 'Unique Occultist. Your other Occultists get +1 Will.', 'He shook hands with four presidents. They all felt it.',
          kws=('occultist', 'unique'), rarity='M')
ATTR.append(Q(AND(A_('W'), has('$o', 'occultist'), NOT(isc('$o', 'Grand Master of the Lodge')), own('Grand Master of the Lodge', ctrl('$o'))), 1, 0))
facility('The Seventh Circle', 'dawnstar', 3, 'Ritual. At the start of your turn, if you control two or more Scriptures, gain 1 progress on your Master Plan.', 'Below the sixth. Above nothing.',
         kws=('ritual',), abilities=[at_start([plan_prog(1)], ge(cnt(SCRIPT()), 2))])
operation('Rite of the Broken Seal', 'dawnstar', 3, 'Gain 1 progress on your Master Plan, plus 1 if you control two or more Scriptures.', 'Seven seals. Six already broken.',
          do=[plan_prog(Q(ge(cnt(SCRIPT()), 2), 2, 1))])

operation('Return of the Faithful', 'dawnstar', 2, 'Return up to two Occultists or Demons that cost 2 or less from your discard pile to your hand.', 'Death is a leave of absence.',
          do=[choose(flt(GRAVE('$me'), AND(OR(has('$it', 'occultist'), has('$it', 'demon')), le(g('$it', 'cost'), 2))), '$xs', 'Return which (up to two)?', 0, 2),
              EACH('$xs', '$x', [['move', '$x', 'hand']])])

# ================================================================ Illuminati: old money and the deep state
CONTR = lambda p='$me': kind_ops(p, 'contractor')
hq('The Central Committee', 'illuminati', 'Security 3. Doctrine (Bribery): during Responses, pay 2 Influence: your side gets +1 to the mission\'s attribute (up to three times each mission). Your Blackmail missions use Tradecraft, and winning one also gives you 2 temporary Influence. At the start of your turn, gain 1 temporary Influence.',
   'The pyramid on the dollar is a floor plan.',
   abilities=[at_start([tmp(1)])],
   rabil=[abil('Bribery: pay 2 for +1', [INC('game', 'brb', 1), side_bonus('$me', 1)], cost=[C('spend', '$me', 2)],
               req=[(AND(IN_MISSION, lt(g('game', 'brb'), 3), ge(C('avail', '$me'), 2)), 'During a mission, up to three times, with 2 Influence')], once=False, phases=('respond',))])
plan('The New World Compact', 'illuminati', 'T', 'Master Plan (Tradecraft). Enacted: at the start of your turn, gain 1 progress on a Conspiracy Agenda.',
     'Signed in Davos. Ratified nowhere. Enforced everywhere.')
RULE_TRIGGERS.append({'on': 'refresh', 'if': plan_on('$e.p', 'The New World Compact'), 'do': [
    choose(ROW, '$ag', 'The New World Compact: gain 1 progress on which Agenda?', 1, 1, who='$e.p'), C('addProg', '$ag', '$e.p', 1)]})
operative('Junior Broker', 'illuminati', 1, 0, 2, 1, 2, 'At the start of your turn, if you control a Bank, gain 1 temporary Influence.', 'Twenty-four, Princeton, owns a jet.',
          abilities=[at_start([tmp(1)], ANY(SITES('$me'), has('$it', 'bank')))])
facility('Offshore Holding Company', 'illuminati', 2, 'Bank. At the start of your turn, gain 1 temporary Influence.', 'Registered at a post office box in the Caymans. So are four thousand others.',
         kws=('bank',), abilities=[at_start([tmp(1)])])
operation('Cash Transfer', 'illuminati', 1, 'Gain 3 temporary Influence.', 'Wire it through Cyprus.', do=[tmp(3)])
operation('Buy the Story', 'illuminati', 3, 'Gain 1 progress on a Conspiracy Agenda you already have progress on.', 'Every newspaper has an owner.',
          do=[C('addProg', '$t', '$me', 1)], targets=[slot(flt(ROW, gt(C('progOf', '$it', '$me'), 0)), prompt='Which Agenda?')])
facility('Lobbying Office', 'illuminati', 2, 'Institution. Whenever you win a mission, put a Mandate counter here. Remove 2 Mandate counters: gain 1 progress on a Conspiracy Agenda.',
         'K Street. The lights are always on.', kws=('institution',),
         abilities=[on_win([INC('$self', 'mand', 1)])],
         abil=[abil('Remove 2 Mandates: 1 progress on an Agenda', [INC('$self', 'mand', -2), C('addProg', '$t', '$me', 1)],
                    req=[(ge(g('$self', 'mand'), 2), 'Needs two Mandate counters')], targets=[slot(ROW, prompt='Which Agenda?')], once=False)])
operative('Compromised Minister', 'illuminati', 3, 0, 4, 2, 3, 'Official. Your Institutions cost 1 less. Your Institutions get +1 Mandate when you win a Tradecraft mission.',
          'He sold his country once. He sells it monthly now.', kws=('official',),
          abilities=[on_win([EACH(flt(SITES('$me'), has('$it', 'institution')), '$x', [INC('$x', 'mand', 1)])], eq('$e.attr', 2))])
COST.append(Q(AND(has('$c', 'institution'), own('Compromised Minister', '$p')), -1, 0))
operative('Special Prosecutor', 'illuminati', 3, 1, 4, 2, 3, 'When its side wins a mission it joined, the opponent discards a card.', 'The investigation is ongoing. It will always be ongoing.',
          abilities=[on_win([C('discardN', '$opp', 1)], attacking('$self'))])
response('Emergency Injunction', 'illuminati', 1, 'The opponent\'s side gets -2 to the mission\'s attribute unless they pay 2 Influence.', 'Granted at 3 a.m. by a judge who owed a favor.',
         do=[LET('$q', '$opp'), choose(Q(ge(C('avail', '$opp'), 2), opts('Pay 2', 'Take -2'), opts('Take -2')), '$y', 'Emergency Injunction: pay 2 or your side gets -2', who='$opp'),
             IF(eq('$y', 'Pay 2'), [C('spend', '$opp', 2)], [side_bonus('$opp', -2)])], req=[(IN_MISSION, 'Only during a mission')])
operation('Public Scandal', 'illuminati', 2, 'The opponent loses 1 progress on each Conspiracy Agenda and 1 on their Master Plan.', 'Leaked on a Friday. Buried by Monday. Their careers: buried forever.',
          do=[EACH(ROW, '$x', [C('loseProg', '$x', '$opp', 1)]), C('loseProg', PLAN('$opp'), '$opp', 1)])
operative('Disposable Fixer', 'illuminati', 1, 2, 2, 0, 2, 'Contractor. When eliminated, draw a card.', 'No name. No record. No funeral.', kws=('contractor',))
RULE_TRIGGERS.append({'on': 'eliminated', 'if': eq('$e.card', slug('Disposable Fixer')), 'do': [['draw', '$e.ctrl', 1]]})
operative('Contracted Surveillance', 'illuminati', 1, 0, 2, 1, 2, 'Contractor. Swift.', 'Paid by the hour. Watching by the second.', kws=('contractor', 'swift'))
operative('Mercenary Handler', 'illuminati', 3, 2, 3, 1, 3, 'Your Contractors get +1 Force and +1 Tradecraft.', '"Who signs the checks? You don\'t want to know. Neither do I."')
ATTR.append(Q(AND(OR(A_('F'), A_('T')), has('$o', 'contractor'), own('Mercenary Handler', ctrl('$o'))), cnt(live('Mercenary Handler', ctrl('$o'))), 0))
operative('Corporate Intervention Force', 'illuminati', 5, 5, 3, 1, 4, 'Contractor. When played, create two 1/1/0 Contractor tokens.', 'Private army. Public contract.',
          kws=('contractor',), rarity='R', deploy=[token('Contractor', 2)])
response('Deniable Payment', 'illuminati', 1, 'A participating Contractor gets +3 to the mission\'s attribute. Sacrifice it after the mission.', 'It never happened. Neither did he.',
         do=[mission_bonus('$t', 3), SET('$t', 'sacAfter', 1)], targets=[slot(flt(CONTR(), participating('$it')), prompt='Which Contractor?')], req=[(IN_MISSION, 'Only during a mission')])
RULE_TRIGGERS.append({'on': 'missionResult', 'do': [EACH(flt(OPS(), eq(g('$it', 'sacAfter'), 1)), '$x', [C('sacrifice', '$x')])]})
operative('Executive Protection Detail', 'illuminati', 3, 3, 2, 1, 3, 'Contractor. Ambush (can defend while exhausted).', 'Earpieces. Sunglasses. No reflections.', kws=('contractor', 'ambush'))
operative('Municipal Fixer', 'illuminati', 2, 0, 3, 1, 2, '+2 Tradecraft while defending.', 'Zoning, permits, and where the bodies are buried. Literally.')
ATTR.append(self_term('Municipal Fixer', 'T', 2, defending('$o')))

operation('Hostile Takeover', 'illuminati', 4, 'Take control of an enemy Facility.', 'The board voted unanimously. The board did not know it had been sold.',
          do=[['control', '$t', '$me']], targets=[slot(SITES('$opp'), prompt='Acquire which Facility?')])

# ================================================================ Children of the High-Ones: the UFO cult
CULT = lambda p='$me': kind_ops(p, 'cultist')
ENT = lambda p='$me': kind_ops(p, 'entity')
REV = g('$me', 'rev')
hq('The First Contact House', 'children', 'Security 3. Doctrine (Congregation): you may send up to 5 operatives on a mission. Whenever a Cultist you control is eliminated, gain 1 Revelation. At the start of your turn, gain 1 Revelation.', 'A farmhouse in New Mexico. The crop circles started in 1947.',
   abilities=[at_start([rev(1)])])
plan('The Great Arrival', 'children', 'W', 'Master Plan (Will). Enacted: create the High-One Manifestation (7/4/8, Health 9), ready, and exhaust all enemy operatives.',
     'They are not coming. They are already here. They are waiting to be invited.',
     onEnact=[token('High-One Manifestation'), EACH(OPP_OPS, '$x', [exhaust('$x')])])
operative('Street Preacher', 'children', 1, 0, 1, 2, 3, 'Cultist. When its side wins a mission it joined, create a 0/1/1 Cultist token.', '"They told me the date. It is sooner than you think."',
          kws=('cultist',), abilities=[on_win([token('Cultist')], attacking('$self'))])
operation('Community Outreach', 'children', 1, 'Create two 0/1/1 Cultist tokens.', 'Free soup. Free pamphlets. Free forever.', do=[token('Cultist', 2)])
operative('Ecstatic Convert', 'children', 1, 1, 1, 2, 3, 'Cultist. +1 Will while another Cultist participates in its mission.', 'She has not slept since the light.', kws=('cultist',))
ATTR.append(self_term('Ecstatic Convert', 'W', 1, AND(participating('$o'), ANY(OPS(ctrl('$o')), AND(ne('$it', '$o'), participating('$it'), has('$it', 'cultist'))))))
operative('Cell Organizer', 'children', 3, 1, 2, 3, 3, 'Cultist. Your Cultist tokens get +1 Will and +1 Tradecraft.', 'Each cell knows three names. Each name knows the date.', kws=('cultist',))
ATTR.append(Q(AND(OR(A_('W'), A_('T')), has('$o', 'cultist'), has('$o', 'token'), own('Cell Organizer', ctrl('$o'))), 1, 0))
facility('Recruitment Circle', 'children', 2, 'At the start of your turn, create a 0/1/1 Cultist token.', 'Every Tuesday, 7 p.m. Bring a friend. Bring everyone.',
         abilities=[at_start([token('Cultist')])])
operation('The Gathering', 'children', 2, 'If you control four or more Cultists, gain 1 progress on a Will Agenda and 1 Revelation.', 'Ten thousand voices. One frequency.',
          do=[C('addProg', '$t', '$me', 1), rev(1)], targets=[slot(flt(ROW, eq(g('$it', 'mattr'), 3)), prompt='Which Will Agenda?')],
          req=[(ge(cnt(CULT()), 4), 'Needs four Cultists')])
asset('Recovered Probe', 'children', 1, 'Artifact. Attach to an operative: +1 Tradecraft. When its side wins a mission, gain 1 Revelation.', 'Smaller than a fist. Warmer than skin.',
      kws=('artifact',), attach=1, abilities=[on_win([rev(1)], participating(bearerOf('$self')))])
ATTR.append(bearer_term('Recovered Probe', 'T', 1))
asset('Unidentified Alloy', 'children', 2, 'Artifact. Attach to an operative: +1 Force and +2 Health.', 'Bends. Never breaks. Remembers its shape.', kws=('artifact',), attach=1)
ATTR.append(bearer_term('Unidentified Alloy', 'F', 1)); HP.append(mul(gear_n('$o', 'Unidentified Alloy'), 2))
asset('Neural Disruptor', 'children', 3, 'Artifact. Attach to an operative. When it attacks, exhaust an enemy operative with 2 or less Will before defenders are assigned.',
      'It hums in a key that makes you forget your name.', kws=('artifact',), attach=1)
PRE_DEFEND.append(IF(ANY(ATK, gt(gear_n('$it', 'Neural Disruptor'), 0)), [
    choose(flt(OPS('$opp'), AND(ready_('$it'), le(C('attr', '$it', 3), 2))), '$v', 'Neural Disruptor: exhaust which enemy?', 0, 1), IF(isObj('$v'), [exhaust('$v')])]))
operative('Contact Engineer', 'children', 2, 1, 2, 3, 3, 'Cultist. Your Artifacts cost 1 less.', 'Reverse engineering. Mostly reverse.', kws=('cultist',))
COST.append(Q(AND(has('$c', 'artifact'), own('Contact Engineer', '$p')), -1, 0))
asset('Antigravity Harness', 'children', 2, 'Artifact. Attach to an operative: +1 Tradecraft; it is Swift.', 'Do not wear it indoors.', kws=('artifact',), attach=1)
ATTR.append(bearer_term('Antigravity Harness', 'T', 1)); SWIFT.append(gt(gear_n('$o', 'Antigravity Harness'), 0))
operative('Whispering Devotee', 'children', 1, 0, 1, 2, 2, 'Cultist. When eliminated, gain 1 Revelation.', 'She whispers the coordinates. Over and over.', kws=('cultist',))
RULE_TRIGGERS.append({'on': 'eliminated', 'if': eq('$e.card', slug('Whispering Devotee')), 'do': [C('gainRev', '$e.ctrl', 1)]})
operative('Rift Attendant', 'children', 2, 1, 1, 3, 3, 'Cultist. Your Entities cost 2 less while you have 4 or more Revelation.', 'She keeps the door. She does not decide who comes through.', kws=('cultist',))
COST.append(Q(AND(has('$c', 'entity'), ge(g('$p', 'rev'), 4), own('Rift Attendant', '$p')), -2, 0))
operative('Manifestation of Hunger', 'children', 4, 5, 1, 4, 5, 'Entity. At the end of your turn, sacrifice a Cultist or deal 2 damage to it.', 'It ate the farmhouse dog first. Then the farmhouse.',
          kws=('entity',), abilities=[at_end([choose(Q(gt(cnt(flt(CULT(), ne('$it', '$self'))), 0), opts('Sacrifice a Cultist', 'Take 2 damage'), opts('Take 2 damage')), '$y', 'Manifestation of Hunger hungers'),
                                             IF(eq('$y', 'Sacrifice a Cultist'), [pick(flt(CULT(), ne('$it', '$self')), '$v', 'Sacrifice which Cultist?'), sacrifice('$v')], [dmg('$self', 2)])])])
operative('Gateway Custodian', 'children', 6, 6, 2, 6, 6, 'Entity. Play only if you have 3 or more Revelation. When played, exhaust up to two enemy operatives.', 'The door is open. It was always going to open.',
          kws=('entity',), rarity='R', deploy=[choose(OPP_OPS, '$xs', 'Exhaust up to two enemy operatives', 0, 2), EACH('$xs', '$x', [exhaust('$x')])])
PLAYREQ.append(OR(NOT(isc('$it', 'Gateway Custodian')), ge(g('$me', 'rev'), 3)))
response('Scream Across Dimensions', 'children', 2, 'Your side gets +1 to the mission\'s attribute for every 2 Revelation you have (max +4).', 'Every radio on Earth played it at once.',
         do=[side_bonus('$me', mn(4, ['/', REV, 2]))], req=[(IN_MISSION, 'Only during a mission')])
operation('The First Unmaking', 'children', 5, 'Play only if you have 6 or more Revelation. Deal 3 damage to each enemy operative.', 'Unmaking is easier than making. Ask any god.',
          do=[EACH(OPP_OPS, '$x', [dmg('$x', 3)])], req=[(ge(REV, 6), 'Needs 6 Revelation')], rarity='M')

response('Night of the Lights', 'children', 2, 'Your side gets +1 to the mission\'s attribute for each Cultist you control on the mission.', 'Ten thousand people looked up at once.',
         do=[side_bonus('$me', cnt(flt(MY_SIDE(), has('$it', 'cultist'))))], req=[(IN_MISSION, 'Only during a mission')])
CULT_IDS = [c['id'] for c in CARDS if 'cultist' in c.get('keywords', [])]
RULE_TRIGGERS.append({'on': 'eliminated', 'if': AND(is_fac('$e.ctrl', 'children'), inl('$e.card', lit(CULT_IDS))), 'do': [C('gainRev', '$e.ctrl', 1)]})

# ================================================================ Neutral
operative('Freelance Investigator', 'neutral', 1, 0, 2, 1, 2, 'When its side wins a mission it joined, Scry 1.', 'Ex-cop. Ex-husband. Ex-believer.',
          abilities=[on_win([scry(1)], attacking('$self'))])
operative('Ex-Military Bodyguard', 'neutral', 2, 3, 1, 1, 3, '+2 Force while defending.', 'He took a bullet in Beirut. He would take another.')
ATTR.append(self_term('Ex-Military Bodyguard', 'F', 2, defending('$o')))
operative('Street Informant', 'neutral', 1, 0, 1, 1, 2, 'When played, look at a random card in the opponent\'s hand.', 'Twenty dollars buys a name. Fifty buys the truth.', deploy=[peek()])
operative('Crisis Negotiator', 'neutral', 3, 0, 3, 3, 3, 'When your side defends successfully with it, draw a card.', '"Nobody has to die today. Probably."',
          abilities=[on_defended([draw(1)], defending('$self'))])
operative('Black-Bag Specialist', 'neutral', 2, 2, 3, 0, 2, 'Covert.', 'In, out, and the safe is still locked.', kws=('covert',))
operative('Mercenary Sniper', 'neutral', 3, 4, 2, 0, 2, 'In Bloodshed, its side deals 1 extra damage.', 'Twelve hundred meters. Crosswind. No problem.')
BLOOD.append(('atk', Q(ANY(ATK, isc('$it', 'Mercenary Sniper')), 1, 0))); BLOOD.append(('def', Q(ANY(DFN, isc('$it', 'Mercenary Sniper')), 1, 0)))
operative('The Untraceable Asset', 'neutral', 5, 3, 4, 4, 4, 'Unique. When its side wins a mission it joined, draw a card or gain 2 temporary Influence.', 'Nobody hired her. Everyone paid her.',
          kws=('unique',), rarity='M', abilities=[on_win([choose(opts('Draw a card', 'Gain 2 temporary Influence'), '$y', 'The Untraceable Asset'),
                                                         IF(eq('$y', 'Draw a card'), [draw(1)], [tmp(2)])], attacking('$self'))])
asset('Silenced Sidearm', 'neutral', 1, 'Gear. Attach to an operative: +1 Force.', 'Quiet is relative.', kws=('gear',), attach=1)
ATTR.append(bearer_term('Silenced Sidearm', 'F', 1))
asset('Body Armor', 'neutral', 1, 'Gear. Attach to an operative: +2 Health.', 'Rated for most things.', kws=('gear',), attach=1)
HP.append(mul(gear_n('$o', 'Body Armor'), 2))
asset('Encrypted Radio', 'neutral', 1, 'Gear. Attach to an operative: +1 Tradecraft and +1 Will.', 'Four layers of encryption. One of them is a prayer.', kws=('gear',), attach=1)
ATTR.append(bearer_term('Encrypted Radio', 'T', 1)); ATTR.append(bearer_term('Encrypted Radio', 'W', 1))
response('Ambush', 'neutral', 1, 'A defender gets +2 to the mission\'s attribute.', 'They were expecting you.',
         do=[mission_bonus('$t', 2)], targets=[slot(flt(ME_OPS, defending('$it')), prompt='Which defender?')], req=[(THEIRS, 'Only while defending')])
response('Inside Tip', 'neutral', 1, 'An attacker gets +2 to the mission\'s attribute.', 'The guard changes at 2:10. The camera loops at 2:11.',
         do=[mission_bonus('$t', 2)], targets=[slot(flt(ME_OPS, attacking('$it')), prompt='Which attacker?')], req=[(MY, 'Only in your mission')])
response('False Alarm', 'neutral', 1, 'The attacker pays 2 Influence or the mission is cancelled.', 'Somebody pulled the fire alarm. Somebody was paid to.',
         do=[choose(Q(ge(C('avail', ATTACKER), 2), opts('Pay 2', 'Abort the mission'), opts('Abort the mission')), '$y', 'False Alarm: pay 2 or abort?', who=ATTACKER),
             IF(eq('$y', 'Pay 2'), [C('spend', ATTACKER, 2)], [SET('game', 'mcan', 1), emit('missionCancelled', by='$me')])], req=[(THEIRS, 'Only against an opposing mission')])
response('Tactical Withdrawal', 'neutral', 1, 'Remove one of your participants from the mission. Prevent all damage to it this turn.', 'Live to lie another day.',
         do=[SET('$t', 'atk', 0), SET('$t', 'dfn', 0), SET('$t', 'pv', 99)], targets=[slot(flt(ME_OPS, participating('$it')), prompt='Withdraw which operative?')],
         req=[(IN_MISSION, 'Only during a mission')])
facility('Safehouse', 'neutral', 1, 'Once per turn, pay 1 Influence: prevent the next 2 damage to one of your operatives this turn. (Usable during missions.)', 'Third floor, behind the laundromat.',
         abil=[abil('Pay 1: prevent 2 damage', [INC('$t', 'pv', 2)], cost=[C('spend', '$me', 1)], req=[(ge(C('avail', '$me'), 1), 'Needs 1 Influence')], targets=[slot(ME_OPS, prompt='Protect whom?')])],
         rabil=[abil('Pay 1: prevent 2 damage', [INC('$t', 'pv', 2)], cost=[C('spend', '$me', 1)], req=[(ge(C('avail', '$me'), 1), 'Needs 1 Influence')],
                     targets=[slot(ME_OPS, prompt='Protect whom?')], phases=('respond',))])
operation('Extraction Team', 'neutral', 2, 'Return an operative from your discard pile to your hand.', 'Nobody gets left behind. Nobody important.',
          do=[['move', '$t', 'hand']], targets=[slot(flt(GRAVE('$me'), typ('$it', 'operative')), prompt='Return which operative?')])
operation('Dead Drop', 'neutral', 1, 'Draw 2 cards, then discard a card.', 'Behind the loose brick. Third from the left.', do=[draw(2), C('discardN', '$me', 1)])
operation('Leak to the Press', 'neutral', 2, 'The opponent loses 2 progress on a Conspiracy Agenda.', 'Page one. Above the fold.',
          do=[C('loseProg', '$t', '$opp', 2)], targets=[slot(flt(ROW, gt(C('progOf', '$it', '$opp'), 0)), prompt='Which Agenda?')])
response('Plausible Deniability', 'neutral', 2, 'Your side gets +1 to the mission\'s attribute, and your participants take 1 less damage this mission.', 'Nobody was there. Especially not us.',
         do=[side_bonus('$me', 1), EACH(MY_SIDE(), '$x', [INC('$x', 'pv', 1)])], req=[(IN_MISSION, 'Only during a mission')])

# ================================================================ starter decks (40 cards each)
def deck(hq_, plan_, cards):
    main = []
    for n, name in cards: main += [slug(name)] * n
    assert len(main) == 40, (hq_, len(main))
    return {'hq': [slug(hq_)], 'plan': [slug(plan_)], 'deck': main}
DECKS['psylist-starter'] = deck('PsyList Central Station', 'Project OVERMIND', [
    (3, 'Remote Viewer'), (2, 'Precog Analyst'), (3, 'Telekinetic Recruit'), (2, 'Pyrokinetic Enforcer'), (1, 'Subject Zero'), (3, 'Compulsion Technician'),
    (2, 'Sleeper Handler'), (2, 'Collective Mind'), (1, 'Communal Mind'), (2, 'Precognitive Flash'), (2, 'Hypnotic Trigger'), (1, 'Poltergeist Burst'), (1, 'Foresight'),
    (2, 'Mind Spike'), (1, 'Reprogram Identity'), (1, 'Sensory Deprivation Tank'), (1, 'The White Noise Suite'), (2, 'Neural Link'),
    (2, 'Ex-Military Bodyguard'), (2, 'Crisis Negotiator'), (1, 'Body Armor'), (2, 'Ambush'), (1, 'Mass Suggestion')])
DECKS['prendick-starter'] = deck('Prendick Holdings Tower', 'Project CHIMERA', [
    (3, 'Security Hound-9'), (3, 'Razorback Hybrid'), (2, 'Alpha Predator'), (1, 'Prototype Behemoth'), (2, 'Mutation Handler'), (3, 'Human-Passing Duplicate'),
    (2, 'Infiltrator Brood'), (1, 'Mimicry Specialist'), (2, 'Clinical Research Liaison'), (2, 'Anatomical Reinforcement'), (2, 'Perfect Skin Graft'),
    (1, 'Hypermetabolic Serum'), (2, 'Adrenal Reservoir'), (2, 'Break Containment'), (1, 'Biomedicine Annex 14'), (1, 'Venture Consortium'),
    (2, 'Quarterly Earnings'), (2, 'The Glass Nursery'), (2, 'Crisis Negotiator'), (1, 'Inside Tip'), (2, 'Regenerative Tissue'), (1, 'Feeding Frenzy')])
DECKS['dawnstar-starter'] = deck('Dawn Star Grand Lodge', 'The Morning Star Descends', [
    (3, 'Ambitious Initiate'), (2, 'Written in Blood'), (2, 'Blood Offering'), (2, 'The Lesser Bargain'), (1, "The Devil's Ledger"), (3, 'Lesser Imp'),
    (2, 'Bound Fiend'), (1, 'Furnace of the Pit'), (2, 'Pact Summoner'), (1, 'Circle of Summoning'), (2, 'Scripture Fragment: Ash'), (2, 'Scripture Fragment: Iron'),
    (3, 'Archivist of the First Seal'), (3, 'Senior Adept'), (1, 'Grand Master of the Lodge'), (1, 'The Seventh Circle'), (2, 'Rite of the Broken Seal'),
    (2, 'Ex-Military Bodyguard'), (2, 'Return of the Faithful'), (2, 'Inside Tip'), (1, 'Body Armor')])
DECKS['illuminati-starter'] = deck('The Central Committee', 'The New World Compact', [
    (3, 'Junior Broker'), (2, 'Offshore Holding Company'), (2, 'Cash Transfer'), (2, 'Buy the Story'), (2, 'Lobbying Office'), (2, 'Compromised Minister'),
    (2, 'Special Prosecutor'), (2, 'Emergency Injunction'), (1, 'Public Scandal'), (3, 'Disposable Fixer'), (3, 'Contracted Surveillance'), (2, 'Mercenary Handler'),
    (1, 'Corporate Intervention Force'), (1, 'Deniable Payment'), (2, 'Executive Protection Detail'), (3, 'Municipal Fixer'),
    (2, 'Crisis Negotiator'), (2, 'Mercenary Sniper'), (1, 'Silenced Sidearm'), (1, 'Ambush'), (1, 'Hostile Takeover')])
DECKS['children-starter'] = deck('The First Contact House', 'The Great Arrival', [
    (3, 'Street Preacher'), (2, 'Community Outreach'), (3, 'Ecstatic Convert'), (2, 'Cell Organizer'), (1, 'The Gathering'),
    (2, 'Recovered Probe'), (2, 'Unidentified Alloy'), (2, 'Neural Disruptor'), (2, 'Contact Engineer'), (1, 'Antigravity Harness'), (2, 'Whispering Devotee'),
    (2, 'Rift Attendant'), (2, 'Manifestation of Hunger'), (1, 'Gateway Custodian'), (2, 'Scream Across Dimensions'), (1, 'The First Unmaking'),
    (1, 'Ex-Military Bodyguard'), (2, 'Black-Bag Specialist'), (2, 'Silenced Sidearm'), (2, 'Recruitment Circle'), (1, 'Ambush'), (2, 'Night of the Lights')])
