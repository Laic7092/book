<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useBookshelfStore } from "../stores/bookshelf";
import { useUIStore } from "../stores/ui";
import { getBookGradient, getInitial } from "../config/colors";
import { formatBookToast } from "../utils/toast";
import { validateBookFile } from "../utils/validation";
import type { Book } from "../core/types";
import { ModalWrapper } from "./modals";
import { getBookshelfWidgets, pluginStateVersion } from "../plugins/registry";

const emit = defineEmits<{
  (e: "book:select", book: Book): void;
  (e: "book:delete", bookId: string): void;
}>();

const bookshelfStore = useBookshelfStore();
const uiStore = useUIStore();

function closePluginsModal() {
  uiStore.activeModal = null;
}

const searchFocused = ref(false);
const viewMode = ref<"card" | "list">("card");

const bookshelfWidgets = computed(() => {
  void pluginStateVersion.value;
  return getBookshelfWidgets();
});
const sortBy = ref<"recent" | "title-asc" | "title-desc" | "author-asc" | "added">("recent");
const showMenu = ref(false);

function toggleMenu() {
  showMenu.value = !showMenu.value;
}

function closeMenu() {
  showMenu.value = false;
}

const sortOptions = [
  { value: "recent", label: "Recently Read" },
  { value: "added", label: "Recently Added" },
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
  { value: "author-asc", label: "Author A–Z" },
] as const;

const sortedBooks = computed(() => {
  const books = [...bookshelfStore.filteredBooks];
  switch (sortBy.value) {
    case "title-asc":
      return books.sort((a, b) => a.title.localeCompare(b.title));
    case "title-desc":
      return books.sort((a, b) => b.title.localeCompare(a.title));
    case "author-asc":
      return books.sort((a, b) => (a.author || "").localeCompare(b.author || ""));
    case "added":
      return books.sort((a, b) => b.addedAt - a.addedAt);
    case "recent":
    default:
      return books.sort((a, b) => {
        const aTime = a.lastReadAt || a.addedAt;
        const bTime = b.lastReadAt || b.addedAt;
        return bTime - aTime;
      });
  }
});

const isAlphaSort = computed(() => sortBy.value === "title-asc" || sortBy.value === "title-desc");

interface BookGroup {
  letter: string;
  books: Book[];
}

const groupedBooks = computed(() => {
  if (!isAlphaSort.value) return null;
  const groups: BookGroup[] = [];
  for (const book of sortedBooks.value) {
    const letter = book.title.charAt(0).toUpperCase();
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) {
      last.books.push(book);
    } else {
      groups.push({ letter, books: [book] });
    }
  }
  return groups;
});

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
      <div class="header-bar">
        <div class="header-brand">
          <svg
            class="header-mark"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            <path d="M12 6v7" />
            <path d="M9 9l3-3 3 3" />
          </svg>
          <h1 class="bookshelf-title">Library</h1>
          <span class="title-count">{{ bookshelfStore.books.length }}</span>
        </div>

        <div class="header-search">
          <div class="search-container" :class="{ focused: searchFocused }">
            <svg
              class="search-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              v-model="bookshelfStore.searchQuery"
              type="text"
              placeholder="Search titles, authors..."
              class="search-input"
              @focus="searchFocused = true"
              @blur="searchFocused = false"
            />
            <button
              v-if="bookshelfStore.searchQuery"
              class="search-clear"
              @click="bookshelfStore.setSearchQuery('')"
              aria-label="Clear search"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div class="header-actions">
          <label class="btn-add" :class="{ uploading: bookshelfStore.isUploading }">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>{{ bookshelfStore.isUploading ? "Adding…" : "Add" }}</span>
            <input
              type="file"
              accept=".txt,.epub"
              @change="handleFileUpload"
              hidden
              :disabled="bookshelfStore.isUploading"
            />
          </label>
          <div class="menu-wrapper">
            <button
              class="btn-menu"
              :class="{ open: showMenu }"
              @click.stop="toggleMenu"
              aria-label="Options"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              >
                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <transition name="menu-pop">
              <div v-if="showMenu" class="menu-popover" @click.stop>
                <div class="menu-section">
                  <div class="menu-label">View</div>
                  <button
                    class="menu-item"
                    :class="{ checked: viewMode === 'card' }"
                    @click="
                      viewMode = 'card';
                      closeMenu();
                    "
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <span>Grid</span>
                    <svg
                      v-if="viewMode === 'card'"
                      class="check-icon"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    class="menu-item"
                    :class="{ checked: viewMode === 'list' }"
                    @click="
                      viewMode = 'list';
                      closeMenu();
                    "
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <circle cx="4" cy="6" r="1" fill="currentColor" />
                      <circle cx="4" cy="12" r="1" fill="currentColor" />
                      <circle cx="4" cy="18" r="1" fill="currentColor" />
                    </svg>
                    <span>List</span>
                    <svg
                      v-if="viewMode === 'list'"
                      class="check-icon"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
                <div class="menu-divider"></div>
                <div class="menu-section">
                  <div class="menu-label">Sort by</div>
                  <button
                    v-for="opt in sortOptions"
                    :key="opt.value"
                    class="menu-item"
                    :class="{ checked: sortBy === opt.value }"
                    @click="
                      sortBy = opt.value;
                      closeMenu();
                    "
                  >
                    <span>{{ opt.label }}</span>
                    <svg
                      v-if="sortBy === opt.value"
                      class="check-icon"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
                <div class="menu-divider"></div>
                <button
                  class="menu-item"
                  @click="
                    uiStore.activeModal = 'plugins';
                    closeMenu();
                  "
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  >
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                  </svg>
                  <span>Plugins</span>
                </button>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- Plugin widgets (e.g. stats bar) -->
      <component v-for="(comp, i) in bookshelfWidgets" :key="i" :is="comp" />
    </header>

    <!-- Content Area -->
    <div class="bookshelf-content">
      <!-- Loading State -->
      <div v-if="bookshelfStore.isLoading" class="loading-shelves">
        <div v-for="s in 3" :key="s" class="shelf-group-skel">
          <div class="shelf-header-skel skeleton"></div>
          <div class="loading-grid">
            <div v-for="i in 4" :key="i" class="book-card-skeleton">
              <div class="cover-skeleton skeleton"></div>
              <div class="info-skeleton">
                <div class="title-skeleton skeleton"></div>
                <div class="author-skeleton skeleton"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Upload Loading -->
      <div v-else-if="bookshelfStore.isUploading" class="uploading-state">
        <div class="upload-spinner"></div>
        <p>Adding volume to library…</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="bookshelfStore.books.length === 0" class="empty-state">
        <div class="empty-symbol">
          <div class="empty-symbol-inner">
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              stroke-linecap="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            </svg>
          </div>
        </div>
        <h2 class="empty-title">Your library awaits</h2>
        <p class="empty-desc">Fill these shelves with the stories that matter to you.</p>
        <label class="btn-add btn-add-large">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add your first book
          <input
            type="file"
            accept=".txt,.epub"
            @change="handleFileUpload"
            hidden
            :disabled="bookshelfStore.isUploading"
          />
        </label>
      </div>

      <!-- Card Grid (alphabetical shelves) -->
      <template v-else-if="viewMode === 'card'">
        <template v-if="groupedBooks">
          <div v-for="group in groupedBooks" :key="group.letter" class="shelf-group">
            <div class="shelf-header">
              <span class="shelf-letter">{{ group.letter }}</span>
              <span class="shelf-rule"></span>
              <span class="shelf-count">{{ group.books.length }}</span>
            </div>
            <div class="book-grid">
              <div
                v-for="(book, idx) in group.books"
                :key="book.id"
                class="book-card"
                :style="{ animationDelay: `${idx * 0.03}s` }"
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
                  <span v-else class="cover-initial" aria-hidden="true">{{
                    bookInitials.get(book.id)
                  }}</span>
                  <span class="cover-format">{{ book.format.toUpperCase() }}</span>
                </div>
                <div class="book-info">
                  <h3 class="book-title" :title="book.title">{{ book.title }}</h3>
                  <p class="book-author" :class="{ unknown: !book.author }">
                    {{ book.author || "Unknown author" }}
                  </p>
                  <div v-if="book.lastReadAt" class="book-meta">
                    <span class="meta-dot"></span>
                    <span class="meta-date">{{
                      new Date(book.lastReadAt).toLocaleDateString()
                    }}</span>
                  </div>
                </div>
                <button
                  class="btn-delete"
                  @click="confirmDelete(book.id, $event)"
                  title="Delete book"
                  aria-label="Delete book"
                  tabindex="0"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Ungridded shelf when not alpha-sorted -->
        <div v-else class="book-grid">
          <div
            v-for="(book, idx) in sortedBooks"
            :key="book.id"
            class="book-card"
            :style="{ animationDelay: `${idx * 0.03}s` }"
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
              <span v-else class="cover-initial" aria-hidden="true">{{
                bookInitials.get(book.id)
              }}</span>
              <span class="cover-format">{{ book.format.toUpperCase() }}</span>
            </div>
            <div class="book-info">
              <h3 class="book-title" :title="book.title">{{ book.title }}</h3>
              <p class="book-author" :class="{ unknown: !book.author }">
                {{ book.author || "Unknown author" }}
              </p>
              <div v-if="book.lastReadAt" class="book-meta">
                <span class="meta-dot"></span>
                <span class="meta-date">{{ new Date(book.lastReadAt).toLocaleDateString() }}</span>
              </div>
            </div>
            <button
              class="btn-delete"
              @click="confirmDelete(book.id, $event)"
              title="Delete book"
              aria-label="Delete book"
              tabindex="0"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </template>

      <!-- List View -->
      <div v-else-if="sortedBooks.length > 0 && viewMode === 'list'" class="book-list">
        <div
          v-for="book in sortedBooks"
          :key="book.id"
          class="book-list-item"
          @click="selectBook(book)"
          tabindex="0"
          @keydown.enter="selectBook(book)"
          role="button"
          :aria-label="`Open ${book.title} by ${book.author || 'Unknown author'}`"
        >
          <div class="list-cover" :style="{ background: bookGradients.get(book.id) }">
            <img
              v-if="coverUrls.get(book.id)"
              :src="coverUrls.get(book.id)"
              :alt="`Cover of ${book.title}`"
              class="list-cover-img"
            />
            <span v-else class="list-cover-initial" aria-hidden="true">{{
              bookInitials.get(book.id)
            }}</span>
          </div>
          <div class="list-info">
            <h3 class="list-title">{{ book.title }}</h3>
            <p class="list-author">{{ book.author || "Unknown author" }}</p>
          </div>
          <div class="list-meta">
            <span class="list-format">{{ book.format.toUpperCase() }}</span>
            <span v-if="book.lastReadAt" class="list-last-read">{{
              new Date(book.lastReadAt).toLocaleDateString()
            }}</span>
          </div>
          <button
            class="btn-delete"
            @click="confirmDelete(book.id, $event)"
            title="Delete book"
            aria-label="Delete book"
            tabindex="0"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- No search results -->
      <div
        v-if="
          bookshelfStore.books.length > 0 && sortedBooks.length === 0 && bookshelfStore.searchQuery
        "
        class="no-results"
      >
        <p>
          No results for <strong>"{{ bookshelfStore.searchQuery }}"</strong>
        </p>
      </div>
    </div>

    <!-- Toast -->
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
          class="toast-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <svg
          v-else
          class="toast-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div class="toast-content">
          <span class="toast-title">{{ uiStore.toastTitle }}</span>
          <span class="toast-desc">{{ uiStore.toastMessage }}</span>
        </div>
      </div>
    </transition>

    <!-- Confirm Dialog -->
    <transition name="fade">
      <div
        v-if="uiStore.showConfirm"
        class="confirm-backdrop"
        @click.self="uiStore.cancelConfirmation()"
      >
        <div class="confirm-dialog">
          <h3 class="confirm-title">{{ uiStore.confirmTitle }}</h3>
          <p class="confirm-message">{{ uiStore.confirmMessage }}</p>
          <div class="confirm-actions">
            <button class="confirm-btn" @click="uiStore.cancelConfirmation()">Cancel</button>
            <button class="confirm-btn confirm-danger" @click="uiStore.confirm()">Delete</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Plugins Panel -->
    <ModalWrapper
      v-if="uiStore.activeModal === 'plugins'"
      modal-type="plugins"
      @close="closePluginsModal"
    />
  </div>
</template>

<style scoped>
/* ============================================
   BOOKSHELF — Private Library Aesthetic
   Warm, tactile, wood-and-paper atmosphere
   ============================================ */

.bookshelf {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 40px 56px 0;
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
  overflow: hidden;
}

/* ----- Scrollable content ----- */
.bookshelf-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 40px;
  scroll-behavior: smooth;
}

/* ==========================================
   HEADER
   ========================================== */

.bookshelf-header {
  flex-shrink: 0;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-color);
}

.header-bar {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* Brand + Title */
.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.header-mark {
  color: var(--color-accent);
  opacity: 0.7;
  flex-shrink: 0;
}

.bookshelf-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
  white-space: nowrap;
}

.title-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  background: var(--color-accent);
  color: #fff;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-ui);
}

/* ----- Search ----- */
.header-search {
  flex: 1;
  display: flex;
  justify-content: center;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 380px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
  transition: color var(--transition-fast);
}

.search-container.focused .search-icon {
  color: var(--color-accent);
}

.search-input {
  width: 100%;
  padding: 8px 34px 8px 36px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: var(--font-ui);
  transition: all var(--transition-fast);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent);
  background: var(--bg-primary);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}

.search-clear {
  position: absolute;
  right: 5px;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-fast);
}

.search-clear:hover {
  color: var(--text-primary);
}

/* ----- Header actions ----- */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Add button */
.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-accent);
  color: #fff;
  border-radius: 9px;
  cursor: pointer;
  font-weight: 550;
  font-size: 13px;
  font-family: var(--font-ui);
  transition: all var(--transition-fast);
  line-height: 1;
  white-space: nowrap;
  height: 36px;
  box-sizing: border-box;
  border: none;
}

.btn-add:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px var(--color-accent-soft);
}

.btn-add:active {
  transform: scale(0.97) translateY(0);
}

.btn-add.uploading {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-add svg {
  flex-shrink: 0;
}

/* Menu button */
.btn-menu {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-menu:hover,
.btn-menu.open {
  border-color: var(--color-accent);
  color: var(--text-primary);
}

/* ==========================================
   MENU POPOVER
   ========================================== */

.menu-popover {
  position: fixed;
  top: 62px;
  right: 48px;
  min-width: 200px;
  padding: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 1001;
}

.menu-section {
  display: flex;
  flex-direction: column;
}

.menu-label {
  padding: 6px 10px 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-ui);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
}

.menu-item:hover {
  background: var(--bg-secondary);
}

.menu-item svg:first-child {
  flex-shrink: 0;
  color: var(--text-muted);
}

.menu-item span {
  flex: 1;
}

.check-icon {
  flex-shrink: 0;
  color: var(--color-accent);
}

.menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 8px;
}

/* Menu pop transition */
.menu-pop-enter-active {
  transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.menu-pop-leave-active {
  transition: all 0.12s ease-in;
}
.menu-pop-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

/* ==========================================
   SHELF GROUP
   ========================================== */

.shelf-group {
  margin-bottom: 36px;
  animation: fadeIn 0.5s ease-out backwards;
}

.shelf-group:last-child {
  margin-bottom: 0;
}

.shelf-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding: 0 2px;
}

.shelf-letter {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.02em;
}

.shelf-rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    var(--border-color) 0%,
    var(--border-subtle) 70%,
    transparent 100%
  );
}

.shelf-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  font-family: var(--font-ui);
}

/* ==========================================
   LOADING STATE
   ========================================== */

.loading-shelves {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.shelf-header-skel {
  height: 26px;
  width: 80px;
  margin-bottom: 18px;
}

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
  border-radius: 9px;
}

.info-skeleton {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.title-skeleton {
  height: 18px;
  width: 85%;
  border-radius: 5px;
}

.author-skeleton {
  height: 14px;
  width: 55%;
  border-radius: 4px;
}

/* ==========================================
   UPLOADING STATE
   ========================================== */

.uploading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 20px;
  gap: 20px;
  color: var(--text-secondary);
}

.upload-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border-color);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ==========================================
   EMPTY STATE
   ========================================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
  text-align: center;
  animation: fadeInUp 0.7s ease-out;
}

.empty-symbol {
  margin-bottom: 28px;
}

.empty-symbol-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  transition: all var(--transition-base);
}

.empty-state:hover .empty-symbol-inner {
  border-color: var(--color-accent-muted);
  color: var(--color-accent);
  background: var(--color-accent-soft);
  transform: scale(1.03);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  margin: 0 0 10px;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.empty-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 28px;
  max-width: 340px;
  line-height: 1.6;
}

.btn-add-large {
  margin-top: 4px;
  padding: 13px 28px;
  font-size: 14px;
  height: auto;
}

/* ==========================================
   BOOK GRID
   ========================================== */

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 28px;
}

/* ==========================================
   BOOK CARD
   ========================================== */

.book-card {
  position: relative;
  background: var(--bg-elevated);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all var(--transition-base);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  animation: fadeInUp 0.45s ease-out backwards;
  box-shadow: var(--shadow-xs);
}

.book-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 12px;
  pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.book-card:hover {
  transform: translateY(-5px);
  box-shadow: var(--shadow-lg);
  border-color: transparent;
}

.book-card:active {
  transform: translateY(-2px);
}

.book-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Cover */
.book-cover {
  position: relative;
  aspect-ratio: 3/4;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
  box-shadow:
    var(--shadow-sm),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  transition:
    transform var(--transition-base),
    box-shadow var(--transition-base);
}

.book-card:hover .book-cover {
  transform: scale(1.04);
  box-shadow:
    var(--shadow-md),
    0 8px 20px rgba(0, 0, 0, 0.18);
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
  font-weight: 500;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-base);
}

.book-card:hover .cover-initial {
  transform: scale(1.1);
}

.cover-format {
  position: absolute;
  bottom: 7px;
  right: 7px;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(6px);
  letter-spacing: 0.04em;
  transition: background var(--transition-fast);
}

/* Info */
.book-info {
  flex: 1;
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
  line-height: 1.35;
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

.book-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.meta-dot {
  width: 4px;
  height: 4px;
  background: var(--color-accent);
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.7;
}

.meta-date {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-ui);
}

/* Delete button */
.btn-delete {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: none;
  background: rgba(255, 255, 255, 0.93);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.85);
  transition: all var(--transition-fast);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 1;
}

.book-card:hover .btn-delete {
  opacity: 1;
  transform: scale(1);
}

.btn-delete:hover {
  background: #fef2f2;
  color: #dc2626;
  box-shadow: 0 3px 10px rgba(220, 38, 38, 0.18);
}

.btn-delete:active {
  transform: scale(0.92);
}

/* ==========================================
   LIST VIEW
   ========================================== */

.book-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.book-list-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--transition-fast);
  animation: fadeInUp 0.3s ease-out backwards;
}

.book-list-item:hover {
  background: var(--bg-secondary);
}

.book-list-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.book-list-item:hover .btn-delete {
  opacity: 1;
  transform: scale(1);
}

.list-cover {
  position: relative;
  width: 38px;
  height: 52px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.list-cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-cover-initial {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.list-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.list-author {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.list-format {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.04em;
}

.list-last-read {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-ui);
}

/* ==========================================
   NO RESULTS
   ========================================== */

.no-results {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.no-results p {
  font-size: 14px;
  margin: 0;
}

.no-results strong {
  color: var(--text-primary);
}

/* ==========================================
   TOAST
   ========================================== */

.toast {
  position: fixed;
  top: max(16px, env(safe-area-inset-top, 16px));
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 11px;
  padding: 13px 17px;
  background: rgba(31, 26, 23, 0.9);
  color: #f7f5f2;
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  font-family: var(--font-ui);
  z-index: 3000;
  backdrop-filter: blur(16px) saturate(180%);
  max-width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}

.toast--error {
  background: rgba(180, 30, 30, 0.9);
  box-shadow: 0 8px 32px rgba(180, 30, 30, 0.2);
}

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

.toast-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.toast-icon:first-child {
  color: #4ade80;
}
.toast--error .toast-icon {
  color: #fca5a5;
}

.toast-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.toast-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toast-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
  color: rgba(247, 245, 242, 0.65);
}
.toast--error .toast-desc {
  color: rgba(255, 255, 255, 0.7);
}

/* ==========================================
   CONFIRM DIALOG
   ========================================== */

.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  animation: fadeIn 0.2s ease-out;
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  background: var(--bg-primary);
  border-radius: 14px;
  padding: 28px;
  max-width: 340px;
  width: 90%;
  animation: scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid var(--border-color);
}

.confirm-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 22px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 11px 16px;
  border-radius: 9px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-ui);
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.confirm-btn:hover {
  background: var(--bg-tertiary);
}

.confirm-danger {
  background: #dc2626;
  color: #fff;
}

.confirm-danger:hover {
  background: #b91c1c !important;
}

/* ==========================================
   KEYFRAMES
   ========================================== */

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
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

/* ==========================================
   RESPONSIVE
   ========================================== */

@media (max-width: 900px) {
  .bookshelf {
    padding: 28px 28px 0;
  }
  .bookshelf-content {
    padding-bottom: 28px;
  }
  .book-grid {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 24px;
  }
  .stats-bar {
    padding-left: 0;
  }
}

@media (max-width: 600px) {
  .bookshelf {
    padding: 20px 16px 0;
  }
  .bookshelf-content {
    padding-bottom: 20px;
  }
  .bookshelf-header {
    margin-bottom: 18px;
    padding-bottom: 14px;
  }
  .header-bar {
    gap: 10px;
  }
  .bookshelf-title {
    font-size: 19px;
  }
  .header-brand .header-mark {
    display: none;
  }
  .btn-add span {
    display: none;
  }
  .btn-add {
    padding: 8px 10px;
  }
  .stats-bar {
    flex-wrap: wrap;
    gap: 8px 14px;
    padding-left: 0;
  }
  .stat-sep {
    display: none;
  }
  .book-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .list-meta {
    display: none;
  }
  .shelf-header {
    margin-bottom: 14px;
  }
  .shelf-letter {
    font-size: 22px;
  }
}
</style>
