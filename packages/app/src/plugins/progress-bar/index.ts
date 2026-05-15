import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { ReaderSession } from "@book/reader-host";

let _session: (() => ReaderSession | null) | null = null;
export const getProgressBarSession = () => _session?.() ?? null;

export const corePlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "progress-bar",
  name: "progress-bar",
  version: "1.0.0",
  setup(ctx) {
    _session = ctx.readerSession;
    ctx.ui.registerOverlay("plugins", () => import("./ProgressBar.vue"));
  },
};
