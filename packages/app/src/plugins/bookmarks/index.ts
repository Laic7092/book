import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { createEntityStore, type EntityStore } from "../store-factory";
import type { Bookmark } from "../../core/types";
import type { ReaderSession } from "@book/reader-host";
import {
  LEGACY_FALLBACK_CFI,
  generateCfiFromElement,
  generateCfiFromCharOffset,
} from "../../utils/epub-cfi";
import { stripHtml } from "../../utils/validation";

// ── Module-level state (DI via closure, no global setter) ──

let _store: EntityStore<Bookmark> | null = null;
let _session: (() => ReaderSession | null) | null = null;

/** Access the reactive bookmark store from Vue components. */
export function useBookmarkStore(): EntityStore<Bookmark> {
  if (!_store) throw new Error("[bookmarks] Plugin not initialized — setup() hasn't run yet");
  return _store;
}

/** Access the reader host from Vue components. */
export function getBookmarkSession(): ReaderSession | null {
  return _session?.() ?? null;
}

// ── Legacy migration helpers ──

interface LegacyBookmark {
  id: string;
  bookId: string;
  chapterId: string;
  title: string;
  contentPreview: string;
  position: number;
  createdAt: number;
  color?: string;
  note?: string;
}

function isLegacyBookmark(bm: LegacyBookmark | Bookmark): bm is LegacyBookmark {
  return typeof (bm as LegacyBookmark).position === "number" && !(bm as Bookmark).cfi;
}

// ── Bookmark creation ──

function createBookmark(
  bookId: string,
  chapterId: string,
  cfi: string,
  title: string,
  contentPreview: string,
  color?: string,
  note?: string,
): Bookmark {
  return {
    id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    bookId,
    chapterId,
    cfi,
    title,
    contentPreview,
    createdAt: Date.now(),
    color,
    note,
  };
}

/** Compute CFI from current reading position and persist a bookmark. */
export async function addBookmarkFromHost(): Promise<void> {
  const session = _session?.();
  if (!session || !_store) return;

  const s = session.getState();
  const chapter = s.chapters[s.currentChapterIndex];
  if (!chapter) return;

  const article = session.getDocument()?.body;
  if (!article) return;

  const bookId = s.bookId;
  if (!bookId) return;

  let cfi: string;
  let preview: string;

  if (s.mode === "pagination") {
    const doc = session.getDocument();
    const body = doc?.body;
    if (!body) return;

    const totalPages = s.page.total;
    const currentPage = s.page.current;
    const fullHtml = body.innerHTML;
    const fullText = fullHtml.replace(/<[^>]*>/g, "");
    const charOffset = Math.floor(((currentPage + 0.5) / totalPages) * fullText.length);

    cfi = generateCfiFromCharOffset(chapter.order ?? 0, body, charOffset);

    const plainText = stripHtml(fullHtml).replace(/\s+/g, " ").trim();
    preview = plainText.slice(Math.max(charOffset - 1, 0), charOffset + 50);
  } else {
    const articleRect = article.getBoundingClientRect();
    const viewportCenter = articleRect.top + article.clientHeight * 0.2;
    const elementAtPoint = document.elementFromPoint(articleRect.left + 20, viewportCenter);

    let targetEl: Element;
    if (elementAtPoint && article.contains(elementAtPoint)) {
      targetEl = elementAtPoint.closest("p, h1, h2, h3, h4, h5, h6, li, div, section") || article;
    } else {
      targetEl = article;
    }

    cfi = generateCfiFromElement(chapter.order ?? 0, targetEl, article);

    const plainText = article.textContent?.replace(/\s+/g, " ").trim() || "";
    const targetText = targetEl.textContent?.replace(/\s+/g, " ").trim() || "";
    const offsetInArticle = plainText.indexOf(targetText.slice(0, 30));
    preview = plainText.slice(Math.max(offsetInArticle - 1, 0), offsetInArticle + 50);
  }

  const bookmark = createBookmark(bookId, chapter.id, cfi, chapter.title, preview);
  await _store.add(bookmark);
}

/** Load bookmarks for a specific book, with legacy migration. */
export async function loadBookmarks(bookId: string): Promise<void> {
  const store = _store;
  if (!store) return;

  // Reload from storage to get the latest data
  await store.reload();

  // Check for legacy bookmarks for this book that need migration
  let needsMigration = false;
  for (const item of store.items.value) {
    if (item.bookId !== bookId) continue;
    if (isLegacyBookmark(item as unknown as LegacyBookmark)) {
      needsMigration = true;
      break;
    }
  }

  if (needsMigration) {
    // Snapshot to avoid mid-iteration mutation
    const snapshot = [...store.items.value];
    for (const item of snapshot) {
      if (item.bookId !== bookId) continue;
      if (isLegacyBookmark(item as unknown as LegacyBookmark)) {
        const legacy = item as unknown as LegacyBookmark;
        const { position: _, ...rest } = legacy;
        const migrated = { ...rest, cfi: LEGACY_FALLBACK_CFI } as Bookmark;
        await store.remove(legacy.id);
        await store.add(migrated);
      }
    }
    // Reload after migration for a clean cache
    await store.reload();
  }
}

// ── Plugin registration ──

export const bookmarksPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "bookmarks",
  name: "Bookmarks",
  version: "1.0.0",
  setup(ctx) {
    _store = createEntityStore<Bookmark>(ctx.storage, "bookmark", (b) => b.id);
    _session = ctx.readerSession;

    ctx.events.on("book:opened", ({ bookId }) => {
      void loadBookmarks(bookId);
    });

    ctx.ui.registerModal("bookmarks", () => import("./BookmarksPanel.vue"));
    ctx.ui.registerFooterAction({
      id: "bookmarks",
      position: "bar",
      label: "Bookmarks",
      icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />',
      modal: "bookmarks",
      order: 10,
    });
  },
  teardown() {
    _store = null;
    _session = null;
  },
};
