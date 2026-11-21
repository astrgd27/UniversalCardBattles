# Spec (condensed from the "Universal TCG Simulator" design guide, rev 3)

## Mission
- A local-first browser app on top of a headless, deterministic TypeScript rules engine.
- Rules are fully enforced: the engine generates legal actions and structured decisions.
- Nothing is hardcoded: turn order, zones, combat, resources, life, victory and card layout all come from the module.
- Modules are versioned ZIPs: manifest, rules, cards, decks, art, ai, campaign, tests, license.
- Hidden information is preserved, and players and AI get filtered projections.
- Humans, AI, tests, scripted encounters and future multiplayer all use the same match API.
- Rules correctness comes before graphics. Never patch the core for one card.
- Campaign, economy and collection live outside match rules and enter only through validated match config.

## Definition of done (per feature)
- A schema and example exist, with valid and invalid cases tested.
- At least one unit test, one interaction test and one replay test pass.
- Legal actions and decisions are generated without the UI.
- Nothing hidden leaks through errors, logs, action payloads or AI search.
- The feature works in a reference module with no engine branch.
- A rejected action can be explained.

## Engine API
- `createMatch(module, format, decks, scenario, seed)`
- `observe(match, player)`
- `listActionTemplates`
- `proposeAction`
- `commitAction`
- `submitDecision`
- `advanceAutomatic(budget)`
- `serialize/restore`
- `replay(initial, cmdLog)`
- `explainLegality`

## State and identity
- GameState: participants, objects, zones, relationships, counters, continuous/delayed effects, timing, pending decisions, rng, event sequence, result.
- Card definition, instance and game-object identities are all distinct. A zone change creates a new object id.
- Track owner and controller.
- Relationships cover attachments, stacks under a card, and spatial occupancy.

## Rules IR
- The JSON DSL is typed and checked statically.
- Scripts must be sandboxed, deterministic and gas-limited, and see immutable views.

## Action lifecycle
announce → mode → targets → costs → pay (atomic) → response window → resolve → state checks.

## Effect pipeline
propose event → replacement/prevention (module order) → commit → triggers (using last-known info) → state checks → order triggers → advance timing.

Continuous effects need layers, timestamps and dependency ordering (module-defined ordering), plus cycle detection.

## Timing protocols
- priority stack
- chain (reverse resolution)
- immediate
- alternating actions (initiative)
- simultaneous sealed commitments
- hybrid

## Hidden information
- Information can be public, private, revealed, face-down, remembered or forgotten.
- A seeded RNG keeps a draw ledger.
- Never leak deck order via ids.

## Cross-game lessons
- Decks can be multiple, and life can be a zone (shields, prizes, clock).
- Cards can be resources, damage, points or checks.
- Victory takes many forms.
- Spatial grids, lanes and adjacency must be supported.
- Multiplayer needs politics, voting, teams and directed elimination.
- Dice, counters, rotation and external state must be representable.

## Campaigns (M7)
- Entities: Profile, Campaign (chapters/nodes), Encounter, Dialogue, Quest, Shop, Booster (weighted slots, guarantees), Tournament, Cutscene, WorldEvent.
- Hooks: onCampaignStart, onChapterEnter, onNodeEnter, onEncounterPrepare, onMatchBegin, onTurnStart, onPhaseEnter, onActionCommitted, onEventResolved, onStateThreshold, onDecisionRequested, onMatchEnd, onEncounterComplete, onQuestProgress, onShopPurchase, onPackOpened, onRewardCommitted.
- Scripts never mutate state directly. They use validated scenario effects.
- Rewards go through an idempotent ledger (encounterId + profileId + seq).
- Scripted AI falls back to a legal choice.

## AI
AI works on views and legal actions only. Strategies: random, heuristic, lookahead, rollout, module heuristic, scripted.

## UI (M5)
- Dark/light responsive design, CSS/Canvas, 2D only, and animations driven by the event log.
- Touch and iPad support, inspector, action log, legal highlights, accessibility.

## Security
- ZIP import rejects traversal paths, zip bombs and oversized assets.
- Scripts are sandboxed.
- Manifest provenance, licensing and hashes are required.

## Acceptance
- Rules, correctness, security (no leaks) and determinism.
- Modules, campaigns (survive reload, no duplicate rewards) and AI (headless tournaments finish).
- UI, and performance at 100+ objects.

## Milestones
- M1: kernel, tiny game, replay
- M2: stack/chain/immediate adapters, replacement and continuous effects
- M3: DSL/IR, sandbox, validator, loader
- M4: six divergent reference modules plus a regression suite
- M5: browser UI
- M6: AI
- M7: campaign
- M8: hardening
