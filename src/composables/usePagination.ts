import { ref, computed, onUnmounted, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";

export interface Page {
  index: number;
  html: string;
  blockStart: number;
  blockEnd: number;
}

export interface PaginationChapter {
  id: string;
  html?: string;
}

export interface PaginateOptions {
  html?: string;
  targetPage?: number;
  resources?: HTMLElement[];
}

export function usePagination(
  _bookId: string,
  chapters: PaginationChapter[],
  _settings: Ref<ReaderSettings>,
) {
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isReady = ref(false);
  const isPaginating = ref(false);
  const rawHtml = ref("");
  const currentHtml = ref("");
  const columnWidth = ref(0);
  const columnGap = ref(0);
  const computedCount = ref(0);

  let pendingTargetPage: number | undefined;

  const scrollOffset = computed(() => currentPage.value * (columnWidth.value + columnGap.value));

  const pages = computed<Page[]>(() => {
    const count = totalPages.value;
    const result: Page[] = [];
    for (let i = 0; i < count; i++) {
      result.push({ index: i, html: rawHtml.value, blockStart: 0, blockEnd: 0 });
    }
    return result;
  });

  function clampPage(target: number | undefined, length: number): number {
    if (length <= 0) return 0;
    if (target === undefined) return 0;
    if (target < 0) return Math.max(0, length - 1);
    return Math.min(target, length - 1);
  }

  function getChapterHtml(chapterId: string): string | null {
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter || !("html" in chapter)) return null;
    return (chapter as { html?: string }).html ?? null;
  }

  async function paginate(chapterId: string, options?: PaginateOptions): Promise<void> {
    const html = options?.html ?? getChapterHtml(chapterId);
    if (html === null) return;

    isPaginating.value = true;
    isReady.value = false;

    rawHtml.value = html;
    currentHtml.value = html;

    pendingTargetPage = options?.targetPage;
    currentPage.value = clampPage(pendingTargetPage, totalPages.value);

    isPaginating.value = false;
    // isReady set by updateColumnLayout after consumer renders and measures
  }

  function updateColumnLayout(cw: number, gap: number, scrollW: number): void {
    columnWidth.value = cw || 0;
    columnGap.value = gap || 0;
    const step = columnWidth.value + columnGap.value;
    const newTotal = step > 0 ? Math.max(1, Math.ceil(scrollW / step)) : 1;
    totalPages.value = newTotal;
    computedCount.value = newTotal;

    if (pendingTargetPage !== undefined) {
      currentPage.value = clampPage(pendingTargetPage, newTotal);
      pendingTargetPage = undefined;
    } else if (currentPage.value >= newTotal) {
      currentPage.value = Math.max(0, newTotal - 1);
    }
    isReady.value = true;
  }

  function goToPage(page: number): void {
    if (page < 0 || page >= totalPages.value) return;
    currentPage.value = page;
  }

  function nextPage(): boolean {
    if (currentPage.value >= totalPages.value - 1) return false;
    currentPage.value++;
    return true;
  }

  function prevPage(): boolean {
    if (currentPage.value <= 0) return false;
    currentPage.value--;
    return true;
  }

  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
  }

  function cleanup(): void {
    rawHtml.value = "";
    currentHtml.value = "";
    currentPage.value = 0;
    totalPages.value = 1;
    columnWidth.value = 0;
    columnGap.value = 0;
    pendingTargetPage = undefined;
  }

  function clearCache(): void {
    /* no-op */
  }

  function clearCacheForBook(_clearBookId: string): void {
    /* no-op */
  }

  onUnmounted(() => cleanup());

  return {
    currentPage,
    totalPages,
    isPaginating,
    isReady,
    currentHtml,
    pages,
    rawHtml,
    computedCount,
    scrollOffset,
    columnWidth,
    goToPage,
    nextPage,
    prevPage,
    paginate,
    getPageProgress,
    updateColumnLayout,
    cleanup,
    clearCache,
    clearCacheForBook,
  };
}
