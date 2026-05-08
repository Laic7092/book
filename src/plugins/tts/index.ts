import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { ReaderHost } from "../../core/reader-host";
import TTSControls from "./TTSControls.vue";

let _readerHost: (() => ReaderHost | null) | null = null;

export function getTTSReaderHost(): ReaderHost | null {
  return _readerHost?.() ?? null;
}

export const ttsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "tts",
  name: "Text to Speech",
  version: "1.0.0",
  setup(ctx) {
    _readerHost = ctx.readerHost;
    ctx.ui.registerToolbarItem({ id: "tts", order: 20, component: TTSControls });
  },
  teardown() {
    _readerHost = null;
  },
};
