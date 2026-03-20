<script setup lang="ts">
import type { Chapter } from "../../core/types";

defineProps<{
  chapters: Chapter[];
  currentChapterId: string | null;
}>();

const emit = defineEmits<{
  (e: "select-chapter", chapterId: string): void;
  (e: "close"): void;
}>();

function handleTocClick(chapterId: string) {
  emit("select-chapter", chapterId);
  emit("close");
}
</script>

<template>
  <div class="modal-content-inner">
    <div class="modal-header">
      <h3>Contents</h3>
      <button class="modal-close" @click="emit('close')">
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
</template>

<style scoped>
.modal-content-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
  color: var(--modal-text);
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

.modal-body.scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.no-chapters {
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
</style>
