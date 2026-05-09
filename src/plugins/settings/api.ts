import { ref } from "vue";
import type { ReaderSettings } from "./types";
import type { IEventBus, PluginEventMap } from "../types";
import { DEFAULT_SETTINGS } from "./defaults";
import * as storage from "./settings-storage";

export function createSettingsState(events?: IEventBus<PluginEventMap>) {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS });
  const isInitialized = ref(false);

  return {
    settings,
    isInitialized,

    async init() {
      if (isInitialized.value) return;
      try {
        const stored = await storage.getSettings();
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
        await storage.saveSettings(settings.value);
      } catch (err) {
        console.error("[Settings] Failed to save settings:", err);
      }
      if (events) {
        void events.emit("settings:changed", { changes: updates });
      }
    },

    async reset() {
      settings.value = { ...DEFAULT_SETTINGS };
      await storage.saveSettings(settings.value);
    },
  };
}

export type SettingsState = ReturnType<typeof createSettingsState>;
