# Game Maker

The Game Maker is a mode of the web app that lets someone who has never written code design a complete card game, playtest it against the AI, and publish it to their library. Designers who want more can script anything in the same rules DSL the official games use.

Code:
- `packages/maker/src/` (browser-safe):
  - `blueprint.ts` defines the format.
  - `compile.ts` turns a blueprint into an engine module.
  - `presets.ts` holds the starter blueprints.
  - `index.ts` has `lint` and `build`.
- `apps/web/src/maker.ts`: projects, XP and quests, playtests, the AI Lab, publishing and export.
- `apps/web/src/ui/maker.ts`: the screens.
- Tests: `packages/test-harness/tests/maker.test.ts` and the Maker section of `apps/web/e2e.mjs`.

## How it plays
The Maker is built to feel like a game in its own right.

- **Workshop path.** Twelve build stations, each with a quest:
  1. Name & Look
  2. Mechanics Shelf
  3. Card Frames
  3. Card Types & Stats
  4. The Board
  5. Turn Sequence
  6. Rules of Play
  7. Keywords
  8. Cards
  9. Decks
  10. Playtest
  11. Publish
  12. Script Lab
- **Rewards.** Finishing a quest stars the station and pays Maker XP. XP raises your rank: Apprentice Tinkerer, Card Smith, Rule Wright, Game Architect, Grand Designer, then Legendary Maker. Rank-ups and publishing throw confetti.
- **Gizmo,** the guide, gives a tip for every station and names your next quest.
- **Checks panel.** Lists "bugs" (the game won't build) and "tips" in plain language. Each one links to the place to fix it.
- **Live previews.** Every card is drawn by the real renderer as you edit. Rules text writes itself from the ability blocks, unless you type your own.
- **Playtest** starts a real match. You play seat 1; the opponent is the AI, a random AI or a friend on the same device. A Workshop button brings you back, and beating the AI completes a quest.
- **AI Lab** has two AIs play 10 or 30 games and reports each deck's win rate and the average game length.
- **Publish** puts the game in the library with a "Made by you" badge. It gets the deckbuilder, gallery, saves and setup screen like any other game, and it is still there after a reload.
- **Export:**
  - a module package (`.zip`), which anyone can open with "Load a game";
  - a blueprint (`.maker.json`), which opens in the Maker so others can remix it.

## Blueprints (starting points)
Each one is an original, complete and playable game that shows off one family of mechanics:

| Blueprint | Systems |
|---|---|
| Arcane Clash | Resource cards played one per turn, making colored mana; typed costs; stack timing with instants and counterspells; attack-and-block combat with flying, vigilance, drain, venom and overrun; damage heals each turn; life 20 |
| Riftfront | A rune deck that channels 2 typed runes a turn; units march onto two shared battlefields; showdowns; conquer and hold for points (first to 8); a champion leader with an activated ability; gear |
| Pocket Wilds | One active unit and a bench of 5; energy cards attached one per turn; printed attacks with energy costs; weakness ×2; retreat costs; evolution onto a named unit (keeping damage and energy); prize cards; losing when you have no units; damage persists; attacking ends the turn |
| Crypt Duel | Free summons limited to one a turn; tributes by level; attack and defense positions with face-down sets; flip on attack; face-down traps (some spring only when an enemy attacks); chain timing; a fusion (extra) deck; ATK/DEF battle comparison with battle damage; life 8000 |
| Crownfall | Leader with life cards (each hit takes one; a hit with none left loses); a resource deck adding 2 a turn; spending resources for +1000 power; a counter step where defenders discard cards for their counter value; Blocker; Double Attack; only rested units can be attacked |
| Ki Clash | Any card can become energy once a turn; leader with 8 life cards; awakening (an activated ability that needs 4 or less life, once per game); counter cards; Barrier; draw 2 a turn |
| Blank Canvas | Growing energy, units and spells, life 20 |

## Guided setup (the wizard)
An optional alternative to the blueprints, listed first in the "New game" picker. It walks through every system a card
game can have, one step at a time, with preset choices and a few numbers to tweak. Every step can be skipped: its first
valid option (marked Default) is used. Options that don't fit earlier answers are hidden; for example, pitching cards
from hand comes with attack cards and a life total, and battlefields come with points. The steps are:

1. **Theme & colours:** a theme pack (Fantasy, Sci-fi, Critters, Plain) gives the palette, emblem, colour names and card names. Also the name, tagline and 0 or 2–5 colours.
2. **Starter cards:** 6, 10 or 14 cards per colour (units on a cost curve plus damage, draw and team-buff spells), or only the example cards.
3. **Paying for cards:** growing energy (max), lands, inkwell, any card as mana, a resource deck, attached energy, pitching, or free with one summon a turn.
4. **Resource extras:** boosts, action points, level requirements.
5. **Board & combat:** pick a target, attack and block, power duels, ATK/DEF positions, active and bench, battlefields, or attack cards.
6. **Combat extras:** mass combat, a board grid, a counter step, questing, front line and reserve, twin arenas, showdowns and conquest.
7. **Turns & timing:** simple turns, a stack, chains with speeds, or alternating actions.
8. **Turn extras:** a separate combat phase; refill the hand to N.
9. **How to win:** life total, life cards, shields, prizes or points, each with its number.
10. **More ways to win or lose:** burn out, no deck-out loss, losing with no units.
11. **Decks & hands:** 30/2, 40/3 or 60/4 decks; opening hand, hand limit, mulligan style (none, full, partial, London), first-player draw.
12. **Leaders:** none, a leader, or a deployable leader.
13. **Card types:** quick spells, items, gear, traps, tokens, evolutions, a fusion deck, tribute summons, songs.
14. **Keywords:** 14 common keywords, spread over the starter units.
15. **Optional systems:** +1/+1 counters, stun and sleep, can't-attack keywords, cost reducers, damage prevention, a banished pile, a shared stadium, coins and dice.
16. **Review:** a summary, sample cards, a build check and **Create my game**.

`wizardBuild(answers)` in `packages/maker/src/wizard.ts` does the build. It writes the starter set and decks first, then
applies the chosen systems as Mechanics Shelf recipes so they adapt the starter cards (typed costs with lands, attack
cards with pitching, levels with a level gate). Last it fits every deck to the chosen size, with lands of the deck's own
colours making about 40% of it. `randomAnswers(seed)` makes random valid answers, and the wizard test builds and AI-plays 40 of them.

## The systems
- **Resources:**
  - growing energy (`ramp`);
  - resource cards from hand (`cards`, colored);
  - any card as energy (`anycard`);
  - a resource deck (`deck`);
  - attaching to units (`attach`);
  - free (`none`), with summons per turn and tribute rules.

  Pools refill at the start of your turn and stay available on the opponent's turn for quick cards. An optional **boost** spends 1 for extra power until end of turn.
- **Combat:**
  - `block`: the defender may block; flying, overflow and lifesteal apply;
  - `target`: attack a unit, the leader or the player. With a health stat both sides deal damage; without one, power is compared, with options for ties, a weaker attacker dying, and the difference hitting the player. Optional blockers, positions and a counter step;
  - `duel`: active and bench, printed attacks, weakness and retreat;
  - `lanes`: shared battlefields, showdowns, conquer and hold;
  - `none`.
- **Winning:** life, life cards, prize cards, points, losing on an empty deck, and losing with no units. Any combination.
- **Turn:** an ordered list of phase blocks. Ready, Draw (N cards), Resource, Main, Combat (attacks happen here if present), End (heals, end-of-turn triggers, discard to hand size) and Custom (your own JSON effects).
- **Timing:**
  - `simple`: only the active player acts. Quick cards and traps work in the battle response step.
  - `stack`: responses with quick cards; the last thing played resolves first.
  - `chain`.
- **Card roles:** unit, spell, quick spell, permanent, attachment, resource, trap, leader, evolution, extra-deck unit and token.
- **Keywords:** any name, mapped to a built-in rule or to none:
  - attacks right away; must be attacked first; blocker;
  - flying; vigilance; lifesteal; deadly; shield;
  - double hit; overflow; ward (can't be targeted).
- **Abilities:** When → If → Do.
  - When: played, destroyed, attacks, hits the opponent, start of your turn, end of your turn, activated (exhaust and/or pay, limited per turn or per game), always on (an aura), or a trap that springs when an enemy attacks.
  - If: you control N or more units; your life is N or less; your hand has N or fewer cards; it is your turn.
  - Do:
    - draw, deal damage, heal;
    - boost a stat (until end of turn or permanently);
    - destroy, return to hand, exhaust, ready;
    - create tokens, gain resource, discard, mill;
    - search the deck, return a card from the discard pile;
    - cancel a spell (stack or chain timing);
    - gain or lose life, score points, add life cards;
    - an aura, win the game, or a custom script.
  - Targets: a chosen enemy unit, any unit or one of yours; the opponent; yourself; this card; a random enemy; all enemy units, all units or all of yours; each player; or, inside a battle, the attacker or the attacked unit.

## Building blocks (v2)
The Maker is built from a few concepts that combine, rather than one fixed menu per game:
- **Board areas (arenas).** Split the board into named areas: ground/space, or a front line and a reserve. Each card type enters an area; areas marked "fights from here" attack and block. Optionally, units only fight units in their own area. A "Move to the front" action appears when some areas can't fight.
- **Counters** with any name. Each one can raise stats per counter (+1/+1). Effects add and remove them; conditions check them; activation costs can spend them.
- **Keywords.** A keyword can map to a built-in rule, carry a number ("Resist 2", "Challenger 3"), and hold its own When → If → Do abilities that every card with it gets. Effects can use the keyword's number as their amount ("Restore N").
  - New built-in rules: first strike, resist N, challenger N (+N power while attacking), saboteur (ignores "must be attacked first"), go again, life-card trigger, song.
  - Flying now also protects in target combat: only flyers can attack a flyer.
- **Target filters.** Any targeted effect or aura can narrow its targets: type, color, keyword, a stat (≤ or ≥ N), or only exhausted units.
- **Cost blocks** for activated abilities: exhaust, pay resources, discard N, sacrifice a unit, pay life, remove counters.
- **Conditions:** "if you have N+ resources" and "if this has N+ counters" join the earlier ones.
- **Combat options:**
  - direct attacks always, only when the defender has no units, or never;
  - questing (exhaust a unit to score a stat);
  - up to N blockers per attacker, with damage assigned in order and first strike;
  - **attack cards**: a combat style where cards from hand attack and the defender blocks with cards from hand (plus ready equipment).
- **Resource options:**
  - face-down resources, and "only cards with keyword X can become resources";
  - pitch from hand (pay with cards' pitch values; pitched cards go to the bottom of the deck);
  - a level requirement (a stat ≤ resources in play);
  - an energy requirement (units' generated stat ≥ the card's need; nothing is spent);
  - action points with Go again.
- **Phase options:** both players ready/draw together; draw up to N; players alternate actions in a main phase.
- **Leaders:** a leader can deploy into play as a unit (the "deploy" effect, e.g. gated on 6+ resources, once per game).
- **Life cards** can have triggers, used for free when taken.

## "Instead" and "can't" blocks
- **Restrictions:**
  - built-in keyword rules: can't attack (also stops questing), can't block, can't be attacked, can't be blocked, enters exhausted;
  - a static ability can grant any of them to a scope, e.g. "enemy units with 2 or less power can't attack";
  - a triggered effect can apply one "until end of turn" or "until it leaves play".
- **Counters as conditions:** a counter can stop attacking and/or blocking and can wear off at the end of its controller's turn (stun, sleep, freeze).
- **Prevent damage** (static): damage dealt to a scope is reduced by N. This compiles to a replacement on the card.
- **Instead of destroyed** (static): "if this would be destroyed, return it to your hand / put it on the bottom of your deck instead".
- **Cost reducers** (static): "your [type] cards cost N less" while the card is in play. This only works for games without colored costs.
- Shelf recipes: restriction keywords (Defender, Elusive, Untouchable, Sluggish), stun & sleep conditions, cost reducers, damage prevention & second chances.

## Conquest battlefields (Advanced)
Options on the Battlefields combat mode, the resource deck and setup. Generation Wars (`packages/modules/generation-wars`) is built entirely from them.
- **`combat.conquest`:**
  - units enter exhausted (Accelerate pays 1 more and recycles 1 rune of its color to enter ready);
  - a Move picks a destination, then any other ready units from the same place go along (Ganking units may move battlefield to battlefield);
  - moving into a battlefield with enemy units, or one the opponent controls, opens a **showdown** window (players alternate quick spells, the defender first), then a **fight**;
  - in a fight each side deals its total power. Damage goes to Tank units first, then lethal damage to the weakest. Survivors heal. If both sides survive, the attackers are recalled to base;
  - the sole occupant takes control: **conquer** scores 1 point the first time a battlefield is scored each turn, and **hold** scores 1 point per controlled battlefield (with units) at the start of your turn.
- **`combat.finalPoint`:** a conquest can't score the winning point unless you scored every battlefield this turn; you draw a card instead.
- **Fidelity options:**
  - the showdown gives the mover focus first; with chain timing, Reactions (quick spells) answer chains, and Action spells (`type.showdown`) are also castable in showdowns on your focus;
  - `combat.playToControlled`: units may be played straight to a battlefield you control;
  - `combat.assignDamage`: each side picks which enemy receives lethal damage next (Tank first), and damage lands after both assign;
  - keyword rules Hidden (pay 1 power to hide it face down at a battlefield you control; from your next turn play it there free at reaction speed; it is trashed if you lose the battlefield) and Deflect N (opponents pay N more power to target it);
  - `win.burnOut`: an empty-deck draw gives the opponent a point and reshuffles your discard pile;
  - counters can have a max per card (Buff: +1 might, max 1);
  - statuses can deal no fight damage (Stun).
- **Battlefield cards** (role `battlefield`, `setup.sites` per deck): one is picked at random for each player's battlefield. Its "When you conquer here" and "When you hold here" abilities go to whoever takes it, and units can have "When this conquers a battlefield" and "When you hold its battlefield".
- **`resource.recycle`** (resource deck): each resource gives 1 energy per turn, and colored costs (`{any: 3, boomer: 1}`) are paid by recycling resources of that color to the bottom of the resource deck. **`resource.secondBonus`:** extra resources on the second player's first turn.
- **Setup:** `champion` (each deck names a unit that waits in a champion zone and can be played from there), `leaderColors` (every card matches one of the leader's two colors, `color` and `color2`), `mulliganN` (set aside up to N cards, then redraw that many).
- **New blocks:**
  - keyword rules: Tank, +N while defending (`bulwark`), Accelerate, Ganking, Temporary. Assault is the existing +N while attacking;
  - the effect "look at the top card, may put it on the bottom" (`scry`);
  - the condition "if you played N other cards this turn" (`played`, i.e. Legion).

## Leader battles with given resources (Advanced)
Ringworld Rumble (`packages/modules/ringworld-rumble`) is built from these options on top of the leader, life-card, target-combat and counter systems.
- **`resource.give`** (with `boost`): in your main phase, attach 1 unspent resource to your leader or a unit for +boost power this turn. Each unit counts what it was given (shown on the card), and it resets at your next turn.
- **Condition "if this has N or more given to it"** (`attached`): the "×N" style of ability, e.g. "When this attacks, if it has 1 or more Hype!! given to it: …".
- **Keyword rule `banish`:** life cards this attacker takes go to the discard pile with no trigger.
- **`combat.firstTurnEach`** (with `firstTurnAttack` off): neither player attacks on their own first turn, not just on turn 1.
- Counter events are quick spells that target "the card being attacked" (`battleTarget`) or "the attacker" (`attacker`), played in the response step.
- **Battle-only boosts:** counter values from hand, and "boost … during this battle" (`until: 'battle'`), last until that battle's damage step, so each new attack must be countered again.
- **`combat.counterOnly`:** quick spells can be played only while defending. **`combat.replaceFull`:** with a full board, playing a unit first trashes one of yours.
- **Traits** (`card.traits`, a list of affiliations shown as `{Trait}`) and a **Trait** filter on any target or search.
- **New effects:**
  - "look at the top N, reveal up to 1 matching card and add it to hand, the rest to the bottom" (`dig`; the cards wait in a zone only their owner sees);
  - "play a unit for free from hand or discard pile" (`putIntoPlay`, with filters);
  - resource verbs: add from the resource deck (`addRes`), set spent ones active (`readyRes`), give spent ones to a card (`giveRes`);
  - life verbs: top life card to hand (`lifeToHand`), a card from hand onto life (`handToLife`).
- **New triggers and conditions:** "when it blocks", "when the opponent attacks" (for any card, not just traps), "during the opponent's turn", "if the opponent has N or less life". Activated abilities can cost life cards (taken into hand), and in "give" games a resource cost reads "rest N".
- **New keyword rules:** attacks units the turn it is played (`rushUnits`), can't be destroyed in battle (`noKO`). "Can't be blocked" is the existing `unblockable` rule.
- **Targets:** your leader (`ownLeader`), and your leader or one of your units (`ownAny`).

## Status effects (Keywords station)
A game can define any number of statuses (`bp.statuses`). Each one is a set of rules, not a fixed list, so you can build asleep/poisoned, frozen/burning, inspired/exhausted and so on. A unit carries a status as the var `st_<id>` (its level), and the table shows it on the card.
- **Stops:** can't attack, can't block, can't retreat, can't use abilities.
- **Group:** statuses in the same group replace each other.
- **Stacks:** inflicting it again raises its level; tick damage and stat changes scale with the level.
- **Ticks:**
  - when: between turns (every unit), or at the start or end of its controller's turn;
  - damage each tick;
  - optionally "then flip a coin: heads cures it".
- **Lasts:** until cured, until the end of its controller's next turn (applied on the opponent's turn, it wears off after yours), or until end of turn.
- **Stat change** per level, and **attack flip:** when it attacks, flip a coin; tails means the attack fails and it takes N damage.
- **Active only** (active-duel games): only the Active unit can have it, and moving to the bench or evolving clears it. Otherwise statuses survive moves between play areas.
- **Blocks:**
  - effects: give a status (`inflict`), cure one or all (`cure`);
  - the filter "units that are X";
  - the condition "if this is X".

**Coin flips** (`flip`): flip N coins, with "if heads…" and "if tails…" effect lists. With several coins, heads needs all heads, or use "once per heads". Flips show on the battle screen.

**Dice rolls** (`roll`): roll N dice with S sides (default one d6).
- Result ranges ("on 1–2: …; on 3–6: …") each run their own effect list on the total.
- A "then" list runs after every roll.
- Any effect's amount can be "the last roll" (`fromRoll`), e.g. "roll 2d6, then deal X damage".
- Each die and the total show on the battle screen.

## Active duels (Advanced)
Options for the Active duel combat mode (Looboo, `packages/modules/looboo`, is built from them).
- **Attacks:**
  - a damage bonus: +N per attached energy, per damage counter on the target (`combat.counterSize` is the damage per counter), per benched unit (yours or the opponent's), or per heads;
  - "discard N energy after attacking", and attack effects (any effect block, e.g. bench damage via a target filter "in the bench");
  - resistance: `card.resist` names a color, and `combat.resistance` sets how much less damage it takes.
- **Prizes:** `card.prizes` sets how many prize cards a knock-out gives (2 for XL, 3 for Prime).
- **Card types:**
  - `perTurn` (at most N of this type per turn, e.g. one Helper);
  - `notFirstTurn` (not on turn 1);
  - `perUnit` for attachments (one Gear per unit).
- **Habitats:** a global custom zone (a new one replaces the old), and a card can't be played while one with the same name is there.
- **Energy:** `provides` (counts as N) and `rainbow` (every color).
- **Deck limits:** `keyword.deckMax` (e.g. one Rare Find per deck).
- **Setup:**
  - `benchSetup`: basics go to the bench too;
  - `mulliganBonus`: redraw only without a basic, and the opponent draws 1 per mulligan;
  - `noEvolveFirstTurn`.
- **Effects:**
  - switch your Active, or bring in an opponent's benched unit (`switch`);
  - search your deck and choose (`tutor`, into hand or play);
  - attach a resource card from a zone (`attachFrom`);
  - draw until N in hand (`drawTo`);
  - evolve two stages at once (`skipEvolve`).
- **Table:** attachments (energy, gear, auras) are drawn small under the unit they are attached to.

## Mass combat, walkers and Magic-style keywords (Advanced)
Crystal Circuit (`packages/modules/crystal-circuit`) is built from these.
- **`combat.mass`** (Attack & block mode):
  - one Attack action per turn declares every attacker; with walkers in play, each attacker picks the opponent or a walker;
  - a response step, then blocks: for each attacker, the defender picks any number of untapped units. Flying is blocked only by flying or reach; menace needs 2+ blockers; Cloaked can't be blocked;
  - a second response step, then a first-strike damage step (first strike and double strike) and a regular one (everything else, plus double strike);
  - the attacker divides damage automatically: lethal to each blocker in turn (deathtouch counts 1 as lethal); the rest tramples through or piles on the first blocker;
  - all damage in a step is simultaneous; lifelink gains life; damage to a walker removes loyalty.
- **Walkers** (role `walker`):
  - enter with their Loyalty stat;
  - their activated abilities take a loyalty cost (`ability.loyalty`, +N or −N), with one per turn per walker in your main phase;
  - at 0 loyalty they go to the discard pile;
  - "an enemy unit or the opponent" targets also reach enemy walkers.
- **Keyword rules:**
  - reach, double strike, menace, indestructible (never destroyed by damage or destroy effects), flash (play units at instant speed);
  - Ward N (`wardTax`): an opponent's effect that targets it does nothing unless they pay N;
  - legendary: a second copy with the same name sends the older one to the discard pile;
  - the old "can't be targeted" rule is labeled Hexproof.
- **Card costs and options:**
  - Kicker N (an optional extra cost, with the condition "if it was kicked");
  - Flashback N (cast from the discard pile, then banish it);
  - Cycling N (pay, discard: draw);
  - Equip N (equipment stays when its unit leaves and moves for N);
  - Crew N (vehicles attack and block only after you tap units with that much total power this turn);
  - Station N (tap another unit to add charge equal to its power; at N charge it can attack and block; the condition "if this has N+ charge" unlocks abilities).
- **Card types:** attachments can go on enemy units (`anyUnit`, auras and curses) or be equipment (`equipment`). Any card can be a token (`isToken`, e.g. a non-unit Power Cell with "Sacrifice this: add 1"). Sacrifice-this abilities resolve immediately (mana abilities).
- **Mana:**
  - dual resources (`color2` on a resource card) add a two-color mana type; costs check each color and each pair, and payment spends own-color mana first, then duals;
  - "enters tapped" resources (the entersExhausted rule) give no mana the turn they are played.
- **Other:**
  - triggers "whenever you cast a spell" (prowess) and "whenever a resource enters for you" (landfall);
  - effects fight and surveil;
  - the London mulligan (`setup.london`).

## Board grids, link arrows and extra-deck summons (Advanced)
Taste Dimension (`packages/modules/taste-dimension`) is built from these.
- **`combat.grid`** (target and block modes):
  - units sit in numbered columns `m1…mN`, and the player picks the column when playing a unit;
  - support has 5 slots `s1…s5`;
  - the table mirrors the opponent's side as seen across a real table (their S row on top, M1 on your right);
  - filters "next to this" (`adjacent`) and "facing this" (`opposite`) work for any grid game.
- **`combat.emz`:**
  - two shared extra zones between the players; each player may hold one, and the opponent's right zone is your left;
  - link arrows (`card.arrows`: TL T TR L R BL B BR, from the controller's side) point at your columns, the extra zones, and from an extra zone up into the opponent's columns;
  - link summons, and pendulum summons from the extra deck, go to a free extra zone or to a column your link arrows point to;
  - filter "this points to it" (`pointed`), condition "if this is linked".
- **Extra-deck methods** (`type.method`):
  - `materials`: the old "send N units";
  - `fusion`: `card.mats` is a list of filters, one per material, matched from hand or board by the effect "Fusion summon" (`fusion`);
  - `synchro`: 1 Tuner (keyword rule `tuner`) + non-Tuners whose levels add up exactly; only materials that keep an exact total possible are offered;
  - `xyz`: `card.materials` units whose level equals its Rank stat; they are attached under it (an "overlay" zone) and abilities can cost "detach N";
  - `link`: as many materials as arrows, optionally matching `mats[0]`.

  Fusion, synchro and xyz summons may go to any free column or a free extra zone.
- **Ritual** (`type.ritual`): never normal-summoned. The effect "Ritual summon" (`ritual`) tributes units from hand or board until their levels reach the ritual unit's level.
- **Pendulum** (`card.scale`):
  - put it in support slot s1 or s5 as a scale;
  - with two scales, once per turn summon any number of units from hand, and face-up pendulums from the extra deck, whose level is strictly between the scales;
  - a destroyed pendulum goes face up to the extra deck (`pextra`).
- **Abilities:**
  - Quick (speed 2, either turn);
  - used from hand (hand traps; "sacrifice this" discards it) or from the discard pile ("sacrifice this" banishes it);
  - "detach N"; once per turn per name;
  - the trigger "When flipped face up".
- **Spells and traps:**
  - quick spells can be settable (set, then used from the next turn);
  - traps can have counter speed (`speed3`, responds to anything) or be continuous (stay face up; their statics apply).
- **Battle:** keyword rules `directAttack` (may attack the player past units) and `extraAttack` (attacks twice). Piercing is the existing `overflow` rule in compare combat.

## Questing, places and shift (Advanced)
Built for Storyweavers (mechanics reference: Lorcana). They also work in other games.
- **Places** (role `location`): played into a public `locations` zone. Stats: `move` (move cost), the combat health stat (willpower) and the quest stat (lore).
  - "Move to a location": any of your units, ready or exhausted, pays the place's move cost and is linked to it (rel `at`). A tag under the card shows where it is.
  - With questing, each place scores its lore at the start of its owner's turn.
  - Enemy places can always be attacked (exhausted or not), deal no damage back, and are destroyed when their damage reaches their health.
  - Filter "here" (`filter.here`) means units at this place, for static bonuses such as "characters here get +1 lore". Condition `here` holds when this unit is at a place (or this place has a unit).
- **Shift** (`card.shift`): pay the shift cost to play the card on top of your unit with the same name. The name is the part before " - ", so "Red Riding Hood - Wolf Hunter" shifts onto any "Red Riding Hood". It keeps the old card's damage, exhaustion, play turn (so it can act if the old one could), place and the cards under it. The old card goes under the new one (an `under` zone, rel `host`). When the unit leaves play, every card under it goes to the discard pile.
- **Keyword rules:**
  - `bodyguard`: may enter exhausted; attackers must pick a Bodyguard if they can (places are still fair game).
  - `support`: when it quests, may give another unit its power this turn.
  - `reckless`: can't quest; you can't end the turn while it can attack. `adventurous`: can't attack; you can't end the turn while it can quest. Both use the engine's `phases[].mustAct`.
  - `vanish`: destroyed when an opponent's spell chooses it.
  - `boost` N: once a turn, pay N to put the top card of your deck face down under it. Condition `under` N checks how many cards are under it.
  - `underdog`: costs 1 less on the second player's first turn.
  - `singer` N: sings songs as if it cost N. `singTogether` N (on songs): exhaust any of your units whose costs add up to N or more; they are picked one at a time until the total is reached.
  - `reach` (Alert) now also lets a unit attack flyers (Evasive) in target combat.
- **Saved resources (ink drops):** the effect "Save resources for later" (`drops` N) stores N on the player. "Spend a saved resource" gives 1 resource this turn at any time.
- **Setup and winning:** `setup.maxColors` (a deck may use at most N colors); `win.emptyEnd` (ending your turn with an empty deck loses). The effect `score` with `who: 'opp'` takes points from the opponent.
- **Shelf recipes:** "Places (locations)" and "Shift (upgraded versions)". The wizard offers both in Optional systems.

## Skill checks and zone combat (Advanced)
Built for Arcade Showdown (mechanics reference: UniVersus). They also work in other games.
- **Skill checks** (`resource.mode: 'check'`, shelf recipe "Skill checks"): no resources. One **Play** action covers every card.
  - The card goes to your **card pool** (zone `pool`), then you make a check: the top card of your deck is discarded and its check value (`resource.checkStat`, default `check`) must reach the card's cost (its difficulty) plus the number of cards already in your pool this turn (progressive difficulty).
  - If the check is short, you may commit (exhaust) that many ready **foundations** (a permanent type with `foundation: true`, in your stage or pool) to pass.
  - A failed check discards the card and ends your turn. Checking from an empty deck loses.
  - At the end of every turn both pools are sorted: permanents are built onto the stage (`support`), attacks that dealt damage become **momentum** (zone combat), and everything else goes to the discard pile.
  - `card.combo` (a trait or type): playable only right after such a card in your pool.
- **Zone combat** (`combat.mode: 'cards'` with `combat.zones`): attack cards carry `azone` (1 low, 2 mid, 3 high), `speed` and their damage (the combat power stat).
  - The battle runs declare → **enhance** (both players alternate quick abilities, attacker first) → block → damage.
  - The defender may block with a card from hand whose `bzone` is the attack's zone or next to it (mid touches both), passing a check of speed + the card's `bmod` + their own pool size.
  - The same zone stops all damage; a neighbouring zone halves it (rounded up). A failed or missing block takes it all.
  - Conditions `attacking` / `defending` gate Enhance and Response abilities (target "attacker" changes the attack's speed or damage).
- **Keyword rules:** `ex` N and `powerful` N (enhance: spend 1 momentum for +N speed or damage), `stun` N (enhance: the rival commits N ready foundations), `breaker` N (after you block with this, the attacker's next check gets -N), `flashAtk` (the attack skips the enhance step).
- **Leaders:** `setup.leaderLife` and `setup.leaderHand` take starting life and the hand size (the draw-up-to number) from the leader's stats.

## Asymmetric sides and runs (Advanced)
Built for Lairbreakers (mechanics reference: Android: Netrunner).
- **Sides** (`setup.sides: [name, name]`): each deck's leader is an identity whose card type has `side: 0` or `1`; every card type can belong to a side, and decks may only hold their identity's side. Side 0 goes first. Phases can be limited to one side (`phase.side`, e.g. the defender's mandatory draw).
- **Actions and credits:** `resource.mode: 'bank'` keeps credits between turns (start with `resource.start`). `resource.actionsStat` reads actions per turn from the identity (3 and 4); `spendAll` forbids ending the turn with actions left; `basicActions` adds "Draw a card" and "Take 1" for one action each.
- **Runs** (`combat.mode: 'runs'`, `combat.remotes`, `combat.memory`):
  - Servers: three centrals (hand, deck, discard; names from `zoneNames.server_hq/rd/arc`) and N remotes (`srv1…`), each with an ICE zone (`ice_hq`, `ice_rd`, `ice_arc`, `ice_r1…`; outermost last).
  - The defender (side 0) installs face down for an action: guardians (role `ice`) in front of any server for 1 credit per guardian already there; schemes (role `agenda`) and side-0 permanents into a remote (replacing what was there). Rez permanents by paying their `rez` stat. Advance a scheme (1 action + 1 credit, var `adv`); score it for free once `adv` reaches its `req`, for its `points`.
  - The raider (side 1) runs a server for an action. Guardians are approached outside in, and the raider may jack out before each one after the first. The defender may rez an unrezzed guardian on approach. A rezzed guardian is encountered: the raider breaks it with a breaker (`card.breaker`: matching `iceType` or `all`; pay `boostCost` per `boostBy` strength it lacks, plus `breakCost` per subroutine) or lets its subroutines (`card.subs`) fire in order.
  - A successful run accesses: a random card from the hand, the top of the deck, the whole discard pile, or everything in the remote. Schemes are stolen for their points; "When accessed" abilities fire; other cards can be trashed for their `trash` cost (not from the discard pile).
  - Programs (types with `memory`) need memory (`mu`), up to `combat.memory` plus `muPlus` on installed gear.
- **Effects:** `endRun`, `wound` N (random discards; more than the hand flatlines, losing the game) and `tag` N. The raider can pay an action and 2 credits to remove a tag; while the raider has tags, the defender can pay an action and 2 credits to trash a card of a `tagTarget` type.

## Board & layout (Name & Look station)
`look.board` sets how the battle table draws the game; the compiler passes it to `manifest.theme.board`.
- **Layout:** `auto` (default) draws slot boards (`combat.grid`) as a Duel Links-style mat and battlefields (`combat.mode: 'lanes'`) as a central strip; anything else as free-form zones. `free` always uses free-form zones; `mat` and `lanes` force those styles where the rules allow.
- **Duel mat:** opponent's spell/trap row, opponent's monster row, the shared extra zones, your monster row, your spell/trap row. Card-shaped corner piles: left of monsters (field zone or banished), left of spells/traps (extra deck), right of monsters (discard pile), right of spells/traps (deck), mirrored for the opponent. Names, counters and other piles go in a corner column. `corners: {lm, ls, rm, rs}` picks the corner zones; `slotNames: false` hides M1/S1 labels.
- **Zone names:** `labels: 'top'` (small and horizontal above each zone, the default), `'side'` (vertical) or `'hidden'`.
- **Board card size:** `scale` multiplies board card sizes (0.8–1.25). Card sizes otherwise follow the screen height so the board and your hand fit a tablet in landscape.
- **Used cards** (`used`): how a card that attacked, exhausted or used an ability this turn is drawn: `tilt` (sideways, like tapping), `dim`, `badge` (a small ⚔✓ / ↻✓ tag) or `none`. Default: `badge` for games with positions, active duels and runs (they don't tap), `tilt` otherwise. Using any activated ability or printed attack sets the object var `ut` to the turn, so abilities that don't exhaust still show as used.
- **Defense position** (`defenseSideways`, games with positions): sideways by default, or upright with a DEF tag.
- Default games: tilt in Crystal Circuit, Storyweavers, Ringworld Rumble, Generation Wars and Arcade Showdown; badge in Taste Dimension (defense sideways), Looboo and Lairbreakers.

## Mechanics Shelf (mix and match)
A station listing 58 recipes in seven groups:
- Resources
- Combat
- Board
- Winning
- Timing & turns
- Card types
- Keywords & counters

Each recipe is a one-click edit that adds a whole mechanic to any game: its stats, types, keywords, rules settings and example cards. Examples:
- colored lands; inkwell; any card as mana; face-down resources;
- resource deck; attached energy; pitch & attack cards; action points; level requirement; energy requirement; power boosts;
- attack & block; power duels; positions; questing; counter step; life-card triggers;
- twin arenas; front line & reserve; battlefields; active & bench; leader; deployable leader;
- life cards; shields; prizes;
- stack; chains; alternating actions; draw up to; combat phase;
- traps; tributes; evolution/shift; fusion deck; gear & pilots; songs; items;
- keyword toolkit; +1/+1 counters; a custom keyword with abilities.

### Sub-options (◀ ▶ on an added recipe)
Every recipe has at least two sub-options (130 in all, in `OPTS` in `packages/maker/src/recipes.ts`). Once a recipe is added, its box shows each option as a row, *label ◀ value ▶*, and the arrows cycle through the choices. Before a recipe is added, its box lists the option names.
- **Design rule:** no recipe only copies the element from the game it came from. Each one exposes the knobs that turn it into something else: lands per turn and a colour limit, a stun that wears off or lasts until removed, a front line of any size, a resource deck of 6–12, breaker-style "harder per card" skill checks, and so on.
- A `RecipeOpt` is `{ id, label, values, names?, get(bp), set(bp, v) }`. `setRecipeOpt(bp, opt, v)` applies one value and keeps the starter decks legal: it refits deck sizes, trims off-colour cards when the colour limit drops, and resizes resource decks.
- `recipe-options.test.ts` checks every value of every option on a blank game:
  - the value sticks (`get` returns what `set` wrote);
  - the game builds and an AI game finishes;
  - at least one value changes the compiled module, so no option is decorative.

### Mechanics no source game has
Each of these sits in the group it belongs to, next to the borrowed mechanics.
- **World clock** (Timing & turns): a game **meter** with named values (Day/Night, four seasons, Calm/Storm) that cycles every N turns. Its last value can boost or weaken every unit, and the meter condition gates abilities ("Night Prowler"). The battle HUD shows the current time, and the log announces each change.
- **Heat** (Resources): a player meter raised by each card played (or by its cost). At its step you overheat, pay the penalty (damage, discard or exhaust) and reset. It decays each turn. "Cool Down" uses the *Change a meter* block.
- **Aging** (Keywords & counters): a unit meter that rises each of its owner's turns. A step destroys the unit at a set age, and/or it gets +power per point.
- **Rage meter** (Keywords & counters): a player meter raised when your units fall or you take damage, which pays off when full. It is the template for any custom meter.
- **Comeback** (Winning): a player behind by a set gap gets a bonus at the start of each turn until they catch up.
  - *Behind in* can be life, points, units, cards in hand, or a player meter.
  - The bonus is a draw, a resource, healing, or **any ability blocks** (edited under Keywords → Comeback).
- **Zone combat** (Combat): high/mid/low attacks with speed. Blocking from the next zone halves the damage, stops it all or does nothing, and attack speed is tunable.

All of them are in the Game Wizard's optional systems, gated to the combat systems where they make sense.

Further ideas, not built yet:
- a shared market row both players buy from;
- initiative bidding for who acts first each round;
- public objectives drawn mid-game;
- a shared draft pool between turns;
- weather that rotates rule changes.

Recipes stack, are recorded on the blueprint (`recipes`), and can be undone. `maker.test.ts` builds every recipe on a blank game, plays mixed combinations through, and checks replay and hidden information.

The recipes cover the structures needed for future starter games:
- an inkwell with lore questing and songs;
- shields with free triggers and mana from any card;
- a level-gated resource deck with pilots and shields;
- twin arenas with a base, alternating actions and a deployable leader;
- pitch with attack cards, blocking from hand and go again;
- action points with energy lines and life triggers.

## What fits with what (one table)
`packages/maker/src/fits.ts` holds, for each mechanic, what it **needs** (all of), **needs any** of, **clashes** with, and whether it **replaces** a core system (resources or combat). Features are plain strings:
- `res:<system>`, e.g. `res:pitch`, `res:skillChecks`, `res:free`;
- `combat:<style>`, e.g. `combat:lanes`, `combat:duel`, `combat:runs`;
- the ids of mechanics already added, e.g. `quest`;
- `units`: a card type that fights;
- `scripted`: cards or rules with custom script.

Three tools read the same table:
- **Game Wizard:** `answerFeatures(answers)` turns the picks into features, and each mechanic option is shown only when it fits.
- **Mechanics Shelf:** `featuresOf(bp)` reads the game.
  - A mechanic that doesn't fit is dimmed, with the reason ("Needs a card type that fights", "Doesn't work with battlefields").
  - Swapping a core system in a game with scripted cards gives a softer warning.
  - **Adding is tried on a copy first.** If the mechanic would add build errors, the shelf lists them and asks *Add anyway* or *Cancel*.
- **Surprise me:** each pick is chosen among the mechanics that fit what is already in.

Two safety nets in the compiler:
- Costs paid outside a mana pool (move to a place, shift, boost, ward…) are free in games without one.
- Zones that effect blocks mention but the game lacks (resources, active, bench…) are declared empty and hidden, so those blocks do nothing instead of breaking the build.

A sweep of every mechanic on every default game is the evidence behind the table. `recipe-options.test.ts` re-checks blank, Lairbreakers, Looboo and Generation Wars: every mechanic the table allows builds there.

## Meters (Keywords station)
A meter is a number kept on each player, each unit or the whole game (`bp.meters`, stored as var `m_<id>`). Heat, rage, age, doom tracks, combo counters and day/night clocks are all meters.
- **Raised by** any of:
  - a card being played (by its amount, or by the card's cost);
  - the owner's turn starting or ending;
  - taking damage;
  - attacking;
  - a unit being destroyed.

  Turn-based gains can happen every N turns.
- **Shape:**
  - it can decay each turn;
  - it can cap at a max, or cycle back to 0 there;
  - its values can have names (Day, Night…), shown in the HUD for game meters.
- **Steps:** when the meter reaches n, it runs effects (any ability block), optionally resets, and writes its own log line (`say`, with `{p}`, `{o}` and `{s}`).
- **Bonuses:**
  - *aura*: while the meter is at least (or exactly) a value, units get +n of a stat. Game meters give it to all units, player meters to that player's units, and unit meters to that unit.
  - *per point*: +n of a stat for each point.
- **On cards:**
  - the condition *if a meter is at a value* (at least / at most / exactly; named values can be picked by name);
  - the effect *Change a meter* (add, subtract or set; yours or the opponent's).
- **Compiled form:** one procedure per meter, `mtr_<id>(owner, n)`, which adds, clamps or cycles, runs the steps it crosses and emits `mt_<id>_<step>` / `mv_<id>_<value>`. Triggers call it, and so do the effect blocks.
- **AI:** each player or unit meter can say how much the computer values a point (`ai`). Heat is negative, so the AI avoids overheating; Rage is positive.
- **Checks:** lint flags duplicate meter ids, cycles without a max, and conditions or effects naming a missing meter.

## The ability builder: context and order
- **Only what fits the game.** Every list (When, If, Do, Target, Amount) hides options the game can't use, for example:
  - meter effects and conditions with no meter;
  - counter or status blocks with none defined;
  - quest, conquer or access triggers without questing, battlefields or runs;
  - life effects without life;
  - leader targets without a leader;
  - resource effects in the wrong resource system.

  "Always on" abilities offer only the effects that work as auras (aura, cost reduction, prevention, "instead", restrictions), and other abilities hide those. An option that's already picked always stays visible. The rules live in `EFF_OK`, `WHEN_OK`, `COND_OK`, `TGT_OK` and `AMOUNT_OK` in `apps/web/src/ui/maker.ts`.
- **Most used first.** Each list opens with a *Most used* group, the top 8 by how often they appear in the eight default games, then *More*.
  - The counts are in `packages/maker/src/usage.ts`, regenerated by `npm run -s modules`.
  - For example, *Boost a stat* and *Draw cards* top the effects, and *When played* and *Activated* top the triggers.
- **New options:**
  - **Up to N targets:** for any "choose" target.
  - **Times:** do an effect N times, choosing again each time.
  - **You may:** for triggered abilities; the player is asked.
  - **Button name:** for activated abilities.
  - **Custom (script) condition.**
  - **More filters:**
    - ready only or exhausted only;
    - damaged only;
    - without a keyword;
    - has a counter;
    - a unit meter at least N;
    - a stat at exactly N.
  - The runs-only *when accessed* trigger.

## More card text
- **Choose one —** (`{k: 'choose', modes: [{label?, do}]}`): the player picks one mode. Each mode is a list of ability blocks.
- **X costs** (`card.xCost`): after the printed cost, the player chooses X up to what's left in their pool and pays it. Amounts can use **X = the X paid**. In games without a resource pool, X is 0 (lint says so).
- **Later** (`{k: 'later', at: 'yourNextTurn' | 'endOfTurn', do}`): delayed effects.
  - Effects aimed at "this card" mark the card. Others count on the player.
  - A turn-start or turn-end trigger fires them, e.g. "take control of an enemy unit, then at the end of this turn, return this to hand".
- **Until your next turn:** a duration for boosts and restrictions. Engine `modify {until: "nextTurn"}` ends when its maker's next turn starts (DSL.md).
- **Other cards' triggers:** whenever another of your units is destroyed, an enemy unit is destroyed, another unit enters on your side, or a unit enters on the opponent's side.
- **Take control** (`steal`: the unit moves to your side) and **Copy** (`copy`: a token copy for you).
- Each of these has a Workshop editor (modes, the "later" list, an X-cost checkbox on the card) and context rules.

## Composable targets
Any targeted effect can **✎ build target** instead of using a preset (`Effect.pick`):
- **whose:** enemy, your, or anyone's;
- **what:** units, units or players, players, leaders, leaders or units, or permanents (non-units);
- **how:** you choose up to N, all of them, or N at random;
- **not this card** (for your own).

The text reads naturally, e.g. "2 random enemy permanents", "up to 2 other units you control", "each unit or player". The 23 presets remain as shortcuts, and **presets** switches back.

## Balance check (Test station)
`packages/maker/src/balance.ts`:
- **Card value:** each card gets a value in stat points, from its stats, keywords and abilities. Each effect has a weight, scaled by how often its trigger fires and by conditions and costs.
- **Cost curve:** value against cost is fitted with a straight line for units and for spells, from the game's own cards. A card off the line by more than a point and 1.5 standard deviations is flagged *strong* or *weak*, e.g. "plays like a 5-cost card at cost 3". It gets a suggested cost, at most 3 away and within the game's range.
- **AI-lab data:** after a run, a card won in ≥ 70% (or ≤ 30%) of 8+ games it was played in is flagged too. When the curve and the games agree, the note is marked ✔✔.
- **Set cost to N** applies the fix, keeping the colored part of typed costs. **Open** jumps to the card.
- These are estimates; the panel says to trust playtests over them.

## Changing amounts (X)
Any effect with an amount can use **X** instead of a fixed number (`Effect.amount`). X can be:
- your units, the opponent's units, or all units;
- cards in your hand, the opponent's hand, your discard pile or your deck;
- your life or the opponent's;
- a meter (this unit's, yours or the game's);
- counters on this card, or one of this card's stats;
- the turn number.

It takes a multiplier (½, 2, 3…) and a plus. Auras use it too ("+1 power for every 2 cards in your hand"). The card text adds "…, where X is the number of units you control plus 1".

## Comparisons on every number
Every numeric condition can compare **at least / at most / exactly**: units, life, hand, resources, counters, cards in a zone, cards played, given resources, opponent's life, charge, cards under, and meters. Each kind keeps its usual default (life "or less", units "or more"…), so existing cards read the same.

## Any-event triggers
- An ability can be **Whenever a named event happens**, optionally only yours or only your opponent's. Events can be:
  - a meter step ("Whenever Heat reaches 5") or a named meter value ("Whenever it becomes Night");
  - a game event (damage, a destroyed card, a quest, a conquest, a coin flip…);
  - any event your scripts `emit`.
- Meters can also rise on any named event.
- Lint flags event abilities and meter gains with no event picked.

## Combined conditions
An ability's *If* can be **all of these…**, **any of these…** or **not…**, each holding further conditions (up to four levels), e.g. "if it is Night and not during your turn". The card text reads naturally ("if A and B", "if A or B", "unless A"). In the blueprint: `{k: 'all' | 'any' | 'not', of: Cond[]}`.

## Event messages (log text as data)
The battle log and the move captions take a game's own lines from `theme.log`, keyed by event type, before the built-in text. The compiler fills it from:
- meter steps and named values;
- comeback;
- the Script Lab's **Event messages** box (`advanced.log`), so events your own triggers `emit` get readable lines.

Templates:
- `{p}`: the player, as You or Opponent;
- `{o}`: a card;
- `{s}` / `{es}`: verb endings;
- `{is}` / `{has}`;
- any `{field}` of the event: player ids and card ids become names.

## Card tags
Cards a mechanic adds are tagged `<recipe>:<card>` (e.g. `costReducer:guild-charter`). Sub-options find their example cards by tag, so renaming a card or changing its id doesn't break the option.

## Shop and Campaign stations (optional)
Two optional stations; a game can have either, both or neither (`bp.economy`, compiled by `economy.ts` into the module's `campaign`).
- **Shared:**
  - **currencies**, up to 5; the first is the main one, and each has a name, an icon and a starting amount;
  - **decks every player starts with** (leave it empty to make players pick a free starter in the shop).
- **Shop:** a Shop on the game menu.
  - **Booster packs:** slots of N random cards drawn by rarity, type and/or color (cards get a *rarity*; *Set rarities from cost* fills them in).
  - **Items:** a pack or a deck, with:
    - a price in any currency;
    - how often it can be bought (once, N times, any number of times);
    - a **choose-one group** (price 0 makes it a free starter pick);
    - a **promo first price**;
    - a badge;
    - **locks** behind campaign wins.

    *+ Free starter pick* adds your decks as a free choose-one set.
  - Without a campaign, the Shop starts the player's collection by itself.
- **Campaign:** a Campaign on the game menu.
  - **Story:** a name and an opening dialogue.
  - **Tiers:** named, shown in order on the map.
  - **Battles**, each with:
    - an opponent, a portrait and **their deck** (a Workshop deck);
    - an **AI level**: Easy = random, Normal = one move ahead, Hard = the planner;
    - a tier, and **locks** behind other battles;
    - **rewards in each currency** for the first win, each replay win and a loss, plus packs on the first win;
    - dialogue **before**, **after a win** and **after a loss**.
- **✨ Fill in an example** sets up two currencies, free starter picks, a booster (first one free), a gem pack, a deck locked behind the final battle, and three tiered battles from Easy to Hard.
- **Checks:**
  - lint flags: more than 5 currencies, no way to get a first deck, items selling missing decks or packs, missing currencies, battles with a missing deck, and gates on battles that don't exist;
  - the compiled data also goes through the campaign validator;
  - `economy.test.ts` runs the compiled shop and campaign through the real runtime: picks, promos, locks, multi-currency rewards, gates and shop-only games.

## Workshop extras
- **Undo / redo** (↶ ↷ in the top bar). Fast typing collapses into one step.
- **Auto-written rulebook** on the Publish station, downloadable as Markdown (`rulebook()`/`rulebookMarkdown()`).
- **Spreadsheet:** export cards as CSV and import CSV to add or update cards in bulk (`cardsToCsv`/`cardsFromCsv`). Valued keywords are written as `resist:2`; abilities stay on matching card ids.
- **AI Lab per-card stats:** after a run, a table shows how many games each card was played in and the win rate when played (hot and cold cards are highlighted).

## Deeper scripting
- **A card's Advanced box:** JSON merged over the compiled card. Use it for extra `abilities`, `statics`, `replacements` or any DSL field.
- **Custom effect blocks** hold a raw DSL effect list. **Custom phases** run your own effects.
- **Script Lab:**
  - a rules patch, deep-merged into `rules.json`;
  - extra rule triggers;
  - functions and procedures;
  - AI hints;
  - a read-only view of the compiled rules;
  - **Import & export** (`packages/maker/src/scripts.ts`):
    - *Export scripts* saves one `.script.json` holding the rules patch, triggers, functions, procedures, AI hints, and every card's Advanced box keyed by card id: `{format: "ucb-script", v: 1, from, advanced, cards?}`.
    - *Import* reads a file, or JSON pasted on the page. It also accepts a bare `{rules?, triggers?, functions?, procedures?, ai?, cards?}` object.
    - It checks the shape and gives a readable reason for anything wrong, e.g. a trigger without `on`/`do`, a function without `body`, or a newer version.
    - **Merge** deep-merges the rules patch and appends triggers, skipping exact duplicates. Functions, procedures and AI hints are added or replaced by name. Card patches merge into cards with the same id, and the import lists the ids it skipped.
    - **Replace** swaps only the parts the file contains.
    - A report lists what changed.
    - *Export compiled rules* downloads the full compiled `rules.json`.
    - `scripts.test.ts` covers the round trip, merge and replace, and rejection of bad files.
  - **Script library:** save the current game's scripts under a name, then add them to any project, export them or delete them. The library is kept in the browser and shared by all projects. Built-in starter scripts (`packages/maker/src/library.ts`): Overtime, Doom clock, Second wind, Helper functions, Aggressive AI. Each one is tested to build and play on a blank game.

Everything here is the engine DSL (`docs/DSL.md`), so a Maker game can grow into anything an official module does.

## Compiler notes
- Zones depend on the systems chosen:
  - always: deck, hand, support, limbo, discard, void;
  - with a leader: a leader zone;
  - the unit zones: a field; or active and bench; or base and lanes;
  - resources and a resource deck, when the resource system uses them;
  - life cards, prizes and an extra deck, when the game uses them.

  Deck sections (`format.zones`) appear for leaders, extra decks and resource decks.
- Rules text comes from `abilityText`/`cardText`. Cards carry `role`, `res` (the color they produce) and, for presentation, `glyph` and `hue` (a color's tint).
- Battles open a `battle` timing window with four steps:
  1. declare;
  2. block or redirect;
  3. respond: alternate in simple timing, otherwise the game's timing;
  4. damage.

  `$win.attacker`, `$win.target` and `$win.defender` are available to cards.
- The AI evaluation weighs units by power and health, hand size, life or life cards, prizes, points and resources. Each blueprint can override it in the Script Lab.
- Engine change made for the Maker: `choose` now evaluates `min`/`max` expressions, so "discard down to 7" and "tribute N" work. Earlier modules that relied on it got real limits, and the golden hashes were refreshed.
