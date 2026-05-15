# Architecture

## Package Dependency

```
@book/parser-core  (leaf, no internal deps)
    │
    ├──→ @book/reader-core  (leaf, no internal deps)
    │         │
    │         └──→ @book/reader-host  (depends on parser-core + reader-core)
    │                    │
    └────────────────────┼──→ @book/app  (depends on all three)
                         │
                   @book/server  (standalone, no internal deps)
```

## Layer & Responsibility

```
┌──────────────────────────────────────────────────────────────────┐
│                        @book/app                                  │
│  Vue 3 PWA                                                        │
│                                                                   │
│  Components       Pinia Stores      Plugin System (13 plugins)    │
│  Composables      Storage (IndexedDB)  Content Transformers       │
│  Router           Core Types         Theme Registry               │
└───────────────────────────┬───────────────────────────────────────┘
                            │ imports
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
┌────────────────────┐ ┌──────────┐ ┌──────────────────────┐
│  @book/parser-core  │ │reader-  │ │ @book/reader-host     │
│                     │ │core     │ │                       │
│  BookParser 接口    │ │         │ │ BaseHost (abstract)    │
│  supportsFormat()   │ │状态机   │ │  ├── ReaderHost       │
│  parse()            │ │         │ │  │   (iframe 翻页)    │
│  extractResource()  │ │Reducer  │ │  └── FixedHost        │
│                     │ │         │ │      (PDF/CBZ 固定)   │
│  懒加载 parsers:    │ │Effects  │ │                       │
│   epub/txt/pdf/     │ │         │ │ ContentPipeline       │
│   cbz/fb2/html/     │ │(纯逻辑) │ │  ├─ resolveChapterRes │
│   docx/cbr/mobi/azw │ │         │ │  ├─ injectResources   │
│                     │ │         │ │  └─ ContentTransform  │
└────────────────────┘ └──────────┘ └──────────────────────┘
```

## Data Flows

### Book Import

```
User drops file
  → app: loadBook(file)
    → parser-core: loadParserForFormat(format)  [lazy import]
      → parser.parse(file) → ParserResult
        → app: mapParserResult → ParsedBook
          → IndexedDB: saveBook(parsedBook)
            → books store + chapters store + zips store
```

### Open Reader

```
User clicks book
  → app: openBook(bookId)
    → IndexedDB: read book / chapters
    → Plugin System: loadPluginsFor("reader")
      → each plugin setup() → register UI / hooks / transformers

  → reader-host: new ReaderHost({container, onEffect, fetchChapter, ...})
    → host.init(bookId, chapters, chapterIndex, mode)
      → reader-core: dispatch(INIT)
        → effects: [FETCH_CHAPTER, MODE_CHANGED]

    → runEffect(FETCH_CHAPTER)
      → IndexedDB: fetchChapter → html
      → ContentPipeline: resolveChapterResources (blob URLs for images/etc)
      → ContentPipeline: transformContent (plugin transformers)
      → iframe: body.innerHTML = processed
      → rAF: measure pagination → dispatch(PAGE_COUNT_UPDATED)
        → effects: [PAGE_POSITION_CHANGED, PAGE_DID_CHANGE]
          → update CSS --current-page
          → emit plugin events
```

### Page Turn

```
User tap on iframe
  → dispatch(NEXT_PAGE | PREV_PAGE)

Within chapter (page within bounds):
  → reducer: increment/decrement page
    → effects: [PAGE_POSITION_CHANGED, PAGE_DID_CHANGE]
      → update CSS translateX offset
      → emit plugin events (page:changed)

Cross chapter (boundary):
  → reducer: status → loading, effects: [FETCH_CHAPTER]
    → host fetches & renders next chapter
    → dispatch(CHAPTER_LOADED)
      → effects: [CHAPTER_DID_CHANGE, PAGE_DID_CHANGE, CONTENT_DID_LOAD]
        → emit plugin events
```

## State Machine

### States

```
idle ──INIT──→ loading ──PAGE_COUNT_UPDATED──→ ready
                 ▲                                │
                 │         GO_TO_CHAPTER           │
                 └──── SET_MODE ──────────────────┘
                                              │
                                         TEARDOWN
                                              │
                                              ▼
                                            idle
```

### Actions

| Action                | Trigger         | Effect                                                                 |
| --------------------- | --------------- | ---------------------------------------------------------------------- |
| INIT                  | host.init()     | FETCH_CHAPTER + MODE_CHANGED                                           |
| CHAPTER_LOADED        | fetch success   | CHAPTER_DID_CHANGE + PAGE_DID_CHANGE [+ CONTENT_DID_LOAD]              |
| CHAPTER_FAILED        | fetch failure   | (none, sets error)                                                     |
| PAGE_COUNT_UPDATED    | rAF measurement | PAGE_POSITION_CHANGED + PAGE_DID_CHANGE                                |
| NEXT_PAGE / PREV_PAGE | user tap        | PAGE_POSITION_CHANGED + PAGE_DID_CHANGE (or FETCH_CHAPTER at boundary) |
| GO_TO_CHAPTER         | chapter nav     | FETCH_CHAPTER                                                          |
| GO_TO_PAGE            | direct jump     | PAGE_POSITION_CHANGED + PAGE_DID_CHANGE                                |
| SET_MODE              | mode toggle     | MODE_CHANGED + FETCH_CHAPTER                                           |
| SCROLL_PROGRESS       | scroll event    | [CHAPTER_DID_CHANGE if chapter changed]                                |
| TEARDOWN              | host.destroy()  | READER_UNMOUNTED                                                       |

### Effects

| Effect                | Consumer      | Side Effect                     |
| --------------------- | ------------- | ------------------------------- |
| FETCH_CHAPTER         | host          | Reads IndexedDB, renders iframe |
| PAGE_POSITION_CHANGED | host          | Updates CSS --current-page      |
| MODE_CHANGED          | host          | Updates iframe [data-mode]      |
| CHAPTER_DID_CHANGE    | plugin system | Emits chapter:changed event     |
| PAGE_DID_CHANGE       | plugin system | Emits page:changed event        |
| CONTENT_DID_LOAD      | plugin system | Emits content:loaded event      |
| READER_UNMOUNTED      | plugin system | Emits reader:unmounted event    |

## Plugin System

### Lifecycle

```
Build time: import.meta.glob collects ./plugins/*/index.ts
  → PLUGIN_METADATA (build-time generated manifest)

Runtime:
  loadPluginsFor(scene)          // "app" | "reader" | "bookshelf"
    → registerPlugin(plugin)     // Map<id, ManagedPlugin>
    → initializePlugins()        // Kahn topological sort by dependsOn
      → canActivate? → setup(context)
```

### PluginContext

| Property                   | Type                 | Purpose                                         |
| -------------------------- | -------------------- | ----------------------------------------------- |
| storage                    | PluginStorageAdapter | IndexedDB-backed KV per plugin                  |
| ui                         | UISlots              | Register modals, overlays, toolbar, themes      |
| events                     | IEventBus            | Listen/emit lifecycle events                    |
| hooks                      | HookRegistry         | Filter hooks (e.g. reader:init-config)          |
| readerSession              | () ⇒ ReaderSession   | Current reader session (null before book opens) |
| registerContentTransformer | fn                   | Transform chapter HTML before render            |
| navigate                   | fn                   | Client-side routing                             |
| server                     | ServerClient         | Proxy for server (net fetch, fs ops)            |
| themes                     | ThemeRegistry        | Theme registration/lookup                       |

### Built-in Plugins (13)

| Plugin           | Scene            | Core | Purpose                                  |
| ---------------- | ---------------- | ---- | ---------------------------------------- |
| manager          | app              | yes  | Plugin management UI                     |
| last-book        | app              |      | Restore last opened book                 |
| settings         | app              |      | Reader settings (fonts, margins, themes) |
| annotations      | reader           |      | Highlights and underlines                |
| auto-read        | reader           |      | Auto-scroll/auto-paginate                |
| bookmarks        | reader           |      | Chapter bookmarks                        |
| progress-bar     | reader           |      | In-iframe progress indicator             |
| reading-progress | reader           |      | Track reading progress                   |
| search           | reader           |      | Full-text search across chapters         |
| stats            | bookshelf+reader |      | Reading statistics                       |
| tts              | reader           |      | Text-to-speech                           |
| book-sources     | bookshelf        |      | Custom book sources (disabled)           |
| opds             | bookshelf        |      | OPDS catalog browser (disabled)          |

## Persistence (IndexedDB)

Database: `reader-db` (v11)

| Store        | Key                 | Purpose                                           |
| ------------ | ------------------- | ------------------------------------------------- |
| books        | book.id             | Book metadata (title, author, format, timestamps) |
| chapters     | [bookId, chapterId] | Chapter HTML content                              |
| zips         | bookId              | Raw file data (lazy extraction)                   |
| plugin_store | [pluginId, key]     | Plugin KV storage                                 |

## Pagination (CSS Columns)

```
iframe[data-mode="paginated"]
  → body.reader-content
    → column-width: calc(100dvw - margins)
    → height: 100dvh
    → column-fill: auto
    → transform: translateX(calc(-1 * var(--current-page) * 100dvw))
```

On rAF: `scrollWidth / clientWidth` → total pages. CSS columns auto-flow content, no manual DOM splitting needed.
