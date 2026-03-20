<script setup lang="ts">
defineProps<{
  bookTitle: string;
  chapterTitle?: string;
  showControls: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "open-settings"): void;
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
      <button class="action-btn" @click.stop="emit('open-settings')" aria-label="Settings">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 00.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
          />
        </svg>
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
  z-index: 100;
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

/* Safe area insets */
@supports (padding: max(0px)) {
  .reader-header {
    padding-left: max(16px, env(safe-area-inset-left, 0));
    padding-right: max(16px, env(safe-area-inset-right, 0));
    padding-top: max(12px, env(safe-area-inset-top, 0));
  }
}
</style>
