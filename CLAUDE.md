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
| Core types     | `src/core/`          | `Book`, `Chapter`, `ParsedBook`, `Bookmark`, `Annotation`, `ReaderSettings`, `ReadingSession`, `BookReadingStats`. `errors.ts` provides structured `ReaderError` with `ErrorCode` enum. `reader-host.ts` defines the `ReaderHost` singleton bridge for plugin↔reader communication.                                                                         |
| Plugins        | `src/plugins/`       | All parsers and features live here as plugins. `types.ts` defines `Plugin`, `PluginContext`, `UISlots`, `ContentTransformer`, `SearchApi` interfaces. `registry.ts` manages registration, dependency resolution (Kahn's algorithm), enable/disable lifecycle. `context.ts` provides `EventBus`, `TrackedContext` with auto-cleanup, `PluginStorageAdapter`. |
| Reader engine  | `src/reader-engine/` | `resource-resolver.ts` resolves EPUB resources (images, CSS, fonts) to blob URLs. `resource-urls.ts` rewrites paths in HTML. `reader-styles.ts` generates base iframe CSS. `iframe-resources.ts` injects/clears EPUB resources in iframe. `pdf-renderer.ts` handles PDF rendering.                                                                          |
| Storage        | `src/storage/`       | IndexedDB wrapper (`db.ts`) with 7 object stores: books, chapters, settings, resources, zips, plugin_store, folders. All DB operations via `dbOperation`/`dbTransaction` promise helpers. `books.ts` provides content access with lazy extraction + in-flight dedup.                                                                                        |
| Stores (Pinia) | `src/stores/`        | `reader` (book loading/navigation + chapter content with resource resolution), `bookshelf` (library + folders + search), `ui` (modals/toasts/confirmations/controls).                                                                                                                                                                                       |
| Composables    | `src/composables/`   | `useReaderEngine` is the main reader orchestrator (navigation, history, CFI, gestures, scroll tracking, content pipeline, ReaderHost). `useColumnPagination` handles CSS-column-based page measurement. `useChapterLoader` does LRU-cached chapter loading. `useIframeRenderer` manages iframe lifecycle. `useNavigationStack` tracks in-session history.   |
| Components     | `src/components/`    | `ReaderView.vue` is a thin template (~200 lines) delegating to `useReaderEngine`. `Bookshelf.vue`, `FixedLayoutView.vue`, plus `modals/` and `reader/` subdirectories.                                                                                                                                                                                      |
| Utilities      | `src/utils/`         | CFI-based position tracking (`epub-cfi.ts`), LRU cache, debounce, validation, color themes.                                                                                                                                                                                                                                                                 |

### Key patterns

- **Plugin system:** Parsers (txt, epub, pdf, cbz) and features (search, stats, settings, progress) are plugins under `src/plugins/`. Each plugin has `meta.ts` (declares `loadOn` scene), implementation, and `index.ts`. Scenes: `"app" | "book-import" | "bookshelf" | "reader"`. Plugins register UI components, content transformers, parsers, and search APIs. `TrackedContext` auto-cleans all registrations on teardown.
- **Parser registry:** `registry.ts:getParsers()` collects parsers from enabled plugins. File matching: first MIME type via `supportsFormat()`, then extension fallback via `EXTENSION_MIME_MAP`. `reader.ts:getParserForFile()`.
- **Reader engine:** `useReaderEngine(bookId, readerContentRef)` is the central composable. It orchestrates: chapter navigation, content pipeline (resource rewriting → content transformers → rendering), pagination/scroll mode switching, CFI navigation, internal link handling, gesture handling, scroll tracking, navigation history, and the `ReaderHost` implementation. ReaderView.vue is a thin template (~200 lines) that wires engine outputs to UI components.
- **Pagination:** `useColumnPagination` uses CSS `column-width` + `column-gap` in a hidden iframe. The iframe renders full chapter HTML, then `updateColumnLayout(cw, gap, scrollW)` computes page count from scroll width. Navigation translates content via `-(page * columnStep)`.
- **EPUB resources:** Images/CSS/fonts stored as `ArrayBuffer` in IndexedDB (`resources` store), served via `blob:` URLs. Resolution orchestrated by `reader-engine/resource-resolver.ts`. Raw zip stored in `zips` store for lazy chapter extraction.
- **Lazy extraction:** EPUB chapters not eagerly extracted. `storage/books.ts:getChapterContent()` detects missing content, calls `parser.loadChapterContent()` with in-flight dedup map. Extracted content cached back to IndexedDB.
- **Reading sessions:** `plugins/stats/engine.ts` tracks sessions (start/end time, chapters read, words read) and computes aggregate stats per book.
- **Annotations:** Highlights and underlines stored via CFI-based position references. `SelectionToolbar` triggers creation, `useAnnotationRenderer` renders them in the iframe, `AnnotationsPanel` lists them per book.
- **ReaderHost:** Global singleton (`core/reader-host.ts`) bridging plugins to ReaderView internals. Registered by `useReaderEngine`, accessed by plugins via `ctx.readerHost()`. Exposes: document access, navigation, pagination state, scroll mode control, event callbacks.
- **Deployment base:** `vite.config.ts` sets `base: "/book/"` for the PWA.

## Vite+ Rules

- Import test utilities from `vite-plus/test`, not `vitest`: `import { expect, test, vi } from 'vite-plus/test'`
- Use `vp` for all tooling (`vp test`, `vp lint`, `vp add`, etc.), never the underlying package manager directly
- Run `vp install` after pulling remote changes
