import { type ReaderAction, type ReaderState, type Presentation } from "./machine";
import { computePageCount, computePageFromOffset } from "./layout";
import { type ReflowablePresentation } from "./presentation";

/**
 * Pagination-mode presentation controller.
 *
 * Owns the CSS multi-column measurement cycle and the current page CSS
 * variable. Keeps pagination-only DOM concerns out of ReflowableHost, mirroring
 * ScrollController for scroll mode.
 */
export interface PagedControllerHost {
  readonly doc: Document;
  readonly getState: () => ReaderState;
  readonly getMode: () => "pagination" | "scroll";
  dispatch(action: ReaderAction): void;
}

export class PagedController implements ReflowablePresentation {
  readonly mode = "pagination" as const;
  private columnObserver: ResizeObserver | null = null;
  private host: PagedControllerHost;

  constructor(host: PagedControllerHost) {
    this.host = host;
  }

  start(): void {
    // Pagination has no scroll listener to attach.
  }

  stop(): void {
    // Pagination has no scroll listener to detach.
  }

  /** Render a freshly loaded chapter and start measuring its pages. */
  renderChapter(chapterId: string, html: string): void {
    this.host.doc.body.innerHTML = html;
    this.host.dispatch({ type: "CHAPTER_LOADED", chapterId });

    const loadingChapterId = chapterId;
    requestAnimationFrame(() => {
      this.measure(loadingChapterId);
      this.setupColumnObserver(loadingChapterId);
    });
  }

  /** Rebuild the paginated DOM during a mode switch. */
  restructure(chapterId: string, html: string): void {
    this.host.doc.body.innerHTML = html;
    requestAnimationFrame(() => {
      this.measure(chapterId);
      this.setupColumnObserver(chapterId);
    });
  }

  /** Update the CSS variable that moves the multi-column viewport. */
  applyPosition(presentation: Presentation): void {
    this.host.doc.documentElement.style.setProperty("--current-page", String(presentation.page));
  }

  /** Position the viewport at an anchor element using the page grid. */
  navigateToAnchor(el: Element): void {
    const step = this.host.doc.documentElement.clientWidth;
    if (step <= 0) return;
    const page = computePageFromOffset(
      el.getBoundingClientRect().left,
      this.host.doc.body.getBoundingClientRect().left,
      step,
    );
    this.host.dispatch({
      type: "SEEK",
      chapterIndex: this.host.getState().position.chapterIndex,
      page,
    });
  }

  beforeChapterLoad(): void {
    this.teardown();
  }

  teardown(): void {
    if (this.columnObserver) {
      this.columnObserver.disconnect();
      this.columnObserver = null;
    }
  }

  private measure(chapterId: string): void {
    const doc = this.host.doc;
    if (!doc?.body) return;
    const total = computePageCount(doc.body.scrollWidth, doc.documentElement.clientWidth);
    this.host.dispatch({ type: "MEASURED", chapterId, total, mode: this.host.getMode() });
  }

  private setupColumnObserver(chapterId: string): void {
    this.teardown();
    if (this.host.getMode() !== "pagination") return;
    this.columnObserver = new ResizeObserver(() => {
      this.measure(chapterId);
    });
    this.columnObserver.observe(this.host.doc.body);
  }
}
