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
- Arcane Duel: Storm Circle wins about 60–65% (about 45% when it goes second). 59% of wins come from charge.
- Spark Duel: Ember Rush beats Stone Ward about 95% of the time. Revisit both with a heuristic AI (M6).

Known simplifications:
- Triggered abilities choose targets when they resolve, not when they go on the stack.
- An activated ability doesn't resolve if its source has left play.
- Replacement order is module order plus timestamp, not the affected player's choice.
- An `instead` lineage is exempt from that same replacement.

## Next: M3, module SDK
- ZIP package loader: manifest validation, path-traversal, zip-bomb and size limits, content hashes, `engineApiRange` check.
- JSON schema for each file, and a validator CLI (`npm run validate <dir|zip>`) with line-precise errors.
- Sandboxed, gas-limited, deterministic custom scripts (an interpreter over immutable views that returns effect lists). Pin the runtime version for replay.
- Optional: the affected player chooses replacement order (resumable `@ev` frames).

## Planned reference games (each one exercises mechanics the others lack)
| Game | Milestone | Unique stressors |
|---|---|---|
| Spark Duel | M1 ✓ | baseline: immediate timing, single deck, numeric life, auto resource growth |
| Arcane Duel | M2 ✓ | priority stack, replacement/prevention, layers/timestamps, attachments, counters, alt win |
| Tri-Lane | M4 | 3 lanes with spatial adjacency and movement; simultaneous sealed commitments plus reveal; lane-control scoring victory |
| Relic Chain | M4 | chain timing with reverse resolution; face-down set cards (traps); battle positions; extra deck with fusion recipes from multiple cards |
| Tidewardens | M4 | separate resource deck; life as a hidden ordered card zone with reveal triggers; evolution stacks (cards under cards); pitch cards (resource or effect) |
| Ember Council | M4 | 3–4 players; voting/politics; directed elimination; shared market row (draft); alternating actions with initiative; dice as objects with faces; quest-score victory |

## Later
- M3: ZIP loader, manifest hashes, sandboxed gas-limited scripts, schema docs.
- M5: browser UI.
- M6: AI.
- M7: campaigns.
- M8: hardening.
