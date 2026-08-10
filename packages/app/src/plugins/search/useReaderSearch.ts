import { ref } from "vue";
import { searchInBook } from "./engine";
import type { SearchResult } from "../../core/types";
import type { ReaderState } from "@book/reader-core";
import type { ReaderSession } from "@book/reader-engine";
import { useDocumentMarker } from "../../composables/useDocumentMarker";
import { fetchChapterContent } from "../../storage/chapter-content";
import { useUIStore } from "../../stores/ui";

const uiStore = useUIStore();
const SEARCH_MARKER_ID = "search-temp";

function waitForState(
  getState: () => ReaderState,
  predicate: (s: ReaderState) => boolean,
  timeoutMs = 5000,
): Promise<boolean> {
  if (predicate(getState())) return Promise.resolve(true);
  const deadline = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      const s = getState();
      if (predicate(s)) return resolve(true);
      if (performance.now() > deadline) return resolve(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function useReaderSearch(getSession: () => ReaderSession | null) {
  const searchQuery = ref("");
  const searchResults = ref<SearchResult[]>([]);
  const hasHighlights = ref(false);
  const currentResultIndex = ref(-1);
  let marker: ReturnType<typeof useDocumentMarker> | null = null;

  function getMarker() {
    if (!marker) {
      marker = useDocumentMarker(() => getSession()?.getDocument() ?? null);
    }
    return marker;
  }

  function ensureSearchStyle(doc: Document) {
    if (doc.getElementById("plugin-search")) return;
    const style = doc.createElement("style");
    style.id = "plugin-search";
    style.textContent = `.search-match{background:rgba(251,191,36,0.45);border-radius:2px}`;
    doc.head.appendChild(style);
  }

  function findTextNodeAtOffset(
    container: Element,
    charOffset: number,
  ): { node: Text; offset: number } | null {
    const walker = (container.ownerDocument ?? document).createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let currentOffset = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      const textLen = text.length;
      if (currentOffset + textLen >= charOffset) {
        return { node: node as Text, offset: charOffset - currentOffset };
      }
      currentOffset += textLen;
    }
    return null;
  }

  function applyTempHighlight(
    doc: Document,
    container: Element,
    position: number,
    textLength: number,
    expectedText: string,
  ): boolean {
    const start = findTextNodeAtOffset(container, position);
    const end = findTextNodeAtOffset(container, position + textLength);
    if (!start || !end) return false;

    const range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    if (range.toString() !== expectedText) {
      const offset =
        start.node.nodeValue?.indexOf(expectedText, Math.max(0, start.offset - 5)) ?? -1;
      if (offset !== -1) {
        range.setStart(start.node, offset);
        range.setEnd(start.node, offset + expectedText.length);
      } else {
        return false;
      }
    }

    getMarker().add({ id: SEARCH_MARKER_ID, range, className: "search-match" });
    return true;
  }

  const doSearch = async () => {
    const session = getSession();
    if (!session) return;

    const state = session.getState();
    const bookId = state.bookId;
    if (!bookId) return;

    if (!searchQuery.value.trim()) {
      searchResults.value = [];
      hasHighlights.value = false;
      return;
    }

    getMarker().remove(SEARCH_MARKER_ID);
    await clearHighlights();

    searchResults.value = await searchInBook(bookId, searchQuery.value, state.chapters, {
      getChapterContent: (_bookId: string, chapterId: string) =>
        fetchChapterContent(bookId, chapterId).then((r) => r.html),
    });
  };

  const clearHighlights = async () => {
    hasHighlights.value = false;
    currentResultIndex.value = -1;
    getMarker().remove(SEARCH_MARKER_ID);
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

  function findPageFromMark(doc: Document, mark: Element, totalPages: number): number {
    const bodyRect = doc.body.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const offset = markRect.left - bodyRect.left;
    const step = doc.documentElement.clientWidth;
    return step > 0 ? Math.max(0, Math.min(totalPages - 1, Math.floor(offset / step))) : 0;
  }

  async function navigateToResult(result: SearchResult) {
    const session = getSession();
    if (!session || !result) return;

    const targetIdx = session.getState().chapters.findIndex((c) => c.id === result.chapterId);
    if (targetIdx < 0) return;

    const sameChapter = session.getState().currentChapterIndex === targetIdx;

    if (!sameChapter) {
      session.dispatch({
        type: "GO_TO_CHAPTER",
        chapterId: session.getState().chapters[targetIdx].id,
        targetPage: 0,
      });
      await waitForState(
        () => session.getState(),
        (s) => s.currentChapterIndex === targetIdx && s.status === "ready",
      );
    }

    const state = session.getState();
    const doc = session.getDocument();
    if (!doc?.body) return;

    ensureSearchStyle(doc);

    const isPagination = state.mode === "pagination";
    const targetChapterId = state.chapters[targetIdx].id;
    const container = isPagination
      ? doc.body
      : (doc.querySelector(`[data-chapter-id="${targetChapterId}"]`) as HTMLElement | null) ||
        doc.body;

    if (!applyTempHighlight(doc, container, result.position, result.text.length, result.text))
      return;

    // rAF ensures browser has completed layout after DOM mutation
    await new Promise((r) => requestAnimationFrame(r));
    const mark = getMarker().getElement(SEARCH_MARKER_ID);
    if (mark) {
      if (isPagination) {
        const page = findPageFromMark(doc, mark, state.page.total);
        session.dispatch({ type: "GO_TO_PAGE", page });
      } else {
        const top =
          mark.getBoundingClientRect().top +
          doc.documentElement.scrollTop -
          doc.documentElement.clientHeight / 2 +
          mark.clientHeight / 2;
        doc.documentElement.scrollTop = top;
      }
    }

    hasHighlights.value = true;
    currentResultIndex.value = searchResults.value.findIndex((r) => r === result);
    uiStore.closeModal();
  }

  const reset = () => {
    getMarker().remove(SEARCH_MARKER_ID);
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
