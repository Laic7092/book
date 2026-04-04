// Settings Store - Manages reader settings state

import { defineStore } from "pinia";
import { toRaw } from "vue";
import type { ReaderSettings } from "../core/types";
import * as settingsStorage from "../storage/settings";

/**
 * Default reader settings - single source of truth
 */
export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 20,
  fontFamily: "Literata, Georgia, serif",
  lineHeight: 1.6,
  theme: "sepia",
  margin: 24,
  letterSpacing: 0,
  paragraphSpacing: 1.2,
  textAlign: "left",
  contrast: "normal",
  scrollMode: "pagination",
  paginationAnimation: "slide",
  customTypography: false,
};

export interface SettingsState {
  settings: ReaderSettings;
  isInitialized: boolean;
}

export const useSettingsStore = defineStore("settings", {
  state: (): SettingsState => ({
    settings: { ...DEFAULT_SETTINGS },
    isInitialized: false,
  }),

  getters: {
    theme: (state) => state.settings.theme,
    fontSize: (state) => state.settings.fontSize,
    fontFamily: (state) => state.settings.fontFamily,
    lineHeight: (state) => state.settings.lineHeight,
    margin: (state) => state.settings.margin,
    scrollMode: (state) => state.settings.scrollMode,
  },

  actions: {
    /**
     * Initialize settings from storage
     */
    async init(): Promise<void> {
      if (this.isInitialized) return;

      try {
        const stored = await settingsStorage.getSettings();
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
      } catch {
        // Use defaults on error
      }

      this.isInitialized = true;
    },

    /**
     * Update settings (partial update)
     */
    async updateSettings(updates: Partial<ReaderSettings>): Promise<ReaderSettings> {
      this.settings = { ...this.settings, ...updates };
      await settingsStorage.saveSettings(toRaw(this.settings));
      return this.settings;
    },

    /**
     * Update a single setting key
     */
    async updateSetting<K extends keyof ReaderSettings>(
      key: K,
      value: ReaderSettings[K],
    ): Promise<void> {
      this.settings[key] = value;
      await settingsStorage.saveSettings(toRaw(this.settings));
    },

    /**
     * Reset settings to defaults
     */
    async resetSettings(): Promise<void> {
      this.settings = { ...DEFAULT_SETTINGS };
      await settingsStorage.saveSettings(toRaw(this.settings));
    },
  },
});
