// Pagination composable using CSS columns with accurate calculations

import { ref, nextTick } from "vue";

export function usePagination() {
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isPaginating = ref(false);

  let resizeObserver: ResizeObserver | null = null;
  let debounceTimer: number | null = null;

  function calculatePageCount(): number {
    const el = document.querySelector(".pagination-content") as HTMLElement;
    if (!el) return 1;

    const rect = el.getBoundingClientRect();
    const contentWidth = el.scrollWidth;
    const containerWidth = rect.width;

    if (containerWidth <= 0 || contentWidth <= 0) return 1;

    const pageCount = Math.ceil(contentWidth / containerWidth);
    return Math.max(1, pageCount);
  }

  function updateTotalPages(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      const newCount = calculatePageCount();
      if (newCount !== totalPages.value) {
        totalPages.value = newCount;
        if (currentPage.value >= newCount) {
          currentPage.value = Math.max(0, newCount - 1);
        }
      }
    }, 100);
  }

  function setupResizeObserver(): void {
    const el = document.querySelector(".pagination-content");
    if (!el || resizeObserver) return;

    resizeObserver = new ResizeObserver(() => {
      updateTotalPages();
    });
    resizeObserver.observe(el);
  }

  async function goToPage(page: number): Promise<void> {
    if (page < 0 || page >= totalPages.value) return;

    isPaginating.value = true;
    currentPage.value = page;

    await nextTick();
    setTimeout(() => {
      isPaginating.value = false;
    }, 300);
  }

  function nextPage(): boolean {
    if (currentPage.value < totalPages.value - 1) {
      currentPage.value++;
      return false;
    }
    return true;
  }

  function prevPage(): boolean {
    if (currentPage.value > 0) {
      currentPage.value--;
      return true;
    }
    return false;
  }

  async function reset(): Promise<void> {
    currentPage.value = 0;
    await nextTick();
    updateTotalPages();
    setupResizeObserver();
  }

  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
  }

  function cleanup(): void {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  return {
    currentPage,
    totalPages,
    isPaginating,
    goToPage,
    nextPage,
    prevPage,
    reset,
    updateTotalPages,
    getPageProgress,
    cleanup,
  };
}
