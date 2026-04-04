<script setup lang="ts">
import type {
  Bookmark,
  SearchResult,
  ReaderSettings as ReaderSettingsType,
  Chapter,
  BookReadingStats,
} from "../../core/types";
import TableOfContents from "./TableOfContents.vue";
import SearchPanel from "./SearchPanel.vue";
import BookmarksPanel from "./BookmarksPanel.vue";
import ReaderSettings from "./ReaderSettings.vue";
import StatsPanel from "./StatsPanel.vue";
import { computed } from "vue";
import { useSettingsStore } from "../../stores/settings";

const settingsStore = useSettingsStore();

const themeClass = computed(() => `theme-${settingsStore.settings.theme}`);

defineProps<{
  modalType: "toc" | "search" | "bookmarks" | "settings" | "stats" | null;
  chapters: Chapter[];
  currentChapterId: string | null;
  bookmarks: Bookmark[];
  searchResults: SearchResult[];
  searchQuery: string;
  settings: ReaderSettingsType;
  hasHighlights: boolean;
  stats: BookReadingStats | null;
  totalChapters: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select-chapter", chapterId: string): void;
  (e: "navigate-bookmark", bookmark: Bookmark): void;
  (e: "update-settings", settings: Partial<ReaderSettings>): void;
  (e: "update:searchQuery", value: string): void;
  (e: "search"): void;
  (e: "go-to-search-result", result: SearchResult): void;
  (e: "clear-highlights"): void;
  (e: "add-bookmark"): void;
  (e: "delete-bookmark", bookmarkId: string, event: MouseEvent): void;
}>();

function handleClose() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modalType" class="modal-overlay" @click.stop="handleClose">
      <div class="modal-content" :class="[`modal-${modalType}`, themeClass]" @click.stop>
        <!-- Table of Contents -->
        <TableOfContents
          v-if="modalType === 'toc'"
          :chapters="chapters"
          :current-chapter-id="currentChapterId"
          @select-chapter="emit('select-chapter', $event)"
          @close="handleClose"
        />

        <!-- Search Panel -->
        <SearchPanel
          v-else-if="modalType === 'search'"
          :search-query="searchQuery"
          :search-results="searchResults"
          :has-highlights="hasHighlights"
          @update:search-query="emit('update:searchQuery', $event)"
          @search="emit('search')"
          @go-to-search-result="emit('go-to-search-result', $event)"
          @clear-highlights="emit('clear-highlights')"
          @close="handleClose"
        />

        <!-- Bookmarks Panel -->
        <BookmarksPanel
          v-else-if="modalType === 'bookmarks'"
          :bookmarks="bookmarks"
          @add-bookmark="emit('add-bookmark')"
          @delete-bookmark="(id, evt) => emit('delete-bookmark', id, evt)"
          @navigate-bookmark="emit('navigate-bookmark', $event)"
          @close="handleClose"
        />

        <!-- Reader Settings -->
        <ReaderSettings
          v-else-if="modalType === 'settings'"
          :settings="settings"
          @update-settings="emit('update-settings', $event)"
          @close="handleClose"
        />

        <!-- Stats Panel -->
        <StatsPanel
          v-else-if="modalType === 'stats'"
          :stats="stats"
          :total-chapters="totalChapters"
          @close="handleClose"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Modal Overlay */
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

/* Modal type-specific heights */
.modal-toc,
.modal-bookmarks,
.modal-search,
.modal-stats,
.modal-settings {
  height: 85vh;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 768px) {
  .modal-content {
    border-radius: 14px 14px 0 0;
    max-height: 80vh;
  }
}
</style>
