import { type ReaderEffect, type Chapter, type Position } from "./machine";
import { Engine, type EngineOptions } from "./engine";

export interface FixedLayoutSurface {
  loadChapter(href: string, rawData: ArrayBuffer): Promise<void>;
  getCurrentPage(): number;
  getPageCount(): number;
  goToPage(page: number): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomFit(): void;
  zoomWidth(): void;
  rotate(degrees: number): void;
  getCurrentScale(): number;
  destroy(): void;
}

export interface SelfContainedRenderer {
  mount(container: HTMLElement, href: string, rawData: ArrayBuffer): Promise<void>;
  unmount(): void;
  getCurrentPage(): number;
  getPageCount(): number;
  goToPage(page: number): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomFit(): void;
  zoomWidth(): void;
  rotate(degrees: number): void;
  getCurrentScale(): number;
  onPageChange?: (page: number, total: number) => void;
  destroy(): void;
}

export interface FixedHostOptions extends EngineOptions {
  /** Host-driven surface (CBZ etc.). */
  surface?: FixedLayoutSurface;
  /** Self-driving renderer (PDF etc.). Mutually exclusive with surface. */
  renderer?: SelfContainedRenderer;
}

/**
 * Fixed-layout reader host — supports two modes:
 * - Host-driven (surface): CBZ and other formats where host calls loadChapter/goToPage.
 * - Autonomous (renderer): PDF where the renderer manages its own DOM and navigation.
 *
 * Fixed layouts always paginate; page state lives in the surface/renderer.
 * The machine only holds the chapter + a progress readout for events.
 */
export class FixedHost extends Engine {
  private surface: FixedLayoutSurface | undefined;
  private renderer: SelfContainedRenderer | undefined;
  private rendererContainer: HTMLElement | null = null;

  constructor(options: FixedHostOptions) {
    super(options);
    this.surface = options.surface;
    this.renderer = options.renderer;

    if (this.renderer) {
      this.renderer.onPageChange = (page, total) => {
        const chapterId = this.currentChapterId();
        if (!chapterId) return;
        // Presentation-level page change: reflect it in the position and
        // report the (possibly new) page count.
        this.seek({ chapterIndex: this.state.position.chapterIndex, page });
        this.dispatch({ type: "MEASURED", chapterId, total, mode: "pagination" });
      };
    }
  }

  // ── Public API ──

  init(
    bookId: string,
    chapters: Chapter[],
    chapterIndex = 0,
    _mode?: "pagination" | "scroll",
    initialPosition?: Partial<Position>,
    initialPage?: number,
  ): void {
    // Fixed-layout always uses pagination — scroll mode is not applicable.
    super.init(bookId, chapters, chapterIndex, "pagination", initialPosition, initialPage);
  }

  override setMode(_mode: "pagination" | "scroll"): void {
    // Fixed layouts have a single presentation; nothing to switch.
  }

  seek(target: { chapterIndex: number; progress?: number; page?: number }): void {
    this.dispatch({ type: "SEEK", ...target });
  }

  nextPage(): void {
    const target = this.renderer ?? this.surface;
    if (!target) return;
    if (target.getCurrentPage() < target.getPageCount() - 1) {
      target.goToPage(target.getCurrentPage() + 1);
    } else {
      this.seek({ chapterIndex: this.state.position.chapterIndex + 1, page: 0 });
    }
  }

  prevPage(): void {
    const target = this.renderer ?? this.surface;
    if (!target) return;
    if (target.getCurrentPage() > 0) {
      target.goToPage(target.getCurrentPage() - 1);
    } else {
      this.seek({ chapterIndex: this.state.position.chapterIndex - 1, page: -1 });
    }
  }

  goToChapter(chapterId: string, targetPage?: number): void {
    const idx = this.state.chapters.findIndex((c) => c.id === chapterId);
    if (idx < 0) return;
    this.seek(
      targetPage !== undefined ? { chapterIndex: idx, page: targetPage } : { chapterIndex: idx },
    );
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

  protected async runEffect(_effect: ReaderEffect): Promise<void> {
    // Fixed-layout rendering is delegated to the surface/renderer, which
    // drives the machine itself (seek/MEASURED); there are no DOM side
    // effects to apply here. The app observes every effect via onEffect.
  }

  // ── Chapter fetching with surface integration ──

  private currentChapterId(): string | null {
    return this.state.chapters[this.state.position.chapterIndex]?.id ?? null;
  }

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    let rawData: ArrayBuffer | undefined;
    try {
      const result = await this.fetchChapter!(bookId, chapterId);
      rawData = result?.rawData;
    } catch {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Fetch failed" });
      return;
    }

    const chapter = this.state.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Chapter not found" });
      return;
    }

    if (!rawData || !chapter.href) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Content not found" });
      return;
    }

    this.dispatch({ type: "CHAPTER_LOADED", chapterId });

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
        this.dispatch({ type: "MEASURED", chapterId, total: pageCount, mode: "pagination" });
      }
    }
  }
}
