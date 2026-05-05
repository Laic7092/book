<script setup lang="ts">
import type { SearchResult } from "../../core/types";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { getSearchApis } from "../registry";
import { getSearchReaderHost } from "./index";

const emit = defineEmits<{ (e: "close"): void }>();

const api = getSearchApis()[0]!;

function handleResultClick(result: SearchResult) {
  getSearchReaderHost()?.navigateToSearchResult(result);
}

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
    <div class="search-header-fixed">
      <ModalHeader title="Search" @close="emit('close')" />
      <div class="search-box-wrapper">
        <div class="search-box">
          <input
            :value="api.searchQuery"
            @input="handleSearchInput(($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="Search in book..."
            class="search-input"
          />
          <button class="search-submit" @click="api.doSearch()">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        </div>
        <div class="search-results-info" v-if="api.searchResults.length > 0">
          <span class="results-count"
            >{{ api.searchResults.length }} result{{
              api.searchResults.length !== 1 ? "s" : ""
            }}</span
          >
          <button class="clear-highlights" @click="api.clearHighlights()" v-if="api.hasHighlights">
            Clear highlights
          </button>
        </div>
      </div>
    </div>
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
@import "../../styles/modal-shared.css";

.search-header-fixed {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  z-index: 10;
}

.search-box-wrapper {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
  color: var(--modal-text);
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--modal-text);
}

.search-box {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.search-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  background: var(--hover-bg);
  color: var(--modal-text);
  font-family: var(--font-ui);
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--modal-bg);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.search-submit {
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: all 150ms ease;
}

.search-submit:hover {
  background: color-mix(in srgb, var(--accent) 85%, black);
}

.search-results-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.results-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.clear-highlights {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  font-family: var(--font-ui);
}

.clear-highlights:hover {
  background: var(--hover-bg);
}

.search-results {
  list-style: none;
  padding: 12px 14px;
  margin: 0;
}

.search-result {
  padding: 14px;
  cursor: pointer;
  border-radius: 10px;
  transition: all 150ms ease;
  margin-bottom: 6px;
  border: 1px solid var(--border-subtle);
}

.search-result:hover {
  background: var(--hover-bg);
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
  background: var(--hover-bg);
  padding: 3px 9px;
  border-radius: 10px;
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
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}

.no-results {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
