import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const loadOn = "reader" as const;

interface ProgressData {
  chapterId: string;
  chapterIndex: number;
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
    const unsubs: Set<() => void> = new Set();
    let mounted = false;

    async function save(bookId: string) {
      if (!mounted) return;
      const h = ctx.readerSession();
      if (!h) return;
      const s = h.getState();
      const chapter = s.chapters[s.currentChapterIndex];
      if (!chapter) return;
      await ctx.storage.put(progressKey(bookId), {
        chapterId: chapter.id,
        chapterIndex: s.currentChapterIndex,
        pageIndex: s.page.current,
      });
    }

    const subs = [
      ctx.events.on("page:changed", ({ bookId }) => void save(bookId)),
      ctx.events.on("chapter:changed", ({ bookId }) => void save(bookId)),
      ctx.events.on("reader:unmounted", ({ bookId }) => {
        void save(bookId);
        mounted = false;
      }),
    ];

    ctx.events.on("reader:before-init", async (config) => {
      const data = await ctx.storage.get<ProgressData>(progressKey(config.bookId));
      if (!data) return;
      config.chapterIndex = data.chapterIndex;
      config.initialPage = { ...config.initialPage, pendingTarget: data.pageIndex };
      subs.forEach((sub) => unsubs.add(sub));
      mounted = true;
    });

    ctx.onCleanup(() => {
      unsubs.forEach((fn) => fn());
      unsubs.clear();
    });
  },
};
