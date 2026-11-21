# Mechanics coverage: the 50-game research corpus

The spec's corpus (`SPEC.md`) is a list of **engine stressors**, not games to recreate. Every entry here is matched to the generic engine capability that expresses it and to the **original** reference game that demonstrates it. No commercial card, rule text or art is reproduced.

Legend:
- ✓ demonstrated by an original reference game and its tests
- ◐ expressible with existing primitives, not yet demonstrated
- ✚ gap closed in this pass (new primitive plus Vault Breach)

| # | Stressor (from the spec) | Status | How |
|---|---|---|---|
| 01 | priority stack, layers/timestamps/dependency, replacement effects, object identity, alternate wins | ✓ | stack timing, `layers`, `replacements`, new object id per zone change: Arcane Duel |
| 02 | attachment graph, staged evolution, prize zone | ✓ | `link`, evolution stacks, life cards: Arcane Duel, Tidewardens |
| 03 | chain timing, extra deck, position and zone legality, face-down cards | ✓ | chain timing, `format.zones`, `faceDown`: Relic Chain |
| 04 | separate resource deck, life as a hidden zone, counter windows | ✓ | deck sections, hidden ordered life zone, fast speed: Tidewardens, Arcane Duel |
| 05 | alternative score, flexible resource conversion | ◐ | score vars (Tri-Lane); card-to-resource like `pitch` (Tidewardens) |
| 06 | shared spatial objectives, dual decks, hybrid reactions | ✓ | lanes (Tri-Lane), deck sections (Tidewardens), per-phase `timing` |
| 07 | cross-object links, shield and base structures | ✓ | `link` (Arcane aura), life cards (Tidewardens) |
| 08 | shared signed resource, layered evolution objects | ✚ | game var tug-of-war plus `gotoPhase` (Vault Breach alarm); evolution (Tidewardens) |
| 09 | dual arenas, alternating timing with initiative | ✓ | `alternate` timing with `first` (Ember Council, Tri-Lane) |
| 10 | multi-use cards, combat link timing | ✓ | `pitch` (Tidewardens), chain (Relic Chain) |
| 11 | leader transform, combat contribution | ◐ | `flip`, evolution-style replacement on the board |
| 12 | versioned combat and counter semantics | ◐ | module-defined actions and speeds |
| 13 | several hidden ordered resource zones, reveal/cancel | ◐ | ordered hidden zones, `move` to a public zone to reveal, `replacements` to cancel |
| 14 | special deck, board role transitions, trigger checks | ✓ | deck sections; top-of-deck checks via `top` and `move` |
| 15 | two-row deployment, action points | ◐ | two field zones, a player var budget |
| 16 | dynamic play difficulty, card-as-check resource | ◐ | `top`, `random`, `check` requirements |
| 17 | champion level progression, separate zones | ◐ | vars plus evolution |
| 18 | no conventional deckbuilding, per-turn house constraint | ◐ | module decks only; a `choose` each turn plus `req` |
| 19 | two-track spatial race, reserve timing | ◐ | lanes and score vars (Tri-Lane), a reserve zone |
| 20 | 2D spatial geometry, terrain, range, dual decks | ✚ | `rules.grid` with `cell`/`near`/`dist`/`cellOf`; terrain objects (Vault Breach) |
| 21 | several side decks, transformations | ✓ | deck sections, evolution (Tidewardens, Relic Chain) |
| 22 | leader transformation, independent resource deck | ✓ | `flip`/evolution, deck sections |
| 23 | discard-for-resource, damage-trigger rules | ✓ | `pitch`, life-card surge (Tidewardens) |
| 24 | physical tokens attached to units | ◐ | object vars as counters (Arcane growth), `create` tokens |
| 25 | alternative combat and hero roles | ◐ | module-defined attack actions |
| 26 | dedicated cheer-style resource deck, leader rules | ✓ | deck sections (Tidewardens) |
| 27 | attached energy as cost and board resource | ◐ | `link` plus counting `linked` |
| 28 | leader growth, life-zone damage | ✓ | evolution, life cards (Tidewardens) |
| 29 | any card as a resource, shield reveal triggers | ✓ | `pitch`, surge on leaving life (Tidewardens) |
| 30 | board occupancy by size, class restrictions | ◐ | `req` with `sum` over the board |
| 31 | counter movement, level thresholds | ◐ | vars plus statics |
| 32 | persistent advancement, attack categories | ◐ | vars, several attack actions |
| 33 | multi-unit teams, mission scoring | ◐ | `link` teams, score vars |
| 34 | quest/resource dual use, cooperative boss | ◐ | `win` with several players, scripted boss AI (campaign) |
| 35 | dual-deck asymmetric zones, alternate wins | ✓ | deck sections, alternate wins (Arcane charge) |
| 36 | deck as a resource, spatial location control | ◐ | `top`/`move` from the deck; lanes or grid |
| 37 | scenario objectives, multi-card skill checks | ✓ | scenarios (campaign), `check` (Relic fusion) |
| 38 | asymmetric roles, shared resource pool, site path | ✚ | role vars with role-gated actions and wins, shared alarm (Vault Breach) |
| 39 | N-player turn order, voting, directed elimination | ✓ | Ember Council |
| 40 | asymmetric actions, nested encounters, hidden installs | ✚ | roles; a breach run through face-down barriers (Vault Breach) |
| 41 | journey state, opponent hazard windows | ◐ | vars; `alternate`/stack windows for the opponent |
| 42 | external conditions, environment abstraction | ✚ | `rules.external` plus `setExternal` (Vault Breach "lights") |
| 43 | several objectives and score tracks | ◐ | vars |
| 44 | several decks, character transformation | ✓ | deck sections, `flip` |
| 45 | dice as first-class objects with random faces | ✓ | die object plus `random` (Ember Council) |
| 46 | external physical-state adapter | ✚ | `setExternal`: host-supplied state, logged and replayable |
| 47 | several arena contests and scoring | ✓ | Tri-Lane |
| 48 | team lineup, location cycling, separate spell pool | ◐ | shared zones, deck sections |
| 49 | rotating cards, lane-specific triggers | ◐ | an orientation var, lanes |
| 50 | combination recipes, multi-card fusion | ✓ | action `check` plus materials (Relic Chain) |

Cross-cutting items:
- **Subgames** (a separate mini-match inside a match) are ◐: nested encounters are covered, but a full nested match with its own zones is not a primitive yet.
- **Card-level official compatibility** is out of scope: it needs the rights holder's rules, card data and permission.
- Per the spec, a ◐ row becomes ✓ only after a focused interaction test, which is about 20 adversarial cases per stressor in a dedicated module.

## Rules-structure survey (published comprehensive rules of about 30 popular and historical TCGs)
A second pass read the published rules of about 30 commercial and historical games to find rule **structures** that the engine could not yet express. Only the structures are recorded here: nothing from those games is reproduced, and the reference games stay original. "Games" is how many of the surveyed games need the structure.

| # | Structure | Games | Status | How |
|---|---|---|---|---|
| 10 | Timing windows opened mid-turn (combat steps, showdowns, counter/guard/defend windows) | 11 | ✚ | `rules.windows` + `openWindow`, step timing, `$win` data (Bastion Clash combat) |
| 6 | Slotted zones: named slots, type limits, rows, adjacency | 8 | ✚ | zone `slots`, `move {slot}`, `setSlot`, `freeSlots`/`adjacent` (Bastion Clash rows and gear) |
| 1 | Usage limits: once per turn/game, per card, name or object | 7 | ✚ | action/ability `limit`, `uses` (Bastion Clash wells, attacks, hero power, enter draw) |
| 7 | Typed resources: payment, generic costs, thresholds, expiring pools | 7 | ✚ | `rules.resources`, `pay`/`gain`/`canPay`/`meets`/`tally` (Bastion Clash aether) |
| 9 | Deck construction as rules: colours, singleton, group limits, leader identity, copies by name | 5 | ✚ | `format.rules`, `copiesBy`, section `maxCopies` (Bastion Clash aspects, gear cap, well floor) |
| 2 | Lists of activated abilities printed on cards | 3 | ◐ | an action with `source` + `run obj field` per card; no list primitive yet |
| 8 | Engine-wide targeting restrictions (untargetable, "only by X") | 2 | ◐ | slot `from` filters by convention; not enforced globally |
| 11 | Teams | 2 | ◐ | role vars; no shared-win team primitive |
| 12 | Helpers: combat damage splitting, rotated (tapped) cards | 2 | ◐ | decisions and vars |
| 3 | Responses anchored to a specific event, "missing the timing" | 1 | ◐ | triggers plus windows |
| 4 | Gain control | 1 | ◐ | needs a `control` effect |
| 5 | Copy effects, "loses all abilities" | 1 | ◐ | layers cover stats and keywords, not ability lists |
| 13 | Grids with vertical layers (surface/underground/air) | 1 | ◐ | grid plus a layer var |

Already covered across the surveyed games: damage dealt as cards (life cards, shields, clocks, prizes, deck as life), resource decks and pitching, evolution and level-up stacks, per-turn role swaps, secret bids and votes, multiplayer seating.
