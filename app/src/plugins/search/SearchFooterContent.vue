<script setup lang="ts">
import { computed, watch, onUnmounted } from "vue";
import { getSearchApi } from ".";
import AppIcon from "../../components/ui/AppIcon.vue";
import { useUIStore } from "../../stores/ui";

const uiStore = useUIStore();

const api = computed(() => getSearchApi());

// Suppress header/footer/toolbar when search highlights are active
const active = computed(
  () => !!api.value?.hasHighlights.value && api.value.searchResults.value.length > 0,
);
watch(
  active,
  (val) => {
    uiStore.setSuppressControls(val);
  },
  { immediate: true },
);

function handlePrevMatch() {
  const s = getSearchApi();
  const idx = s?.goToPreviousMatch();
  if (idx !== undefined && s?.searchResults) {
    s.navigateToResult(s.searchResults.value[idx]);
  }
}

function handleNextMatch() {
  const s = getSearchApi();
  const idx = s?.goToNextMatch();
  if (idx !== undefined && s?.searchResults) {
    s.navigateToResult(s.searchResults.value[idx]);
  }
}

function handleClear() {
  const s = getSearchApi();
  s?.clearHighlights();
  uiStore.setSuppressControls(false);
}

onUnmounted(() => {
  uiStore.setSuppressControls(false);
});

const currentLabel = computed(() => {
  const a = api.value;
  if (!a || a.searchResults.value.length === 0) return "";
  return `${(a.currentResultIndex.value ?? -1) + 1} / ${a.searchResults.value.length}`;
});
</script>

<template>
  <div
    v-if="api?.hasHighlights.value && api.searchResults.value.length"
    class="search-nav-overlay"
    :class="{ 'with-controls': uiStore.showControls }"
  >
    <div class="search-nav-chip">
      <button class="nav-btn" @click.stop="handlePrevMatch()" aria-label="Previous match">
        <AppIcon name="chevron-left" :size="14" :stroke-width="2.5" />
      </button>
      <span class="nav-counter">{{ currentLabel }}</span>
      <button class="nav-btn" @click.stop="handleNextMatch()" aria-label="Next match">
        <AppIcon name="chevron-right" :size="14" :stroke-width="2.5" />
      </button>
      <div class="nav-divider"></div>
      <button class="nav-btn nav-close" @click.stop="handleClear" aria-label="Exit search">
        <AppIcon name="close" :size="14" :stroke-width="2.5" />
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
  backdrop-filter: blur(2px);
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
