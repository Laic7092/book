import type { ReaderSession } from "@book/engine";
import type { PluginStorageAdapter, InitConfig } from "./plugin-runtime/types";

/**
 * Reading-progress persistence.
 *
 * Lives in core because “continue reading where I left off” is part of the
 * reader session lifecycle. The reading-progress plugin is kept as a thin
 * scene loader/registrar on top of this service.
 */

export interface ReadingProgressData {
  chapterId: string;
  chapterIndex: number;
  /** Exact pagination page at save time (best when reopening in pagination). */
  pageIndex?: number;
  /** Mode-independent in-chapter flow progress — the canonical coordinate. */
  progress?: number;
  anchor?: number;
  /** @deprecated legacy scroll-mode fields (pre-unification). */
  scrollProgress?: number;
  scrollAnchor?: number;
}

export interface ReadingProgressSnapshot {
  chapterId: string;
  chapterIndex: number;
  mode: "pagination" | "scroll";
  page: number;
  progress: number;
  anchor?: number;
}

const PROGRESS_PREFIX = "readingProgress";

export function progressKey(bookId: string): string {
  return `${PROGRESS_PREFIX}:${bookId}`;
}

export function createReadingProgressService(storage: PluginStorageAdapter) {
  async function get(bookId: string): Promise<ReadingProgressData | undefined> {
    return storage.get<ReadingProgressData>(progressKey(bookId));
  }

  async function remove(bookId: string): Promise<void> {
    await storage.delete(progressKey(bookId));
  }

  async function saveSnapshot(bookId: string, snapshot: ReadingProgressSnapshot): Promise<void> {
    const data: ReadingProgressData = {
      chapterId: snapshot.chapterId,
      chapterIndex: snapshot.chapterIndex,
      // Unified position: mode-independent, restores in either mode.
      progress: snapshot.progress,
      anchor: snapshot.anchor,
    };
    if (snapshot.mode === "pagination" && snapshot.page > 0) {
      // Keep the exact page as well, for lossless restore when the user
      // reopens in pagination with a stable layout.
      data.pageIndex = snapshot.page;
    }
    await storage.put(progressKey(bookId), data);
  }

  async function saveSession(
    bookId: string,
    getSession: () => ReaderSession | null,
  ): Promise<void> {
    const h = getSession();
    if (!h) return;
    const s = h.getState();
    const chapter = s.chapters[s.position.chapterIndex];
    if (!chapter) return;
    await saveSnapshot(bookId, {
      chapterId: chapter.id,
      chapterIndex: s.position.chapterIndex,
      mode: s.presentation.mode,
      page: s.presentation.page,
      progress: s.position.progress,
      anchor: s.position.anchor,
    });
  }

  function applyToConfig(config: InitConfig, data: ReadingProgressData): InitConfig {
    // Exact page restore when reopening in pagination with a stable layout.
    if (data.pageIndex !== undefined && config.mode === "pagination") {
      return {
        ...config,
        chapterIndex: data.chapterIndex,
        initialPage: data.pageIndex,
      };
    }
    // Unified position restore: progress + anchor work in either mode
    // (pagination derives the page readout; scroll restores exactly).
    const progress = data.progress ?? data.scrollProgress;
    if (progress !== undefined) {
      return {
        ...config,
        chapterIndex: data.chapterIndex,
        initialPosition: { progress, anchor: data.anchor ?? data.scrollAnchor },
      };
    }
    return {
      ...config,
      chapterIndex: data.chapterIndex,
    };
  }

  return {
    get,
    remove,
    saveSnapshot,
    saveSession,
    applyToConfig,
  };
}

/**
 * Wires the reading-progress service into the plugin lifecycle.
 *
 * This is kept in core so the reader session restore behavior is owned and
 * tested alongside the persistence logic; the plugin file only needs to call
 * this from its setup.
 */
export function createReadingProgressController(
  ctx: {
    storage: PluginStorageAdapter;
    events: {
      on: <K extends keyof import("./plugin-runtime/types").PluginEventMap>(
        event: K,
        handler: import("./plugin-runtime/types").EventHandler<
          import("./plugin-runtime/types").PluginEventMap[K]
        >,
      ) => () => void;
    };
    hooks: {
      filter: <K extends keyof import("./plugin-runtime/types").HookMap>(
        name: K,
        handler: import("./plugin-runtime/types").FilterHandler<
          import("./plugin-runtime/types").HookMap[K]
        >,
        priority?: number,
      ) => () => void;
    };
    readerSession: () => ReaderSession | null;
  },
  onTeardown: (fn: () => void | Promise<void>) => void,
): void {
  const progress = createReadingProgressService(ctx.storage);

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
  ctx.events.on("book:deleted", async ({ bookId }) => {
    await progress.remove(bookId);
  });
  ctx.events.on(
    "reader:unmounted",
    ({ bookId, chapterId, chapterIndex, mode, page, progress: progressValue, anchor }) => {
      flushSave();
      // The machine resets its state before this event fires; save the
      // snapshot carried by the event instead of reading the session.
      if (!chapterId || chapterIndex < 0) return;
      lastSavedAt = performance.now();
      void progress.saveSnapshot(bookId, {
        chapterId,
        chapterIndex,
        mode,
        page,
        progress: progressValue,
        anchor,
      });
    },
  );

  // Fallback for refresh / tab switch / lock screen, where Vue's unmount
  // never runs.
  function onHidden() {
    const h = ctx.readerSession();
    if (!h || h.getState().presentation.mode !== "scroll") return;
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

  async function save(bookId: string) {
    lastSavedAt = performance.now();
    await progress.saveSession(bookId, ctx.readerSession);
  }

  ctx.hooks.filter("reader:init-config", async (config) => {
    const data = await progress.get(config.bookId);
    if (!data) return config;
    return progress.applyToConfig(config, data);
  });
}
