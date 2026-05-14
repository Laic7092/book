<script setup lang="ts">
import { computed } from "vue";
import type { Bookmark } from "../../core/types";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { compareCfi } from "../../utils/epub-cfi";
import { useBookmarkStore, getBookmarkSession, addBookmarkFromHost } from "./index";

const store = useBookmarkStore();
const session = getBookmarkSession();

const currentBookId = computed(() => session?.getState().bookId ?? null);

const visibleBookmarks = computed(() =>
  [...store.items.value]
    .filter((b) => b.bookId === currentBookId.value && !b.id.startsWith("__progress__"))
    .sort((a, b) => {
      if (a.cfi !== b.cfi) return compareCfi(a.cfi, b.cfi);
      return b.createdAt - a.createdAt;
    }),
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

function handleNavigate(bookmark: Bookmark) {
  void session?.navigateToCfi(bookmark.cfi, bookmark.chapterId);
  emit("close");
}

async function handleAdd() {
  await addBookmarkFromHost();
}

function handleDelete(bookmarkId: string, event: MouseEvent) {
  event.stopPropagation();
  store.remove(bookmarkId);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="Bookmarks" @close="emit('close')" />
    <div class="bookmark-bar-fixed">
      <button class="add-bookmark-btn" @click="handleAdd()">
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
        <li v-for="bm in visibleBookmarks" :key="bm.id" class="bookmark-item">
          <div class="bookmark-card" @click.stop="handleNavigate(bm)">
            <div
              class="bookmark-color-indicator"
              :style="{ backgroundColor: bm.color || 'var(--accent)' }"
            ></div>
            <div class="bookmark-main">
              <div class="bookmark-title-row">
                <span class="bookmark-title">{{ bm.title }}</span>
                <span class="bookmark-date">{{ formatDate(bm.createdAt) }}</span>
              </div>
              <p v-if="bm.contentPreview" class="bookmark-preview">{{ bm.contentPreview }}</p>
            </div>
            <button
              class="action-btn delete-btn"
              @click.stop="handleDelete(bm.id, $event)"
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
                <path
                  d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                />
              </svg>
            </button>
          </div>
        </li>
      </ul>
      <div v-if="visibleBookmarks.length === 0" class="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
        <p>No bookmarks yet</p>
        <span>Click the button above to add your first bookmark</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.bookmark-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 150ms ease;
  background: var(--hover-bg);
  position: relative;
}

.bookmark-card:hover {
  background: var(--bg-elevated, var(--modal-bg));
  border-color: var(--border);
}

.bookmark-color-indicator {
  width: 4px;
  min-height: 100%;
  border-radius: 4px;
  flex-shrink: 0;
  align-self: stretch;
}

.bookmark-main {
  flex: 1;
  min-width: 0;
}

.bookmark-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bookmark-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--modal-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.bookmark-date {
  font-size: 11px;
  color: var(--text-tertiary, var(--text-secondary));
  flex-shrink: 0;
}

.bookmark-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 6px;
}

.action-btn {
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 6px;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: center;
}

.action-btn:hover {
  background: var(--hover-bg);
}

.delete-btn:hover {
  background: #fef2f2;
  color: #dc2626;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
  gap: 8px;
}

.empty-state svg {
  color: var(--text-tertiary, var(--text-secondary));
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.empty-state span {
  font-size: 12px;
  opacity: 0.7;
}
</style>
