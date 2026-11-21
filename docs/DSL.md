# Rules DSL (engine API 0.2)

A module is a folder (a ZIP from M3 on) holding `manifest.json`, `rules.json`, `cards.json` and `decks.json`. All logic is JSON S-expressions: `["op", arg, ...]`. The reference module is `packages/reference-games/spark-duel`.

## Values and variables
- Strings that start with `$` are variables. Other strings are literals.
- Dotted paths read into objects, for example `"$e.newObj"`.
- Built-in variables:
  - `$me` is the acting or controlling player, and `$opp` is the next living player after `$me`.
  - `$self` is the source object.
  - `$e` is the triggering event.
  - `$it` is the current item inside `filter`/`any`/`all`/`sum`.
  - `$turn` and `$active`.
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
| `linked target rel` | objects whose relationship `rel` points at target |

## Effects
Effects run in effect lists `[[op...], [op...]]`.

| op | meaning |
|---|---|
| `draw p n` | moves the top deck card to hand. An empty deck emits `drawFail` |
| `move objs zone {player?, pos?: "top", as?: "$v"}` | moves objects to a zone (owner's zone by default). `as` rebinds the new id(s) |
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

`choose` also takes `required: true`: if fewer options than `min` exist (typically during a cost), the whole action is rejected and nothing changes.

`draw`, `move`, `destroy`, `damage` and `lose` are **proposed events** that pass through the replacement pipeline.

## rules.json
- `players {min,max}`, `playerVars`, `objectVars` (reset on every zone change).
- `zones[] {id, vis: public|owner|hidden, shared?, ordered?, abilities?}`. Card abilities function in zones with `abilities: true` unless the ability lists `zones`.
- `deckZone`, `handZone`, `graveZone`, `format {deckMin, deckMax, maxCopies}`, `damage?`, `turnLimit?`.
- `setup`: effects run once with `$me` = p0.
- `phases[] {id, auto?, do?}`: `do` runs on entry. Auto phases advance by themselves. Others give the active player priority until they `pass`. A turn ends after the last phase.
- `actions{name: {label, phases, source?, req[{if, why}], targets[slot], cardTargets?, cost, do}}`:
  - `source` lists the legal source objects (`$self`).
  - `req` failures become explanation children.
  - A slot is `{as, from, min=1, max=1, prompt}`. `cardTargets` adds the source card's `targets`.
  - `cost` and `do` run in one frame.
  - `pass` is built in and reserved.
- `triggers[] {on: eventType, if?, do}`: rule triggers, controlled by the active player. They always resolve immediately and before card triggers.
- `timing {mode: immediate|stack|chain, retain?, minResponse?=2}`, also overridable per phase. Each mode works as follows (a code sketch follows this list):
  - **immediate**: actions resolve at once, and only the active player acts.
  - **stack**: costs are paid, then the action goes on the stack. The caster keeps priority (`retain` defaults to true). When all players pass in a row, the top item resolves and the active player gets priority again. All players passing on an empty stack ends the phase. Auto phases advance once the stack is empty.
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
