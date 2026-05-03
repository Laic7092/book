# Book Reader PWA

A Progressive Web App ebook reader built with Vue 3, TypeScript, Pinia, and IndexedDB.

## Features

- **Format Support**: TXT and EPUB files
- **Pagination**: Block-level pagination with hidden iframe measurement
- **Offline Storage**: All data stored in IndexedDB
- **Reading Statistics**: Track reading sessions and progress
- **Bookmarks & Annotations**: Highlight and underline text with CFI-based positioning
- **Full-text Search**: Search within books
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

- `src/core/` - Types and error definitions
- `src/parsers/` - TXT and EPUB parsers
- `src/storage/` - IndexedDB operations
- `src/stores/` - Pinia stores
- `src/composables/` - Reader engine composables
- `src/components/` - Vue components
