import { ref, onUnmounted, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";
import { generateIframeStyles } from "../utils/reader-styles";
import { type ResourceInfo, injectResources, clearResources } from "../utils/iframe-resources";

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

/**
 * 阅读器分页 Composable
 *
 * 核心流程：
 * 1. 将 HTML 拆分为独立的 block 单元
 * 2. 使用隐藏的 iframe 进行精确高度测量
 * 3. 逐页累加 block，支持智能拆分页尾 block 以充分利用空间
 * 4. 支持后台计算剩余页面，不阻塞用户交互
 * 5. LRU 缓存机制，避免重复计算
 */
export function usePagination(
  containerRef: Ref<HTMLElement | null>,
  bookId: string,
  chapters: PaginationChapter[],
  settings: Ref<ReaderSettings>,
) {
  // ==================== 响应式状态 ====================

  const currentPage = ref(0);
  const totalPages = ref(1);
  const isPaginating = ref(false);
  const pages = ref<Page[]>([]);
  const currentHtml = ref("");
  const isReady = ref(false);
  const computedCount = ref(0);
  const rawHtml = ref("");

  // ==================== 测量 iframe ====================

  let measureIframe: HTMLIFrameElement | null = null;
  let measureDoc: Document | null = null;
  let measureEl: HTMLElement | null = null;

  // ==================== ResizeObserver ====================

  let resizeObserver: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  // ==================== 缓存与后台计算 ====================

  /** 实例级缓存：cacheKey -> Page[] */
  const pagesCache = new Map<string, Page[]>();

  /** 用于取消后台计算的标志 */
  let backgroundCalcActive = true;

  /** 后台计算 ID，用于区分不同批次的计算 */
  let backgroundCalcId = 0;

  /** 当前正在计算的章节 ID，用于 resize 后重新计算 */
  let currentChapterId: string | null = null;

  /** 当前正在计算的 HTML 内容 */
  let currentHtmlForPaginate: string | null = null;

  // ==================== 资源管理 ====================

  /** 资源追踪：记录已注入的资源详细信息 */
  const injectedResources = new Map<string, ResourceInfo>();

  // ==================== 工具函数 ====================

  /**
   * 生成样式 hash 用于缓存 key
   * 当样式设置变化时，分页结果需要重新计算
   */
  function generateStyleHash(): string {
    const s = settings.value;
    return `${s.fontSize}-${s.lineHeight}-${s.fontFamily}-${s.margin || 0}`;
  }

  /**
   * 获取容器可用高度
   */
  function getPageHeight(): number {
    const el = containerRef.value;
    if (!el) return window.innerHeight - 120;
    return el.getBoundingClientRect().height - settings.value.margin;
  }

  /**
   * 获取容器内容宽度（减去 padding）
   */
  function getContainerWidth(): number {
    const el = containerRef.value;
    if (!el) return 700;
    const rect = el.getBoundingClientRect();
    return rect.width;
  }

  /**
   * 获取测量元素的实际高度
   * 使用 getBoundingClientRect 避免 margin 塌陷问题
   */
  function getContentHeight(): number {
    if (!measureEl) return 0;
    const rect = measureEl.getBoundingClientRect();
    return rect.height;
  }

  // ==================== 测量 iframe 管理 ====================

  /**
   * 初始化隐藏的测量 iframe
   * 使用 iframe 创建独立的渲染上下文，避免影响主文档布局
   */
  function initMeasureIframe() {
    if (measureIframe) {
      measureIframe.remove();
    }

    measureIframe = document.createElement("iframe");
    measureIframe.style.position = "fixed";
    measureIframe.style.left = "0";
    measureIframe.style.top = "0";
    measureIframe.style.pointerEvents = "none";
    measureIframe.style.visibility = "hidden";
    measureIframe.style.width = `${getContainerWidth()}px`;
    measureIframe.style.height = `${getPageHeight()}px`;
    measureIframe.style.border = "none";
    measureIframe.style.zIndex = "-1";
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
          html, body { height: auto; }
          body {
            overflow-x: hidden;
            scrollbar-width: none;
          }
        </style>
      </head>
      <body class="reader-content"></body>
      </html>
    `);
    measureDoc.close();

    measureEl = measureDoc.body;
  }

  /**
   * 更新测量 iframe 中的样式（当用户修改阅读设置时调用）
   */
  function updateMeasureIframeStyles() {
    if (!measureDoc) return;

    const styles = measureDoc.querySelectorAll("style");
    if (styles.length >= 4) {
      const newStyles = generateIframeStyles(settings.value);
      styles[0].textContent = newStyles.theme;
      styles[1].textContent = newStyles.base;
      styles[2].textContent = newStyles.typography;
    }
  }

  /**
   * 更新测量 iframe 的尺寸（当容器大小变化时调用）
   */
  function updateMeasureIframeSize() {
    if (!measureIframe) return;
    measureIframe.style.width = `${getContainerWidth()}px`;
    measureIframe.style.height = `${getPageHeight()}px`;
  }

  // ==================== HTML 拆分 ====================

  /**
   * 将 HTML 拆分为可分页的 block 单元
   *
   * 保留原始嵌套结构：每个 block 都携带完整的祖先包裹标签
   * 例如 <blockquote><p>A</p><p>B</p></blockquote>
   *   → ['<blockquote><p>A</p></blockquote>', '<blockquote><p>B</p></blockquote>']
   *
   * @param html 原始 HTML 内容
   * @returns block HTML 数组
   */
  function splitIntoBlocks(html: string): string[] {
    if (!html) return [];
    const container = document.createElement("div");
    container.innerHTML = html;

    const blocks: string[] = [];

    /**
     * 用祖先标签包裹内部 HTML
     * @param innerHtml 内部 HTML
     * @param ancestors 祖先标签列表
     */
    function wrapWithAncestors(innerHtml: string, ancestors: { tag: string }[]): string {
      return innerHtml;
      let result = innerHtml;
      for (let i = ancestors.length - 1; i >= 0; i--) {
        result = `<${ancestors[i].tag}>${result}</${ancestors[i].tag}>`;
      }
      return result;
    }

    /**
     * 递归处理 DOM 节点
     * @param node 当前节点
     * @param ancestors 祖先标签路径
     */
    function processNode(node: Node, ancestors: { tag: string }[]) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      // 容器元素：递归处理子节点
      if (el.childElementCount > 10) {
        const newAncestors = [...ancestors, { tag: tagName }];
        for (const child of Array.from(el.childNodes)) {
          processNode(child, newAncestors);
        }
        return;
      } else {
        blocks.push(wrapWithAncestors(el.outerHTML, ancestors));
        return;
      }
    }

    for (const child of Array.from(container.childNodes)) {
      processNode(child, []);
    }

    return blocks;
  }

  // ==================== 智能拆分 ====================

  /**
   * 尝试拆分 block，将能容纳的部分放入当前页
   *
   * 使用二分查找找到最佳拆分点，优先在单词边界（空格）处断开
   *
   * @param blockHtml 待拆分的 block HTML
   * @param currentHeight 当前页面已使用的高度
   * @param maxHeight 页面最大高度
   * @returns 拆分结果：{ splitHtml: 放入当前页的部分, remainingHtml: 留给下一页的部分 }
   */
  function trySplitBlock(
    blockHtml: string,
    currentHeight: number,
    maxHeight: number,
  ): { splitHtml: string; remainingHtml: string } {
    if (!measureEl || !measureDoc) {
      return { splitHtml: blockHtml, remainingHtml: "" };
    }

    // 提取内部内容（去掉最外层标签）
    const innerContent = blockHtml.replace(/^<\w+>/, "").replace(/<\/\w+>$/, "");

    // 创建临时元素解析内容
    const tempDiv = measureDoc.createElement("div");
    tempDiv.innerHTML = innerContent;

    // 检查是否有可拆分的文本内容
    const fullText = tempDiv.textContent || "";
    if (!fullText.trim()) {
      return { splitHtml: blockHtml, remainingHtml: "" };
    }

    // 重建 HTML 的辅助函数
    function rebuildHtml(textSlice: string): string {
      return blockHtml.replace(innerContent, textSlice);
    }

    // 二分查找能容纳的最大文本长度
    let low = 1;
    let high = fullText.length;
    let bestSplit = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);

      // 尝试在单词边界拆分
      let splitPoint = mid;
      const textUpToMid = fullText.slice(0, mid);
      const lastSpace = textUpToMid.lastIndexOf(" ");
      // 如果空格位置合理（不在开头），优先在空格处断开
      if (lastSpace > mid * 0.6) {
        splitPoint = lastSpace;
      }

      const testText = fullText.slice(0, splitPoint).trim();
      if (!testText) {
        low = mid + 1;
        continue;
      }

      // 测量高度
      const testHtml = rebuildHtml(testText);
      measureEl.innerHTML = testHtml;
      const h = getContentHeight();

      if (h <= maxHeight - currentHeight) {
        bestSplit = splitPoint;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // 无法拆分
    if (bestSplit === 0) {
      return { splitHtml: "", remainingHtml: blockHtml };
    }

    // 在最佳位置拆分
    const firstPart = fullText.slice(0, bestSplit).trim();
    const secondPart = fullText.slice(bestSplit).trim();

    return {
      splitHtml: rebuildHtml(firstPart),
      remainingHtml: secondPart ? rebuildHtml(secondPart) : "",
    };
  }

  // ==================== 单页计算 ====================

  /**
   * 计算单页内容：从 startIdx 开始累加 block，直到超过 maxHeight
   *
   * 支持智能拆分：当页尾有剩余空间但下一个 block 放不下时，尝试拆分该 block
   *
   * @param blocks 所有 block 列表（会被修改：拆分后的剩余部分会替换原位置）
   * @param startIdx 起始 block 索引
   * @param maxHeight 页面最大高度
   * @param pageIndex 页面索引
   * @returns 单页分页结果
   */
  function computeSinglePage(
    blocks: string[],
    startIdx: number,
    maxHeight: number,
    pageIndex: number,
  ): Page {
    if (!measureEl) {
      return { index: pageIndex, html: "", blockStart: startIdx, blockEnd: startIdx + 1 };
    }

    let endIdx = startIdx + 1;
    measureEl.innerHTML = blocks[startIdx];

    // 检查单个 block 是否超高
    const singleBlockHeight = getContentHeight();
    if (singleBlockHeight > maxHeight) {
      // 尝试拆分超高 block
      const { splitHtml } = trySplitBlock(blocks[startIdx], 0, maxHeight);
      measureEl.innerHTML = "";
      return {
        index: pageIndex,
        html: splitHtml || blocks[startIdx],
        blockStart: startIdx,
        blockEnd: endIdx,
      };
    }

    // 逐个尝试添加后续 block
    while (endIdx < blocks.length) {
      const temp = measureDoc!.createElement("div");
      temp.innerHTML = blocks[endIdx];
      const appendedNodes: Node[] = [];

      for (const child of Array.from(temp.childNodes)) {
        measureEl.appendChild(child);
        appendedNodes.push(child);
      }

      const h = getContentHeight();
      if (h > maxHeight) {
        // 放不下，回退
        for (const node of appendedNodes) {
          measureEl.removeChild(node);
        }

        // 尝试拆分当前 block
        const currentHtml = measureEl.innerHTML;
        const currentH = getContentHeight();
        const remainingSpace = maxHeight - currentH;

        // 检查剩余空间是否足够拆分
        const minRemainingRatio = settings.value.fontSize * settings.value.lineHeight;
        if (remainingSpace > minRemainingRatio) {
          const { splitHtml, remainingHtml } = trySplitBlock(blocks[endIdx], currentH, maxHeight);

          if (splitHtml) {
            // 成功拆分
            measureEl.innerHTML = currentHtml + splitHtml;

            if (remainingHtml) {
              // 有剩余：替换原 block 为剩余部分，供下一页使用
              blocks[endIdx] = remainingHtml;
            } else {
              // 无剩余：整个 block 都放下了，标记为已处理
              endIdx++;
            }
          } else {
            // 拆分失败：恢复 measureEl（trySplitBlock 会修改它）
            measureEl.innerHTML = currentHtml;
          }
        }

        break;
      }
      endIdx++;
    }

    const pageHtml = measureEl.innerHTML;
    measureEl.innerHTML = "";

    return {
      index: pageIndex,
      html: pageHtml,
      blockStart: startIdx,
      blockEnd: endIdx,
    };
  }

  // ==================== 缓存管理 ====================

  /**
   * 更新 LRU 缓存
   */
  function updateCache(chapterId: string, computedPages: Page[]) {
    const styleHash = generateStyleHash();
    const cacheKey = `${bookId}:${chapterId}:${styleHash}`;

    // 移到末尾（标记为最近使用）
    if (pagesCache.has(cacheKey)) {
      pagesCache.delete(cacheKey);
    }

    // 淘汰最久未使用的条目
    while (pagesCache.size >= CACHE_CAPACITY) {
      const firstKey = pagesCache.keys().next().value;
      if (firstKey !== undefined) {
        pagesCache.delete(firstKey);
      } else {
        break;
      }
    }

    pagesCache.set(cacheKey, computedPages);
  }

  /**
   * 清理指定 bookId 的所有缓存
   */
  function clearCacheForBook(clearBookId: string) {
    const prefix = `${clearBookId}:`;
    for (const key of pagesCache.keys()) {
      if (key.startsWith(prefix)) {
        pagesCache.delete(key);
      }
    }
  }

  // ==================== 分页主流程 ====================

  /**
   * 限制页码在有效范围内
   * @param target 目标页码（负数表示最后一页）
   * @param length 总页数
   */
  function clampPage(target: number | undefined, length: number): number {
    if (length <= 0) return 0;
    if (target === undefined) return 0;
    if (target < 0) return Math.max(0, length - 1);
    return Math.min(target, length - 1);
  }

  /**
   * 从 chapters 数组中安全获取章节 HTML
   */
  function getChapterHtml(chapterId: string): string | null {
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter || !("html" in chapter)) return null;
    return (chapter as { html?: string }).html ?? null;
  }

  /**
   * 执行分页计算
   * @param chapterId 章节 ID
   * @param options 可选参数：html（直接提供内容）、targetPage（目标页码）
   */
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

    // 初始化或更新测量 iframe
    if (!measureIframe) {
      initMeasureIframe();
      setupResizeObserver();
    } else {
      updateMeasureIframeStyles();
      updateMeasureIframeSize();
    }

    // 注入资源（EPUB 的 <link> 和 <style> 元素）
    if (options?.resources && options.resources.length > 0) {
      injectResources(
        measureDoc!,
        options.resources,
        injectedResources,
        "epub-style",
        "data-measure-dynamic",
      );
    } else {
      clearResources(measureDoc!, injectedResources, "epub-style");
    }

    // 取消正在运行的后台计算
    backgroundCalcActive = false;
    backgroundCalcId++;

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

    // 拆分 HTML 为 blocks
    const maxHeight = getPageHeight();
    const blocks = splitIntoBlocks(rawHtml.value);

    // 空内容处理
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

    // 逐页计算，增量更新
    const computedPages: Page[] = [];
    let startIdx = 0;
    let pageIndex = 0;

    while (startIdx < blocks.length) {
      const page = computeSinglePage(blocks, startIdx, maxHeight, pageIndex);
      computedPages.push(page);

      computedCount.value = computedPages.length;
      totalPages.value = computedPages.length;

      // 目标页就绪，立即返回
      if (targetPage !== undefined && page.index === targetPage) {
        currentPage.value = targetPage;
        currentHtml.value = page.html;
        pages.value = [...computedPages];

        isPaginating.value = false;
        isReady.value = true;

        // 后台计算剩余页面
        const currentCalcId = backgroundCalcId;
        backgroundCalcActive = true;
        computeRemainingInBackground(
          blocks,
          page.blockEnd,
          pageIndex + 1,
          maxHeight,
          chapterId,
          currentCalcId,
          computedPages,
        );
        return;
      }

      // 让出主线程，允许渲染
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

  // ==================== 后台计算 ====================

  /**
   * 后台计算剩余页面（不阻塞用户交互）
   *
   * 使用时间片轮转策略：每帧最多执行 CHUNK_TIME_MS 毫秒，避免阻塞主线程
   * 每计算 BATCH_SIZE 页更新一次响应式状态，减少触发频率
   */
  function computeRemainingInBackground(
    blocks: string[],
    startIdx: number,
    pageIndex: number,
    maxHeight: number,
    chapterId: string,
    calcId: number,
    basePages: Page[],
  ): void {
    let currentIdx = startIdx;
    let currentPageIdx = pageIndex;
    const CHUNK_TIME_MS = 16; // 约一帧的时间（60fps）
    const BATCH_SIZE = 5; // 每 5 页更新一次响应式状态
    const remainingPages: Page[] = [];

    function computeChunk() {
      // 检查是否被取消
      if (!backgroundCalcActive || calcId !== backgroundCalcId) return;

      const startTime = performance.now();
      let pagesSinceUpdate = 0;

      while (currentIdx < blocks.length && performance.now() - startTime < CHUNK_TIME_MS) {
        const page = computeSinglePage(blocks, currentIdx, maxHeight, currentPageIdx);
        remainingPages.push(page);
        currentIdx = page.blockEnd;
        currentPageIdx++;
        pagesSinceUpdate++;

        // 批量更新响应式状态
        if (pagesSinceUpdate >= BATCH_SIZE) {
          const merged = [...basePages, ...remainingPages];
          computedCount.value = merged.length;
          totalPages.value = merged.length;
          pages.value = merged;
          pagesSinceUpdate = 0;
        }
      }

      // 更新剩余页面
      if (pagesSinceUpdate > 0) {
        const merged = [...basePages, ...remainingPages];
        computedCount.value = merged.length;
        totalPages.value = merged.length;
        pages.value = merged;
      }

      if (currentIdx < blocks.length) {
        // 还有剩余，下一帧继续
        setTimeout(computeChunk, 0);
      } else {
        // 全部完成，再次检查 calcId 防止覆盖新数据
        if (calcId === backgroundCalcId) {
          const merged = [...basePages, ...remainingPages];
          updateCache(chapterId, merged);
        }
      }
    }

    setTimeout(computeChunk, 0);
  }

  // ==================== ResizeObserver ====================

  /**
   * 设置 ResizeObserver 监听容器大小变化
   * 容器大小变化时重新计算分页（带 150ms 防抖）
   */
  function setupResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver = new ResizeObserver(() => {
      if (!currentChapterId || !currentHtmlForPaginate) return;
      if (resizeTimer) clearTimeout(resizeTimer);

      const chapterId = currentChapterId;
      const html = currentHtmlForPaginate;
      const targetPage = currentPage.value;

      resizeTimer = setTimeout(() => {
        // 清除当前样式哈希的缓存
        const styleHash = generateStyleHash();
        const cacheKey = `${bookId}:${chapterId}:${styleHash}`;
        pagesCache.delete(cacheKey);
        void paginate(chapterId, { html, targetPage });
      }, 150);
    });

    const el = containerRef.value;
    if (el) {
      resizeObserver.observe(el);
    }
  }

  // ==================== 页面导航 ====================

  /**
   * 跳转到指定页
   */
  function goToPage(page: number): void {
    if (page < 0 || page >= pages.value.length) return;
    currentPage.value = page;
    currentHtml.value = pages.value[page].html;
  }

  /**
   * 下一页
   * @returns 是否成功跳转
   */
  function nextPage(): boolean {
    if (currentPage.value >= pages.value.length - 1) return false;
    currentPage.value++;
    currentHtml.value = pages.value[currentPage.value].html;
    return true;
  }

  /**
   * 上一页
   * @returns 是否成功跳转
   */
  function prevPage(): boolean {
    if (currentPage.value <= 0) return false;
    currentPage.value--;
    currentHtml.value = pages.value[currentPage.value].html;
    return true;
  }

  /**
   * 获取当前阅读进度百分比
   * @returns 已完成比例（0-100），例如第一页/共5页 = 20%
   * 注意：这是"已完成比例"而非"当前位置"，读完第1页表示完成了 1/5
   */
  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
  }

  // ==================== 清理 ====================

  function cleanup(): void {
    backgroundCalcActive = false;

    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }

    // 清理注入的资源
    if (measureDoc) {
      clearResources(measureDoc, injectedResources, "epub-style");
    }

    if (measureIframe) {
      measureIframe.remove();
      measureIframe = null;
      measureDoc = null;
      measureEl = null;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    rawHtml.value = "";
    pages.value = [];
    currentChapterId = null;
    currentHtmlForPaginate = null;
  }

  function clearCache(): void {
    pagesCache.clear();
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    cleanup();
  });

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
