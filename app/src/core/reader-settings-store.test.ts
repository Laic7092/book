import { describe, it, expect, vi } from "vite-plus/test";
import type { PluginStorageAdapter, PluginContext } from "./plugin-runtime/types";
import { DEFAULT_SETTINGS, type ReaderSettings } from "./reader-settings";
import { themeRegistry } from "./theme-registry";
import { registerReaderSettings, getReaderSettingsState } from "./reader-settings-store";

class MemoryAdapter implements PluginStorageAdapter {
  private map = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }
  async getAll<T>(): Promise<T[]> {
    return [...this.map.values()] as T[];
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
}

function makeContext(storage: PluginStorageAdapter) {
  return {
    storage,
    ui: {
      setTheme: vi.fn(),
      clearTheme: vi.fn(),
      injectIframeStyle: vi.fn(),
    },
    themes: themeRegistry,
    readerSession: () => null,
    hooks: {
      filter: vi.fn(() => () => {}),
    },
    registerContentTransformer: vi.fn(),
  } as unknown as PluginContext;
}

describe("reader-settings-store", () => {
  it("initializes default settings into plugin storage", async () => {
    const storage = new MemoryAdapter();
    const ctx = makeContext(storage);

    await registerReaderSettings(ctx, vi.fn());

    const saved = await storage.get<{ id: string } & ReaderSettings>("setting:reader-settings");
    expect(saved?.id).toBe("reader-settings");
    expect(saved?.readingMode).toBe(DEFAULT_SETTINGS.readingMode);
  });

  it("update() persists and exposes reactive settings", async () => {
    const storage = new MemoryAdapter();
    const ctx = makeContext(storage);

    await registerReaderSettings(ctx, vi.fn());

    const state = getReaderSettingsState();
    expect(state).not.toBeNull();
    await state!.update({ theme: "dark" });

    expect(state!.settings.value.theme).toBe("dark");
    const saved = await storage.get<{ id: string } & ReaderSettings>("setting:reader-settings");
    expect(saved?.theme).toBe("dark");
  });
});
