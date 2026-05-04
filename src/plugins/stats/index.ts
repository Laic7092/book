import StatsPanel from "./StatsPanel.vue";
import * as storage from "./storage";
import type { Plugin } from "../types";

// Re-export storage API
export { getStats, startSession, endSession } from "./storage";

export const statsPlugin: Plugin = {
  id: "stats",
  name: "Reading Statistics",
  version: "1.0.0",
  modalComponents: { stats: StatsPanel },
  footerActions: [
    {
      id: "stats",
      position: "menu",
      label: "Statistics",
      icon: '<path d="M12 20V10M18 20V4M6 20v-4" />',
      modal: "stats",
      order: 40,
    },
  ],
  sessionTracker: {
    startSession: storage.startSession,
    endSession: storage.endSession as any,
  },
  statsProvider: {
    getSummaryStats: storage.getSummaryStats,
    deleteStats: storage.deleteStats,
  },
};
