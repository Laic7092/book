import OpdsPanel from "./OpdsPanel.vue";
import type { Plugin, PluginContext } from "../types";
import { PLUGIN_BRAND } from "../types";

let pluginContext: PluginContext | null = null;

export function getPluginContext(): PluginContext | null {
  return pluginContext;
}

export const opdsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "opds",
  name: "OPDS Catalog",
  version: "0.1.0",
  setup(ctx) {
    pluginContext = ctx;
    ctx.ui.registerModal("opds", OpdsPanel);
    ctx.ui.registerBookshelfMenuAction({
      id: "opds",
      order: 50,
      label: "OPDS Catalog",
      icon: '<circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 7 3M12 22a10 10 0 0 1-7-3M2 12h20" stroke-width="1.5" />',
      modal: "opds",
    });
  },
  teardown() {
    pluginContext = null;
  },
};
