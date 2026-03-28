// Composable for chapter preloading in vertical scroll mode

import { ref, computed, type Ref } from "vue";
import type { Chapter } from "../core/types";
import * as booksStore from "../storage/books";

export function useChapterPreloader(
  bookId: Ref<string | undefined>,
  chapters: Ref<Chapter[]>,
  currentChapterIndex: Ref<number>,
) {
  const loadedChapters = ref<Set<string>>(new Set());
  const isLoadingAdjacent = ref(false);
  const chapterContents = ref<Map<string, string>>(new Map());

  // Visible chapter range for virtual scrolling
  const visibleStartIndex = ref(0);
  const visibleEndIndex = ref(0);

  const allLoadedContent = computed(() => {
    const contents: Array<{ chapterId: string; title: string; content: string; order: number }> =
      [];
    for (let i = 0; i < chapters.value.length; i++) {
      const chapter = chapters.value[i];
      if (chapter && loadedChapters.value.has(chapter.id)) {
        const chapterContent = chapterContents.value.get(chapter.id);
        if (chapterContent) {
          contents.push({
            chapterId: chapter.id,
            title: chapter.title,
            content: chapterContent,
            order: chapter.order,
          });
        }
      }
    }
    contents.sort((a, b) => a.order - b.order);
    return contents;
  });

  // Get chapters in visible range (including unloaded ones for placeholder rendering)
  const visibleChapters = computed(() => {
    const result: Array<{
      chapter: Chapter;
      index: number;
      isLoaded: boolean;
      content?: string;
    }> = [];

    for (let i = visibleStartIndex.value; i <= visibleEndIndex.value; i++) {
      if (i >= 0 && i < chapters.value.length) {
        const chapter = chapters.value[i];
        if (chapter) {
          const isLoaded = loadedChapters.value.has(chapter.id);
          result.push({
            chapter,
            index: i,
            isLoaded,
            content: isLoaded ? chapterContents.value.get(chapter.id) : undefined,
          });
        }
      }
    }
    return result;
  });

  const loadChaptersInRange = async (startIndex: number, endIndex: number) => {
    if (!bookId.value) return;

    const actualStart = Math.max(0, startIndex);
    const actualEnd = Math.min(chapters.value.length - 1, endIndex);

    const chaptersToLoad: Chapter[] = [];
    for (let i = actualStart; i <= actualEnd; i++) {
      const chapter = chapters.value[i];
      if (chapter && !loadedChapters.value.has(chapter.id)) {
        chaptersToLoad.push(chapter);
      }
    }

    if (chaptersToLoad.length === 0) return;

    try {
      const loadPromises = chaptersToLoad.map(async (chapter) => {
        const content = await booksStore.getChapterContent(bookId.value!, chapter.id);
        if (content !== undefined) {
          chapterContents.value.set(chapter.id, content);
          loadedChapters.value.add(chapter.id);
        }
      });
      await Promise.all(loadPromises);
    } catch (err) {
      console.error("[loadChaptersInRange] Error loading chapters:", err);
    }
  };

  const loadAdjacentChapters = async (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= chapters.value.length) return;
    if (isLoadingAdjacent.value) return;

    const targetChapter = chapters.value[targetIndex];
    if (!targetChapter || loadedChapters.value.has(targetChapter.id)) return;

    isLoadingAdjacent.value = true;
    const actualBookId = bookId.value;

    try {
      const nextIndex = targetIndex + (targetIndex > currentChapterIndex.value ? 1 : -1);
      const chaptersToLoad: [number, Chapter][] = [[targetIndex, targetChapter]];

      if (nextIndex >= 0 && nextIndex < chapters.value.length) {
        const nextChapter = chapters.value[nextIndex];
        if (nextChapter && !loadedChapters.value.has(nextChapter.id)) {
          chaptersToLoad.push([nextIndex, nextChapter]);
        }
      }

      const loadPromises = chaptersToLoad.map(async ([, chapter]) => {
        if (!actualBookId) return;
        const content = await booksStore.getChapterContent(actualBookId, chapter.id);
        if (content !== undefined) {
          chapterContents.value.set(chapter.id, content);
          loadedChapters.value.add(chapter.id);
        }
      });

      await Promise.all(loadPromises);
    } catch (err) {
      console.error("[loadAdjacentChapters] Error loading chapter:", err);
    } finally {
      isLoadingAdjacent.value = false;
    }
  };

  const loadAllChapters = async () => {
    const currentIndex = currentChapterIndex.value;
    if (currentIndex < 0 || !bookId.value) return;

    const allLoaded = chapters.value.every((c) => loadedChapters.value.has(c.id));
    if (allLoaded) return;

    // Load current chapter content first
    const currentChapter = chapters.value[currentIndex];
    if (currentChapter && !loadedChapters.value.has(currentChapter.id)) {
      try {
        const content = await booksStore.getChapterContent(bookId.value, currentChapter.id);
        if (content !== undefined) {
          chapterContents.value.set(currentChapter.id, content);
          loadedChapters.value.add(currentChapter.id);
        }
      } catch (err) {
        console.error("[loadAllChapters] Error loading current chapter:", err);
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < chapters.value.length; i++) {
      if (i !== currentIndex && !loadedChapters.value.has(chapters.value[i].id)) {
        indices.push(i);
      }
    }

    indices.sort((a, b) => {
      const distA = Math.abs(a - currentIndex);
      const distB = Math.abs(b - currentIndex);
      return distA - distB;
    });

    for (const idx of indices) {
      const chapter = chapters.value[idx];
      if (chapter && !loadedChapters.value.has(chapter.id)) {
        try {
          const chapterContent = await booksStore.getChapterContent(bookId.value!, chapter.id);
          if (chapterContent !== undefined) {
            chapterContents.value.set(chapter.id, chapterContent);
            loadedChapters.value.add(chapter.id);
          }
        } catch (err) {
          console.error("[loadAllChapters] Error loading chapter:", err);
        }
      }
      if (indices.indexOf(idx) % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  };

  // Load initial chapters around current position (for lazy loading mode)
  const loadInitialChapters = async (bufferSize: number = 2) => {
    const currentIndex = currentChapterIndex.value;
    if (currentIndex < 0 || !bookId.value) return;

    const start = Math.max(0, currentIndex - bufferSize);
    const end = Math.min(chapters.value.length - 1, currentIndex + bufferSize);
    await loadChaptersInRange(start, end);

    // Update visible range
    visibleStartIndex.value = start;
    visibleEndIndex.value = end;
  };

  // Update visible range and load/unload chapters as needed
  const updateVisibleRange = async (newStart: number, newEnd: number, bufferSize: number = 1) => {
    const actualStart = Math.max(0, newStart - bufferSize);
    const actualEnd = Math.min(chapters.value.length - 1, newEnd + bufferSize);

    visibleStartIndex.value = actualStart;
    visibleEndIndex.value = actualEnd;

    await loadChaptersInRange(actualStart, actualEnd);
  };

  const loadChapter = async (chapterId: string) => {
    if (!bookId.value) return;
    const content = await booksStore.getChapterContent(bookId.value, chapterId);
    if (content !== undefined) {
      chapterContents.value.set(chapterId, content);
      loadedChapters.value.add(chapterId);
    }
  };

  const isChapterLoaded = (chapterId: string) => {
    return loadedChapters.value.has(chapterId);
  };

  const reset = () => {
    loadedChapters.value.clear();
    chapterContents.value.clear();
    isLoadingAdjacent.value = false;
    visibleStartIndex.value = 0;
    visibleEndIndex.value = 0;
  };

  const unloadChaptersOutsideRange = (keepStart: number, keepEnd: number) => {
    const chaptersToUnload: string[] = [];

    for (const chapterId of loadedChapters.value) {
      const chapterIndex = chapters.value.findIndex((c) => c.id === chapterId);
      if (chapterIndex < keepStart || chapterIndex > keepEnd) {
        chaptersToUnload.push(chapterId);
      }
    }

    for (const chapterId of chaptersToUnload) {
      loadedChapters.value.delete(chapterId);
      chapterContents.value.delete(chapterId);
    }
  };

  return {
    loadedChapters,
    isLoadingAdjacent,
    chapterContents,
    allLoadedContent,
    visibleChapters,
    visibleStartIndex,
    visibleEndIndex,
    loadAdjacentChapters,
    loadAllChapters,
    loadInitialChapters,
    updateVisibleRange,
    unloadChaptersOutsideRange,
    loadChapter,
    isChapterLoaded,
    reset,
  };
}
