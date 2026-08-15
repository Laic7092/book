import { type ReaderEffect, type Chapter, type Position } from "./machine";
import { Engine, type EngineOptions } from "./engine";
import { BASE_CSS } from "./styles";
import {
  resolveChapterResources,
  injectResources,
  clearResources,
  type ResourceInfo,
} from "./resources";
import { computeChapterScrollProgress } from "./scroll-progress";
import {
  computePageFromOffset,
  computeAnchorScrollTop,
  computePageCount,
  computeScrollTarget,
  hasScrolledAway,
  computePrependCompensation,
} from "./layout";

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
    initialPosition?: Partial<Position>,
    initialPage?: number,
  ): void {
    // The machine no longer knows the mode: the host applies its own
    // presentation before the content pipeline starts.
    this.mode = mode;
    this.iframeDoc.documentElement.dataset.mode = mode;
    if (mode === "scroll") this.setupScrollHandler();
    else this.teardownScrollHandler();
    super.init(bookId, chapters, chapterIndex, mode, initialPosition, initialPage);
  }

  /**
   * Switch presentation mode. The position is preserved (no reset — this
   * fixes the old SET_MODE behavior that dropped the reader's place).
   */
  override setMode(mode: "pagination" | "scroll"): void {
    const prev = this.mode;
    this.mode = mode;
    this.iframeDoc.documentElement.dataset.mode = mode;
    if (mode === "scroll") this.setupScrollHandler();
    else this.teardownScrollHandler();

    // A mode switch restructures the whole document; in-flight chained loads
    // would write into a DOM that is about to be replaced.
    if (prev !== mode) this.cancelAutoLoads();

    if (prev !== mode && this.lastChapterHtml && this.state.status === "ready") {
      this.restructureForMode(mode, this.lastChapterId);
      const chapterId = this.currentChapterId();
      if (chapterId) {
        if (mode === "pagination") {
          requestAnimationFrame(() => this.measureColumns(chapterId));
        } else {
          this.dispatch({ type: "MEASURED", chapterId, total: 0, mode: "scroll" });
        }
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
      this.scrollToProgress(this.state.position);
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

  /** Position the viewport at an anchor element in either mode. */
  private navigateToAnchor(el: Element): void {
    if (this.mode === "pagination") {
      const step = this.iframeDoc.documentElement.clientWidth;
      if (step > 0) {
        const page = computePageFromOffset(
          el.getBoundingClientRect().left,
          this.iframeDoc.body.getBoundingClientRect().left,
          step,
        );
        this.seek({ chapterIndex: this.state.position.chapterIndex, page });
      }
    } else {
      // Direct scroll — the scroll handler reports the new position.
      const top = computeAnchorScrollTop(
        el.getBoundingClientRect().top,
        this.iframeDoc.documentElement.scrollTop,
      );
      this.iframeDoc.documentElement.scrollTop = top;
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
      case "POSITION_CHANGED":
        if (effect.presentation.mode === "pagination") {
          this.iframeDoc.documentElement.style.setProperty(
            "--current-page",
            String(effect.presentation.page),
          );
        }
        // Scroll mode: the position is a report, not a command. Re-applying
        // it here would fight the user's scrolling (progress saturates at 1,
        // pinning the viewport bottom on the sentinel's edge so the next
        // chapter never auto-loads). Explicit navigations apply via seek().
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
    this.teardownScrollSentinels();
    this.teardownScrollCalibration();
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

    if (this.mode === "pagination") {
      this.iframeDoc.body.innerHTML = processed;
      this.dispatch({ type: "CHAPTER_LOADED", chapterId });

      const loadingChapterId = chapterId;
      requestAnimationFrame(() => {
        this.measureColumns(loadingChapterId);
        this.setupColumnObserver(loadingChapterId);
      });
      return;
    }

    // Scroll mode: start fresh with this chapter.
    this.loadedChapterIds.clear();
    this.loadedChapterIds.add(chapterId);
    this.iframeDoc.body.innerHTML = `<div class="scroll-chapter" data-chapter-id="${chapterId}">${processed}</div>`;
    this.iframeDoc.documentElement.scrollTop = 0;
    this.dispatch({ type: "CHAPTER_LOADED", chapterId });
    // Scroll mode has no column measurement; report readiness immediately.
    this.dispatch({ type: "MEASURED", chapterId, total: 0, mode: "scroll" });

    requestAnimationFrame(() => {
      void this.restoreScrollPosition().then(() => {
        this.syncScrollPosition();
        this.setupScrollSentinels();
        this.startScrollCalibration();
      });
    });
  }

  /**
   * Apply an in-chapter flow position to the scroll viewport: invert the
   * progress mapping (see scroll-progress.ts) against the current chapter's
   * wrapper. A no-op when the position already matches the DOM (reports from
   * the scroll handler round-trip exactly).
   */
  private scrollToProgress(position: Position): void {
    if (this.state.status !== "ready") return;
    const chapterId = this.currentChapterId();
    if (!chapterId) return;
    const wrapper = this.iframeDoc.querySelector<HTMLElement>(
      `[data-chapter-id="${CSS.escape(chapterId)}"]`,
    );
    if (!wrapper) return;
    const html = this.iframeDoc.documentElement;
    const max = wrapper.scrollHeight - html.clientHeight;
    if (max <= 0) return;
    const offset = wrapper.getBoundingClientRect().top + html.scrollTop;
    html.scrollTop = computeScrollTarget(position.progress, max, offset);
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
    if (this.state.status !== "ready") return;

    const doc = this.iframeDoc;
    const html = doc.documentElement;
    const scrollTop = html.scrollTop || 0;
    const clientHeight = html.clientHeight || 0;

    const { chapterId, progress, anchor } = computeChapterScrollProgress(
      doc.body.querySelectorAll<HTMLElement>("[data-chapter-id]"),
      scrollTop,
      clientHeight,
      html.scrollHeight || 0,
    );

    const chapterIndex =
      chapterId !== undefined
        ? this.state.chapters.findIndex((c) => c.id === chapterId)
        : this.state.position.chapterIndex;

    this.dispatch({
      type: "POSITION_REPORT",
      chapterIndex: chapterIndex >= 0 ? chapterIndex : this.state.position.chapterIndex,
      progress,
      anchor,
    });

    // At the very top: bring the previous chapter in so it is reachable by
    // scrolling up. After loadChapter the doc starts at scrollTop 0, so this
    // also chains the previous chapter onto a freshly opened one.
    if (scrollTop <= 0) {
      let minIdx = Infinity;
      for (const id of this.loadedChapterIds) {
        const i = this.state.chapters.findIndex((c) => c.id === id);
        if (i >= 0 && i < minIdx) minIdx = i;
      }
      if (minIdx > 0) void this.autoLoadChapter("prev");
    }
  }

  /** Dispatch current scroll position after content load. */
  private syncScrollPosition(): void {
    this.handleScroll();
  }

  /** Restore scroll position after content load in scroll mode. */
  private async restoreScrollPosition(): Promise<void> {
    if (this.mode !== "scroll") return;
    const doc = this.iframeDoc;
    const html = doc.documentElement;
    // Restore against the saved anchor (viewport-top offset inside the
    // chapter, over the chapter's own height — see scroll-progress.ts). A
    // chapter whose first block (e.g. h1) carries a top margin collapses it
    // through the wrapper into the document: the wrapper sits `offset` px
    // below the document top, and that offset is counted in html.scrollHeight
    // but not in wrapper.scrollHeight. Restoring against html dimensions alone
    // would lose `offset * (1 - anchor)` on every re-entry, so the in-chapter
    // anchor drifts upward.
    const wrapper = doc.body.querySelector<HTMLElement>("[data-chapter-id]");
    if (!wrapper) return;
    // Document coordinate: viewport top + scrollTop. Reading rect.top alone is
    // only valid at scrollTop 0 — restoreScrollPosition can run again after
    // the first restore (setMode → restructureForMode), by which time the
    // wrapper top is far above the viewport and rect.top is negative.
    const offset = wrapper.getBoundingClientRect().top + html.scrollTop;

    const anchor = this.state.position.anchor;
    if (anchor === undefined || anchor <= 0) return;

    // The saved viewport-top may lie beyond the single-chapter document (the
    // viewport bottom edge needs the next chapter). Append chapters until the
    // position is actually reachable, then set scrollTop once — no observer
    // round-trips, no intermediate clamps.
    for (let guard = 0; guard < 32; guard++) {
      const maxScroll = wrapper.scrollHeight;
      if (maxScroll <= 0) return;
      html.scrollTop = computeScrollTarget(anchor, maxScroll, offset);
      this.lastCalibratedTop = html.scrollTop;
      // Position reachable: viewport bottom sits inside the document.
      if (html.scrollTop < html.scrollHeight - html.clientHeight - 1) return;
      if (!this.hasMoreChapters("next")) return;
      const before = this.loadedChapterIds.size;
      await this.autoLoadChapter("next");
      if (this.loadedChapterIds.size === before) return; // nothing appended
    }
  }

  private hasMoreChapters(dir: "prev" | "next"): boolean {
    const chapters = this.state.chapters;
    let idx = -1;
    for (const id of this.loadedChapterIds) {
      const i = chapters.findIndex((c) => c.id === id);
      if (i < 0) continue;
      if (dir === "next" && i > idx) idx = i;
      if (dir === "prev" && (idx < 0 || i < idx)) idx = i;
    }
    const target = dir === "next" ? idx + 1 : idx - 1;
    return target >= 0 && target < chapters.length;
  }

  /**
   * Re-apply the restored in-chapter progress while the content settles.
   * At restore time fonts, images and the settings CSS may not have applied
   * yet, so the measured height differs from what was saved. A ResizeObserver
   * on the body catches those height changes; as long as the user has not
   * scrolled away from the restored position, recompute scrollTop from the
   * saved anchor. The first user scroll stops the calibration.
   */
  private startScrollCalibration(): void {
    this.teardownScrollCalibration();
    if (this.mode !== "scroll") return;
    const anchor = this.state.position.anchor;
    if (anchor === undefined || anchor <= 0) return;
    this.calibrationObserver = new ResizeObserver(() => {
      if (this.mode !== "scroll" || this.state.status !== "ready") return;
      const html = this.iframeDoc.documentElement;
      const wrapper = this.iframeDoc.body.querySelector<HTMLElement>("[data-chapter-id]");
      if (!wrapper) return;
      // Same document-coordinate offset as restoreScrollPosition: the wrapper
      // is usually scrolled above the viewport by the time this fires, so
      // rect.top alone would be negative and collapse the target to ~0.
      const offset = wrapper.getBoundingClientRect().top + html.scrollTop;
      const max = wrapper.scrollHeight;
      if (max <= 0) return;
      // User has scrolled away from the restored position → stop calibrating.
      if (hasScrolledAway(html.scrollTop, this.lastCalibratedTop)) {
        this.teardownScrollCalibration();
        return;
      }
      const target = computeScrollTarget(this.state.position.anchor ?? 0, max, offset);
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
    const total = computePageCount(doc.body.scrollWidth, doc.documentElement.clientWidth);
    this.dispatch({ type: "MEASURED", chapterId, total, mode: this.mode });
  }

  private setupColumnObserver(chapterId: string): void {
    this.teardownColumnObserver();
    if (this.mode !== "pagination") return;
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

  private restructureForMode(mode: "pagination" | "scroll", chapterId: string): void {
    if (mode === "scroll") {
      this.loadedChapterIds.clear();
      this.loadedChapterIds.add(chapterId);
      this.iframeDoc.body.innerHTML = `<div class="scroll-chapter" data-chapter-id="${chapterId}">${this.lastChapterHtml}</div>`;
      this.iframeDoc.documentElement.scrollTop = 0;
      requestAnimationFrame(() => {
        // The position survives the mode switch — reapply it.
        this.scrollToProgress(this.state.position);
        this.syncScrollPosition();
        this.setupScrollSentinels();
        this.startScrollCalibration();
      });
    } else {
      this.teardownScrollSentinels();
      this.teardownScrollCalibration();
      this.iframeDoc.body.innerHTML = this.lastChapterHtml;
      requestAnimationFrame(() => {
        this.measureColumns(chapterId);
        this.setupColumnObserver(chapterId);
      });
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

  private async autoLoadChapter(dir: "prev" | "next"): Promise<void> {
    if (this.autoLoading) return;
    // A main chapter load (SEEK/INIT/RETRY) is in flight: loadChapter replaces
    // the whole body, so a queued sentinel callback must not touch the DOM or
    // abort it — aborting would strand the machine in "loading" (black
    // screen, dead scroll). The sentinel re-arms after the load settles.
    if (this.state.status === "loading") return;
    if (this.mode !== "scroll") return;
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

      const signal = this.nextAutoLoadSignal();
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
        this.iframeDoc.documentElement.scrollTop = computePrependCompensation(
          prevHeight,
          this.iframeDoc.body.scrollHeight,
          this.iframeDoc.documentElement.scrollTop,
        );
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
