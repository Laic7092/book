import { type ReaderAction, type ReaderState, type Position, type Presentation } from "./machine";
import { computeChapterScrollProgress } from "./scroll-progress";
import {
  computeScrollTarget,
  computeAnchorScrollTop,
  hasScrolledAway,
  computePrependCompensation,
} from "./layout";
import { type ReflowablePresentation } from "./presentation";

/**
 * Scroll-mode presentation controller.
 *
 * Keeps every scroll-only DOM concern out of ReflowableHost: scroll event
 * throttling, chapter wrappers, sentinels for adjacent chapter auto-loading,
 * scroll restoration and post-restore calibration.
 *
 * The host still owns the iframe, resource pipeline and pagination; this
 * controller is only active when the reader is in "scroll" mode.
 */
export interface ScrollControllerHost {
  readonly doc: Document;
  readonly getState: () => ReaderState;
  readonly getMode: () => "pagination" | "scroll";
  readonly getBookId: () => string;
  dispatch(action: ReaderAction): void;
  processChapterContent(
    html: string,
    rawData: ArrayBuffer | undefined,
    bookId: string,
    chapterId: string,
  ): Promise<string>;
  fetchChapter(
    bookId: string,
    chapterId: string,
    signal?: AbortSignal,
  ): Promise<{ html: string | undefined; rawData?: ArrayBuffer } | undefined>;
  nextAutoLoadSignal(): AbortSignal;
}

export class ScrollController implements ReflowablePresentation {
  readonly mode = "scroll" as const;
  private scrollHandlerRef: ((e: Event) => void) | null = null;
  private rafId: number | null = null;
  private scrollObserver: IntersectionObserver | null = null;
  private sentinelSeen = new WeakMap<Element, true>();
  private loadedChapterIds = new Set<string>();
  private autoLoading = false;
  private calibrationObserver: ResizeObserver | null = null;
  private lastCalibratedTop = 0;

  private host: ScrollControllerHost;

  constructor(host: ScrollControllerHost) {
    this.host = host;
  }

  /** Attach the scroll listener; called when the host enters scroll mode. */
  start(): void {
    if (this.scrollHandlerRef) return;
    this.scrollHandlerRef = () => {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.handleScroll();
      });
    };
    this.host.doc.defaultView?.addEventListener("scroll", this.scrollHandlerRef, {
      passive: true,
    });
  }

  /** Detach the scroll listener. */
  stop(): void {
    if (this.scrollHandlerRef) {
      this.host.doc.defaultView?.removeEventListener("scroll", this.scrollHandlerRef);
      this.scrollHandlerRef = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Scroll positions are reported from the DOM, not applied from the machine. */
  applyPosition(_presentation: Presentation): void {
    // POSITION_CHANGED is a report channel in scroll mode, not a command.
    // Re-applying it would fight the user's scrolling (progress saturates at
    // 1, pinning the viewport bottom on the sentinel's edge so the next
    // chapter never auto-loads). Explicit navigation goes through seek().
  }

  /** Position the viewport at an anchor element by direct scroll. */
  navigateToAnchor(el: Element): void {
    const top = computeAnchorScrollTop(
      el.getBoundingClientRect().top,
      this.host.doc.documentElement.scrollTop,
    );
    this.host.doc.documentElement.scrollTop = top;
  }

  /** Remove all scroll-only observers and listeners. */
  teardown(): void {
    this.stop();
    this.teardownScrollSentinels();
    this.teardownScrollCalibration();
  }

  /**
   * Prepare for a new main chapter load. Old scroll observers must not fire
   * while the async fetch is in flight and the body is about to be replaced.
   */
  beforeChapterLoad(): void {
    this.teardownScrollSentinels();
    this.teardownScrollCalibration();
  }

  /** Start scroll mode with a fresh single chapter. */
  renderChapter(chapterId: string, html: string): void {
    this.loadedChapterIds.clear();
    this.loadedChapterIds.add(chapterId);
    this.host.doc.body.innerHTML = `<div class="scroll-chapter" data-chapter-id="${chapterId}">${html}</div>`;
    this.host.doc.documentElement.scrollTop = 0;
    this.host.dispatch({ type: "CHAPTER_LOADED", chapterId });
    // Scroll mode has no column measurement; report readiness immediately.
    this.host.dispatch({ type: "MEASURED", chapterId, total: 0, mode: "scroll" });

    requestAnimationFrame(() => {
      void this.restoreScrollPosition().then(() => {
        this.syncScrollPosition();
        this.setupScrollSentinels();
        this.startScrollCalibration();
      });
    });
  }

  /** Rebuild scroll DOM during a mode switch, preserving the machine position. */
  restructure(chapterId: string, html: string): void {
    this.loadedChapterIds.clear();
    this.loadedChapterIds.add(chapterId);
    this.host.doc.body.innerHTML = `<div class="scroll-chapter" data-chapter-id="${chapterId}">${html}</div>`;
    this.host.doc.documentElement.scrollTop = 0;
    requestAnimationFrame(() => {
      // The position survives the mode switch — reapply it.
      this.scrollToProgress(this.host.getState().position);
      this.syncScrollPosition();
      this.setupScrollSentinels();
      this.startScrollCalibration();
    });
  }

  /**
   * Apply an in-chapter flow position to the scroll viewport: invert the
   * progress mapping (see scroll-progress.ts) against the current chapter's
   * wrapper. A no-op when the position already matches the DOM (reports from
   * the scroll handler round-trip exactly).
   */
  scrollToProgress(position: Position): void {
    if (this.host.getState().status !== "ready") return;
    const chapterId = this.currentChapterId();
    if (!chapterId) return;
    const wrapper = this.host.doc.querySelector<HTMLElement>(
      `[data-chapter-id="${CSS.escape(chapterId)}"]`,
    );
    if (!wrapper) return;
    const html = this.host.doc.documentElement;
    const max = wrapper.scrollHeight - html.clientHeight;
    if (max <= 0) return;
    const offset = wrapper.getBoundingClientRect().top + html.scrollTop;
    html.scrollTop = computeScrollTarget(position.progress, max, offset);
  }

  /** Dispatch current scroll position after content load. */
  syncScrollPosition(): void {
    this.handleScroll();
  }

  /** Restore scroll position after content load in scroll mode. */
  private async restoreScrollPosition(): Promise<void> {
    const doc = this.host.doc;
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
    // the first restore (setMode → restructure), by which time the
    // wrapper top is far above the viewport and rect.top is negative.
    const offset = wrapper.getBoundingClientRect().top + html.scrollTop;

    const anchor = this.host.getState().position.anchor;
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
    const chapters = this.host.getState().chapters;
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
    const anchor = this.host.getState().position.anchor;
    if (anchor === undefined || anchor <= 0) return;
    this.calibrationObserver = new ResizeObserver(() => {
      const state = this.host.getState();
      if (this.host.getMode() !== "scroll" || state.status !== "ready") return;
      const html = this.host.doc.documentElement;
      const wrapper = this.host.doc.body.querySelector<HTMLElement>("[data-chapter-id]");
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
      const target = computeScrollTarget(state.position.anchor ?? 0, max, offset);
      html.scrollTop = target;
      this.lastCalibratedTop = target;
    });
    this.calibrationObserver.observe(this.host.doc.body);
  }

  private teardownScrollCalibration(): void {
    if (this.calibrationObserver) {
      this.calibrationObserver.disconnect();
      this.calibrationObserver = null;
    }
  }

  private currentChapterId(): string | null {
    return this.host.getState().chapters[this.host.getState().position.chapterIndex]?.id ?? null;
  }

  private handleScroll(): void {
    const state = this.host.getState();
    if (state.status !== "ready") return;

    const doc = this.host.doc;
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
        ? state.chapters.findIndex((c) => c.id === chapterId)
        : state.position.chapterIndex;

    this.host.dispatch({
      type: "POSITION_REPORT",
      chapterIndex: chapterIndex >= 0 ? chapterIndex : state.position.chapterIndex,
      progress,
      anchor,
    });

    // At the very top: bring the previous chapter in so it is reachable by
    // scrolling up. After renderChapter the doc starts at scrollTop 0, so
    // this also chains the previous chapter onto a freshly opened one.
    if (scrollTop <= 0) {
      let minIdx = Infinity;
      for (const id of this.loadedChapterIds) {
        const i = state.chapters.findIndex((c) => c.id === id);
        if (i >= 0 && i < minIdx) minIdx = i;
      }
      if (minIdx > 0) void this.autoLoadChapter("prev");
    }
  }

  private async autoLoadChapter(dir: "prev" | "next"): Promise<void> {
    if (this.autoLoading) return;
    // A main chapter load (SEEK/INIT/RETRY) is in flight: renderChapter
    // replaces the whole body, so a queued sentinel callback must not touch
    // the DOM or abort it — aborting would strand the machine in "loading"
    // (black screen, dead scroll). The sentinel re-arms after the load settles.
    if (this.host.getState().status === "loading") return;
    if (this.host.getMode() !== "scroll") return;
    this.autoLoading = true;

    try {
      const state = this.host.getState();
      const chapters = state.chapters;
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

      const signal = this.host.nextAutoLoadSignal();
      let result: { html: string | undefined; rawData?: ArrayBuffer } | undefined;
      try {
        result = await this.host.fetchChapter(this.host.getBookId(), chapter.id, signal);
      } catch {
        return;
      }
      if (signal.aborted || !result?.html) return;

      const processed = await this.host.processChapterContent(
        result.html,
        result.rawData,
        this.host.getBookId(),
        chapter.id,
      );

      const wrapper = this.host.doc.createElement("div");
      wrapper.className = "scroll-chapter";
      wrapper.dataset.chapterId = chapter.id;
      wrapper.innerHTML = processed;

      if (dir === "next") {
        this.host.doc.body.append(wrapper);
      } else {
        const prevHeight = this.host.doc.body.scrollHeight;
        this.host.doc.body.prepend(wrapper);
        this.host.doc.documentElement.scrollTop = computePrependCompensation(
          prevHeight,
          this.host.doc.body.scrollHeight,
          this.host.doc.documentElement.scrollTop,
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

    const state = this.host.getState();
    const chapters = state.chapters;
    if (!this.loadedChapterIds.size) return;

    let maxIdx = -Infinity;
    for (const id of this.loadedChapterIds) {
      const i = chapters.findIndex((c) => c.id === id);
      if (i >= 0 && i > maxIdx) maxIdx = i;
    }

    if (maxIdx >= chapters.length - 1) return;

    const el = this.host.doc.createElement("div");
    el.dataset.dir = "next";
    el.style.cssText = "height:1px;width:1px;opacity:0;pointer-events:none;";
    this.host.doc.body.append(el);

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
    this.host.doc.querySelectorAll("[data-dir]").forEach((el) => el.remove());
  }
}
