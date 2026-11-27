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
- Counter events are quick spells that target "the unit being attacked" (`battleTarget`) or "the attacking unit" (`attacker`), played in the response step.

## Mechanics Shelf (mix and match)
A station listing 40 recipes in seven groups:
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

Recipes stack, are recorded on the blueprint (`recipes`), and can be undone. `maker.test.ts` builds every recipe on a blank game, plays mixed combinations through, and checks replay and hidden information.

The recipes cover the structures needed for future starter games:
- an inkwell with lore questing and songs;
- shields with free triggers and mana from any card;
- a level-gated resource deck with pilots and shields;
- twin arenas with a base, alternating actions and a deployable leader;
- pitch with attack cards, blocking from hand and go again;
- action points with energy lines and life triggers.

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
  - a read-only view of the compiled rules.

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
