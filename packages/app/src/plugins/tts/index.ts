import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import TTSControls from "./TTSControls.vue";

export const ttsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "tts",
  name: "Text to Speech",
  version: "1.0.0",
  setup(ctx) {
    ctx.ui.registerToolbarItem({ id: "tts", order: 20, component: TTSControls });
  },
};
