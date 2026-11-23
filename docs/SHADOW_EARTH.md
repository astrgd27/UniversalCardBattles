# Shadow Earth 2.0 (official module)

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
1. **Choose a target, then send 1–3 ready operatives.** They are exhausted. Missions are free; your operatives are the limit.
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
| A **Conspiracy Agenda** in the row | the Agenda's (F, T or W) | its progress threshold (2, 3 or 4) | +1 progress for you (+2 if decisive). At its threshold, you **score** it |
| **Your Master Plan** | the Plan's | 2 | +1 progress (+2 if decisive). At 4 it is **enacted** |
| **The opponent's Master Plan** | the Plan's | 2 | remove 2 of their progress |
| **An opposing operative** (Wetwork) | Force | it always defends itself | 3 damage to it |
| **An opposing Facility or Asset** (Sabotage) | Tradecraft | 2 | destroy it |
| **The opposing Headquarters** (Blackmail) | Will | 3 | steal 1 progress (theirs −1 and yours +1 on a Conspiracy Agenda), or they discard 2 cards |

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
Each faction has a Headquarters power, a Master Plan and three archetypes:

| Faction | Leaning | Headquarters power | Master Plan | Archetypes |
|---|---|---|---|---|
| **PsyList** (the government's psychic program) | Will / Tradecraft | at the start of your turn, look at the top card of the opponent's deck; enemies with Control counters get −1 to all attributes | **Project OVERMIND** (Will) | Clairvoyance; Psychic Assault; **Control counters** (mind-controlled enemies) |
| **Prendick Holdings** (biotech conglomerate) | Force / Tradecraft | your Mutations cost 1 less | **Project CHIMERA** (Force) | **Mutations** on Specimens; Sleeper Organisms; Corporate Biotech (economy) |
| **Dawn Star Society** (occult lodge) | Will / Force | the first time you sacrifice each turn, gain 1 Influence | **The Morning Star Descends** (Will) | **Sacrifice**; Demons; Scriptures |
| **Illuminati** (old money, the deep state) | Tradecraft | gain 1 temporary Influence each turn | **The New World Compact** (Tradecraft) | Finance; Institutions (**Mandate counters**); Contractors |
| **Children of the High-Ones** (UFO cult) | Will | gain 1 **Revelation** each turn | **The Great Arrival** (Will) | Cultist swarm (tokens); Alien Artifacts; Revelation and Entities |

The full card list, with rules text and flavour, is generated into `packages/reference-games/shadow-earth/cards.json` from `tools/shadowearth/cards2.py`. Run `python3 tools/shadowearth/build.py`.

## Design notes for testers
- Missions are free, so the turn is a sequence of decisions:
  - who to send, at which Agenda, and who to keep home;
  - whether to defend and accept Bloodshed;
  - whether to hit their Plan or race your own.
- Force matters to every faction through Bloodshed. Tradecraft and Will factions need bodyguards or Responses to survive contested missions.
- Watch: game length (target 16–24 total turns); Agendas scored per game (target 3+, from both players); faction win rates (target 40–60%); and how often a mission is contested.
