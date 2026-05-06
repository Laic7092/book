import ProgressBar from "./ProgressBar.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { ReaderHost } from "../../core/reader-host";

export const loadOn = "reader" as const;

let _host: () => ReaderHost | null;
export const getReaderHost = () => _host();

export const corePlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "progress-bar",
  name: "progress-bar",
  version: "1.0.0",
  setup(ctx) {
    _host = ctx.readerHost;
    ctx.ui.registerOverlay("plugins", ProgressBar);
  },
};
