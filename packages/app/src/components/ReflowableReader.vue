<script setup lang="ts">
import { ref, computed, onUnmounted, defineAsyncComponent } from "vue";
import { useUIStore } from "../stores/ui";
import { useReaderMachine } from "../composables/useReaderMachine";
import ReaderChrome from "./reader/ReaderChrome.vue";
import ReaderErrorOverlay from "./reader/ReaderErrorOverlay.vue";

const ModalWrapper = defineAsyncComponent(() => import("./modals/ModalWrapper.vue"));
import type { Book } from "../core/types";
import { navigate } from "../utils/router";

const props = defineProps<{
  book: Book;
}>();

const uiStore = useUIStore();

const containerRef = ref<HTMLElement | null>(null);

const engine = useReaderMachine(
  computed(() => props.book.id),
  computed(() => props.book.format),
  containerRef,
);

const currentChapterTitle = computed(() => {
  const chapter = engine.chapters.value[engine.currentChapterIndex.value];
  return chapter?.title;
});

function handleClose() {
  uiStore.setTransitioning(true);
  navigate("/");
}

function openModal(modal: string) {
  uiStore.openModal(modal as any);
}

function closeModal() {
  uiStore.closeModal();
}

onUnmounted(() => {
  uiStore.setControls(false);
});

const overlayVisible = computed(() => engine.isReady.value);

defineExpose({ getDocument: () => engine.getDocument?.() ?? null });
</script>

<template>
  <div class="reader-view-container">
    <div ref="containerRef" class="reader-content-wrapper">
      <div v-if="engine.chapterLoading.value" class="chapter-loading-overlay" />
    </div>

    <component
      v-if="overlayVisible"
      v-for="(comp, name) in engine.overlayComponents.value"
      :key="name"
      :is="comp"
    />

    <ReaderErrorOverlay
      v-if="engine.hasError.value"
      :message="engine.errorMessage.value"
      @retry="engine.retry"
      @close="handleClose"
    />

    <ReaderChrome
      :book-title="book.title"
      :chapter-title="currentChapterTitle"
      :is-pagination-mode="engine.isPaginationMode.value"
      :current-page="engine.currentPage.value"
      :total-pages="engine.totalPages.value"
      :book-progress="engine.totalBookProgress.value"
      :current-chapter-title="currentChapterTitle || ''"
      :can-go-to-prev-chapter="engine.currentChapterIndex.value > 0"
      :can-go-to-next-chapter="engine.currentChapterIndex.value < engine.chapters.value.length - 1"
      @close="handleClose"
      @prev-page="engine.prevPage"
      @next-page="engine.nextPage"
      @prev-chapter="
        engine.handleSelectChapter(engine.chapters.value[engine.currentChapterIndex.value - 1]?.id)
      "
      @next-chapter="
        engine.handleSelectChapter(engine.chapters.value[engine.currentChapterIndex.value + 1]?.id)
      "
      @open-modal="openModal"
    />

    <button
      v-show="uiStore.showControls && engine.canGoBack.value"
      class="history-btn history-back"
      @click.stop="engine.handleHistoryBack"
      aria-label="Go back"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
    <button
      v-show="uiStore.showControls && engine.canGoForward.value"
      class="history-btn history-forward"
      @click.stop="engine.handleHistoryForward"
      aria-label="Go forward"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </button>

    <ModalWrapper
      v-if="uiStore.activeModal"
      :modal-type="uiStore.activeModal"
      :chapters="engine.chapters.value"
      :current-chapter-id="engine.currentChapterId.value"
      @close="closeModal"
      @select-chapter="engine.handleSelectChapter"
    />
  </div>
</template>

<style scoped>
.reader-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--reader-text);
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
  position: relative;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
}

.reader-content-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
  contain: strict;
}

.chapter-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--reader-bg, transparent);
  cursor: wait;
}

.history-btn {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--z-chrome);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-elevated, #fff);
  color: var(--reader-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.1),
    0 1px 4px rgba(0, 0, 0, 0.06);
  -webkit-tap-highlight-color: transparent;
  opacity: 0.55;
  backdrop-filter: blur(12px);
  transition:
    opacity 200ms ease,
    transform 200ms ease,
    border-color 200ms ease,
    color 200ms ease,
    box-shadow 200ms ease;
}

.history-btn:hover {
  opacity: 1;
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-50%) scale(1.08);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.14),
    0 2px 6px rgba(0, 0, 0, 0.08);
}

.history-back {
  left: max(12px, env(safe-area-inset-left, 0));
}

.history-forward {
  right: max(12px, env(safe-area-inset-right, 0));
}
</style>
