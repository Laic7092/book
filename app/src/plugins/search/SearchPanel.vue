<script setup lang="ts">
import { onUnmounted } from "vue";
import type { SearchResult } from "../../core/types";
import ModalPanel from "../../components/modals/ModalPanel.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { getSearchApi } from ".";

const emit = defineEmits<{ (e: "close"): void }>();

// Destructure to setup top level so the template auto-unwraps the refs
// (template unwrapping only applies to top-level refs, not nested properties).
const {
  searchQuery,
  searchResults,
  hasHighlights,
  doSearch,
  clearHighlights,
  navigateToResult,
  reset,
} = getSearchApi()!;

let _closeByNavigation = false;

async function handleResultClick(result: SearchResult) {
  _closeByNavigation = true;
  navigateToResult(result);
}

onUnmounted(() => {
  if (!_closeByNavigation) {
    reset();
  }
});

let searchDebounceTimer: number | null = null;

function handleSearchInput(value: string) {
  searchQuery.value = value;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    doSearch();
  }, 300);
}

function highlightMatch(context: string): string {
  const query = searchQuery.value;
  if (!query) return context;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return context.replace(regex, '<mark class="search-mark">$1</mark>');
}
</script>

<template>
  <ModalPanel title="Search" @close="emit('close')">
    <template #extra>
      <div class="search-box-wrapper">
        <div class="search-row">
          <input
            :value="searchQuery"
            @input="handleSearchInput(($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="Search in book..."
            class="search-input"
          />
          <button class="search-submit" @click="doSearch()" aria-label="Search">
            <AppIcon name="search" :size="16" />
          </button>
        </div>
        <div class="search-results-info" v-if="searchResults.length > 0">
          <span class="results-count"
            >{{ searchResults.length }} result{{ searchResults.length !== 1 ? "s" : "" }}</span
          >
          <button class="clear-highlights" @click="clearHighlights()" v-if="hasHighlights">
            Clear
          </button>
        </div>
      </div>
    </template>
    <ul class="search-results">
      <li
        v-for="(result, i) in searchResults"
        :key="i"
        class="search-result"
        @click.stop="handleResultClick(result)"
      >
        <div class="result-header">
          <span class="result-chapter">{{ result.chapterTitle }}</span>
          <span class="result-index">{{ i + 1 }}</span>
        </div>
        <p class="result-context" v-html="highlightMatch(result.context)"></p>
      </li>
    </ul>
    <p v-if="searchResults.length === 0 && searchQuery" class="no-results">No results found</p>
  </ModalPanel>
</template>

<style scoped>
.search-box-wrapper {
  padding: 14px 20px 16px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--reader-text);
  font-family: var(--font-ui);
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--accent-text);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.search-submit:hover {
  background: var(--accent-hover);
}

.search-results-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.results-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.clear-highlights {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-ui);
  transition: all var(--transition-fast);
}

.clear-highlights:hover {
  background: var(--accent-soft);
}

.search-results {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
}

.search-result {
  padding: 14px;
  cursor: pointer;
  border-radius: 9px;
  transition: all var(--transition-fast);
  margin-bottom: 6px;
  border: 1px solid var(--border-subtle);
}

.search-result:hover {
  background: var(--bg-secondary);
  border-color: var(--border);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.result-chapter {
  font-size: 13px;
  font-weight: 600;
  color: var(--reader-text);
}

.result-index {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 3px 9px;
  border-radius: 8px;
  font-weight: 600;
}

.search-result p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}

.search-mark {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.no-results {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
