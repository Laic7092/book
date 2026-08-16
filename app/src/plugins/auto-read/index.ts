import { defineAsyncComponent } from "vue";
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import type { PluginStorageAdapter } from "../../core/plugin-runtime/types";

// Flag: true while auto-read is dispatching NEXT_PAGE (so page:changed events from
// auto-read itself are distinguishable from user-initiated page changes).
let _autoAdvancing = false;
export function setAutoAdvancing(v: boolean) {
  _autoAdvancing = v;
}
export function isAutoAdvancing(): boolean {
  return _autoAdvancing;
}

let _onUserPageChange: (() => void) | null = null;
export function setOnUserPageChange(cb: (() => void) | null) {
  _onUserPageChange = cb;
}

let _onBookClosed: (() => void) | null = null;
export function setOnBookClosed(cb: (() => void) | null) {
  _onBookClosed = cb;
}

// ── Settings (persisted in the plugin's own storage partition) ──

export interface AutoReadSettings {
  /** Seconds per page turn (pagination) / per screen (scroll). */
  intervalSec: number;
  /** What to do at the end of a chapter while playing. */
  chapterEnd: "auto" | "stop";
  /** Sleep timer in minutes; 0 = off. */
  sleepMinutes: number;
  /** Scroll speed multiplier for scroll mode. */
  scrollSpeed: "slow" | "normal" | "fast";
}

export const DEFAULT_AUTO_READ_SETTINGS: AutoReadSettings = {
  intervalSec: 5,
  chapterEnd: "auto",
  sleepMinutes: 0,
  scrollSpeed: "normal",
};

const SETTINGS_KEY = "settings";
let _storage: PluginStorageAdapter | null = null;
export function loadAutoReadSettings(): Promise<AutoReadSettings | undefined> {
  return _storage ? _storage.get<AutoReadSettings>(SETTINGS_KEY) : Promise.resolve(undefined);
}
export function saveAutoReadSettings(settings: AutoReadSettings): void {
  void _storage?.put(SETTINGS_KEY, settings);
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
    // Lazy: keep the toolbar component out of the base bundle; loaded on the
    // reader scene and unloaded on plugin disable (contract §五.5).
    ctx.ui.registerToolbarItem({
      id: "auto-read",
      order: 10,
      component: defineAsyncComponent(() => import("./AutoReadControls.vue")),
    });
  },
};
