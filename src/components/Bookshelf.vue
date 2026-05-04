<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useBookshelfStore } from "../stores/bookshelf";
import { useUIStore } from "../stores/ui";
import { getBookGradient, getInitial } from "../utils/colors";
import { formatDuration } from "../utils/time";
import { formatBookToast } from "../utils/toast";
import { validateBookFile } from "../utils/validation";
import type { Book } from "../core/types";
import PluginsPanel from "./modals/PluginsPanel.vue";

const emit = defineEmits<{
  (e: "book:select", book: Book): void;
  (e: "book:delete", bookId: string): void;
}>();

const bookshelfStore = useBookshelfStore();
const uiStore = useUIStore();

// Local state
const searchFocused = ref(false);
const showPlugins = ref(false);

async function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const validation = validateBookFile(file);
  if (!validation.valid) {
    uiStore.triggerToast(validation.error!, true);
    (e.target as HTMLInputElement).value = "";
    return;
  }

  try {
    const result = await bookshelfStore.addBookFromFile(file);
    const toast = formatBookToast(result.book.title, "added to library");
    uiStore.triggerToastWithTitle(toast.title, toast.message);
  } catch (err) {
    console.error("Failed to add book:", err);
    uiStore.triggerToast("Failed to load book. Please try again.", true);
  }
  (e.target as HTMLInputElement).value = "";
}

function confirmDelete(bookId: string, e: Event) {
  e.stopPropagation();
  uiStore.showConfirmation(
    "Remove volume?",
    "This will permanently delete this book from your library.",
    () => deleteBook(bookId),
  );
}

async function deleteBook(bookId: string) {
  const book = bookshelfStore.books.find((b) => b.id === bookId);
  await bookshelfStore.deleteBook(bookId);
  emit("book:delete", bookId);
  if (book) {
    const toast = formatBookToast(book.title, "removed from library");
    uiStore.triggerToastWithTitle(toast.title, toast.message);
  }
}

function selectBook(book: Book) {
  emit("book:select", book);
}

// Cached computations for book cover rendering
const coverUrls = computed(() => bookshelfStore.coverUrls);

const bookGradients = computed(() => {
  const map = new Map<string, string>();
  for (const book of bookshelfStore.books) {
    map.set(book.id, getBookGradient(book.title));
  }
  return map;
});

const bookInitials = computed(() => {
  const map = new Map<string, string>();
  for (const book of bookshelfStore.books) {
    map.set(book.id, getInitial(book.title));
  }
  return map;
});

onMounted(() => {
  bookshelfStore.loadBooks();
});
</script>

<template>
  <div class="bookshelf">
    <!-- Header -->
    <header class="bookshelf-header">
      <div class="header-content">
        <h1 class="bookshelf-title">Library</h1>
        <p class="bookshelf-subtitle">
          {{ bookshelfStore.books.length }}
          {{ bookshelfStore.books.length === 1 ? "volume" : "volumes" }}
        </p>
        <!-- Summary Stats -->
        <div
          v-if="bookshelfStore.summaryStats && bookshelfStore.summaryStats.totalBooks > 0"
          class="summary-stats"
        >
          <div class="stat-item">
            <span class="stat-value">{{
              formatDuration(bookshelfStore.summaryStats.totalReadingTime)
            }}</span>
            <span class="stat-label">Total Reading</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ bookshelfStore.summaryStats.booksInProgress }}</span>
            <span class="stat-label">In Progress</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{
              formatDuration(bookshelfStore.summaryStats.thisWeekReadingTime)
            }}</span>
            <span class="stat-label">This Week</span>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <button class="plugins-btn" @click="showPlugins = true" aria-label="Plugin settings">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
        <div class="search-container" :class="{ focused: searchFocused }">
          <svg
            class="search-icon-inline"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            v-model="bookshelfStore.searchQuery"
            type="text"
            placeholder="Search library..."
            class="search-input-inline"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <button
            v-if="bookshelfStore.searchQuery"
            class="search-clear-inline"
            @click="bookshelfStore.setSearchQuery('')"
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
        </div>
        <label class="add-btn" :class="{ uploading: bookshelfStore.isUploading }">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span class="add-text">{{ bookshelfStore.isUploading ? "Adding..." : "Add Book" }}</span>
          <input
            type="file"
            accept=".txt,.epub"
            @change="handleFileUpload"
            hidden
            :disabled="bookshelfStore.isUploading"
          />
        </label>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="bookshelfStore.isLoading" class="loading-grid">
      <div v-for="i in 6" :key="i" class="book-card-skeleton">
        <div class="cover-skeleton skeleton"></div>
        <div class="info-skeleton">
          <div class="title-skeleton skeleton"></div>
          <div class="author-skeleton skeleton"></div>
        </div>
      </div>
    </div>

    <!-- Upload Loading -->
    <div v-else-if="bookshelfStore.isUploading" class="uploading-state">
      <div class="upload-spinner"></div>
      <p>Adding volume to library...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="bookshelfStore.books.length === 0" class="empty-state">
      <div class="empty-illustration">
        <div class="empty-book-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
          >
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
        </div>
      </div>
      <h2 class="empty-title">Your library awaits</h2>
      <p class="empty-description">Begin your literary journey by adding your first volume</p>
      <label class="add-btn add-btn-large">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Add your first book</span>
        <input
          type="file"
          accept=".txt,.epub"
          @change="handleFileUpload"
          hidden
          :disabled="bookshelfStore.isUploading"
        />
      </label>
    </div>

    <!-- Book Grid -->
    <div v-else-if="bookshelfStore.filteredBooks.length > 0" class="book-grid">
      <div
        v-for="(book, idx) in bookshelfStore.filteredBooks"
        :key="book.id"
        class="book-card"
        :style="{ animationDelay: `${idx * 0.04}s` }"
        @click="selectBook(book)"
        tabindex="0"
        @keydown.enter="selectBook(book)"
        role="button"
        :aria-label="`Open ${book.title} by ${book.author || 'Unknown author'}`"
      >
        <div class="book-cover" :style="{ background: bookGradients.get(book.id) }">
          <img
            v-if="coverUrls.get(book.id)"
            :src="coverUrls.get(book.id)"
            :alt="`Cover of ${book.title}`"
            class="cover-image"
          />
          <template v-else>
            <span class="cover-initial" aria-hidden="true">{{ bookInitials.get(book.id) }}</span>
          </template>
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
      </div>
    </div>

    <!-- No search results -->
    <div
      v-if="
        bookshelfStore.books.length > 0 &&
        bookshelfStore.filteredBooks.length === 0 &&
        bookshelfStore.searchQuery
      "
      class="no-results"
    >
      <p>No volumes found matching "{{ bookshelfStore.searchQuery }}"</p>
    </div>

    <!-- Toast Notification -->
    <transition name="toast">
      <div
        v-if="uiStore.showToast"
        class="toast"
        :class="{ 'toast--error': uiStore.toastError }"
        :key="uiStore.toastMessage + Date.now()"
        role="status"
        aria-live="polite"
      >
        <svg
          v-if="!uiStore.toastError"
          class="toast__icon toast__icon--success"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg
          v-else
          class="toast__icon toast__icon--error"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div class="toast__content">
          <span class="toast__title">{{ uiStore.toastTitle }}</span>
          <span class="toast__desc">{{ uiStore.toastMessage }}</span>
        </div>
      </div>
    </transition>

    <!-- Confirm Dialog -->
    <transition name="fade">
      <div
        v-if="uiStore.showConfirm"
        class="confirm-dialog"
        @click.self="uiStore.cancelConfirmation()"
      >
        <div class="confirm-content">
          <h3 class="confirm-title">{{ uiStore.confirmTitle }}</h3>
          <p class="confirm-message">{{ uiStore.confirmMessage }}</p>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click="uiStore.cancelConfirmation()">Cancel</button>
            <button class="confirm-btn delete" @click="uiStore.confirm()">Delete</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Plugins Panel Overlay -->
    <Teleport to="body">
      <div v-if="showPlugins" class="plugin-overlay" @click.self="showPlugins = false">
        <div class="plugin-panel">
          <PluginsPanel @close="showPlugins = false" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.bookshelf {
  min-height: 100%;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  padding: 48px 56px;
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
}

/* Header */
.bookshelf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 48px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bookshelf-title {
  font-family: var(--font-display);
  font-size: 42px;
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.1;
}

.bookshelf-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  font-weight: 400;
}

/* Summary Stats */
.summary-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 10px;
  width: fit-content;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-display);
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: var(--border-subtle);
}

/* Add Button */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  background: var(--text-primary);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  font-family: var(--font-ui);
  transition: all var(--transition-base);
  border: none;
  box-shadow: var(--shadow-sm);
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  background: var(--color-accent);
}

.add-btn:active {
  transform: translateY(0);
}

.add-btn.uploading {
  opacity: 0.8;
  cursor: not-allowed;
}

.add-btn svg {
  flex-shrink: 0;
}

.add-text {
  font-weight: 500;
}

.add-btn-large {
  margin-top: 16px;
  padding: 14px 28px;
  font-size: 15px;
}

/* Loading Grid */
.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 32px;
}

.book-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cover-skeleton {
  aspect-ratio: 3/4;
  border-radius: 10px;
}

.info-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title-skeleton {
  height: 22px;
  border-radius: 6px;
}

.author-skeleton {
  height: 16px;
  width: 60%;
  border-radius: 4px;
}

/* Uploading State */
.uploading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 20px;
  color: var(--text-secondary);
}

.upload-spinner {
  width: 36px;
  height: 36px;
  border: 2px solid var(--border-color);
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
  padding: 100px 20px;
  text-align: center;
  animation: fadeInUp 0.6s ease-out;
}

.empty-illustration {
  margin-bottom: 32px;
  opacity: 0.5;
}

.empty-book-icon {
  color: var(--text-muted);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  margin: 0 0 10px;
  color: var(--text-primary);
}

.empty-description {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 28px;
  max-width: 360px;
  line-height: 1.5;
}

/* Book Grid */
.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 32px;
}

/* Book Card */
.book-card {
  position: relative;
  background-color: var(--bg-elevated, var(--bg-primary));
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all var(--transition-base);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  animation: fadeInUp 0.5s ease-out backwards;
  box-shadow: var(--shadow-xs);
}

.book-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-lg);
  border-color: transparent;
}

.book-card:active {
  transform: translateY(-3px);
}

.book-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.book-cover {
  position: relative;
  aspect-ratio: 3/4;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition:
    transform var(--transition-base),
    box-shadow var(--transition-base);
}

.book-card:hover .book-cover {
  transform: scale(1.03);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
}

.cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-initial {
  font-family: var(--font-display);
  font-size: 52px;
  font-weight: 600;
  color: white;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  letter-spacing: -0.02em;
  transition: transform var(--transition-base);
}

.book-card:hover .cover-initial {
  transform: scale(1.08);
}

.cover-format {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.2);
  padding: 3px 7px;
  border-radius: 4px;
  backdrop-filter: blur(8px);
  letter-spacing: 0.05em;
  transition: all var(--transition-fast);
}

.book-card:hover .cover-format {
  background: rgba(0, 0, 0, 0.3);
}

.book-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.book-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.book-author {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-author.unknown {
  color: var(--text-muted);
  font-style: italic;
  opacity: 0.8;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.progress-dot {
  width: 5px;
  height: 5px;
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
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transform: scale(0.85);
  transition: all var(--transition-fast);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1;
}

.book-card:hover .delete-btn {
  opacity: 1;
  transform: scale(1);
}

.delete-btn:hover {
  background: #fef2f2;
  color: #dc2626;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
}

.delete-btn:active {
  transform: scale(0.92);
}

.delete-btn:focus-visible {
  opacity: 1;
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* ===== Toast ===== */

.toast {
  position: fixed;
  top: max(16px, env(safe-area-inset-top, 16px));
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(31, 26, 23, 0.88);
  color: #f7f5f2;
  border-radius: 14px;
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.04),
    0 12px 40px rgba(0, 0, 0, 0.12);
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
  z-index: 3000;
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  max-width: min(360px, calc(100vw - 32px));
  pointer-events: none;
  will-change: transform, opacity;
}

.toast--error {
  background: rgba(180, 30, 30, 0.9);
  color: #fff;
  box-shadow:
    0 4px 6px rgba(180, 30, 30, 0.08),
    0 12px 40px rgba(180, 30, 30, 0.18);
}

/* Animations */
.toast-enter-active {
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px) scale(0.96);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scale(0.98);
}

/* Icon */
.toast__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.toast__icon--success {
  color: #4ade80;
}

.toast__icon--error {
  color: #fca5a5;
}

/* Content */
.toast__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.toast__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast__desc {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.3;
  color: rgba(247, 245, 242, 0.7);
}

.toast--error .toast__desc {
  color: rgba(255, 255, 255, 0.75);
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
  backdrop-filter: blur(4px);
}

.confirm-content {
  background: var(--bg-primary);
  border-radius: 14px;
  padding: 28px;
  max-width: 340px;
  width: 90%;
  animation: scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid var(--border-subtle);
}

.confirm-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 10px;
  color: var(--text-primary);
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 24px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-ui);
}

.confirm-btn.cancel {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.confirm-btn.cancel:hover {
  background: var(--bg-tertiary);
}

.confirm-btn.delete {
  background: #dc2626;
  color: white;
}

.confirm-btn.delete:hover {
  background: #b91c1c;
}

/* Header Actions */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Inline Search */
.search-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 240px;
  transition: all var(--transition-base);
}

.search-container.focused {
  width: 280px;
}

.search-icon-inline {
  position: absolute;
  left: 12px;
  color: var(--text-secondary);
  pointer-events: none;
  transition: color var(--transition-fast);
}

.search-container.focused .search-icon-inline {
  color: var(--accent);
}

.search-input-inline {
  width: 100%;
  padding: 10px 36px 10px 40px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-elevated, var(--bg-primary));
  color: var(--text-primary);
  font-family: var(--font-ui);
  transition: all var(--transition-fast);
}

.search-input-inline::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.search-input-inline:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search-clear-inline {
  position: absolute;
  right: 8px;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear-inline:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.icon-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated, var(--bg-primary));
  cursor: pointer;
  color: var(--text-primary);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

.icon-btn:active {
  transform: scale(0.95);
}

.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 19px;
  height: 19px;
  background: var(--color-accent);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  box-shadow: 0 2px 6px rgba(139, 46, 58, 0.3);
}

/* No Results */
.no-results {
  text-align: center;
  padding: 80px 20px;
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
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  backdrop-filter: blur(6px);
  animation: fadeIn 0.25s ease-out;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: 16px;
  max-height: 80vh;
  width: 90%;
  max-width: 520px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-subtle);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px 22px;
  overflow-y: auto;
  max-height: 60vh;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all var(--transition-base);
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 900px) {
  .bookshelf {
    padding: 32px 24px;
  }

  .bookshelf-header {
    flex-direction: column;
    gap: 20px;
    margin-bottom: 32px;
  }

  .bookshelf-title {
    font-size: 32px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .add-btn {
    margin-left: auto;
  }

  .book-grid {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 24px;
  }

  .cover-initial {
    font-size: 42px;
  }
}

@media (max-width: 600px) {
  .bookshelf {
    padding: 24px 16px;
  }

  .bookshelf-title {
    font-size: 28px;
  }

  .add-text {
    display: none;
  }

  .add-btn {
    padding: 11px 14px;
  }

  .book-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}

/* Plugin toggle entry button */
.plugins-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated, #fff);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
  flex-shrink: 0;
  margin-right: 4px;
}

.plugins-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--color-accent);
}

.plugins-btn:active {
  transform: scale(0.94);
}

/* Full-screen overlay for plugins panel on bookshelf */
.plugin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.plugin-panel {
  background: var(--modal-bg);
  color: var(--modal-text);
  border-radius: 18px 18px 0 0;
  width: 100%;
  max-width: 560px;
  height: 65vh;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.25);
  animation: slideUp 350ms cubic-bezier(0.32, 0.72, 0, 1);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

@media (max-width: 768px) {
  .plugin-panel {
    border-radius: 14px 14px 0 0;
    max-height: 60vh;
  }
}
</style>
