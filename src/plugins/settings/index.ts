import { ref, watch } from "vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { createEntityStore, type EntityStore } from "../store-factory";
import type { ReaderSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  generateThemeCSS,
  generateBaseCSS,
  generateTypographyCSS,
} from "../../reader-engine/reader-styles";

// ── State ──

type SettingsEntity = { id: string } & ReaderSettings;
const ENTITY_ID = "reader-settings";

let _store: EntityStore<SettingsEntity> | null = null;
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

// ── CSS builder ──

const GEAR_ICON =
  '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>';

export const loadOn = "reader" as const;

function buildFullCSS(s: ReaderSettings): string {
  return generateBaseCSS() + generateThemeCSS(s.theme, s.contrast) + generateTypographyCSS(s);
}

// ── Plugin ──

export const settingsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "settings",
  name: "Settings",
  version: "1.0.0",
  async setup(ctx) {
    const store = createEntityStore<SettingsEntity>(ctx.storage, "setting");
    _store = store;

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

    function syncToHost() {
      ctx.ui.setTheme(s.value.theme);
      ctx.ui.injectIframeStyle("typography", buildFullCSS(s.value));
      const host = ctx.readerHost();
      if (host) {
        host.setReadingMode(s.value.readingMode ?? "pagination");
        host.setPageMargin(getEffectiveMargin());
      }
    }

    // Register listener BEFORE sync — reader may mount during the await
    ctx.events.on("reader:mounted", syncToHost);

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

    // Catch-up: if host already registered (reader mounted during init), sync now
    syncToHost();

    // Watch settings changes → drive core
    watch(
      () => s.value.theme,
      (theme) => {
        ctx.ui.setTheme(theme);
        ctx.ui.injectIframeStyle("typography", buildFullCSS(s.value));
      },
    );

    watch(
      () => s.value.readingMode,
      (mode) => {
        const host = ctx.readerHost();
        if (host) host.setReadingMode(mode ?? "pagination");
      },
    );

    watch(
      () => [s.value.margin, s.value.customTypography] as const,
      ([margin, enabled]) => {
        const host = ctx.readerHost();
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
      ],
      () => {
        ctx.ui.injectIframeStyle("typography", buildFullCSS(s.value));
      },
    );

    ctx.onCleanup(() => {
      _store = null;
    });
  },
};
