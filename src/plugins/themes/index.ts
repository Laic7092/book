import ReaderSettings from "./ReaderSettings.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const themesPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "themes",
  name: "Themes",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    ctx.ui.registerModal("settings", ReaderSettings);
  },
};
