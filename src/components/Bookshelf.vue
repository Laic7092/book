<script setup lang="ts">
import { ref, onMounted } from "vue";
import { readerCore } from "../core/reader";
import { dbGetAll, dbDelete, STORES } from "../storage/db";
import type { Book } from "../core/types";

const emit = defineEmits<{
  (e: "book:select", book: Book): void;
  (e: "book:delete", bookId: string): void;
}>();

const books = ref<Book[]>([]);
const isLoading = ref(true);
const isUploading = ref(false);

async function loadBooks() {
  isLoading.value = true;
  books.value = await dbGetAll<Book>(STORES.BOOKS);
  isLoading.value = false;
}

async function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    isUploading.value = true;
    try {
      const result = await readerCore.loadBook(file);
      await loadBooks();
      emit("book:select", result.book);
    } catch (err) {
      console.error("Failed to add book:", err);
      alert("Failed to load book. Please try another file.");
    } finally {
      isUploading.value = false;
    }
  }
  // Reset input
  (e.target as HTMLInputElement).value = "";
}

async function deleteBook(bookId: string, e: Event) {
  e.stopPropagation();
  if (confirm("Delete this book from library?")) {
    await readerCore.deleteBook(bookId);
    await loadBooks();
    emit("book:delete", bookId);
  }
}

function selectBook(book: Book) {
  emit("book:select", book);
}

onMounted(() => {
  loadBooks();
});
</script>

<template>
  <div class="bookshelf">
    <header class="bookshelf-header">
      <h1>My Library</h1>
      <label class="upload-btn">
        <span>{{ isUploading ? "Loading..." : "+ Add Book" }}</span>
        <input
          type="file"
          accept=".txt,.epub"
          @change="handleFileUpload"
          hidden
          :disabled="isUploading"
        />
      </label>
    </header>

    <div v-if="isLoading || isUploading" class="loading">Loading library...</div>

    <div v-else-if="books.length === 0" class="empty-state">
      <p>No books yet</p>
      <p>Add a book to get started</p>
    </div>

    <div v-else class="book-grid">
      <div v-for="book in books" :key="book.id" class="book-card" @click="selectBook(book)">
        <div class="book-cover">
          <span class="book-icon">&#128214;</span>
        </div>
        <div class="book-info">
          <h3 class="book-title">{{ book.title }}</h3>
          <p v-if="book.author" class="book-author">{{ book.author }}</p>
          <p v-if="book.lastReadAt" class="last-read">
            Last read: {{ new Date(book.lastReadAt).toLocaleDateString() }}
          </p>
        </div>
        <button class="delete-btn" @click="deleteBook(book.id, $event)" title="Delete book">
          &#128465;
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookshelf {
  height: 100vh;
  overflow: auto;
  background-color: var(--reader-bg);
  color: var(--reader-text);
  padding: 24px;
}

.bookshelf-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.bookshelf-header h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}

.upload-btn {
  padding: 12px 24px;
  background-color: #aa3bff;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}

.upload-btn:hover {
  background-color: #9333ea;
}

.upload-btn input {
  display: none;
}

.loading,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--reader-text);
  opacity: 0.6;
}

.empty-state p {
  margin: 8px 0;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 24px;
}

.book-card {
  position: relative;
  background-color: var(--sidebar-bg);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  border: 1px solid var(--border);
}

.book-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.book-cover {
  aspect-ratio: 3/4;
  background: linear-gradient(135deg, #aa3bff 0%, #7c3aed 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.book-icon {
  font-size: 48px;
}

.book-info {
  min-height: 60px;
}

.book-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.book-author {
  font-size: 12px;
  opacity: 0.7;
  margin: 0;
}

.last-read {
  font-size: 11px;
  opacity: 0.5;
  margin: 4px 0 0;
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background-color: rgba(0, 0, 0, 0.1);
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition:
    opacity 0.2s,
    background-color 0.2s;
  color: var(--reader-text);
}

.book-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: #ef4444;
  color: white;
}
</style>
