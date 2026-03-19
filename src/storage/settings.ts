// Settings storage module

import type { ReaderSettings } from "../core/types";
import { STORES, dbPut, dbGet } from "./db";

const SETTINGS_KEY = "reader-settings";

/**
 * Get reader settings, with defaults
 */
export async function getSettings(): Promise<ReaderSettings> {
  const { DEFAULT_SETTINGS } = await import("../core/types");
  const stored = await dbGet<{ value: ReaderSettings }>(STORES.SETTINGS, SETTINGS_KEY);
  return stored?.value || DEFAULT_SETTINGS;
}

/**
 * Save reader settings
 */
export async function saveSettings(settings: ReaderSettings): Promise<void> {
  await dbPut(STORES.SETTINGS, {
    key: SETTINGS_KEY,
    value: settings,
  });
}

/**
 * Update a single setting
 */
export async function updateSetting<K extends keyof ReaderSettings>(
  key: K,
  value: ReaderSettings[K],
): Promise<ReaderSettings> {
  const current = await getSettings();
  const updated = { ...current, [key]: value };
  await saveSettings(updated);
  return updated;
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<ReaderSettings> {
  const { DEFAULT_SETTINGS } = await import("../core/types");
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}
