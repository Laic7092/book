import { ref, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";
import { generateIframeStyles } from "../utils/reader-styles";

export interface Page {
  index: number;
  html: string;
  blockStart: number;
  blockEnd: number;
}

// 模块级缓存：bookId:chapterId -> Page[]
const PagesMap = new Map<string, Page[]>();
const CACHE_CAPACITY = 10;

export interface Chapter {
  id: string;
  html: string;
}

export function usePagination(
  containerRef: Ref<HTMLElement | null>,
  bookId: string,
  chapters: Chapter[],
  settings: Ref<ReaderSettings>,
) {
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isPaginating = ref(false);
  const pages = ref<Page[]>([]);
  const currentHtml = ref("");
  const isReady = ref(false);
  const computedCount = ref(0); // 已计算的页数

  // 隐藏的测量 iframe
  let measureIframe: HTMLIFrameElement | null = null;
  let measureDoc: Document | null = null;
  let measureEl: HTMLElement | null = null;

  const rawHtml = ref("");

  // 当前章节的 pages - 非响应式存储，用于内部快速访问
  let currentPages: Page[] = [];

  // 用于取消后台计算的标志
  let backgroundCalcActive = true;
  let backgroundCalcId = 0; // 每次计算递增 ID

  /**
   * 初始化测量 iframe
   */
  function initMeasureIframe() {
    // 如果已存在，先清理
    if (measureIframe) {
      measureIframe.remove();
    }

    measureIframe = document.createElement("iframe");
    measureIframe.style.position = "absolute";
    measureIframe.style.left = "-9999px";
    measureIframe.style.top = "-9999px";
    measureIframe.style.visibility = "hidden";
    measureIframe.style.width = `${getContainerWidth()}px`;
    measureIframe.style.height = `${getPageHeight()}px`;
    measureIframe.style.border = "none";
    document.body.appendChild(measureIframe);

    measureDoc = measureIframe.contentDocument || measureIframe.contentWindow?.document || null;
    if (!measureDoc) return;

    const styles = generateIframeStyles(settings.value);

    measureDoc.open();

    measureDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles.theme}</style>
        <style>${styles.base}</style>
        <style>${styles.typography}</style>
        <style id="epub-style"></style>
        <style>
          /* 测量模式：body 高度随内容自然撑开 */
          html, body { height: auto; }
        </style>
      </head>
      <body class="reader-content"></body>
      </html>
    `);
    measureDoc.close();

    measureEl = measureDoc.body;
  }

  /**
   * 更新测量 iframe 的样式（当设置变化时）
   */
  function updateMeasureIframeStyles() {
    if (!measureDoc) return;

    const styles = measureDoc.querySelectorAll("style");
    if (styles.length >= 4) {
      const newStyles = generateIframeStyles(settings.value);
      styles[0].textContent = newStyles.theme;
      styles[1].textContent = newStyles.base;
      styles[2].textContent = newStyles.typography;
      // styles[3] 是测量专用的 height: auto 覆盖，不需要更新
    }
  }

  function getPageHeight(): number {
    const el = containerRef.value;
    if (!el) return window.innerHeight - 120;
    return el.clientHeight;
  }

  function getContainerWidth(): number {
    const el = containerRef.value;
    if (!el) return 700;
    // 减去 padding
    const style = getComputedStyle(el);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    return el.clientWidth - paddingLeft - paddingRight;
  }

  function splitIntoBlocks(html: string): string[] {
    if (!html) return [];
    const container = document.createElement("div");
    container.innerHTML = html;

    const blocks: string[] = [];
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          blocks.push(`<p>${text}</p>`);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        blocks.push((node as Element).outerHTML);
      }
    }
    return blocks;
  }

  function getContentHeight(): number {
    if (!measureEl) return 0;
    return measureEl.offsetHeight;
  }

  // 计算单页内容
  function computeSinglePage(
    blocks: string[],
    startIdx: number,
    maxHeight: number,
    pageIndex: number,
  ): Page {
    let low = startIdx + 1;
    let high = blocks.length;
    let bestEnd = startIdx + 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const testHtml = blocks.slice(startIdx, mid).join("");

      measureEl!.innerHTML = testHtml;
      const h = getContentHeight();

      if (h <= maxHeight) {
        bestEnd = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const pageHtml = blocks.slice(startIdx, bestEnd).join("");
    return {
      index: pageIndex,
      html: pageHtml,
      blockStart: startIdx,
      blockEnd: bestEnd,
    };
  }

  // LRU 缓存管理
  function updateCache(chapterId: string, pages: Page[]) {
    const cacheKey = `${bookId}:${chapterId}`;
    if (PagesMap.has(cacheKey)) {
      PagesMap.delete(cacheKey);
    }
    while (PagesMap.size >= CACHE_CAPACITY) {
      const firstKey = PagesMap.keys().next().value;
      if (firstKey !== undefined) {
        PagesMap.delete(firstKey);
      } else {
        break;
      }
    }
    PagesMap.set(cacheKey, pages);
  }

  function clampPage(target: number | undefined, length: number): number {
    if (length <= 0) return 0;
    if (target === undefined) return 0;
    if (target < 0) return Math.max(0, length - 1);
    return Math.min(target, length - 1);
  }

  async function paginate(
    chapterId: string,
    htmlOrTargetPage?: number | string,
    maybeTargetPage?: number,
  ): Promise<void> {
    let html: string;
    let targetPage: number | undefined;

    if (typeof htmlOrTargetPage === "string") {
      html = htmlOrTargetPage;
      targetPage = maybeTargetPage;
    } else if (typeof htmlOrTargetPage === "number") {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (!chapter || !("html" in chapter)) {
        isPaginating.value = false;
        isReady.value = true;
        return;
      }
      html = (chapter as any).html;
      targetPage = htmlOrTargetPage;
    } else {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (!chapter || !("html" in chapter)) {
        isPaginating.value = false;
        isReady.value = true;
        return;
      }
      html = (chapter as any).html;
      targetPage = undefined;
    }

    isReady.value = false;
    isPaginating.value = true;
    rawHtml.value = html;

    const article = containerRef.value;
    if (!article) {
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    // 初始化测量 iframe（如果尚未初始化）
    if (!measureIframe) {
      initMeasureIframe();
    } else {
      // 更新样式以匹配当前设置
      updateMeasureIframeStyles();
      // 更新宽度
      if (measureIframe) {
        measureIframe.style.width = `${getContainerWidth()}px`;
      }
    }

    // 取消正在运行的后台计算
    backgroundCalcActive = false;
    backgroundCalcId++;

    // 检查缓存
    const cacheKey = `${bookId}:${chapterId}`;
    if (PagesMap.has(cacheKey)) {
      const cached = PagesMap.get(cacheKey)!;
      currentPages = cached;
      pages.value = [...cached];
      totalPages.value = cached.length;
      computedCount.value = cached.length;

      const pageIdx = clampPage(targetPage, cached.length);
      currentPage.value = pageIdx;
      currentHtml.value = cached[pageIdx].html;

      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    const maxHeight = getPageHeight();
    const blocks = splitIntoBlocks(rawHtml.value);

    if (blocks.length === 0) {
      currentPages = [{ index: 0, html: "", blockStart: 0, blockEnd: 0 }];
      totalPages.value = 1;
      computedCount.value = 1;
      currentPage.value = 0;
      currentHtml.value = "";
      updateCache(chapterId, currentPages);
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    // 逐页计算，增量更新
    currentPages = [];
    let startIdx = 0;
    let pageIndex = 0;

    while (startIdx < blocks.length) {
      const page = computeSinglePage(blocks, startIdx, maxHeight, pageIndex);
      currentPages.push(page);

      computedCount.value = currentPages.length;
      totalPages.value = currentPages.length;

      // 目标页就绪，立即返回
      if (targetPage !== undefined && page.index === targetPage) {
        currentPage.value = targetPage;
        currentHtml.value = page.html;
        pages.value = [...currentPages];

        isPaginating.value = false;
        isReady.value = true;

        // 启动后台计算剩余页面
        const currentCalcId = backgroundCalcId;
        backgroundCalcActive = true;
        computeRemainingInBackground(
          blocks,
          page.blockEnd,
          pageIndex + 1,
          maxHeight,
          chapterId,
          currentCalcId,
        );
        return;
      }

      // 让出渲染
      await new Promise((resolve) => setTimeout(resolve, 0));

      startIdx = page.blockEnd;
      pageIndex++;
    }

    // 最终赋值
    pages.value = [...currentPages];

    // 默认值
    if (targetPage === undefined || targetPage >= currentPages.length) {
      currentPage.value = 0;
      currentHtml.value = currentPages[0]?.html || "";
    }

    updateCache(chapterId, currentPages);

    isPaginating.value = false;
    isReady.value = true;
  }

  // 后台计算剩余页面（不阻塞用户交互）
  function computeRemainingInBackground(
    blocks: string[],
    startIdx: number,
    pageIndex: number,
    maxHeight: number,
    chapterId: string,
    calcId: number,
  ): void {
    let currentIdx = startIdx;
    let currentPageIdx = pageIndex;
    const CHUNK_TIME_MS = 8; // 每个时间片最多执行 8ms

    function computeChunk() {
      if (!backgroundCalcActive || calcId !== backgroundCalcId) return;

      const startTime = performance.now();
      while (currentIdx < blocks.length && performance.now() - startTime < CHUNK_TIME_MS) {
        const page = computeSinglePage(blocks, currentIdx, maxHeight, currentPageIdx);
        currentPages.push(page);
        computedCount.value = currentPages.length;
        totalPages.value = currentPages.length;
        pages.value = [...currentPages];
        currentIdx = page.blockEnd;
        currentPageIdx++;
      }

      if (currentIdx < blocks.length) {
        // 让出主线程，继续下一批
        setTimeout(computeChunk, 0);
      } else {
        updateCache(chapterId, currentPages);
      }
    }

    setTimeout(computeChunk, 0);
  }

  function goToPage(page: number): void {
    if (page < 0 || page >= currentPages.length) return;
    currentPage.value = page;
    currentHtml.value = currentPages[page].html;
  }

  function nextPage(): boolean {
    if (currentPage.value >= currentPages.length - 1) return false;
    currentPage.value++;
    currentHtml.value = currentPages[currentPage.value].html;
    return true;
  }

  function prevPage(): boolean {
    if (currentPage.value <= 0) return false;
    currentPage.value--;
    currentHtml.value = currentPages[currentPage.value].html;
    return true;
  }

  async function reset(chapterId: string, targetPage?: number): Promise<void> {
    await paginate(chapterId, targetPage);
  }

  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
  }

  function cleanup(): void {
    if (measureIframe) {
      measureIframe.remove();
      measureIframe = null;
      measureDoc = null;
      measureEl = null;
    }
    rawHtml.value = "";
    currentPages = [];
  }

  function clearCache(): void {
    PagesMap.clear();
  }

  return {
    currentPage,
    totalPages,
    isPaginating,
    isReady,
    currentHtml,
    pages,
    rawHtml,
    computedCount,
    goToPage,
    nextPage,
    prevPage,
    reset,
    paginate,
    getPageProgress,
    cleanup,
    clearCache,
  };
}
