# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands use the `vp` CLI (vite-plus):

- `vp dev app` — Start dev server
- `vp build app` — Build for production
- `vp preview app` — Preview production build
- `vp check` — Lint + typecheck (uses `--fix` in staged files hook)
- `vp fmt` — Format code
- `vp test` — Run tests
- `vp check --fix` — Lint + typecheck with auto-fix
- `vp config` — Run during `pnpm prepare` to set up project config

Server (separate, for OPDS/remote files):

- `pnpm --filter @book/server dev` — Start Hono server with tsx watch
- `pnpm --filter @book/server start` — Start Hono server in production

Package manager: pnpm (v10.28.2)

## Monorepo Architecture

pnpm workspace: `app/` and `server/` at the root, two library packages under `packages/*`:

- **`app`** — Vue 3 PWA. The main application. Contains components, stores (Pinia), composables, plugins, storage (IndexedDB), core types.
- **`packages/engine`** — Iframe-based rendering engine plus the reader state machine (`createReaderMachine`, reducer — pure logic, no Vue deps, exports `ReaderState`, `ReaderAction`, `ReaderEffect`). Manages content pipeline (resource injection, chapter resolution), fixed-layout support (PDF/CBZ/CBR), iframe resource loading, and scroll-progress calculation. Resource extraction is injected by the app (no parser knowledge inside the engine).
- **`packages/parser`** — Book parser registry and base classes. Each format (epub, txt, pdf, cbz, fb2, html, docx, cbr, mobi/azw) is a lazy-loaded plugin registered via `registerParserLoader`. All implement `BookParser` interface.
- **`server`** — Hono HTTP server for serving local files (OPDS, filesystem access). Independent of the PWA.

## Key Patterns

- **Parser lazy-loading**: Parsers register via `registerParserLoader(format, () => import(...))` in `packages/parser/src/index.ts`. Never import parsers directly — use `getParserForFormat` / `getParserForFile`.
- **Reader state machine**: A pure reducer in `@book/engine` (merged from the former `reader-core`) handling page turns, chapter transitions, scroll position, and CBR/CBZ spreads. Used by the Vue composable `useReaderMachine`.
- **Plugin system**: App plugins in `app/src/plugins/`; the plugin runtime (registry/context/loader/types/metadata/store-factory) lives in `app/src/core/plugin-runtime/` are self-contained feature modules. They receive a `PluginContext` on `setup(ctx)` and register capabilities (parsers, modals, overlays, toolbar actions, content transformers). Plugin manifest is build-time generated. **Boundary rules, stability tiers and the core/plugin split are defined in `docs/plugin-contract.md` — read it before adding plugin capabilities or moving code into core.** New plugins: copy `app/src/plugins/_template/`.
- **Pagination**: The reader iframe renders chapter HTML in CSS multi-column layout (`column-width: calc(100dvw - 2 * var(--page-margin))`, `column-fill: auto`). Page count is `ceil(body.scrollWidth / viewportWidth)` via pure functions in `packages/engine/src/layout.ts`; a `ResizeObserver` re-measures when fonts/images settle. Scroll mode wraps chapters in `.scroll-chapter` containers and tracks an in-chapter progress + viewport-top anchor (`scroll-progress.ts`).
- **IndexedDB storage**: `app/src/storage/` wraps IndexedDB for books, chapters, raw zips, covers, folders, and plugin data. `createEntityStore<T>` / `createSingletonStore` in plugins provide reactive persistence. Core data lives in its own object stores; plugins get a namespaced key-value adapter.
- **Content pipeline**: Chapter HTML passes through registered content transformers and resource injectors before being rendered in the iframe.

## Testing

Tests use `vitest` (via `vp test`). Coverage is concentrated in the pure-logic layers: `packages/engine/src/machine.test.ts` (reducer, well covered), `packages/engine/src/layout.test.ts` + `scroll-progress.test.ts`, parser fixtures (`txt`/`fb2`/`html`/`epub`), `parse-worker/client.test.ts`, `app/src/plugins/stats/engine.test.ts`, `app/src/plugins/store-factory.test.ts`. Note: tests are NOT run in CI (the deploy workflow only builds) — run `vp test` locally. Tests go next to the source files they test.
