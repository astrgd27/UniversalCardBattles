# Making a game module

A module is a folder (or `.zip`) of JSON files. No code is involved, and the engine enforces every rule you write.
`docs/DSL.md` is the full reference. This page is the short path.

## 1. Files
```
my-game/
  manifest.json      {"moduleId": "my-game", "displayName": "My Game", "semanticVersion": "0.1.0", "engineApiRange": "^0.3.0",
                      "tagline": "One line for the menu", "theme": {"accent": "#e4572e", "accent2": "#ffc914", "glyph": "✶"}}
  rules.json         players, zones, phases, actions, triggers, state checks (the game itself)
  cards.json         [{"id", "name", "type", "cost", "text", ...stats, abilities, effects}]
  decks.json         {"starter": ["card-id", ...]}
  ai/ai.json         {"eval": <expression valued for $me>} so the AI knows what "winning" looks like
  campaign/campaign.json   optional single-player campaign
  assets/            optional art (png/jpg/webp/gif); refer to it with "art": "assets/x.png" on a card
```
Start by copying `packages/test-harness/fixtures/spark-duel`. It is the smallest complete game.
Card looks: set `presentation.byType` in the manifest, e.g. `{"unit": "skirmisher", "spell": "spell"}`. You can also define your own templates (see `DSL.md`, Presentation).

## 2. Think in four parts
1. **Zones**: where cards can be, and who can see them (`public`, `owner`, `hidden`).
2. **Phases**: what happens automatically (`auto` phases with `do` effects) and when players act.
3. **Actions**: what a player may do. Each has `source` (which cards), `req` (with a "why" message players will see), `targets`, `cost` and `do`.
4. **State checks and triggers**: rules that always apply (a unit with damage ≥ health is destroyed; a player at 0 life loses).

Everything is an S-expression, e.g. `["damage", "$t", ["get", "$self", "power"], "$self"]`.

## 3. Check, play, balance
```
npm run -s validate packages/modules/my-game      # file:line:col errors
npm run -s sim my-game -- --games=200                     # random games: crashes, stuck games, length
npm run -s tourney my-game -- --agents=heuristic,heuristic --decks=a,b   # deck balance with the AI
npm run -s events my-game action destroyed                # does that mechanic actually happen?
npm run -s pack packages/modules/my-game out.zip  # signed package for the browser's "Load a game"
```
Rules of thumb:
- The validator catches typos in ops, zones, cards, layers and script arity.
- `sim` catches loops and unwinnable states.
- Run `tourney` from both seats, because a 20-game sample is only accurate to about ±11%.

## 4. Campaigns
- Add `campaign/campaign.json`: currency, starter collection and decks, chapters of encounters, boosters and a shop.
  - `currencies: [{id, name, icon?, start}]` (up to 5; the first is the main one and `currency` mirrors it).
  - Rewards take `coins: {currencyId: n}`.
  - Shop items take:
    - `currency` (what the price is in);
    - `requires` (encounters to win first);
    - `firstPrice` (a promo first price);
    - `badge`.
  - `encounters` may be empty for a shop-only module; the menu then shows only the Shop.
  - Encounter AI `kind` can be `random`, `heuristic` or `planner`.
- An encounter can carry a `scenario`: extra setup, game vars and `once` triggers. Triggers can `emit` dialogue, `create` tokens, change a boss phase var, or end the game.
- Rewards are granted exactly once per attempt.
- See `docs/DSL.md` (Scenarios, Campaigns) and the Spark Duel campaign.

## 5. Things the engine guarantees, so you don't have to
- Hidden information never reaches the wrong player, including in logs, legal actions and AI simulations.
- The same seed and the same commands always replay identically, and saves refuse to load into changed rules.
- Scripts (`rules.functions` and `procedures`) are data, with step and depth limits, so they cannot hang or reach outside the game.
