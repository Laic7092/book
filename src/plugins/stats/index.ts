import StatsPanel from "./StatsPanel.vue";
import StatsBar from "./StatsBar.vue";
import { triggerStatsRefresh } from "./refresh";
import * as engine from "./engine";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { setStatsAdapter, setReaderHost } from "./engine";

export const statsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "stats",
  name: "Reading Statistics",
  version: "1.0.0",
  setup(ctx) {
    setStatsAdapter(ctx.storage);
    setReaderHost(ctx.readerHost);

    ctx.events.on("book:opened", ({ bookId }) => engine.startSession(bookId));
    ctx.events.on("book:closed", ({ bookId, chapterId }) => engine.endSession(bookId, chapterId));
    ctx.events.on("book:deleted", ({ bookId }) => {
      void engine.deleteStats(bookId).then(() => {
        triggerStatsRefresh();
      });
    });

    ctx.ui.registerBookshelfWidget(StatsBar);
    ctx.ui.registerModal("stats", StatsPanel);
    ctx.ui.registerFooterAction({
      id: "stats",
      position: "menu",
      label: "Statistics",
      icon: '<path d="M12 20V10M18 20V4M6 20v-4" />',
      modal: "stats",
      order: 40,
    });
  },
  teardown() {
    setStatsAdapter(null);
    setReaderHost(null);
  },
};
