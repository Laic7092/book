import { ref, onUnmounted, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";
import { PageMeasurer } from "../utils/page-measurer";

/**
 * 分页结果中的单页数据结构
 */
export interface Page {
  /** 页面索引（从 0 开始） */
  index: number;
  /** 页面 HTML 内容 */
  html: string;
  /** 该页第一个 block 的索引（包含） */
  blockStart: number;
  /** 下一页第一个 block 的索引（不包含） */
  blockEnd: number;
}

export interface PaginationChapter {
  id: string;
  html?: string;
}

export interface PaginateOptions {
  /** 直接提供 HTML 内容（而非从 chapters 中查找） */
  html?: string;
  /** 目标页码（用于快速跳转到指定页） */
  targetPage?: number;
  /** EPUB 资源元素（<link> 和 <style> 元素） */
  resources?: HTMLElement[];
}

/** LRU 缓存容量 */
const CACHE_CAPACITY = 10;

/** 后台计算：每帧最多执行毫秒数（约一帧，60fps） */
const BG_CHUNK_TIME_MS = 16;

/** 后台计算：每 N 页更新一次响应式状态 */
const BG_BATCH_SIZE = 5;

// ==================== 纯函数：HTML 工具 ====================

/**
 * 在 HTML 属性串中追加 class，保留已有 class 值
 */
function addSplitClass(attrs: string): string {
  const classMatch = attrs.match(/class="([^"]*)"/);
  if (classMatch) {
    return attrs.replace(classMatch[0], `class="${classMatch[1]} split"`);
  }
  return ` class="split"${attrs}`;
}

// ==================== 纯函数：Block 提取 ====================

/** 可拆分的叶子标签 */
const SPLITTABLE_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "figcaption",
  "dt",
  "dd",
  "blockquote",
  "pre",
]);

/** 不可拆分的原子标签 */
const ATOMIC_TAGS = new Set([
  "img",
  "svg",
  "figure",
  "table",
  "video",
  "audio",
  "canvas",
  "picture",
  "iframe",
  "object",
  "embed",
  "math",
]);

/** 列表容器：始终展开到 li 级别 */
const LIST_TAGS = new Set(["ul", "ol"]);

/**
 * 递归展开 DOM 树为细粒度 block 列表。
 * 有 class/id/style 属性的容器元素整体保留，纯布局容器递归展开。
 */
function extractBlocks(container: Element): string[] {
  const result: string[] = [];

  function walk(el: Element) {
    const tag = el.tagName.toLowerCase();

    if (ATOMIC_TAGS.has(tag)) {
      result.push(el.outerHTML);
      return;
    }

    if (SPLITTABLE_TAGS.has(tag)) {
      result.push(el.outerHTML);
      return;
    }

    const children = Array.from(el.children);
    if (children.length === 0) {
      result.push(el.outerHTML);
      return;
    }

    if (LIST_TAGS.has(tag)) {
      for (const child of children) walk(child);
      return;
    }

    if (el.hasAttribute("class") || el.hasAttribute("id") || el.hasAttribute("style")) {
      result.push(el.outerHTML);
      return;
    }

    for (const child of children) walk(child);
  }

  for (const child of Array.from(container.children)) walk(child);
  return result;
}

// ==================== 测量相关算法 ====================

/**
 * 对单个 HTML 元素做文本级二分拆分。
 *
 * @param elementHtml 元素的完整 outerHTML
 * @param availHeight 可用高度
 * @param m 测量器
 * @param outer 可选的外部包装标签（用于在子元素拆分中保持外层容器）
 */
function splitTextNode(
  elementHtml: string,
  availHeight: number,
  m: PageMeasurer,
  outer?: { openTag: string; closeTag: string; openContTag: string },
): { splitHtml: string; remainingHtml: string } {
  const tagMatch = elementHtml.match(/^<(\w+)([^>]*)>/);
  const tagName = tagMatch?.[1] || "span";
  const tagAttrs = tagMatch?.[2] || "";
  const open = `<${tagName}${tagAttrs}>`;
  const close = `</${tagName}>`;
  const contOpen = `<${tagName}${addSplitClass(tagAttrs)}>`;

  const inner = elementHtml.replace(/^<\w+[^>]*>/, "").replace(/<\/\w+>$/, "");

  const tempDiv = m.createElement("div");
  tempDiv.innerHTML = inner;
  const fullText = tempDiv.textContent || "";

  if (!fullText.trim()) {
    return { splitHtml: elementHtml, remainingHtml: "" };
  }

  const wrapTest = (text: string) => {
    const innerHtml = `${open}${text}${close}`;
    return outer ? `${outer.openTag}${innerHtml}${outer.closeTag}` : innerHtml;
  };

  let low = 1;
  let high = fullText.length;
  let bestSplit = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const testText = fullText.slice(0, mid).trim();
    if (!testText) {
      low = mid + 1;
      continue;
    }

    m.setBodyHTML(wrapTest(testText));
    const h = m.getContentHeight();

    if (h <= availHeight) {
      bestSplit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestSplit === 0) {
    return { splitHtml: "", remainingHtml: elementHtml };
  }

  const firstPart = fullText.slice(0, bestSplit).trim();
  const secondPart = fullText.slice(bestSplit).trim();

  const buildFirst = `${open}${firstPart}${close}`;
  const buildSecond = secondPart ? `${contOpen}${secondPart}${close}` : "";

  return {
    splitHtml: outer ? `${outer.openTag}${buildFirst}${outer.closeTag}` : buildFirst,
    remainingHtml: buildSecond
      ? outer
        ? `${outer.openContTag}${buildSecond}${outer.closeTag}`
        : buildSecond
      : "",
  };
}

/**
 * 尝试拆分 block，将能容纳的部分放入当前页。
 *
 * 两层策略：先在子元素边界拆分，失败后退化到文本级二分拆分。
 */
function trySplitBlock(
  blockHtml: string,
  currentHeight: number,
  maxHeight: number,
  m: PageMeasurer,
): { splitHtml: string; remainingHtml: string } {
  if (!m.isReady) {
    return { splitHtml: blockHtml, remainingHtml: "" };
  }

  const tagMatch = blockHtml.match(/^<(\w+)([^>]*)>/);
  const outerTagName = tagMatch?.[1] || "div";
  const outerTagAttrs = tagMatch?.[2] || "";
  const openTag = `<${outerTagName}${outerTagAttrs}>`;
  const closeTag = `</${outerTagName}>`;
  const contAttrs = addSplitClass(outerTagAttrs);
  const openContTag = `<${outerTagName}${contAttrs}>`;
  const innerContent = blockHtml.replace(/^<\w+[^>]*>/, "").replace(/<\/\w+>$/, "");

  const tempDiv = m.createElement("div");
  tempDiv.innerHTML = innerContent;
  const childElements = Array.from(tempDiv.children);
  const remainingSpace = maxHeight - currentHeight;

  const wrap = (inner: string) => `${openTag}${inner}${closeTag}`;
  const wrapCont = (inner: string) => `${openContTag}${inner}${closeTag}`;

  // 第一层：在子元素边界拆分
  if (childElements.length > 1) {
    let accumulated = "";
    let bestIdx = 0;

    for (let i = 0; i < childElements.length; i++) {
      const testHtml = accumulated + childElements[i].outerHTML;
      m.setBodyHTML(wrap(testHtml));
      if (m.getContentHeight() <= remainingSpace) {
        accumulated = testHtml;
        bestIdx = i + 1;
      } else {
        break;
      }
    }

    if (bestIdx > 0) {
      const remainingChildren = childElements
        .slice(bestIdx)
        .map((c) => c.outerHTML)
        .join("");
      return {
        splitHtml: wrap(accumulated),
        remainingHtml: remainingChildren ? wrapCont(remainingChildren) : "",
      };
    }

    // 第一个子元素就超高：对它做文本级拆分
    const firstChild = childElements[0];
    const restChildrenHtml = childElements
      .slice(1)
      .map((c) => c.outerHTML)
      .join("");
    const childResult = splitTextNode(firstChild.outerHTML, remainingSpace, m);

    if (childResult.splitHtml) {
      return {
        splitHtml: wrap(childResult.splitHtml),
        remainingHtml: wrapCont(childResult.remainingHtml + restChildrenHtml),
      };
    }
    return { splitHtml: "", remainingHtml: blockHtml };
  }

  // 第二层：文本级二分拆分
  return splitTextNode(blockHtml, remainingSpace, m, { openTag, closeTag, openContTag });
}

/**
 * 计算单页内容：从 startIdx 开始累加 block，直到超过 maxHeight。
 * 会修改 blocks 数组（拆分后的剩余部分替换原位置）。
 */
function computeSinglePage(
  blocks: string[],
  startIdx: number,
  maxHeight: number,
  pageIndex: number,
  m: PageMeasurer,
  minSplitThreshold: number,
): Page {
  if (!m.isReady) {
    return { index: pageIndex, html: "", blockStart: startIdx, blockEnd: startIdx + 1 };
  }

  let endIdx = startIdx + 1;
  m.setBodyHTML(blocks[startIdx]);

  const singleBlockHeight = m.getContentHeight();
  if (singleBlockHeight > maxHeight) {
    const { splitHtml, remainingHtml } = trySplitBlock(blocks[startIdx], 0, maxHeight, m);
    m.clearBody();
    if (splitHtml && remainingHtml) {
      blocks[startIdx] = remainingHtml;
      return { index: pageIndex, html: splitHtml, blockStart: startIdx, blockEnd: startIdx };
    }
    return {
      index: pageIndex,
      html: splitHtml || blocks[startIdx],
      blockStart: startIdx,
      blockEnd: endIdx,
    };
  }

  while (endIdx < blocks.length) {
    const appendedNodes = m.appendChildren(blocks[endIdx]);
    const h = m.getContentHeight();

    if (h > maxHeight) {
      m.removeChildren(appendedNodes);

      const currentHtml = m.getBodyHTML();
      const currentH = m.getContentHeight();
      const remainingSpace = maxHeight - currentH;

      if (remainingSpace > minSplitThreshold) {
        const { splitHtml, remainingHtml } = trySplitBlock(blocks[endIdx], currentH, maxHeight, m);

        if (splitHtml) {
          m.setBodyHTML(currentHtml + splitHtml);
          if (remainingHtml) {
            blocks[endIdx] = remainingHtml;
          } else {
            endIdx++;
          }
        } else {
          m.setBodyHTML(currentHtml);
        }
      }
      break;
    }
    endIdx++;
  }

  const pageHtml = m.getBodyHTML();
  m.clearBody();

  return { index: pageIndex, html: pageHtml, blockStart: startIdx, blockEnd: endIdx };
}

// ==================== 主 Composable ====================

export function usePagination(
  containerRef: Ref<HTMLElement | null>,
  bookId: string,
  chapters: PaginationChapter[],
  settings: Ref<ReaderSettings>,
) {
  // ── 响应式状态 ──
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isPaginating = ref(false);
  const pages = ref<Page[]>([]);
  const currentHtml = ref("");
  const isReady = ref(false);
  const computedCount = ref(0);
  const rawHtml = ref("");

  // ── 测量器 ──
  let measurer: PageMeasurer | null = null;

  // ── ResizeObserver ──
  let resizeObserver: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let currentChapterId: string | null = null;
  let currentHtmlForPaginate: string | null = null;

  // ── 缓存 ──
  const pagesCache = new Map<string, Page[]>();

  // ── 后台计算取消令牌 ──
  let bgCancelToken: { cancelled: boolean } | null = null;

  // ── 工具函数 ──

  function generateStyleHash(): string {
    const s = settings.value;
    return `${s.fontSize}-${s.lineHeight}-${s.fontFamily}-${s.margin || 0}`;
  }

  function getPageHeight(): number {
    const el = containerRef.value;
    if (!el) return window.innerHeight - 120;
    return el.clientHeight;
  }

  function getContainerWidth(): number {
    const el = containerRef.value;
    if (!el) return 700;
    return el.clientWidth;
  }

  function getOrCreateMeasurer(): PageMeasurer {
    if (!measurer) {
      measurer = new PageMeasurer();
      measurer.init(getContainerWidth(), getPageHeight(), settings.value);
      setupResizeObserver();
    } else {
      measurer.updateSize(getContainerWidth(), getPageHeight());
      measurer.updateStyles(settings.value);
    }
    return measurer;
  }

  // ── 缓存管理 ──

  function updateCache(chapterId: string, computedPages: Page[]) {
    const styleHash = generateStyleHash();
    const cacheKey = `${bookId}:${chapterId}:${styleHash}`;

    if (pagesCache.has(cacheKey)) pagesCache.delete(cacheKey);

    while (pagesCache.size >= CACHE_CAPACITY) {
      const firstKey = pagesCache.keys().next().value;
      if (firstKey !== undefined) pagesCache.delete(firstKey);
      else break;
    }

    pagesCache.set(cacheKey, computedPages);
  }

  function clearCacheForBook(clearBookId: string) {
    const prefix = `${clearBookId}:`;
    for (const key of pagesCache.keys()) {
      if (key.startsWith(prefix)) pagesCache.delete(key);
    }
  }

  // ── 分页主流程 ──

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
    if (html === null) {
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    const targetPage = options?.targetPage;

    isReady.value = false;
    isPaginating.value = true;
    rawHtml.value = html;
    currentChapterId = chapterId;
    currentHtmlForPaginate = html;

    const article = containerRef.value;
    if (!article) {
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    const m = getOrCreateMeasurer();
    if (!m.isReady) {
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    // 注入资源
    if (options?.resources && options.resources.length > 0) {
      m.injectResources(options.resources);
    } else {
      m.clearInjectedResources();
    }

    // 取消后台计算
    if (bgCancelToken) bgCancelToken.cancelled = true;

    // 检查缓存
    const styleHash = generateStyleHash();
    const cacheKey = `${bookId}:${chapterId}:${styleHash}`;
    if (pagesCache.has(cacheKey)) {
      const cached = pagesCache.get(cacheKey)!;
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

    // 解析 HTML → 提取 blocks
    const doc = new DOMParser().parseFromString(rawHtml.value, "text/html");
    if (!doc.body) {
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    const container: Element =
      doc.body.children.length === 1 && doc.body.firstElementChild
        ? doc.body.firstElementChild
        : doc.body;

    const blocks = extractBlocks(container);

    if (blocks.length === 0) {
      const emptyPage: Page = { index: 0, html: "", blockStart: 0, blockEnd: 0 };
      pages.value = [emptyPage];
      totalPages.value = 1;
      computedCount.value = 1;
      currentPage.value = 0;
      currentHtml.value = "";
      updateCache(chapterId, pages.value);
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    const maxHeight = getPageHeight();
    const threshold = settings.value.fontSize * settings.value.lineHeight;
    const computedPages: Page[] = [];
    let pageIndex = 0;
    let startIdx = 0;

    while (startIdx < blocks.length) {
      const page = computeSinglePage(blocks, startIdx, maxHeight, pageIndex, m, threshold);
      computedPages.push(page);

      computedCount.value = computedPages.length;
      totalPages.value = computedPages.length;

      // 目标页就绪，立即返回；剩余页面后台计算
      if (targetPage !== undefined && page.index === targetPage) {
        currentPage.value = targetPage;
        currentHtml.value = page.html;
        pages.value = [...computedPages];

        isPaginating.value = false;
        isReady.value = true;

        const token = { cancelled: false };
        bgCancelToken = token;
        computeRemainingInBackground(
          blocks,
          page.blockEnd,
          pageIndex + 1,
          maxHeight,
          chapterId,
          token,
          m,
          threshold,
          computedPages,
        );
        return;
      }

      // 让出主线程
      await new Promise((resolve) => setTimeout(resolve, 0));

      startIdx = page.blockEnd;
      pageIndex++;
    }

    // 所有页面计算完成
    pages.value = [...computedPages];

    if (targetPage === undefined || targetPage >= computedPages.length) {
      currentPage.value = 0;
      currentHtml.value = computedPages[0]?.html || "";
    }

    updateCache(chapterId, pages.value);
    isPaginating.value = false;
    isReady.value = true;
  }

  // ── 后台计算 ──

  function computeRemainingInBackground(
    blocks: string[],
    startIdx: number,
    pageIndex: number,
    maxHeight: number,
    chapterId: string,
    cancelToken: { cancelled: boolean },
    m: PageMeasurer,
    minSplitThreshold: number,
    basePages: Page[],
  ): void {
    let currentIdx = startIdx;
    let currentPageIdx = pageIndex;
    const remainingPages: Page[] = [];

    function computeChunk() {
      if (cancelToken.cancelled) return;

      const startTime = performance.now();
      let pagesSinceUpdate = 0;

      while (currentIdx < blocks.length && performance.now() - startTime < BG_CHUNK_TIME_MS) {
        const page = computeSinglePage(
          blocks,
          currentIdx,
          maxHeight,
          currentPageIdx,
          m,
          minSplitThreshold,
        );
        remainingPages.push(page);
        currentIdx = page.blockEnd;
        currentPageIdx++;
        pagesSinceUpdate++;

        if (pagesSinceUpdate >= BG_BATCH_SIZE) {
          const merged = [...basePages, ...remainingPages];
          computedCount.value = merged.length;
          totalPages.value = merged.length;
          pages.value = merged;
          pagesSinceUpdate = 0;
        }
      }

      if (pagesSinceUpdate > 0) {
        const merged = [...basePages, ...remainingPages];
        computedCount.value = merged.length;
        totalPages.value = merged.length;
        pages.value = merged;
      }

      if (currentIdx < blocks.length) {
        setTimeout(computeChunk, 0);
      } else if (!cancelToken.cancelled) {
        updateCache(chapterId, [...basePages, ...remainingPages]);
      }
    }

    setTimeout(computeChunk, 0);
  }

  // ── ResizeObserver ──

  function setupResizeObserver() {
    if (resizeObserver) resizeObserver.disconnect();

    resizeObserver = new ResizeObserver(() => {
      if (!currentChapterId || !currentHtmlForPaginate) return;
      if (resizeTimer) clearTimeout(resizeTimer);

      const chapterId = currentChapterId;
      const html = currentHtmlForPaginate;

      resizeTimer = setTimeout(() => {
        const styleHash = generateStyleHash();
        const cacheKey = `${bookId}:${chapterId}:${styleHash}`;
        pagesCache.delete(cacheKey);
        void paginate(chapterId, { html, targetPage: currentPage.value });
      }, 150);
    });

    const el = containerRef.value;
    if (el) resizeObserver.observe(el);
  }

  // ── 页面导航 ──

  function goToPage(page: number): void {
    if (page < 0 || page >= pages.value.length) return;
    currentPage.value = page;
    currentHtml.value = pages.value[page].html;
  }

  function nextPage(): boolean {
    if (currentPage.value >= pages.value.length - 1) return false;
    currentPage.value++;
    currentHtml.value = pages.value[currentPage.value].html;
    return true;
  }

  function prevPage(): boolean {
    if (currentPage.value <= 0) return false;
    currentPage.value--;
    currentHtml.value = pages.value[currentPage.value].html;
    return true;
  }

  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
  }

  // ── 清理 ──

  function cleanup(): void {
    if (bgCancelToken) bgCancelToken.cancelled = true;

    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }

    if (measurer) {
      measurer.destroy();
      measurer = null;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    rawHtml.value = "";
    pages.value = [];
    currentChapterId = null;
    currentHtmlForPaginate = null;
    bgCancelToken = null;
  }

  function clearCache(): void {
    pagesCache.clear();
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
    goToPage,
    nextPage,
    prevPage,
    paginate,
    getPageProgress,
    cleanup,
    clearCache,
    clearCacheForBook,
  };
}
