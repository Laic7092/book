<script setup lang="ts">
import type { HeaderAction } from "../../plugins/types";

defineProps<{
  bookTitle: string;
  chapterTitle?: string;
  showControls: boolean;
  headerActions: HeaderAction[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <header class="reader-header" :class="{ visible: showControls }">
    <button class="back-btn" @click.stop="emit('close')" aria-label="Back to library">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
    <div class="header-center">
      <h1 class="book-title">{{ bookTitle }}</h1>
      <span v-if="chapterTitle" class="chapter-title">{{ chapterTitle }}</span>
    </div>
    <div class="header-actions">
      <button
        v-for="action in headerActions"
        :key="action.id"
        class="action-btn"
        @click.stop="action.onClick"
        :aria-label="action.label"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          v-html="action.icon"
        />
      </button>
    </div>
  </header>
</template>

<style scoped>
.reader-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top, 12px));
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-subtle);
  z-index: var(--z-chrome);
  opacity: 0;
  transform: translateY(-100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  min-height: 52px;
}

.reader-header.visible {
  opacity: 1;
  transform: translateY(0);
}

.header-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 80px);
}

.book-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--reader-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.chapter-title {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.back-btn,
.action-btn {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated, var(--reader-bg));
  cursor: pointer;
  color: var(--reader-text);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 36px;
  min-height: 36px;
  -webkit-tap-highlight-color: transparent;
}

.back-btn:hover,
.action-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

.back-btn:active,
.action-btn:active {
  transform: scale(0.95);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .reader-header {
    padding: 10px 12px;
    min-height: 48px;
  }

  .book-title {
    font-size: 14px;
  }

  .chapter-title {
    font-size: 11px;
  }
}

/* Small phones */
@media (max-width: 380px) {
  .reader-header {
    padding: 8px 10px;
  }

  .book-title {
    font-size: 13px;
  }
}

/* Landscape orientation */
@media (max-height: 500px) and (orientation: landscape) {
  .reader-header {
    padding: 8px 16px;
    min-height: 44px;
  }

  .book-title,
  .chapter-title {
    font-size: 12px;
  }
}
</style>
