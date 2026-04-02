import { ref, shallowRef, type Ref } from "vue";

export interface Page {
  index: number;
  html: string;
}

export function usePagination(containerRef: Ref<HTMLElement | null>) {
  const currentPage = ref(0);
  const totalPages = ref(1);
  const isPaginating = ref(false);
  const pages = shallowRef<Page[]>([]);
  const currentHtml = ref("");
  const isReady = ref(false);

  let measureEl: HTMLElement | null = null;
  let rawHtml = "";

  function getPageHeight(): number {
    const el = containerRef.value;
    if (!el) return window.innerHeight - 120;
    return el.clientHeight;
  }

  function cloneStyles(source: HTMLElement, target: HTMLElement) {
    const cs = getComputedStyle(source);
    const props = [
      "width",
      "padding",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontSize",
      "fontFamily",
      "lineHeight",
      "letterSpacing",
      "textAlign",
      "wordSpacing",
      "textIndent",
      "whiteSpace",
      "wordBreak",
      "overflowWrap",
      "hyphens",
      "tabSize",
      "color",
      "columnGap",
    ];
    for (const prop of props) {
      const cssProp = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      target.style.setProperty(cssProp, cs.getPropertyValue(cssProp));
    }
    target.style.boxSizing = "border-box";
    target.style.position = "absolute";
    target.style.visibility = "hidden";
    target.style.left = "0";
    target.style.top = "0";
    target.style.overflow = "hidden";
    target.style.height = "auto";
    target.style.wordWrap = "break-word";
    target.style.overflowWrap = "break-word";
    target.style.hyphens = "auto";
  }

  function createMeasureEl(source: HTMLElement): HTMLElement {
    const el = document.createElement("article");
    el.className = "reader-content";
    cloneStyles(source, el);
    el.style.width = `${source.clientWidth || source.offsetWidth || 700}px`;
    document.body.appendChild(el);
    return el;
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

  function paginateBlocks(maxHeight: number): Page[] {
    if (!measureEl || rawHtml.length === 0) {
      return [{ index: 0, html: rawHtml }];
    }

    const blocks = splitIntoBlocks(rawHtml);
    if (blocks.length === 0) {
      return [{ index: 0, html: "" }];
    }

    measureEl.innerHTML = "";
    const result: Page[] = [];
    let startIdx = 0;

    while (startIdx < blocks.length) {
      let low = startIdx + 1;
      let high = blocks.length;
      let bestEnd = startIdx + 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testHtml = blocks.slice(startIdx, mid).join("");

        measureEl.innerHTML = testHtml;
        const h = getContentHeight();

        if (h <= maxHeight) {
          bestEnd = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const pageHtml = blocks.slice(startIdx, bestEnd).join("");
      result.push({
        index: result.length,
        html: pageHtml,
      });

      startIdx = bestEnd;
    }

    return result;
  }

  async function paginate(html: string, targetPage?: number): Promise<void> {
    isReady.value = false;
    isPaginating.value = true;
    rawHtml = html;

    const article = containerRef.value;
    if (!article) {
      isPaginating.value = false;
      isReady.value = true;
      return;
    }

    if (measureEl) {
      measureEl.remove();
    }
    measureEl = createMeasureEl(article);

    const maxHeight = getPageHeight();

    const calculated = paginateBlocks(maxHeight);

    pages.value = calculated;
    totalPages.value = calculated.length;

    if (targetPage !== undefined) {
      if (targetPage < 0) {
        currentPage.value = Math.max(0, calculated.length - 1);
      } else {
        currentPage.value = Math.min(targetPage, calculated.length - 1);
      }
    } else if (currentPage.value >= calculated.length) {
      currentPage.value = Math.max(0, calculated.length - 1);
    }

    updateCurrentHtml();

    isPaginating.value = false;
    isReady.value = true;
  }

  function updateCurrentHtml(): void {
    const page = pages.value[currentPage.value];
    currentHtml.value = page?.html || "";
  }

  function goToPage(page: number): void {
    if (page < 0 || page >= totalPages.value) return;
    currentPage.value = page;
    updateCurrentHtml();
  }

  function nextPage(): boolean {
    if (currentPage.value >= totalPages.value - 1) return false;
    currentPage.value++;
    updateCurrentHtml();
    return true;
  }

  function prevPage(): boolean {
    if (currentPage.value <= 0) return false;
    currentPage.value--;
    updateCurrentHtml();
    return true;
  }

  async function reset(html: string, targetPage?: number): Promise<void> {
    await paginate(html, targetPage);
  }

  function getPageProgress(): number {
    if (totalPages.value <= 1) return 100;
    return ((currentPage.value + 1) / totalPages.value) * 100;
  }

  function cleanup(): void {
    if (measureEl) {
      measureEl.remove();
      measureEl = null;
    }
    rawHtml = "";
  }

  return {
    currentPage,
    totalPages,
    isPaginating,
    isReady,
    currentHtml,
    pages,
    goToPage,
    nextPage,
    prevPage,
    reset,
    paginate,
    getPageProgress,
    cleanup,
  };
}
