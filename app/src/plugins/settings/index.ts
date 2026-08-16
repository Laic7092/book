import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import {
  getReaderSettingsState,
  getReaderFontStore,
  registerReaderSettings,
} from "../../core/reader-settings-store";

export function getSettingsState() {
  return getReaderSettingsState();
}

export function getFontStore() {
  return getReaderFontStore();
}

const GEAR_ICON =
  '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>';

export const settingsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "settings",
  name: "Settings",
  version: "1.0.0",
  core: true,
  async setup(ctx, { onTeardown }) {
    await registerReaderSettings(ctx, onTeardown);

    ctx.ui.registerModal("settings", () => import("./SettingsPanel.vue"));
    ctx.ui.registerModal("typographySettings", () => import("./TypographyPanel.vue"));

    ctx.ui.registerHeaderAction({
      id: "settings",
      order: 0,
      icon: GEAR_ICON,
      label: "Settings",
      onClick: () => ctx.ui.openModal("settings"),
    });
  },
};
