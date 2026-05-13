import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { ReaderSession } from "../../reader-engine/session";
import TTSControls from "./TTSControls.vue";

let _session: (() => ReaderSession | null) | null = null;

export function getTTSSession(): ReaderSession | null {
  return _session?.() ?? null;
}

export const ttsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "tts",
  name: "Text to Speech",
  version: "1.0.0",
  setup(ctx) {
    _session = ctx.readerSession;
    ctx.ui.registerToolbarItem({ id: "tts", order: 20, component: TTSControls });
  },
  teardown() {
    _session = null;
  },
};
