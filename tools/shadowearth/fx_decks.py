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

DECKS['prendick-starter'] = deck('Prendick Holdings Headquarters', 'Genome Patent Monopoly', [
    (3, 'Security Hound-9'), (3, 'Razorback Hybrid'), (3, 'Human-Passing Duplicate'), (3, 'Lab-Born Vertebrate'), (2, 'Mutation Handler'),
    (3, 'Clinical Research Liaison'), (2, 'Molecular Patent Examiner'), (2, 'Alpha Predator'), (2, 'Mimicry Specialist'), (1, 'Infiltrator Brood'),
    (1, 'Recombinant Apex'), (1, 'Veterinary Surgical Team'),
    (2, 'Anatomical Reinforcement'), (3, 'Perfect Skin Graft'), (2, 'Hypermetabolic Serum'), (2, 'Specimen Transport'),
    (2, 'Prendick Biomedicine Annex 14'), (1, 'The Feeding Pens'), (1, 'Venture Consortium'),
    (2, 'Random Splice'), (2, 'Quarterly Earnings'), (2, 'Break Containment'), (2, 'False Credentials'),
    (2, 'Replacement Protocol'), (1, 'Sabotage')])

DECKS['dawnstar-starter'] = deck('Dawn Star Grand Lodge', 'Library of the Unspoken', [
    (3, 'Ambitious Initiate'), (2, 'Contract Notary'), (3, 'Archivist of the First Seal'), (3, 'Lodge Steward'), (2, 'Hereditary Patron'),
    (2, 'Senior Adept'), (3, 'Lesser Imp'), (2, 'Pact Summoner'), (3, 'Bound Fiend'), (1, 'Infernal Benefactor'), (1, 'Furnace of the Pit'),
    (2, 'Archivist of the Eighth Seal'),
    (2, 'The Lesser Bargain'), (2, 'Scripture Fragment: Ash'), (2, 'Scripture Fragment: Iron'), (2, 'Scripture Fragment: Dawn'),
    (1, 'Chain of Command'), (1, 'Censer of the Unspoken Name'),
    (2, 'Circle of Summoning'), (1, 'Private Lodge'),
    (2, 'Written in Blood'), (2, 'Forbidden Translation'), (2, 'Hellfire Lash'), (1, 'Unpaid Debt'),
    (1, 'Rite of the Broken Seal'), (2, 'The Door Opens Inward')])

DECKS['illuminati-starter'] = deck('The Central Committee', 'The Invisible Hand', [
    (3, 'Junior Broker'), (2, 'Investment Analyst'), (3, 'Municipal Fixer'), (2, 'Public Affairs Director'), (2, 'Compromised Minister'),
    (3, 'Contracted Surveillance'), (3, 'Disposable Fixer'), (2, 'Mercenary Handler'), (3, 'Compliance Officer'), (2, 'Special Prosecutor'),
    (2, 'Deputy Minister Corinne Voss'), (2, 'Executive Protection Detail'),
    (3, 'Offshore Holding Company'), (2, 'Lobbying Office'), (1, 'Audit Office'), (1, 'Cutout Company'), (1, 'Bilateral Immunity Agreement'),
    (3, 'Cash Transfer'), (1, 'Liquidity Injection'), (2, 'Deniable Payment'), (1, 'Emergency Injunction'),
    (2, 'False-Flag Operation'), (2, 'Public Scandal'), (2, 'Coalition Bargaining')])
