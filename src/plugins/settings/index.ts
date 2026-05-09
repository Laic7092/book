import { watch } from "vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { createSettingsState, type SettingsState } from "./api";
import {
  generateThemeCSS,
  generateBaseCSS,
  generateTypographyCSS,
} from "../../reader-engine/reader-styles";
import SettingsPanel from "./SettingsPanel.vue";
import TypographyPanel from "./TypographyPanel.vue";

let settingsState: SettingsState | null = null;

export function getSettingsState(): SettingsState | null {
  return settingsState;
}

const GEAR_ICON =
  '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>';

export const loadOn = "reader" as const;

function buildFullCSS(settings: SettingsState["settings"]["value"]): string {
  return (
    generateBaseCSS() +
    generateThemeCSS(settings.theme, settings.contrast) +
    generateTypographyCSS(settings)
  );
}

export const settingsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "settings",
  name: "Settings",
  version: "1.0.0",
  async setup(ctx) {
    const state = createSettingsState(ctx.events);

    function syncToHost() {
      const s = state.settings.value;
      ctx.css.setTheme(s.theme);
      ctx.css.injectIframeStyle("typography", buildFullCSS(s));
      const host = ctx.readerHost();
      if (host) {
        host.setScrollMode(s.scrollMode ?? "pagination");
        host.setPageMargin(s.margin);
      }
    }

    // Register listener BEFORE async init — reader may mount during the await
    ctx.events.on("reader:mounted", syncToHost);

    await state.init();
    settingsState = state;
    const s = state.settings;

    // Content transformer for chapter typography
    ctx.registerContentTransformer({
      id: "settings-typography",
      priority: 50,
      transform(html) {
        return html;
      },
    });

    // Register modals
    ctx.ui.registerModal("settings", SettingsPanel);
    ctx.ui.registerModal("typographySettings", TypographyPanel);

    // Register header gear icon
    ctx.ui.registerHeaderAction({
      id: "settings",
      order: 0,
      icon: GEAR_ICON,
      label: "Settings",
      onClick: () => ctx.openModal("settings"),
    });

    // Catch-up: if host already registered (reader mounted during init), sync now
    syncToHost();

    // Watch settings changes → drive core
    watch(
      () => s.value.theme,
      (theme) => {
        ctx.css.setTheme(theme);
        ctx.css.injectIframeStyle("typography", buildFullCSS(s.value));
      },
    );

    watch(
      () => s.value.scrollMode,
      (mode) => {
        const host = ctx.readerHost();
        if (host) host.setScrollMode(mode ?? "pagination");
      },
    );

    // Margin → sync pagination column calculation
    watch(
      () => s.value.margin,
      (margin) => {
        const host = ctx.readerHost();
        if (host) host.setPageMargin(margin);
      },
    );

    // Typography changes → re-inject iframe CSS
    watch(
      () => [
        s.value.fontSize,
        s.value.fontFamily,
        s.value.lineHeight,
        s.value.letterSpacing,
        s.value.textAlign,
        s.value.paragraphSpacing,
        s.value.customTypography,
        s.value.margin,
        s.value.contrast,
      ],
      () => {
        ctx.css.injectIframeStyle("typography", buildFullCSS(s.value));
      },
    );

    ctx.onCleanup(() => {
      settingsState = null;
    });
  },
};
