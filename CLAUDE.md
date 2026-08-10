# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands use the `vp` CLI (vite-plus):

- `vp dev packages/app` — Start dev server
- `vp build packages/app` — Build for production
- `vp preview packages/app` — Preview production build
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

pnpm workspace with 6 packages under `packages/*`:

- **`packages/app`** — Vue 3 PWA. The main application. Contains components, stores (Pinia), composables, plugins, storage (IndexedDB), core types.
- **`packages/reader-core`** — Framework-agnostic reader state machine (`createReaderMachine`, reducer). Pure logic, no Vue deps. Exports `ReaderState`, `ReaderAction`, `ReaderEffect`.
- **`packages/reader-engine`** — Iframe-based rendering engine. Manages content pipeline (resource injection, chapter resolution), fixed-layout support (PDF/CBZ/CBR), iframe resource loading, and scroll-progress calculation. Depends only on `reader-core`; resource extraction is injected by the app (no parser knowledge inside the engine).
- **`packages/parser-core`** — Book parser registry and base classes. Each format (epub, txt, pdf, cbz, fb2, html, docx, cbr, mobi/azw) is a lazy-loaded plugin registered via `registerParserLoader`. All implement `BookParser` interface.
- **`packages/server`** — Hono HTTP server for serving local files (OPDS, filesystem access). Independent of the PWA.
- **`packages/contracts`** — Shared wire contracts (request/response shapes) between app and server. Single source of truth for types that previously drifted between two hand-written copies.

## Key Patterns

- **Parser lazy-loading**: Parsers register via `registerParserLoader(format, () => import(...))` in `packages/parser-core/src/index.ts`. Never import parsers directly — use `getParserForFormat` / `getParserForFile`.
- **Reader state machine**: A pure reducer in `@book/reader-core` handling page turns, chapter transitions, scroll position, and CBR/CBZ spreads. Used by the Vue composable `useReaderMachine`.
- **Plugin system**: App plugins in `packages/app/src/plugins/` are self-contained feature modules. They receive a `PluginContext` on `setup(ctx)` and register capabilities (parsers, modals, overlays, toolbar actions, content transformers). Plugin manifest is build-time generated.
- **Pagination**: The reader iframe renders chapter HTML in CSS multi-column layout (`column-width: calc(100dvw - 2 * var(--page-margin))`, `column-fill: auto`). Page count is `ceil(body.scrollWidth / viewportWidth)` via pure functions in `reader-engine/src/layout.ts`; a `ResizeObserver` re-measures when fonts/images settle. Scroll mode wraps chapters in `.scroll-chapter` containers and tracks an in-chapter progress + viewport-top anchor (`scroll-progress.ts`).
- **IndexedDB storage**: `packages/app/src/storage/` wraps IndexedDB for books, chapters, raw zips, covers, folders, and plugin data. `createEntityStore<T>` / `createSingletonStore` in plugins provide reactive persistence. Core data lives in its own object stores; plugins get a namespaced key-value adapter.
- **Content pipeline**: Chapter HTML passes through registered content transformers and resource injectors before being rendered in the iframe.

## Testing

Tests use `vitest` (via `vp test`). Coverage is concentrated in the pure-logic layers: `reader-core/src/machine.test.ts` (reducer, well covered), `reader-engine/src/layout.test.ts` + `scroll-progress.test.ts`, parser fixtures (`txt`/`fb2`/`html`/`epub`), `parse-worker/client.test.ts`, `app/src/plugins/stats/engine.test.ts`, `app/src/plugins/store-factory.test.ts`. Note: tests are NOT run in CI (the deploy workflow only builds) — run `vp test` locally. Tests go next to the source files they test.
