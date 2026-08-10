<script setup lang="ts">
import type { Book } from "../core/types";
import AppIcon from "./ui/AppIcon.vue";

defineProps<{
  book: Book;
  coverUrl?: string;
  gradient: string;
  initial: string;
  /** Stagger animation delay in ms (0 = none) */
  delayMs?: number;
}>();

const emit = defineEmits<{
  open: [];
  delete: [event: Event];
  "move-folder": [event: Event];
}>();
</script>

<template>
  <div
    class="book-card"
    :style="delayMs ? { animationDelay: `${delayMs}ms` } : undefined"
    @click="emit('open')"
    tabindex="0"
    @keydown.enter="emit('open')"
    role="button"
    :aria-label="`Open ${book.title} by ${book.author || 'Unknown author'}`"
  >
    <div class="book-cover" :style="{ background: gradient }">
      <img v-if="coverUrl" :src="coverUrl" :alt="`Cover of ${book.title}`" class="cover-image" />
      <span v-else class="cover-initial" aria-hidden="true">{{ initial }}</span>
    </div>
    <button
      class="btn-folder"
      @click="emit('move-folder', $event)"
      title="Move to folder"
      aria-label="Move to folder"
      tabindex="0"
    >
      <AppIcon name="folder" :size="12" />
    </button>
    <button
      class="btn-delete"
      @click="emit('delete', $event)"
      title="Delete book"
      aria-label="Delete book"
      tabindex="0"
    >
      <AppIcon name="close" :size="13" />
    </button>
  </div>
</template>

<style scoped>
/* ==========================================
   BOOK CARD
   ========================================== */

.book-card {
  position: relative;
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  animation: fadeInUp 0.45s ease-out backwards;
  box-shadow: var(--shadow-xs);
}

/* Cover */
.book-cover {
  position: relative;
  aspect-ratio: 3/4;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow:
    var(--shadow-sm),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  transition:
    transform var(--transition-base),
    box-shadow var(--transition-base);
}

.book-card:hover .book-cover {
  transform: scale(1.04);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.12),
    0 12px 28px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-initial {
  font-family: var(--font-display);
  font-size: 52px;
  font-weight: 500;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-base);
}

.book-card:hover .cover-initial {
  transform: scale(1.1);
}

/* Subtle paper texture on covers */
.book-cover::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(255, 255, 255, 0.015) 2px,
      rgba(255, 255, 255, 0.015) 4px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.01) 2px,
      rgba(0, 0, 0, 0.01) 4px
    );
  pointer-events: none;
  opacity: 0.5;
}

/* Delete button */
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

.book-card:hover .btn-delete {
  opacity: 1;
  transform: scale(1);
}

.btn-delete:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  box-shadow: 0 3px 10px rgba(220, 38, 38, 0.18);
}

.btn-delete:active {
  transform: scale(0.92);
}

/* ═══════════════════════════════════════════════
   FOLDER BUTTON ON CARD HOVER
   ═══════════════════════════════════════════════ */

.btn-folder {
  position: absolute;
  top: 7px;
  right: 41px;
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

.book-card:hover .btn-folder {
  opacity: 1;
  transform: scale(1);
}

.btn-folder:hover {
  background: #f0f5ff;
  color: var(--accent);
  box-shadow: 0 3px 10px rgba(91, 154, 255, 0.18);
}

.btn-folder:active {
  transform: scale(0.92);
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
