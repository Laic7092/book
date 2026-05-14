import { type ReaderEffect, type Chapter } from "@book/reader-core";
import { getParserForFormat } from "@book/parser-core";
import { BaseHost, type BaseHostOptions } from "./base-host";
import { BASE_CSS, PAGINATION_CSS } from "./base-css";
import { resolveChapterResources } from "./content-pipeline";
import { injectResources, clearResources, type ResourceInfo } from "./iframe-resources";

export interface ReaderHostOptions extends BaseHostOptions {
  container: HTMLElement;
  onClick?: (e: MouseEvent) => void;
  navigateToCfi?: (cfi: string, chapterId: string) => Promise<void>;
  transformContent?: (html: string, bookId: string, chapterId: string) => Promise<string>;
}

/**
 * Reflowable reader host — creates an iframe, manages CSS-column pagination,
 * resolves EPUB resources (images/css/fonts → blob URLs), and handles internal links.
 *
 * Used by ReflowableReader for epub/txt formats.
 */
export class ReaderHost extends BaseHost {
  private iframe!: HTMLIFrameElement;
  private iframeDoc!: Document;
  private container: HTMLElement;
  private navigateToCfi: ((cfi: string, chapterId: string) => Promise<void>) | undefined;
  private clickHandlerRef: ((e: MouseEvent) => void) | null = null;
  private transformContent: ReaderHostOptions["transformContent"];
  private bookFormat = "";
  private resourceUrls = new Map<string, string>();
  private injectedResources = new Map<string, ResourceInfo>();

  constructor(options: ReaderHostOptions) {
    super(options);
    this.container = options.container;
    this.navigateToCfi = options.navigateToCfi;
    this.transformContent = options.transformContent;
    this.createIframe();
    this.setupClickHandler(options.onClick);
  }

  // ── Public API ──

  init(
    bookId: string,
    chapters: Chapter[],
    chapterIndex = 0,
    mode: "pagination" | "scroll" = "pagination",
    initialPage?: Partial<{
      current: number;
      total: number;
      iframeWidth: number;
      pendingTarget: number | null;
    }>,
    initialScroll?: Partial<{ windowStart: number; windowEnd: number; progress: number }>,
    format = "",
  ): void {
    this.bookFormat = format;
    super.init(bookId, chapters, chapterIndex, mode, initialPage, initialScroll);
  }

  loadChapter(chapterId: string, html: string): void {
    this.dispatch({ type: "CHAPTER_LOADED", chapterId, html });
  }

  nextPage(): void {
    this.dispatch({ type: "NEXT_PAGE" });
  }

  prevPage(): void {
    this.dispatch({ type: "PREV_PAGE" });
  }

  goToChapter(chapterId: string): void {
    this.dispatch({ type: "GO_TO_CHAPTER", chapterId });
  }

  getDocument(): Document | null {
    return this.iframeDoc ?? null;
  }

  getIframeElement(): HTMLIFrameElement {
    return this.iframe;
  }

  setPageMargin(margin: number): void {
    this.iframeDoc.documentElement.style.setProperty("--page-margin", `${margin}px`);
  }

  getSession() {
    const base = super.getSession();
    return {
      ...base,
      setPageMargin: (m: number) => this.setPageMargin(m),
      navigateToCfi: (cfi: string, ch: string) =>
        this.navigateToCfi?.(cfi, ch) ?? Promise.resolve(),
    };
  }

  handleInternalLink(href: string): void {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))
      return;

    const hashIndex = href.indexOf("#");
    const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

    const targetChapter = this.state.chapters.find(
      (c) =>
        c.href &&
        (c.href === filePath || c.href.endsWith(filePath) || c.href.endsWith("/" + filePath)),
    );

    const currentId = this.state.chapters[this.state.currentChapterIndex]?.id;

    if (!filePath) {
      if (anchor) {
        const el =
          this.iframeDoc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
          this.iframeDoc.querySelector(`[name="${CSS.escape(anchor)}"]`);
        if (el) {
          if (this.state.mode === "pagination") {
            const offset =
              el.getBoundingClientRect().left - this.iframeDoc.body.getBoundingClientRect().left;
            const step = this.state.page.iframeWidth || this.iframeDoc.documentElement.clientWidth;
            if (step > 0) {
              this.dispatch({ type: "GO_TO_PAGE", page: Math.floor(offset / step) });
            }
          } else {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
      return;
    }

    if (!targetChapter) return;

    if (targetChapter.id !== currentId) {
      this.goToChapter(targetChapter.id);
      return;
    }

    if (anchor) {
      const el =
        this.iframeDoc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
        this.iframeDoc.querySelector(`[name="${CSS.escape(anchor)}"]`);
      if (el) {
        if (this.state.mode === "pagination") {
          const offset =
            el.getBoundingClientRect().left - this.iframeDoc.body.getBoundingClientRect().left;
          const step = this.state.page.iframeWidth || this.iframeDoc.documentElement.clientWidth;
          if (step > 0) {
            this.dispatch({ type: "GO_TO_PAGE", page: Math.floor(offset / step) });
          }
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }

  destroy(): void {
    super.destroy();
    if (this.clickHandlerRef) {
      this.iframeDoc.removeEventListener("click", this.clickHandlerRef);
    }
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();
    this.iframe.remove();
  }

  // ── Protected: effect handling ──

  protected async runEffect(effect: ReaderEffect): Promise<void> {
    switch (effect.type) {
      case "RENDER_HTML": {
        this.iframeDoc.body.innerHTML = effect.html;
        break;
      }
      case "SET_PAGE_CSS":
        this.iframeDoc.documentElement.style.setProperty("--current-page", String(effect.page));
        break;
      case "SET_MODE_CSS":
        this.iframeDoc.documentElement.dataset.mode = effect.mode;
        break;
      case "SET_PAGE_MARGIN_CSS":
        this.iframeDoc.documentElement.style.setProperty("--page-margin", `${effect.margin}px`);
        break;
      case "MEASURE_LAYOUT": {
        requestAnimationFrame(() => {
          if (!this.iframeDoc.body) return;
          const contentWidth = this.iframeDoc.body.scrollWidth;
          const iframeWidth = this.iframeDoc.documentElement.clientWidth;
          this.dispatch({
            type: "LAYOUT_MEASURED",
            contentWidth: Math.max(contentWidth, iframeWidth),
            iframeWidth: Math.max(iframeWidth, 1),
          });
        });
        break;
      }
      case "SCROLL_INTO_VIEW": {
        const el = this.iframeDoc.querySelector<HTMLElement>(
          `[data-chapter-id="${effect.chapterId}"]`,
        );
        if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
        break;
      }
      default:
        await this.runGenericEffect(effect);
    }
  }

  // ── Chapter fetching with resource resolution ──

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    const { html, rawData } = await this.fetchChapter!(bookId, chapterId);
    if (!html) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Content not found" });
      return;
    }

    let processed = html;

    const parser = getParserForFormat(this.bookFormat);
    if (parser && parser.extractResource) {
      const resolved = await resolveChapterResources(html, rawData, parser, this.resourceUrls);
      if (resolved.resources.length > 0) {
        injectResources(this.iframeDoc, resolved.resources, this.injectedResources);
      }
      processed = resolved.html;
    }

    if (this.transformContent) {
      processed = await this.transformContent(processed, bookId, chapterId);
    }

    this.loadChapter(chapterId, processed);
  }

  // ── Iframe ──

  private createIframe(): void {
    this.iframe = document.createElement("iframe");
    this.iframe.style.cssText = "width:100%;height:100%;border:none";
    this.container.appendChild(this.iframe);

    const doc = this.iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html data-mode="paginated">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style id="base-style">${BASE_CSS}\n${PAGINATION_CSS}</style>
</head>
<body class="reader-content">
</body>
</html>`);
    doc.close();
    this.iframeDoc = doc;
  }

  private setupClickHandler(onClick: ((e: MouseEvent) => void) | undefined): void {
    this.clickHandlerRef = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest?.("a[href]");
      if (link) {
        e.preventDefault();
        this.handleInternalLink(link.getAttribute("href")!);
        return;
      }
      onClick?.(e);
    };
    this.iframeDoc.addEventListener("click", this.clickHandlerRef);
  }
}
