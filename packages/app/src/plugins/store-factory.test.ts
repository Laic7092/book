import { describe, it, expect, beforeEach } from "vite-plus/test";
import { createEntityStore, createSingletonStore } from "./store-factory";
import type { PluginStorageAdapter } from "./types";

/**
 * In-memory PluginStorageAdapter. Mirrors the IndexedDB adapter's semantics:
 * keys are unique, put overwrites, getAll returns every stored value.
 */
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

interface Item {
  id: string;
  label: string;
}

let storage: MemoryAdapter;

beforeEach(() => {
  storage = new MemoryAdapter();
});

describe("createEntityStore", () => {
  it("loads pre-existing items from storage", async () => {
    await storage.put("bookmark:a", { id: "a", label: "first" });
    const store = createEntityStore<Item>(storage, "bookmark");
    await store.whenLoaded();
    expect(store.items.value).toHaveLength(1);
    expect(store.getById("a")?.label).toBe("first");
  });

  it("add appends and persists an item", async () => {
    const store = createEntityStore<Item>(storage, "bookmark");
    await store.whenLoaded();
    await store.add({ id: "b", label: "second" });

    expect(store.getById("b")?.label).toBe("second");
    expect(store.items.value).toHaveLength(1);
    expect(await storage.get<Item>("bookmark:b")).toMatchObject({ id: "b" });
  });

  it("add with an existing key replaces the cached item instead of duplicating", async () => {
    const store = createEntityStore<Item>(storage, "bookmark");
    await store.whenLoaded();

    await store.add({ id: "b", label: "old" });
    await store.add({ id: "b", label: "new" });

    expect(store.getById("b")?.label).toBe("new");
    expect(store.items.value).toHaveLength(1);
    expect(await storage.get<Item>("bookmark:b")).toMatchObject({ label: "new" });
  });

  it("remove deletes from cache and storage", async () => {
    const store = createEntityStore<Item>(storage, "bookmark");
    await store.whenLoaded();
    await store.add({ id: "b", label: "second" });

    await store.remove("b");

    expect(store.getById("b")).toBeUndefined();
    expect(store.items.value).toHaveLength(0);
    expect(await storage.get<Item>("bookmark:b")).toBeUndefined();
  });

  it("update merges a partial patch and persists", async () => {
    const store = createEntityStore<Item>(storage, "bookmark");
    await store.whenLoaded();
    await store.add({ id: "b", label: "old" });

    const merged = await store.update("b", { label: "patched" });

    expect(merged).toMatchObject({ id: "b", label: "patched" });
    expect(store.getById("b")?.label).toBe("patched");
    expect(await storage.get<Item>("bookmark:b")).toMatchObject({ label: "patched" });
  });

  it("update throws when the item does not exist", async () => {
    const store = createEntityStore<Item>(storage, "bookmark");
    await store.whenLoaded();
    await expect(store.update("nope", { label: "x" })).rejects.toThrow();
  });

  it("supports a custom key extractor", async () => {
    const store = createEntityStore<{ id: string; url: string }>(storage, "src", (s) => s.url);
    await store.whenLoaded();
    await store.add({ id: "x", url: "http://a" });
    await store.add({ id: "y", url: "http://a" });

    expect(store.getById("http://a")?.id).toBe("y");
    expect(store.items.value).toHaveLength(1);
    expect(await storage.get<{ id: string; url: string }>("src:http://a")).toMatchObject({
      id: "y",
    });
  });
});

describe("createSingletonStore", () => {
  it("loads, saves and clears a scoped value", async () => {
    const store = createSingletonStore<{ font: string }>(storage, "prefs");
    await store.load("scope1");
    expect(store.value.value).toBeNull();

    await store.save({ font: "serif" });
    expect(store.value.value).toMatchObject({ font: "serif" });

    await store.load("scope2");
    expect(store.value.value).toBeNull();

    await store.load("scope1");
    expect(store.value.value).toMatchObject({ font: "serif" });

    await store.clear();
    expect(store.value.value).toBeNull();
  });
});
