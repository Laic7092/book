<script setup lang="ts">
import type {
  Bookmark,
  SearchResult,
  ReaderSettings,
  Chapter,
  BookReadingStats,
} from "../core/types";

const props = defineProps<{
  modelValue: "toc" | "search" | "bookmarks" | "settings" | "stats" | null;
  chapters: Chapter[];
  currentChapterId: string | null;
  bookmarks: Bookmark[];
  searchResults: SearchResult[];
  searchQuery: string;
  settings: ReaderSettings;
  hasHighlights: boolean;
  showBookmarkEditor: boolean;
  editingBookmark: Bookmark | null;
  stats: BookReadingStats | null;
  totalChapters: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: typeof props.modelValue): void;
  (e: "update:searchQuery", value: string): void;
  (e: "close"): void;
  (e: "select-chapter", chapterId: string): void;
  (e: "update-settings", settings: Partial<ReaderSettings>): void;
  (e: "search"): void;
  (e: "go-to-search-result", result: SearchResult): void;
  (e: "clear-highlights"): void;
  (e: "add-bookmark"): void;
  (e: "delete-bookmark", bookmarkId: string, event: MouseEvent): void;
  (e: "edit-bookmark", bookmark: Bookmark): void;
  (e: "save-bookmark-edit"): void;
  (e: "close-bookmark-editor"): void;
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
  stats: "📊",
};

const bookmarkColors = [
  { value: "#fbbf24", label: "Yellow" },
  { value: "#f472b6", label: "Pink" },
  { value: "#60a5fa", label: "Blue" },
  { value: "#34d399", label: "Green" },
  { value: "#a78bfa", label: "Purple" },
  { value: "#fb923c", label: "Orange" },
];

// Debounce helper for real-time search
let searchDebounceTimer: number | null = null;
function handleSearchInput(value: string) {
  emit("update:searchQuery", value);
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    if (value.trim()) {
      emit("search");
    }
  }, 300);
}

// Settings tab state
import { ref, computed } from "vue";
const settingsTab = ref<"text" | "theme" | "layout">("text");

// Font options
const fontOptions = [
  { label: "Literata", value: "Literata, Georgia, serif", preview: "Literata" },
  { label: "Cormorant", value: "Cormorant, Georgia, serif", preview: "Cormorant" },
  {
    label: "Sans Serif",
    value: "Instrument Sans, -apple-system, sans-serif",
    preview: "Instrument Sans",
  },
  { label: "System", value: "system-ui, -apple-system, sans-serif", preview: "system-ui" },
  { label: "Mono", value: "JetBrains Mono, Consolas, monospace", preview: "JetBrains Mono" },
];

// Theme options
const themeOptions = [
  { label: "Light", value: "light", desc: "Easy on battery" },
  { label: "Dark", value: "dark", desc: "Night reading" },
  { label: "Sepia", value: "sepia", desc: "Paper-like comfort" },
];

// Contrast options for dark mode
const contrastOptions = [
  { label: "Soft", value: "soft" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
];

// Text alignment options
const textAlignOptions = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Justify", value: "justify" },
];

// Reading mode options
const scrollModeOptions = [
  { label: "Vertical", value: "vertical", desc: "Continuous scroll" },
  { label: "Pagination", value: "pagination", desc: "Page by page" },
];

// Pagination animation options
const animationOptions = [
  { label: "Slide", value: "slide", desc: "Smooth slide" },
  { label: "Flip", value: "flip", desc: "Page flip" },
  { label: "Fade", value: "fade", desc: "Fade transition" },
];

// Preview style computation
const previewStyle = computed(() => ({
  fontSize: `${props.settings.fontSize}px`,
  fontFamily: props.settings.fontFamily,
  lineHeight: String(props.settings.lineHeight),
  letterSpacing: `${props.settings.letterSpacing || 0}em`,
}));

// Reset settings function
function resetSettings() {
  emit("update-settings", {
    fontSize: 18,
    fontFamily: "Literata, Georgia, serif",
    lineHeight: 1.6,
    theme: "light" as const,
    margin: 24,
    columnWidth: 720,
    letterSpacing: 0,
    paragraphSpacing: 1.2,
    textAlign: "left" as const,
    contrast: "normal" as const,
  });
}

// Import time formatting utilities
import { formatDuration, formatRelativeTime, formatHour } from "../utils/time";
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click.stop="closeModal">
      <div class="modal-content" :class="[`modal-${modelValue}`]" @click.stop>
        <!-- TOC Modal -->
        <div v-if="modelValue === 'toc'" class="modal-content-inner">
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
          <div class="modal-body scroll-body">
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
        </div>

        <!-- Settings Modal -->
        <div v-if="modelValue === 'settings'" class="modal-content-inner">
          <div class="modal-header">
            <div class="header-title">
              <h3>Reading Settings</h3>
              <button class="reset-btn" @click="resetSettings" title="Reset to defaults">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
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
          <div class="modal-body scroll-body">
            <!-- Live Preview Card -->
            <div class="preview-section">
              <div class="preview-label">Live Preview</div>
              <div class="preview-card" :style="previewStyle">
                <p class="preview-text">
                  The quick brown fox jumps over the lazy dog. This is how your reading experience
                  will look with the current settings.
                </p>
              </div>
            </div>

            <div class="settings-tabs">
              <button
                :class="['tab', { active: settingsTab === 'text' }]"
                @click="settingsTab = 'text'"
              >
                Text
              </button>
              <button
                :class="['tab', { active: settingsTab === 'theme' }]"
                @click="settingsTab = 'theme'"
              >
                Theme
              </button>
              <button
                :class="['tab', { active: settingsTab === 'layout' }]"
                @click="settingsTab = 'layout'"
              >
                Layout
              </button>
            </div>

            <div class="settings-content">
              <!-- Text Tab -->
              <div v-if="settingsTab === 'text'" class="tab-content">
                <div class="setting-item">
                  <div class="setting-label">
                    <span>Font Size</span>
                    <span class="setting-value">{{ settings.fontSize }}px</span>
                  </div>
                  <div class="size-presets">
                    <button
                      v-for="size in [14, 16, 18, 20, 22, 24]"
                      :key="size"
                      :class="['size-preset', { active: settings.fontSize === size }]"
                      @click="emit('update-settings', { fontSize: size })"
                    >
                      <span :style="{ fontSize: `${Math.max(12, size - 4)}px` }">A</span>
                    </button>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="32"
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
                  <label class="setting-label">Font Family</label>
                  <div class="font-options">
                    <button
                      v-for="font in fontOptions"
                      :key="font.value"
                      :class="['font-option', { active: settings.fontFamily.includes(font.value) }]"
                      @click="emit('update-settings', { fontFamily: font.value })"
                      :style="{ fontFamily: font.preview || font.value }"
                    >
                      <span class="font-name">{{ font.label }}</span>
                      <span class="font-sample">The quick brown fox</span>
                    </button>
                  </div>
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span>Line Height</span>
                    <span class="setting-value">{{ settings.lineHeight.toFixed(2) }}</span>
                  </div>
                  <div class="line-height-presets">
                    <button
                      v-for="height in [1.4, 1.6, 1.8, 2.0]"
                      :key="height"
                      :class="[
                        'lh-preset',
                        { active: Math.abs(settings.lineHeight - height) < 0.05 },
                      ]"
                      @click="emit('update-settings', { lineHeight: height })"
                    >
                      <div class="lh-icon" :style="{ lineHeight: String(height) }">
                        <span>A</span><span>A</span>
                      </div>
                    </button>
                  </div>
                  <input
                    type="range"
                    min="1.2"
                    max="2.4"
                    step="0.05"
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
                  <div class="setting-label">
                    <span>Letter Spacing</span>
                    <span class="setting-value">{{ settings.letterSpacing || 0 }}em</span>
                  </div>
                  <input
                    type="range"
                    min="-0.05"
                    max="0.2"
                    step="0.01"
                    :value="settings.letterSpacing || 0"
                    @input="
                      emit('update-settings', {
                        letterSpacing: Number(($event.target as HTMLInputElement).value),
                      })
                    "
                    class="range-input"
                  />
                </div>
              </div>

              <!-- Theme Tab -->
              <div v-if="settingsTab === 'theme'" class="tab-content">
                <div class="setting-item">
                  <label class="setting-label">Color Theme</label>
                  <div class="theme-grid">
                    <button
                      v-for="theme in themeOptions"
                      :key="theme.value"
                      :class="['theme-card', { active: settings.theme === theme.value }]"
                      @click="emit('update-settings', { theme: theme.value })"
                    >
                      <div class="theme-card-preview" :class="`theme-${theme.value}`">
                        <div class="theme-card-lines"></div>
                      </div>
                      <span class="theme-card-label">{{ theme.label }}</span>
                      <span v-if="theme.desc" class="theme-card-desc">{{ theme.desc }}</span>
                    </button>
                  </div>
                </div>

                <div class="setting-item" v-if="settings.theme === 'dark'">
                  <label class="setting-label">
                    <span>Dark Mode Contrast</span>
                    <span class="setting-value">{{ settings.contrast || "normal" }}</span>
                  </label>
                  <div class="contrast-options">
                    <button
                      v-for="option in contrastOptions"
                      :key="option.value"
                      :class="['contrast-option', { active: settings.contrast === option.value }]"
                      @click="emit('update-settings', { contrast: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Layout Tab -->
              <div v-if="settingsTab === 'layout'" class="tab-content">
                <div class="setting-item">
                  <div class="setting-label">
                    <span>Column Width</span>
                    <span class="setting-value">{{ settings.columnWidth }}px</span>
                  </div>
                  <div class="width-presets">
                    <button
                      v-for="width in [600, 700, 800, 900]"
                      :key="width"
                      :class="['width-preset', { active: settings.columnWidth === width }]"
                      @click="emit('update-settings', { columnWidth: width })"
                      :style="{ width: `${width / 4}px` }"
                    >
                      <div class="width-lines"></div>
                    </button>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="1000"
                    step="10"
                    :value="settings.columnWidth"
                    @input="
                      emit('update-settings', {
                        columnWidth: Number(($event.target as HTMLInputElement).value),
                      })
                    "
                    class="range-input"
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span>Margins</span>
                    <span class="setting-value">{{ settings.margin }}px</span>
                  </div>
                  <div class="margin-presets">
                    <button
                      v-for="margin in [16, 24, 32, 48]"
                      :key="margin"
                      :class="['margin-preset', { active: settings.margin === margin }]"
                      @click="emit('update-settings', { margin: margin })"
                    >
                      <div class="margin-icon" :style="{ padding: `${margin / 4}px` }">
                        <div class="margin-box"></div>
                      </div>
                    </button>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="64"
                    step="4"
                    :value="settings.margin"
                    @input="
                      emit('update-settings', {
                        margin: Number(($event.target as HTMLInputElement).value),
                      })
                    "
                    class="range-input"
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span>Paragraph Spacing</span>
                    <span class="setting-value">{{ settings.paragraphSpacing || 1.2 }}em</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="2.0"
                    step="0.1"
                    :value="settings.paragraphSpacing || 1.2"
                    @input="
                      emit('update-settings', {
                        paragraphSpacing: Number(($event.target as HTMLInputElement).value),
                      })
                    "
                    class="range-input"
                  />
                </div>

                <div class="setting-item">
                  <label class="setting-label">
                    <span>Text Alignment</span>
                  </label>
                  <div class="align-options">
                    <button
                      v-for="align in textAlignOptions"
                      :key="align.value"
                      :class="['align-option', { active: settings.textAlign === align.value }]"
                      @click="emit('update-settings', { textAlign: align.value })"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <rect v-if="align.value === 'left'" x="3" y="5" width="18" height="2" />
                        <rect v-if="align.value === 'left'" x="3" y="9" width="14" height="2" />
                        <rect v-if="align.value === 'left'" x="3" y="13" width="16" height="2" />
                        <rect v-if="align.value === 'left'" x="3" y="17" width="12" height="2" />

                        <rect v-if="align.value === 'center'" x="3" y="5" width="18" height="2" />
                        <rect v-if="align.value === 'center'" x="5" y="9" width="14" height="2" />
                        <rect v-if="align.value === 'center'" x="4" y="13" width="16" height="2" />
                        <rect v-if="align.value === 'center'" x="6" y="17" width="12" height="2" />

                        <rect v-if="align.value === 'justify'" x="3" y="5" width="18" height="2" />
                        <rect v-if="align.value === 'justify'" x="3" y="9" width="18" height="2" />
                        <rect v-if="align.value === 'justify'" x="3" y="13" width="18" height="2" />
                        <rect v-if="align.value === 'justify'" x="3" y="17" width="14" height="2" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Reading Mode -->
                <div class="setting-item">
                  <label class="setting-label">
                    <span>Reading Mode</span>
                  </label>
                  <div class="mode-grid">
                    <button
                      v-for="mode in scrollModeOptions"
                      :key="mode.value"
                      :class="[
                        'mode-card',
                        { active: (settings.scrollMode || 'vertical') === mode.value },
                      ]"
                      @click="emit('update-settings', { scrollMode: mode.value })"
                    >
                      <div class="mode-card-icon">
                        <svg
                          v-if="mode.value === 'vertical'"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                        >
                          <path d="M12 5v14M19 12l-7 7-7-7" />
                        </svg>
                        <svg
                          v-else
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                        >
                          <rect x="4" y="4" width="16" height="16" rx="2" />
                          <path d="M9 4v16M4 12h16" />
                        </svg>
                      </div>
                      <span class="mode-card-label">{{ mode.label }}</span>
                      <span class="mode-card-desc">{{ mode.desc }}</span>
                    </button>
                  </div>
                </div>

                <!-- Pagination Animation (only shown when pagination mode is selected) -->
                <div
                  class="setting-item"
                  v-if="(settings.scrollMode || 'vertical') === 'pagination'"
                >
                  <label class="setting-label">
                    <span>Page Transition</span>
                    <span class="setting-value">{{ settings.paginationAnimation || "slide" }}</span>
                  </label>
                  <div class="animation-options">
                    <button
                      v-for="anim in animationOptions"
                      :key="anim.value"
                      :class="[
                        'animation-option',
                        { active: (settings.paginationAnimation || 'slide') === anim.value },
                      ]"
                      @click="emit('update-settings', { paginationAnimation: anim.value })"
                    >
                      {{ anim.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stats Modal -->
        <div v-if="modelValue === 'stats'" class="modal-content-inner modal-stats">
          <div class="modal-header">
            <h3>Reading Statistics</h3>
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
          <div class="modal-body scroll-body">
            <div v-if="stats" class="stats-content">
              <!-- Summary Card -->
              <div class="stats-summary">
                <div class="stat-item primary">
                  <div class="stat-value">{{ formatDuration(stats.totalReadingTime) }}</div>
                  <div class="stat-label">Total Reading Time</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ stats.totalSessions }}</div>
                  <div class="stat-label">Sessions</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ formatDuration(stats.averageSessionTime) }}</div>
                  <div class="stat-label">Avg Session</div>
                </div>
              </div>

              <!-- Progress Card -->
              <div class="stats-card">
                <h4 class="stats-card-title">Progress</h4>
                <div class="progress-grid">
                  <div class="progress-item">
                    <div class="progress-number">{{ stats.chaptersCompleted }}</div>
                    <div class="progress-label">of {{ totalChapters }} chapters</div>
                  </div>
                  <div class="progress-bar-container">
                    <div class="progress-bar">
                      <div
                        class="progress-fill"
                        :style="{ width: `${(stats.chaptersCompleted / totalChapters) * 100}%` }"
                      ></div>
                    </div>
                    <div class="progress-percentage">
                      {{ Math.round((stats.chaptersCompleted / totalChapters) * 100) }}%
                    </div>
                  </div>
                </div>
              </div>

              <!-- Reading Speed Card -->
              <div class="stats-card">
                <h4 class="stats-card-title">Reading Speed</h4>
                <div class="speed-grid">
                  <div class="stat-item">
                    <div class="stat-value">{{ stats.readingSpeed }}</div>
                    <div class="stat-label">words/min</div>
                  </div>
                  <div class="stat-item">
                    <div class="stat-value">{{ stats.wordsRead.toLocaleString() }}</div>
                    <div class="stat-label">words read</div>
                  </div>
                </div>
              </div>

              <!-- Active Hours Card -->
              <div class="stats-card" v-if="stats.activeHours.length > 0">
                <h4 class="stats-card-title">Active Hours</h4>
                <div class="hours-grid">
                  <div v-for="hour in stats.activeHours" :key="hour" class="hour-item">
                    <div class="hour-bar"></div>
                    <span class="hour-label">{{ formatHour(hour) }}</span>
                  </div>
                </div>
              </div>

              <!-- History Card -->
              <div class="stats-card">
                <h4 class="stats-card-title">Reading History</h4>
                <div class="history-grid">
                  <div class="history-item">
                    <span class="history-label">First read</span>
                    <span class="history-value">{{
                      stats.firstReadAt ? formatRelativeTime(stats.firstReadAt) : "—"
                    }}</span>
                  </div>
                  <div class="history-item">
                    <span class="history-label">Last read</span>
                    <span class="history-value">{{
                      stats.lastReadAt ? formatRelativeTime(stats.lastReadAt) : "—"
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="no-stats">
              <div class="no-stats-icon">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M12 20V10M18 20V4M6 20v-4" />
                </svg>
              </div>
              <p>No reading data yet</p>
              <p class="no-stats-hint">Start reading to track your progress</p>
            </div>
          </div>
        </div>

        <!-- Search Modal -->
        <div v-if="modelValue === 'search'" class="modal-content-inner">
          <!-- Fixed header + search bar (doesn't scroll) -->
          <div class="search-header-fixed">
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
            <div class="search-box-wrapper">
              <div class="search-box">
                <input
                  id="search-input"
                  :value="searchQuery"
                  @input="handleSearchInput(($event.target as HTMLInputElement).value)"
                  type="text"
                  placeholder="Search in book..."
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
                  >{{ searchResults.length }} result{{
                    searchResults.length !== 1 ? "s" : ""
                  }}</span
                >
                <button
                  class="clear-highlights"
                  @click="emit('clear-highlights')"
                  v-if="hasHighlights"
                >
                  Clear highlights
                </button>
              </div>
            </div>
          </div>
          <!-- Scrollable results area -->
          <div class="modal-body scroll-body">
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
        </div>

        <!-- Bookmarks Modal -->
        <div v-if="modelValue === 'bookmarks'" class="modal-content-inner">
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
          <!-- Fixed add bookmark button (doesn't scroll) -->
          <div class="bookmark-bar-fixed">
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
          </div>
          <!-- Scrollable bookmarks area -->
          <div class="modal-body scroll-body">
            <ul class="bookmarks-list">
              <li v-for="(bm, i) in bookmarks" :key="bm.id" class="bookmark-item">
                <div class="bookmark-content" @click.stop="emit('select-chapter', bm.chapterId)">
                  <div class="bookmark-header">
                    <div class="bookmark-title">{{ bm.title }}</div>
                    <div class="bookmark-actions">
                      <button
                        class="bookmark-edit-btn"
                        @click.stop="emit('edit-bookmark', bm)"
                        aria-label="Edit bookmark"
                        title="Edit bookmark"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        class="bookmark-delete-btn"
                        @click.stop="emit('delete-bookmark', bm.id, $event)"
                        aria-label="Delete bookmark"
                        title="Delete bookmark"
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
                  <div class="bookmark-preview">{{ bm.contentPreview }}</div>
                  <div class="bookmark-chapter">{{ getChapterTitle(bm.chapterId) }}</div>
                </div>
              </li>
            </ul>
            <p v-if="bookmarks.length === 0" class="no-bookmarks">No bookmarks yet</p>
          </div>
        </div>

        <!-- Bookmark Editor Modal -->
        <div v-if="showBookmarkEditor && editingBookmark" class="modal-content-inner">
          <div class="modal-header">
            <h3>Edit Bookmark</h3>
            <button class="modal-close" @click="emit('close-bookmark-editor')">
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
          <div class="modal-body scroll-body">
            <div class="editor-content">
              <div class="editor-field">
                <label class="editor-label">Title</label>
                <input
                  type="text"
                  v-model="editingBookmark.title"
                  class="editor-input"
                  placeholder="Bookmark title"
                />
              </div>
              <div class="editor-field">
                <label class="editor-label">Note</label>
                <textarea
                  v-model="editingBookmark.note"
                  class="editor-textarea"
                  placeholder="Add a note..."
                  rows="4"
                ></textarea>
              </div>
              <div class="editor-field">
                <label class="editor-label">Color</label>
                <div class="color-picker">
                  <button
                    v-for="color in bookmarkColors"
                    :key="color.value"
                    :class="['color-option', { active: editingBookmark.color === color.value }]"
                    :style="{ backgroundColor: color.value }"
                    @click="editingBookmark.color = color.value"
                    :aria-label="color.label"
                  ></button>
                </div>
              </div>
              <div class="editor-field">
                <label class="editor-label">
                  Position: {{ Math.round(editingBookmark.position) }}%
                </label>
                <input
                  type="range"
                  v-model.number="editingBookmark.position"
                  min="0"
                  max="100"
                  step="1"
                  class="range-input"
                />
              </div>
              <div class="editor-actions">
                <button class="btn-cancel" @click="emit('close-bookmark-editor')">Cancel</button>
                <button class="btn-save" @click="emit('save-bookmark-edit')">Save Changes</button>
              </div>
            </div>
          </div>
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

/* ============================================
   MODAL SCROLLING STRATEGY
   Each modal type has precise scroll control:
   - Header is fixed/sticky
   - Only content area scrolls
   - Smooth touch scrolling
   ============================================ */

/* Base modal container - fixed height for list-based modals */
.modal-toc,
.modal-bookmarks,
.modal-search,
.modal-settings {
  height: 85vh;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Modal inner wrapper - flex container for header + scrollable content */
.modal-content-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 0;
}

/* Fixed search header (modal header + search input) - only for Search modal */
.search-header-fixed {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  z-index: 10;
}

.search-box-wrapper {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

/* Fixed bookmark add button */
.bookmark-bar-fixed {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  z-index: 10;
  padding: 12px 20px;
}

/* Scrollbar styling - unified */
.modal-body::-webkit-scrollbar {
  width: 5px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
  transition: background 150ms ease;
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Firefox scrollbar */
.modal-body {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

/* Modal body - the SCROLLABLE container */
.modal-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  contain: layout style;
  scrollbar-gutter: stable;
  overscroll-behavior-y: contain;
  min-height: 0;
}

/* Special class for explicit scroll areas */
.modal-body.scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
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
  background: var(--modal-bg);
  z-index: 10;
  /* Ensure header doesn't shrink */
  flex-shrink: 0;
}

/* Modal header inside search header - no border, with backdrop */
.search-header-fixed .modal-header {
  border-bottom: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.header-title h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
}

.reset-btn {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reset-btn:hover {
  background: var(--hover-bg);
  color: var(--accent);
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
.no-chapters,
.no-bookmarks {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
  font-size: 14px;
}

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
.preview-section {
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.preview-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.preview-card {
  padding: 16px;
  background: var(--modal-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.preview-text {
  margin: 0;
  color: var(--modal-text);
  line-height: inherit;
}

.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 20px;
  background: var(--modal-bg);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 150ms ease;
  position: relative;
  font-family: var(--font-ui);
}

.tab::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 100%;
  height: 2px;
  background: var(--accent);
  transition: transform 200ms ease;
}

.tab:hover {
  color: var(--modal-text);
}

.tab.active {
  color: var(--accent);
}

.tab.active::after {
  transform: translateX(-50%) scaleX(1);
}

.tab-content {
  animation: fadeIn 200ms ease;
}

.settings-content {
  padding: 20px 22px 32px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.setting-item {
  margin-bottom: 28px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.setting-value {
  color: var(--text-secondary);
  font-feature-settings: "tnum";
  font-size: 12px;
}

/* Size presets */
.size-presets {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}

.size-preset {
  flex: 1;
  padding: 14px 0;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.size-preset span {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--modal-text);
}

.size-preset:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.size-preset.active {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 2px 8px rgba(139, 46, 58, 0.25);
}

.size-preset.active span {
  color: white;
}

/* Font options */
.font-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.font-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  text-align: left;
}

.font-option:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.font-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.font-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--modal-text);
}

.font-sample {
  font-size: 13px;
  color: var(--text-secondary);
  opacity: 0.7;
}

/* Line height presets */
.line-height-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.lh-preset {
  flex: 1;
  padding: 14px 0;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lh-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--modal-text);
}

.lh-icon span:first-child {
  opacity: 0.5;
}

.lh-preset:hover {
  border-color: var(--accent);
}

.lh-preset.active {
  border-color: var(--accent);
  background: var(--accent);
}

.lh-preset.active .lh-icon {
  color: white;
}

/* Range input */
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

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
}

.theme-card:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.theme-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.theme-card-preview {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;
  overflow: hidden;
}

.theme-card-lines {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-card-lines::before,
.theme-card-lines::after {
  content: "";
  height: 2px;
  border-radius: 1px;
}

.theme-card-lines::before {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
}

.theme-card-lines::after {
  width: 70%;
  background: rgba(0, 0, 0, 0.2);
}

.theme-light .theme-card-preview {
  background: linear-gradient(135deg, #fdfcfb 0%, #f5f3ef 100%);
}

.theme-light .theme-card-lines::before,
.theme-light .theme-card-lines::after {
  background: rgba(31, 26, 23, 0.4);
}

.theme-dark .theme-card-preview {
  background: linear-gradient(135deg, #1a1816 0%, #2a2622 100%);
}

.theme-dark .theme-card-lines::before,
.theme-dark .theme-card-lines::after {
  background: rgba(232, 228, 222, 0.5);
}

.theme-sepia .theme-card-preview {
  background: linear-gradient(135deg, #f5f0e6 0%, #ebe5d5 100%);
}

.theme-sepia .theme-card-lines::before,
.theme-sepia .theme-card-lines::after {
  background: rgba(61, 53, 42, 0.4);
}

.theme-card-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.theme-card-desc {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: lowercase;
}

/* Contrast options */
.contrast-options {
  display: flex;
  gap: 8px;
}

.contrast-option {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
  transition: all 150ms ease;
}

.contrast-option:hover {
  border-color: var(--accent);
}

.contrast-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

/* Width presets */
.width-presets {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
  padding: 12px;
  background: var(--hover-bg);
  border-radius: 10px;
}

.width-preset {
  height: 48px;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.width-preset:hover {
  border-color: var(--accent);
}

.width-preset.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.width-lines {
  width: 60%;
  height: 24px;
  border: 2px solid var(--modal-text);
  border-radius: 2px;
  opacity: 0.5;
}

/* Margin presets */
.margin-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  padding: 12px;
  background: var(--hover-bg);
  border-radius: 10px;
}

.margin-preset {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.margin-preset:hover {
  border-color: var(--accent);
}

.margin-preset.active {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 2px 8px rgba(139, 46, 58, 0.25);
}

.margin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--border-subtle);
  border-radius: 4px;
  width: 32px;
  height: 32px;
}

.margin-box {
  width: 16px;
  height: 16px;
  border: 2px solid var(--modal-text);
  border-radius: 3px;
}

.margin-preset.active .margin-box {
  border-color: white;
}

/* Align options */
.align-options {
  display: flex;
  gap: 8px;
}

.align-option {
  flex: 1;
  padding: 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--modal-text);
}

.align-option:hover {
  border-color: var(--accent);
}

.align-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

/* Reading Mode Cards */
.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
}

.mode-card:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.mode-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mode-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--modal-text);
}

.mode-card.active .mode-card-icon {
  background: var(--accent);
  color: white;
}

.mode-card-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--modal-text);
}

.mode-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Animation Options */
.animation-options {
  display: flex;
  gap: 8px;
}

.animation-option {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
  transition: all 150ms ease;
}

.animation-option:hover {
  border-color: var(--accent);
}

.animation-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
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

.no-results {
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

.bookmark-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 150ms ease;
}

.bookmark-content:hover .bookmark-actions {
  opacity: 1;
}

.bookmark-edit-btn {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  transition: all 150ms ease;
}

.bookmark-edit-btn:hover {
  background: var(--hover-bg);
  color: var(--accent);
}

.bookmark-delete-btn {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  transition: all 150ms ease;
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

/* Bookmark Editor */
.editor-content {
  padding: 18px 22px 32px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.editor-field {
  margin-bottom: 20px;
}

.editor-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
  margin-bottom: 8px;
}

.editor-input,
.editor-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--hover-bg);
  color: var(--modal-text);
  font-size: 14px;
  font-family: var(--font-ui);
  transition: all 150ms ease;
}

.editor-input:focus,
.editor-textarea:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--modal-bg);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.editor-textarea {
  resize: vertical;
  min-height: 80px;
}

.color-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-option {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--border);
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.color-option:hover {
  transform: scale(1.1);
  border-color: var(--accent);
}

.color-option.active {
  border-color: var(--accent);
  box-shadow:
    0 0 0 3px var(--accent-soft),
    0 2px 4px rgba(0, 0, 0, 0.1);
}

.editor-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  font-family: var(--font-ui);
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--modal-text);
}

.btn-cancel:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

.btn-save {
  background: var(--accent);
  border: none;
  color: #ffffff;
}

.btn-save:hover {
  background: color-mix(in srgb, var(--accent) 85%, black);
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

/* Stats Modal */
.modal-stats .stats-content {
  padding: 20px;
}

.stats-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 16px;
}

.stat-item.primary {
  grid-column: span 3;
  text-align: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-display);
}

.stat-item.primary .stat-value {
  font-size: 32px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.stats-card {
  background: var(--hover-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.stats-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 14px;
}

.progress-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.progress-number {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.progress-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-percentage {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 40px;
}

.speed-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.hours-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hour-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border-radius: 8px;
  min-width: 50px;
}

.hour-bar {
  width: 4px;
  height: 24px;
  background: var(--accent);
  border-radius: 2px;
  opacity: 0.8;
}

.hour-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.history-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.no-stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-secondary);
}

.no-stats-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-stats-hint {
  font-size: 13px;
  margin-top: 8px;
  color: var(--text-muted);
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
