<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { readerCore } from "../core/reader";
import { searchInBook } from "../search/engine";
import type { Bookmark, SearchResult, ReaderSettings, Chapter, Book } from "../core/types";

const props = defineProps<{
  book: Book;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// State
const chapters = ref<Chapter[]>([]);
const currentChapterId = ref<string | null>(null);
const content = ref("");
const bookmarks = ref<Bookmark[]>([]);
const settings = reactive<ReaderSettings>({
  fontSize: 18,
  fontFamily: "system-ui, -apple-system, sans-serif",
  lineHeight: 1.6,
  theme: "light",
  margin: 20,
  columnWidth: 700,
});
const searchResults = ref<SearchResult[]>([]);
const searchQuery = ref("");
const sidebarOpen = ref(false);
const activePanel = ref<"toc" | "search" | "bookmarks" | "settings" | null>(null);

// Chapter navigation
async function selectChapter(chapterId: string) {
  await readerCore.goToChapter(chapterId);
  if (window.innerWidth < 768) closeSidebar();
}

// Panel management
function togglePanel(panel: "toc" | "search" | "bookmarks" | "settings" | null) {
  if (activePanel.value === panel && sidebarOpen.value) {
    closeSidebar();
  } else {
    activePanel.value = panel;
    sidebarOpen.value = true;
    if (panel === "search")
      setTimeout(() => document.querySelector<HTMLInputElement>("#search-input")?.focus(), 100);
  }
}

function closeSidebar() {
  sidebarOpen.value = false;
  activePanel.value = null;
}

// Search
async function doSearch() {
  if (!searchQuery.value) return;
  searchResults.value = searchInBook(props.book.id, searchQuery.value, chapters.value);
}

// Bookmark
async function addBookmark() {
  const chapter = readerCore.getCurrentChapter();
  if (!chapter) return;
  const article = document.querySelector("article");
  const preview = article?.textContent?.slice(0, 100).replace(/\s+/g, " ").trim() || "";
  await readerCore.addBookmark(
    `Bookmark at ${new Date().toLocaleTimeString()}`,
    preview,
    getScrollPercentage(),
  );
}

function getScrollPercentage(): number {
  const main = document.querySelector("main.reader-view");
  if (!main) return 0;
  const { scrollTop, scrollHeight, clientHeight } = main;
  return scrollHeight > 0 ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
}

// Settings
async function updateSettings(newSettings: Partial<ReaderSettings>) {
  Object.assign(settings, newSettings);
  await readerCore.updateSettings(settings);
}

// Theme classes
const themeClass = computed(() => `theme-${settings.theme}`);

// Lifecycle
onMounted(async () => {
  // Register event listeners FIRST, before loading book
  readerCore.on("book:loaded", ({ chapters: chs }) => {
    console.log("[ReaderView] book:loaded event received, chapters:", chs);
    chapters.value = chs;
  });

  readerCore.on("chapter:changed", ({ chapterId, content: text }) => {
    console.log("[ReaderView] chapter:changed event received, chapterId:", chapterId);
    currentChapterId.value = chapterId;
    content.value = text;
  });

  readerCore.on("bookmark:added", ({ bookmark }) => {
    bookmarks.value.push(bookmark);
  });

  readerCore.on("bookmark:removed", ({ bookmarkId }) => {
    bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId);
  });

  // Now load the book
  console.log("[ReaderView] Loading book by ID:", props.book.id);
  const result = await readerCore.loadBookById(props.book.id);
  console.log("[ReaderView] loadBookById returned:", result);

  readerCore.getSettings().then((s) => Object.assign(settings, s));
});
</script>

<template>
  <div class="reader-view-container" :class="themeClass">
    <!-- Header -->
    <header class="reader-header">
      <div class="header-left">
        <button class="back-btn" @click="emit('close')">&#8592; Back</button>
        <h1 class="book-title">{{ book.title }}</h1>
      </div>
      <div class="header-right">
        <button class="header-btn" @click="togglePanel('toc')">&#128214;</button>
        <button class="header-btn" @click="togglePanel('search')">&#128269;</button>
        <button class="header-btn" @click="togglePanel('bookmarks')">&#128204;</button>
        <button class="header-btn" @click="togglePanel('settings')">&#9881;</button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="content-area">
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ open: sidebarOpen }">
        <!-- TOC Panel -->
        <div v-if="activePanel === 'toc'" class="panel">
          <h3>Table of Contents</h3>
          <ul class="toc-list">
            <li v-for="ch in chapters" :key="ch.id">
              <button
                :class="['toc-item', { active: ch.id === currentChapterId }]"
                @click="selectChapter(ch.id)"
              >
                {{ ch.title }}
              </button>
            </li>
          </ul>
        </div>

        <!-- Search Panel -->
        <div v-if="activePanel === 'search'" class="panel">
          <h3>Search</h3>
          <input
            id="search-input"
            v-model="searchQuery"
            type="text"
            placeholder="Search in book..."
            @keyup.enter="doSearch"
            class="search-input"
          />
          <ul class="search-results">
            <li
              v-for="(result, i) in searchResults"
              :key="i"
              class="search-result"
              @click="selectChapter(result.chapterId)"
            >
              <strong>{{ result.chapterTitle }}</strong>
              <p>{{ result.context }}</p>
            </li>
          </ul>
        </div>

        <!-- Bookmarks Panel -->
        <div v-if="activePanel === 'bookmarks'" class="panel">
          <h3>Bookmarks</h3>
          <button class="add-bookmark-btn" @click="addBookmark">Add Bookmark</button>
          <ul class="bookmarks-list">
            <li v-for="bm in bookmarks" :key="bm.id" class="bookmark-item">
              <div class="bookmark-title" @click="selectChapter(bm.chapterId)">
                {{ bm.title }}
              </div>
              <div class="bookmark-preview">{{ bm.contentPreview }}</div>
            </li>
          </ul>
        </div>

        <!-- Settings Panel -->
        <div v-if="activePanel === 'settings'" class="panel">
          <h3>Settings</h3>
          <div class="setting-item">
            <label>Font Size: {{ settings.fontSize }}px</label>
            <input
              type="range"
              min="12"
              max="32"
              :value="settings.fontSize"
              @input="
                updateSettings({ fontSize: Number(($event.target as HTMLInputElement).value) })
              "
            />
          </div>
          <div class="setting-item">
            <label>Line Height: {{ settings.lineHeight }}</label>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.1"
              :value="settings.lineHeight"
              @input="
                updateSettings({ lineHeight: Number(($event.target as HTMLInputElement).value) })
              "
            />
          </div>
          <div class="setting-item">
            <label>Theme</label>
            <select
              :value="settings.theme"
              @change="
                updateSettings({
                  theme: ($event.target as HTMLSelectElement).value as ReaderSettings['theme'],
                })
              "
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="sepia">Sepia</option>
            </select>
          </div>
          <div class="setting-item">
            <label>Column Width: {{ settings.columnWidth }}px</label>
            <input
              type="range"
              min="400"
              max="1000"
              step="50"
              :value="settings.columnWidth"
              @input="
                updateSettings({ columnWidth: Number(($event.target as HTMLInputElement).value) })
              "
            />
          </div>
        </div>
      </aside>

      <!-- Reader View -->
      <main class="reader-view">
        <article
          class="reader-content"
          :style="{
            maxWidth: `${settings.columnWidth}px`,
            margin: '0 auto',
            padding: `${settings.margin}px`,
            fontSize: `${settings.fontSize}px`,
            fontFamily: settings.fontFamily,
            lineHeight: String(settings.lineHeight),
          }"
          v-html="content"
        ></article>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Theme variables */
.theme-light {
  --reader-bg: #ffffff;
  --reader-text: #333333;
  --sidebar-bg: #f5f5f5;
  --header-bg: #fafafa;
  --border: #e0e0e0;
}

.theme-dark {
  --reader-bg: #1a1a1a;
  --reader-text: #e0e0e0;
  --sidebar-bg: #1e1e1e;
  --header-bg: #2a2a2a;
  --border: #333;
}

.theme-sepia {
  --reader-bg: #f4ecd8;
  --reader-text: #5b4636;
  --sidebar-bg: #efe6d5;
  --header-bg: #e9dcc9;
  --border: #d4c5b0;
}

/* Container */
.reader-view-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--reader-bg);
  color: var(--reader-text);
  transition:
    background-color 0.3s,
    color 0.3s;
}

/* Header */
.reader-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background-color: var(--header-bg);
  flex-shrink: 0;
  z-index: 10;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--reader-text);
  border-radius: 6px;
  transition: background-color 0.15s;
}

.back-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.book-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.header-btn {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--reader-bg);
  cursor: pointer;
  font-size: 16px;
  color: var(--reader-text);
  transition: all 0.15s;
}

.header-btn:hover {
  border-color: #aa3bff;
  color: #aa3bff;
}

/* Content Area */
.content-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 0;
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  overflow: hidden;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

.sidebar.open {
  width: 300px;
}

.panel {
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.panel h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}

/* TOC */
.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-item {
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--reader-text);
  transition:
    background-color 0.15s,
    color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.toc-item.active {
  background-color: rgba(170, 59, 255, 0.15);
  color: #aa3bff;
  font-weight: 500;
}

/* Search */
.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 12px;
}

.search-results {
  list-style: none;
}

.search-result {
  padding: 8px 0;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.search-result:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.search-result strong {
  display: block;
  margin-bottom: 4px;
}

.search-result p {
  font-size: 13px;
  color: var(--reader-text);
  opacity: 0.8;
}

/* Bookmarks */
.add-bookmark-btn {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--reader-bg);
  cursor: pointer;
}

.bookmarks-list {
  list-style: none;
}

.bookmark-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.bookmark-title {
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 4px;
}

.bookmark-preview {
  font-size: 13px;
  opacity: 0.8;
}

/* Settings */
.setting-item {
  margin-bottom: 16px;
}

.setting-item label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
}

.setting-item input[type="range"],
.setting-item select {
  width: 100%;
}

/* Reader View */
.reader-view {
  flex: 1;
  overflow: auto;
  background-color: var(--reader-bg);
  color: var(--reader-text);
  transition:
    background-color 0.3s,
    color 0.3s;
}

.reader-content {
  min-height: 100%;
}

.reader-content :deep(p) {
  margin-bottom: 1em;
}

.reader-content :deep(h1),
.reader-content :deep(h2),
.reader-content :deep(h3),
.reader-content :deep(h4),
.reader-content :deep(h5),
.reader-content :deep(h6) {
  margin-top: 1.5em;
  margin-bottom: 0.75em;
  font-weight: 600;
}

.reader-content :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}
</style>
