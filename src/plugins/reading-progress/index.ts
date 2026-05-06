import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const loadOn = "reader" as const;

interface ProgressData {
  chapterId: string;
  chapterProgress: number;
  readingProgress: number;
  pageIndex: number;
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
  setup(ctx) {
    const unsubs: (() => void)[] = [];

    async function save(bookId: string) {
      const h = ctx.readerHost();
      if (!h) return;
      const chapter = h.getCurrentChapter();
      if (!chapter) return;
      const chapters = h.getChapters();
      const page = h.getCurrentPage();
      const total = h.getTotalPages();
      const chapterIndex = chapters.findIndex((c) => c.id === chapter.id);
      const chapterPortion = 100 / Math.max(1, chapters.length);
      const chapterProgress = total > 1 ? Math.round(((page + 1) / total) * 100) : 0;
      const readingProgress = Math.round(
        chapterIndex * chapterPortion + (chapterProgress / 100) * chapterPortion,
      );

      await ctx.storage.put(progressKey(bookId), {
        chapterId: chapter.id,
        chapterProgress,
        readingProgress,
        pageIndex: page,
      });
    }

    async function restore(bookId: string) {
      const data = await ctx.storage.get<ProgressData>(progressKey(bookId));
      if (!data) return;
      const h = ctx.readerHost();
      if (!h) return;
      await h.navigateToChapter(data.chapterId, data.pageIndex);
    }

    ctx.events.on("reader:mounted", async ({ bookId }) => {
      await restore(bookId);

      // Subscribe to save events only after restore is done
      unsubs.push(
        ctx.events.on("page:changed", ({ bookId }) => {
          void save(bookId);
        }),
        ctx.events.on("chapter:changed", ({ bookId }) => {
          void save(bookId);
        }),
        ctx.events.on("reader:unmounted", ({ bookId }) => {
          void save(bookId);
        }),
      );
    });

    ctx.onCleanup(() => {
      unsubs.forEach((fn) => fn());
      unsubs.length = 0;
    });
  },
};
