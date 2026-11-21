# Rules DSL (engine API 0.1)

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
| `get ref name` | player var, or object field. Special names: `id owner controller zone card`. Then object vars, then card definition fields (`cost`, `power`, `type`...), else 0 |
| `has obj kw` | the card's `keywords` include kw, or object var `kw:<kw>` is > 0 |
| `players` | living player ids |
| `opp p` | next living player after p |
| `cards p zone` | object ids in a zone (`p` = `"*"` means all players) |
| `top p zone n` | first n ids |
| `count l`, `first l`, `list a b...`, `concat l1 l2...`, `in x l` | lists |
| `filter l pred`, `any l pred`, `all l pred`, `sum l expr` | uses `$it` |
| `isPlayer x`, `isObj x` | type tests |

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
- `triggers[] {on: eventType, if?, do}`: rule triggers, controlled by the active player.
- `stateChecks`: an effect list re-run after every change until stable (state-based actions).

## Cards
- Fields: `{id, name, type, text?, keywords?, targets?, effects?, abilities?, ...any stat}`.
- Abilities: `{on, if?, do, zones?}`. `on` is an event type, or one of:
  - `enter`: this object arrived.
  - `leave`: left an ability zone (last-known info).
  - `destroyed`: last-known info.
- In leave and destroyed abilities, `$self` is the new object (for example in the grave), `$me` is the last controller, and `$e` carries the old id.

## Events
- Every event has `seq` and `type`. Types: `moved`, `changed`, `damage`, `destroyed`, `drawFail`, `shuffled`, `lost`, `phase`, `pass`, `action`, `chose`, `gameOver`, plus custom ones.
- `masks: [[viewers], [fields]]` removes fields for everyone else. Use `eventsFor(match, p)`.

## Engine order
1. Run the effect frames.
2. If anything changed, run the state checks.
3. Check for the end of the game.
4. Run queued triggers, active player first (APNAP).
5. Run the phase machine.

Settling stops on a pending decision, on priority, or at the end of the game. It is budget-limited.
