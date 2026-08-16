import { defineAsyncComponent } from "vue";
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";

export const ttsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "tts",
  name: "Text to Speech",
  version: "1.0.0",
  setup(ctx) {
    // Lazy: toolbar items render on the reader scene only; a static import
    // would ship TTSControls (and its speech-synthesis logic) into the base
    // bundle and survive plugin disable (contract §五.5 — disabled = unloaded).
    ctx.ui.registerToolbarItem({
      id: "tts",
      order: 20,
      component: defineAsyncComponent(() => import("./TTSControls.vue")),
    });
  },
};
