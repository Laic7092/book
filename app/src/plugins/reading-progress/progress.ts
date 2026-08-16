import type { ReaderSession } from "@book/engine";
import type {
  PluginContext,
  PluginStorageAdapter,
  InitConfig,
} from "../../core/plugin-runtime/types";
import {
  applyPositionSnapshot,
  snapshotFromSession,
  type ReaderPositionSnapshot,
} from "../../core/reader-session";

/**
 * Reading-progress persistence (plugin-owned).
 *
 * The recovery protocol (snapshot shape / capture / apply) lives in core
 * (`core/reader-session.ts`) and is shared by the `reader:unmounted` event and
 * the `reader:init-config` hook. This plugin only decides the persistence
 * format (IndexedDB via ctx.storage) and when to persist. Disabling it simply
 * means no position restore.
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

  async function saveSnapshot(bookId: string, snapshot: ReaderPositionSnapshot): Promise<void> {
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
    const snapshot = snapshotFromSession(getSession());
    if (!snapshot) return;
    await saveSnapshot(bookId, snapshot);
  }

  /** Map the persisted format onto the core recovery protocol. */
  function applyToConfig(config: InitConfig, data: ReadingProgressData): InitConfig {
    const progress = data.progress ?? data.scrollProgress;
    if (data.pageIndex === undefined && progress === undefined) {
      // No position data — restore the chapter only.
      return { ...config, chapterIndex: data.chapterIndex };
    }
    return applyPositionSnapshot(config, {
      chapterId: data.chapterId,
      chapterIndex: data.chapterIndex,
      mode: data.pageIndex !== undefined ? "pagination" : "scroll",
      page: data.pageIndex ?? 0,
      progress: progress ?? 0,
      anchor: data.anchor ?? data.scrollAnchor,
    });
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
 * Wires the reading-progress service into the plugin lifecycle (own setup).
 *
 * Pure trigger logic: listen to core events, debounce high-frequency scroll
 * updates, and hand the core recovery protocol back through the
 * reader:init-config hook. Persistence itself is in createReadingProgressService.
 */
export function createReadingProgressController(
  ctx: PluginContext,
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
