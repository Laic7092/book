import { triggerStatsRefresh } from "./refresh";
import { createStatsEngine, setStatsEngine } from "./engine";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const statsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "stats",
  name: "Reading Statistics",
  version: "1.0.0",
  setup(ctx) {
    const eng = createStatsEngine(ctx.storage, ctx.readerSession);
    setStatsEngine(eng);

    ctx.events.on("book:opened", ({ bookId }) => eng.startSession(bookId));
    ctx.events.on("book:closed", ({ bookId, chapterId }) => eng.endSession(bookId, chapterId));
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
  teardown() {
    setStatsEngine(null);
  },
};
