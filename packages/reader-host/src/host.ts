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
      pendingTarget: number | null;
    }>,
    initialScroll?: Partial<{ progress: number }>,
    format = "",
  ): void {
    this.bookFormat = format;
    super.init(bookId, chapters, chapterIndex, mode, initialPage, initialScroll);
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
            const step = this.iframeDoc.documentElement.clientWidth;
            if (step > 0) {
              const offset =
                el.getBoundingClientRect().left - this.iframeDoc.body.getBoundingClientRect().left;
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
          const step = this.iframeDoc.documentElement.clientWidth;
          if (step > 0) {
            const offset =
              el.getBoundingClientRect().left - this.iframeDoc.body.getBoundingClientRect().left;
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
      case "PAGE_POSITION_CHANGED":
        this.iframeDoc.documentElement.style.setProperty("--current-page", String(effect.page));
        break;
      case "MODE_CHANGED":
        this.iframeDoc.documentElement.dataset.mode = effect.mode;
        break;
      default:
        await this.runGenericEffect(effect);
    }
  }

  // ── Chapter fetching with resource resolution ──

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    // Clean up previous chapter resources before loading the next.
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();

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

    // Dispatch CHAPTER_LOADED so the machine records the chapter change.
    this.dispatch({ type: "CHAPTER_LOADED", chapterId });

    // Render directly — no longer goes through a machine effect.
    this.iframeDoc.body.innerHTML = processed;

    // Measure layout and report page count back to the machine.
    requestAnimationFrame(() => {
      if (!this.iframeDoc.body) return;
      const contentWidth = this.iframeDoc.body.scrollWidth;
      const iframeWidth = this.iframeDoc.documentElement.clientWidth;
      const step = Math.max(iframeWidth, 1);
      const total = Math.max(1, Math.ceil(contentWidth / step));
      this.dispatch({
        type: "PAGE_COUNT_UPDATED",
        total,
      });
    });
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
