# Shadow Earth (official module)

Core Set 1.7: five conspiracies race to **20 Dominance** through covert missions. The source of truth is the user's rulebook (Core 1.7 Comprehensive Prototype Rules) and card database (`tools/shadowearth/cards.csv`, 325 cards, kept verbatim).

## Building
- `python3 tools/shadowearth/build.py` writes `packages/reference-games/shadow-earth/` from the CSV and the effect files.
  - `SE_<LEVER>=n` overrides a lever. `SE_OUT=<dir>` writes elsewhere.
  - Levers: `WIN` 20, `MAX_CAP` 8, `HAND` 7, `DECK` 50, `MISSIONS` 2, `MISSION_MAX` 3, `SECURITY` 2, `DOM_CAP` 0, `TOKEN_CAP` 12.
  - `DOM_CAP` is the rulebook's optional test-only "max 3 Dominance per mission"; 0 means off.
- **Effect files:** `fx_neutral.py`, `fx_psylist.py`, `fx_prendick.py`, `fx_dawnstar.py`, `fx_illuminati.py`, `fx_children.py`. Starter decks are in `fx_decks.py`.
- **Card registration:** each card calls `fx(name, ...)` with any of:
  - `deploy`, `op`, `resp`, `mop` + `succ` (and `pre`), `abil`, `rabil` and `abilities` (triggers);
  - an Agenda's completion via `agenda([...])`.
- **Compiled static terms:** attribute, cost, Security, mission cost, durability, "can't defend" and targeting rules are terms (`attr_term`, `cost_term`, …). They compile into single rule functions (`attr`, `cost`, `sec`…), so every number is computed in one place.
- **Deck legality:** a card is deck-legal only once its text is implemented. All 325 are.

## Rules as implemented
- **Turn:**
  - Refresh: expire temporary Influence, enable your Disabled cards, ready, capacity +1 (max 8), refill, and At Refresh triggers.
  - Then Draw, Development, Operations, Cleanup (end effects, discard to 7).
  - The second player gets 1 temporary Influence at its first Refresh. Each player may take one mulligan (shuffle in, draw 5, bottom 1).
- **Influence:** base capacity and spendable base Influence, plus temporary Influence. Some temporary Influence expires at Cleanup (`tmpc`) and some at your next Refresh (`tmp`). Temporary Influence is spent first.
- **Missions (a timing window):**
  1. Choose the mission and target. Basic missions may always target the opposing Headquarters.
  2. Choose 1–2 ready attackers. They are exhausted.
  3. Pay the cost: 1 for a basic mission, printed + 1 for a mission Operation, 2 for Investigate and Disrupt.
  4. The defender assigns 0–2 ready defenders (1 against a lone Covert attacker; Ambush may defend while exhausted).
  5. Alternating Responses, defender first.
  6. Compare totals. The attacker must be strictly greater; with no defenders, compare against Security 2.
  7. Apply the reward, then after-mission triggers.
  - Two attempts per turn, three at most.
  - A tie or loss with at least one defender is a successful defense.
- **Damage:** durability is 2 + printed Force (minimum 2). Damage stays between turns, and an operative is eliminated at its durability. Tokens disappear when they leave play.
- **Disable:** a Disabled Facility or Project keeps its card but its text is inactive until its controller's next Refresh.
- **Loadouts:** each bearer has two Loadout slots. Attaching or transferring costs 1 in Development. When the bearer leaves, Loadouts stay in play unattached and other attached Assets are discarded.
- **Agendas:** completion is a special action when its conditions hold (Immediate once, then Ongoing). Disrupt Breakthrough Suppresses the Ongoing until the end of the attacker's next turn. Historical conditions are tracked as player counters, such as streaks of successful Strikes, Infiltrates and Subverts, Control counters placed, defenses, Disables, sacrifices and Revelation gained.
- **Hidden information:**
  - Private looks emit events only the looker can read.
  - Choices among your own deck's cards use an owner-only "looking" zone.
  - Effects that let you choose from the opponent's hand reveal it in a public "shown" zone first.

## Where the digital version interprets the text
- **Reactive cancels and taxes:** the holder is asked at the moment of the trigger. This covers Counterintelligence Sweep, Foresight Interdiction, Emergency Injunction, An Offer in Writing, Risk Arbitrage, Contingency Plan, A Name Spoken in Two Minds, Operation GLASSHOUSE, Crown & Vale, Audit Office, Geneva Blacklist, Administrative State, Improvised Scrambler and Portable Null Field.
- **"targets your Facility"** for Operations means Operations that can target Facilities (Asset Freeze, Scorched Earth Protocol). Improvised Scrambler taxes the first enemy Response each turn during a mission that involves your operative.
- **Scry:** you choose which cards go to the bottom, and the rest stay on top in their order.
- **The Seventh Circle:** its Ritual/Scripture-only Influence is a discount on those cards this turn.
- **Neural Disruptor:** exhausts its target when the mission is declared, before defenders are chosen.
- **The First Unmaking:** scores the operatives its 3 damage will eliminate (before prevention).
- **Rogue Systems Architect:** readies a Facility. That Facility's next activation this turn costs 2 more.
- **Card clauses not modelled:**
  - **Specimen Transport:** "can't be chosen by Responses before defenders" (Responses always come after defenders).
  - **Psi-Restraint Harness:** the Control-counter clause.
  - **The Perfect Organism:** "ignores the first opposing Operation".
- **Tokens:** tokens with an upkeep (Open Recruitment Drive, Global Subcontractors) ask for 1 Influence each at Cleanup, or they are eliminated.

## Balance test runs
These are AI vs AI games across all 20 faction pairings, using `tools/shadowearth/playtest.ts`. Split the work with `--part=i/n` and combine the parts with `merge_playtest.py`. The levers are listed above.

**AI fixes found by the runs:**
- **Scoring moves mid-mission:** the heuristic agent scored a mission before the window had resolved, so it saw the cost but never the reward. It now lets open timing windows play out when it scores a move. This change applies to every module.
- **Exhausted defenders:** the AI also didn't count that an exhausted attacker can't defend on the opponent's turn. Ready operatives are now worth about half their best attribute.
- **Effect:** before these fixes, games averaged 60 turns, with 1.9 attack against 2.1 defence and 29% of missions succeeding.

**Starter decks:**
- **The problem:** the attacker always picks the attribute where the defender is weakest. Prendick's deck had no operative with 3+ Will, and Children's had little Force or Tradecraft.
- **The fix:** the starters now include Neutral cover: Crisis Negotiator, Interrogation Officer and Mental Fortitude for Prendick; Ex-Military Bodyguard, Professional Cleaner and Inside Tip for Children.
- **The result:** Prendick went from 12% to 38–50%.

**Pacing (current rules: 20 Dominance, two missions a turn):**
- With sensible defending, missions succeed about 28% of the time: 46% against an undefended Headquarters, 12% against defenders.
- Games average about 59 turns (around 30 each), and about 4 in 10 end with a player unable to draw.

| Option (lever) | Games | End at the Dominance target | Avg turns | Faction win rates |
|---|---|---|---|---|
| Rules as printed | 40 | 60% | 59 | 19–69% |
| Win at 15 (`WIN=15`) | 40 (seeds 2–3) | ~75% | ~49 | 29–75% |
| Three missions a turn (`MISSIONS=3`) | 40 | 98% | 39 | 31–69% |
| Headquarters missions score 2 (`HQ_DOM=2`) | 40 | 100% | 25 | 19–81% |
| Attacker wins ties (`TIE_WINS=1`) | 20 | 70% | 53 | 12–75% |

**Factions:**
- PsyList is the strongest in every configuration (69–94%), thanks to high Will (12 operatives with 3+), Control counters and "can't defend".
- The Children are the weakest (19–38%): cultists and their 0/1/1 tokens rarely win missions (about 22% success).
- Faction-level card tuning should wait for the pacing decision.

## Starter decks
`psylist-starter`, `prendick-starter`, `dawnstar-starter`, `illuminati-starter` and `children-starter`. Each has 50 cards, plus its Headquarters and the faction's Tier I Agenda.

## Tests
- `packages/test-harness/tests/shadow-earth.test.ts` covers:
  - setup and deck legality;
  - Strikes against Security 2 (a tie fails);
  - defenders and successful defense;
  - Strike damage and elimination;
  - Responses (defender first);
  - Agenda completion and Immediate effects;
  - the 20 Dominance win;
  - private looks.
- Shadow Earth is also in the shared integrity suite (replay, save/restore, hidden information, termination) and the goldens.
- `tools/shadowearth/playtest.ts` plays every faction pairing AI vs AI.

## Not yet
- Art: the generic art import (`tools/art/import.py shadow-earth <folder>`) works.
- A campaign or store, tutorials, and balance tuning from playtests.
