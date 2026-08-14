import {
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
  type Chapter,
} from "./machine";

export interface ReaderSession {
  dispatch(action: ReaderAction): void;
  getState(): ReaderState;
  getDocument(): Document | null;
  setPageMargin(margin: number): void;
  navigateToCfi(cfi: string, chapterId: string): Promise<void>;
}

export interface EngineOptions {
  onEffect?: (effect: ReaderEffect) => void | Promise<void>;
  onStateChange?: (state: ReaderState) => void;
  onReady?: () => void;
  fetchChapter?: (
    bookId: string,
    chapterId: string,
    signal?: AbortSignal,
  ) => Promise<{ html: string | undefined; rawData?: ArrayBuffer }>;
  /**
   * Extract a binary resource (image/font/css) from the book's raw data.
   * Injected by the app from the parser registry — the engine has no
   * knowledge of parsers.
   */
  extractResource?: (rawData: ArrayBuffer, path: string) => Promise<ArrayBuffer | undefined>;
}

export abstract class Engine {
  protected machine = createReaderMachine();
  state: ReaderState;
  private unsub: () => void;
  private onReady: (() => void) | undefined;
  protected onEffect: ((effect: ReaderEffect) => void | Promise<void>) | undefined;
  protected fetchChapter: EngineOptions["fetchChapter"];
  protected extractResource: EngineOptions["extractResource"];
  private fetchAbortController: AbortController | null = null;

  constructor(options: EngineOptions) {
    this.onReady = options.onReady;
    this.onEffect = options.onEffect;
    this.fetchChapter = options.fetchChapter;
    this.extractResource = options.extractResource;
    this.state = this.machine.getState();
    this.unsub = this.machine.subscribe((s) => {
      this.state = s;
      this.afterState(s);
      options.onStateChange?.(s);
    });
  }

  /** Returns a fresh AbortSignal, aborting any previous in-flight fetch. */
  protected nextFetchSignal(): AbortSignal {
    this.fetchAbortController?.abort();
    this.fetchAbortController = new AbortController();
    return this.fetchAbortController.signal;
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
  ): void {
    this.dispatch({
      type: "INIT",
      bookId,
      chapters,
      chapterIndex,
      mode,
      ...(initialPage ? { initialPage } : {}),
      ...(initialScroll ? { initialScroll } : {}),
    });
  }

  dispatch(action: ReaderAction): void {
    const effects = this.machine.dispatch(action);
    void this.runEffects(effects);
  }

  getState(): ReaderState {
    return this.state;
  }

  abstract getDocument(): Document | null;

  getSession(): ReaderSession {
    return {
      dispatch: (a) => this.dispatch(a),
      getState: () => this.getState(),
      getDocument: () => this.getDocument(),
      setPageMargin: (_margin: number) => {},
      navigateToCfi: (_cfi: string, _chapterId: string) => Promise.resolve(),
    };
  }

  destroy(): void {
    this.fetchAbortController?.abort();
    this.dispatch({ type: "TEARDOWN" });
    this.unsub();
  }

  protected async runEffects(effects: ReaderEffect[]): Promise<void> {
    for (const effect of effects) {
      if (effect.type === "FETCH_CHAPTER") {
        // Content loading is the engine's own job (hosts override
        // fetchAndLoadChapter for DOM integration); it is never surfaced to
        // the app layer.
        await this.runGenericEffect(effect);
      } else {
        // Two non-overlapping consumers, neither may swallow the other's
        // signal: the host renders DOM side effects (runEffect), the app
        // observes every effect through onEffect. Before this split,
        // reflowable-host consumed MODE_CHANGED/PAGE_POSITION_CHANGED and
        // the app never saw them — e.g. the "mode:changed" plugin event
        // was emitted by translateEffect but could never fire.
        await this.runEffect(effect);
        await Promise.resolve(this.onEffect?.(effect));
      }
    }
  }

  protected abstract runEffect(effect: ReaderEffect): void | Promise<void>;

  /** FETCH_CHAPTER handling; without a fetchChapter, forward to onEffect. */
  protected async runGenericEffect(effect: ReaderEffect): Promise<void> {
    if (effect.type === "FETCH_CHAPTER" && this.fetchChapter) {
      await this.fetchAndLoadChapter(effect.bookId, effect.chapterId);
    } else {
      await Promise.resolve(this.onEffect?.(effect));
    }
  }

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
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
    if (!result?.html) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Content not found" });
      return;
    }
    this.dispatch({ type: "CHAPTER_LOADED", chapterId });
  }

  private afterState(state: ReaderState): void {
    if (state.status === "ready" && this.onReady) {
      this.onReady();
      this.onReady = void 0;
    }
  }
}
