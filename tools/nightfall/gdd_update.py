#!/usr/bin/env python3
"""Writes the balance-updated NIGHTFALL design document from the original GDD and the live levers in build.py.

    python3 tools/nightfall/gdd_update.py [original.docx] [out.docx]
    (defaults: docs/NIGHTFALL_GDD_v0.1.docx -> docs/NIGHTFALL_GDD.docx)

Every number the playtests changed is rewritten in place (keeping the document's styles), and a
"Revision 1.1: playtest balance" section is added before "Balance notes and next steps" listing each change
with the evidence for it. Re-run it after changing a lever so the document matches the game.
"""
import ast, copy, os, sys
import docx
from docx.shared import Pt

HERE = os.path.dirname(os.path.abspath(__file__))


def levers():
    tree = ast.parse(open(os.path.join(HERE, 'build.py')).read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', '') == 'LEVERS':
            return ast.literal_eval(node.value)
    raise SystemExit('LEVERS not found in build.py')


def paragraphs(doc):
    yield from doc.paragraphs
    for t in doc.tables:
        for row in t.rows:
            for cell in row.cells:
                yield from cell.paragraphs


def replace(par, old, new):
    """Replaces text in a paragraph, inside one run when possible (keeps mixed formatting), else across runs."""
    if old not in par.text:
        return False
    for r in par.runs:
        if old in r.text:
            r.text = r.text.replace(old, new)
            return True
    full = par.text.replace(old, new)
    runs = par.runs
    runs[0].text = full
    for r in runs[1:]:
        r.text = ''
    return True


def main(src, out):
    L = levers()
    BC, AW, GS = L['BODYCOUNT_WIN'], L['AWAKEN'], L['GESTATION_RISE']
    n = lambda k: str(L[k])
    edits = [
        ('Game Design Document · v0.1 · Nov 21, 2026', 'Game Design Document · v1.1 (playtest balance) · Nov 22, 2026'),
        # Slasher Body Count
        ('Body Count: 13 victims wins', f'Body Count: {BC} victims wins'),
        ('Slasher Body Count reaches 13', f'Slasher Body Count reaches {BC}'),
        ('a 13-step Body Count', f'a {BC}-step Body Count'),
        ('At 13 Victims, you win.', f'At {BC} Victims, you win.'),
        ('race to 13 Victims', f'race to {BC} Victims'),
        # Turn structure and Strikes
        ('Draw: draw 1 card.', 'Draw: draw 1 card (Slasher Killers and the Devil\'s Own draw 2).' if L['DRAW_SLASHER'] and L['DRAW_DEVIL'] else 'Draw: draw 1 card.'),
        ('Only if no ready enemy unit is in the district',
         f'Only if no ready enemy unit is in the district. One Strike per district each turn, dealing at most {n("STRIKE_DAMAGE")}'),
        # Blood Cabal
        ('At Gather, gain 1, plus 1 for each Thrall.', f'At Gather, gain {n("GATHER_CABAL")}, plus 1 for each Thrall.'),
        ('At your Toll, if your total Influence in a Living district is at least its remaining Citizens, you Dominate it.',
         'At your Toll, if you have a Vampire in a Living district and your total Influence there is at least its remaining Citizens, you Dominate it.'
         if L['DOM_VAMPIRE'] else None),
        # Harvest Cult
        ('At Gather, gain 1, plus any Yields.', f'At Gather, gain {n("GATHER_HARVEST")}, plus any Yields.'),
        ('Awaken 10 Offerings', f'Awaken {AW} Offerings'),
        ('Awaken 10', f'Awaken {AW}'),
        ('with 10 Offerings', f'with {AW} Offerings'),
        # Zombie Horde
        ("At Gather, gain 2 (Site 9's supply lines still run).",
         f"At Gather, gain {n('GATHER_ZOMBIE')} (Site 9's supply lines still run)." if L['GATHER_ZOMBIE'] else
         "No Gather income: Site 9's supply lines are cut, so the Horde lives off the Morgue, Devours and sacrifices."),
        ('Sacrifice a Shambler to pay 1 Biomass of any cost.',
         'Sacrifice a Shambler to pay 1 Biomass of any cost. A sacrifice is a payment, not a death: it doesn\'t trigger the Morgue or death effects.'),
        ('When a Shambler Preys, return the Citizen to the supply and gain 1 Biomass.',
         'When a card makes a Shambler Devour (Feeding Frenzy), return the Citizen to the supply and gain 1 Biomass. Shamblers never Prey on their own.'
         if not L['SHAMBLER_PREY'] else None),
        ('1/1 tokens that count as Zombies. They are Slow: they move only through card effects.',
         '1/1 tokens that count as Zombies. They are Slow: they move only through card effects. They are Mindless: they can\'t Prey or Strike, '
         'but they Clash, Intercept, count for Spread and Overrun, and pay costs.' if not (L['SHAMBLER_PREY'] or L['SHAMBLER_STRIKE']) else None),
        ('At your Rise, in each district where you have 3 or more Zombies, Infect 1 Citizen.',
         'At your Rise, choose one district where you have 3 or more Zombies and Infect 1 Citizen there.' if L['SPREAD_ONCE'] else None),
        ('number at least twice its remaining Citizens', f'number at least {"twice" if L["OVERRUN_RATIO"] == 2 else str(L["OVERRUN_RATIO"]) + " times"} its remaining Citizens'),
        # Slasher Killers
        ('You start with 2. At Gather, gain 1. Gain 1 more for every Mortal a Killer kills',
         f'You start with 2. At Gather, gain {n("GATHER_SLASHER")}. Gain 1 more for every Mortal a Killer kills'),
        # Devil's Own
        ('Dark Gift (exhaust, 3 Sin): search your deck for a Vessel', 'Dark Gift (exhaust, 2 Sin): search your deck for a Vessel'),
        ('You start with 2. At Gather, gain 1. Gain 1 more whenever your opponent takes a Citizen',
         f'You start with 2. At Gather, gain {n("GATHER_DEVIL")}. Gain 1 more whenever your opponent takes a Citizen'),
        ('Gestation runs from 0 to 9 and only moves forward while you control a Vessel.',
         f'Gestation starts at {n("GEST_START")}, runs to 9 and only moves forward while you control a Vessel. At each of your Rises with a Vessel, Gestation +{GS}.'),
        ('three Birthmarks (+1 each), Ravens (+2), Tithe (+2) and Blood Moon (+3) total 10.',
         f'you start at {n("GEST_START")} and gain {GS} at each Rise with a Vessel, so a Vessel kept alive for a few turns does most of the work. '
         'Omens close the gap: Birthmarks +1 each, Ravens +2, Tithe +2 and Blood Moon +3.'),
        # Cards
        ('Move up to 2 Citizens from one district to an adjacent district.',
         'Move up to 2 Citizens from one district with 2 or more Citizens to an adjacent district. At least 1 Citizen stays behind.'),
    ]
    doc = docx.Document(src)
    done = {}
    for par in paragraphs(doc):
        for old, new in edits:
            if new is not None and old != new and replace(par, old, new):
                done[old] = done.get(old, 0) + 1
    missed = [o for o, nw in edits if nw is not None and o != nw and o not in done]

    # ---- Revision section, inserted before "Balance notes and next steps"
    anchor = next(p for p in doc.paragraphs if p.text.startswith('Balance notes and next steps'))
    def para_before(text, style):
        p = anchor.insert_paragraph_before(text, style=style)
        return p
    para_before('Revision 1.1: playtest balance', anchor.style.name)
    para_before('The digital version plays every faction pairing with an AI that sees only what a player sees. Version 0.1 '
                'ended Zombie Horde 100%, Blood Cabal 88%, Harvest Cult 44%, Slasher Killers 38% and Devil\'s Own 6% '
                '(win rate across all pairings). After these changes, 80 games ended Zombie Horde 53%, Blood Cabal 63%, Harvest Cult 50%, Devil\'s Own 47% and Slasher Killers 38%. Every signature victory now happens in play.', 'Normal')
    rows = [
        ('Change', 'v0.1', 'v1.1', 'Why'),
        ('Strikes', 'Each unit Strikes for its full Menace', f'One Strike per district per turn, at most {n("STRIKE_DAMAGE")} damage',
         'Strikes decided two games in three (about 6.6 per game); the City barely mattered.'),
        ('Shamblers', 'Prey (Devour) and Strike', 'Mindless: no Prey, no Strike; Feeding Frenzy still makes them Devour',
         'Every Infect made a free Shambler that Preyed next turn, an exponential snowball that emptied two districts by turn 6.'),
        ('Spread', 'Every district with 3+ Zombies', 'One district of your choice', 'Same snowball, from the Rise side.'),
        ('Zombie Gather', '2', n('GATHER_ZOMBIE'), 'The Horde floated 14 unspent Biomass a game, and still won about 65% with mindless Shamblers; '
         'living off the Morgue brought it to about 50%.'),
        ('Sacrifice', 'Counted as a death', 'A payment, not a death', 'Bug: sacrifice + Morgue + Patient Zero paid 3 Biomass per token.'),
        ('Domination', 'Influence ≥ Citizens', 'Also needs one of your Vampires there' if L['DOM_VAMPIRE'] else 'Influence ≥ Citizens',
         'The design\'s own lever. Cabal won 84% by Dominating with Puppets and Influence alone.'),
        ('Evacuation Order', 'Move 2 Citizens', 'Leaves at least 1 Citizen behind', 'Prey + Evacuation Order claimed the Subway on turn 1.'),
        ('Slasher Gather / Draw', '1 / 1 card', f'{n("GATHER_SLASHER")} / {1 + L["DRAW_SLASHER"]} cards',
         'Slashers ended games with 1.3 cards in hand: Lurking eats a card every turn.'),
        ('Body Count', '13', str(BC), 'Average Body Count at game end was 5; 13 was out of reach.'),
        ('Harvest Gather', '1 + Yields', f'{n("GATHER_HARVEST")} + Yields', 'The Cult ended games with 6–8 unplayable cards and no Bounty.'),
        ('Awaken', '10', str(AW), 'Offerings averaged 2–4 at game end; the Old One woke in 1 game in 40.'),
        ('Devil Gather / Draw', '1 / 1 card', f'{n("GATHER_DEVIL")} / {1 + L["DRAW_DEVIL"]} cards', 'The Devil was short of cards to find Omens and its Vessel.'),
        ('Gestation', 'Starts 0; Omens only', f'Starts {n("GEST_START")}; +{GS} at each Rise with a Vessel',
         'Omens were fulfilled about once in three games; the Nativity almost never happened.'),
        ('Augustin\'s Dark Gift', '3 Sin', '2 Sin', 'The Vessel search was too dear to use early, and the Prophecy needs a Vessel.'),
    ]
    ref = doc.tables[-1]  # the existing balance table: copy its look
    tbl = doc.add_table(rows=len(rows), cols=4)
    tbl.style = ref.style
    borders = ref._tbl.tblPr.find(docx.oxml.ns.qn('w:tblBorders'))
    if borders is not None: tbl._tbl.tblPr.append(copy.deepcopy(borders))
    elif 'Table Grid' in [s.name for s in doc.styles]: tbl.style = 'Table Grid'
    for i, r in enumerate(rows):
        for j, text in enumerate(r):
            cell = tbl.rows[i].cells[j]
            cell.text = text
            if i == 0:
                for run in cell.paragraphs[0].runs: run.bold = True
            for run in cell.paragraphs[0].runs: run.font.size = Pt(9)
    anchor._p.addprevious(tbl._tbl)
    para_before('', 'Normal')
    para_before('The AI also changed: it now scores every move after its turn would end, so it stops making aimless moves '
                'instead of passing. Re-run tools/nightfall/playtest.ts after any change to these numbers.', 'Normal')

    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    doc.save(out)
    print(f'wrote {out}: {sum(done.values())} replacements')
    if missed:
        print('not found (check wording):\n  ' + '\n  '.join(missed))


if __name__ == '__main__':
    docs = os.path.normpath(os.path.join(HERE, '..', '..', 'docs'))
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(docs, 'NIGHTFALL_GDD_v0.1.docx'),
         sys.argv[2] if len(sys.argv) > 2 else os.path.join(docs, 'NIGHTFALL_GDD.docx'))
