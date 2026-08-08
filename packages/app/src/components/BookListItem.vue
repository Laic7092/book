<script setup lang="ts">
import type { Book } from "../core/types";

defineProps<{
  book: Book;
  coverUrl?: string;
  gradient: string;
  initial: string;
  folderName?: string;
}>();

const emit = defineEmits<{
  open: [];
  delete: [event: Event];
  "move-folder": [event: Event];
}>();
</script>

<template>
  <div
    class="book-list-item"
    @click="emit('open')"
    tabindex="0"
    @keydown.enter="emit('open')"
    role="button"
    :aria-label="`Open ${book.title} by ${book.author || 'Unknown author'}`"
  >
    <div class="list-cover" :style="{ background: gradient }">
      <img v-if="coverUrl" :src="coverUrl" :alt="`Cover of ${book.title}`" class="list-cover-img" />
      <span v-else class="list-cover-initial" aria-hidden="true">{{ initial }}</span>
    </div>
    <div class="list-info">
      <h3 class="list-title">{{ book.title }}</h3>
      <div class="list-details">
        <p class="list-author">{{ book.author || "Unknown author" }}</p>
        <span v-if="folderName" class="list-folder-tag">{{ folderName }}</span>
      </div>
    </div>
    <button
      class="btn-folder btn-folder-list"
      @click="emit('move-folder', $event)"
      title="Move to folder"
      aria-label="Move to folder"
      tabindex="0"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
      </svg>
    </button>
    <button
      class="btn-delete"
      @click="emit('delete', $event)"
      title="Delete book"
      aria-label="Delete book"
      tabindex="0"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* ==========================================
   LIST ITEM
   ========================================== */

.book-list-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--transition-fast);
  animation: fadeInUp 0.3s ease-out backwards;
}

.book-list-item:hover {
  background: var(--bg-secondary);
}

.book-list-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.book-list-item:hover .btn-delete,
.book-list-item:hover .btn-folder-list {
  opacity: 1;
  transform: scale(1);
}

.btn-folder-list {
  position: relative;
  top: auto;
  right: auto;
  opacity: 0;
  transform: scale(0.85);
  flex-shrink: 0;
}

/* Shared with BookCard: the delete button absolute-positions itself
   to the row's top-right corner */
.btn-delete {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: none;
  background: rgba(255, 255, 255, 0.93);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.85);
  transition: all var(--transition-fast);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 1;
}

.btn-delete:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  box-shadow: 0 3px 10px rgba(220, 38, 38, 0.18);
}

.btn-delete:active {
  transform: scale(0.92);
}

.list-cover {
  position: relative;
  width: 38px;
  height: 52px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.list-cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-cover-initial {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.list-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-details {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.list-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--reader-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.list-author {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.list-folder-tag {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
