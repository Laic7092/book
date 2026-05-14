import { type ReaderEffect, type Chapter } from "@book/reader-core";
import { BaseHost, type BaseHostOptions } from "./base-host";
import { type FixedLayoutSurface } from "./fixed-surface";

export interface FixedHostOptions extends BaseHostOptions {
  surface: FixedLayoutSurface;
}

/**
 * Fixed-layout reader host — drives PDF, CBZ, and other single-page-per-view
 * formats via a pluggable rendering surface.
 *
 * The state machine handles chapter-level navigation while sub-page management
 * (PDF internal pages, CBZ images) is delegated to the surface.
 */
export class FixedHost extends BaseHost {
  private surface: FixedLayoutSurface;

  constructor(options: FixedHostOptions) {
    super(options);
    this.surface = options.surface;
  }

  // ── Public API ──

  init(
    bookId: string,
    chapters: Chapter[],
    chapterIndex = 0,
    _mode?: "pagination" | "scroll",
    initialPage?: Partial<{
      current: number;
      total: number;
      pendingTarget: number | null;
    }>,
    initialScroll?: Partial<{ progress: number }>,
  ): void {
    // Fixed-layout always uses pagination — scroll mode is not applicable.
    super.init(bookId, chapters, chapterIndex, "pagination", initialPage, initialScroll);
  }

  nextPage(): void {
    if (this.surface.getCurrentPage() < this.surface.getPageCount() - 1) {
      this.surface.goToPage(this.surface.getCurrentPage() + 1);
    } else {
      this.dispatch({ type: "NEXT_PAGE" });
    }
  }

  prevPage(): void {
    if (this.surface.getCurrentPage() > 0) {
      this.surface.goToPage(this.surface.getCurrentPage() - 1);
    } else {
      this.dispatch({ type: "PREV_PAGE" });
    }
  }

  goToChapter(chapterId: string, targetPage?: number): void {
    this.dispatch({ type: "GO_TO_CHAPTER", chapterId, targetPage });
  }

  zoomIn(): void {
    this.surface.zoomIn();
  }

  zoomOut(): void {
    this.surface.zoomOut();
  }

  zoomFit(): void {
    this.surface.zoomFit();
  }

  zoomWidth(): void {
    this.surface.zoomWidth();
  }

  rotate(degrees: number): void {
    this.surface.rotate(degrees);
  }

  getDocument(): Document | null {
    return null;
  }

  getSurface(): FixedLayoutSurface {
    return this.surface;
  }

  destroy(): void {
    super.destroy();
    this.surface.destroy();
  }

  // ── Protected: effect handling ──

  protected async runEffect(effect: ReaderEffect): Promise<void> {
    await this.runGenericEffect(effect);
  }

  // ── Chapter fetching with surface integration ──

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    const { html, rawData } = await this.fetchChapter!(bookId, chapterId);

    const chapter = this.state.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Chapter not found" });
      return;
    }

    this.dispatch({ type: "CHAPTER_LOADED", chapterId, html: html ?? "" });

    if (rawData && chapter.href) {
      try {
        await this.surface.loadChapter(chapter.href, rawData);
      } catch {
        this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Failed to render chapter" });
        return;
      }
    }

    // Report page count now that the surface has loaded the chapter.
    const pageCount = this.surface.getPageCount();
    if (pageCount > 0) {
      this.dispatch({ type: "PAGE_COUNT_UPDATED", total: pageCount });
    }
  }
}
