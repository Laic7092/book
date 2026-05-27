import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

interface ProgressData {
  chapterId: string;
  chapterIndex: number;
  pageIndex?: number;
  scrollProgress?: number;
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
    ctx.events.on("page:changed", ({ bookId }) => void save(bookId));
    ctx.events.on("chapter:changed", ({ bookId }) => void save(bookId));
    ctx.events.on("reader:unmounted", ({ bookId }) => {
      void save(bookId);
    });

    async function save(bookId: string) {
      const h = ctx.readerSession();
      if (!h) return;
      const s = h.getState();
      const chapter = s.chapters[s.currentChapterIndex];
      if (!chapter) return;
      const data: ProgressData = {
        chapterId: chapter.id,
        chapterIndex: s.currentChapterIndex,
      };
      if (s.mode === "scroll") {
        data.scrollProgress = s.scrollProgress;
      } else {
        data.pageIndex = s.page.current;
      }
      await ctx.storage.put(progressKey(bookId), data);
    }

    ctx.hooks.filter("reader:init-config", async (config) => {
      const data = await ctx.storage.get<ProgressData>(progressKey(config.bookId));
      if (!data) return config;
      if (config.mode === "scroll" && data.scrollProgress !== undefined) {
        return {
          ...config,
          chapterIndex: data.chapterIndex,
          initialScroll: { progress: data.scrollProgress },
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
