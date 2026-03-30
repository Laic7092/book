// Simplified chapter loader - loads current chapter and adjacent chapters
// No virtual scrolling, no complex range management

import { ref, computed, type Ref } from "vue";
import type { Chapter } from "../core/types";
import * as booksStore from "../storage/books";

export function useChapterLoader(
  bookId: Ref<string | undefined>,
  chapters: Ref<Chapter[]>,
  currentChapterIndex: Ref<number>,
) {
  const loadedContents = ref<Map<string, string>>(new Map());
  const isLoading = ref(false);

  // All loaded content sorted by chapter order
  const allLoadedContent = computed(() => {
    const result: Array<{ chapterId: string; title: string; content: string; order: number }> = [];
    for (const chapter of chapters.value) {
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
    if (!bookId.value || loadedContents.value.has(chapterId)) return;
    const content = await booksStore.getChapterContent(bookId.value, chapterId);
    if (content !== undefined) {
      loadedContents.value.set(chapterId, content);
    }
  }

  // Load current chapter and adjacent chapters
  async function loadCurrentAndAdjacent(buffer: number = 1): Promise<void> {
    const index = currentChapterIndex.value;
    if (index < 0 || !bookId.value) return;

    isLoading.value = true;
    try {
      const start = Math.max(0, index - buffer);
      const end = Math.min(chapters.value.length - 1, index + buffer);

      const promises: Promise<void>[] = [];
      for (let i = start; i <= end; i++) {
        const chapter = chapters.value[i];
        if (chapter && !loadedContents.value.has(chapter.id)) {
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
      const promises = chapters.value
        .filter((ch) => !loadedContents.value.has(ch.id))
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

    for (const [chapterId] of loadedContents.value) {
      const chapterIndex = chapters.value.findIndex((c) => c.id === chapterId);
      if (chapterIndex < 0 || Math.abs(chapterIndex - index) > keepRange) {
        loadedContents.value.delete(chapterId);
      }
    }
  }

  function isLoaded(chapterId: string): boolean {
    return loadedContents.value.has(chapterId);
  }

  function getContent(chapterId: string): string | undefined {
    return loadedContents.value.get(chapterId);
  }

  function reset(): void {
    loadedContents.value.clear();
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
