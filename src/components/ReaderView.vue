<script setup lang="ts">
import { ref, computed } from "vue";
import { useReaderStore } from "../stores/reader";
import { useUIStore } from "../stores/ui";
import { useReaderEngine, type ReaderContentAPI } from "../composables/useReaderEngine";
import { ReaderHeader, ReaderFooter, ReaderContent, ReaderToolbar } from "../components/reader";
import { ModalWrapper } from "../components/modals";
import type { Book } from "../core/types";
import { navigate } from "../router";

const props = defineProps<{
  book: Book;
}>();

const readerStore = useReaderStore();
const uiStore = useUIStore();

const readerContentRef = ref<ReaderContentAPI | null>(null);

const engine = useReaderEngine(
  computed(() => props.book.id),
  readerContentRef,
);

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
</script>

<template>
  <div class="reader-view-container">
    <!-- ── Content layer (z: 0) ── -->
    <ReaderContent
      ref="readerContentRef"
      :content="engine.displayContent.value"
      :is-pagination-mode="engine.isPaginationMode.value"
      :current-page="engine.currentPage.value"
      :chapter-loading="engine.chapterLoading.value"
      :loaded-chapters="engine.transformedLoadedContent.value"
      :epub-resources="engine.currentChapterResources.value"
      :page-margin="engine.pageMargin.value"
      :on-link-click="engine.handleInternalLinkClick"
      :on-column-layout="engine.handleColumnLayout"
      :on-chapters-changed="engine.handleChaptersChanged"
      :on-iframe-ready="engine.handleIframeReady"
    />

    <!-- ── Overlay layer (z: 100) ── -->
    <component v-for="(comp, name) in engine.overlayComponents.value" :key="name" :is="comp" />

    <!-- ── Chrome layer (z: 200) ── -->
    <ReaderHeader
      :book-title="book.title"
      :chapter-title="readerStore.currentChapter?.title"
      :show-controls="uiStore.effectiveShowControls"
      :header-actions="engine.headerActions.value"
      @close="handleClose"
    />

    <ReaderFooter
      :show-controls="uiStore.effectiveShowControls"
      :is-pagination-mode="engine.isPaginationMode.value"
      :current-page="engine.currentPage.value"
      :pages-count="engine.totalPages.value"
      :reading-progress="engine.readingProgress.value"
      :book-progress="engine.totalBookProgress.value"
      :current-chapter-title="readerStore.currentChapter?.title || ''"
      :can-prev="engine.currentChapterIndex.value > 0"
      :can-next="engine.currentChapterIndex.value < readerStore.chapters.length - 1"
      @prev-page="engine.prevPage"
      @next-page="engine.nextPage"
      @prev-chapter="
        engine.handleSelectChapter(readerStore.chapters[engine.currentChapterIndex.value - 1]?.id)
      "
      @next-chapter="
        engine.handleSelectChapter(readerStore.chapters[engine.currentChapterIndex.value + 1]?.id)
      "
      @open-modal="openModal"
    />

    <button
      v-show="uiStore.showControls && engine.navStack.canGoBack.value"
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
      v-show="uiStore.showControls && engine.navStack.canGoForward.value"
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

    <ReaderToolbar />

    <ModalWrapper
      :modal-type="uiStore.activeModal"
      :chapters="readerStore.chapters"
      :current-chapter-id="readerStore.currentChapter?.id ?? null"
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

.reader-view::-webkit-scrollbar {
  width: 7px;
}

.reader-view::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.reader-view::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--border) 70%, var(--reader-text));
}

.reader-view-container {
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
}
</style>
