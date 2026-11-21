# Universal Card Battles

A universal, fully automated TCG simulator. The headless deterministic TypeScript rules engine runs any card game defined as a data module. The browser UI comes later (M5).

- Spec: `docs/SPEC.md` (a condensed form of the design PDF; never re-read the PDF).
- Rules DSL reference: `docs/DSL.md`.
- Progress and the next step: `docs/STATUS.md`. **Read this first, and update it at the end of every session.**

## Token budget rules (follow strictly)

1. **Orient from docs, not code.** Read `STATUS.md`, then only what the task needs. Use `grep -n` and line ranges instead of whole-file reads. Never re-read a file you just wrote.
2. **No build step.** Node 22 runs `.ts` directly (type stripping). Use only erasable TS: no `enum`, `namespace` or parameter properties, and use `import type` for types.
3. **Quiet tooling.** Use `npm run -s check` (typecheck plus tests, dot reporter, failures only) and `npm run -s sim <game> -- --games=200` (a one-line summary). Pipe anything long through `tail`/`grep`.
4. **Content is data.** Games, cards, decks and campaigns are compact JSON using the S-expression DSL, never TS code. Adding a game must not touch `packages/engine`.
5. **Write whole files in one pass.** Plan the design in your head first, then write. Avoid edit-and-rerun churn.
6. **No subagents, and no screenshots before M5.**
7. **Small commits per vertical slice**, on the session branch.

## Layout

- `packages/engine/src`: the kernel (types, util, rng, expr, effects, match, view, validate, module). It is browser-safe and has no node imports.
- `packages/ai/src`: agents that see only `observe()` views and `listActions()`.
- `packages/reference-games/<id>/`: `manifest.json`, `rules.json`, `cards.json`, `decks.json`.
- `packages/test-harness`: the node module loader, match runner, sim CLI, and tests (`tests/*.test.ts`).
- Imports go through `#engine`, `#ai` and `#harness` (package.json `imports`).

## Non-negotiables (from the spec)

- The engine enforces every rule and never asks the user to adjudicate. It produces the legal actions and structured explanations for rejected ones.
- Nothing game-specific goes in the engine. If a module needs a new capability, add a generic primitive and document it in `docs/DSL.md`.
- Hidden information never leaks through views, legal actions, logs or errors. AI sees only views.
- Determinism: the same module, seed and command log must give an identical event hash.
- All content is original. Never recreate or name real commercial TCGs, their cards or their art.
