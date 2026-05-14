import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import AutoReadControls from "./AutoReadControls.vue";
import type { ReaderSession } from "@book/reader-core";

export const loadOn = "reader" as const;

let _session: (() => ReaderSession | null) | null = null;

export const getAutoReadSession = () => _session?.() ?? null;

// Flag: true while auto-read is dispatching NEXT_PAGE (so page:changed events from
// auto-read itself are distinguishable from user-initiated page changes).
export let _autoAdvancing = false;
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
    _session = ctx.readerSession;
    ctx.events.on("page:changed", () => {
      if (!_autoAdvancing) {
        _onUserPageChange?.();
      }
    });
    ctx.ui.registerToolbarItem({ id: "auto-read", order: 10, component: AutoReadControls });
  },
};
