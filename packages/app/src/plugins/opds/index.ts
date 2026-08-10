import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import type { ServerClient } from "../../utils/api";

let opdsServer: ServerClient | null = null;

export function getOpdsServer(): ServerClient | null {
  return opdsServer;
}

export const opdsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "opds",
  name: "OPDS Catalog",
  version: "0.1.0",
  setup(ctx) {
    opdsServer = ctx.server;
    ctx.ui.registerModal("opds", () => import("./OpdsPanel.vue"));
    ctx.ui.registerBookshelfMenuAction({
      id: "opds",
      order: 50,
      label: "OPDS Catalog",
      icon: '<circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 7 3M12 22a10 10 0 0 1-7-3M2 12h20" stroke-width="1.5" />',
      modal: "opds",
    });
  },
};
