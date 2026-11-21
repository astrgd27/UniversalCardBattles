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

## Done: M6, AI
- `determinize` (engine): possible worlds that depend only on the player's information. A test proves that changing hidden identities, own deck order or the RNG leaves them unchanged.
- `scoreFor`: terminal results, then the module's `ai/ai.json` `eval`, else a generic material count.
- Agents (`packages/ai`):
  - `heuristicAgent`: one-ply search over candidate commands and targets, averaged across possible worlds. Stacks are resolved assuming no responses, and hidden choices are guessed. The budget is a simulation count, so it is deterministic.
  - `randomAgent`
  - `scriptedAgent`: the script's move if legal, else a fallback, logged as a divergence.
  - `makeAgent`
- The UI has seats for Human, AI (heuristic) and Random AI. Harness and UI pass `AgentInfo` (`player`, `mod`, `sample`).
- `npm run -s tourney <game> -- --agents=heuristic,random --games=20 --decks=a,b` (seats rotate).
- Heuristic vs random: Spark 10/10, Arcane 9/10, Tri-Lane 18/20, Relic 8/10, Tidewardens 9/10, Council 6/9 with 3 players (par is a third).
- Rebalanced with heuristic mirrors (40 games per pairing, about ±8%):
  - Arcane: Arc Bolt deals 3, charge win at 10. Now 57/43.
  - Relic: Warhound attack 5, Colossus attack 5, Spark Lance deals 2. Blaze still wins about 62%.
  - Tidewardens: Kelp Guard 1/3, Coral Wall 0/2, no tide on turn 1. Now about 60/40, with no seat bias.
  - Spark Duel (about 55/45) and Tri-Lane (about 50/50) were already balanced; their random-play skew was an artifact of random play.
- 57 tests; e2e passes.

## Done: UI redesign (game-style launcher)
- Screens:
  - **Library**: themed tiles per module, plus loading `.zip` modules.
  - **Game home**: Continue, Play, Deckbuilder and Card gallery. Campaign and Shop appear when the module defines them.
  - **Setup**: player count, seat type (Human / AI / Random) and deck per seat, Fast AI.
  - **Table**: HUD, opponents above, shared zones and stack in the centre, your field and hand below, side piles, a floating action dock, a drawer (log, card details, pile contents), and pause and game-over overlays.
  - **Deckbuilder**: card pool with search and section filters, live legality from `deckErrors`, custom decks saved per module.
  - **Gallery** with an enlarged view.
- Manifest presentation fields: `tagline`, `theme {accent, accent2, glyph}`.
- Cards get procedural art (hue from the card id, type glyph); a `card.art` asset is used for zip modules.
- Dark by default with a light option. Esc pauses or cancels.
- Code: `apps/web/src/main.ts` (controller) and `ui/{kit,render,menus,table}.ts`. e2e covers all screens.

## Done: M7, campaigns
- Engine: `MatchOpts.scenario` (setup, vars, `once` triggers), the `create` effect (tokens), and `validateScenario`.
- `packages/campaign` (`#campaign`):
  - `newProfile`, `nodeState`, `startEncounter` (legality and ownership checks, marks the attempt), `encounterAgent` (phased boss AI)
  - `finishEncounter` (idempotent ledger), `openBooster` (seeded weighted slots), `buy` (stock, currency)
  - `validateCampaign`, also run by the package loader
- Spark Duel campaign, **The Ember Road**:
  - three encounters (training, raiders, boss)
  - the Clockwork Champion boss: 30 life, a Brass Bulwark token, a Signal Beacon objective whose loss loses the match, and an Overdrive at ≤15 life (dialogue, two Sentry tokens, AI phase 2)
  - an Ember Pack booster and a shop with singles
- UI:
  - Campaign and Shop on the game menu
  - map with nodes, encounter dialogue and a versus screen with deck choice, in-match dialogue banners
  - reward screen with card reveals, shop with pack opening
  - collection-limited campaign deckbuilder; campaign matches survive save/continue
- 63 tests (6 campaign tests); e2e plays a campaign encounter, buys a pack and checks the campaign decks.

Not done yet: IndexedDB storage (localStorage is used), profile export/import, tournaments and quests, campaigns for the other reference games.

## Done: M8, hardening
- **Performance**: `npm run -s bench` uses a 160-object board with 48 statics.
  - Statics now record which stats and keywords they read and write, so dependency checks run only when one writes what another reads.
  - Dependency checks use copy-on-write and are memoised per layer pass.
  - `observe`: 228 → 29 ms. A full attack round (3 commands): 1447 → 271 ms. A test enforces observe < 250 ms.
- **Fuzzing** (`tests/hardening.test.ts`): the JSON parser, module validator, ZIP reader and package loader, campaign validator, profile migration and backup reader may only succeed or fail with their own error types. It found and fixed three crashes: bad string escapes in JSON, and campaign validation on malformed data (now structural checks plus a safety net).
- **Saves**:
  - Profiles are versioned (`v`), and `migrateProfile` upgrades and checks them.
  - Browser **export/import of all saves** (campaign progress, custom decks, saved matches, theme) as one JSON backup, from the library screen.
  - Imports are strict: size cap, safe JSON, key whitelist, per-entry validation; bad entries are skipped and reported.
  - Saved matches still refuse to load into changed rules (rules hash).
- **Docs**: `docs/AUTHORING.md` (module author guide).
- 69 tests; e2e covers export, wipe, import and a malicious import.

Security notes:
- Module packages, backup files and saves are all treated as untrusted. Their limits are documented in `DSL.md` (Packages) and `apps/web/src/backup.ts`.
- A tampered saved-match state that passes the module/version/hash check can still fail when continued. It only affects the user's own browser data and surfaces as an error note.

## Possible next steps
- Campaigns for the other reference games.
- IndexedDB storage (localStorage today) and cloud sync of backups.
- Card art pipeline: an asset browser in the gallery, using art in reference games.
- Online multiplayer: the match API is already command-based and hidden-info safe.
- The affected player choosing replacement order; undo where rules allow; animations driven by the event log.

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
