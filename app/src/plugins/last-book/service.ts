import type { PluginStorageAdapter, PluginContext } from "../../core/plugin-runtime/types";

/**
 * Last-book restore (plugin-owned).
 *
 * On startup we return to the last opened book; on book open/close/delete we
 * keep that marker in sync. Everything here is domain logic of the last-book
 * plugin — the shared infrastructure it leans on (events / storage / navigate)
 * lives in core and arrives via PluginContext. Disabling the plugin simply
 * lands the app on the bookshelf instead of auto-resuming.
 *
 * Robustness notes (all async-race guards are covered by service.test.ts):
 * - startup read is async — if the user opens a book before it resolves, the
 *   startup navigation is void (never override an explicit user action);
 * - `book:closed` clears only when the marker still points at the closed book,
 *   so a slow clear can never wipe the marker of a book opened right after;
 * - every fire-and-forget storage call logs instead of producing an
 *   unhandled promise rejection.
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

  /** True once the user opened a book — startup restore is then void. */
  let userOpenedBook = false;

  const fail = (op: string) => (err: unknown) => {
    console.error(`[last-book] ${op} failed:`, err);
  };

  void service
    .get()
    .then((lastBookId) => {
      if (lastBookId && !userOpenedBook) {
        ctx.navigate("/reader/" + lastBookId, true);
      }
    })
    .catch(fail("read marker"));

  ctx.events.on("book:opened", ({ bookId }) => {
    userOpenedBook = true;
    void service.set(bookId).catch(fail("persist marker"));
  });

  ctx.events.on("book:closed", async ({ bookId }) => {
    // Read-then-clear: only wipe the marker if it still points at the book
    // being closed. Otherwise a clear racing a newer book:opened could erase
    // the fresh marker (last-book ordering is not guaranteed).
    const saved = await service.get();
    if (saved === bookId) {
      await service.clear();
    }
  });

  ctx.events.on("book:deleted", async ({ bookId }) => {
    const saved = await service.get();
    if (saved === bookId) {
      await service.clear();
    }
  });
}
