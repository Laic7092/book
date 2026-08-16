import { type ReaderEffect, type Chapter, type Position } from "./machine";
import { Engine, type EngineOptions } from "./engine";
import { BASE_CSS } from "./styles";
import {
  resolveChapterResources,
  injectResources,
  clearResources,
  type ResourceInfo,
} from "./resources";
import { ScrollController } from "./scroll-controller";
import { PagedController } from "./paged-controller";
import { type ReflowablePresentation } from "./presentation";

const INTERACTIVE_SELECTOR =
  "button, input, textarea, select, details, summary, [contenteditable], [contenteditable=true]";

function isInteractiveElement(el: Element): boolean {
  return el.closest(INTERACTIVE_SELECTOR) !== null;
}

export interface ReflowableHostOptions extends EngineOptions {
  container: HTMLElement;
  onClick?: (e: MouseEvent) => void;
  navigateToCfi?: (cfi: string, chapterId: string) => Promise<void>;
  transformContent?: (html: string, bookId: string, chapterId: string) => Promise<string>;
}

export class ReflowableHost extends Engine {
  private iframe!: HTMLIFrameElement;
  private iframeDoc!: Document;
  private container: HTMLElement;
  private navigateToCfi: ((cfi: string, chapterId: string) => Promise<void>) | undefined;
  private clickHandlerRef: ((e: MouseEvent) => void) | null = null;
  private transformContent: ReflowableHostOptions["transformContent"];
  private resourceUrls = new Map<string, string>();
  private injectedResources = new Map<string, ResourceInfo>();
  private pagedController: PagedController;
  private scrollController: ScrollController;
  private presentation: ReflowablePresentation;
  private lastChapterHtml = "";
  private lastChapterId = "";

  constructor(options: ReflowableHostOptions) {
    super(options);
    this.container = options.container;
    this.navigateToCfi = options.navigateToCfi;
    this.transformContent = options.transformContent;
    this.createIframe();
    this.pagedController = new PagedController({
      doc: this.iframeDoc,
      getState: () => this.state,
      getMode: () => this.mode,
      dispatch: (action) => this.dispatch(action),
    });
    this.scrollController = new ScrollController({
      doc: this.iframeDoc,
      getState: () => this.state,
      getMode: () => this.mode,
      getBookId: () => this.state.bookId,
      dispatch: (action) => this.dispatch(action),
      processChapterContent: (html, rawData, bookId, chapterId) =>
        this.processChapterContent(html, rawData, bookId, chapterId),
      fetchChapter: (bookId, chapterId, signal) =>
        this.fetchChapter?.(bookId, chapterId, signal) ?? Promise.resolve({ html: undefined }),
      nextAutoLoadSignal: () => this.nextAutoLoadSignal(),
    });
    this.presentation = this.pagedController;
    this.setupClickHandler(options.onClick);
  }

  init(
    bookId: string,
    chapters: Chapter[],
    chapterIndex = 0,
    mode: "pagination" | "scroll" = "pagination",
    initialPosition?: Partial<Position>,
    initialPage?: number,
  ): void {
    // The machine no longer knows the mode: the host applies its own
    // presentation before the content pipeline starts.
    this.mode = mode;
    this.iframeDoc.documentElement.dataset.mode = mode;
    this.presentation = mode === "scroll" ? this.scrollController : this.pagedController;
    this.presentation.start();
    super.init(bookId, chapters, chapterIndex, mode, initialPosition, initialPage);
  }

  /**
   * Switch presentation mode. The position is preserved (no reset — this
   * fixes the old SET_MODE behavior that dropped the reader's place).
   */
  override setMode(mode: "pagination" | "scroll"): void {
    const prev = this.mode;
    if (prev === mode) return;

    const old = this.presentation;
    this.mode = mode;
    this.iframeDoc.documentElement.dataset.mode = mode;
    this.presentation = mode === "scroll" ? this.scrollController : this.pagedController;
    // A mode switch restructures the whole document; in-flight chained loads
    // would write into a DOM that is about to be replaced.
    old.teardown();
    this.cancelAutoLoads();
    this.presentation.start();

    if (this.lastChapterHtml && this.state.status === "ready") {
      this.presentation.restructure(this.lastChapterId, this.lastChapterHtml);
      const chapterId = this.currentChapterId();
      if (chapterId && mode === "scroll") {
        this.dispatch({ type: "MEASURED", chapterId, total: 0, mode: "scroll" });
      }
    }
  }

  /** The single navigation primitive: go to chapter + in-chapter target. */
  seek(target: { chapterIndex: number; progress?: number; page?: number }): void {
    this.dispatch({ type: "SEEK", ...target });
    // In scroll mode, POSITION_CHANGED is a report channel (DOM → machine),
    // not a command: re-applying positions there would clamp the user's
    // natural scrolling at progress=1 and starve the next-chapter sentinel.
    // Explicit in-chapter progress navigation must be applied here instead.
    if (
      this.mode === "scroll" &&
      target.progress !== undefined &&
      target.chapterIndex === this.state.position.chapterIndex
    ) {
      this.scrollController.scrollToProgress(this.state.position);
    }
  }

  nextPage(): void {
    if (this.mode !== "pagination" || this.state.status !== "ready") return;
    const { page, total } = this.state.presentation;
    if (total <= 0) return;
    if (page < total - 1) {
      this.seek({ chapterIndex: this.state.position.chapterIndex, page: page + 1 });
    } else {
      this.seek({ chapterIndex: this.state.position.chapterIndex + 1, page: 0 });
    }
  }

  prevPage(): void {
    if (this.mode !== "pagination" || this.state.status !== "ready") return;
    const { page } = this.state.presentation;
    if (page > 0) {
      this.seek({ chapterIndex: this.state.position.chapterIndex, page: page - 1 });
    } else {
      // page -1 = last page of the previous chapter (see machine SEEK).
      this.seek({ chapterIndex: this.state.position.chapterIndex - 1, page: -1 });
    }
  }

  retry(): void {
    this.dispatch({ type: "RETRY" });
  }

  goToChapter(chapterId: string, targetPage?: number): void {
    const idx = this.state.chapters.findIndex((c) => c.id === chapterId);
    if (idx < 0) return;
    this.seek(
      targetPage !== undefined ? { chapterIndex: idx, page: targetPage } : { chapterIndex: idx },
    );
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
    const filePath = hashIndex >= 0 ? href.substring(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

    const targetChapter = this.state.chapters.find(
      (c) =>
        c.href &&
        (c.href === filePath || c.href.endsWith(filePath) || c.href.endsWith("/" + filePath)),
    );

    const currentId = this.currentChapterId();

    if (!filePath) {
      if (anchor) {
        const el =
          this.iframeDoc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
          this.iframeDoc.querySelector(`[name="${CSS.escape(anchor)}"]`);
        if (el) this.navigateToAnchor(el);
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
      if (el) this.navigateToAnchor(el);
    }
  }

  /** Position the viewport at an anchor element using the active presentation. */
  private navigateToAnchor(el: Element): void {
    this.presentation.navigateToAnchor(el);
  }

  destroy(): void {
    super.destroy();
    if (this.clickHandlerRef) {
      this.iframeDoc.removeEventListener("click", this.clickHandlerRef);
    }
    this.pagedController.teardown();
    this.scrollController.teardown();
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();
    this.iframe.remove();
  }

  protected async runEffect(effect: ReaderEffect): Promise<void> {
    switch (effect.type) {
      case "POSITION_CHANGED":
        // Pagination applies the page as a CSS transform; scroll treats the
        // position as a DOM → machine report and intentionally does nothing.
        this.presentation.applyPosition(effect.presentation);
        break;
      default:
        // CONTENT_READY / MODE_CHANGED / READER_UNMOUNTED need no DOM side
        // effect here; the app observes them via onEffect.
        break;
    }
  }

  protected override async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    await this.loadChapter(bookId, chapterId);
  }

  private currentChapterId(): string | null {
    return this.state.chapters[this.state.position.chapterIndex]?.id ?? null;
  }

  private async processChapterContent(
    html: string,
    rawData: ArrayBuffer | undefined,
    bookId: string,
    chapterId: string,
  ): Promise<string> {
    let processed = html;

    if (this.extractResource && rawData) {
      const resolved = await resolveChapterResources(
        html,
        rawData,
        this.extractResource,
        this.resourceUrls,
      );
      if (resolved.resources.length > 0) {
        injectResources(this.iframeDoc, resolved.resources, this.injectedResources);
      }
      processed = resolved.html;
    }

    if (this.transformContent) {
      processed = await this.transformContent(processed, bookId, chapterId);
    }

    return processed;
  }

  private async loadChapter(bookId: string, chapterId: string): Promise<void> {
    this.presentation.beforeChapterLoad();
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();

    const signal = this.beginMainLoad();
    let result: { html: string | undefined; rawData?: ArrayBuffer } | undefined;
    try {
      result = await this.fetchChapter!(bookId, chapterId, signal);
    } catch {
      if (signal.aborted) return;
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Fetch failed" });
      return;
    }
    if (signal.aborted) return;
    const { html, rawData } = result;
    if (!html) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Content not found" });
      return;
    }

    const processed = await this.processChapterContent(html, rawData, bookId, chapterId);
    this.lastChapterHtml = processed;
    this.lastChapterId = chapterId;

    this.presentation.renderChapter(chapterId, processed);
  }

  private createIframe(): void {
    this.iframe = document.createElement("iframe");
    this.iframe.style.cssText = "width:100%;height:100%;border:none";
    this.container.appendChild(this.iframe);

    const doc = this.iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style id="base-style">${BASE_CSS}</style>
</head>
<body class="reader-content">
</body>
</html>`);
    doc.close();
    this.iframeDoc = doc;
  }

  private setupClickHandler(onClick: ((e: MouseEvent) => void) | undefined): void {
    this.clickHandlerRef = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      const link = target.closest("a[href]");
      if (link) {
        e.preventDefault();
        this.handleInternalLink(link.getAttribute("href")!);
        return;
      }

      if (isInteractiveElement(target)) return;
      onClick?.(e);
    };
    this.iframeDoc.addEventListener("click", this.clickHandlerRef);
  }
}
