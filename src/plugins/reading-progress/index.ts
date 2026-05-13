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

function calcChapterProgress(pageIndex: number, totalPages: number): number {
  if (totalPages <= 1) return 100;
  return ((pageIndex + 1) / totalPages) * 100;
}

function calcBookProgress(
  chapterIndex: number,
  totalChapters: number,
  chapterProgress: number,
): number {
  if (totalChapters <= 1) return Math.max(1, Math.round(chapterProgress));
  const portion = 100 / totalChapters;
  return Math.round(chapterIndex * portion + (chapterProgress / 100) * portion);
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

      const cp = calcChapterProgress(s.page.current, s.page.total);
      await ctx.storage.put(progressKey(bookId), {
        chapterId: chapter.id,
        chapterProgress: cp,
        readingProgress: calcBookProgress(s.currentChapterIndex, s.chapters.length, cp),
        pageIndex: s.page.current,
      });
    }

    async function restore(bookId: string) {
      const data = await ctx.storage.get<ProgressData>(progressKey(bookId));
      if (!data) {
        return;
      }
      const h = ctx.readerSession();
      if (!h) {
        return;
      }
      const s = h.getState();
      const currentChapterId = s.chapters[s.currentChapterIndex]?.id;

      if (data.chapterId === currentChapterId) {
        h.dispatch({ type: "GO_TO_PAGE", page: data.pageIndex });
      } else {
        h.dispatch({
          type: "GO_TO_CHAPTER",
          chapterId: data.chapterId,
          targetPage: data.pageIndex,
        });
      }
    }

    const subs = [
      ctx.events.on("page:changed", ({ bookId }) => {
        void save(bookId);
      }),
      ctx.events.on("chapter:changed", ({ bookId }) => {
        void save(bookId);
      }),
      ctx.events.on("reader:unmounted", ({ bookId }) => {
        void save(bookId);
        mounted = false;
      }),
    ];

    ctx.events.on("reader:mounted", async ({ bookId }) => {
      subs.forEach((sub) => unsubs.add(sub));

      await restore(bookId);

      mounted = true;
    });

    ctx.onCleanup(() => {
      unsubs.forEach((fn) => fn());
      unsubs.clear();
    });
  },
};
