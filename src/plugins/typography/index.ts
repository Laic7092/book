import TypographySettings from "./TypographySettings.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { ReaderHost } from "../../core/reader-host";

let _readerHost: (() => ReaderHost | null) | null = null;

export function getTypographyReaderHost(): ReaderHost | null {
  return _readerHost?.() ?? null;
}

export const typographyPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "typography",
  name: "Typography",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    _readerHost = ctx.readerHost;
    ctx.ui.registerModal("typographySettings", TypographySettings);
  },
  teardown() {
    _readerHost = null;
  },
};
