// Bookshelf Store - Manages library state

import { defineStore } from "pinia";
import type { Book, Folder } from "../core/types";
import { dbGetAll, STORES } from "../storage/db";
import { getCoverBlob, deleteCoverBlob } from "../storage/books";
import { pluginEvents } from "../plugins/context";
import * as booksStore from "../storage/books";
import { assertValidBookFile } from "../utils/validation";

export interface BookshelfState {
  books: Book[];
  folders: Folder[];
  selectedFolderId: string | null;
  isLoading: boolean;
  isUploading: boolean;
  searchQuery: string;
  coverUrls: Map<string, string>;
}

export const useBookshelfStore = defineStore("bookshelf", {
  state: (): BookshelfState => ({
    books: [],
    folders: [],
    selectedFolderId: null,
    isLoading: true,
    isUploading: false,
    searchQuery: "",
    coverUrls: new Map(),
  }),

  getters: {
    filteredBooks: (state) => {
      let list = state.books;
      if (state.selectedFolderId) {
        list = list.filter((b) => b.folderId === state.selectedFolderId);
      }
      if (!state.searchQuery.trim()) return list;
      const query = state.searchQuery.toLowerCase();
      return list.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          (book.author && book.author.toLowerCase().includes(query)),
      );
    },
  },

  actions: {
    async loadBooks() {
      this.isLoading = true;
      try {
        this.books = await dbGetAll<Book>(STORES.BOOKS);

        for (const book of this.books) {
          if (book.coverUrl && !this.coverUrls.has(book.id)) {
            const blob = await getCoverBlob(book.id);
            if (blob) {
              this.coverUrls.set(book.id, URL.createObjectURL(blob));
            }
          }
        }
      } finally {
        this.isLoading = false;
      }
    },

    async addBookFromFile(file: File) {
      assertValidBookFile(file);
      this.isUploading = true;
      try {
        const { useReaderStore } = await import("./reader");
        const readerStore = useReaderStore();
        const result = await readerStore.loadBook(file);
        await this.loadBooks();
        return result;
      } finally {
        this.isUploading = false;
      }
    },

    async deleteBook(bookId: string) {
      const { useReaderStore } = await import("./reader");
      const readerStore = useReaderStore();
      if (readerStore.currentBook?.id === bookId) {
        await readerStore.closeBook();
      }
      await booksStore.deleteBook(bookId);
      void pluginEvents.emit("book:deleted", { bookId });

      const coverUrl = this.coverUrls.get(bookId);
      if (coverUrl) {
        URL.revokeObjectURL(coverUrl);
        this.coverUrls.delete(bookId);
      }
      // Clean up cached cover blob
      deleteCoverBlob(bookId).catch(() => {});
      this.books = this.books.filter((b) => b.id !== bookId);
    },

    setSearchQuery(query: string) {
      this.searchQuery = query;
    },

    // ── Folder actions ──

    async loadFolders() {
      this.folders = await booksStore.getAllFolders();
    },

    async createFolder(name: string) {
      const folder = await booksStore.createFolder(name);
      this.folders.push(folder);
      return folder;
    },

    async renameFolder(id: string, name: string) {
      await booksStore.updateFolder(id, { name });
      const f = this.folders.find((f) => f.id === id);
      if (f) f.name = name;
    },

    async deleteFolder(id: string) {
      const { useUIStore } = await import("./ui");
      const ui = useUIStore();

      const count = this.books.filter((b) => b.folderId === id).length;
      const folderName = this.folders.find((f) => f.id === id)?.name ?? "";

      ui.showConfirmation(
        `Delete "${folderName}"?`,
        count > 0
          ? `${count} book${count === 1 ? "" : "s"} will be moved out of this folder.`
          : "This folder is empty.",
        async () => {
          await booksStore.deleteFolder(id);
          // Remove folderId from affected books
          for (const book of this.books.filter((b) => b.folderId === id)) {
            book.folderId = undefined;
            await booksStore.updateBook(book.id, { folderId: undefined });
          }
          this.folders = this.folders.filter((f) => f.id !== id);
          if (this.selectedFolderId === id) this.selectedFolderId = null;
        },
      );
    },

    setSelectedFolder(folderId: string | null) {
      this.selectedFolderId = folderId;
    },

    async moveToFolder(bookId: string, folderId: string | null) {
      const book = this.books.find((b) => b.id === bookId);
      if (!book) return;
      book.folderId = folderId ?? undefined;
      await booksStore.updateBook(bookId, { folderId: book.folderId });
    },

    // ── Rename action ──

    async renameBook(bookId: string, title: string) {
      const book = this.books.find((b) => b.id === bookId);
      if (!book) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      book.title = trimmed;
      await booksStore.updateBook(bookId, { title: trimmed });
    },
  },
});
