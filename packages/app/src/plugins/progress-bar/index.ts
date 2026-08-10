import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";

export const corePlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "progress-bar",
  name: "progress-bar",
  version: "1.0.0",
  setup(ctx) {
    ctx.ui.registerOverlay("plugins", () => import("./ProgressBar.vue"));
  },
};
