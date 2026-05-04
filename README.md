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
├── core/            # Types, errors, plugin contracts (ReaderHost, SearchApi, Navigation)
├── plugins/         # Feature plugins (self-contained, core has no knowledge of them)
│   ├── types.ts        Plugin interface + FooterAction
│   ├── registry.ts     Singleton registry (register, enable/disable, query)
│   ├── txt-parser/     TXT format parser
│   ├── epub/           EPUB parser + resource/zip management
│   ├── annotations/    Highlight/underline + selection toolbar + popover
│   ├── bookmarks/      Bookmarks + reading progress persistence
│   ├── search/         Full-text search engine + panel
│   ├── stats/          Reading statistics tracking + panel
│   └── themes/         Theme/typography settings panels
├── storage/         # IndexedDB wrapper (db.ts) + book/chapter CRUD
├── stores/          # Pinia stores (reader, bookshelf, settings, ui)
├── composables/     # Reader engine (pagination, chapter loading, iframe renderer)
├── components/      # Core UI (Bookshelf, ReaderView, ReaderHeader/Footer/Content, ModalWrapper)
└── utils/           # CFI, colors, constants, debounce, validation, etc.
```

### Plugin System

Plugins conform to the `Plugin` interface and are registered in `main.ts`. Core has zero direct imports from plugin directories — plugins consume core APIs instead:

| Core API           | Location              | Provided by                                |
| ------------------ | --------------------- | ------------------------------------------ |
| `ReaderHost`       | `core/reader-host.ts` | `ReaderView` (implements, plugins consume) |
| `SearchApi`        | `core/search-api.ts`  | Search plugin (registers in `onInit`)      |
| `Navigation`       | `core/navigation.ts`  | `ReaderView` (registers during setup)      |
| `Plugin` callbacks | `plugins/registry.ts` | EPUB (resource/zip), Stats (session/stats) |

A `Plugin` can contribute:

- `parsers` — format parsers (TXT, EPUB)
- `modalComponents` — panels rendered by `ModalWrapper` (dynamic `<component :is>`)
- `overlayComponents` — UI rendered inside `ReaderView` (e.g. annotation toolbar)
- `footerActions` — toolbar/menu buttons in `ReaderFooter` (dynamic `v-for`)
- `resourceResolver` / `resourceSaver` / `zipStore` — EPUB resource management
- `sessionTracker` / `statsProvider` — reading statistics
- Lifecycle hooks: `onInit`, `onBookOpen`, `onBookClose`
- Enable/disable toggle (persisted to IndexedDB, with UI in `PluginsPanel`)

Plugins have **zero cross-dependencies** — each imports only from `core/`, `storage/`, `stores/`, `utils/`.

### Key Patterns

- **Pagination engine:** `usePagination` splits HTML into blocks, measures them in a hidden offscreen iframe, and computes pages. Results cached with LRU (capacity 10) keyed by `bookId:chapterId:styleHash`.
- **EPUB resources:** Images/CSS/fonts stored as `ArrayBuffer` in IndexedDB, served via `blob:` URLs. Lazy extraction from stored zip via registry callbacks.
- **Annotations:** Highlights/underlines stored via CFI-based position references. Rendered as `<span>` wraps in the iframe DOM. Selection toolbar + popover are self-contained plugin overlay components.
- **Bookmarks:** CFI-based position tracking. Reading progress persisted as a special bookmark entry.
- **Deployment base:** `vite.config.ts` sets `base: "/book/"` for the PWA.
