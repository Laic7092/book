<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, defineAsyncComponent } from "vue";
import { useBookshelfStore } from "../stores/bookshelf";
import { useUIStore } from "../stores/ui";
import { getBookGradient, getInitial } from "../utils/colors";
import { formatBookToast } from "../utils/constants";
import { validateBookFile } from "../utils/validation";
import type { Book } from "../core/types";

import BookCard from "./BookCard.vue";
import BookListItem from "./BookListItem.vue";
import Popover from "./Popover.vue";
import AppIcon from "./ui/AppIcon.vue";
import LoadingSpinner from "./ui/LoadingSpinner.vue";

const ModalWrapper = defineAsyncComponent(() => import("./modals/ModalWrapper.vue"));
const ToastNotification = defineAsyncComponent(() => import("./ToastNotification.vue"));
const ConfirmDialog = defineAsyncComponent(() => import("./ConfirmDialog.vue"));
import {
  getBookshelfWidgets,
  getBookshelfMenuActions,
  pluginStateVersion,
} from "../core/plugin-runtime/registry";
import { loadPluginsFor } from "../core/plugin-runtime/loader";
import { currentRoute, navigate } from "../utils/router";

loadPluginsFor("bookshelf");

const emit = defineEmits<{
  (e: "book:delete", bookId: string): void;
}>();

const bookshelfStore = useBookshelfStore();
const uiStore = useUIStore();

function closeModal() {
  uiStore.activeModal = null;
}

const searchFocused = ref(false);
const viewMode = ref<"card" | "list">("card");

const bookshelfWidgets = computed(() => {
  void pluginStateVersion.value;
  return getBookshelfWidgets();
});

const bookshelfMenuActions = computed(() => {
  void pluginStateVersion.value;
  return getBookshelfMenuActions();
});

// ── Folder dropdown state ──
const folderDropdownBookId = ref<string | null>(null);
const folderDropdownOpen = ref(false);
const folderDropdownPos = ref({ x: 0, y: 0 });

function toggleFolderDropdown(bookId: string, e: MouseEvent) {
  e.stopPropagation();
  if (folderDropdownBookId.value === bookId && folderDropdownOpen.value) {
    folderDropdownOpen.value = false;
  } else {
    folderDropdownBookId.value = bookId;
    folderDropdownOpen.value = true;
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    folderDropdownPos.value = {
      x: rect.left,
      y: rect.bottom + 4,
    };
  }
}

function closeDropdown() {
  folderDropdownOpen.value = false;
  folderDropdownBookId.value = null;
}

function handleMoveToFolder(folderId: string | null) {
  if (folderDropdownBookId.value) {
    bookshelfStore.moveToFolder(folderDropdownBookId.value, folderId);
  }
  closeDropdown();
}

// ── Folder context menu state ──
const folderCtxId = ref<string | null>(null);
const folderCtxPos = ref({ x: 0, y: 0 });

function onFolderContextMenu(folderId: string, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  folderCtxId.value = folderId;
  folderCtxPos.value = { x: e.clientX, y: e.clientY };
}

function closeFolderCtx() {
  folderCtxId.value = null;
}

function renameFolderCtx() {
  const folder = bookshelfStore.folders.find((f) => f.id === folderCtxId.value);
  if (folder) {
    const name = prompt("Rename folder:", folder.name);
    if (name && name.trim()) {
      bookshelfStore.renameFolder(folder.id, name.trim());
    }
  }
  closeFolderCtx();
}

function deleteFolderCtx() {
  if (folderCtxId.value) {
    bookshelfStore.deleteFolder(folderCtxId.value);
  }
  closeFolderCtx();
}

// ── New folder ──
const showNewFolderInput = ref(false);
const newFolderName = ref("");

function createNewFolder() {
  const name = newFolderName.value.trim();
  if (name) {
    bookshelfStore.createFolder(name);
  }
  showNewFolderInput.value = false;
  newFolderName.value = "";
}

// ── Click outside handler for dropdowns ──
function onDocumentClick() {
  closeDropdown();
  closeFolderCtx();
  if (showNewFolderInput.value) {
    createNewFolder();
  }
}

// ── Existing code below ──
const sortBy = ref<"recent" | "title-asc" | "title-desc" | "author-asc" | "added">("recent");
const showMenu = ref(false);
const menuBtnRef = ref<HTMLElement | null>(null);
const menuPos = ref({ x: 0, y: 0 });

function toggleMenu() {
  if (!showMenu.value && menuBtnRef.value) {
    const rect = menuBtnRef.value.getBoundingClientRect();
    menuPos.value = {
      x: rect.right,
      y: rect.bottom + 6,
    };
  }
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
    if (!result) return;
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
  uiStore.setTransitioning(true);
  navigate("/reader/" + book.id);
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
  bookshelfStore.loadFolders();
  document.addEventListener("click", onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
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
            <AppIcon name="search" class="search-icon" :size="15" />
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
              <AppIcon name="close" :size="13" />
            </button>
          </div>
        </div>

        <div class="header-actions">
          <label class="btn-add" :class="{ uploading: bookshelfStore.isUploading }">
            <AppIcon name="plus" :size="15" />
            <span>{{ bookshelfStore.isUploading ? "Adding…" : "Add" }}</span>
            <input
              type="file"
              accept=".txt,.epub,.pdf,.cbz"
              @change="handleFileUpload"
              hidden
              :disabled="bookshelfStore.isUploading"
            />
          </label>
          <div class="menu-wrapper">
            <button
              ref="menuBtnRef"
              class="btn-menu"
              :class="{ open: showMenu }"
              @click.stop="toggleMenu"
              aria-label="Options"
            >
              <AppIcon name="dots" :size="16" />
            </button>
            <Popover
              :open="showMenu"
              :x="menuPos.x"
              :y="menuPos.y"
              placement="bottom-right"
              style="min-width: 200px"
              @close="closeMenu"
            >
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
                  <AppIcon name="grid" :size="14" />
                  <span>Grid</span>
                  <AppIcon
                    v-if="viewMode === 'card'"
                    name="check"
                    class="check-icon"
                    :size="13"
                    :stroke-width="2.5"
                  />
                </button>
                <button
                  class="menu-item"
                  :class="{ checked: viewMode === 'list' }"
                  @click="
                    viewMode = 'list';
                    closeMenu();
                  "
                >
                  <AppIcon name="list" :size="14" />
                  <span>List</span>
                  <AppIcon
                    v-if="viewMode === 'list'"
                    name="check"
                    class="check-icon"
                    :size="13"
                    :stroke-width="2.5"
                  />
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
                  <AppIcon
                    v-if="sortBy === opt.value"
                    name="check"
                    class="check-icon"
                    :size="13"
                    :stroke-width="2.5"
                  />
                </button>
              </div>
              <div v-if="bookshelfMenuActions.length" class="menu-divider"></div>
              <button
                v-for="action in bookshelfMenuActions"
                :key="action.id"
                class="menu-item"
                @click="
                  if (action.modal) uiStore.activeModal = action.modal;
                  else action.onClick?.();
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
                  v-html="action.icon"
                ></svg>
                <span>{{ action.label }}</span>
              </button>
              <div class="menu-divider"></div>
              <button
                class="menu-item"
                @click="
                  uiStore.activeModal = 'plugins';
                  closeMenu();
                "
              >
                <AppIcon name="sliders" :size="14" />
                <span>Plugins</span>
              </button>
            </Popover>
          </div>
        </div>
      </div>

      <!-- Plugin widgets (e.g. stats bar) -->
      <component v-for="(comp, i) in bookshelfWidgets" :key="i" :is="comp" />
    </header>

    <!-- Folder filter chips -->
    <div class="folder-bar">
      <button
        class="folder-chip"
        :class="{ active: !bookshelfStore.selectedFolderId }"
        @click="bookshelfStore.setSelectedFolder(null)"
      >
        All
      </button>
      <button
        v-for="folder in bookshelfStore.folders"
        :key="folder.id"
        class="folder-chip"
        :class="{ active: bookshelfStore.selectedFolderId === folder.id }"
        @click="bookshelfStore.setSelectedFolder(folder.id)"
        @contextmenu="onFolderContextMenu(folder.id, $event)"
      >
        {{ folder.name }}
      </button>
      <div class="new-folder-wrap">
        <button
          v-if="!showNewFolderInput"
          class="folder-chip new-folder-btn"
          @click.stop="showNewFolderInput = true"
          title="New folder"
        >
          <AppIcon name="plus" :size="12" :stroke-width="2.5" />
        </button>
        <input
          v-else
          ref="newFolderInputEl"
          v-model="newFolderName"
          class="new-folder-input"
          placeholder="Folder name"
          @keydown.enter="createNewFolder"
          @keydown.escape="
            showNewFolderInput = false;
            newFolderName = '';
          "
          @click.stop
        />
      </div>
    </div>

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
        <LoadingSpinner size="lg" label="Adding volume to library…" block />
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
            accept=".txt,.epub,.pdf,.cbz"
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
              <BookCard
                v-for="(book, idx) in group.books"
                :key="book.id"
                :book="book"
                :cover-url="coverUrls.get(book.id)"
                :gradient="bookGradients.get(book.id)!"
                :initial="bookInitials.get(book.id)!"
                :delay-ms="idx * 30"
                @open="selectBook(book)"
                @delete="confirmDelete(book.id, $event)"
                @move-folder="toggleFolderDropdown(book.id, $event)"
              />
            </div>
          </div>
        </template>

        <!-- Ungridded shelf when not alpha-sorted -->
        <div v-else class="book-grid">
          <BookCard
            v-for="(book, idx) in sortedBooks"
            :key="book.id"
            :book="book"
            :cover-url="coverUrls.get(book.id)"
            :gradient="bookGradients.get(book.id)!"
            :initial="bookInitials.get(book.id)!"
            :delay-ms="idx * 30"
            @open="selectBook(book)"
            @delete="confirmDelete(book.id, $event)"
            @move-folder="toggleFolderDropdown(book.id, $event)"
          />
        </div>
      </template>

      <!-- List View -->
      <div v-else-if="sortedBooks.length > 0 && viewMode === 'list'" class="book-list">
        <BookListItem
          v-for="book in sortedBooks"
          :key="book.id"
          :book="book"
          :cover-url="coverUrls.get(book.id)"
          :gradient="bookGradients.get(book.id)!"
          :initial="bookInitials.get(book.id)!"
          :folder-name="bookshelfStore.folders.find((f) => f.id === book.folderId)?.name"
          @open="selectBook(book)"
          @delete="confirmDelete(book.id, $event)"
          @move-folder="toggleFolderDropdown(book.id, $event)"
        />
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

    <ToastNotification v-if="uiStore.showToast" />
    <ConfirmDialog v-if="uiStore.showConfirm" />

    <!-- Modal container (plugin modals: OPDS, stats, etc.) -->
    <ModalWrapper
      v-if="uiStore.activeModal && currentRoute.name === 'bookshelf'"
      :modal-type="uiStore.activeModal"
      @close="closeModal"
    />

    <!-- Folder assignment dropdown -->
    <Popover
      :open="folderDropdownOpen"
      :x="folderDropdownPos.x"
      :y="folderDropdownPos.y"
      style="min-width: 170px"
      @close="closeDropdown"
    >
      <div class="folder-dropdown-header">Move to folder</div>
      <button
        class="folder-dropdown-item"
        :class="{
          selected: !bookshelfStore.books.find((b) => b.id === folderDropdownBookId)?.folderId,
        }"
        @click="handleMoveToFolder(null)"
      >
        <AppIcon name="folder" :size="14" />
        Uncategorized
      </button>
      <button
        v-for="folder in bookshelfStore.folders"
        :key="folder.id"
        class="folder-dropdown-item"
        :class="{
          selected:
            bookshelfStore.books.find((b) => b.id === folderDropdownBookId)?.folderId === folder.id,
        }"
        @click="handleMoveToFolder(folder.id)"
      >
        {{ folder.name }}
      </button>
    </Popover>

    <!-- Folder context menu -->
    <Popover
      :open="!!folderCtxId"
      :x="folderCtxPos.x"
      :y="folderCtxPos.y"
      style="min-width: 130px"
      @close="closeFolderCtx"
    >
      <button class="ctx-item" @click="renameFolderCtx">Rename</button>
      <button class="ctx-item ctx-danger" @click="deleteFolderCtx">Delete</button>
    </Popover>
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
  background: var(--reader-bg);
  color: var(--reader-text);
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
  border-bottom: 1px solid var(--border);
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
  color: var(--accent);
  opacity: 0.7;
  flex-shrink: 0;
}

.bookshelf-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.02em;
  color: var(--reader-text);
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
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
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
  color: var(--text-secondary);
  pointer-events: none;
  transition: color var(--transition-fast);
}

.search-container.focused .search-icon {
  color: var(--accent);
}

.search-input {
  width: 100%;
  padding: 8px 34px 8px 36px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--reader-text);
  font-family: var(--font-ui);
  transition: all var(--transition-fast);
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--reader-bg);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search-clear {
  position: absolute;
  right: 5px;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-fast);
}

.search-clear:hover {
  color: var(--reader-text);
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
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-md);
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
  box-shadow: 0 4px 14px var(--accent-soft);
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
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-menu:hover,
.btn-menu.open {
  border-color: var(--accent);
  color: var(--reader-text);
}

/* ==========================================
   MENU POPOVER
   ========================================== */

.menu-section {
  display: flex;
  flex-direction: column;
}

.menu-label {
  padding: 6px 10px 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
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
  color: var(--reader-text);
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
  color: var(--text-secondary);
}

.menu-item span {
  flex: 1;
}

.check-icon {
  flex-shrink: 0;
  color: var(--accent);
}

.menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 8px;
}

/* Menu pop transition */

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
  color: var(--reader-text);
  line-height: 1;
  letter-spacing: -0.02em;
}

.shelf-rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    var(--border) 0%,
    var(--border-subtle) 70%,
    transparent 100%
  );
}

.shelf-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
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

/* ==========================================
   EMPTY STATE
   ========================================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  animation: fadeInUp 0.7s ease-out;
}

.empty-symbol {
  margin-bottom: 28px;
  animation: floatSymbol 3s ease-in-out infinite;
}

.empty-symbol-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  transition: all var(--transition-base);
}

.empty-state:hover .empty-symbol-inner {
  border-color: var(--accent-muted);
  color: var(--accent);
  background: var(--accent-soft);
  transform: scale(1.03);
}

@keyframes floatSymbol {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

.empty-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  margin: 0 0 10px;
  color: var(--reader-text);
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
   LIST VIEW
   ========================================== */

.book-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  color: var(--reader-text);
}

/* ═══════════════════════════════════════════════
   FOLDER BAR + CHIPS
   ═══════════════════════════════════════════════ */

.folder-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  margin-bottom: 18px;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.folder-bar::-webkit-scrollbar {
  display: none;
}

.folder-chip {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  line-height: 1.3;
}

.folder-chip:hover {
  border-color: var(--accent);
  color: var(--reader-text);
}

.folder-chip.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

.new-folder-btn {
  padding: 5px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-folder-wrap {
  flex-shrink: 0;
}

.new-folder-input {
  width: 110px;
  padding: 5px 10px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--bg-elevated);
  color: var(--reader-text);
  font-size: 12px;
  font-family: var(--font-ui);
  outline: none;
}

/* ═══════════════════════════════════════════════
   FOLDER TAG ON CARD
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   FOLDER DROPDOWN
   ═══════════════════════════════════════════════ */

.folder-dropdown-header {
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-ui);
}

.folder-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--reader-text);
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
}

.folder-dropdown-item:hover {
  background: var(--bg-secondary);
}

.folder-dropdown-item.selected {
  color: var(--accent);
  font-weight: 600;
}

.folder-dropdown-item svg {
  flex-shrink: 0;
  color: var(--text-secondary);
}

/* ═══════════════════════════════════════════════
   FOLDER CONTEXT MENU
   ═══════════════════════════════════════════════ */

.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--reader-text);
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
}

.ctx-item:hover {
  background: var(--bg-secondary);
}

.ctx-danger {
  color: var(--color-danger);
}

.ctx-danger:hover {
  background: var(--color-danger-soft);
}

/* ═══════════════════════════════════════════════
   KEYFRAMES
   ═══════════════════════════════════════════════ */

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

/* Fade transition */

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

  .folder-bar {
    margin-bottom: 16px;
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

  .book-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .shelf-header {
    margin-bottom: 14px;
  }

  .shelf-letter {
    font-size: 22px;
  }

  .folder-bar {
    gap: 4px;
    margin-bottom: 14px;
  }

  .folder-chip {
    padding: 4px 10px;
    font-size: 11px;
  }

  .new-folder-input {
    width: 90px;
  }
}
</style>
