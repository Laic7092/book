import { useBookmarksStore } from "./store";
import BookmarksPanel from "./BookmarksPanel.vue";
import type { Plugin } from "../types";

let store: ReturnType<typeof useBookmarksStore> | null = null;

export const bookmarksPlugin: Plugin = {
  id: "bookmarks",
  name: "Bookmarks",
  version: "1.0.0",
  modalComponents: { bookmarks: BookmarksPanel },
  footerActions: [
    {
      id: "bookmarks",
      position: "bar",
      label: "Bookmarks",
      icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />',
      modal: "bookmarks",
      order: 10,
    },
  ],
  onInit() {
    store = useBookmarksStore();
  },
  async onBookOpen(bookId: string) {
    if (store) await store.loadBookmarks(bookId);
  },
  onModalOpen(modalName: string) {
    if (modalName === "bookmarks" && store?.currentBookId) {
      void store.loadBookmarks(store.currentBookId);
    }
  },
};
