import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import AutoReadControls from "./AutoReadControls.vue";
import type { ReaderHost } from "../../core/reader-host";

export const loadOn = "reader" as const;

let _host: () => ReaderHost | null;

export const getReaderHost = () => _host();

export const autoReadPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "auto-read",
  name: "Auto Read",
  version: "1.0.0",
  setup(ctx) {
    _host = ctx.readerHost;
    ctx.ui.registerToolbarItem({ id: "auto-read", order: 10, component: AutoReadControls });
  },
};
