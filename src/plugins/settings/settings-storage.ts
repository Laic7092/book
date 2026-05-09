import { toRaw } from "vue";
import type { ReaderSettings } from "./types";
import { STORES, dbGet, dbPut, dbDelete } from "../../storage/db";

const SETTINGS_KEY = "reader-settings";

export async function getSettings(): Promise<ReaderSettings | null> {
  const stored = await dbGet<{ value: ReaderSettings }>(STORES.SETTINGS, SETTINGS_KEY);
  return stored?.value ?? null;
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  await dbPut(STORES.SETTINGS, {
    key: SETTINGS_KEY,
    value: toRaw(settings) as ReaderSettings,
  });
}

export async function resetSettings(): Promise<void> {
  await dbDelete(STORES.SETTINGS, SETTINGS_KEY);
}
