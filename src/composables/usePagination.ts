// Simplified pagination using CSS columns
// No virtual containers, no height calculations

import { ref, nextTick } from "vue";

export function usePagination() {
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isPaginating = ref(false);

  // Calculate total pages from CSS column layout
  function updateTotalPages(): void {
    const el = document.querySelector(".pagination-content") as HTMLElement;
    if (!el) return;

    const columnCount = Math.ceil(el.scrollWidth / el.clientWidth);
    totalPages.value = Math.max(1, columnCount);
  }

  // Navigate to a specific page
  async function goToPage(page: number): Promise<void> {
    if (page < 0 || page >= totalPages.value) return;

    isPaginating.value = true;
    currentPage.value = page;

    await nextTick();
    setTimeout(() => {
      isPaginating.value = false;
    }, 300);
  }

  // Go to next page, returns true if should go to next chapter
  function nextPage(): boolean {
    if (currentPage.value < totalPages.value - 1) {
      currentPage.value++;
      return false;
    }
    return true;
  }

  // Go to previous page, returns true if should go to previous chapter
  function prevPage(): boolean {
    if (currentPage.value > 0) {
      currentPage.value--;
      return true; // 返回 true 表示需要上一章（当在第一页时）
    }
    return false;
  }

  // Reset pagination for new content
  async function reset(): Promise<void> {
    currentPage.value = 0;
    await nextTick();
    updateTotalPages();
  }

  // Get current page progress (0-100)
  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
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
  };
}
