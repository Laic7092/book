// Simplified chapter loader with LRU cache for chapter content

import { ref, computed, type Ref, type Reactive } from "vue";
import type { Chapter } from "../core/types";
import * as booksStore from "../storage/books";
import { LRUCache } from "../utils/lru-cache";
import { CHAPTER_CACHE_MAX_SIZE } from "../config/constants";

interface ChapterLoaderState {
  chapters: Chapter[];
}

export function useChapterLoader(
  bookId: Ref<string | undefined>,
  state: Reactive<ChapterLoaderState>,
  currentChapterIndex: Ref<number>,
) {
  const cache = new LRUCache<string>(CHAPTER_CACHE_MAX_SIZE);
  const isLoading = ref(false);

  // Sync LRU cache contents to a reactive Map for Vue reactivity
  const loadedContents = ref(new Map<string, string>());

  function syncCacheToRef() {
    loadedContents.value = new Map(cache.entries());
  }

  // All loaded content sorted by chapter order
  const allLoadedContent = computed(() => {
    const result: Array<{ chapterId: string; title: string; content: string; order: number }> = [];
    for (const chapter of state.chapters) {
      const content = loadedContents.value.get(chapter.id);
      if (content !== undefined) {
        result.push({
          chapterId: chapter.id,
          title: chapter.title,
          content,
          order: chapter.order,
        });
      }
    }
    return result.sort((a, b) => a.order - b.order);
  });

  // Load a single chapter
  async function loadChapter(chapterId: string): Promise<void> {
    if (!bookId.value || cache.has(chapterId)) return;
    const content = await booksStore.getChapterContent(bookId.value, chapterId);
    if (content !== undefined) {
      cache.set(chapterId, content);
      syncCacheToRef();
    }
  }

  // Load current chapter and adjacent chapters
  async function loadCurrentAndAdjacent(buffer: number = 1): Promise<void> {
    const index = currentChapterIndex.value;
    if (index < 0 || !bookId.value) return;

    isLoading.value = true;
    try {
      const start = Math.max(0, index - buffer);
      const end = Math.min(state.chapters.length - 1, index + buffer);

      const promises: Promise<void>[] = [];
      for (let i = start; i <= end; i++) {
        const chapter = state.chapters[i];
        if (chapter && !cache.has(chapter.id)) {
          promises.push(loadChapter(chapter.id));
        }
      }
      await Promise.all(promises);
    } finally {
      isLoading.value = false;
    }
  }

  // Load all chapters (for initial load or when needed)
  async function loadAll(): Promise<void> {
    if (!bookId.value) return;
    isLoading.value = true;
    try {
      const promises = state.chapters
        .filter((ch) => !cache.has(ch.id))
        .map((ch) => loadChapter(ch.id));
      await Promise.all(promises);
    } finally {
      isLoading.value = false;
    }
  }

  // Unload chapters far from current (keep memory low)
  function unloadDistant(keepRange: number = 5): void {
    const index = currentChapterIndex.value;
    if (index < 0) return;

    let changed = false;
    for (const [chapterId] of cache.entries()) {
      const chapterIndex = state.chapters.findIndex((c) => c.id === chapterId);
      if (chapterIndex < 0 || Math.abs(chapterIndex - index) > keepRange) {
        cache.delete(chapterId);
        changed = true;
      }
    }
    if (changed) syncCacheToRef();
  }

  function isLoaded(chapterId: string): boolean {
    return cache.has(chapterId);
  }

  function getContent(chapterId: string): string | undefined {
    return cache.get(chapterId);
  }

  function reset(): void {
    cache.clear();
    loadedContents.value = new Map();
    isLoading.value = false;
  }

  return {
    loadedContents,
    isLoading,
    allLoadedContent,
    loadChapter,
    loadCurrentAndAdjacent,
    loadAll,
    unloadDistant,
    isLoaded,
    getContent,
    reset,
  };
}
