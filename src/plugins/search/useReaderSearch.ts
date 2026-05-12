import { ref } from "vue";
import { searchInBook } from "./engine";
import type { SearchResult } from "../../core/types";
import type { ReaderSession } from "../../core/reader-host";
import { generateCfiFromCharOffset, resolveCfi } from "../../utils/epub-cfi";
import { useDocumentMarker } from "../../composables/useDocumentMarker";
import * as booksStore from "../../storage/books";

const SEARCH_MARKER_ID = "search-temp";

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

  function applyTempHighlight(
    _doc: Document,
    container: Element,
    position: number,
    _textLength: number,
    spineIndex: number,
  ) {
    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = container.innerHTML;
    const cfi = generateCfiFromCharOffset(spineIndex, tempContainer, position);
    const target = resolveCfi(cfi, container as HTMLElement);
    if (target) {
      const range = _doc.createRange();
      range.setStart(target.node, target.offset);
      range.collapse(true);
      getMarker().add({ id: SEARCH_MARKER_ID, range, className: "search-match" });
    }
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
        booksStore.getChapterContent(bookId, chapterId),
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

  function findPageFromMark(session: ReaderSession, mark: Element): number {
    const doc = session.getDocument();
    if (!doc) return 0;
    const bodyRect = doc.body.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const offset = markRect.left - bodyRect.left;
    const state = session.getState();
    const total = state.page.total;
    const bodyContentWidth = doc.body.scrollWidth;
    const step = total > 0 ? bodyContentWidth / total : 0;
    return step > 0 ? Math.max(0, Math.min(total - 1, Math.floor(offset / step))) : 0;
  }

  function paginateToElement(el: Element): void {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function navigateToResult(result: SearchResult) {
    const session = getSession();
    if (!session || !result) return;

    const state = session.getState();
    const targetChapter = state.chapters.find((c) => c.id === result.chapterId);
    if (!targetChapter) return;

    const currentChapter = state.chapters[state.currentChapterIndex];
    const sameChapter = targetChapter.id === currentChapter?.id;

    if (!sameChapter) {
      session.dispatch({ type: "GO_TO_CHAPTER", chapterId: targetChapter.id, targetPage: 0 });
    }

    // Wait for content to be ready
    await new Promise<void>((resolve) => {
      const check = () => {
        const doc = session.getDocument();
        if (doc?.body) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });

    const doc = session.getDocument();
    if (!doc?.body) return;

    const isPagination = session.getState().mode === "pagination";
    const container = isPagination
      ? doc.body
      : (doc.querySelector(`[data-chapter-id="${targetChapter.id}"]`) as HTMLElement | null) ||
        doc.body;

    applyTempHighlight(doc, container, result.position, result.text.length, targetChapter.order);

    await new Promise((r) => setTimeout(r, 50));
    const mark = getMarker().getElement(SEARCH_MARKER_ID);
    if (mark) {
      if (isPagination) {
        const page = findPageFromMark(session, mark);
        session.dispatch({ type: "GO_TO_PAGE", page });
      } else {
        paginateToElement(mark);
      }
    }

    hasHighlights.value = true;
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
