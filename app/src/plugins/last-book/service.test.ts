import { describe, it, expect } from "vite-plus/test";
import type { PluginContext, PluginStorageAdapter } from "../../core/plugin-runtime/types";
import { createLastBookService, registerLastBook } from "./service";

class MemoryAdapter implements PluginStorageAdapter {
  protected map = new Map<string, unknown>();
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

/** Storage whose read can be deferred — simulates a slow IndexedDB open. */
class DeferredReadAdapter extends MemoryAdapter {
  private pending: ((v: string | undefined) => void) | null = null;

  override async get<T>(key: string): Promise<T | undefined> {
    if (key !== "lastBookId" || this.map.has(key)) {
      return super.get<T>(key);
    }
    return new Promise<T | undefined>((resolve) => {
      this.pending = resolve as (v: string | undefined) => void;
    });
  }

  /** Release the in-flight startup read. */
  resolveStartupRead(value: string | undefined): void {
    this.pending?.(value);
    this.pending = null;
  }
}

/** Minimal event bus — mirrors the core bus semantics (allSettled isolation). */
function createFakeEvents() {
  const handlers = new Map<string, Set<(payload: unknown) => unknown>>();
  return {
    on: (event: string, handler: (payload: unknown) => unknown) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
    emit: async (event: string, payload: unknown) => {
      await Promise.allSettled([...(handlers.get(event) ?? [])].map((h) => h(payload)));
    },
  };
}

function makeCtx(storage: PluginStorageAdapter) {
  const events = createFakeEvents();
  const navigated: string[] = [];
  const ctx = {
    storage,
    events,
    navigate: (url: string, replace?: boolean) =>
      navigated.push(url + (replace ? " (replace)" : "")),
  } as unknown as PluginContext;
  return { ctx, events, navigated };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

describe("registerLastBook", () => {
  it("navigates to the persisted book on startup", async () => {
    const storage = new MemoryAdapter();
    await storage.put("lastBookId", "book-1");
    const { ctx, navigated } = makeCtx(storage);

    registerLastBook(ctx);
    await flush();

    expect(navigated).toEqual(["/reader/book-1 (replace)"]);
  });

  it("does not navigate when no marker exists", async () => {
    const { ctx, navigated } = makeCtx(new MemoryAdapter());

    registerLastBook(ctx);
    await flush();

    expect(navigated).toEqual([]);
  });

  it("does not override a book the user opened while the startup read was in flight", async () => {
    const storage = new DeferredReadAdapter();
    const { ctx, events, navigated } = makeCtx(storage);

    registerLastBook(ctx);
    // User opens a book before the slow startup read resolves.
    await events.emit("book:opened", { bookId: "book-2" });
    // Startup read resolves late, pointing at an older book.
    storage.resolveStartupRead("book-1");
    await flush();

    expect(navigated).toEqual([]);
    // The user's book is the marker now.
    expect(await storage.get("lastBookId")).toBe("book-2");
  });

  it("persists on book:opened", async () => {
    const { ctx, events } = makeCtx(new MemoryAdapter());

    registerLastBook(ctx);
    await events.emit("book:opened", { bookId: "book-2" });

    expect(await ctx.storage.get("lastBookId")).toBe("book-2");
  });

  it("clears the marker on book:closed only when it still points at the closed book", async () => {
    const storage = new MemoryAdapter();
    await storage.put("lastBookId", "book-1");
    const { ctx, events } = makeCtx(storage);

    registerLastBook(ctx);
    await flush();
    await events.emit("book:closed", { bookId: "book-1" });

    expect(await storage.get("lastBookId")).toBeUndefined();
  });

  it("keeps the marker when book:closed races a newer book:opened", async () => {
    const storage = new MemoryAdapter();
    await storage.put("lastBookId", "book-1");
    const { ctx, events } = makeCtx(storage);

    registerLastBook(ctx);
    await flush();
    await events.emit("book:opened", { bookId: "book-2" });
    // Stale close of the previous book arrives afterwards.
    await events.emit("book:closed", { bookId: "book-1" });

    expect(await storage.get("lastBookId")).toBe("book-2");
  });

  it("ignores book:deleted of a book that is not the marker", async () => {
    const storage = new MemoryAdapter();
    await storage.put("lastBookId", "book-1");
    const { ctx, events } = makeCtx(storage);

    registerLastBook(ctx);
    await flush();
    await events.emit("book:deleted", { bookId: "book-9" });

    expect(await storage.get("lastBookId")).toBe("book-1");
  });

  it("clears the marker when the marked book is deleted", async () => {
    const storage = new MemoryAdapter();
    await storage.put("lastBookId", "book-1");
    const { ctx, events } = makeCtx(storage);

    registerLastBook(ctx);
    await flush();
    await events.emit("book:deleted", { bookId: "book-1" });

    expect(await storage.get("lastBookId")).toBeUndefined();
  });
});
