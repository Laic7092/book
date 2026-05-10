import { ref } from "vue";
import type { ReaderSettings } from "./types";
import type { IEventBus, PluginEventMap } from "../types";
import type { PluginStorageAdapter } from "../types";
import { DEFAULT_SETTINGS } from "./defaults";

const SETTINGS_KEY = "reader-settings";

export function createSettingsState(
  storage: PluginStorageAdapter,
  events?: IEventBus<PluginEventMap>,
) {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS });
  const isInitialized = ref(false);

  return {
    settings,
    isInitialized,

    async init() {
      if (isInitialized.value) return;
      try {
        const stored = await storage.get<ReaderSettings>(SETTINGS_KEY);
        if (stored) {
          settings.value = { ...DEFAULT_SETTINGS, ...stored };
        }
      } catch (err) {
        console.error("[Settings] Failed to load settings, using defaults:", err);
      }
      isInitialized.value = true;
    },

    async update(updates: Partial<ReaderSettings>) {
      settings.value = { ...settings.value, ...updates };
      try {
        await storage.put(SETTINGS_KEY, settings.value, Date.now());
      } catch (err) {
        console.error("[Settings] Failed to save settings:", err);
      }
      if (events) {
        void events.emit("settings:changed", { changes: updates });
      }
    },

    async reset() {
      settings.value = { ...DEFAULT_SETTINGS };
      await storage.put(SETTINGS_KEY, settings.value, Date.now());
    },
  };
}

export type SettingsState = ReturnType<typeof createSettingsState>;
