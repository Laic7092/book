<script setup lang="ts">
import { computed } from "vue";
import { getSearchApis } from "../registry";

const api = computed(() => getSearchApis()[0] ?? null);

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
  <div v-if="api?.hasHighlights && api?.searchResults.length" class="search-footer">
    <div class="search-footer-actions">
      <button
        class="search-footer-btn"
        @click.stop="api?.clearHighlights()"
        aria-label="Exit search"
      >
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
    <div class="search-footer-center">
      <span class="search-footer-counter">
        {{ (api?.currentResultIndex ?? -1) + 1 }} / {{ api?.searchResults.length ?? 0 }}
      </span>
    </div>
    <div class="search-footer-nav">
      <button class="search-footer-btn" @click.stop="handlePrevMatch()" aria-label="Previous match">
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
      <button class="search-footer-btn" @click.stop="handleNextMatch()" aria-label="Next match">
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
</template>

<style>
.search-footer {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}
.search-footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated, var(--reader-bg));
  color: var(--reader-text);
  cursor: pointer;
  min-width: 40px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}
.search-footer-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}
.search-footer-btn:active {
  transform: scale(0.95);
}
.search-footer-actions,
.search-footer-nav {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.search-footer-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}
.search-footer-counter {
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  color: var(--accent);
  white-space: nowrap;
}
</style>
