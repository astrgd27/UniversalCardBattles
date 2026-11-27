# Universal Card Battles

A product for **making trading card games**. The Game Maker (Workshop) is the main product; games made there are played in a robust play mode (AI battles, shop, scenarios and campaigns, later multiplayer). A headless deterministic TypeScript rules engine runs any game defined as a data module. The browser UI is in `apps/web`.

Benchmark: five default modules are mechanics-faithful, differently themed clones of real TCGs (see `docs/STATUS.md`). Workshop Basic/Advanced features should reach ~80% of each source game and scripting ~95%.

- Spec: `docs/SPEC.md` (a condensed form of the design PDF; never re-read the PDF).
- Rules DSL reference: `docs/DSL.md`. Author guide: `docs/AUTHORING.md`.
- Progress and the next step: `docs/STATUS.md`. **Read this first, and update it at the end of every session.**

## Token budget rules (follow strictly)

1. **Orient from docs, not code.** Read `STATUS.md`, then only what the task needs. Use `grep -n` and line ranges instead of whole-file reads. Never re-read a file you just wrote.
2. **No build step.** Node 22 runs `.ts` directly (type stripping). Use only erasable TS: no `enum`, `namespace` or parameter properties, and use `import type` for types.
3. **Quiet tooling.** Use `npm run -s check` (typecheck plus tests, dot reporter, failures only), `npm run -s sim <game> -- --games=200` (a one-line summary) `npm run -s validate <dir|zip>` (`file:line:col` errors) `npm run -s events <game> <type...>` (event counts) `npm run -s tourney <game> -- --agents=heuristic,random` (AI win rates) and `npm run -s bench` (large-board timings). After an intended behaviour change, run `npm run -s golden`. Pipe anything long through `tail`/`grep`.
4. **Content is data.** Games, cards, decks and campaigns are compact JSON using the S-expression DSL, never TS code. Adding a game must not touch `packages/engine`.
5. **Write whole files in one pass.** Plan the design in your head first, then write. Avoid edit-and-rerun churn.
6. **No subagents.** Verify the UI with `npm run -s e2e` (Playwright, text output). Take at most one 1x screenshot, and only when the layout itself changed.
7. **Small commits per vertical slice**, on the session branch.

## Layout

- `packages/engine/src`: the kernel (types, util, rng, expr, effects, match, view, validate, module). It is browser-safe and has no node imports.
- `packages/ai/src`: agents that see only `observe()` views and `listActions()`.
- `packages/module-sdk/src`: ZIP/JSON/package loading (browser-safe), plus `node.ts` (disk) and `cli.ts`.
- `packages/campaign/src`: campaign runtime (profiles, encounters, rewards ledger, boosters, shop). It sits outside the match engine.
- `packages/modules/<id>/`: the default modules the app ships (`manifest.json`, `rules.json`, `cards.json`, `decks.json`).
- `packages/maker/src`: the Workshop's blueprint format, compiler, recipes, rulebook and CSV tools (browser-safe).
- `packages/test-harness/fixtures/<id>/`: small engine test fixtures, never loaded by the app.
- `packages/test-harness`: the node module loader, match runner, sim CLI, and tests (`tests/*.test.ts`).
- `apps/web`: the browser UI (`main.ts` controller, `ui/` screens rendered only from player views, `modules.ts`, `e2e.mjs`). `npm run dev` / `build` / `e2e`.
- Imports go through `#engine`, `#ai`, `#campaign`, `#sdk`, `#sdk/node` and `#harness` (package.json `imports`).

## Non-negotiables (from the spec)

- The engine enforces every rule and never asks the user to adjudicate. It produces the legal actions and structured explanations for rejected ones.
- Nothing game-specific goes in the engine. If a module needs a new capability, add a generic primitive and document it in `docs/DSL.md`.
- Hidden information never leaks through views, legal actions, logs or errors. AI sees only views.
- Determinism: the same module, seed and command log must give an identical event hash.
- All content is original: never copy names, characters, card text, art or setting from real TCGs. Mechanics may be emulated. Real games may be named only in internal design docs and tests as mechanics references, never in the app, cards or modules.
