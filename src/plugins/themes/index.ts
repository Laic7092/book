import ReaderSettings from "./ReaderSettings.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { ReaderHost } from "../../core/reader-host";

let _readerHost: (() => ReaderHost | null) | null = null;

export function getThemesReaderHost(): ReaderHost | null {
  return _readerHost?.() ?? null;
}

export const themesPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "themes",
  name: "Themes",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    _readerHost = ctx.readerHost;
    ctx.ui.registerModal("settings", ReaderSettings);
  },
  teardown() {
    _readerHost = null;
  },
};
