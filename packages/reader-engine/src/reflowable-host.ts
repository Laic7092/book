import { type ReaderEffect, type Chapter } from "@book/reader-core";
import { getParserForFormat } from "@book/parser-core";
import { Engine, type EngineOptions } from "./engine";
import { BASE_CSS, PAGINATION_CSS } from "./styles";
import {
  resolveChapterResources,
  injectResources,
  clearResources,
  type ResourceInfo,
} from "./resources";
import { computeChapterScrollProgress } from "./scroll-progress";

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
  private scrollHandlerRef: ((e: Event) => void) | null = null;
  private rafId: number | null = null;
  private transformContent: ReflowableHostOptions["transformContent"];
  private bookFormat = "";
  private resourceUrls = new Map<string, string>();
  private injectedResources = new Map<string, ResourceInfo>();
  private scrollObserver: IntersectionObserver | null = null;
  private sentinelSeen = new WeakMap<Element, true>();
  private loadedChapterIds = new Set<string>();
  private autoLoading = false;
  private columnObserver: ResizeObserver | null = null;
  private calibrationObserver: ResizeObserver | null = null;
  private lastCalibratedTop = 0;
  private lastChapterHtml = "";
  private lastChapterId = "";

  constructor(options: ReflowableHostOptions) {
    super(options);
    this.container = options.container;
    this.navigateToCfi = options.navigateToCfi;
    this.transformContent = options.transformContent;
    this.createIframe();
    this.setupClickHandler(options.onClick);
  }

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

  retry(): void {
    this.dispatch({ type: "RETRY" });
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
    const filePath = hashIndex >= 0 ? href.substring(0, hashIndex) : href;
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
            const top = el.getBoundingClientRect().top + this.iframeDoc.documentElement.scrollTop;
            this.iframeDoc.documentElement.scrollTop = top;
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
          const top = el.getBoundingClientRect().top + this.iframeDoc.documentElement.scrollTop;
          this.iframeDoc.documentElement.scrollTop = top;
        }
      }
    }
  }

  destroy(): void {
    super.destroy();
    if (this.clickHandlerRef) {
      this.iframeDoc.removeEventListener("click", this.clickHandlerRef);
    }
    this.teardownScrollHandler();
    this.teardownScrollSentinels();
    this.teardownColumnObserver();
    this.teardownScrollCalibration();
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();
    this.iframe.remove();
  }

  protected async runEffect(effect: ReaderEffect): Promise<void> {
    switch (effect.type) {
      case "PAGE_POSITION_CHANGED":
        this.iframeDoc.documentElement.style.setProperty("--current-page", String(effect.page));
        break;
      case "MODE_CHANGED":
        // Only rebuild when switching modes on already-rendered content
        // (SET_MODE mid-session). A fresh iframe has no data-mode yet (the
        // createIframe default was removed), so an INIT-driven MODE_CHANGED
        // just sets the attribute and the scroll handler — the content was
        // built in the right mode by loadChapter and must not be rebuilt.
        {
          const prev = this.iframeDoc.documentElement.dataset.mode;
          this.iframeDoc.documentElement.dataset.mode = effect.mode;
          if (this.lastChapterHtml && prev && prev !== effect.mode) {
            this.restructureForMode(effect.mode, this.lastChapterId);
          }
        }
        if (effect.mode === "scroll") {
          this.setupScrollHandler();
        } else {
          this.teardownScrollHandler();
        }
        break;
      default:
        await this.runGenericEffect(effect);
    }
  }

  protected override async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    await this.loadChapter(bookId, chapterId);
  }

  private async processChapterContent(
    html: string,
    rawData: ArrayBuffer | undefined,
    bookId: string,
    chapterId: string,
  ): Promise<string> {
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

    return processed;
  }

  private async loadChapter(bookId: string, chapterId: string): Promise<void> {
    this.teardownScrollSentinels();
    this.teardownScrollCalibration();
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();

    const signal = this.nextFetchSignal();
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

    if (this.state.mode === "pagination") {
      this.iframeDoc.body.innerHTML = processed;
      this.dispatch({ type: "CHAPTER_LOADED", chapterId });

      const loadingChapterId = chapterId;
      requestAnimationFrame(() => {
        this.measureColumns(loadingChapterId);
        this.setupColumnObserver(loadingChapterId);
      });
      return;
    }

    // Scroll mode: start fresh with this chapter
    this.loadedChapterIds.clear();
    this.loadedChapterIds.add(chapterId);
    this.iframeDoc.body.innerHTML = `<div class="scroll-chapter" data-chapter-id="${chapterId}">${processed}</div>`;
    this.iframeDoc.documentElement.scrollTop = 0;
    this.dispatch({ type: "CHAPTER_LOADED", chapterId });

    requestAnimationFrame(() => {
      this.restoreScrollPosition();
      this.syncScrollPosition();
      this.setupScrollSentinels();
      this.startScrollCalibration();
    });
  }

  private setupScrollHandler(): void {
    if (this.scrollHandlerRef) return;
    this.scrollHandlerRef = () => {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.handleScroll();
      });
    };
    this.iframeDoc.defaultView?.addEventListener("scroll", this.scrollHandlerRef, {
      passive: true,
    });
  }

  private teardownScrollHandler(): void {
    if (this.scrollHandlerRef) {
      this.iframeDoc.defaultView?.removeEventListener("scroll", this.scrollHandlerRef);
      this.scrollHandlerRef = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private handleScroll(): void {
    // Guard first: progress computation depends on scroll-mode DOM ([data-chapter-id]),
    // and the pagination branch must not pay for it either.
    if (this.state.mode !== "scroll" || this.state.status !== "ready") return;

    const doc = this.iframeDoc;
    const html = doc.documentElement;
    const scrollTop = html.scrollTop || 0;
    const clientHeight = html.clientHeight || 0;

    const { chapterId, progress } = computeChapterScrollProgress(
      doc.body.querySelectorAll<HTMLElement>("[data-chapter-id]"),
      scrollTop,
      clientHeight,
      html.scrollHeight || 0,
    );

    this.dispatch({ type: "SCROLL_PROGRESS", bookProgress: progress });

    // Notify machine when visible chapter changes (without triggering a fetch)
    if (chapterId) {
      const currentId = this.state.chapters[this.state.currentChapterIndex]?.id;
      if (chapterId !== currentId) {
        this.dispatch({ type: "SET_CURRENT_CHAPTER", chapterId });
      }
    }

    // At the very top: bring the previous chapter in so it is reachable by
    // scrolling up. After loadChapter the doc starts at scrollTop 0, so this
    // also chains the previous chapter onto a freshly opened one. autoLoading
    // and the loadedChapterIds min-index check guard against duplicate work.
    if (scrollTop <= 0) {
      let minIdx = Infinity;
      for (const id of this.loadedChapterIds) {
        const i = this.state.chapters.findIndex((c) => c.id === id);
        if (i >= 0 && i < minIdx) minIdx = i;
      }
      if (minIdx > 0) void this.autoLoadChapter("prev");
    }
  }

  /** Dispatch current scroll position after content load */
  private syncScrollPosition(): void {
    this.handleScroll();
  }

  /** Restore scroll position after content load in scroll mode */
  private restoreScrollPosition(): void {
    if (this.state.mode !== "scroll") return;
    const progress = this.state.scrollProgress;
    if (progress <= 0) return;
    const doc = this.iframeDoc;
    const html = doc.documentElement;
    // Keep the same coordinate system as computeChapterScrollProgress:
    // in-chapter scrollTop is -rect.top and the denominator is
    // wrapper.scrollHeight - clientHeight. A chapter whose first block (e.g.
    // h1) carries a top margin collapses it through the wrapper into the
    // document: the wrapper sits `offset` px below the document top, and that
    // offset is counted in html.scrollHeight but not in wrapper.scrollHeight.
    // Restoring against html dimensions alone would lose
    // `offset * (1 - progress)` on every re-entry, so the in-chapter anchor
    // drifts upward.
    const wrapper = doc.body.querySelector<HTMLElement>("[data-chapter-id]");
    if (!wrapper) return;
    // Document coordinate: viewport top + scrollTop. Reading rect.top alone is
    // only valid at scrollTop 0 — restoreScrollPosition can run again after
    // the first restore (MODE_CHANGED → restructureForMode), by which time the
    // wrapper top is far above the viewport and rect.top is negative.
    const offset = wrapper.getBoundingClientRect().top + html.scrollTop;
    const maxScroll = wrapper.scrollHeight - html.clientHeight;
    if (maxScroll > 0) {
      html.scrollTop = progress * maxScroll + offset;
      this.lastCalibratedTop = html.scrollTop;
    }
  }

  /**
   * Re-apply the restored in-chapter progress while the content settles.
   * At restore time fonts, images and the settings CSS may not have applied
   * yet, so the measured height differs from what was saved. A ResizeObserver
   * on the body catches those height changes; as long as the user has not
   * scrolled away from the restored position, recompute scrollTop from the
   * saved progress. The first user scroll stops the calibration.
   */
  private startScrollCalibration(): void {
    this.teardownScrollCalibration();
    if (this.state.mode !== "scroll") return;
    const progress = this.state.scrollProgress;
    if (progress <= 0) return;
    this.calibrationObserver = new ResizeObserver(() => {
      if (this.state.mode !== "scroll" || this.state.status !== "ready") return;
      const html = this.iframeDoc.documentElement;
      const wrapper = this.iframeDoc.body.querySelector<HTMLElement>("[data-chapter-id]");
      if (!wrapper) return;
      // Same document-coordinate offset as restoreScrollPosition: the wrapper
      // is usually scrolled above the viewport by the time this fires, so
      // rect.top alone would be negative and collapse the target to ~0.
      const offset = wrapper.getBoundingClientRect().top + html.scrollTop;
      const max = wrapper.scrollHeight - html.clientHeight;
      if (max <= 0) return;
      // User has scrolled away from the restored position → stop calibrating.
      if (Math.abs(html.scrollTop - this.lastCalibratedTop) > 1) {
        this.teardownScrollCalibration();
        return;
      }
      const target = this.state.scrollProgress * max + offset;
      html.scrollTop = target;
      this.lastCalibratedTop = target;
    });
    this.calibrationObserver.observe(this.iframeDoc.body);
  }

  private teardownScrollCalibration(): void {
    if (this.calibrationObserver) {
      this.calibrationObserver.disconnect();
      this.calibrationObserver = null;
    }
  }

  private measureColumns(chapterId: string): void {
    const doc = this.iframeDoc;
    if (!doc?.body) return;
    const contentWidth = doc.body.scrollWidth;
    const iframeWidth = doc.documentElement.clientWidth;
    const step = Math.max(iframeWidth, 1);
    const total = Math.max(1, Math.ceil(contentWidth / step));
    this.dispatch({ type: "PAGE_COUNT_UPDATED", chapterId, total });
  }

  private setupColumnObserver(chapterId: string): void {
    this.teardownColumnObserver();
    if (this.state.mode !== "pagination") return;
    this.columnObserver = new ResizeObserver(() => {
      this.measureColumns(chapterId);
    });
    this.columnObserver.observe(this.iframeDoc.body);
  }

  private teardownColumnObserver(): void {
    if (this.columnObserver) {
      this.columnObserver.disconnect();
      this.columnObserver = null;
    }
  }

  private restructureForMode(mode: "paginated" | "scroll", chapterId: string): void {
    if (mode === "scroll") {
      this.loadedChapterIds.clear();
      this.loadedChapterIds.add(chapterId);
      this.iframeDoc.body.innerHTML = `<div class="scroll-chapter" data-chapter-id="${chapterId}">${this.lastChapterHtml}</div>`;
      this.iframeDoc.documentElement.scrollTop = 0;
      if (this.state.status === "ready") {
        requestAnimationFrame(() => {
          this.restoreScrollPosition();
          this.syncScrollPosition();
          this.setupScrollSentinels();
          this.startScrollCalibration();
        });
      }
    } else {
      this.teardownScrollSentinels();
      this.teardownScrollCalibration();
      this.iframeDoc.body.innerHTML = this.lastChapterHtml;
      if (this.state.status === "ready") {
        requestAnimationFrame(() => {
          this.measureColumns(chapterId);
          this.setupColumnObserver(chapterId);
        });
      } else {
        this.dispatch({ type: "CHAPTER_LOADED", chapterId });
        requestAnimationFrame(() => {
          this.measureColumns(chapterId);
          this.setupColumnObserver(chapterId);
        });
      }
    }
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

  private async autoLoadChapter(dir: "prev" | "next"): Promise<void> {
    if (this.autoLoading) return;
    this.autoLoading = true;

    try {
      const chapters = this.state.chapters;
      let targetIdx = -1;
      for (const id of this.loadedChapterIds) {
        const i = chapters.findIndex((c) => c.id === id);
        if (i < 0) continue;
        if (dir === "next" && i > targetIdx) targetIdx = i;
        if (dir === "prev" && (targetIdx < 0 || i < targetIdx)) targetIdx = i;
      }
      targetIdx = dir === "next" ? targetIdx + 1 : targetIdx - 1;
      if (targetIdx < 0 || targetIdx >= chapters.length) return;

      const chapter = chapters[targetIdx];
      if (this.loadedChapterIds.has(chapter.id)) return;

      const signal = this.nextFetchSignal();
      let result: { html: string | undefined; rawData?: ArrayBuffer } | undefined;
      try {
        result = await this.fetchChapter!(this.state.bookId, chapter.id, signal);
      } catch {
        return;
      }
      if (signal.aborted || !result?.html) return;

      const processed = await this.processChapterContent(
        result.html,
        result.rawData,
        this.state.bookId,
        chapter.id,
      );

      const wrapper = this.iframeDoc.createElement("div");
      wrapper.className = "scroll-chapter";
      wrapper.dataset.chapterId = chapter.id;
      wrapper.innerHTML = processed;

      if (dir === "next") {
        this.iframeDoc.body.append(wrapper);
      } else {
        const prevHeight = this.iframeDoc.body.scrollHeight;
        this.iframeDoc.body.prepend(wrapper);
        this.iframeDoc.documentElement.scrollTop += this.iframeDoc.body.scrollHeight - prevHeight;
      }

      this.loadedChapterIds.add(chapter.id);
    } finally {
      this.autoLoading = false;
      this.setupScrollSentinels();
    }
  }

  private setupScrollSentinels(): void {
    this.teardownScrollSentinels();

    const chapters = this.state.chapters;
    if (!this.loadedChapterIds.size) return;

    let maxIdx = -Infinity;
    for (const id of this.loadedChapterIds) {
      const i = chapters.findIndex((c) => c.id === id);
      if (i >= 0 && i > maxIdx) maxIdx = i;
    }

    if (maxIdx >= chapters.length - 1) return;

    const el = this.iframeDoc.createElement("div");
    el.dataset.dir = "next";
    el.style.cssText = "height:1px;width:1px;opacity:0;pointer-events:none;";
    this.iframeDoc.body.append(el);

    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (this.sentinelSeen.has(entry.target)) {
            if (entry.isIntersecting) {
              void this.autoLoadChapter("next");
            }
          } else {
            this.sentinelSeen.set(entry.target, true);
          }
        }
      },
      { threshold: 0 },
    );

    this.scrollObserver.observe(el);
  }

  private teardownScrollSentinels(): void {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    this.iframeDoc.querySelectorAll("[data-dir]").forEach((el) => el.remove());
  }
}
