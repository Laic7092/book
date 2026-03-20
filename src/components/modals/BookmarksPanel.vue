<script setup lang="ts">
import type { Bookmark } from "../../core/types";

defineProps<{
  bookmarks: Bookmark[];
}>();

const emit = defineEmits<{
  (e: "add-bookmark"): void;
  (e: "delete-bookmark", bookmarkId: string, event: MouseEvent): void;
  (e: "edit-bookmark", bookmark: Bookmark): void;
  (e: "select-chapter", chapterId: string): void;
  (e: "close"): void;
}>();

function getChapterTitle(bookmark: Bookmark): string {
  return bookmark.title || "";
}
</script>

<template>
  <div class="modal-content-inner">
    <div class="modal-header">
      <h3>Bookmarks</h3>
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
    <div class="modal-body scroll-body">
      <ul class="bookmarks-list">
        <li v-for="bm in bookmarks" :key="bm.id" class="bookmark-item">
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
            <div class="bookmark-chapter">{{ getChapterTitle(bm) }}</div>
          </div>
        </li>
      </ul>
      <p v-if="bookmarks.length === 0" class="no-bookmarks">No bookmarks yet</p>
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

.bookmark-bar-fixed {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  z-index: 10;
  padding: 12px 20px;
}

.add-bookmark-btn {
  width: calc(100% - 40px);
  margin: 0;
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

.no-bookmarks {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
  font-size: 14px;
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

.bookmark-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 150ms ease;
}

.bookmark-content:hover .bookmark-actions {
  opacity: 1;
}

.bookmark-edit-btn,
.bookmark-delete-btn {
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
</style>
