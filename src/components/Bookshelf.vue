<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { readerCore } from "../core/reader";
import { dbGetAll, dbDelete, STORES } from "../storage/db";
import type { Book, Bookmark } from "../core/types";

const emit = defineEmits<{
  (e: "book:select", book: Book): void;
  (e: "book:delete", bookId: string): void;
}>();

const books = ref<Book[]>([]);
const bookmarks = ref<Bookmark[]>([]);
const isLoading = ref(true);
const isUploading = ref(false);
const showToast = ref(false);
const toastMessage = ref("");
const showConfirm = ref(false);
const bookToDelete = ref<string | null>(null);
const searchQuery = ref("");
const activeModal = ref<"search" | "bookmarks" | null>(null);

// Generate a consistent color from a string
function stringToColor(str: string): string {
  const colors = [
    "#f57c3e",
    "#e06a2e",
    "#d95a1e",
    "#7c3aed",
    "#6d28d9",
    "#5b21b6",
    "#db2777",
    "#be185d",
    "#9d174d",
    "#059669",
    "#047857",
    "#065f46",
    "#0284c7",
    "#0369a1",
    "#075985",
    "#ca8a04",
    "#a16207",
    "#854d0e",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Get initial letter for cover
function getInitial(title: string): string {
  return title.charAt(0).toUpperCase() || "📖";
}

// Generate gradient for cover
function getGradient(book: Book): string {
  const baseColor = stringToColor(book.title);
  return `linear-gradient(135deg, ${baseColor} 0%, ${baseColor}dd 100%)`;
}

async function loadBooks() {
  isLoading.value = true;
  books.value = await dbGetAll<Book>(STORES.BOOKS);
  bookmarks.value = await dbGetAll<Bookmark>(STORES.BOOKMARKS);
  isLoading.value = false;
}

async function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    isUploading.value = true;
    try {
      const result = await readerCore.loadBook(file);
      await loadBooks();
      showToastMessage(`"${result.book.title}" added to library`);
      emit("book:select", result.book);
    } catch (err) {
      console.error("Failed to add book:", err);
      showToastMessage("Failed to load book. Please try again.", true);
    } finally {
      isUploading.value = false;
    }
  }
  (e.target as HTMLInputElement).value = "";
}

function showToastMessage(msg: string, isError = false) {
  toastMessage.value = msg;
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
  }, 3000);
}

function confirmDelete(bookId: string, e: Event) {
  e.stopPropagation();
  bookToDelete.value = bookId;
  showConfirm.value = true;
}

async function deleteBook() {
  if (!bookToDelete.value) return;
  const book = books.value.find((b) => b.id === bookToDelete.value);
  await readerCore.deleteBook(bookToDelete.value);
  await loadBooks();
  emit("book:delete", bookToDelete.value);
  if (book) {
    showToastMessage(`"${book.title}" removed from library`);
  }
  showConfirm.value = false;
  bookToDelete.value = null;
}

function cancelDelete() {
  showConfirm.value = false;
  bookToDelete.value = null;
}

function selectBook(book: Book) {
  emit("book:select", book);
}

function openModal(type: typeof activeModal.value) {
  activeModal.value = type;
}

function closeModal() {
  activeModal.value = null;
}

// Filter books by search query
const filteredBooks = computed(() => {
  if (!searchQuery.value.trim()) return books.value;
  const query = searchQuery.value.toLowerCase();
  return books.value.filter(
    (book) =>
      book.title.toLowerCase().includes(query) ||
      (book.author && book.author.toLowerCase().includes(query)),
  );
});

// Group bookmarks by book
const bookmarksByBook = computed(() => {
  const grouped: Record<string, { book: Book; bookmarks: Bookmark[] }> = {};
  for (const bookmark of bookmarks.value) {
    const book = books.value.find((b) => b.id === bookmark.bookId);
    if (book) {
      if (!grouped[bookmark.bookId]) {
        grouped[bookmark.bookId] = { book, bookmarks: [] };
      }
      grouped[bookmark.bookId].bookmarks.push(bookmark);
    }
  }
  return grouped;
});

async function goToBookWithBookmark(bookId: string, chapterId: string) {
  const book = books.value.find((b) => b.id === bookId);
  if (book) {
    closeModal();
    emit("book:select", book);
  }
}

async function deleteBookmark(bookmarkId: string) {
  await readerCore.removeBookmark(bookmarkId);
  bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId);
}

onMounted(() => {
  loadBooks();
});
</script>

<template>
  <div class="bookshelf">
    <!-- Header -->
    <header class="bookshelf-header">
      <div class="header-content">
        <h1 class="bookshelf-title">My Library</h1>
        <p class="bookshelf-subtitle">
          {{ books.length }} {{ books.length === 1 ? "book" : "books" }}
        </p>
      </div>
      <div class="header-actions">
        <button class="icon-btn" @click="openModal('search')" aria-label="Search books">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <button class="icon-btn" @click="openModal('bookmarks')" aria-label="Bookmarks">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
          <span v-if="bookmarks.length > 0" class="badge">{{ bookmarks.length }}</span>
        </button>
        <label class="upload-btn" :class="{ uploading: isUploading }">
          <span class="upload-icon" aria-hidden="true">+</span>
          <span class="upload-text">{{ isUploading ? "Adding..." : "Add Book" }}</span>
          <input
            type="file"
            accept=".txt,.epub"
            @change="handleFileUpload"
            hidden
            :disabled="isUploading"
          />
        </label>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-grid">
      <div v-for="i in 6" :key="i" class="book-card-skeleton">
        <div class="cover-skeleton skeleton"></div>
        <div class="info-skeleton">
          <div class="title-skeleton skeleton"></div>
          <div class="author-skeleton skeleton"></div>
        </div>
      </div>
    </div>

    <!-- Upload Loading -->
    <div v-else-if="isUploading" class="uploading-state">
      <div class="upload-spinner"></div>
      <p>Adding book to library...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="books.length === 0" class="empty-state">
      <div class="empty-illustration">
        <div class="empty-book-stack">
          <div class="stack-book book-1"></div>
          <div class="stack-book book-2"></div>
          <div class="stack-book book-3"></div>
        </div>
      </div>
      <h2 class="empty-title">Your library is empty</h2>
      <p class="empty-description">Start your reading journey by adding your first book</p>
      <label class="upload-btn upload-btn-large">
        <span class="upload-icon" aria-hidden="true">+</span>
        <span>Add your first book</span>
        <input
          type="file"
          accept=".txt,.epub"
          @change="handleFileUpload"
          hidden
          :disabled="isUploading"
        />
      </label>
    </div>

    <!-- Book Grid -->
    <div v-else-if="filteredBooks.length > 0" class="book-grid">
      <div
        v-for="book in filteredBooks"
        :key="book.id"
        class="book-card"
        :style="{ '--cover-gradient': getGradient(book) }"
        @click="selectBook(book)"
        tabindex="0"
        @keydown.enter="selectBook(book)"
        role="button"
        :aria-label="`Open ${book.title} by ${book.author || 'Unknown author'}`"
      >
        <div class="book-cover">
          <span class="cover-initial" aria-hidden="true">{{ getInitial(book.title) }}</span>
          <span class="cover-format">{{ book.format.toUpperCase() }}</span>
        </div>
        <div class="book-info">
          <h3 class="book-title" :title="book.title">{{ book.title }}</h3>
          <p v-if="book.author" class="book-author">{{ book.author }}</p>
          <p v-else class="book-author unknown">Unknown author</p>
          <div v-if="book.lastReadAt" class="progress-indicator">
            <span class="progress-dot"></span>
            <span class="last-read">
              {{ new Date(book.lastReadAt).toLocaleDateString() }}
            </span>
          </div>
        </div>
        <button
          class="delete-btn"
          @click="confirmDelete(book.id, $event)"
          title="Delete book"
          aria-label="Delete book"
          tabindex="0"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- No search results -->
    <div v-if="books.length > 0 && filteredBooks.length === 0 && searchQuery" class="no-results">
      <p>No books found matching "{{ searchQuery }}"</p>
    </div>

    <!-- Toast Notification -->
    <transition name="toast">
      <div
        v-if="showToast"
        class="toast"
        :class="{ 'toast-error': toastMessage.includes('Failed') }"
      >
        <span class="toast-icon" aria-hidden="true">
          {{ toastMessage.includes("Failed") ? "!" : "✓" }}
        </span>
        <span class="toast-message">{{ toastMessage }}</span>
      </div>
    </transition>

    <!-- Confirm Dialog -->
    <transition name="fade">
      <div v-if="showConfirm" class="confirm-dialog" @click.self="cancelDelete">
        <div class="confirm-content">
          <h3 class="confirm-title">Delete book?</h3>
          <p class="confirm-message">This will remove the book from your library permanently.</p>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click="cancelDelete">Cancel</button>
            <button class="confirm-btn delete" @click="deleteBook">Delete</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Search Modal -->
    <transition name="modal">
      <div v-if="activeModal === 'search'" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content modal-search">
          <div class="modal-header">
            <h3>Search Books</h3>
            <button class="modal-close" @click="closeModal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="search-box">
              <svg
                class="search-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search by title or author..."
                class="search-input"
                autofocus
              />
              <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div v-if="searchQuery && filteredBooks.length > 0" class="search-results">
              <p class="results-count">
                {{ filteredBooks.length }} result{{ filteredBooks.length !== 1 ? "s" : "" }} found
              </p>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Bookmarks Modal -->
    <transition name="modal">
      <div v-if="activeModal === 'bookmarks'" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content modal-bookmarks">
          <div class="modal-header">
            <h3>Bookmarks</h3>
            <button class="modal-close" @click="closeModal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div v-if="bookmarks.length === 0" class="empty-bookmarks">
              <p>No bookmarks yet</p>
            </div>
            <div v-else class="bookmarks-grouped">
              <div
                v-for="{ book, bookmarks: bms } in Object.values(bookmarksByBook)"
                :key="book.id"
                class="book-bookmarks"
              >
                <h4 class="book-name">{{ book.title }}</h4>
                <ul class="bookmark-list">
                  <li v-for="bm in bms" :key="bm.id" class="bookmark-item">
                    <div class="bookmark-info" @click="goToBookWithBookmark(book.id, bm.chapterId)">
                      <div class="bookmark-chapter">{{ bm.chapterTitle }}</div>
                      <div class="bookmark-preview">{{ bm.contentPreview }}</div>
                    </div>
                    <button
                      class="bookmark-delete"
                      @click="deleteBookmark(bm.id)"
                      aria-label="Delete bookmark"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.bookshelf {
  height: 100vh;
  overflow: auto;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  padding: 32px 40px;
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
}

/* Header */
.bookshelf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 40px;
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bookshelf-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.bookshelf-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* Upload Button */
.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  color: white;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  font-family: var(--font-ui);
  transition: all var(--transition-base);
  box-shadow: var(--shadow-sm);
}

.upload-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.upload-btn:active {
  transform: translateY(0);
}

.upload-btn.uploading {
  opacity: 0.8;
  cursor: not-allowed;
}

.upload-icon {
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
}

.upload-text {
  font-weight: 600;
}

/* Loading Grid */
.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 28px;
}

.book-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cover-skeleton {
  aspect-ratio: 3/4;
  border-radius: 12px;
}

.info-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title-skeleton {
  height: 20px;
  border-radius: 6px;
}

.author-skeleton {
  height: 14px;
  width: 70%;
  border-radius: 4px;
}

/* Uploading State */
.uploading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
  color: var(--text-secondary);
}

.upload-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
  animation: fadeInUp 0.6s ease-out;
}

.empty-illustration {
  margin-bottom: 32px;
}

.empty-book-stack {
  position: relative;
  width: 120px;
  height: 140px;
  margin: 0 auto;
}

.stack-book {
  position: absolute;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  animation: floatBook 3s ease-in-out infinite;
}

.stack-book.book-1 {
  width: 70px;
  height: 90px;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  left: 0;
  bottom: 0;
  transform: rotate(-15deg);
  animation-delay: 0s;
}

.stack-book.book-2 {
  width: 70px;
  height: 90px;
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
  right: 0;
  bottom: 10px;
  transform: rotate(15deg);
  animation-delay: 0.3s;
}

.stack-book.book-3 {
  width: 70px;
  height: 90px;
  background: linear-gradient(135deg, #db2777 0%, #be185d 100%);
  left: 50%;
  bottom: 25px;
  transform: translateX(-50%) rotate(-5deg);
  animation-delay: 0.6s;
}

@keyframes floatBook {
  0%,
  100% {
    transform: translateY(0) rotate(var(--rotation, 0deg));
  }
  50% {
    transform: translateY(-8px) rotate(var(--rotation, 0deg));
  }
}

.empty-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.empty-description {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 24px;
  max-width: 320px;
}

.upload-btn-large {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  color: white;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  font-family: var(--font-ui);
  transition: all var(--transition-base);
  box-shadow: var(--shadow-md);
}

.upload-btn-large:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

/* Book Grid */
.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 28px;
}

/* Book Card */
.book-card {
  position: relative;
  background-color: var(--bg-secondary);
  border-radius: 16px;
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-base);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  animation: fadeInUp 0.5s ease-out backwards;
}

.book-card:nth-child(1) {
  animation-delay: 0.05s;
}
.book-card:nth-child(2) {
  animation-delay: 0.1s;
}
.book-card:nth-child(3) {
  animation-delay: 0.15s;
}
.book-card:nth-child(4) {
  animation-delay: 0.2s;
}
.book-card:nth-child(5) {
  animation-delay: 0.25s;
}
.book-card:nth-child(6) {
  animation-delay: 0.3s;
}
.book-card:nth-child(7) {
  animation-delay: 0.35s;
}
.book-card:nth-child(8) {
  animation-delay: 0.4s;
}

.book-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: var(--shadow-lg);
  border-color: transparent;
}

.book-card:active {
  transform: translateY(-4px) scale(1);
}

.book-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.book-cover {
  position: relative;
  aspect-ratio: 3/4;
  background: var(--cover-gradient);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-base);
}

.book-card:hover .book-cover {
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.cover-initial {
  font-size: 56px;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  letter-spacing: -0.02em;
  transition: transform var(--transition-base);
}

.book-card:hover .cover-initial {
  transform: scale(1.1);
}

.cover-format {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.25);
  padding: 4px 8px;
  border-radius: 6px;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all var(--transition-fast);
}

.book-card:hover .cover-format {
  background: rgba(0, 0, 0, 0.4);
}

.book-info {
  flex: 1;
  min-height: 70px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.book-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.book-author {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-author.unknown {
  color: var(--text-muted);
  font-style: italic;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.progress-dot {
  width: 6px;
  height: 6px;
  background: var(--color-accent);
  border-radius: 50%;
  flex-shrink: 0;
}

.last-read {
  font-size: 11px;
  color: var(--text-muted);
}

/* Delete Button */
.delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background-color: rgba(239, 68, 68, 0.9);
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transform: scale(0.8);
  transition: all var(--transition-fast);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.book-card:hover .delete-btn {
  opacity: 1;
  transform: scale(1);
}

.delete-btn:hover {
  background-color: #dc2626;
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.delete-btn:active {
  transform: scale(0.95);
}

.delete-btn:focus-visible {
  opacity: 1;
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: var(--text-primary);
  color: var(--bg-primary);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  font-size: 14px;
  font-weight: 500;
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.toast.toast-error {
  background: #ef4444;
  color: white;
}

.toast-enter-active,
.toast-leave-active {
  transition: all var(--transition-slow);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(100px) scale(0.9);
}

.toast-icon {
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: all var(--transition-base);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Confirm Dialog */
.confirm-dialog {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  animation: fadeIn 0.2s ease-out;
}

.confirm-content {
  background: var(--bg-primary);
  border-radius: 16px;
  padding: 24px;
  max-width: 320px;
  width: 90%;
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.confirm-title {
  font-size: 17px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 20px;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.confirm-btn.cancel {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.confirm-btn.cancel:hover {
  background: var(--border-color);
}

.confirm-btn.delete {
  background: #ef4444;
  color: white;
}

.confirm-btn.delete:hover {
  background: #dc2626;
}

/* Header Actions */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-primary);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--hover-bg);
}

.icon-btn:active {
  transform: scale(0.95);
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  background: var(--color-accent);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}

/* No Results */
.no-results {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.no-results p {
  font-size: 15px;
  margin: 0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-primary);
  border-radius: 16px;
  max-height: 80vh;
  width: 90%;
  max-width: 500px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--hover-bg);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  max-height: 60vh;
}

/* Search */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 40px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 15px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent);
  background: var(--bg-primary);
}

.search-clear {
  position: absolute;
  right: 8px;
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
}

.search-clear:hover {
  background: var(--hover-bg);
}

.results-count {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* Bookmarks */
.empty-bookmarks {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.bookmarks-grouped {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.book-bookmarks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.book-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.bookmark-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bookmark-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  transition: all var(--transition-fast);
}

.bookmark-item:hover {
  background: var(--hover-bg);
}

.bookmark-info {
  flex: 1;
  cursor: pointer;
}

.bookmark-chapter {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.bookmark-preview {
  font-size: 12px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bookmark-delete {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.bookmark-delete:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all var(--transition-base);
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .bookshelf {
    padding: 20px 16px;
  }

  .bookshelf-header {
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  .bookshelf-title {
    font-size: 24px;
  }

  .upload-btn {
    width: 100%;
    justify-content: center;
  }

  .book-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
  }

  .cover-initial {
    font-size: 40px;
  }
}
</style>
