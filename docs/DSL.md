# Rules DSL (engine API 0.3.1)

A module is a folder or ZIP package (see **Packages** below). All logic is JSON S-expressions: `["op", arg, ...]`. The reference module is `packages/test-harness/fixtures/spark-duel`.

## Values and variables
- Strings that start with `$` are variables. Other strings are literals.
- Dotted paths read into objects, for example `"$e.newObj"`.
- `"game"` is a ref for game vars (`rules.gameVars`): `["get", "game", "x"]`, `["set", "game", "x", 1]`.
- Built-in variables:
  - `$me` is the acting or controlling player, and `$opp` is the next living player after `$me`.
  - `$self` is the source object.
  - `$e` is the triggering event.
  - `$it` is the current item inside `filter`/`any`/`all`/`sum`.
  - `$turn`, `$active` and `$phase` (the current phase id).
- Player ids are `p0..pN`. Object ids are `o<n>`, and an object gets a **new id on every zone change**. `inst` stays stable.
- Zone keys are `p0:hand`, or `shared:<zone>` for shared zones.

## Expressions
| op | meaning |
|---|---|
| `lit x` | literal (no evaluation) |
| `+ a b...`, `- a b`, `* a b`, `/ a b` (floor), `neg a`, `min a b`, `max a b` | arithmetic |
| `= != < <= > >=`, `and ...`, `or ...`, `not a`, `? c a b` | logic |
| `get ref name` | player var, or object field. Special names: `id owner controller zone card`. Then relationships (`rel`), then **computed stats** (`rules.stats`), then object vars, then card definition fields (`cost`, `type`...), else 0. Stack items: `controller kind card source speed label` |
| `has obj kw` | the card's `keywords` include kw, or object var `kw:<kw>` is > 0 |
| `players` | living player ids |
| `opp p` | next living player after p |
| `cards p zone` | object ids in a zone (`p` = `"*"` means all players) |
| `top p zone n` | first n ids |
| `count l`, `first l`, `list a b...`, `concat l1 l2...`, `in x l` | lists |
| `filter l pred`, `any l pred`, `all l pred`, `sum l expr` | uses `$it` |
| `isPlayer x`, `isObj x` | type tests |
| `stack` | stack item ids, top first |
| `call fn args...` | calls a script function (`rules.functions`) |
| `let $v value body` | local binding |
| `map l expr`, `sortBy l key`, `maxBy l key`, `minBy l key` | list helpers that use `$it` |
| `range n` (n ≤ 10000), `slice l a b?`, `reverse l`, `nth l i`, `mod a b`, `abs a` | more helpers |
| `cell x y`, `cx c`, `cy c`, `cellOf obj`, `dist a b`, `near c r` | grid geometry (`rules.grid {cols, rows, zones}`): cells are `"x,y"` strings, objects use vars `x`/`y`, `dist` is Manhattan, `near` lists in-bounds cells at distance 1..r |
| `ext name` | current value of an external input |
| `at x key`, `keys x`, `values x`, `same a b` | map and list access; `same` is deep equality (`=` compares single values) |
| `linked target rel` | objects whose relationship `rel` points at target |
| `allies p`, `enemies p` | living players on p's team / other teams (player var `team`); without teams: p itself / everyone else. `get p seat` is a player's seat index |
| `layer obj` | the object's grid layer name (`rules.grid.layers[z]`, var `z`) |
| `$last` | the most recent meaningful event (bookkeeping such as logs, `stacked`, `chose`, steps and phases is skipped), redacted for `$me`. Use it in `req` for "respond right after X" actions |
| `def cardOrObj field` | a card definition field, by card id or object (works in deck rules, where there are no objects) |
| `tally list keyExpr?` | counts into a map: each item's key (`$it`) is counted once; a list counts each element; a map adds its values (e.g. summing `yields`) |
| `distinct l` | unique items |
| `meets have need` | every `need[k] <= have[k]` (missing = 0): thresholds and requirements that are not paid |
| `canPay p res cost`, `pool p res` | typed payment check, and a player's pool `{type: n}` (see `rules.resources`) |
| `slots zone tag?`, `adjSlots zone slot` | slot ids of a slotted zone (optionally those with a tag), and a slot's neighbours |
| `inSlot p zone slot`, `freeSlots p zone card?` | objects in a slot; slots with room (that accept `card`: a card id or object) |
| `adjacent obj` | objects in the same zone whose slots neighbour obj's slot. `get obj slot` reads the slot |
| `uses group per key?` | a usage counter: `per` turn, phase or game; key defaults to `$me` (see `limit`) |

## Effects
Effects run in effect lists `[[op...], [op...]]`.

| op | meaning |
|---|---|
| `draw p n` | moves the top deck card to hand. An empty deck emits `drawFail` |
| `move objs zone {player?, pos?: "top", as?: "$v", faceDown?: true, slot?}` | moves objects to a zone (owner's zone by default). `as` rebinds the new id(s). In a slotted zone the object takes `slot` (or the first free slot that accepts it); with no room it stays put and `slotFull` is emitted. A face-down object's identity is known only to its controller (views show `card: ""`), its abilities don't work, and `get obj faceDown` reads the flag. Cards owned by `"shared"` become the taker's |
| `shuffle p zone` | seeded shuffle |
| `set refs name v`, `inc refs name d` | player or object vars. Emits `changed` |
| `damage targets n src?` | players lose `damage.player` (default `life`); objects gain `damage.object` (default `dmg`). Emits `damage` |
| `destroy objs` | moves to `graveZone`. Emits `moved` and `destroyed` (with last-known info) |
| `lose p`, `win p` | the game ends when one player or none remains (none = draw) |
| `if cond then else?`, `each list $v body`, `let $v expr` | control. Branch and loop bodies get a **copy** of ctx (block scope) |
| `choose {who?, from, min?, max?, as, prompt?}` | pauses for a player decision. It auto-resolves when there is no real choice. `max` 1 binds a single id, otherwise a list |
| `run obj field` | runs the card definition's effect list `field` with `$self` = obj and `$me` = its controller |
| `emit type {k: expr} {to?: players}`, `log msg`, `endPhase` | custom events (with `to`, only those players see the fields: a private look), a log line, and ending the current phase |
| `counter items` | removes stack items and runs their action's `countered` effects |
| `modify objs {layer, mods, until?: "turn"}` | a temporary continuous effect. Values are fixed when it's created, and it applies only to those object ids |
| `link objs rel target`, `unlink objs rel` | relationships (attachments and so on). A zone change clears them |
| `call proc args...` | runs a script procedure (`rules.procedures`) |
| `commit {who?, from, min?, max?, as, prompt?, reveal?}` | simultaneous secret choice. Each player in `who` (default: all living players) picks from `from`, evaluated with `$p` set to them. Picks are masked from everyone else, then bound as `{playerId: pick}`. A public `revealed` event follows unless `reveal: false`, which keeps the picks secret for a later commit. Note: it binds `$p` |
| `random {min?, max, as}` / `random {from, n?, as}` | seeded integer, or a random pick (a list when `n` is given). Emits `random`; picks of hidden objects are masked |
| `create card player zone {as?, faceDown?, slot?}` | creates a new object (a token) from a card definition. Emits `created`. Mark token-only cards with `maxCopies: 0` |
| `gotoPhase id` | ends the current phase and continues at phase `id`. Jumping to the last phase ends the turn after it runs, e.g. when a shared meter crosses a threshold |
| `openWindow id {data?: {k: expr}}` | opens timing window `id` (`rules.windows`): the turn pauses (this effect list, the stack and priority are saved), the window's steps run like phases, then everything is restored and this effect list continues after `openWindow`. `$win` reads the window's data, `$window` its id, `$phase` the current step. Windows can nest (8 deep). Emits `windowOpened`, `step`, `windowClosed` |
| `winSet key expr`, `closeWindow` | change the innermost window's data; close it early (when the current effects finish; leftover window stack items are dropped). `endPhase`/`gotoPhase` move between steps while a window is open |
| `pay p res cost` | pays a typed cost: specific types first, then the generic key (default `any`) from the largest pools. Unpayable = the whole action is rejected. A number is an all-generic cost. Emits `paid` |
| `gain ps res {type: n}`, `empty ps res` | add to / clear typed pools |
| `become objs {copy?, blank?, until?: "turn"}` | **identity change**: the objects become a copy of a card (a card id, or an object's current card) and/or lose all abilities (abilities, statics, replacements, keywords and activated abilities). Copies apply first, then ability loss, whatever the order. `get obj card` is the current card and `get obj printed` the printed one; views show `printed` and `blank`. Emits `became` |
| `divide {among, amount, as, each?, who?, prompt?}` | a **division decision**: the player splits `amount` among `among` (each recipient gets at least `each`), bound as `{recipient: points}`. The answer repeats an id once per point. One recipient resolves on its own |
| `control objs p` | gain control: the same object (same id, no zone change events) moves to p's side of its zone, taking a free slot in slotted zones. Owner is unchanged, so it still goes to its owner's grave. Emits `controlled` |
| `firstPlayer p` | setup only: player p takes the first turn (e.g. after `random {from: ["players"], as}`). Emits `firstPlayer` |
| `setSlot obj slot` | repositions an object inside its slotted zone; a full one-object slot swaps the two. Emits `slotted` |
| `flip objs up?` | turns face up (default) or face down. Emits `flipped` (with `card` when turned face up) |

`choose` `min`/`max` may be expressions ("discard down to your hand size"); only a literal `max` of 1 binds a single id. `choose` also takes `secret: true` (masks the pick from others) and `required: true`: if fewer options than `min` exist (typically during a cost), the whole action is rejected and nothing changes.

`draw`, `move`, `destroy`, `damage` and `lose` are **proposed events** that pass through the replacement pipeline.

## rules.json
- `players {min,max}`, `playerVars`, `objectVars` (reset on every zone change).
- `zones[] {id, vis: public|owner|hidden, shared?, ordered?, abilities?, slots?}`. Card abilities function in zones with `abilities: true` unless the ability lists `zones`.
  - `hideEmpty: true` (presentation): the table leaves the zone out while it is empty (faction-only zones in asymmetric games). Theme `announce: {eventType: text}` shows a big banner when that event happens (as for a new turn). `{field}` inserts an event field: players and cards print their names. `showIf: expr` draws a player's copy of the zone even while it is empty whenever the expression holds (`$me` is the zone's owner), e.g. a faction's play area from turn 1. Views carry it as `zones[key].show`, so it must read only public state. `offTable: true`: an internal zone the table never draws. `compact: true`: the table draws the cards small and overlapping (resource rows).
  - `slots [{id, types?, kinds?, cap?=1, tags?, adj?}]` makes a **slotted zone** (equipment slots, front/back rows, circles, provinces). `types` limits card types, `kinds` the card field `kind` (string or list), `tags` group slots (the UI draws one row per first tag), `adj` lists neighbours. Objects carry their slot; it is cleared by a zone change.
- `deckZone`, `handZone`, `graveZone`, `format {deckMin, deckMax, maxCopies, zones?}`, `damage?`, `turnLimit?`.
  - `format.zones [{zone, min, max, types?}]` declares deck sections. A deck is then `{zone: [ids]}`; a plain list is always the main deck.
  - A card may override the copy limit with `maxCopies`; a section may add its own `maxCopies` (e.g. singleton extra decks).
  - `copiesBy: "name"` counts copies by a card field instead of id, so reprints and alternate art share one limit.
  - `rules [{if, why}]`: construction rules as expressions over `$deck` (every card id) and `$sections` (`{zone: ids}`), using `def`, `tally`, `distinct`, `count`, `all`… For example: colours, singleton, "at most 3 gear", "every card shares an aspect with the hero" (`["def", ["first", "$sections.hero"], "aspects"]`). Failed rules report `why`.
- `resources {id: {types, generic?="any", expire?: phase|turn}}`: **typed pools** held as player vars `"<id>:<type>"`. Costs are maps such as `{"sun": 1, "any": 2}`. `expire` empties the pools at the end of each phase or turn. Card fields can be maps (`cost`, `yields`, `needs`), and the UI prints typed costs as pips.
- `windows {id: {steps: [phase-like steps], timing?}}`: **timing windows** opened mid-turn by `openWindow` (combat steps, showdowns, counter or guard windows). Steps take `auto`, `do` and `timing` like phases; action `phases` lists may name steps. Step timing falls back to the window's, then the rules' timing. A typical defend step: `{"id": "block", "timing": {"mode": "alternate", "first": "$win.defender"}}`.
- `gameVars`: game-wide numbers.
- `sharedDecks {sharedZone: [ids]}`: cards created at the start in shared zones, owned by `"shared"` (markets, dice, a common deck).
- `setup`: effects run once with `$me` = p0.
- `phases[] {id, auto?, do?}`: `do` runs on entry. Auto phases advance by themselves. Others give the active player priority until they `pass`. A turn ends after the last phase.
- `actions{name: {label, phases, source?, req[{if, why}], targets[slot], cardTargets?, cost, do}}`:
  - `source` lists the legal source objects (`$self`).
  - `req` failures become explanation children.
  - A slot is `{as, from, min=1, max=1, prompt}`. `cardTargets` adds the source card's `targets`.
  - `cost` and `do` run in one frame.
  - `check [{if, why}]` runs after targets are chosen (targets bound) and rejects bad combinations, e.g. fusion recipes. Slot `min`/`max` may be expressions.
  - `limit {per: turn|phase|game, n?=1, by?: player|source|card|name|inst, group?}`: an **engine-tracked usage limit**. Counts are kept per player (default), per game object (`source`: resets when it changes zones), per physical card (`inst`), or per player and card id / card name. `group` shares one counter between actions ("one well per turn" across several actions). Over the limit the action is not offered, and proposing it explains why (code `limit`).
  - `activated: "field"`: **activated abilities printed on cards**. Each entry of the source card's `field` list (`{label?, phases?, speed?, req?, targets?, check?, cost?, do, limit?, countered?}`) becomes its own action named `"<action>#<index>"`, merged over the base action (lists concatenate with the base first; label, phases, speed and limit come from the ability). A limit on an ability counts per card ability by default. The base name alone is not playable. `#` is reserved in action names.
  - `pass` is built in and reserved.
- `triggers[] {on: eventType, if?, do, limit?}`: rule triggers, controlled by the active player. They always resolve immediately and before card triggers.
- `timing {mode: immediate|stack|chain, retain?, minResponse?=2}`, also overridable per phase. Each mode works as follows (a code sketch follows this list):
  - **immediate**: actions resolve at once, and only the active player acts.
  - **stack**: costs are paid, then the action goes on the stack. The caster keeps priority (`retain` defaults to true). When all players pass in a row, the top item resolves and the active player gets priority again. All players passing on an empty stack ends the phase. Auto phases advance once the stack is empty.
  - **alternate**: every player may act; after each action (always resolved at once) priority moves to the next player. All passing in a row ends the phase. `first` (an expression) picks who starts, e.g. an initiative holder. `who` (an expression giving a list of players) limits the step to those players: the others never get priority and their passes are not needed, and with nobody listed the step ends at once (e.g. "only the defender may respond": `{"mode": "alternate", "who": "$win.who"}`).
  - **chain**: priority goes to the next player after each action (`retain` defaults to false). A response needs speed ≥ max(minResponse, the top item's speed). When all pass, the whole chain resolves back to back, and triggers raised meanwhile form a new chain.
- Actions: `speed` (default 1) works like this:
  - With an empty stack, speed below `minResponse` is only allowed for the active player.
  - With a non-empty stack, it needs speed ≥ `minResponse`.
  - `stack: false` resolves at once.
  - `countered` effects run when the item is countered or fizzles.
- `targeting {deny: expr}`: an **engine-wide targeting rule** (untargetable, "can't be targeted by opponents"). Target slots never offer an option where `deny` holds (`$it` = the option, `$me` = the actor, `$self` = the source), and a target that becomes denied before resolution counts as gone. Slots with `untargeted: true` and `choose` decisions are not targeting and ignore it.
- `grid.layers [names]`: a grid with vertical layers (surface, underground, air…). Objects use var `z` as the layer index; `layer obj` names it. Interaction between layers is up to the module (filters on `layer`); the board labels each card's layer.
- `teams: true`: players carry the player var `team` (set it in `setup`). The game ends when only one team has living players; all its members win, including fallen ones (reason `lastTeam`). `$opp` becomes the next living enemy.
- Slots: `recheck` decides what happens at resolution:
  - `true` (default): the target must still be in `from`.
  - `"exists"`: it only has to still exist.
  - `false`: a cost choice, never rechecked.
  - If every bound target of a slot is gone, the item **fizzles**.
- `stats[]`: computed characteristics.
- `layers[]`: continuous-effect layer order.
- `statics[] {layer, affects, mods[{op: set|add|grant|remove, stat|kw, value}], if?}`: rule-level continuous effects. `$it` is the affected object inside `value`.
- `replacements[] {replace: draw|move|destroy|damage|lose, if?, instead | modify{field: expr}, order?}`: `$e` is the proposed event (`{type, obj|target|player, amount, to...}`).
- `stateChecks`: an effect list re-run after every change until stable (state-based actions).

## Cards
- Fields: `{id, name, type, text?, keywords?, targets?, effects?, abilities?, statics?, replacements?, ...any stat or named effect list}`. Any field whose value is an effect list is validated and can be run with `run`.
- Abilities: `{on, if?, do, zones?}`. `on` is an event type, or one of:
  - `enter`: this object arrived.
  - `leave`: left an ability zone (last-known info).
  - `destroyed`: last-known info.
- Ability options: `stack` (default true for cards; under stack/chain timing the trigger uses the stack), `speed`, `text` (used in labels), `once` (once per match), `limit` (like action limits; counted when it triggers, by its controller and `$self`).
  - `optional: true`: a "may" ability; its controller chooses use or decline when it resolves.
  - `last: true`: **missing the timing**. When resolution finishes, the trigger is dropped (a `missed` event) unless its event was the last meaningful thing to happen; "when X, you can" abilities miss if X happened mid-resolution.
- Identity statics: `statics [{affects, identity: {copy?, blank?}, if?}]` change identity instead of characteristics (e.g. "other units lose all abilities"). They are read from the source's printed card, so identity statics never depend on each other.
- Card `statics` and `replacements` work in ability zones, the same as abilities.
- In leave and destroyed abilities, `$self` is the new object (for example in the grave), `$me` is the last controller, and `$e` carries the old id.

## Events
- Every event has `seq` and `type`. Types: `moved`, `changed`, `damage`, `destroyed`, `drawFail`, `shuffled`, `lost`, `phase`, `pass`, `action`, `chose`, `gameOver`, plus custom ones.
- `masks: [[viewers], [fields]]` removes fields for everyone else. Use `eventsFor(match, p)`.

## Scripts
- **Functions** are pure expressions: `rules.functions{name: {params: ["$a", ...], body: expr}}`.
- **Procedures** are effect lists: `rules.procedures{name: {params, do}}`.
- Both can also live in `scripts/*.json` as `{functions?, procedures?}`.
- A script sees only its parameters plus the caller's `$me`, `$opp`, `$self` and `$e`. It can't touch engine state except through effect primitives.
- Scripts are JSON data, not JavaScript, so they have no DOM, network or filesystem access and are deterministic by construction.
- Limits: 100,000 evaluation steps per outermost function call and a call depth of 64. Breaking either raises `ScriptError`, and the command is rejected with the match unchanged.
- Arity and names are checked statically.

## External inputs
- `rules.external {name: [allowed values]}` declares inputs from outside the game: a sensor, a physical toy, a host setting.
- `MatchOpts.external` sets initial values. The default is the first allowed value.
- `setExternal(match, name, value)` changes one at any time. It is not a player action: it is logged as a command (replays include it), emits a public `external` event that triggers can react to, and is read with `["ext", name]`.

## Scenarios (`MatchOpts.scenario`)
- `{setup?, vars?, triggers?}` are validated additions to a normal match (`validateScenario`), used by campaign encounters and puzzles.
- `setup` runs after the module's setup, with `$me` = p0 and `$opp` = p1. `vars` seed game vars.
- `triggers` behave like rule triggers. With `once: true`, a trigger fires at most once per match; this works for any trigger.
- Scenarios are part of the match options, so replays and saves include them.

## Campaigns (`campaign/campaign.json`, runtime in `packages/campaign`)
- Top-level fields:
  - `name`, `intro [{speaker, text}]`, `currency {name, start}`
  - `starter {collection {card: n}, decks}`, `decks` (opponent decks)
  - `chapters [{id, name, nodes: [encounterId]}]`, `encounters {id: Encounter}`
  - `boosters {id: {name, slots [{count, pool, weights?}]}}`, `shop [{id, name, price, booster | card | deck, stock?, group?, text?, art?}]`
  - A `deck` item adds a whole deck (a module or campaign deck) to the collection and saves it as a ready deck. Items sharing a `group` are exclusive: once one is bought, the others are locked (e.g. "claim one free starter"). `starter.decks` may then be empty.
- An encounter has:
  - `{name, opponent, portrait?, deck, requires?, repeatable?, intro?, outro?, defeat?}`
  - `ai {kind?, bias?, phaseVar?, phases {value: {bias}}}`: the boss changes its bias when a game var changes
  - `scenario?`, `rewards {first?, repeat?, loss?: {currency?, cards?, packs?}}` (`loss` is paid for every lost attempt)
  - Scenario triggers can `["emit", "dialogue", {speaker, text}]`; the UI shows it and holds the AI until it is dismissed.
- `tutorials [{id, name, blurb?, icon?, deck, opponentDeck, opponent?, seed?, scenario?, steps, script?, rewards?}]`: **scripted lessons**, played from the module's Tutorials menu.
  - `scenario` builds the set-piece board (any effects, including module procedures). `seed` fixes everything random.
  - Each step has `say` (the coaching line) plus at most one of:
    - `do {action, card?, targets?}`: the move the learner must make. The app offers only that move and only those targets.
    - `pass: true`: the learner must pass.
    - `decide [options or card ids]`: the expected answer to a pending decision; `[]` accepts any answer.
    - neither: a read step that pauses the game until Continue. With `wait: true` it appears only once it is the learner's move again, so the opponent plays on first.
  - Cards and targets are named by card id (`"$me"` / `"$opp"` for players), never by object id.
  - `script` lists the opponent's moves in order. A move that isn't legal yet is kept for later and the opponent passes.
  - `rewards` are paid once, on first completion (ledger key `tut:<id>`). The runtime lives in `packages/campaign/src/tutorial.ts`, and `tests/tutorials.test.ts` plays every tutorial of every module through as the app does.
- Profiles are plain JSON. Rewards and purchases are idempotent through ledger keys (`enc:<id>:<attempt seq>`, `shop:<item>:<seq>`), so a reload can never grant twice. Boosters are seeded and deterministic.
- `validateCampaign(mod, campaign)` checks references, deck legality and ownership, and scenarios. Package loading runs it.

## AI hints (`ai/ai.json`)
- `{eval?, bias?, samples?, horizon?}`.
- `eval` is an expression valued from `$me`'s point of view (`$opp` = next player). Higher is better. Wins and losses are scored automatically.
- `bias {actionName: number}` is added to that action's score. `samples` (1–16) sets the possible worlds per decision (default 2).
- `horizon` is `"action"` (default: score the position right after the candidate) or `"pass"` (score a non-pass candidate after the agent also passes). Use `"pass"` when passing runs end-of-step effects such as upkeep, income or damage. Otherwise the AI sees any neutral action as better than passing, because only the pass line pays for the end of the step.
- Without `eval`, the agent counts controlled objects in ability zones plus 0.3 per card in hand.
- **Possible worlds:** `determinize(match, p, seed)` re-samples every identity p cannot see:
  - p's own hidden cards and shared pools are shuffled among themselves (p knows that multiset);
  - other players' hidden cards are drawn from the public card pool;
  - the RNG is reseeded, and other players' secret picks and decklists are removed.
  Agents only ever get views, legal actions and these worlds.

## Packages (module SDK)
- **Layout:**
  - Required: `manifest.json`, plus `rules.json` (unless the package is an expansion).
  - Cards: `cards.json` and/or `cards/*.json` (arrays).
  - Decks: `decks.json` and/or `decks/*.json` (objects).
  - Optional: `scripts/*.json`, `assets/*` (png, jpg, webp, gif, mp3, ogg, wav, woff2, txt, json; 4 MB each).
  - `ai/ai.json` (AI hints) and `campaign/campaign.json` (see above). Reserved for later: other `ai/` files, `tests/`. `LICENSE` and `README` are allowed.
  - Anything else is rejected.
- **Manifest:**
  - Required: `moduleId` (2–64 of `[a-z0-9-]`), `displayName`, `semanticVersion`, `engineApiRange` (must include the engine's version, currently 0.3.0).
  - Optional: `requiredCapabilities` (from `CAPABILITIES`), `contentHashes {path: sha256}` (if present, it must cover every file), `extends {moduleId, range}`, `licensing`.
- **Expansions** (`extends`) add cards and decks to a base module passed as `opts.base`. They can't contain rules or scripts.
- **ZIP safety:**
  - No traversal, absolute or backslash paths, symlinks, encrypted entries, or methods other than stored/deflate.
  - CRC checked. Output can't exceed the declared size.
  - Compression ratio ≤ 100 for files over 1 MB.
  - At most 8 MB per file, 64 MB total and 2000 entries.
- **JSON** is parsed strictly: duplicate keys and `__proto__`, `constructor` and `prototype` keys are rejected, and nesting is capped at 256 levels.
- **Errors** read `file:line:col: message`.
- **Art** (bundled modules and packages): `assets/cards/<card id>.<ext>` is a card's picture-window art, `assets/full/<card id>` a finished full-card image (replaces the template; live state still shows), `assets/back` the card back, `assets/packs/<booster id>` and `assets/decks/<deck id>` store art. A card's `art` field or a shop item's `art` can name any asset path instead. `tools/art/import.py <module> <files>` matches images to cards (collector number, id or name) and converts them to WebP.
- **Presentation** (optional manifest fields, no effect on rules): `tagline`, `official` (listed first, with a badge), `theme {accent, accent2, glyph, hideStats, hideVars, hideKeywords, labels, tapVar}` and `presentation {templates, byType}`. `hideVars` keeps bookkeeping vars off card badges and player chips, `labels` renames vars, card types and keywords for display (`{"dmg": "wounds", "oldone": "Old One"}`), `hideKeywords` keeps rules-only keywords off the type line, and `tapVar` turns a card sideways while that object var is above 0 (exhausted, tapped).
  - **Card templates.** The built-in families, generic layouts based on common TCG card anatomy:
    - `classic`: cost top-right, stat box bottom-right
    - `skirmisher`: attack and health in the bottom corners
    - `monster`: level stars and an ATK/DEF line
    - `vital`: HP top-right
    - `leader`: no cost, life shield
    - `spell`: no stats, large text
    - `resource`: full-bleed art
    - `location`: landscape
    - `token`
  - A module may define its own: `templates {name: {base, layout?, cost?: tl|tr|none, stats?: [{field, pos: tl|tr|bl|br|line, icon?, label?}], level?, text?, label?}}`.
  - Choosing a template: `card.template`, then `byType[type]`, then a template inferred from the card's fields. So a game can mix several formats, and every game can look different.
  - Cards may also carry `tags: [...]`, which deckbuilder search uses alongside keywords.
- **Saves:** a save stores `rulesHash`, a hash of the rules and cards, and `restore` refuses a mismatch.
- **CLI:**
  - `npm run -s validate <dir|zip> [--base <dir|zip>]`
  - `npm run -s pack <dir> [out.zip]` writes `contentHashes` and re-validates the archive.

## Engine order
1. Run the effect frames.
2. If anything changed, run the state checks.
3. Check for the end of the game.
4. Handle triggers:
   - Rule triggers come first.
   - Then card triggers, active player first (APNAP). If one player has two or more different triggers, that player picks the order (an `order` decision).
   - Under stack/chain timing, card triggers go on the stack.
5. Resolve the chain.
6. Run the phase machine and give out priority.

Settling stops on a pending decision, on priority, or at the end of the game. It is budget-limited.

## Replacement pipeline
1. A primitive proposes an event.
2. Every applicable replacement applies once, sorted by `order` and then by source timestamp (the numeric part of the object id).
3. `modify` rewrites fields and the loop continues. `instead` runs its effects in place of the event, and the same replacement never applies again within that lineage.
4. The event commits.

## Continuous effects
- Base values come from object vars or the card definition.
- Then each layer applies in order. Within a layer:
  - Statics apply in timestamp order, except that an effect that *depends on* another goes after it. "Depends on" means applying the other effect changes what this one affects or what it does.
  - Dependency cycles fall back to timestamp order.
- Conditions are evaluated inside their own layer. A "power ≥ 3" check made in layer `add` doesn't see later `counters` bonuses.
- `inc`/`set` on a stat changes its **base** value.
