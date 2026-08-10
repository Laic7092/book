# book

A browser-based ebook reader PWA. Import books from files or OPDS catalogs, read them in a paginated or scrollable view, with plugins for bookmarks, annotations, search, TTS, reading stats, and more.

## Quick start

```bash
pnpm install
vp dev packages/app
```

Open the dev server URL in your browser. Import EPUB/PDF/CBZ/CBR/TXT/FB2/DOCX/MOBI files to start reading.

### Dev commands

| Command                          | Description                               |
| -------------------------------- | ----------------------------------------- |
| `vp dev packages/app`            | Start the PWA dev server                  |
| `vp check`                       | Lint + TypeScript typecheck               |
| `vp check --fix`                 | Lint + typecheck with auto-fix            |
| `vp fmt`                         | Format code (oxc)                         |
| `vp test`                        | Run vitest tests                          |
| `vp build packages/app`          | Production build                          |
| `pnpm --filter @book/server dev` | Start Hono API server (OPDS, local files) |

### Prerequisites

- Node.js >= 18.12 (CI uses Node 24)
- pnpm 10.28.2

## Architecture

The project is a pnpm workspace monorepo with 6 packages under `packages/`:

```
packages/
  app/            Vue 3 PWA — UI, router, storage, plugin manager
  parser-core/    Parser registry + lazy-loaded format parsers (epub, pdf, cbz, …)
  reader-core/    Pure reader state machine (framework-agnostic reducer)
  reader-engine/  Iframe-based rendering engine (reflowable + fixed-layout hosts)
  server/         Hono server for OPDS catalogs and filesystem access
  contracts/      Shared wire contracts between app and server
```

### Plugin system

Features are self-contained plugins under `app/src/plugins/`. Each plugin exports a `Plugin` object with a `setup(ctx, helpers)` function. Plugins load lazily per-scene:

- `app` — startup plugins (manager, settings, last-book restore)
- `bookshelf` — library view (book sources, OPDS, stats)
- `reader` — reading view (bookmarks, annotations, search, TTS, progress)

Plugins have access to reactive IndexedDB storage, a typed event bus, filter hooks, and UI registration APIs (modals, overlays, toolbar actions).

### Reader pipeline

1. **Parse** — parser extracts chapters and content from the file
2. **Store** — book metadata and chapters saved to IndexedDB
3. **Render** — chapter HTML passes through content transformers → resource injection → iframe
4. **Paginate** — the iframe renders in CSS multi-column layout (`column-width`, `column-fill: auto`); page count is computed from `body.scrollWidth / viewportWidth` (pure math in `reader-engine/src/layout.ts`), re-measured via `ResizeObserver` when content/fonts settle
5. **Scroll mode** — chapters are wrapped in `.scroll-chapter` containers; in-chapter progress and viewport-top anchor are computed by `reader-engine/src/scroll-progress.ts`, with `IntersectionObserver` sentinels pre-loading adjacent chapters

### Format support

All formats use lazy-loaded parsers registered in `packages/parser-core/src/index.ts`:

| Format        | Extensions               |
| ------------- | ------------------------ |
| EPUB          | `.epub`                  |
| PDF           | `.pdf`                   |
| CBZ           | `.cbz`                   |
| CBR           | `.cbr`                   |
| MOBI/AZW3/AZW | `.mobi`, `.azw3`, `.azw` |
| FB2           | `.fb2`                   |
| DOCX          | `.docx`                  |
| TXT           | `.txt`                   |
| HTML          | `.html`, `.htm`          |

## Deployment

Push to `main` triggers GitHub Actions: `pnpm install` → `pnpm build` → deploys `packages/app/dist` to `gh-pages` branch.

## Tech stack

- **Vue 3** with Composition API, Pinia state management
- **Vite** with vite-plus CLI (oxc linting + formatting + typecheck)
- **TypeScript** (ES2023, bundler module resolution, `verbatimModuleSyntax`)
- **IndexedDB** for offline storage (books, chapters, raw zips, plugin data, covers, folders)
- **Hono** server for OPDS proxying and local file access
- **PWA** via `vite-plugin-pwa` (auto-update register strategy)

## License

MIT
