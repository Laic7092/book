import { ref, onUnmounted } from "vue";

export interface PaginateOptions {
  html?: string;
  targetPage?: number;
  resources?: HTMLElement[];
}

export function useColumnPagination() {
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isReady = ref(false);
  const isPaginating = ref(false);
  const rawHtml = ref("");
  const currentHtml = ref("");
  const iframeWidth = ref(0);

  let pendingTargetPage: number | undefined;

  function clampPage(target: number | undefined, length: number): number {
    if (length <= 0) return 0;
    if (target === undefined) return 0;
    if (target < 0) return Math.max(0, length - 1);
    return Math.min(target, length - 1);
  }

  async function paginate(_chapterId: string, options?: PaginateOptions): Promise<void> {
    const html = options?.html;
    if (!html) return;

    isPaginating.value = true;
    isReady.value = false;

    rawHtml.value = html;
    currentHtml.value = html;

    pendingTargetPage = options?.targetPage;
    currentPage.value = clampPage(pendingTargetPage, totalPages.value);

    isPaginating.value = false;
  }

  function updateColumnLayout(scrollWidth: number, width: number): void {
    iframeWidth.value = width || 0;
    const step = iframeWidth.value;
    const newTotal = step > 0 ? Math.max(1, Math.ceil(scrollWidth / step)) : 1;
    totalPages.value = newTotal;

    if (pendingTargetPage !== undefined) {
      currentPage.value = clampPage(pendingTargetPage, newTotal);
      pendingTargetPage = undefined;
    } else if (currentPage.value >= newTotal) {
      currentPage.value = Math.max(0, newTotal - 1);
    }
    isReady.value = true;
  }

  function getPageAtOffset(offsetInBody: number): number {
    const step = iframeWidth.value;
    if (step <= 0 || totalPages.value <= 0) return 0;
    return Math.max(0, Math.min(totalPages.value - 1, Math.floor(offsetInBody / step)));
  }

  function getPageAtRatio(ratio: number): number {
    if (totalPages.value <= 0) return 0;
    return Math.max(0, Math.min(totalPages.value - 1, Math.floor(ratio * totalPages.value)));
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

  function cleanup(): void {
    rawHtml.value = "";
    currentHtml.value = "";
    currentPage.value = 0;
    totalPages.value = 1;
    iframeWidth.value = 0;
    pendingTargetPage = undefined;
  }

  onUnmounted(() => cleanup());

  return {
    currentPage,
    totalPages,
    isPaginating,
    isReady,
    currentHtml,
    rawHtml,
    getPageAtOffset,
    getPageAtRatio,
    goToPage,
    nextPage,
    prevPage,
    paginate,
    updateColumnLayout,
    cleanup,
  };
}
