import { describe, it, expect } from "vite-plus/test";
import type { PluginStorageAdapter } from "./plugin-runtime/types";
import { createLastBookService } from "./last-book";

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

describe("last-book service", () => {
  it("stores, reads and clears the last opened book", async () => {
    const storage = new MemoryAdapter();
    const service = createLastBookService(storage);

    expect(await service.get()).toBeUndefined();

    await service.set("book-1");
    expect(await service.get()).toBe("book-1");

    await service.clear();
    expect(await service.get()).toBeUndefined();
  });
});
