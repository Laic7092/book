import {
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
  type Chapter,
  type Position,
} from "./machine";

export interface ReaderSession {
  dispatch(action: ReaderAction): void;
  getState(): ReaderState;
  getDocument(): Document | null;
  setPageMargin(margin: number): void;
  setMode(mode: "pagination" | "scroll"): void;
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
  /**
   * The host's rendering mode. The machine does not know this — it only
   * receives it back via MEASURED as a presentation fact. Hosts read this
   * field for their DOM branches; the app changes it via setMode.
   */
  protected mode: "pagination" | "scroll" = "pagination";
  private unsub: () => void;
  private onReady: (() => void) | undefined;
  protected onEffect: ((effect: ReaderEffect) => void | Promise<void>) | undefined;
  protected fetchChapter: EngineOptions["fetchChapter"];
  protected extractResource: EngineOptions["extractResource"];
  private fetchAbortController: AbortController | null = null;
  /**
   * Background auto-loads (scroll chaining) get their own abort scope: they
   * must never abort an in-flight main chapter load. Aborting one leaves the
   * machine stuck in "loading" with no resolution (permanent black overlay).
   */
  private autoLoadAbortController: AbortController | null = null;

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

  /** Fresh AbortSignal for background auto-loads; aborts previous auto-loads only. */
  protected nextAutoLoadSignal(): AbortSignal {
    this.autoLoadAbortController?.abort();
    this.autoLoadAbortController = new AbortController();
    return this.autoLoadAbortController.signal;
  }

  init(
    bookId: string,
    chapters: Chapter[],
    chapterIndex = 0,
    mode: "pagination" | "scroll" = "pagination",
    initialPosition?: Partial<Position>,
    initialPage?: number,
  ): void {
    this.mode = mode;
    this.dispatch({
      type: "INIT",
      bookId,
      chapters,
      chapterIndex,
      ...(initialPosition ? { initialPosition } : {}),
      ...(initialPage !== undefined ? { initialPage } : {}),
    });
  }

  /** The host re-renders in the new presentation mode; position is preserved. */
  setMode(mode: "pagination" | "scroll"): void {
    this.mode = mode;
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
      setMode: (m) => this.setMode(m),
      navigateToCfi: (_cfi: string, _chapterId: string) => Promise.resolve(),
    };
  }

  destroy(): void {
    this.fetchAbortController?.abort();
    this.autoLoadAbortController?.abort();
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
        // observes every effect through onEffect.
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
