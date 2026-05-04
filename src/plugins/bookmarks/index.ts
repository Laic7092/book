import BookmarksPanel from "./BookmarksPanel.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { useBookmarksStore, setBookmarksAdapter } from "./store";

let store: ReturnType<typeof useBookmarksStore> | null = null;

export const bookmarksPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "bookmarks",
  name: "Bookmarks",
  version: "1.0.0",
  setup(ctx) {
    setBookmarksAdapter(ctx.storage);
    store = useBookmarksStore(ctx.pinia);

    ctx.events.on("book:opened", ({ bookId }) => store?.loadBookmarks(bookId));

    ctx.ui.registerModal("bookmarks", BookmarksPanel);
    ctx.ui.registerFooterAction({
      id: "bookmarks",
      position: "bar",
      label: "Bookmarks",
      icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />',
      modal: "bookmarks",
      order: 10,
    });
  },
  teardown() {
    setBookmarksAdapter(null);
    store = null;
  },
};
