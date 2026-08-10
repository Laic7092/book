import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import AutoReadControls from "./AutoReadControls.vue";

// Flag: true while auto-read is dispatching NEXT_PAGE (so page:changed events from
// auto-read itself are distinguishable from user-initiated page changes).
let _autoAdvancing = false;
export function setAutoAdvancing(v: boolean) {
  _autoAdvancing = v;
}

let _onUserPageChange: (() => void) | null = null;
export function setOnUserPageChange(cb: (() => void) | null) {
  _onUserPageChange = cb;
}

export const autoReadPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "auto-read",
  name: "Auto Read",
  version: "1.0.0",
  setup(ctx) {
    ctx.events.on("page:changed", () => {
      if (!_autoAdvancing) {
        _onUserPageChange?.();
      }
    });
    ctx.ui.registerToolbarItem({ id: "auto-read", order: 10, component: AutoReadControls });
  },
};
