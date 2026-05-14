# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Monorepo (`vp` managed) — Vue 3 + TypeScript PWA ebook reader with a Node.js proxy server.

| Package             | Path                    | Description                                                                              |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `book` (root)       | `src/`                  | PWA ebook reader app                                                                     |
| `@book/reader-host` | `packages/reader-host/` | Bridge: creates iframe, runs effects from the state machine, manages resource resolution |
| `@book/reader-core` | `packages/reader-core/` | Pure-TS state machine (`reducer(state, action) → {state, effects}`). Zero deps, no DOM.  |
| `@book/parser-core` | `packages/parser-core/` | Pure-TS parser lib (browser APIs only, zero storage I/O)                                 |
| `@book/server`      | `packages/server/`      | Hono backend proxy server                                                                |

Deployed at `/book/`.

## Commands

- **Dev server:** `vp dev` (frontend only) or `pnpm dev:all` (frontend + backend)
- **Build:** `pnpm build` (runs `tsc -b && vp build`)
- **Lint + typecheck:** `vp check`
- **Format:** `vp fmt`
- **Tests:** `vp test` (Vitest via Vite+)
- **Install deps:** `vp install` (installs ALL workspace packages)
- **Import test utilities from:** `vite-plus/test`, not `vitest`: `import { expect, test, vi } from 'vite-plus/test'`

## Architecture

Two main views: `Bookshelf` (library) and `ReflowableReader`/`FixedLayoutReader` (reading). `App.vue` switches between them via `<Transition>` based on `currentRoute.name` (custom router, not Vue Router — see `src/utils/router.ts`).

### Layers (top to bottom)

| Layer            | Directory                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core types       | `src/core/`               | `Book`, `Bookmark`, `Annotation`, `ReaderSettings`, `ReadingSession`, `BookReadingStats`. `errors.ts` has structured `ReaderError` with `ErrorCode`. `theme-registry.ts` is `ThemeRegistry` — register/set/clear themes (light, dark, sepia built-in). Re-exports `Chapter`, `BookParser`, `ParserResult` from `@book/reader-core` and `@book/parser-core`.                                                                                                                                                                                                                                           |
| Plugins          | `src/plugins/`            | Feature plugins (search, stats, settings, annotations, bookmarks, TTS, auto-read, OPDS, book-sources, progress-bar, reading-progress, last-book, manager). `types.ts` defines `Plugin`, `PluginContext`, `UISlots`, `ContentTransformer`, `SearchApi`, `PluginEventMap`. `registry.ts` handles registration, dependency resolution via Kahn's algorithm, enable/disable lifecycle, `canActivate` capability check. `context.ts` provides `EventBus`, `TrackedContext` with auto-cleanup. `loader.ts` reads `plugin-metadata.json` (build-time scan of plugin `meta.ts`) for scene-based lazy loading. |
| Reader host      | `packages/reader-host/`   | `ReaderHost` class: creates iframe, subscribes to state machine, runs effects (render HTML, set page CSS, measure layout), resolves EPUB resources (images/css/fonts → blob: URLs), handles internal links.                                                                                                                                                                                                                                                                                                                                                                                           |
| Reader engine    | `packages/reader-core/`   | **`machine.ts`** — pure-TS state machine with `reducer()`. `session.ts` — `ReaderSession` interface. `getReaderSession()`/`registerReaderSession()` global accessors.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Storage          | `src/storage/`            | IndexedDB wrapper (`db.ts`) with 4 object stores: books, chapters, zips, plugin_store. Promise-based `dbOperation`/`dbTransaction` helpers. `books.ts` provides book/chapter CRUD. `raw-data.ts` for zip raw data access.                                                                                                                                                                                                                                                                                                                                                                             |
| Stores           | `src/stores/`             | Custom `defineStore` (`store.ts`) — reactive singleton factory, not Pinia. `reader` (current book state, book load/open/close), `bookshelf` (library + folders + search), `ui` (modals/toasts/confirmations/controls).                                                                                                                                                                                                                                                                                                                                                                                |
| Composables      | `src/composables/`        | `useReaderMachine` — Vue bridge for ReaderHost: creates host on mount, subscribes to state via `shallowRef`, wires page turns/tap zones/history. `useNavigationStack` — in-session back/forward. `useDocumentMarker` — generic Range-based text marking for annotations.                                                                                                                                                                                                                                                                                                                              |
| Components       | `src/components/`         | `Bookshelf.vue`, `ReflowableReader.vue`, `FixedLayoutReader.vue`, `ReaderChrome.vue`, `FixedLayoutPage.vue`, plus `modals/` subdirectory.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Content pipeline | `src/content-pipeline.ts` | `processChapterHtml(html, bookId, chapterId, resourceUrls?)` — parses HTML body via DOMParser, runs `applyContentTransformers` (plugin pipeline).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Utilities        | `src/utils/`              | Custom router (`router.ts`), CFI position tracking (`epub-cfi.ts`), color conversion (`colors.ts`), API server client (`api.ts`), PDF renderer, reader CSS themes, validation, time formatting, constants.                                                                                                                                                                                                                                                                                                                                                                                            |

### Reader state machine (`packages/reader-core/src/machine.ts`)

Pure-TS state machine, zero Vue dependencies. Pattern: `dispatch(action) → reducer(state, action) → { state, effects[] }`.

Vue does exactly two things: subscribes to state changes for rendering, and dispatches actions for user input. Side effects (storage I/O, DOM, events) are data objects executed by `ReaderHost.runEffect()`.

**State** (`ReaderState`): `bookId`, `chapters`, `currentChapterIndex`, `mode` (`pagination`|`scroll`), `status` (`idle`|`loading-chapter`|`rendered`|`ready`), `page` (current/total/iframeWidth/pendingTarget), `scroll` (windowStart/windowEnd/progress), `error`.

**Actions** (`ReaderAction`): `INIT`, `CHAPTER_LOADED`, `CHAPTER_FAILED`, `LAYOUT_MEASURED`, `NEXT_PAGE`, `PREV_PAGE`, `GO_TO_CHAPTER`, `GO_TO_PAGE`, `SET_MODE`, `SCROLL_PROGRESS`, `SCROLL_WINDOW_EXPANDED`, `CLEANUP`.

**Effects** (`ReaderEffect`): `FETCH_CHAPTER`, `FETCH_CHAPTERS`, `RENDER_HTML`, `SET_PAGE_CSS`, `SET_MODE_CSS`, `SET_PAGE_MARGIN_CSS`, `EMIT`, `SCROLL_INTO_VIEW`, `MEASURE_LAYOUT`, `NOOP`.

Each action has a dedicated sub-reducer. Navigation history is managed by `useNavigationStack` composable (Vue-side), not the machine.

### ReaderHost (`packages/reader-host/src/host.ts`)

The bridge between the pure state machine and the DOM. Creates an iframe with base CSS, subscribes to the machine, and runs effects:

- `FETCH_CHAPTER` → calls `fetchChapter` callback, runs content pipeline (resource resolution + transforms), dispatches `CHAPTER_LOADED`
- `RENDER_HTML` → sets `iframeDoc.body.innerHTML`
- `SET_PAGE_CSS` → sets `--current-page` CSS variable on iframe `<html>` for `transform: translateX(-N * 100dvw)` pagination
- `MEASURE_LAYOUT` → `requestAnimationFrame` → measures `body.scrollWidth / iframeWidth` → dispatches `LAYOUT_MEASURED`
- EPUB resource resolution → `resolveChapterResources` extracts images/css/fonts via parser, creates blob: URLs, injects `<link>`/`<style>` in iframe head

### ReaderSession (plugin bridge)

Five methods accessed via `ctx.readerSession()` (late-bound getter on `PluginContext`):

- `session.dispatch(action)` — send action to state machine
- `session.getState()` — read current `ReaderState`
- `session.getDocument()` — access iframe document (annotations/search/TTS)
- `session.setPageMargin(margin)` — set page margin CSS var
- `session.navigateToCfi(cfi, chapterId)` — navigate to CFI position

Session registered when `ReflowableReader` mounts, cleared on unmount. Accessed globally via `getReaderSession()`/`registerReaderSession()` from `@book/reader-core`.

### Plugin system

All features (search, stats, settings, annotations, bookmarks, TTS, auto-read, OPDS, book-sources, etc) are plugins under `src/plugins/`.

**Lifecycle:**

1. `plugin-metadata.json` (build-time generated by scanning `meta.ts` files) declares `loadOn` scene + `pluginId` + `defaultEnabled`
2. `loader.ts` reads metadata, registers stubs, maps scenes to lazy module loaders
3. On scene load (e.g. `loadPluginsFor("reader")`), loader imports plugin module, registers full Plugin, calls `initializePlugins()`
4. `registry.ts` resolves dependencies (Kahn's algorithm), calls `setup(ctx)` on each plugin
5. `TrackedContext` auto-cleans all registrations on `teardown()` / `runCleanup()`

**Scenes:** `"app" | "book-import" | "bookshelf" | "reader"`

**Plugin capabilities:**

- `ui.registerModal(name, component)` — panels rendered by `ModalWrapper`
- `ui.registerOverlay(name, component)` — UI inside `ReaderView`
- `ui.registerFooterAction(action)` / `ui.registerHeaderAction(action)` — toolbar/menu buttons
- `ui.registerToolbarItem(item)` — right-edge reader toolbar buttons
- `ui.registerBookshelfWidget(component)` / `ui.registerBookshelfMenuAction(action)` — bookshelf contributions
- `ui.registerPage(name, component)` — full-page components navigable via `/page/<name>`
- `ctx.registerContentTransformer(transformer)` — modify chapter HTML before rendering
- `ctx.capabilities.register("searchApis", api)` — register search providers
- `ctx.events.on("book:opened", ...)` / `"chapter:changed"` / `"page:changed"` / `"settings:changed"` etc.
- `ctx.storage.get/put/delete/clear` — scoped `plugin_store` IndexedDB access
- `Plugin.canActivate(ctx)` — optional capability check, returns false to hide plugin
- Enable/disable toggle (persisted to `plugin_store`, UI in `PluginsPanel`)

### Pagination

CSS `column-width: 100dvw` + `column-fill: auto` + `height: 100dvh` in the iframe. Each column is one screen; `--current-page` CSS variable drives `transform: translateX(calc(-1 * var(--current-page) * 100dvw))`. `MEASURE_LAYOUT` effect computes total pages from `body.scrollWidth / iframeWidth`.

### Data flow

```
User gesture (tap zone / button)
  → dispatch(action)
    → reducer(state, action) → { newState, effects[] }   (synchronous, pure)
      → machine subscribers notified → ReaderHost.onStateChange → Vue shallowRef updated → re-render
      → effects executed by ReaderHost.runEffect()         (DOM, storage, events)
```

Plugins interact via:

```
Plugin
  → ctx.readerSession()?.dispatch(action)     // navigation, mode changes
  → ctx.readerSession()?.getState()           // read current state
  → ctx.readerSession()?.getDocument()        // iframe DOM access
  → ctx.events.on("chapter:changed", ...)     // event-based notification
```

### Key patterns

- **Custom router:** `src/utils/router.ts` — `currentRoute` reactive object, `navigate(url, replace?)` function, `popstate` listener. Routes: `/` (bookshelf), `/reader/:bookId` (reader), `/page/:name` (plugin pages). No Vue Router dependency.
- **Custom store:** `src/stores/store.ts` — `defineStore(id, { state, getters, actions })` returns singleton reactive store. Simple reactive factory, not Pinia. Three stores: `reader`, `bookshelf`, `ui`.
- **Parser registry:** `packages/parser-core/src/registry.ts` provides `registerParserLoader(format, loader)`, `getParserForFormat(format)`, `getParserForFile(file)`. File matching via MIME type + extension fallback. Built-in parsers (epub, txt, pdf, cbz) registered eagerly at import.
- **EPUB resources:** Images/CSS/fonts stored as `ArrayBuffer` in IndexedDB (`zips` store → lazy extraction via parser), served via `blob:` URLs. Resolution in `ReaderHost.fetchAndLoadChapter()`.
- **Lazy extraction:** EPUB chapters not eagerly extracted. `storage/books.ts:getChapterContent()` loads raw zip, calls `parser.extractChapterContent()`, caches to IndexedDB.
- **Content pipeline:** `src/content-pipeline.ts` — `processChapterHtml(html, bookId, chapterId)` → parse body via DOMParser → `applyContentTransformers()` (plugin pipeline, ordered by priority).
- **Theme registry:** `src/core/theme-registry.ts` — `ThemeRegistry` with 3 builtin themes (light, dark, sepia). Plugins register via `ctx.themes.register()`. `setTheme(id)` applies chrome CSS vars on `:root`. `generateThemeCSS()` produces content CSS for the iframe.
