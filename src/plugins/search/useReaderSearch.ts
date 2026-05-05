// Composable for search functionality in reader

import { ref } from "vue";
import { searchInBook } from "./engine";
import type { SearchResult } from "../../core/types";
import type { ReaderHost } from "../../core/reader-host";
import { generateCfiFromCharOffset, resolveCfiRange } from "../../utils/epub-cfi";

export function useReaderSearch(readerHost: () => ReaderHost | null) {
  const searchQuery = ref("");
  const searchResults = ref<SearchResult[]>([]);
  const hasHighlights = ref(false);
  const currentResultIndex = ref(-1);
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

    const range = resolveCfiRange(startCfi, endCfi, container);
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
    }
  }

  // ── Search ──

  const doSearch = async () => {
    if (!searchQuery.value.trim()) {
      searchResults.value = [];
      hasHighlights.value = false;
      return;
    }

    clearTempHighlight?.();
    clearTempHighlight = null;
    await clearHighlights();

    const host = readerHost();
    const bookId = host?.getCurrentBookId();
    const chapters = host?.getChapters() ?? [];
    if (!bookId) return;

    searchResults.value = await searchInBook(bookId, searchQuery.value, chapters, {
      getChapterContent: (_: string, chapterId: string) =>
        host?.getChapterContent(chapterId) ?? Promise.resolve(undefined),
    });
  };

  const clearHighlights = async () => {
    hasHighlights.value = false;
    currentResultIndex.value = -1;
    clearTempHighlight?.();
    clearTempHighlight = null;

    const host = readerHost();
    const doc = host?.getDocument();
    const contentEl = doc?.querySelector(".chapter-body");
    if (contentEl) {
      const marks = contentEl.querySelectorAll("mark");
      marks.forEach((mark) => {
        const parent = mark.parentNode;
        while (mark.firstChild) {
          parent?.insertBefore(mark.firstChild, mark);
        }
        mark.remove();
      });
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

  function findPageFromMark(host: ReaderHost, mark: Element): number {
    const doc = host.getDocument();
    if (!doc) return 0;
    const bodyRect = doc.body.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const offset = markRect.left - bodyRect.left;
    const total = host.getTotalPages();
    const bodyScrollWidth = doc.body.scrollWidth;
    const step = total > 0 ? bodyScrollWidth / total : 0;
    return step > 0 ? Math.max(0, Math.min(total - 1, Math.floor(offset / step))) : 0;
  }

  async function navigateToResult(result: SearchResult) {
    const host = readerHost();
    if (!host || !result) return;

    const targetChapter = host.getChapters().find((c) => c.id === result.chapterId);
    if (!targetChapter) return;

    const sameChapter = targetChapter.id === host.getCurrentChapter()?.id;

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
      if (host.isPaginationMode.value) {
        const page = findPageFromMark(host, mark);
        host.goToPage(page);
        host.pushToHistory(targetChapter.id, page);
      } else {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        host.pushToHistory(targetChapter.id, 0);
      }
    }

    hasHighlights.value = true;
    host.closeModal();
  }

  const reset = () => {
    clearTempHighlight?.();
    clearTempHighlight = null;
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
    navigateToResult,
    reset,
  };
}
