import type { Ref, ComputedRef } from "vue";
import type { Chapter } from "../../core/types";

// ── Content types ──

export interface ChapterContent {
  chapterId: string;
  title: string;
  content: string;
  order: number;
}

// ── Callbacks from strategy → engine ──

export interface StrategyCallbacks {
  /** Chapter changed (scroll mode detects this via scroll position) */
  onChapterChanged(chapterId: string, previousChapterId?: string): void;
  /** Page changed (pagination mode only) */
  onPageChanged(page: number, totalPages: number): void;
  /** Content fully loaded and rendered */
  onContentLoaded(chapterId: string): void;
  /** Progress update from the active strategy */
  onProgressUpdate(bookPercent: number, chapterPercent: number): void;
  /** Transition state control */
  setTransitioning(value: boolean): void;
  /** Returns whether currently restoring a session */
  isRestoring(): boolean;
}

// ── Strategy input (dependencies injected by engine) ──

export interface StrategyContext {
  bookId: Ref<string>;
  chapters: Ref<Chapter[]>;
  currentChapter: Ref<Chapter | null>;
  currentChapterIndex: ComputedRef<number>;
  resourceUrls: Ref<Map<string, string> | undefined>;
  callbacks: StrategyCallbacks;

  // Content resolution
  getChapterContent(chapterId: string): Promise<{ html: string; resources: HTMLElement[] } | null>;

  // Iframe document access
  getDocument(): Document | null;
  getArticle(): HTMLElement | null;
  syncResources(elements: HTMLElement[]): void;
}

// ── Strategy interface ──

export interface ReadingStrategy {
  readonly mode: "pagination" | "scroll";

  // ── Content (used by ReaderContent) ──
  /** Single-chapter HTML for pagination display; empty for scroll */
  readonly displayContent: ComputedRef<string>;
  /** Multi-chapter content for scroll mode; empty for pagination */
  readonly loadedChapters: Ref<ChapterContent[]>;
  /** EPUB resources to sync into iframe */
  readonly chapterResources: Ref<HTMLElement[]>;
  /** True while content is loading */
  readonly isLoading: ComputedRef<boolean>;

  // ── Progress ──
  readonly chapterProgress: ComputedRef<number>;
  readonly readingProgress: ComputedRef<number>;
  readonly totalBookProgress: ComputedRef<number>;

  // ── Navigation ──
  navigateToChapter(
    chapterId: string,
    targetPosition?: number,
    autoClearTransition?: boolean,
  ): Promise<void>;
  goForward(): Promise<void>;
  goBackward(): Promise<void>;
  navigateToCfi(cfi: string, chapterId: string): Promise<void>;
  handleInternalLinkClick(href: string): void;

  // ── Pagination (non-null only for pagination mode) ──
  readonly pagination: {
    currentPage: Ref<number>;
    totalPages: Ref<number>;
    goToPage(page: number): void;
    updateColumnLayout(contentWidth: number, iframeWidth: number): void;
    isReady: Ref<boolean>;
  } | null;

  // ── Iframe lifecycle callbacks ──
  onIframeReady(doc: Document): void;
  onChaptersChanged(): void;

  // ── Gesture ──
  setupGestureHandler(doc: Document): () => void;

  // ── Lifecycle ──
  activate(): Promise<void>;
  deactivate(): void;
}
