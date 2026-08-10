import { ref, watch } from "vue";
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import { createEntityStore, type EntityStore } from "../../core/plugin-runtime/store-factory";
import type { CustomFontFace } from "./types";
import type { ReaderSettings } from "../../core/reader-settings";
import { DEFAULT_SETTINGS } from "./defaults";
import { generateThemeCSS, generateTypographyCSS } from "../../utils/reader-css";

// ── State ──

type SettingsEntity = { id: string } & ReaderSettings;
const ENTITY_ID = "reader-settings";

let _store: EntityStore<SettingsEntity> | null = null;
let _fontStore: EntityStore<CustomFontFace> | null = null;
const _settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS });

export function getSettingsState() {
  if (!_store) return null;
  return {
    settings: _settings,
    async update(updates: Partial<ReaderSettings>) {
      _settings.value = { ..._settings.value, ...updates };
      await _store!.add({ id: ENTITY_ID, ..._settings.value });
    },
  };
}

export function getFontStore() {
  return _fontStore;
}

export interface CustomColors {
  bg?: string;
  text?: string;
  bgImage?: string;
  bgImageRepeat?: string;
  bgImageSize?: string;
}

export function buildCustomColors(s: {
  useCustomColors?: boolean;
  customBgColor?: string;
  customTextColor?: string;
  customBgImage?: string;
  customBgImageRepeat?: string;
  customBgImageSize?: string;
}): CustomColors | undefined {
  if (!s.useCustomColors && !s.customBgImage) return undefined;
  return {
    bg: s.useCustomColors ? s.customBgColor : undefined,
    text: s.useCustomColors ? s.customTextColor : undefined,
    bgImage: s.customBgImage,
    bgImageRepeat: s.customBgImageRepeat,
    bgImageSize: s.customBgImageSize,
  };
}

function buildFontFacesCSS(fonts: CustomFontFace[]): string {
  return fonts
    .map(
      (f) => `
@font-face {
  font-family: "${f.name}";
  src: url("${f.data}") format("${f.format}");
  font-display: swap;
}`,
    )
    .join("\n");
}

function getActiveCustomFont(
  fonts: CustomFontFace[],
  settings: ReaderSettings,
): CustomFontFace | undefined {
  if (!settings.customFontFamily) return undefined;
  return fonts.find((f) => f.name === settings.customFontFamily);
}

// ── CSS builder ──

const GEAR_ICON =
  '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>';

function buildFullCSS(s: ReaderSettings, fonts?: CustomFontFace[]): string {
  const customColors = buildCustomColors(s);
  const themeCSS =
    s.theme || s.useCustomColors || s.customBgImage
      ? generateThemeCSS(s.theme, s.contrast, customColors)
      : "";
  let fontFacesCSS = "";
  const activeFont = fonts ? getActiveCustomFont(fonts, s) : undefined;
  if (activeFont) {
    fontFacesCSS = buildFontFacesCSS([activeFont]);
  }
  // Base layout CSS is owned by reader-engine (injected into the iframe);
  // this style only carries theme + typography increments.
  return fontFacesCSS + themeCSS + generateTypographyCSS(s);
}

// ── Plugin ──

export const settingsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "settings",
  name: "Settings",
  version: "1.0.0",
  async setup(ctx, { onTeardown }) {
    const store = createEntityStore<SettingsEntity>(ctx.storage, "setting");
    _store = store;

    const fontStore = createEntityStore<CustomFontFace>(ctx.storage, "font");
    _fontStore = fontStore;

    // Wait for initial cache load from IndexedDB
    if (!store.loaded.value) {
      await new Promise<void>((resolve) => {
        const stop = watch(
          () => store.loaded.value,
          (loaded) => {
            if (loaded) {
              stop();
              resolve();
            }
          },
        );
      });
    }

    // Restore saved settings or initialize with defaults
    const cached = store.getById(ENTITY_ID);
    if (cached) {
      const { id: _, ...rest } = cached;
      _settings.value = { ...DEFAULT_SETTINGS, ...rest };
    } else {
      await store.add({ id: ENTITY_ID, ...DEFAULT_SETTINGS });
      _settings.value = { ...DEFAULT_SETTINGS };
    }

    const s = _settings;

    function getEffectiveMargin() {
      return s.value.customTypography ? s.value.margin : DEFAULT_SETTINGS.margin;
    }

    function applyTheme(theme: string | null) {
      if (theme) {
        ctx.ui.setTheme(theme);
        try {
          localStorage.setItem("reader-bg", ctx.themes.get(theme).chrome.bg);
        } catch {
          /* localStorage may be unavailable */
        }
      } else {
        ctx.ui.clearTheme();
        try {
          localStorage.removeItem("reader-bg");
        } catch {
          /* localStorage may be unavailable */
        }
      }
    }

    // Content transformer for chapter typography
    ctx.registerContentTransformer({
      id: "settings-typography",
      priority: 50,
      transform(html) {
        return html;
      },
    });

    // Register modals
    ctx.ui.registerModal("settings", () => import("./SettingsPanel.vue"));
    ctx.ui.registerModal("typographySettings", () => import("./TypographyPanel.vue"));

    // Register header gear icon
    ctx.ui.registerHeaderAction({
      id: "settings",
      order: 0,
      icon: GEAR_ICON,
      label: "Settings",
      onClick: () => ctx.ui.openModal("settings"),
    });

    function refreshIframeStyle() {
      const fonts = [...fontStore.items.value];
      ctx.ui.injectIframeStyle("typography", buildFullCSS(s.value, fonts));
    }

    const loadSetting = (config: any) => {
      applyTheme(s.value.theme);
      refreshIframeStyle();
      const host = ctx.readerSession();
      if (host) host.setPageMargin(getEffectiveMargin());
      if (s.value.readingMode === "vertical") {
        return { ...config, mode: "scroll" };
      }
      return config;
    };

    loadSetting({});

    // Apply saved settings before reader initializes (host + iframe exist, init() not called yet)
    ctx.hooks.filter("reader:init-config", loadSetting);

    // Watch settings changes → drive core
    watch(
      () =>
        [
          s.value.theme,
          s.value.useCustomColors,
          s.value.customBgColor,
          s.value.customTextColor,
          s.value.customBgImage,
          s.value.customBgImageRepeat,
          s.value.customBgImageSize,
        ] as const,
      () => {
        applyTheme(s.value.theme);
        refreshIframeStyle();
      },
    );

    watch(
      () => s.value.readingMode,
      (mode) => {
        const host = ctx.readerSession();
        if (host)
          host.dispatch({
            type: "SET_MODE",
            mode: (mode ?? "pagination") === "vertical" ? "scroll" : "pagination",
          });
      },
    );

    watch(
      () => [s.value.margin, s.value.customTypography] as const,
      ([margin, enabled]) => {
        const host = ctx.readerSession();
        if (host) host.setPageMargin(enabled ? margin : DEFAULT_SETTINGS.margin);
      },
    );

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
        s.value.customFontFamily,
      ],
      () => {
        refreshIframeStyle();
      },
    );

    // Watch font store changes → refresh iframe
    watch(
      () => fontStore.items.value,
      () => {
        refreshIframeStyle();
      },
      { deep: true },
    );

    onTeardown(() => {
      _store = null;
      _fontStore = null;
      try {
        localStorage.removeItem("reader-bg");
      } catch {
        /* localStorage may be unavailable */
      }
    });
  },
};
