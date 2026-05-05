// Composable for search functionality in reader

import { ref, type Ref } from "vue";
import { searchInBook, highlightMatches } from "./engine";
import type { Chapter, SearchResult } from "../../core/types";
import type { ReaderHost } from "../../core/reader-host";
import { generateCfiFromCharOffset, resolveCfiRange } from "../../utils/epub-cfi";

interface SearchJumpState {
  previousChapterId: string;
  previousPage: number;
}

interface UseReaderSearchOptions {
  bookId: Ref<string | undefined>;
  chapters: Ref<Chapter[]>;
  isPaginationMode: Ref<boolean>;
  loadedChapters?: Ref<Set<string>>;
  chapterContents?: Ref<Map<string, string>>;
  readerHost: () => ReaderHost | null;
}

export function useReaderSearch(options: UseReaderSearchOptions) {
  const { bookId, chapters, isPaginationMode, loadedChapters, chapterContents, readerHost } =
    options;

  const searchQuery = ref("");
  const searchResults = ref<SearchResult[]>([]);
  const hasHighlights = ref(false);
  const currentResultIndex = ref(-1);
  const hasJumpState = ref(false);

  let jumpState: SearchJumpState | null = null;
  let clearTempHighlight: (() => void) | null = null;

  // ── Temp highlight helpers ──

  function applyTempHighlight(
    doc: Document,
    container: Element,
    position: number,
    textLength: number,
    spineIndex: number,
  ) {
    clearTempHighlight?.();
    clearTempHighlight = null;

    const startCfi = generateCfiFromCharOffset(spineIndex, container, position);
    const endCfi = generateCfiFromCharOffset(spineIndex, container, position + textLength);
    if (!startCfi || !endCfi) return;

    const range = resolveCfiRange(startCfi, endCfi, doc.body);
    if (!range || range.collapsed) return;

    const marks: HTMLElement[] = [];

    const textNodes: Text[] = [];
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      textNodes.push(range.startContainer as Text);
    } else {
      const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent && node.textContent.length > 0) {
          textNodes.push(node);
        }
      }
    }

    for (const textNode of textNodes) {
      let startOffset = 0;
      let endOffset = (textNode.textContent || "").length;

      if (textNode === range.startContainer) startOffset = range.startOffset;
      if (textNode === range.endContainer) endOffset = range.endOffset;
      if (startOffset >= endOffset) continue;

      textNode.splitText(endOffset);
      const selectedNode = startOffset > 0 ? textNode.splitText(startOffset) : textNode;

      if (selectedNode.textContent && selectedNode.textContent.length > 0) {
        const mark = doc.createElement("mark");
        mark.style.backgroundColor = "rgba(251, 191, 36, 0.45)";
        mark.style.borderRadius = "2px";
        mark.style.transition = "background-color 1.5s ease";
        selectedNode.parentNode!.insertBefore(mark, selectedNode);
        mark.appendChild(selectedNode);
        marks.push(mark);
      }
    }

    if (marks.length > 0) {
      clearTempHighlight = () => {
        for (const mark of marks) {
          const parent = mark.parentNode;
          if (parent) {
            while (mark.firstChild) {
              parent.insertBefore(mark.firstChild, mark);
            }
            mark.remove();
          }
        }
      };

      setTimeout(() => {
        for (const mark of marks) {
          mark.style.backgroundColor = "transparent";
        }
      }, 1500);

      setTimeout(() => {
        clearTempHighlight?.();
        clearTempHighlight = null;
      }, 3000);
    }
  }

  // ── Search ──

  const doSearch = async () => {
    if (!searchQuery.value.trim() || !bookId.value) {
      searchResults.value = [];
      hasHighlights.value = false;
      return;
    }

    const host = readerHost();
    searchResults.value = await searchInBook(bookId.value, searchQuery.value, chapters.value, {
      getChapterContent: (_: string, chapterId: string) =>
        host?.getChapterContent(chapterId) ?? Promise.resolve(undefined),
    });

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
          const originalContent = await host?.getChapterContent(chapter.id);
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
      const host = readerHost();
      const newMap = new Map(chapterContents.value);
      for (const chapter of chapters.value) {
        if (loadedChapters.value.has(chapter.id)) {
          const originalContent = await host?.getChapterContent(chapter.id);
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

  // ── Result navigation ──

  async function navigateToResult(result: SearchResult) {
    const host = readerHost();
    if (!host || !result) return;

    const targetChapter = chapters.value.find((c) => c.id === result.chapterId);
    if (!targetChapter) return;

    const currentChapter = host.getCurrentChapter();
    if (!jumpState && currentChapter) {
      jumpState = {
        previousChapterId: currentChapter.id,
        previousPage: host.isPaginationMode.value ? host.getCurrentPage() : 0,
      };
      hasJumpState.value = true;
    }

    const sameChapter = targetChapter.id === currentChapter?.id;

    if (!sameChapter) {
      await host.navigateToChapter(targetChapter.id, 0);
    }

    // Wait for content to be ready
    await new Promise<void>((resolve) => {
      const check = () => {
        const doc = host.getDocument();
        if (doc?.body) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });

    const doc = host.getDocument();
    if (!doc?.body) return;

    const container = host.isPaginationMode.value
      ? doc.body
      : (doc.querySelector(`[data-chapter-id="${targetChapter.id}"]`) as HTMLElement | null) ||
        doc.body;

    applyTempHighlight(doc, container, result.position, result.text.length, targetChapter.order);

    await new Promise((r) => setTimeout(r, 50));
    const mark = container.querySelector("mark");
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center", inline: "start" });
    }

    hasHighlights.value = true;
  }

  async function goBackFromResult() {
    if (!jumpState) return;
    const { previousChapterId, previousPage } = jumpState;
    jumpState = null;
    hasJumpState.value = false;

    const host = readerHost();
    if (!host) return;

    if (previousChapterId !== host.getCurrentChapter()?.id) {
      await host.navigateToChapter(previousChapterId, previousPage);
    } else if (host.isPaginationMode.value) {
      const doc = host.getDocument();
      if (doc) {
        const total = host.getTotalPages();
        const step = total > 0 ? doc.documentElement.scrollWidth / total : 0;
        const scrollEl = doc.querySelector("html") || doc.documentElement;
        if (scrollEl && step > 0) {
          scrollEl.scrollLeft = previousPage * step;
        }
      }
    }
  }

  const reset = () => {
    clearTempHighlight?.();
    clearTempHighlight = null;
    jumpState = null;
    hasJumpState.value = false;
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
    hasJumpState,
    doSearch,
    clearHighlights,
    goToNextMatch,
    goToPreviousMatch,
    navigateToResult,
    goBackFromResult,
    reset,
  };
}
