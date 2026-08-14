import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";

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
