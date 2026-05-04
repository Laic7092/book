import StatsPanel from "./StatsPanel.vue";
import StatsBar from "./StatsBar.vue";
import * as engine from "./engine";
import type { Plugin } from "../types";
import { setStatsAdapter } from "./engine";

export const statsPlugin: Plugin = {
  id: "stats",
  name: "Reading Statistics",
  version: "1.0.0",
  setup(ctx) {
    setStatsAdapter(ctx.storage);

    ctx.events.on("book:opened", ({ bookId }: { bookId: string }) => engine.startSession(bookId));
    ctx.events.on("book:closed", ({ bookId, chapterId }: { bookId: string; chapterId?: string }) =>
      engine.endSession(bookId, chapterId),
    );
    ctx.events.on("book:deleted", ({ bookId }: { bookId: string }) => engine.deleteStats(bookId));

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
};
