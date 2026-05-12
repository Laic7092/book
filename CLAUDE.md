# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A PWA ebook reader (Vue 3 + TypeScript + Pinia + IndexedDB) that parses TXT and EPUB files, renders them with pagination, and tracks reading statistics. Deployed at `/book/`.

## Commands

- **Dev server:** `vp dev`
- **Build:** `tsc && vp build`
- **Lint + typecheck:** `vp check`
- **Format:** `vp fmt`
- **Tests:** `vp test` (Vitest via Vite+)
- **Install deps:** `vp install`

## Architecture

Two main views: `Bookshelf` (library) and `ReaderView` (reading). `App.vue` switches between them via `<Transition>` based on `readerStore.currentBook`.

### Layers (top to bottom)

| Layer          | Directory            | Role                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core types     | `src/core/`          | `Book`, `Chapter`, `ParsedBook`, `Bookmark`, `Annotation`, `ReaderSettings`, `ReadingSession`, `BookReadingStats`. `errors.ts` provides structured `ReaderError` with `ErrorCode` enum. `reader-host.ts` defines the `ReaderSession` interface (`dispatch`/`getState`/`getDocument`/`setPageMargin`) for plugin↔reader communication.                       |
| Plugins        | `src/plugins/`       | All parsers and features live here as plugins. `types.ts` defines `Plugin`, `PluginContext`, `UISlots`, `ContentTransformer`, `SearchApi` interfaces. `registry.ts` manages registration, dependency resolution (Kahn's algorithm), enable/disable lifecycle. `context.ts` provides `EventBus`, `TrackedContext` with auto-cleanup, `PluginStorageAdapter`. |
| Reader engine  | `src/reader-engine/` | **`reader-machine.ts`** — pure-TypeScript state machine (`reducer(state, action) → {state, effects}`). `content-pipeline.ts` — `processChapterHtml()` shared pipeline. `resource-resolver.ts` — resolves EPUB resources to blob URLs. `reader-styles.ts` — generates base iframe CSS. `iframe-resources.ts` — injects/clears EPUB resources in iframe.      |
| Storage        | `src/storage/`       | IndexedDB wrapper (`db.ts`) with 6 object stores: books, chapters, resources, zips, plugin_store, folders. All DB operations via `dbOperation`/`dbTransaction` promise helpers. `books.ts` provides content access with lazy extraction + in-flight dedup.                                                                                                  |
| Stores (Pinia) | `src/stores/`        | `reader` (book loading/navigation + chapter content with resource resolution), `bookshelf` (library + folders + search), `ui` (modals/toasts/confirmations/controls).                                                                                                                                                                                       |
| Composables    | `src/composables/`   | `useReaderMachine` — thin Vue bridge: creates machine, subscribes to state via `shallowRef`, runs effects against DOM/storage/events. `useIframeRenderer` — minimal iframe init utility (base HTML skeleton). `useNavigationStack` — in-session history. `useDocumentMarker` — generic Range-based text marking.                                            |
| Components     | `src/components/`    | `ReaderView.vue` — thin template delegating to `useReaderMachine`. `ReaderContent.vue` — iframe host (init + ResizeObserver column measurement), DOM manipulation driven by bridge effects. `Bookshelf.vue`, plus `modals/` and `reader/` subdirectories.                                                                                                   |
| Utilities      | `src/utils/`         | CFI-based position tracking (`epub-cfi.ts`), LRU cache, debounce, validation, color themes.                                                                                                                                                                                                                                                                 |

### Reader state machine (`reader-engine/reader-machine.ts`)

The core rendering logic is a pure-TS state machine with zero Vue dependencies. Pattern: `dispatch(action) → reducer(state, action) → { state, effects[] }`.

Vue does exactly two things: subscribes to state changes for rendering, and dispatches actions for user input. Side effects (storage I/O, DOM, events) are described as data objects executed by the bridge.

**State** (`ReaderState`): `bookId`, `chapters`, `currentChapterIndex`, `mode`, `status` (`idle|loading-chapter|ready`), `contentCache` (chapterId→processed HTML), `resourceUrls`, `page` (current/total/iframeWidth/pendingTarget), `scroll` (windowStart/windowEnd/progress), `chapterProgress`, `bookProgress`, `history`, `error`.

**Actions** (`ReaderAction`): `INIT`, `CHAPTER_LOADED`, `CHAPTER_FAILED`, `LAYOUT_MEASURED`, `NEXT_PAGE`, `PREV_PAGE`, `GO_TO_CHAPTER`, `GO_TO_PAGE`, `SET_MODE`, `HISTORY_BACK`, `HISTORY_FORWARD`, `SCROLL_PROGRESS`, `SCROLL_WINDOW_EXPANDED`, `CLEANUP`.

**Effects** (`ReaderEffect`): `FETCH_CHAPTER`, `FETCH_CHAPTERS`, `RENDER_HTML`, `SET_PAGE_CSS`, `SET_MODE_CSS`, `SET_PAGE_MARGIN_CSS`, `EMIT`, `PUSH_HISTORY`, `SCROLL_INTO_VIEW`, `NOOP`.

Each action has a dedicated sub-reducer (e.g. `nextPageReducer`, `goToChapterReducer`) that computes new state + effects deterministically. The machine can be tested with plain Node.js — no DOM, no Vue.

### ReaderSession (plugin bridge)

Replaces the old 20-method `ReaderHost`. Four methods:

- `session.dispatch(action)` — send an action to the state machine
- `session.getState()` — read current `ReaderState`
- `session.getDocument()` — access the iframe document (for annotation/search/TTS DOM plugins)
- `session.setPageMargin(margin)` — set page margin (settings plugin)

Plugins access the session via `ctx.readerSession()` (a late-bound getter on `PluginContext`). Each plugin stores a local reference to avoid repeated lookups. The session is registered when `ReaderView` mounts and cleared on unmount.

### Key patterns

- **Plugin system:** Parsers (txt, epub, pdf, cbz) and features (search, stats, settings, progress) are plugins under `src/plugins/`. Each plugin has `meta.ts` (declares `loadOn` scene), implementation, and `index.ts`. Scenes: `"app" | "book-import" | "bookshelf" | "reader"`. Plugins register UI components, content transformers, parsers, and search APIs. `TrackedContext` auto-cleans all registrations on teardown.
- **Parser registry:** `registry.ts:getParsers()` collects parsers from enabled plugins. File matching: first MIME type via `supportsFormat()`, then extension fallback via `EXTENSION_MIME_MAP`. `reader.ts:getParserForFile()`.
- **Pagination:** CSS `column-width: 100dvw` + `column-fill: auto` + `height: 100dvh` in the iframe. Each column is one screen; `transform: translateX(-N * 100dvw)` switches visible column. `LAYOUT_MEASURED` action computes total pages from `body.scrollWidth / iframeWidth`.
- **EPUB resources:** Images/CSS/fonts stored as `ArrayBuffer` in IndexedDB (`resources` store), served via `blob:` URLs. Resolution orchestrated by `reader-engine/resource-resolver.ts`. Raw zip stored in `zips` store for lazy chapter extraction.
- **Lazy extraction:** EPUB chapters not eagerly extracted. `storage/books.ts:getChapterContent()` detects missing content, calls `parser.loadChapterContent()` with in-flight dedup map. Extracted content cached back to IndexedDB.
- **Reading sessions:** `plugins/stats/engine.ts` tracks sessions (start/end time, chapters read, words read) and computes aggregate stats per book.
- **Annotations:** Highlights and underlines stored via CFI-based position references. `SelectionToolbar` triggers creation, `useAnnotationRenderer` renders them in the iframe, `AnnotationsPanel` lists them per book.
- **Content pipeline:** `reader-engine/content-pipeline.ts` provides `processChapterHtml(html, bookId, chapterId, resourceUrls)`. Pipeline: `rewriteResourcePaths` (blob: URL substitution) → `applyContentTransformers` (plugin transforms, ordered by priority).
- **Deployment base:** `vite.config.ts` sets `base: "/book/"` for the PWA.

## Data flow

```
User gesture
  → dispatch(action)
    → reducer(state, action) → { newState, effects[] }   (synchronous, pure)
      → subscribers notified → shallowRef updated → Vue re-renders
      → effects executed by bridge (RENDER_HTML → iframe.body.innerHTML, etc.)
```

Plugins interact via:

```
Plugin
  → ctx.readerSession()?.dispatch(action)     // navigation, mode changes
  → ctx.readerSession()?.getState()           // read current state
  → ctx.readerSession()?.getDocument()        // DOM access (annotations, search)
  → ctx.events.on("chapter:changed", ...)     // event-based notification
```

## Vite+ Rules

- Import test utilities from `vite-plus/test`, not `vitest`: `import { expect, test, vi } from 'vite-plus/test'`
- Use `vp` for all tooling (`vp test`, `vp lint`, `vp add`, etc.), never the underlying package manager directly
- Run `vp install` after pulling remote changes
