# Status

## Done: M1, rules kernel
- Deterministic state, events, sfc32 RNG, command log, replay, event hash, serialize/restore.
- S-expression DSL (expressions and effects), resumable effect frames, decisions (`choose`).
- Triggers: rule triggers, card triggers, `enter`, last-known-info `leave`/`destroyed`, APNAP.
- State checks, phase machine, turn limit.
- Legal action templates with target slots, and `proposeAction` explanation trees.
- Per-field event masks for hidden info, and `observe()` views.
- Static module validator and deck legality.
- **Spark Duel**: 19 original cards, 2 decks. Covers immediate timing, energy growth, guard, haste, enter/death triggers, opponent decisions.
- Random agent, `playMatch`, sim CLI.
- 13 tests covering validation, flow, explanations, interactions, replay, restore, hidden info and invariants.

Known: random-vs-random, Ember Rush beats Stone Ward about 95% of the time. Mirror matches are about 55/45 in favour of the first player. Revisit balance once there is a heuristic AI (M6).

## Done: M2, timing and effects
- Timing protocols, set globally or per phase:
  - immediate
  - priority stack (retain, pass sequence, LIFO, priority returns to the active player)
  - chain (responses pass priority on, speed ladder, back-to-back resolution, triggers form a new chain)
- Targets are rechecked on resolution and fizzle if gone. `counter` with `countered` effects.
- Replacement and prevention pipeline (`instead` / `modify`, applied once each, in module order then timestamp).
- Continuous effects: computed `stats` and keywords by layer, with timestamps and dependency ordering (cycles fall back to timestamp). Temporary `modify ... until turn`.
- Relationships (`link`), with aura-style attachments.
- Controller orders simultaneous triggers (`order` decision). Costs are atomic (`choose required`).
- Views include the stack and computed stats/keywords.
- **Arcane Duel**: 21 cards, 2 decks. Covers stack, fast spells, counter, fizzle, ward replacement, damage reduction, anthem and threshold statics, set/add/counters layers, aura, activated abilities, charge alt-win.
- 26 tests. Replay, restore, hidden-info and invariant suites run on both games.

Balance (random-vs-random):
- Arcane Duel: Storm Circle wins about 60–65% (about 55% when it goes second). 59% of wins come from charge.
- Spark Duel: Ember Rush beats Stone Ward about 95% of the time. Revisit both with a heuristic AI (M6).

Known simplifications:
- Triggered abilities choose targets when they resolve, not when they go on the stack.
- An activated ability doesn't resolve if its source has left play.
- Replacement order is module order plus timestamp, not the affected player's choice.
- An `instead` lineage is exempt from that same replacement.

## Done: M3, module SDK
- `packages/module-sdk`: a browser-safe ZIP reader and writer with hostile-archive defences, a strict JSON parser with positions, and a package loader. The loader checks layout, engine range, capabilities, sha256 content hashes and assets, and supports expansions.
- Validator issues are JSON pointers, mapped to `file:line:col`. It also checks structure (field types).
- Scripts: data-only functions and procedures with gas and depth limits (no JS eval). Extra expression ops for scripting.
- Saves are pinned to a hash of the rules and cards.
- CLI: `validate`, `pack`.
- 33 tests. The new ones cover hostile ZIPs, package rules, line:col errors, scripts, expansions and save pinning.

Deferred: save migrations (`saveMigrationVersion`); the affected player choosing replacement order.

## Done: M4, compatibility
- New generic primitives:
  - `commit` (simultaneous secret choices, deferred reveal), secret `choose`
  - face-down objects (`move faceDown`, `flip`)
  - action `check` and expression slot min/max
  - deck sections (`format.zones`), per-card `maxCopies`, `sharedDecks` with ownership transfer, game vars
  - `alternate` timing with `first`, `random`, `$phase`, `at`/`keys`/`values`/`same`
- Hidden-info masking now covers object ids in damage, destroyed, modified and action-target events, and stack sources in views.
- Four new reference games:
  - **Tri-Lane** (lanes, adjacency, secret deploys, alternating maneuvers, lane scoring)
  - **Relic Chain** (chain timing, face-down traps, positions, extra deck fusion)
  - **Tidewardens** (resource deck, life cards with surge, evolution stacks, pitch)
  - **Ember Council** (3–4 players, shared market, die, council with initiative, weighted secret votes, elimination, renown)
- Regression suite:
  - replay, restore, hidden-info (N players, face-down) and termination run on all 6 games
  - golden event hashes (`npm run -s golden` after an intended change)
  - one interaction test per game
  - 54 tests in total
- Dev tool: `npm run -s events <game> <type-prefix...>` counts events over 50 random games.

Balance under random play:
- Tri-Lane is about 50/50.
- Relic Chain: Blaze wins 73% as first player and 48% as second.
- Tidewardens: Kelp Bastion wins about 70%.
- Ember Council is about one third per seat.

## Done: M5, browser UI
- `apps/web`: Vite with vanilla TS (no framework).
  - `modules.ts`: the bundled reference games, plus `.zip` modules loaded at runtime through the SDK.
  - `main.ts`: the controller, with seats (human/AI), the AI loop, selection, save/load (localStorage) and the hot-seat cover.
  - `render.ts`: renders only from `observe` / `eventsFor` / `listActions`, so it cannot leak hidden information.
- Features:
  - player panels built from zone metadata, with shared zones and a stack panel
  - cards showing cost, stats, keywords and non-default vars; face-down backs; an inspector
  - legal sources (▶), targets (◎) and picks (✓); a multi-action menu
  - target and decision prompts, including secret commits, trigger order and string options
  - "why not?" explanation trees when an unusable card is clicked
  - a readable log, game-over banner, Fast AI and a dark/light/auto theme
  - a responsive layout (single column under 960px, no horizontal scroll at 390px) with 40px touch targets
- `npm run -s e2e` (Playwright smoke test) checks:
  - all 6 games play AI-vs-AI through the UI
  - a human turn by clicks, the explanation note, save/load and the hot-seat cover
  - phone width
- Commands: `npm run dev`, `npm run -s build`.

Not done yet: card art (the module `art` field is validated but not rendered), animations from the event log, and undo.

## Next: M6, AI
- Heuristic agent: module-provided weights in `ai/*.json`, for example `value(card)`, `threat` and `target preference` expressions, with a generic fallback (maximise own resources, minimise the opponent's).
- Limited lookahead or rollout over `listActions`, using determinized views. Opponents' hidden cards are sampled from what is publicly unknown, never read from state.
- Time budgets, scripted policy hooks for campaigns, and headless tournaments (`npm run -s tourney`) to rebalance the reference decks.

## Planned reference games (each one exercises mechanics the others lack)
| Game | Milestone | Unique stressors |
|---|---|---|
| Spark Duel | M1 ✓ | baseline: immediate timing, single deck, numeric life, auto resource growth |
| Arcane Duel | M2 ✓ | priority stack, replacement/prevention, layers/timestamps, attachments, counters, alt win |
| Tri-Lane | M4 ✓ | 3 lanes with spatial adjacency and movement; simultaneous sealed commitments plus reveal; lane-control scoring victory |
| Relic Chain | M4 ✓ | chain timing with reverse resolution; face-down set cards (traps); battle positions; extra deck with fusion recipes from multiple cards |
| Tidewardens | M4 ✓ | separate resource deck; life as a hidden ordered card zone with reveal triggers; evolution stacks (cards under cards); pitch cards (resource or effect) |
| Ember Council | M4 ✓ | 3–4 players; voting/politics; directed elimination; shared market row (draft); alternating actions with initiative; dice as objects with faces; quest-score victory |

## Later
- M6: AI.
- M7: campaigns.
- M8: hardening.
