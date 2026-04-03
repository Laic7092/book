// Settings storage module

import type { ReaderSettings } from "../core/types";
import { STORES, dbPut, dbGet } from "./db";

const SETTINGS_KEY = "reader-settings";

/**
 * Get reader settings
 */
export async function getSettings(): Promise<ReaderSettings | null> {
  const stored = await dbGet<{ value: ReaderSettings }>(STORES.SETTINGS, SETTINGS_KEY);
  return stored?.value ?? null;
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
  if (!current) {
    throw new Error("Settings not initialized");
  }
  const updated = { ...current, [key]: value };
  await saveSettings(updated);
  return updated;
}

/**
 * Reset stored settings (delete from storage)
 */
export async function resetSettings(): Promise<void> {
  const { dbDelete } = await import("./db");
  await dbDelete(STORES.SETTINGS, SETTINGS_KEY);
}
