import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import type { PluginStorageAdapter } from "../../core/plugin-runtime/types";
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

let _onBookClosed: (() => void) | null = null;
export function setOnBookClosed(cb: (() => void) | null) {
  _onBookClosed = cb;
}

// Speed preference persisted in the plugin's own storage partition.
let _storage: PluginStorageAdapter | null = null;
export function loadIntervalSec(): Promise<number | undefined> {
  return _storage ? _storage.get<number>("intervalSec") : Promise.resolve(undefined);
}
export function saveIntervalSec(v: number): void {
  void _storage?.put("intervalSec", v);
}

export const autoReadPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "auto-read",
  name: "Auto Read",
  version: "1.0.0",
  setup(ctx) {
    _storage = ctx.storage;
    ctx.events.on("page:changed", () => {
      if (!_autoAdvancing) {
        _onUserPageChange?.();
      }
    });
    ctx.events.on("book:closed", () => {
      _onBookClosed?.();
    });
    ctx.ui.registerToolbarItem({ id: "auto-read", order: 10, component: AutoReadControls });
  },
};
