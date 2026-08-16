import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";

// Core plugin: the plugin manager entry point. Thin by design — the panel UI
// (PluginsPanel.vue) is lazily loaded via the modal registration below.
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
