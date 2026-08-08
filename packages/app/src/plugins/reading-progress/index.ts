import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

interface ProgressData {
  chapterId: string;
  chapterIndex: number;
  pageIndex?: number;
  scrollProgress?: number;
  scrollAnchor?: number;
}

const PROGRESS_PREFIX = "readingProgress";

function progressKey(bookId: string): string {
  return `${PROGRESS_PREFIX}:${bookId}`;
}

export const readingProgressPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "reading-progress",
  name: "Reading Progress",
  version: "1.0.0",
  async setup(ctx, { onTeardown }) {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSavedAt = 0;

    /**
     * Debounce: persist shortly after scrolling stops, never while idle.
     * A throttle floor keeps an uninterrupted scroll from deferring the save
     * forever — a crash or task-kill mid-scroll would otherwise lose the whole
     * run instead of at most a few seconds of it.
     */
    function scheduleSave(bookId: string) {
      if (saveTimer !== null) clearTimeout(saveTimer);
      const now = performance.now();
      if (now - lastSavedAt >= 5000) {
        lastSavedAt = now;
        void save(bookId);
      }
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void save(bookId);
      }, 800);
    }

    function flushSave() {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    }

    ctx.events.on("page:changed", ({ bookId }) => {
      void save(bookId);
    });
    ctx.events.on("chapter:changed", ({ bookId }) => {
      void save(bookId);
    });
    // Scrolling emits per frame; debounce keeps IndexedDB writes to one
    // after the scroll settles instead of polling every N seconds.
    ctx.events.on("scroll:progress", ({ bookId }) => {
      scheduleSave(bookId);
    });
    // Re-entering scroll mode records the restored position immediately.
    ctx.events.on("mode:changed", ({ bookId, mode }) => {
      if (mode === "scroll") void save(bookId);
    });
    ctx.events.on(
      "reader:unmounted",
      ({ bookId, chapterId, chapterIndex, mode, page, scrollProgress, scrollAnchor }) => {
        flushSave();
        // The machine resets its state before this event fires; save the
        // snapshot carried by the event instead of reading the session.
        if (!chapterId || chapterIndex < 0) return;
        void saveFromSnapshot(bookId, {
          chapterId,
          chapterIndex,
          mode,
          page,
          scrollProgress,
          scrollAnchor,
        });
      },
    );

    // Fallback for refresh / tab switch / lock screen, where Vue's unmount
    // never runs.
    function onHidden() {
      const h = ctx.readerSession();
      if (!h || h.getState().mode !== "scroll") return;
      flushSave();
      void save(h.getState().bookId);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") onHidden();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHidden);

    onTeardown(() => {
      flushSave();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHidden);
    });

    async function saveFromSnapshot(
      bookId: string,
      snapshot: {
        chapterId: string;
        chapterIndex: number;
        mode: "pagination" | "scroll";
        page: number;
        scrollProgress: number;
        scrollAnchor?: number;
      },
    ) {
      lastSavedAt = performance.now();
      const data: ProgressData = {
        chapterId: snapshot.chapterId,
        chapterIndex: snapshot.chapterIndex,
      };
      if (snapshot.mode === "scroll") {
        // In-chapter progress (0..1); scrollAnchor is the viewport-top offset
        // inside the chapter, restored exactly (see scroll-progress.ts).
        data.scrollProgress = snapshot.scrollProgress;
        data.scrollAnchor = snapshot.scrollAnchor;
      } else {
        data.pageIndex = snapshot.page;
      }
      await ctx.storage.put(progressKey(bookId), data);
    }

    async function save(bookId: string) {
      const h = ctx.readerSession();
      if (!h) return;
      const s = h.getState();
      const chapter = s.chapters[s.currentChapterIndex];
      if (!chapter) return;
      void saveFromSnapshot(bookId, {
        chapterId: chapter.id,
        chapterIndex: s.currentChapterIndex,
        mode: s.mode,
        page: s.page.current,
        scrollProgress: s.scrollProgress,
        scrollAnchor: s.scrollAnchor,
      });
    }

    ctx.hooks.filter("reader:init-config", async (config) => {
      const data = await ctx.storage.get<ProgressData>(progressKey(config.bookId));
      if (!data) return config;
      if (data.scrollProgress !== undefined) {
        // Saved from scroll mode: open in scroll mode so the in-chapter
        // anchor restores against the single-chapter document. The init
        // mode defaults to "pagination" (driven by the machine, not by
        // settings), so without this override scroll progress is never
        // restored.
        return {
          ...config,
          mode: "scroll",
          chapterIndex: data.chapterIndex,
          initialScroll: { progress: data.scrollProgress, anchor: data.scrollAnchor },
        };
      }
      if (data.pageIndex !== undefined) {
        return {
          ...config,
          chapterIndex: data.chapterIndex,
          initialPage: { ...config.initialPage, pendingTarget: data.pageIndex },
        };
      }
      return {
        ...config,
        chapterIndex: data.chapterIndex,
      };
    });
  },
};
