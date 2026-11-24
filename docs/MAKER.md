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
  2. Card Frames
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
