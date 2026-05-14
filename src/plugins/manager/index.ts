import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const managerPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "manager",
  name: "Manager",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    ctx.ui.registerModal("plugins", () => import("./PluginsPanel.vue"));
  },
};
