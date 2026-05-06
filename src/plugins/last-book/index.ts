import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const loadOn = "bookshelf" as const;

const LAST_BOOK_KEY = "lastBookId";

export const lastBookPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "last-book",
  name: "Last Book Restore",
  version: "1.0.0",
  async setup(ctx) {
    const lastBookId = await ctx.storage.get<string>(LAST_BOOK_KEY);
    if (lastBookId) {
      ctx.navigate("/reader/" + lastBookId, true);
    }

    ctx.events.on("book:opened", ({ bookId }) => {
      void ctx.storage.put(LAST_BOOK_KEY, bookId);
    });
    ctx.events.on("book:closed", () => {
      void ctx.storage.delete(LAST_BOOK_KEY);
    });
    ctx.events.on("book:deleted", async ({ bookId }) => {
      const saved = await ctx.storage.get<string>(LAST_BOOK_KEY);
      if (saved === bookId) {
        await ctx.storage.delete(LAST_BOOK_KEY);
      }
    });
  },
};
