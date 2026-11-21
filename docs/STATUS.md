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

## Next: M2, timing and effects
- Timing adapters, selected per phase in rules:
  - immediate (current behaviour)
  - priority stack (pass sequence, LIFO, responses)
  - chain (link legality, reverse resolution)
- Replacement and prevention pipeline (`proposed event → replacements in module order → commit`), with application identity so a replacement applies only once.
- Continuous effects: layers, timestamps, dependency order, recompute on change. Use a computed-characteristics view instead of mutating vars.
- Let the controller order simultaneous triggers (a decision).
- Costs that need choices (sacrifice, discard) with atomic rollback.
- Reference game **Arcane Duel**, which tests the stack:
  - instants and responses
  - shields as prevention, and "instead" replacements
  - +N/+N anthems against set-power layers
  - counters, aura attachments (a relationship graph)
  - an alternate win condition

## Planned reference games (each one exercises mechanics the others lack)
| Game | Milestone | Unique stressors |
|---|---|---|
| Spark Duel | M1 ✓ | baseline: immediate timing, single deck, numeric life, auto resource growth |
| Arcane Duel | M2 | priority stack, replacement/prevention, layers/timestamps, attachments, counters, alt win |
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
