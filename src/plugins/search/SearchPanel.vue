<script setup lang="ts">
import { onUnmounted } from "vue";
import type { SearchResult } from "../../core/types";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { getSearchApis } from "../manager/registry";

const emit = defineEmits<{ (e: "close"): void }>();

const api = getSearchApis()[0]!;

let _closeByNavigation = false;

async function handleResultClick(result: SearchResult) {
  _closeByNavigation = true;
  api.navigateToResult(result);
}

onUnmounted(() => {
  if (!_closeByNavigation) {
    api.reset();
  }
});

let searchDebounceTimer: number | null = null;

function handleSearchInput(value: string) {
  api.searchQuery = value;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    api.doSearch();
  }, 300);
}

function highlightMatch(context: string): string {
  const query = api.searchQuery;
  if (!query) return context;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return context.replace(regex, '<mark class="search-mark">$1</mark>');
}
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="Search" @close="emit('close')">
      <template #extra>
        <div class="search-box-wrapper">
          <div class="search-row">
            <input
              :value="api.searchQuery"
              @input="handleSearchInput(($event.target as HTMLInputElement).value)"
              type="text"
              placeholder="Search in book..."
              class="search-input"
            />
            <button class="search-submit" @click="api.doSearch()" aria-label="Search">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
          </div>
          <div class="search-results-info" v-if="api.searchResults.length > 0">
            <span class="results-count"
              >{{ api.searchResults.length }} result{{
                api.searchResults.length !== 1 ? "s" : ""
              }}</span
            >
            <button
              class="clear-highlights"
              @click="api.clearHighlights()"
              v-if="api.hasHighlights"
            >
              Clear
            </button>
          </div>
        </div>
      </template>
    </ModalHeader>
    <div class="modal-body scroll-body">
      <ul class="search-results">
        <li
          v-for="(result, i) in api.searchResults"
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
      <p v-if="api.searchResults.length === 0 && api.searchQuery" class="no-results">
        No results found
      </p>
    </div>
  </div>
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
  border: 1px solid var(--border-color);
  border-radius: 9px;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: var(--font-ui);
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.search-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}

.search-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border: none;
  border-radius: 9px;
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.search-submit:hover {
  background: var(--color-accent-hover);
}

.search-results-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.results-count {
  font-size: 12px;
  color: var(--text-muted);
}

.clear-highlights {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font-ui);
  transition: all var(--transition-fast);
}

.clear-highlights:hover {
  background: var(--color-accent-soft);
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
  border-color: var(--border-color);
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
  color: var(--text-primary);
}

.result-index {
  font-size: 11px;
  color: var(--text-muted);
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
  background: var(--color-accent-soft);
  color: var(--color-accent);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.no-results {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
