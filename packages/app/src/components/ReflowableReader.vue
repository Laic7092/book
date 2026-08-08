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
      @close="handleClose"
      @prev-page="engine.prevPage"
      @next-page="engine.nextPage"
      @open-modal="openModal"
    />

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
</style>
