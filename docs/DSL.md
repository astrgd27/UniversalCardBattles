# Rules DSL (engine API 0.3)

A module is a folder or ZIP package (see **Packages** below). All logic is JSON S-expressions: `["op", arg, ...]`. The reference module is `packages/reference-games/spark-duel`.

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
| `at x key`, `keys x`, `values x`, `same a b` | map and list access; `same` is deep equality (`=` compares single values) |
| `linked target rel` | objects whose relationship `rel` points at target |

## Effects
Effects run in effect lists `[[op...], [op...]]`.

| op | meaning |
|---|---|
| `draw p n` | moves the top deck card to hand. An empty deck emits `drawFail` |
| `move objs zone {player?, pos?: "top", as?: "$v", faceDown?: true}` | moves objects to a zone (owner's zone by default). `as` rebinds the new id(s). A face-down object's identity is known only to its controller (views show `card: ""`), its abilities don't work, and `get obj faceDown` reads the flag. Cards owned by `"shared"` become the taker's |
| `shuffle p zone` | seeded shuffle |
| `set refs name v`, `inc refs name d` | player or object vars. Emits `changed` |
| `damage targets n src?` | players lose `damage.player` (default `life`); objects gain `damage.object` (default `dmg`). Emits `damage` |
| `destroy objs` | moves to `graveZone`. Emits `moved` and `destroyed` (with last-known info) |
| `lose p`, `win p` | the game ends when one player or none remains (none = draw) |
| `if cond then else?`, `each list $v body`, `let $v expr` | control. Branch and loop bodies get a **copy** of ctx (block scope) |
| `choose {who?, from, min?, max?, as, prompt?}` | pauses for a player decision. It auto-resolves when there is no real choice. `max` 1 binds a single id, otherwise a list |
| `run obj field` | runs the card definition's effect list `field` with `$self` = obj and `$me` = its controller |
| `emit type {k: expr}`, `log msg`, `endPhase` | custom events, a log line, and ending the current phase |
| `counter items` | removes stack items and runs their action's `countered` effects |
| `modify objs {layer, mods, until?: "turn"}` | a temporary continuous effect. Values are fixed when it's created, and it applies only to those object ids |
| `link objs rel target`, `unlink objs rel` | relationships (attachments and so on). A zone change clears them |
| `call proc args...` | runs a script procedure (`rules.procedures`) |
| `commit {who?, from, min?, max?, as, prompt?, reveal?}` | simultaneous secret choice. Each player in `who` (default: all living players) picks from `from`, evaluated with `$p` set to them. Picks are masked from everyone else, then bound as `{playerId: pick}`. A public `revealed` event follows unless `reveal: false`, which keeps the picks secret for a later commit. Note: it binds `$p` |
| `random {min?, max, as}` / `random {from, n?, as}` | seeded integer, or a random pick (a list when `n` is given). Emits `random`; picks of hidden objects are masked |
| `flip objs up?` | turns face up (default) or face down. Emits `flipped` (with `card` when turned face up) |

`choose` also takes `secret: true` (masks the pick from others) and `required: true`: if fewer options than `min` exist (typically during a cost), the whole action is rejected and nothing changes.

`draw`, `move`, `destroy`, `damage` and `lose` are **proposed events** that pass through the replacement pipeline.

## rules.json
- `players {min,max}`, `playerVars`, `objectVars` (reset on every zone change).
- `zones[] {id, vis: public|owner|hidden, shared?, ordered?, abilities?}`. Card abilities function in zones with `abilities: true` unless the ability lists `zones`.
- `deckZone`, `handZone`, `graveZone`, `format {deckMin, deckMax, maxCopies, zones?}`, `damage?`, `turnLimit?`.
  - `format.zones [{zone, min, max, types?}]` declares deck sections. A deck is then `{zone: [ids]}`; a plain list is always the main deck.
  - A card may override the copy limit with `maxCopies`.
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
  - `pass` is built in and reserved.
- `triggers[] {on: eventType, if?, do}`: rule triggers, controlled by the active player. They always resolve immediately and before card triggers.
- `timing {mode: immediate|stack|chain, retain?, minResponse?=2}`, also overridable per phase. Each mode works as follows (a code sketch follows this list):
  - **immediate**: actions resolve at once, and only the active player acts.
  - **stack**: costs are paid, then the action goes on the stack. The caster keeps priority (`retain` defaults to true). When all players pass in a row, the top item resolves and the active player gets priority again. All players passing on an empty stack ends the phase. Auto phases advance once the stack is empty.
  - **alternate**: every player may act; after each action (always resolved at once) priority moves to the next player. All passing in a row ends the phase. `first` (an expression) picks who starts, e.g. an initiative holder.
  - **chain**: priority goes to the next player after each action (`retain` defaults to false). A response needs speed ≥ max(minResponse, the top item's speed). When all pass, the whole chain resolves back to back, and triggers raised meanwhile form a new chain.
- Actions: `speed` (default 1) works like this:
  - With an empty stack, speed below `minResponse` is only allowed for the active player.
  - With a non-empty stack, it needs speed ≥ `minResponse`.
  - `stack: false` resolves at once.
  - `countered` effects run when the item is countered or fizzles.
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
- Ability options: `stack` (default true for cards; under stack/chain timing the trigger uses the stack), `speed`, `text` (used in labels).
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

## Packages (module SDK)
- **Layout:**
  - Required: `manifest.json`, plus `rules.json` (unless the package is an expansion).
  - Cards: `cards.json` and/or `cards/*.json` (arrays).
  - Decks: `decks.json` and/or `decks/*.json` (objects).
  - Optional: `scripts/*.json`, `assets/*` (png, jpg, webp, gif, mp3, ogg, wav, woff2, txt, json; 4 MB each).
  - Reserved for later: `ai/`, `campaign/`, `tests/`. `LICENSE` and `README` are allowed.
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
