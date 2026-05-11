# Book Reader PWA

A Progressive Web App ebook reader built with Vue 3, TypeScript, Pinia, and IndexedDB.

## Features

- **Format Support**: TXT and EPUB (extensible via plugin parsers)
- **Pagination**: Block-level pagination with hidden iframe measurement
- **Offline Storage**: All data stored in IndexedDB
- **Plugins**: Annotations, Bookmarks, Full-text Search, Reading Statistics, Themes
- **PWA**: Installable, works offline

## Commands

| Command      | Description              |
| ------------ | ------------------------ |
| `vp dev`     | Start development server |
| `vp build`   | Build for production     |
| `vp preview` | Preview production build |
| `vp check`   | Lint and typecheck       |
| `vp fmt`     | Format code              |
| `vp test`    | Run tests                |

## Tech Stack

- Vue 3 + TypeScript
- Pinia (state management)
- IndexedDB (storage)
- Vite+ (build tool)
- vite-plugin-pwa (PWA support)

## Architecture

```
src/
├── core/             # Types, errors, plugin contracts (ReaderHost, SearchApi)
├── plugins/          # Feature plugins (self-contained, core has no knowledge of them)
│   ├── context.ts        PluginContext, UISlots, EventBus, storage adapter, TrackedContext
│   ├── store-factory.ts  createEntityStore / createSingletonStore — reactive persistence
│   ├── loader.ts         Scene-based lazy loading + on-demand parser loading
│   ├── plugin-manifest.ts  (auto-generated at build time)
│   ├── manager/          Plugin management (registry, states, PluginsPanel)
│   │   ├── registry.ts       Register, dependency resolution, lifecycle, enable/disable
│   │   ├── plugin-states.ts  Plugin on/off states via createEntityStore
│   │   ├── PluginsPanel.vue  Plugin management UI
│   │   └── index.ts          Manager plugin entry
│   ├── settings/        Reader settings (theme, font, typography) + panels
│   ├── annotations/     Highlight/underline + selection toolbar + popover
│   ├── bookmarks/       Bookmarks + reading progress persistence
│   ├── search/          Full-text search engine + panel
│   ├── stats/           Reading statistics tracking + panels
│   ├── epub/            EPUB parser + resource/zip management
│   ├── txt-parser/      TXT format parser
│   ├── cbz-parser/      CBZ comic parser
│   ├── pdf-parser/      PDF parser (pdfjs-dist)
│   ├── book-sources/    OPDS book source management
│   ├── opds/            OPDS catalog browser
│   └── ... (auto-read, tts, progress-bar, reading-progress, last-book)
├── storage/          # IndexedDB wrapper (db.ts) + book/chapter CRUD
├── stores/           # Pinia stores (reader, bookshelf, ui)
├── composables/      # Reader engine (pagination, chapter loading, iframe renderer)
├── components/       # Core UI (Bookshelf, ReaderView, ReaderHeader/Footer/Content, ModalWrapper)
└── reader-engine/    # Iframe rendering, resource resolution, reader styles
```

### Plugin System

Plugins conform to the `Plugin` interface. Metadata (`meta.ts`) is scanned at **build time** by a Vite plugin that generates `plugin-manifest.ts`. At runtime, `loader.ts` uses the manifest for scene-based lazy loading and on-demand parser loading.

| Core API           | Location              | Consumed by                          |
| ------------------ | --------------------- | ------------------------------------ |
| `ReaderHost`       | `core/reader-host.ts` | Annotations, settings, progress      |
| `PluginContext`    | `plugins/context.ts`  | All plugins via `setup(ctx)`         |
| `Plugin` callbacks | `manager/registry.ts` | EPUB (resource/zip), Stats (session) |
| `BookParser`       | `core/types.ts`       | Reader store, parser plugins         |

A plugin can contribute:

- `parsers` — format parsers (epub, cbz, pdf, txt) via `ctx.capabilities.register("parsers", ...)`
- `modalComponents` — panels rendered by `ModalWrapper` (dynamic `<component :is>`)
- `overlayComponents` — UI rendered inside `ReaderView` (e.g. annotation toolbar)
- `footerActions` / `headerActions` — toolbar/menu buttons (`ReaderFooter`, `ReaderHeader`)
- `bookshelfWidgets` / `bookshelfMenuActions` — bookshelf UI contributions
- `contentTransformers` — modify chapter HTML before rendering
- `registerContentTransformer` — inject per-chapter CSS/JS
- Events: `book:opened`, `book:closed`, `chapter:changed`, `page:changed`, `settings:changed`
- Enable/disable toggle (persisted to `plugin_store` IndexedDB via `createEntityStore`, UI in `PluginsPanel`)

### Key Patterns

- **Build-time manifest:** `vite-plugin-manifest` (built into `vite.config.ts`) scans `meta.ts` files and generates `src/plugins/plugin-manifest.ts`. No runtime `import.meta.glob` for metadata.
- **Parser on-demand loading:** Instead of loading all parsers via scene, `loadParserForFormat("epub")` loads only the matching parser. The manifest's `formats` field maps format → plugin.
- **Entity store persistence:** `createEntityStore<T>` provides reactive collection management + IndexedDB persistence. Used by settings, plugin states, annotations, bookmarks.
- **Pagination engine:** `usePagination` splits HTML into blocks, measures them in a hidden offscreen iframe, and computes pages. Results cached with LRU (capacity 10) keyed by `bookId:chapterId:styleHash`.
- **EPUB resources:** Images/CSS/fonts stored as `ArrayBuffer` in IndexedDB, served via `blob:` URLs. Lazy extraction from stored zip via registry callbacks.
- **Annotations:** Highlights/underlines stored via CFI-based position references. Rendered as `<span>` wraps in the iframe DOM.
- **Deployment base:** `vite.config.ts` sets `base: "/book/"` for the PWA.

### Key Patterns

- **Pagination engine:** `usePagination` splits HTML into blocks, measures them in a hidden offscreen iframe, and computes pages. Results cached with LRU (capacity 10) keyed by `bookId:chapterId:styleHash`.
- **EPUB resources:** Images/CSS/fonts stored as `ArrayBuffer` in IndexedDB, served via `blob:` URLs. Lazy extraction from stored zip via registry callbacks.
- **Annotations:** Highlights/underlines stored via CFI-based position references. Rendered as `<span>` wraps in the iframe DOM. Selection toolbar + popover are self-contained plugin overlay components.
- **Bookmarks:** CFI-based position tracking. Reading progress persisted as a special bookmark entry.
- **Deployment base:** `vite.config.ts` sets `base: "/book/"` for the PWA.
