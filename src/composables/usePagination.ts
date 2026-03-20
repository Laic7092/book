// Composable for pagination logic

import { ref, nextTick, type Ref } from "vue";
import {
  READER_HEADER_HEIGHT,
  READER_FOOTER_HEIGHT,
  FALLBACK_PAGE_HEIGHT,
} from "../utils/constants";
import type { ReaderSettings } from "../core/types";

export function usePagination(settings: Ref<ReaderSettings>, containerHeight: Ref<number>) {
  const pages = ref<string[]>([]);
  const currentPage = ref(0);
  const isPaginating = ref(false);
  const lastPageRatio = ref(0);

  const calculatePages = (contentHtml: string): string[] => {
    const pageContents: string[] = [];

    let pageHeight = containerHeight.value;

    if (!pageHeight || pageHeight <= 0) {
      pageHeight = window.innerHeight - READER_HEADER_HEIGHT - READER_FOOTER_HEIGHT;
    }

    if (!pageHeight || pageHeight <= 0) {
      pageHeight = FALLBACK_PAGE_HEIGHT;
    }

    const tempContainer = document.createElement("div");
    tempContainer.className = "reader-content pagination-content temp-measure";
    tempContainer.style.visibility = "hidden";
    tempContainer.style.position = "absolute";
    tempContainer.style.width = `${settings.value.columnWidth}px`;
    tempContainer.style.padding = `${settings.value.margin}px`;
    tempContainer.style.fontSize = `${settings.value.fontSize}px`;
    tempContainer.style.fontFamily = settings.value.fontFamily;
    tempContainer.style.lineHeight = String(settings.value.lineHeight);
    tempContainer.style.left = "-9999px";
    tempContainer.style.top = "0";

    document.body.appendChild(tempContainer);

    tempContainer.innerHTML = contentHtml;
    const totalHeight = tempContainer.scrollHeight;

    if (totalHeight <= pageHeight) {
      document.body.removeChild(tempContainer);
      return [contentHtml];
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = contentHtml;

    const blocks: { html: string; height: number }[] = [];
    const children = Array.from(wrapper.children);

    for (const child of children) {
      const html = (child as HTMLElement).outerHTML;
      tempContainer.innerHTML = html;
      const height = tempContainer.scrollHeight;
      blocks.push({ html, height });
    }

    let currentPageBlocks: string[] = [];
    let currentHeight = 0;

    for (const block of blocks) {
      if (block.height > pageHeight) {
        if (currentPageBlocks.length > 0) {
          pageContents.push(currentPageBlocks.join(""));
          currentPageBlocks = [];
          currentHeight = 0;
        }
        pageContents.push(block.html);
        continue;
      }

      if (currentHeight + block.height > pageHeight && currentPageBlocks.length > 0) {
        pageContents.push(currentPageBlocks.join(""));
        currentPageBlocks = [block.html];
        currentHeight = block.height;
      } else {
        currentPageBlocks.push(block.html);
        currentHeight += block.height;
      }
    }

    if (currentPageBlocks.length > 0) {
      pageContents.push(currentPageBlocks.join(""));
    }

    document.body.removeChild(tempContainer);

    return pageContents.length > 0 ? pageContents : [contentHtml];
  };

  const goToPage = async (
    pageIndex: number,
    totalChapters: number,
    currentChapterIndex: number,
  ) => {
    if (pageIndex < 0 || pageIndex >= pages.value.length) return;

    isPaginating.value = true;
    currentPage.value = pageIndex;

    const totalProgress =
      (currentChapterIndex / totalChapters + pageIndex / pages.value.length / totalChapters) * 100;

    await nextTick();
    setTimeout(() => {
      isPaginating.value = false;
    }, 300);

    return totalProgress;
  };

  const nextPage = (): { pageIndex: number; shouldGoToNextChapter: boolean } => {
    if (currentPage.value < pages.value.length - 1) {
      return { pageIndex: currentPage.value + 1, shouldGoToNextChapter: false };
    }
    return { pageIndex: 0, shouldGoToNextChapter: true };
  };

  const prevPage = (): { pageIndex: number; shouldGoToPrevChapter: boolean } => {
    if (currentPage.value > 0) {
      return { pageIndex: currentPage.value - 1, shouldGoToPrevChapter: false };
    }
    return { pageIndex: -1, shouldGoToPrevChapter: true };
  };

  const recalculatePages = async (content: string) => {
    await nextTick();

    const headerHeight = 60;
    const footerHeight = 60;
    containerHeight.value = window.innerHeight - headerHeight - footerHeight;

    const oldPageCount = pages.value.length;
    const oldPageIndex = currentPage.value;
    if (oldPageCount > 0) {
      lastPageRatio.value = (oldPageIndex + 0.5) / oldPageCount;
    }

    pages.value = calculatePages(content);

    if (pages.value.length > 0 && lastPageRatio.value > 0) {
      const newIndex = Math.floor(lastPageRatio.value * pages.value.length);
      currentPage.value = Math.min(newIndex, pages.value.length - 1);
    } else {
      currentPage.value = 0;
    }
  };

  const reset = () => {
    pages.value = [];
    currentPage.value = 0;
    isPaginating.value = false;
    lastPageRatio.value = 0;
  };

  return {
    pages,
    currentPage,
    isPaginating,
    goToPage,
    nextPage,
    prevPage,
    recalculatePages,
    reset,
  };
}
