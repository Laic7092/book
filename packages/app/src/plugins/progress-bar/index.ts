import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const corePlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "progress-bar",
  name: "progress-bar",
  version: "1.0.0",
  setup(ctx) {
    ctx.ui.registerOverlay("plugins", () => import("./ProgressBar.vue"));
  },
};
