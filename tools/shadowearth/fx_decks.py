"""Shadow Earth starter decks (50 cards + Headquarters + Agenda). Every card in a starter deck is implemented."""
from lib import DECKS, slug

def deck(hq, agenda, cards):
    main = []
    for n, name in cards: main += [slug(name)] * n
    assert len(main) == 50, (hq, len(main))
    return {'hq': [slug(hq)], 'agenda': [slug(agenda)], 'deck': main}

DECKS['psylist-starter'] = deck('PsyList Central Station', 'The Listening World', [
    (3, 'Remote Viewer'), (3, 'Probability Analyst'), (3, 'Telekinetic Recruit'), (3, 'Psychic Shock Trooper'), (3, 'Untrained Sensitive'),
    (2, 'Circle Coordinator'), (3, 'Compulsion Technician'), (2, 'Pyrokinetic Enforcer'), (2, 'Sleeper Handler'), (1, 'Statistical Aberration'),
    (1, 'Communal Mind'), (2, 'Dr. Livia Saye, Containment Ethicist'),
    (2, 'Neural Link'), (1, 'Kinetic Shielding'),
    (1, 'Sensory Deprivation Tank'), (2, 'The White Noise Suite'), (1, 'Psi Amplifier'), (1, 'Voluntary Subject Registry'),
    (2, 'Group Meditation'), (1, 'Reprogram Identity'),
    (2, 'Precognitive Flash'), (2, 'Poltergeist Burst'), (2, 'Hypnotic Trigger'),
    (2, 'Collective Suggestion'), (2, 'Induced Suggestibility'), (1, 'Inside Tip')])
