<script setup lang="ts">
import type { Chapter } from "../../core/types";

defineProps<{
  showControls: boolean;
  hasHighlights: boolean;
  searchResults: SearchResult[];
  currentResultIndex: number;
  isPaginationMode: boolean;
  currentPage: number;
  pagesCount: number;
  readingProgress: number;
  currentChapterTitle: string;
  canPrev: boolean;
  canNext: boolean;
}>();

const emit = defineEmits<{
  (e: "prev-page"): void;
  (e: "next-page"): void;
  (e: "prev-chapter"): void;
  (e: "next-chapter"): void;
  (e: "open-modal", modal: "toc" | "search" | "bookmarks" | "stats"): void;
  (e: "go-to-previous-match"): void;
  (e: "go-to-next-match"): void;
  (e: "clear-highlights"): void;
}>();
</script>

<template>
  <footer class="reader-footer" :class="{ visible: showControls }">
    <!-- Search Navigation -->
    <template v-if="hasHighlights && searchResults.length > 0">
      <button
        class="footer-btn"
        @click.stop="emit('go-to-previous-match')"
        aria-label="Previous match"
        title="Previous match"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div class="progress-info" style="min-width: 60px">
        <span class="progress-text">{{ currentResultIndex + 1 }}/{{ searchResults.length }}</span>
      </div>
      <button
        class="footer-btn"
        @click.stop="emit('go-to-next-match')"
        aria-label="Next match"
        title="Next match"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      <button
        class="footer-btn"
        @click.stop="emit('clear-highlights')"
        aria-label="Exit search"
        title="Exit search"
      >
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
    </template>

    <!-- Normal Navigation -->
    <template v-else>
      <!-- Pagination Mode -->
      <template v-if="isPaginationMode">
        <button class="footer-btn" @click.stop="emit('prev-page')" :disabled="!canPrev">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          class="footer-btn icon-btn"
          @click.stop="emit('open-modal', 'stats')"
          aria-label="Statistics"
          title="Reading statistics"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M12 20V10M18 20V4M6 20v-4" />
          </svg>
        </button>
        <button
          class="footer-btn icon-btn"
          @click.stop="emit('open-modal', 'bookmarks')"
          aria-label="Bookmarks"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
        </button>
        <div class="progress-info" @click.stop="emit('open-modal', 'toc')">
          <span class="progress-text">{{ Math.round(readingProgress) }}%</span>
          <span class="chapter-info">{{ currentChapterTitle || "Chapter 1" }}</span>
        </div>
        <button
          class="footer-btn icon-btn"
          @click.stop="emit('open-modal', 'search')"
          aria-label="Search"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <button class="footer-btn" @click.stop="emit('next-page')" :disabled="!canNext">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </template>

      <!-- Vertical Mode -->
      <template v-else>
        <button class="footer-btn" @click.stop="emit('prev-chapter')" :disabled="!canPrev">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          class="footer-btn icon-btn"
          @click.stop="emit('open-modal', 'stats')"
          aria-label="Statistics"
          title="Reading statistics"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M12 20V10M18 20V4M6 20v-4" />
          </svg>
        </button>
        <button
          class="footer-btn icon-btn"
          @click.stop="emit('open-modal', 'bookmarks')"
          aria-label="Bookmarks"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
        </button>
        <div class="progress-info" @click.stop="emit('open-modal', 'toc')">
          <span class="progress-text">{{ Math.round(readingProgress) }}%</span>
          <span class="chapter-info">{{ currentChapterTitle || "Chapter 1" }}</span>
        </div>
        <button
          class="footer-btn icon-btn"
          @click.stop="emit('open-modal', 'search')"
          aria-label="Search"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <button class="footer-btn" @click.stop="emit('next-chapter')" :disabled="!canNext">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </template>
    </template>
  </footer>
</template>

<style scoped>
.reader-footer {
  position: fixed;
  bottom: 0;
  left: env(safe-area-inset-left, 0);
  right: env(safe-area-inset-right, 0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
  background: var(--header-bg);
  border-top: 1px solid var(--border-subtle);
  z-index: 100;
  opacity: 0;
  transform: translateY(100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  min-height: 56px;
}

.reader-footer.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated, var(--reader-bg));
  color: var(--reader-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 40px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.footer-btn.icon-btn {
  padding: 10px 10px;
}

.footer-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--border);
}

.footer-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.footer-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 44px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}

.progress-info:hover {
  background: var(--hover-bg);
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--reader-text);
  line-height: 1.2;
}

.chapter-info {
  font-size: 11px;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

/* Responsive */
@media (max-width: 768px) {
  .reader-footer {
    padding: 8px 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
    gap: 4px;
    min-height: 52px;
  }

  .footer-btn {
    padding: 8px 10px;
    min-width: 36px;
    min-height: 36px;
  }

  .footer-btn.icon-btn {
    padding: 8px 8px;
  }

  .progress-info {
    padding: 6px 8px;
    min-width: 36px;
  }

  .progress-text {
    font-size: 13px;
  }

  .chapter-info {
    font-size: 10px;
    max-width: 80px;
  }
}

/* Small phones */
@media (max-width: 380px) {
  .reader-footer {
    padding: 6px 6px;
    gap: 2px;
  }

  .footer-btn {
    padding: 8px;
    min-width: 34px;
    min-height: 34px;
  }

  .progress-info {
    padding: 4px 6px;
  }

  .progress-text {
    font-size: 12px;
  }

  .chapter-info {
    font-size: 9px;
    max-width: 60px;
  }
}

/* Landscape orientation */
@media (max-height: 500px) and (orientation: landscape) {
  .reader-footer {
    padding: 6px 12px;
    min-height: 44px;
  }
}

/* Safe area insets */
@supports (padding: max(0px)) {
  .reader-footer {
    padding-left: max(12px, env(safe-area-inset-left, 0));
    padding-right: max(12px, env(safe-area-inset-right, 0));
  }
}
</style>
