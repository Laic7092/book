import { type ReaderEffect, type Chapter } from "@book/reader-core";
import { BaseHost, type BaseHostOptions } from "./base-host";
import { type FixedLayoutSurface, type SelfContainedRenderer } from "./fixed-surface";

export interface FixedHostOptions extends BaseHostOptions {
  /** Host-driven surface (CBZ etc.). */
  surface?: FixedLayoutSurface;
  /** Self-driving renderer (PDF etc.). Mutually exclusive with surface. */
  renderer?: SelfContainedRenderer;
}

/**
 * Fixed-layout reader host — supports two modes:
 * - Host-driven (surface): CBZ and other formats where host calls loadChapter/goToPage.
 * - Autonomous (renderer): PDF where the renderer manages its own DOM and navigation.
 */
export class FixedHost extends BaseHost {
  private surface: FixedLayoutSurface | undefined;
  private renderer: SelfContainedRenderer | undefined;
  private rendererContainer: HTMLElement | null = null;

  constructor(options: FixedHostOptions) {
    super(options);
    this.surface = options.surface;
    this.renderer = options.renderer;

    if (this.renderer) {
      this.renderer.onPageChange = (_page, total) => {
        this.dispatch({ type: "PAGE_COUNT_UPDATED", total });
      };
    }
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
    const target = this.renderer ?? this.surface;
    if (!target) return;
    if (target.getCurrentPage() < target.getPageCount() - 1) {
      target.goToPage(target.getCurrentPage() + 1);
    } else {
      this.dispatch({ type: "NEXT_PAGE" });
    }
  }

  prevPage(): void {
    const target = this.renderer ?? this.surface;
    if (!target) return;
    if (target.getCurrentPage() > 0) {
      target.goToPage(target.getCurrentPage() - 1);
    } else {
      this.dispatch({ type: "PREV_PAGE" });
    }
  }

  goToChapter(chapterId: string, targetPage?: number): void {
    this.dispatch({ type: "GO_TO_CHAPTER", chapterId, targetPage });
  }

  zoomIn(): void {
    (this.renderer ?? this.surface)?.zoomIn();
  }

  zoomOut(): void {
    (this.renderer ?? this.surface)?.zoomOut();
  }

  zoomFit(): void {
    (this.renderer ?? this.surface)?.zoomFit();
  }

  zoomWidth(): void {
    (this.renderer ?? this.surface)?.zoomWidth();
  }

  rotate(degrees: number): void {
    (this.renderer ?? this.surface)?.rotate(degrees);
  }

  getDocument(): Document | null {
    return null;
  }

  getSurface(): FixedLayoutSurface | undefined {
    return this.surface;
  }

  getRenderer(): SelfContainedRenderer | undefined {
    return this.renderer;
  }

  /**
   * Set the mount container for autonomous renderer mode (PDF).
   * Must be called before init() when using a renderer.
   */
  setRendererContainer(container: HTMLElement): void {
    this.rendererContainer = container;
  }

  destroy(): void {
    super.destroy();
    this.renderer?.destroy();
    this.surface?.destroy();
  }

  // ── Protected: effect handling ──

  protected async runEffect(effect: ReaderEffect): Promise<void> {
    await this.runGenericEffect(effect);
  }

  // ── Chapter fetching with surface integration ──

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    const { rawData } = await this.fetchChapter!(bookId, chapterId);

    const chapter = this.state.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Chapter not found" });
      return;
    }

    this.dispatch({ type: "CHAPTER_LOADED", chapterId });

    if (!rawData || !chapter.href) return;

    try {
      if (this.renderer && this.rendererContainer) {
        await this.renderer.mount(this.rendererContainer, chapter.href, rawData);
      } else if (this.surface) {
        await this.surface.loadChapter(chapter.href, rawData);
      }
    } catch {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Failed to render chapter" });
      return;
    }

    const target = this.renderer ?? this.surface;
    if (target) {
      const pageCount = target.getPageCount();
      if (pageCount > 0) {
        this.dispatch({ type: "PAGE_COUNT_UPDATED", total: pageCount });
      }
    }
  }
}
