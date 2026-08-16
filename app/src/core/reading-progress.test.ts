import { describe, it, expect } from "vite-plus/test";
import type { PluginStorageAdapter } from "./plugin-runtime/types";
import type { InitConfig } from "./plugin-runtime/types";
import { createReadingProgressService } from "./reading-progress";

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

const baseConfig: InitConfig = {
  bookId: "book-1",
  chapterIndex: 0,
  mode: "pagination",
};

describe("reading-progress service", () => {
  it("saves pagination page for exact restore", async () => {
    const storage = new MemoryAdapter();
    const service = createReadingProgressService(storage);

    await service.saveSnapshot("book-1", {
      chapterId: "ch-2",
      chapterIndex: 1,
      mode: "pagination",
      page: 3,
      progress: 0.5,
    });

    const data = await service.get("book-1");
    expect(data).toMatchObject({
      chapterId: "ch-2",
      chapterIndex: 1,
      pageIndex: 3,
      progress: 0.5,
    });
  });

  it("applies exact page restore in pagination mode", async () => {
    const service = createReadingProgressService(new MemoryAdapter());

    const result = service.applyToConfig(baseConfig, {
      chapterId: "ch-2",
      chapterIndex: 2,
      pageIndex: 4,
      progress: 0.25,
    });

    expect(result).toEqual({
      ...baseConfig,
      chapterIndex: 2,
      initialPage: 4,
    });
  });

  it("applies unified progress restore in scroll mode", async () => {
    const service = createReadingProgressService(new MemoryAdapter());

    const result = service.applyToConfig(
      { ...baseConfig, mode: "scroll" },
      {
        chapterId: "ch-3",
        chapterIndex: 3,
        progress: 0.42,
        anchor: 120,
      },
    );

    expect(result).toEqual({
      ...baseConfig,
      mode: "scroll",
      chapterIndex: 3,
      initialPosition: { progress: 0.42, anchor: 120 },
    });
  });

  it("removes a book's progress", async () => {
    const storage = new MemoryAdapter();
    const service = createReadingProgressService(storage);

    await service.saveSnapshot("book-1", {
      chapterId: "ch-1",
      chapterIndex: 0,
      mode: "pagination",
      page: 1,
      progress: 0.1,
    });
    await service.remove("book-1");

    expect(await service.get("book-1")).toBeUndefined();
  });
});
