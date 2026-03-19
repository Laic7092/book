<script setup lang="ts">
import type { Bookmark, SearchResult, ReaderSettings, Chapter } from "../core/types";

const props = defineProps<{
  modelValue: "toc" | "search" | "bookmarks" | "settings" | null;
  chapters: Chapter[];
  currentChapterId: string | null;
  bookmarks: Bookmark[];
  searchResults: SearchResult[];
  searchQuery: string;
  settings: ReaderSettings;
  hasHighlights: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: typeof props.modelValue): void;
  (e: "close"): void;
  (e: "select-chapter", chapterId: string): void;
  (e: "update-settings", settings: Partial<ReaderSettings>): void;
  (e: "search"): void;
  (e: "go-to-search-result", result: SearchResult): void;
  (e: "clear-highlights"): void;
  (e: "add-bookmark"): void;
  (e: "delete-bookmark", bookmarkId: string, event: MouseEvent): void;
}>();

function closeModal() {
  emit("update:modelValue", null);
  emit("close");
}

function handleTocClick(chapterId: string) {
  emit("select-chapter", chapterId);
  closeModal();
}

function getChapterTitle(chapterId: string): string {
  const chapter = props.chapters.find((c) => c.id === chapterId);
  return chapter?.title || "";
}

function highlightMatch(context: string): string {
  if (!props.searchQuery) return context;
  const escaped = props.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return context.replace(regex, '<mark class="search-mark">$1</mark>');
}

const modalIcons: Record<string, string> = {
  toc: "📑",
  search: "🔍",
  bookmarks: "📌",
  settings: "⚙️",
};
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click.stop="closeModal">
      <div class="modal-content" :class="[`modal-${modelValue}`]" @click.stop>
        <!-- TOC Modal -->
        <div v-if="modelValue === 'toc'" class="modal-body">
          <div class="modal-header">
            <h3>Contents</h3>
            <button class="modal-close" @click="closeModal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div v-if="chapters.length === 0" class="no-chapters">No chapters available</div>
          <ul v-else class="toc-list">
            <li v-for="(ch, index) in chapters" :key="ch.id">
              <button
                :class="['toc-item', { active: ch.id === currentChapterId }]"
                @click.stop="handleTocClick(ch.id)"
              >
                <span class="toc-number">{{ index + 1 }}</span>
                <span class="toc-title">{{ ch.title }}</span>
              </button>
            </li>
          </ul>
        </div>

        <!-- Settings Modal -->
        <div v-if="modelValue === 'settings'" class="modal-body">
          <div class="modal-header">
            <h3>Reading Settings</h3>
            <button class="modal-close" @click="closeModal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="settings-content">
            <div class="setting-item">
              <div class="setting-label">
                <span>Text Size</span>
                <span class="setting-value">{{ settings.fontSize }}px</span>
              </div>
              <div class="font-size-presets">
                <button
                  v-for="size in [14, 16, 18, 20, 22, 24]"
                  :key="size"
                  :class="['font-preset', { active: settings.fontSize === size }]"
                  @click="emit('update-settings', { fontSize: size })"
                >
                  A
                </button>
              </div>
              <div class="font-size-preview">
                <span class="font-a">A</span>
                <span class="font-medium" :style="{ fontSize: `${settings.fontSize * 0.8}px` }"
                  >A</span
                >
                <span class="font-large" :style="{ fontSize: `${settings.fontSize * 1.2}px` }"
                  >A</span
                >
              </div>
              <input
                type="range"
                min="14"
                max="28"
                :value="settings.fontSize"
                @input="
                  emit('update-settings', {
                    fontSize: Number(($event.target as HTMLInputElement).value),
                  })
                "
                class="range-input"
              />
            </div>

            <div class="setting-item">
              <div class="setting-label">
                <span>Line Height</span>
                <span class="setting-value">{{ settings.lineHeight }}</span>
              </div>
              <input
                type="range"
                min="1.2"
                max="2.2"
                step="0.1"
                :value="settings.lineHeight"
                @input="
                  emit('update-settings', {
                    lineHeight: Number(($event.target as HTMLInputElement).value),
                  })
                "
                class="range-input"
              />
            </div>

            <div class="setting-item">
              <label class="setting-label">Theme</label>
              <div class="theme-options">
                <button
                  :class="['theme-option', { active: settings.theme === 'light' }]"
                  @click="emit('update-settings', { theme: 'light' })"
                >
                  <span class="theme-preview theme-preview-light"></span>
                  <span>Light</span>
                </button>
                <button
                  :class="['theme-option', { active: settings.theme === 'dark' }]"
                  @click="emit('update-settings', { theme: 'dark' })"
                >
                  <span class="theme-preview theme-preview-dark"></span>
                  <span>Dark</span>
                </button>
                <button
                  :class="['theme-option', { active: settings.theme === 'sepia' }]"
                  @click="emit('update-settings', { theme: 'sepia' })"
                >
                  <span class="theme-preview theme-preview-sepia"></span>
                  <span>Sepia</span>
                </button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-label">
                <span>Column Width</span>
                <span class="setting-value">{{ settings.columnWidth }}px</span>
              </div>
              <input
                type="range"
                min="500"
                max="900"
                step="25"
                :value="settings.columnWidth"
                @input="
                  emit('update-settings', {
                    columnWidth: Number(($event.target as HTMLInputElement).value),
                  })
                "
                class="range-input"
              />
            </div>
          </div>
        </div>

        <!-- Search Modal -->
        <div v-if="modelValue === 'search'" class="modal-body">
          <div class="modal-header">
            <h3>Search</h3>
            <button class="modal-close" @click="closeModal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="search-box">
            <input
              id="search-input"
              :value="searchQuery"
              @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
              type="text"
              placeholder="Search in book..."
              @keyup.enter="emit('search')"
              class="search-input"
            />
            <button class="search-submit" @click="emit('search')">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
          <div class="search-results-info" v-if="searchResults.length > 0">
            <span class="results-count"
              >{{ searchResults.length }} result{{ searchResults.length !== 1 ? "s" : "" }}</span
            >
            <button class="clear-highlights" @click="emit('clear-highlights')" v-if="hasHighlights">
              Clear highlights
            </button>
          </div>
          <ul class="search-results">
            <li
              v-for="(result, i) in searchResults"
              :key="i"
              class="search-result"
              @click.stop="emit('go-to-search-result', result)"
            >
              <div class="result-header">
                <span class="result-chapter">{{ result.chapterTitle }}</span>
                <span class="result-index">{{ i + 1 }}</span>
              </div>
              <p class="result-context" v-html="highlightMatch(result.context)"></p>
            </li>
          </ul>
          <p v-if="searchResults.length === 0 && searchQuery" class="no-results">
            No results found
          </p>
        </div>

        <!-- Bookmarks Modal -->
        <div v-if="modelValue === 'bookmarks'" class="modal-body">
          <div class="modal-header">
            <h3>Bookmarks</h3>
            <button class="modal-close" @click="closeModal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button class="add-bookmark-btn" @click="emit('add-bookmark')">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Bookmark
          </button>
          <ul class="bookmarks-list">
            <li v-for="(bm, i) in bookmarks" :key="bm.id" class="bookmark-item">
              <div class="bookmark-content" @click.stop="emit('select-chapter', bm.chapterId)">
                <div class="bookmark-header">
                  <div class="bookmark-title">{{ bm.title }}</div>
                  <button
                    class="bookmark-delete-btn"
                    @click.stop="emit('delete-bookmark', bm.id, $event)"
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
                </div>
                <div class="bookmark-preview">{{ bm.contentPreview }}</div>
                <div class="bookmark-chapter">{{ getChapterTitle(bm.chapterId) }}</div>
              </div>
            </li>
          </ul>
          <p v-if="bookmarks.length === 0" class="no-bookmarks">No bookmarks yet</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fadeIn 300ms ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding-bottom: env(safe-area-inset-bottom, 0);
  touch-action: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.modal-content {
  background: var(--modal-bg);
  color: var(--modal-text);
  border-radius: 18px 18px 0 0;
  max-height: 75vh;
  width: 100%;
  max-width: 560px;
  overflow: hidden;
  animation: slideUp 450ms cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.25);
  border-top: 1px solid var(--border-subtle);
  margin: 0 auto;
  max-width: calc(100% - 0px);
  border-radius: 16px 16px 0 0;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

.modal-body {
  padding: 0;
  max-height: calc(75vh - 60px);
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--modal-text);
  -webkit-overflow-scrolling: touch;
}

.modal-body h3,
.modal-body .setting-label,
.modal-body .setting-value,
.modal-body .result-chapter,
.modal-body .bookmark-title,
.modal-body .toc-title,
.modal-body .toc-number {
  color: var(--modal-text);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: var(--modal-bg);
  z-index: 1;
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--modal-text);
}

/* TOC */
.toc-list {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
}

.toc-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  color: var(--modal-text);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
  touch-action: manipulation;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.toc-item:hover {
  background: var(--hover-bg);
}

.toc-item.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 500;
}

.toc-item.active .toc-number {
  color: rgba(255, 255, 255, 0.7);
}

.toc-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 28px;
  font-feature-settings: "tnum";
}

.toc-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Settings */
.settings-content {
  padding: 18px 22px 32px;
}

.setting-item {
  margin-bottom: 26px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.setting-value {
  color: var(--text-secondary);
  font-feature-settings: "tnum";
}

.font-size-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.font-preset {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-weight: 700;
  color: var(--modal-text);
  transition: all 150ms ease;
  font-family: var(--font-display);
}

.font-preset:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.font-preset.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.font-size-preview {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 14px;
  background: var(--hover-bg);
  border-radius: 8px;
}

.font-a {
  font-size: 13px;
  opacity: 0.4;
  font-family: var(--font-display);
}

.font-medium {
  opacity: 0.65;
  font-family: var(--font-display);
}

.font-large {
  opacity: 1;
  font-family: var(--font-display);
}

.range-input {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  appearance: none;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--modal-bg);
  border: 2px solid var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all var(--transition-fast);
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.theme-options {
  display: flex;
  gap: 10px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--modal-text);
  transition: all 150ms ease;
  font-weight: 500;
}

.theme-option:hover {
  border-color: var(--accent);
}

.theme-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.theme-preview {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.theme-preview-light {
  background: linear-gradient(135deg, #fdfcfb 0%, #f5f3ef 100%);
  border: 1px solid #e6e2d8;
}

.theme-preview-dark {
  background: linear-gradient(135deg, #1a1816 0%, #2a2622 100%);
  border: 1px solid #3d3630;
}

.theme-preview-sepia {
  background: linear-gradient(135deg, #f5f0e6 0%, #ebe5d5 100%);
  border: 1px solid #c9bfa8;
}

/* Search */
.search-box {
  display: flex;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  background: var(--hover-bg);
  color: var(--modal-text);
  font-family: var(--font-ui);
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--modal-bg);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search-submit {
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: all 150ms ease;
}

.search-submit:hover {
  background: color-mix(in srgb, var(--accent) 85%, black);
}

.search-results-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.results-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.clear-highlights {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  font-family: var(--font-ui);
}

.clear-highlights:hover {
  background: var(--hover-bg);
}

.search-results {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
  max-height: 45vh;
  overflow-y: auto;
}

.search-result {
  padding: 14px;
  cursor: pointer;
  border-radius: 10px;
  transition: all 150ms ease;
  margin-bottom: 6px;
  border: 1px solid var(--border-subtle);
}

.search-result:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.result-chapter {
  font-size: 13px;
  font-weight: 600;
  color: var(--reader-text);
}

.result-index {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--hover-bg);
  padding: 3px 9px;
  border-radius: 10px;
  font-weight: 600;
}

.search-result p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}

.search-mark {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}

.no-results,
.no-bookmarks {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* Bookmarks */
.add-bookmark-btn {
  width: calc(100% - 40px);
  margin: 16px 20px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--accent);
  transition: all 150ms ease;
  font-family: var(--font-ui);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.add-bookmark-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.bookmarks-list {
  list-style: none;
  padding: 0 12px 12px;
  margin: 0;
}

.bookmark-item {
  margin-bottom: 8px;
}

.bookmark-content {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 150ms ease;
  background: var(--hover-bg);
}

.bookmark-content:hover {
  background: var(--bg-elevated, var(--modal-bg));
  border-color: var(--border);
}

.bookmark-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.bookmark-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--modal-text);
}

.bookmark-delete-btn {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  opacity: 0;
  transition: all 150ms ease;
}

.bookmark-content:hover .bookmark-delete-btn {
  opacity: 1;
}

.bookmark-delete-btn:hover {
  background: #fef2f2;
  color: #dc2626;
}

.bookmark-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bookmark-chapter {
  font-size: 11px;
  color: var(--accent);
  margin-top: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Modal scrollbar */
.modal-body::-webkit-scrollbar {
  width: 5px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

/* Responsive */
@media (max-width: 768px) {
  .modal-content {
    border-radius: 14px 14px 0 0;
    max-height: 80vh;
  }

  .modal-header {
    padding: 16px 18px;
  }

  .modal-header h3 {
    font-size: 17px;
  }

  /* TOC items need larger touch targets on mobile */
  .toc-item {
    padding: 16px 18px;
    min-height: 52px;
  }
}

/* Small phones */
@media (max-width: 380px) {
  .modal-header {
    padding: 14px 16px;
  }

  .modal-header h3 {
    font-size: 16px;
  }

  .setting-item {
    margin-bottom: 20px;
  }
}

/* Landscape orientation on mobile */
@media (max-height: 500px) and (orientation: landscape) {
  .modal-content {
    max-height: 90vh;
  }

  .modal-body {
    max-height: calc(90vh - 50px);
  }
}
</style>
