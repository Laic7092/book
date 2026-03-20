// Composable for search functionality in reader

import { ref, type Ref } from "vue";
import { searchInBook, highlightMatches } from "../search/engine";
import type { Chapter, SearchResult } from "../core/types";
import * as booksStore from "../storage/books";

interface UseReaderSearchOptions {
  bookId: Ref<string | undefined>;
  chapters: Ref<Chapter[]>;
  isPaginationMode: Ref<boolean>;
  loadedChapters?: Ref<Set<string>>;
  chapterContents?: Ref<Map<string, string>>;
}

export function useReaderSearch(options: UseReaderSearchOptions) {
  const { bookId, chapters, isPaginationMode, loadedChapters, chapterContents } = options;

  const searchQuery = ref("");
  const searchResults = ref<SearchResult[]>([]);
  const hasHighlights = ref(false);
  const currentResultIndex = ref(-1);

  const doSearch = async () => {
    if (!searchQuery.value.trim() || !bookId.value) {
      searchResults.value = [];
      return;
    }

    searchResults.value = await searchInBook(bookId.value, searchQuery.value, chapters.value);

    if (
      !isPaginationMode.value &&
      searchResults.value.length > 0 &&
      loadedChapters &&
      chapterContents
    ) {
      hasHighlights.value = true;
      const newMap = new Map(chapterContents.value);
      for (const chapter of chapters.value) {
        if (loadedChapters.value.has(chapter.id)) {
          const originalContent = await booksStore.getChapterContent(bookId.value!, chapter.id);
          if (originalContent) {
            newMap.set(chapter.id, highlightMatches(originalContent, searchQuery.value));
          }
        }
      }
      chapterContents.value = newMap;
    }
  };

  const clearHighlights = async () => {
    hasHighlights.value = false;
    currentResultIndex.value = -1;

    if (!isPaginationMode.value && loadedChapters && chapterContents) {
      const newMap = new Map(chapterContents.value);
      for (const chapter of chapters.value) {
        if (loadedChapters.value.has(chapter.id)) {
          const originalContent = await booksStore.getChapterContent(bookId.value!, chapter.id);
          if (originalContent) {
            newMap.set(chapter.id, originalContent);
          }
        }
      }
      chapterContents.value = newMap;
    } else {
      const contentEl = document.querySelector(".chapter-body");
      if (contentEl) {
        const marks = contentEl.querySelectorAll("mark.search-mark");
        marks.forEach((mark) => {
          const parent = mark.parentNode;
          while (mark.firstChild) {
            parent?.insertBefore(mark.firstChild, mark);
          }
          mark.remove();
        });
      }
    }
  };

  const goToNextMatch = () => {
    if (searchResults.value.length === 0) return;
    currentResultIndex.value = (currentResultIndex.value + 1) % searchResults.value.length;
    return currentResultIndex.value;
  };

  const goToPreviousMatch = () => {
    if (searchResults.value.length === 0) return;
    currentResultIndex.value =
      (currentResultIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
    return currentResultIndex.value;
  };

  const reset = () => {
    searchQuery.value = "";
    searchResults.value = [];
    hasHighlights.value = false;
    currentResultIndex.value = -1;
  };

  return {
    searchQuery,
    searchResults,
    hasHighlights,
    currentResultIndex,
    doSearch,
    clearHighlights,
    goToNextMatch,
    goToPreviousMatch,
    reset,
  };
}
