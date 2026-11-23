# Shadow Earth 2.1 (official module)

*The world you know is a stage set. Behind it, five conspiracies wage a silent war for the levers of history.*

Version 2.0 is a full redesign of the Core 1.7 prototype (archived in `tools/shadowearth/legacy/`). Core 1.7 ran 325 cards to 20 Dominance with two missions a turn. AI playtests showed three problems:
- **Length:** games ran about 60 turns, and about 4 in 10 ended with a player unable to draw.
- **Defence dominated:** 12% of missions succeeded against defenders.
- **Agendas rarely mattered:** about 1.4 were completed per game.

2.0 rebuilds the game around three ideas:
1. **Agendas are the battlefield.** Three public Conspiracy Agendas are always on the table, both players race to complete them, and a new one appears as soon as one falls. Each faction also has its own Master Plan, which the opponent can sabotage.
2. **Every contested mission spills blood.** Defended missions end in **Bloodshed**, so a failed attack costs operatives and a costly defence still shapes the board.
3. **A short race.** The first to **7 Dominance** wins, which should take about 8–12 turns each.

## Victory
- You win immediately at **7 Dominance**.
- A player who must draw from an empty deck loses. With 40-card decks and short games this is rare.

## Setup
- Each player takes a **Headquarters** (with its faction power and Security 3), the faction's **Master Plan** (face up, 0 progress) and a **40-card deck**.
  - Faction cards must match the Headquarters. Neutral cards are allowed, at most 3 copies of a name, and Unique cards once.
- Shuffle the shared **Conspiracy deck** (12 Agendas) and reveal 3. This is the **Agenda row**.
- Draw 5. Each player may mulligan once: shuffle the hand back, draw 5, then put 1 on the bottom.
- The first player is random. The second player gets 1 extra Influence on their first turn.

## Turn
1. **Refresh.** Ready your cards, raise your Influence capacity by 1 (max 7) and refill it. Then resolve "at the start of your turn" effects.
   - **Catch-up:** if you are behind on Dominance, gain 1 temporary Influence.
2. **Draw** 1 card. If you are 2 or more Dominance behind, draw 1 more.
3. **Main phase.** In any order, play cards (Operatives, Assets, Facilities, Operations), use abilities and launch missions.
4. **End.** Resolve "at the end of your turn" effects, discard down to 7 and expire temporary Influence.

**Influence:** capacity starts at 1, so it is 2 on your first turn, and rises to a maximum of 7. Temporary Influence lasts until the end of your turn.

## Operatives
- Each has **Force / Tradecraft / Will** and **Health**. Damage stays on it, and at its Health it is eliminated.
- An operative played this turn can defend but **cannot attack** until your next turn, unless a card says it can.

## Missions
1. **Choose a target, then send 1–3 ready operatives** (the Children of the High-Ones: up to 5). They are exhausted. Missions are free; your operatives are the limit.
2. **Defence:** the opponent may assign up to 3 ready operatives. Defending does not exhaust them, so a defender can guard against every mission that turn.
   - A Wetwork target defends itself even when exhausted and doesn't count toward the 3.
   - A lone attacker with **Covert** allows only one defender.
3. **Responses:** players alternate, defender first. Each may play a Response card or a Response ability; passing twice in a row ends the step.
4. **Resolve:** compare totals in the mission's attribute.
   - The attacker wins on a **strictly higher** total.
   - An undefended target uses its **Resistance** instead.
5. **Bloodshed:** if there were defenders, each side deals damage equal to its **highest Force** to one opposing participant of its choice. This happens at the same time, whoever won.
6. **Reward:** if the attacker won, apply the target's reward. A **decisive** win (by 3 or more) adds 1 progress on Agenda and Master Plan missions.

| Target | Attribute | Resistance if undefended | Reward |
|---|---|---|---|
| A **Conspiracy Agenda** in the row | the better of its two (see below) | its progress threshold (2, 3 or 4) | +1 progress for you (+2 if decisive). At its threshold, you **score** it |
| **Your Master Plan** | the Plan's | 2 | +1 progress (+2 if decisive). At 4 it is **enacted** |
| **The opponent's Master Plan** | the Plan's | 2 | remove 2 of their progress |
| **An opposing operative** (Wetwork) | Force (PsyList: Will) | it always defends itself | 3 damage to it |
| **An opposing Facility or Asset** (Sabotage) | Tradecraft | 2 | destroy it |
| **The opposing Headquarters** (Blackmail) | Will (Illuminati: Tradecraft) | 3 | steal 1 progress (theirs −1 and yours +1 on a Conspiracy Agenda), or they discard 2 cards |

**Scoring an Agenda:**
- You gain its Dominance (1, 2 or 3) and resolve its "When scored" effect. All progress on it is cleared, it goes to your scored pile, and a new Agenda is revealed.
- Scoring an Agenda also adds 1 progress to your Master Plan, so the public race feeds your private one.
- **Enacting your Master Plan** gives 3 Dominance and its permanent effect. A Master Plan is enacted only once.

## Card types
- **Operative:** your agents.
- **Asset:**
  - Gear and Implants attach to an operative; an operative can hold any number of Assets.
  - Other Assets sit in play.
- **Facility:** a place with an ongoing ability. Sabotage can destroy it.
- **Operation:** a one-shot effect in your main phase.
- **Response:** played during a mission's Response step.

Keywords:
- **Covert:** see Missions, step 2.
- **Ambush:** can defend while exhausted.
- **Swift:** can attack on the turn it is played.
- **Unique:** one copy in a deck and one in play.
- **Token:** created by effects. It disappears when it leaves play, and each player may control at most 10.

## The factions
Each faction is built like a slice of a pie:
- a philosophy;
- two attributes it is good at and one it is bad at;
- a **Doctrine** printed on its Headquarters, which bends one core rule for that faction only;
- mechanics no one else has;
- weaknesses it can't fix.

| | **PsyList** | **Prendick Holdings** | **Dawn Star Society** | **Illuminati** | **Children of the High-Ones** |
|---|---|---|---|---|---|
| Who | the government's psychic program | the biotech conglomerate | the occult lodge | old money and the deep state | the UFO cult |
| Philosophy | *Knowledge is control.* | *The body is a draft.* | *Every gift has a price.* | *Everything is for sale.* | *The many become one.* |
| Strong in | Will, Tradecraft | Force, Tradecraft | Will, Force | Tradecraft, Influence | Will, numbers |
| Weak in | Force, Health | Will | Tradecraft | Will, Bloodshed | Force, individual bodies |
| Doctrine | **Psychic Assault:** Wetwork uses Will, and a win plants a Control counter | **Harvest:** every enemy eliminated on your turn becomes a Specimen token | **Blood Rite:** once per mission, sacrifice an operative for +3. Every sacrifice gives 1 Influence, and the first each turn also advances your Master Plan | **Bribery:** pay 2 Influence for +1, up to 3 times a mission. Blackmail uses Tradecraft and pays 2 Influence | **Congregation:** send up to 5 operatives on a mission. Cultists who die give Revelation |
| Signature mechanics | Control counters, looking at hand and deck, Responses | Mutations (stacking attachments), regeneration, Specimen tokens | sacrifice, Demons, Scriptures, returning cards from the discard pile | temporary Influence, Mandate counters, disposable Contractors, buying Facilities | Cultist tokens, Revelation, Artifacts, Entities |
| Plays like | sees your hand, turns your operatives against you, wins the Response war | an army that grows from its kills and heals between turns | feeds its own cheap bodies to the altar for bursts of power | buys missions, Facilities and Agenda progress | floods a mission with bodies, and martyrs fuel the Arrival |
| Master Plan | Project OVERMIND (Will) | Project CHIMERA (Force) | The Morning Star Descends (Will) | The New World Compact (Tradecraft) | The Great Arrival (Will) |

Matchups follow from this:
- PsyList's Will Wetwork shreds Prendick's low-Will beasts, but struggles against the Children's high-Will crowd.
- Prendick's Bloodshed punishes PsyList's fragile Psychics and the Illuminati's Contractors.
- The Illuminati can outbid anyone, at the cost of the Influence they need to play cards.
- Dawn Star's sacrifices give it the biggest single swing in a mission, but it can't win a Tradecraft fight.

Conspiracy Agendas each name two attributes (Force/Tradecraft, Tradecraft/Will or Will/Force). A mission uses whichever your team is better at, so every faction fights with its own strengths. Each pair has one Agenda of each size: 2, 3, 3 and 4 progress.

The full card list, with rules text and flavour, is generated into `packages/reference-games/shadow-earth/cards.json` from `tools/shadowearth/cards2.py`. Run `python3 tools/shadowearth/build.py`.

## Design notes for testers
- Missions are free, so the turn is a sequence of decisions:
  - who to send, at which Agenda, and who to keep home;
  - whether to defend and accept Bloodshed;
  - whether to hit their Plan or race your own.
- Force matters to every faction through Bloodshed. Tradecraft and Will factions need bodyguards or Responses to survive contested missions.
- Watch: game length (target 16–24 total turns); Agendas scored per game (target 3+, from both players); faction win rates (target 40–60%); and how often a mission is contested.

## Balance results (heuristic AI, 40 games per run)
| Build | Turns | Agendas scored / game | Plans enacted / game | Loser's Dominance | Faction win rates |
|---|---|---|---|---|---|
| Core 1.7 | ~60 | ~1.4 completed | n/a | n/a | 4 in 10 games ended by deck-out |
| 2.0 first build | 19.3 | 5.4 | 0.05 | 1.9 | Dawn 25%, PsyList 38%, others 62% |
| 2.0 + Plan 4, catch-up, Resistance = threshold | 17.4 | — | 0.9 | 1.8 | PsyList 12% … Prendick 69% |
| **2.0 current** | **15.8** | **4.5** | **0.8** | **1.9** | Children 62%, Prendick 56%, Illuminati 50%, PsyList 44%, Dawn Star 38% |

In the current build:
- every game ends by Dominance;
- about 62% of missions succeed, whether or not they are defended;
- there are about 12 eliminations a game.

Tuning history:
- **Plans:** the threshold went from 5 to 4, and scoring an Agenda adds Plan progress. In the first build Plans were almost never enacted.
- **Agendas:** Resistance now equals the progress threshold.
- **PsyList:** the Headquarters gives Controlled enemies −1 to all attributes, and the Remote Viewer, Precog Analyst, Collective Mind and Telekinetic Recruit gained Health.
- **Catch-up:** a player behind gains +1 temporary Influence, and a player 2 or more behind draws an extra card.
- **Defence:** defenders no longer exhaust, which reduced blowouts.
- **Children:** the Cultists gained 1 Health. They were dying to Bloodshed before they could matter.
- **Prendick:** two Specimens gained Health.

The win rates sit at 16 games a faction, so each carries about ±12 points of noise. Human playtests should confirm them.
