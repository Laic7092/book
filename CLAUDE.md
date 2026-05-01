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

| Layer          | Directory          | Role                                                                                                                                                                                                                                                                                                                    |
| -------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core types     | `src/core/`        | `Book`, `Chapter`, `ParsedBook`, `Bookmark`, `Annotation`, `ReaderSettings`, `ReadingSession`, `BookReadingStats`. `errors.ts` provides structured `ReaderError` with `ErrorCode` enum                                                                                                                                  |
| Parsers        | `src/parsers/`     | `BookParser` interface with `TxtParser` and `EpubParser` implementations. `BaseBookParser` provides chapter detection (Chinese + English patterns), HTML cleanup, and resource sanitization                                                                                                                             |
| Storage        | `src/storage/`     | IndexedDB wrapper (`db.ts`) with 7 object stores: books, chapters, bookmarks, settings, resources, stats, annotations. All DB operations go through promise-based helpers (`dbPut`, `dbGet`, `dbTransaction`, etc.)                                                                                                     |
| Stores (Pinia) | `src/stores/`      | State management: `reader` (book loading/navigation), `bookshelf` (library + search), `settings` (reader preferences), `bookmarks`, `annotations` (highlights/underlines), `ui` (modals/toasts/confirmations)                                                                                                           |
| Composables    | `src/composables/` | Reader engine: `usePagination` (hidden iframe measurement, block-level pagination, LRU cache), `useIframeRenderer` (iframe lifecycle + styles), `useChapterLoader` (chapter content fetching), `useReaderSearch` (full-text search in reader), `useAnnotationRenderer` (highlight/underline rendering + text selection) |
| Search         | `src/search/`      | Full-text regex search with context extraction and HTML-aware highlight                                                                                                                                                                                                                                                 |
| Utilities      | `src/utils/`       | CFI-based position tracking (`epub-cfi.ts`), hidden iframe page measurement (`page-measurer.ts`), EPUB resource URL rewriting (`resource-urls.ts`), LRU cache, debounce, validation, color themes                                                                                                                       |
| Components     | `src/components/`  | `Bookshelf.vue`, `ReaderView.vue`, plus `modals/` and `reader/` subdirectories                                                                                                                                                                                                                                          |

### Key patterns

- **Parser registry:** `reader.ts:17` — parsers are instantiated in an array, matched against file MIME type (with extension fallback). Adding a new format means implementing `BookParser` and adding to this array.
- **Pagination engine:** `usePagination` splits HTML into blocks, measures them in a hidden offscreen iframe, and computes pages. It prioritizes the target page, then continues in background via `requestAnimationFrame`-style chunking. Results are cached with an LRU (capacity 10) keyed by `bookId:chapterId:styleHash`.
- **EPUB resources:** Images/CSS/fonts are stored as `ArrayBuffer` in IndexedDB (`resources` store) and served via `blob:` URLs. Resource path rewriting in `utils/resource-urls.ts`.
- **Reading sessions:** `storage/stats.ts` tracks sessions (start/end time, chapters read, words read) and computes aggregate stats per book.
- **Annotations:** Highlights and underlines stored via CFI-based position references. `SelectionToolbar` triggers creation, `useAnnotationRenderer` renders them in the iframe, `AnnotationsPanel` lists them per book. CRUD operations in `storage/annotations.ts`.
- **Deployment base:** `vite.config.ts` sets `base: "/book/"` for the PWA.

## Vite+ Rules

- Import test utilities from `vite-plus/test`, not `vitest`: `import { expect, test, vi } from 'vite-plus/test'`
- Use `vp` for all tooling (`vp test`, `vp lint`, `vp add`, etc.), never the underlying package manager directly
- Run `vp install` after pulling remote changes
