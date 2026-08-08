<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import { useUIStore } from "../../stores/ui";
import Popover from "../Popover.vue";
import {
  getHeaderActions,
  getFooterActions,
  getToolbarItems,
  pluginStateVersion,
} from "../../plugins/manager/registry";

defineProps<{
  bookTitle: string;
  chapterTitle?: string;
  isPaginationMode: boolean;
  currentPage: number;
  totalPages: number;
  bookProgress: number;
  currentChapterTitle: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "prev-page"): void;
  (e: "next-page"): void;
  (e: "open-modal", modal: string): void;
}>();

const uiStore = useUIStore();
const showMenu = ref(false);

const headerActions = computed(() => {
  void pluginStateVersion.value;
  return getHeaderActions();
});

const barActions = computed(() => {
  void pluginStateVersion.value;
  return getFooterActions().filter((a) => a.position === "bar");
});
const menuActions = computed(() => {
  void pluginStateVersion.value;
  return getFooterActions().filter((a) => a.position === "menu");
});
const hasMenuActions = computed(() => menuActions.value.length > 0);

const toolbarItems = computed(() => {
  void pluginStateVersion.value;
  return getToolbarItems();
});

function toggleMenu() {
  showMenu.value = !showMenu.value;
}

function closeMenu() {
  showMenu.value = false;
}

async function openModal(modal: string) {
  closeMenu();
  await nextTick();
  emit("open-modal", modal);
}
</script>

<template>
  <header class="reader-header" :class="{ visible: uiStore.effectiveShowControls }">
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

  <footer class="reader-footer" :class="{ visible: uiStore.effectiveShowControls }">
    <Popover :open="showMenu" style="min-width: 160px" @close="closeMenu">
      <button
        v-for="a in menuActions"
        :key="a.id"
        class="menu-item"
        @click.stop="openModal(a.modal!)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          v-html="a.icon"
        />
        <span>{{ a.label }}</span>
      </button>
    </Popover>

    <div class="footer-sections">
      <div class="actions-section">
        <button
          v-if="hasMenuActions"
          class="footer-btn"
          :class="{ active: showMenu }"
          @click.stop="toggleMenu"
          aria-label="More options"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="12" cy="5" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="12" cy="19" r="1" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div class="center-section">
        <button
          class="progress-btn"
          @click.stop="emit('open-modal', 'toc')"
          aria-label="Table of contents"
        >
          <span class="progress-text"
            >{{ isNaN(bookProgress) ? 0 : Math.round(bookProgress) }}%</span
          >
          <span class="chapter-text">{{ currentChapterTitle || "Chapter 1" }}</span>
        </button>
      </div>

      <div class="actions-section">
        <button
          v-for="a in barActions"
          :key="a.id"
          class="footer-btn"
          @click.stop="openModal(a.modal!)"
          :aria-label="a.label"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            v-html="a.icon"
          />
        </button>
      </div>
    </div>
  </footer>

  <div
    v-if="toolbarItems.length > 0"
    class="reader-toolbar"
    :class="{ visible: uiStore.effectiveShowControls }"
  >
    <component v-for="item in toolbarItems" :key="item.id" :is="item.component" />
  </div>
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

.reader-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--header-bg);
  border-top: 1px solid var(--border-subtle);
  z-index: var(--z-chrome);
  opacity: 0;
  transform: translateY(100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.reader-footer.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.footer-sections {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
  min-height: 56px;
  gap: 8px;
}

.actions-section {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.center-section {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated, var(--reader-bg));
  color: var(--reader-text);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  min-width: 40px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.footer-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--border);
}

.footer-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.footer-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.footer-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.progress-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  background: var(--bg-elevated, var(--reader-bg));
  color: var(--reader-text);
  cursor: pointer;
  transition: all var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  min-height: 40px;
  justify-content: center;
}

.progress-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

.progress-btn:active {
  transform: scale(0.97);
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.chapter-text {
  font-size: 11px;
  color: var(--text-secondary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

:deep(.popover) {
  position: absolute;
  bottom: 100%;
  left: 12px;
  margin-bottom: 8px;
  padding: 4px;
  min-width: 160px;
  background: var(--bg-elevated, var(--reader-bg));
  border-color: var(--border-subtle);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--reader-text);
  font-size: 14px;
  cursor: pointer;
  transition: background var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.menu-item:hover {
  background: var(--hover-bg);
}

.menu-item:active {
  background: var(--border-subtle);
}

.reader-toolbar {
  position: fixed;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom) + 80px);
  z-index: var(--z-chrome);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 250ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.reader-toolbar.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active {
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-leave-active {
  transition: all 200ms ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  .reader-header {
    padding: 10px 12px;
    min-height: 48px;
  }

  .book-title {
    font-size: 14px;
  }

  .footer-sections {
    padding: 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
    gap: 4px;
    min-height: 52px;
  }

  .footer-btn {
    min-width: 36px;
    min-height: 36px;
    padding: 8px;
  }

  .progress-btn {
    padding: 4px 12px;
    min-height: 36px;
  }

  .progress-text {
    font-size: 13px;
  }

  .chapter-text {
    font-size: 10px;
    max-width: 100px;
  }

  .menu-popover {
    left: 8px;
  }
}

@media (max-width: 480px) {
  .reader-toolbar {
    right: 10px;
    gap: 6px;
  }
}

@media (max-width: 380px) {
  .reader-header {
    padding: 8px 10px;
  }

  .book-title {
    font-size: 13px;
  }

  .footer-sections {
    padding: 6px;
    gap: 3px;
  }

  .footer-btn {
    min-width: 34px;
    min-height: 34px;
    padding: 7px;
  }

  .progress-btn {
    padding: 3px 10px;
  }

  .progress-text {
    font-size: 12px;
  }

  .chapter-text {
    font-size: 9px;
    max-width: 70px;
  }
}

@media (max-height: 500px) and (orientation: landscape) {
  .reader-header {
    padding: 8px 16px;
    min-height: 44px;
  }

  .book-title,
  .footer-sections {
    padding: 6px 12px;
    min-height: 44px;
  }
}

@supports (padding: max(0px)) {
  .footer-sections {
    padding-left: max(12px, env(safe-area-inset-left, 0));
    padding-right: max(12px, env(safe-area-inset-right, 0));
  }

  .menu-popover {
    left: max(12px, env(safe-area-inset-left, 0));
  }
}
</style>
