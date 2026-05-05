<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import { getFooterActions, pluginStateVersion, getSearchApis } from "../../plugins/registry";

defineProps<{
  showControls: boolean;
  isPaginationMode: boolean;
  currentPage: number;
  pagesCount: number;
  readingProgress: number;
  bookProgress: number;
  currentChapterTitle: string;
  canPrev: boolean;
  canNext: boolean;
}>();

const emit = defineEmits<{
  (e: "prev-page"): void;
  (e: "next-page"): void;
  (e: "prev-chapter"): void;
  (e: "next-chapter"): void;
  (e: "open-modal", modal: string): void;
}>();

const api = computed(() => getSearchApis()[0] ?? null);

const showMenu = ref(false);

const barActions = computed(() => {
  void pluginStateVersion.value;
  return getFooterActions().filter((a) => a.position === "bar");
});
const menuActions = computed(() => {
  void pluginStateVersion.value;
  return getFooterActions().filter((a) => a.position === "menu");
});
const hasMenuActions = computed(() => menuActions.value.length > 0);

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

function handlePrevMatch() {
  const s = getSearchApis()[0];
  const idx = s?.goToPreviousMatch();
  if (idx !== undefined && s?.searchResults) {
    s.navigateToResult(s.searchResults[idx]);
  }
}

function handleNextMatch() {
  const s = getSearchApis()[0];
  const idx = s?.goToNextMatch();
  if (idx !== undefined && s?.searchResults) {
    s.navigateToResult(s.searchResults[idx]);
  }
}
</script>

<template>
  <footer class="reader-footer" :class="{ visible: showControls }">
    <!-- Menu Popover -->
    <Transition name="menu">
      <div v-if="showMenu" class="menu-popover" @click.stop>
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
      </div>
    </Transition>

    <!-- Search Mode -->
    <Transition name="slide-fade" mode="out-in">
      <div
        v-if="api?.hasHighlights && api?.searchResults.length"
        key="search"
        class="footer-sections"
      >
        <div class="actions-section">
          <button class="footer-btn" @click.stop="api?.clearHighlights()" aria-label="Exit search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="center-section">
          <span class="search-counter"
            >{{ (api?.currentResultIndex ?? -1) + 1 }} / {{ api?.searchResults.length ?? 0 }}</span
          >
        </div>
        <div class="nav-section">
          <button class="footer-btn" @click.stop="handlePrevMatch()" aria-label="Previous match">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button class="footer-btn" @click.stop="handleNextMatch()" aria-label="Next match">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Normal Mode -->
      <div v-else key="normal" class="footer-sections">
        <div class="actions-section">
          <!-- Plugin bar actions (e.g. bookmarks) -->
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
          <!-- Overflow menu toggle -->
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

        <div class="nav-section">
          <button
            class="footer-btn"
            @click.stop="emit('prev-chapter')"
            :disabled="!canPrev"
            :aria-label="'Previous chapter'"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            class="footer-btn"
            @click.stop="emit('next-chapter')"
            :disabled="!canNext"
            :aria-label="'Next chapter'"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </footer>
</template>

<style scoped>
.reader-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--header-bg);
  border-top: 1px solid var(--border-subtle);
  z-index: 100;
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

/* Layout Sections */
.footer-sections {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
  min-height: 56px;
  gap: 8px;
}

.nav-section,
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

/* Buttons */
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

/* Progress Button (TOC trigger) */
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

.search-counter {
  font-size: 14px;
  font-weight: 600;
  color: var(--reader-text);
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  color: var(--accent);
  white-space: nowrap;
}

.menu-popover {
  position: absolute;
  bottom: 100%;
  left: 12px;
  margin-bottom: 8px;
  background: var(--bg-elevated, var(--reader-bg));
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 4px;
  min-width: 160px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
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

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.menu-enter-active {
  transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.menu-leave-active {
  transition: all 150ms ease;
}

.menu-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}

.menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
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

/* Responsive */
@media (max-width: 768px) {
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

@media (max-width: 380px) {
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

/* Landscape */
@media (max-height: 500px) and (orientation: landscape) {
  .footer-sections {
    padding: 6px 12px;
    min-height: 44px;
  }
}

/* Safe area insets */
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
