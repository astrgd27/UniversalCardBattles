# Status

## Direction (2026-11): a product for making TCGs
- **The Workshop (Game Maker) is the main product.** Its design philosophy has three depths:
  - **Basic:** mix and match elements, make simple cards, get a working TCG quickly.
  - **Advanced:** sub-menus with detailed options.
  - **Script:** rules and logic in the engine DSL.
- **Play mode:** a robust client for any module, with AI battles, a shop (boosters and decks), scenarios and campaigns, and multiplayer later. The battle screen is being rebuilt for ease of use: attack arrows, battle readouts, opponent moves shown step by step, an optional log, and animations for every card interaction.
- **Benchmark:** five default modules, each a mechanics-faithful clone with an original theme. Basic and Advanced should reach ~80% of each source, and scripting ~95%.

  | Module | Mechanics source | Theme |
  |---|---|---|
  | Crystal Circuit | Magic: The Gathering | sci-fi bionic warriors, five crystal energies |
  | Taste Dimension | Yu-Gi-Oh! | rival chefs summoning monstrous dishes |
  | Generation Wars | Riftbound | satire: five generations fight over cultural battlefields |
  | Ringworld Rumble | One Piece | isekai pro wrestling |
  | Looboo | Pokémon TCG | cute alien creatures; nutrients as resources |

- **Order:**
  1. Clean slate (done).
  2. Battle-screen rebuild.
  3. The games one at a time: Generation Wars (playable) → Ringworld Rumble → Looboo → Crystal Circuit → Taste Dimension.
  4. Shop, campaign and multiplayer polish.
- **Battle screen, part 1 (done):** a battle director (`apps/web/src/ui/director.ts`) turns the viewer's events into beats that play one at a time:
  - a caption for every opponent move;
  - a spotlight on the card being played;
  - an attack arrow with the attacker lunging and the target shaking;
  - block callouts, and a battle readout (both cards, damage taken, DESTROYED stamps);
  - damage, life-card and prize callouts.

  The AI waits for its beats to finish before moving again (Fast AI shortens them). Also new: a phase strip in the HUD, players named "You" and "Opponent", a glow when counters or stats change, and the playtest Workshop button moved bottom-left.

- **Battle screen, part 2 (done):**
  - a log docked beside the table: plain language by default, with a Details switch for every engine event, remembered between games;
  - hover zoom on desktop (a large live card beside the pointer);
  - arrows from the card being used to each target while choosing;
  - the pass button says what it does ("Next: Combat ▸", "End turn ▸", "No response", "Continue");
  - draw (fly in from the deck) and play (drop onto the board) animations.

  Phone layout is out of scope (tablet and desktop only). Also done: the board fits one viewport on tablet and desktop (card sizes follow the viewport height, the opponent's hand is a compact fan of backs, your hand fans and lifts on hover). Next for the battle screen, as the clones need them: "how to play this card" hints; per-card action menus with costs shown; showdown/chain panels for stack games.
- **Generation Wars (first clone, playable; mechanics reference: Riftbound):** `packages/modules/generation-wars`.
  - The source of truth is the Workshop blueprint (`blueprint.json`); `npm run -s modules` compiles it into the module files. A test fails if they are stale. "Edit in the Workshop" on the game menu (and "Remix" in the blueprint picker) opens a copy.
  - Content:
    - 78 cards: 5 generations (domains) × 12, 5 legends, 5 runes, 6 battlefields, 2 tokens;
    - 5 decks (40 main + champion + 6/6 runes + 3 battlefields).
  - Rules:
    - runes: 2 per turn, 3 on the second player's first turn; energy from the pool, power by recycling;
    - legend in play, chosen champion zone, partial mulligan (up to 2);
    - two battlefields, group moves, showdown window, fights (Tank, Assault, Shield, recall on a tie, heal);
    - conquer/hold scoring, the final-point rule, 8 points to win.
  - Keywords: Accelerate, Ganking, Temporary, Deathknell, Legion, Vision. All are Workshop options (see `docs/MAKER.md`, Conquest battlefields).
  - Balance: heuristic vs heuristic, 10–12 games per pairing, is about 30–70 after one tuning pass. Middle Management is still the strongest and Extremely Online the weakest.
  - Not yet emulated:
    - Hidden (facedown cards at a battlefield), Deflect;
    - Reaction-speed chains inside showdowns (the showdown is an alternating response window);
    - choosing battlefields and damage assignment by hand (both are automatic);
    - burn-out on an empty deck (decking out loses).
  - Next: more cards per generation, a Hidden/Deflect pass, then Ringworld Rumble.
- **Clean slate (done):**
  - Every module and its artwork was deleted (NIGHTFALL, Shadow Earth and the Workshop starter games; git history keeps them).
  - The eight small reference games survive only as engine test fixtures in `packages/test-harness/fixtures`.
  - The app ships no modules until the five clones land in `packages/modules`.


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

## Done: mechanics coverage pass
- `docs/COVERAGE.md` maps all 50 corpus stressors to engine capabilities: ✓ demonstrated, ◐ expressible, ✚ gap closed now.
- New primitives:
  - 2D grid geometry (`rules.grid`, `cell`/`cx`/`cy`/`cellOf`/`dist`/`near`)
  - `gotoPhase` (a shared meter ending the turn)
  - external inputs (`rules.external`, `setExternal`, `ext`; logged and replayable)
- Asymmetric roles and nested encounters are expressed with existing primitives: role vars with role-gated actions and wins, and a run through barriers using `each` + `flip` + game-var flags.
- **Vault Breach** (a test game) exercises all of these. 77 tests.
- **Test games are disposable.** The reference games exist to prove mechanics, not to be balanced or kept, so don't spend effort tuning them.

## Done: polish (art and animation)
- **Card art:** procedural SVG illustrations, original and deterministic per card id (landscape, rings or shards, plus a type glyph).
- **Custom art:** players can upload their own image per card in the gallery. It is stored in IndexedDB, only in that browser (PNG/JPEG/WebP/GIF, 3 MB max), with a reset option.
- **Art priority:** custom art, then package asset, then procedural.
- **Animations** come from the viewer's redacted event log since the last render:
  - cards entering, hit shakes with floating damage, flip reveals
  - pulsing player stats, pile bumps, a turn banner
  - `prefers-reduced-motion` turns them off
- **Grid UI:** modules with `rules.grid` render a board. Objects sit in their cells, target cells glow and are clickable, and the top bar has controls for external inputs.
- e2e covers grid deploys, entry animations, the external toggle and custom art upload and reset. The campaign e2e no longer assumes a lost fight.

## Done: deckbuilder upgrade and card formats
- **Deck rules confirmed:** the builder and match setup both use the engine's `deckErrors` with each game's `rules.format` (size, copies, per-card `maxCopies`, section card types, token-only cards). Campaign decks also check ownership. Tests cover every game.
- **Builder:**
  - search language: `t:` `k:` `tag:` `n:` `x:` `is:token`, numeric comparisons, phrases, negation (`apps/web/src/search.ts`)
  - facet chips from each game's own types, keywords, tags and costs; sort by cost, name or type
  - copy counters (n/max, owned in campaigns), a cost curve, a type breakdown and average cost
  - text export (clipboard) and import (checked against the rules), duplicate, sample opening hand
  - the game's format rules spelled out
- **Card formats:** `apps/web/src/templates.ts` with nine built-in families.
  - Modules choose per type or per card and can define their own (validated; `TEMPLATE_BASES` in the engine).
  - The reference games mix several formats: Relic has ranked monsters plus a Fusion template, Ember Council has its own Coin and Ally templates, Vault Breach has landscape locations and a Barrier template.
- 82 tests; e2e covers chips, queries, export/import, sample hand and template labels.

## Done: the big rules-structure gaps (engine API 0.3.1, backward compatible)
A survey of about 30 published TCG rulebooks (`docs/COVERAGE.md`, second table) found five structures that most of them need. All five are now generic engine primitives, documented in `docs/DSL.md`:
- **Timing windows** (`rules.windows`, `openWindow`, `winSet`, `closeWindow`, `$win`): combat steps, showdowns and counter/guard windows opened mid-turn. The turn's effects, stack and priority are saved, the window's steps run with their own timing and actions, then the opening effect resumes. Saves, replays and determinized AI worlds include open windows.
- **Slotted zones** (zone `slots`, `move {slot}`, `setSlot`, `freeSlots`, `inSlot`, `adjacent`): named positions with type/kind limits, capacity, rows (tags) and adjacency. The table draws slots, and open slots are clickable targets.
- **Typed resources** (`rules.resources`, `pay`, `gain`, `empty`, `canPay`, `pool`, `meets`, `tally`): map costs with a generic part, thresholds that aren't paid, and pools that expire at the end of the phase or turn. Cards print typed costs as pips; search, facets and the curve use cost totals.
- **Deck rules** (`format.rules`, `copiesBy`, section `maxCopies`, `def`/`distinct`): colour/aspect identity, group limits, copies counted by name across printings.
- **Usage limits** (action and ability `limit`, `uses`): per turn, phase or game, by player, object, physical card, card id or name, with shared groups. Rejections explain themselves (code `limit`).
- New test game **Bastion Clash** (disposable, no balance work) uses all five: a combat window with a defender's guard step, front/back rows with support from behind, gear slots, sun/moon aether from wells, aspect deck rules and once-per-turn limits.
- Second tier, also generic and in Bastion Clash:
  - **Activated abilities printed on cards** (action `activated`): one `name#i` action per ability, so commands, replays, AI and UI need nothing new.
  - **Engine-wide targeting rules** (`rules.targeting.deny`), checked when options are offered and again at resolution.
  - **Gain control** (`control`): same object id, the new controller's side, a free slot.
  - **Teams** (`rules.teams`, `allies`/`enemies`, `get p seat`): Bastion Clash plays 2–4 as 2v2.
- Third tier (every gap from the survey is now closed):
  - **Identity** (`become`, identity statics, `src/engine/identity.ts`): copies and "loses all abilities" are read wherever a card definition is: triggers, replacements, statics, keywords, stats and activated abilities.
  - **Divide decisions** (`divide`): split damage among recipients; the AIs propose all-on-one and random spreads, and the table has tap-to-assign with Undo.
  - **Timing**: `optional` triggers, `last` triggers that can miss their timing, and `$last` for "right after X" responses.
  - **Grid layers** (`grid.layers`, `layer`).
- 96 tests (14 in `gaps.test.ts`, including an inline lab module); golden hashes for the 7 earlier games are unchanged.

## Done: better saving
- **IndexedDB** (`apps/web/src/storage.ts`): a synchronous in-memory cache in front of IndexedDB, with writes applied in order in the background. There is no ~5 MB localStorage ceiling, and older localStorage saves move over automatically on first load. If IndexedDB is unavailable it falls back to localStorage, then to memory, and the library footer says which one is in use, the space used, and whether the browser has granted persistent storage.
- **Save slots**: `ucb-slot:<game>:<slot>`. Up to 20 manual saves per game plus an **autosave**, written at most about once a second during a match, on quit and on page hide, and cleared when the match ends. Continue resumes the newest save; Load game lists them all with Load and Delete. Old single saves become slots.
- **Sync file** (Chrome/Edge, File System Access API): link a file in a Dropbox, OneDrive, iCloud or Google Drive folder and every change is written to it (debounced). On a new device, link the same file and choose to load its saves. Permission is re-requested with a "Reconnect" button after a restart. Other browsers keep export/import.
- Backups include slots; e2e covers slots, autosave, IndexedDB and survival across reloads.

## Done: scripted tutorials (reusable by any module)
- **Campaign `tutorials`:** a set-piece scenario, coached steps that each expect one move, pass or decision (or pause for reading), and a scripted opponent. See DSL.md. The runtime is `packages/campaign/src/tutorial.ts`: `allowedTemplates`, `allowedOptions`, `isExpected`, `readShowing`, `tutorialAgent`, `finishTutorial`.
- **App:** a Tutorials menu per module, a coach panel above the dock, only the expected move playable, a completion screen with the reward and "Keep playing".
- **NIGHTFALL:** Basics plus one tutorial per faction, 10 Marks each on first completion. `tests/tutorials.test.ts` plays each one through and checks its outcome.

## Done: Game Maker v2 (mix-and-match building blocks)
- **Blocks:** board areas, counters, keywords with numbers and their own ability bundles, target filters, activation cost blocks, new keyword rules, combat options (direct, questing, multiple blockers, attack cards), resource options (face-down/keyword-only, pitch, level and energy requirements, action points), phase options (both players, draw up to, alternating actions), life-card triggers and leader deploy.
- **Mechanics Shelf:** 40 recipes that drop whole mechanics into any game (`packages/maker/src/recipes.ts`).
- **Workshop extras:** undo/redo, the auto rulebook, CSV import/export, AI Lab per-card stats.
- **Tests:** every recipe on a blank game; mixed combinations for replay and hidden information; block compilation.

## Done: Game Maker (design a card game in the app)
- **Package:** `packages/maker`. A blueprint format (`#maker`) compiles to an engine module; `lint`/`build` report "bugs" and "tips" in plain language. See `docs/MAKER.md`.
- **Starter blueprints:** seven original, playable games covering the main families of TCG structure:
  - lands, colored mana, the stack and blocking;
  - a rune deck, battlefields and points;
  - active and bench, attached energy, evolution and prizes;
  - tributes, positions, traps, chains and a fusion deck;
  - a leader with life cards, a resource deck, boosts and counters;
  - any card as energy, an awakening leader and counters;
  - a blank canvas.
- **Web Workshop:**
  - 12 build stations with quests, XP and ranks; Gizmo the guide; a Checks panel; live card previews;
  - frame designer; types, stats and roles; board renaming; turn phase blocks with timing;
  - resource, combat and win system cards; keywords mapped to built-in rules;
  - card editor with When/If/Do ability blocks, attacks, evolution, materials and attachment bonuses;
  - deck editor with auto-fill; playtest versus the AI or a friend; AI Lab balance runs;
  - publish to the library (kept across reloads); export as a .zip module or a .maker.json blueprint;
  - Script Lab: rules patch, triggers, functions, procedures and AI hints, plus per-card raw JSON.
- **Engine:** `choose` evaluates `min`/`max` expressions. Golden hashes refreshed.
- **Tests:**
  - `maker.test.ts`: every blueprint builds, plays to the end under the heuristic AI with its signature mechanics firing, replays identically, keeps hidden cards hidden and conserves cards; plus lint, text and the advanced patch;
  - e2e: every blueprint and station, the AI Lab, playtest and back, publish, phone width.

## Possible next steps
- NIGHTFALL: the remaining art; human playtests to confirm the AI-tuned numbers.
- Shadow Earth: card art prompts, a tutorial, human playtests of the 2.0 numbers.
- Game Maker: custom card art upload per card, more effect blocks (copy, gain control, transform), multiplayer blueprints, sharing blueprints online.
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
| Bastion Clash | gaps ✓ | timing windows (combat steps), slotted zones with rows/adjacency and gear slots, typed resources with thresholds, deck rules, usage limits |
| Ember Council | M4 ✓ | 3–4 players; voting/politics; directed elimination; shared market row (draft); alternating actions with initiative; dice as objects with faces; quest-score victory |

## Later
