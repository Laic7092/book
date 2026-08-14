import { triggerStatsRefresh } from "./refresh";
import { createStatsEngine, setStatsEngine } from "./engine";
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";

/** Count CJK characters (each = 1) plus Latin/digit word tokens. */
function countWords(text: string): number {
  const cjk = text.match(/[一-鿿]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + latin;
}

export const statsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "stats",
  name: "Reading Statistics",
  version: "1.0.0",
  setup(ctx) {
    const eng = createStatsEngine(ctx.storage, ctx.readerSession);
    setStatsEngine(eng);

    ctx.events.on("book:opened", ({ bookId }) => eng.startSession(bookId));

    // content:loaded fires on every chapter render (including page-turn cross-
    // chapter), at which point the iframe already shows the new chapter.
    ctx.events.on("content:loaded", ({ bookId, chapterId }) => {
      void eng.recordChapterRead(bookId, chapterId);

      // Fixed-layout formats (PDF/CBZ) have no document body to count.
      const text = ctx.readerSession()?.getDocument()?.body?.innerText;
      const words = text ? countWords(text) : 0;
      if (words > 0) void eng.recordWordsRead(bookId, chapterId, words);
    });

    ctx.events.on("book:closed", ({ bookId }) => {
      // Best effort: the session may already be gone by the time this fires.
      const state = ctx.readerSession()?.getState();
      const chapterId = state?.chapters[state.currentChapterIndex]?.id;
      const totalChapters = state?.chapters.length;
      void eng.endSession(bookId, chapterId, totalChapters);
    });

    ctx.events.on("book:deleted", ({ bookId }) => {
      void eng.deleteStats(bookId).then(() => {
        triggerStatsRefresh();
      });
    });

    ctx.ui.registerBookshelfWidget(() => import("./StatsBar.vue"));
    ctx.ui.registerModal("stats", () => import("./StatsPanel.vue"));
    ctx.ui.registerPage("stats", () => import("./StatsPage.vue"));
    ctx.ui.registerFooterAction({
      id: "stats",
      position: "menu",
      label: "Statistics",
      icon: '<path d="M12 20V10M18 20V4M6 20v-4" />',
      modal: "stats",
      order: 40,
    });

    // Bookshelf menu action → full stats page
    ctx.ui.registerBookshelfMenuAction({
      id: "stats-page",
      order: 50,
      label: "Reading Stats",
      icon: '<path d="M12 20V10M18 20V4M6 20v-4" />',
      onClick: () => {
        ctx.navigate("/page/stats");
      },
    });
  },
};
