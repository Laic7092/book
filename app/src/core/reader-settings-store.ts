import { ref, watch, type Ref } from "vue";
import type { PluginContext, PluginStorageAdapter } from "./plugin-runtime/types";
import { createEntityStore, type EntityStore } from "./plugin-runtime/store-factory";
import type { CustomFontFace, ReaderSettings } from "./reader-settings";
import { DEFAULT_SETTINGS } from "./reader-settings";
import { buildReaderFullCSS } from "../utils/reader-css";
import { normalizeReaderMode } from "../utils/reader-mode";

export type SettingsEntity = { id: string } & ReaderSettings;
const ENTITY_ID = "reader-settings";

export interface ReaderSettingsState {
  store: EntityStore<SettingsEntity>;
  fontStore: EntityStore<CustomFontFace>;
  settings: Ref<ReaderSettings>;
  update: (updates: Partial<ReaderSettings>) => Promise<void>;
}

let activeState: ReaderSettingsState | null = null;

export function getReaderSettingsState(): ReaderSettingsState | null {
  return activeState;
}

export function getReaderFontStore(): EntityStore<CustomFontFace> | null {
  return activeState?.fontStore ?? null;
}

function createReaderSettingsState(storage: PluginStorageAdapter): ReaderSettingsState {
  const store = createEntityStore<SettingsEntity>(storage, "setting");
  const fontStore = createEntityStore<CustomFontFace>(storage, "font");
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS });

  const update = async (updates: Partial<ReaderSettings>): Promise<void> => {
    settings.value = { ...settings.value, ...updates };
    await store.add({ id: ENTITY_ID, ...settings.value });
  };

  return { store, fontStore, settings, update };
}

async function waitForLoaded(store: EntityStore<SettingsEntity>): Promise<void> {
  if (store.loaded.value) return;
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

/**
 * Owns reader-settings state, persistence, theme/typography application and
 * reader init hooks. The settings plugin keeps only UI registration on top.
 */
export async function registerReaderSettings(
  ctx: PluginContext,
  onTeardown: (fn: () => void | Promise<void>) => void,
): Promise<ReaderSettingsState> {
  const state = createReaderSettingsState(ctx.storage);
  activeState = state;
  const { store, fontStore, settings: s, update } = state;

  await waitForLoaded(store);

  // Restore saved settings or initialize with defaults.
  const cached = store.getById(ENTITY_ID);
  if (cached) {
    const { id: _, ...rest } = cached;
    s.value = {
      ...DEFAULT_SETTINGS,
      ...rest,
      readingMode: normalizeReaderMode(rest.readingMode as string | undefined),
    };
  } else {
    await update({ ...DEFAULT_SETTINGS });
    s.value = { ...DEFAULT_SETTINGS };
  }

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

  function refreshIframeStyle() {
    const fonts = [...fontStore.items.value];
    ctx.ui.injectIframeStyle("typography", buildReaderFullCSS(s.value, fonts));
  }

  const loadSetting = (config: any) => {
    applyTheme(s.value.theme);
    refreshIframeStyle();
    const host = ctx.readerSession();
    if (host) host.setPageMargin(getEffectiveMargin());
    return { ...config, mode: s.value.readingMode ?? "pagination" };
  };

  loadSetting({});

  // Apply saved settings before reader initializes (host + iframe exist, init() not called yet)
  ctx.hooks.filter("reader:init-config", loadSetting);

  ctx.registerContentTransformer({
    id: "settings-typography",
    priority: 50,
    transform(html) {
      return html;
    },
  });

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
      if (host) host.setMode(mode ?? "pagination");
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
    activeState = null;
    try {
      localStorage.removeItem("reader-bg");
    } catch {
      /* localStorage may be unavailable */
    }
  });

  return state;
}
