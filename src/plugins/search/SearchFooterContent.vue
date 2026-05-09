<script setup lang="ts">
import { computed, watch, onUnmounted } from "vue";
import { getSearchApis } from "../registry";
import { useUIStore } from "../../stores/ui";

const uiStore = useUIStore();

const api = computed(() => getSearchApis()[0] ?? null);

// Suppress header/footer/toolbar when search highlights are active
const active = computed(() => !!(api.value?.hasHighlights && api.value?.searchResults.length));
watch(
  active,
  (val) => {
    uiStore.setSuppressControls(val);
  },
  { immediate: true },
);

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

function handleClear() {
  const s = getSearchApis()[0];
  s?.clearHighlights();
  uiStore.setSuppressControls(false);
}

onUnmounted(() => {
  uiStore.setSuppressControls(false);
});

const currentLabel = computed(() => {
  const a = api.value;
  if (!a || a.searchResults.length === 0) return "";
  return `${(a.currentResultIndex ?? -1) + 1} / ${a.searchResults.length}`;
});
</script>

<template>
  <div
    v-if="api?.hasHighlights && api?.searchResults.length"
    class="search-nav-overlay"
    :class="{ 'with-controls': uiStore.showControls }"
  >
    <div class="search-nav-chip">
      <button class="nav-btn" @click.stop="handlePrevMatch()" aria-label="Previous match">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span class="nav-counter">{{ currentLabel }}</span>
      <button class="nav-btn" @click.stop="handleNextMatch()" aria-label="Next match">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      <div class="nav-divider"></div>
      <button class="nav-btn nav-close" @click.stop="handleClear" aria-label="Exit search">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-nav-overlay {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 76px;
  z-index: var(--z-overlay);
  transition: bottom 350ms cubic-bezier(0.4, 0, 0.2, 1);
}

.search-nav-overlay.with-controls {
  bottom: calc(env(safe-area-inset-bottom) + 76px);
}

.search-nav-chip {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border-subtle, #e0e0e0);
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--reader-text, #333);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms;
}

.nav-btn:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.06));
}

.nav-btn:active {
  transform: scale(0.9);
}

.nav-close:hover {
  color: #e74c3c;
}

.nav-counter {
  font-size: 13px;
  font-weight: 600;
  padding: 0 6px;
  min-width: 40px;
  text-align: center;
  color: var(--reader-text, #333);
  font-variant-numeric: tabular-nums;
}

.nav-divider {
  width: 1px;
  height: 20px;
  background: var(--border-subtle, #e0e0e0);
  margin: 0 2px;
}

@media (max-width: 480px) {
  .search-nav-overlay {
    bottom: 68px;
  }

  .search-nav-overlay.with-controls {
    bottom: calc(env(safe-area-inset-bottom) + 68px);
  }
}
</style>
