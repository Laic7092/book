import PluginsPanel from "./PluginsPanel.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const loadOn = "reader" as const;

export const corePlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "core",
  name: "Core",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    ctx.ui.registerModal("plugins", PluginsPanel);
  },
};
