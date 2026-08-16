import type { PluginStorageAdapter, PluginContext } from "../../core/plugin-runtime/types";

/**
 * Last-book restore (plugin-owned).
 *
 * On startup we return to the last opened book; on book open/close/delete we
 * keep that marker in sync. Everything here is domain logic of the last-book
 * plugin — the shared infrastructure it leans on (events / storage / navigate)
 * lives in core and arrives via PluginContext. Disabling the plugin simply
 * lands the app on the bookshelf instead of auto-resuming.
 */

const LAST_BOOK_KEY = "lastBookId";

export function createLastBookService(storage: PluginStorageAdapter) {
  async function get(): Promise<string | undefined> {
    return storage.get<string>(LAST_BOOK_KEY);
  }

  async function set(bookId: string): Promise<void> {
    await storage.put(LAST_BOOK_KEY, bookId);
  }

  async function clear(): Promise<void> {
    await storage.delete(LAST_BOOK_KEY);
  }

  return { get, set, clear };
}

export function registerLastBook(ctx: PluginContext): void {
  const service = createLastBookService(ctx.storage);

  void service.get().then((lastBookId) => {
    if (lastBookId) {
      ctx.navigate("/reader/" + lastBookId, true);
    }
  });

  ctx.events.on("book:opened", ({ bookId }) => {
    void service.set(bookId);
  });
  ctx.events.on("book:closed", () => {
    void service.clear();
  });
  ctx.events.on("book:deleted", async ({ bookId }) => {
    const saved = await service.get();
    if (saved === bookId) {
      await service.clear();
    }
  });
}
