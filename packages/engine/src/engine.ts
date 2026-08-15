import {
  createReaderMachine,
  pageToProgress,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
  type Chapter,
  type Position,
} from "./machine";
import { TaskScope } from "./tasks";

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
  /** Scope of the current main chapter load; superseded on every new load. */
  private mainLoadScope: TaskScope | null = null;
  /**
   * Root scope for background auto-loads (scroll chaining). Forked children
   * can never cancel the main load (cancellation flows down the tree only);
   * a new main load cancels this whole scope because it replaces the DOM the
   * auto-loads were writing into.
   */
  private autoLoadScope: TaskScope | null = null;
  /** The most recent auto-load task; superseded by the next one. */
  private activeAutoLoad: TaskScope | null = null;
  /**
   * In-chapter seek target the machine cannot resolve yet (a page seek
   * before the chapter is measured, any in-chapter seek while materializing).
   * Flushed as a progress SEEK once MEASURED makes the chapter ready.
   */
  private deferredSeek: { chapterIndex: number; progress?: number; page?: number } | null = null;

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

  /**
   * Begin a main chapter load: cancel the previous main load and every
   * in-flight auto-load (their DOM targets are about to be replaced), then
   * hand out a fresh signal for the new load.
   */
  protected beginMainLoad(): AbortSignal {
    this.mainLoadScope?.cancel();
    this.mainLoadScope = new TaskScope();
    this.cancelAutoLoads();
    return this.mainLoadScope.signal;
  }

  /** Cancel all background auto-loads (scroll chaining). */
  protected cancelAutoLoads(): void {
    this.autoLoadScope?.cancel();
    this.autoLoadScope = null;
    this.activeAutoLoad = null;
  }

  /**
   * Fresh signal for a background auto-load; supersedes the previous one.
   * Never affects the main load scope (children cannot cancel ancestors).
   */
  protected nextAutoLoadSignal(): AbortSignal {
    this.autoLoadScope ??= new TaskScope();
    this.activeAutoLoad?.cancel();
    this.activeAutoLoad = this.autoLoadScope.fork();
    return this.activeAutoLoad.signal;
  }

  /** Cancel every in-flight task (main + auto loads). Called by destroy(). */
  protected cancelAllTasks(): void {
    this.mainLoadScope?.cancel();
    this.mainLoadScope = null;
    this.cancelAutoLoads();
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
    // An exact page restore cannot be resolved before the chapter is
    // measured; defer it and re-dispatch after the first MEASURED.
    this.deferredSeek = initialPage !== undefined ? { chapterIndex, page: initialPage } : null;
    this.dispatch({
      type: "INIT",
      bookId,
      chapters,
      chapterIndex,
      ...(initialPosition ? { initialPosition } : {}),
    });
  }

  /** The host re-renders in the new presentation mode; position is preserved. */
  setMode(mode: "pagination" | "scroll"): void {
    this.mode = mode;
  }

  dispatch(action: ReaderAction): void {
    if (action.type === "SEEK" && !this.isSeekResolvable(action)) {
      // In-chapter targets the machine cannot resolve yet are deferred here
      // (covers every dispatcher: hosts, composable, plugins) and re-dispatched
      // as a progress SEEK once MEASURED makes the chapter ready. The bare
      // chapter seek still fires — a cross-chapter target must start the fetch.
      const { chapterIndex, progress, page } = action;
      this.deferredSeek = { chapterIndex, progress, page };
      this.dispatch({ type: "SEEK", chapterIndex });
      return;
    }
    const effects = this.machine.dispatch(action);
    void this.runEffects(effects);
    if (action.type === "MEASURED") this.flushDeferredSeek();
  }

  private isSeekResolvable(action: Extract<ReaderAction, { type: "SEEK" }>): boolean {
    const state = this.machine.getState();
    if (action.chapterIndex < 0 || action.chapterIndex >= state.chapters.length) return true;
    const sameChapter = action.chapterIndex === state.position.chapterIndex;
    if (action.page !== undefined) return state.status === "ready" && sameChapter;
    if (action.progress !== undefined) return !(state.status !== "ready" && sameChapter);
    return true;
  }

  private flushDeferredSeek(): void {
    const deferred = this.deferredSeek;
    this.deferredSeek = null;
    if (!deferred) return;
    const state = this.machine.getState();
    // Resolve only against the chapter that was just measured; a newer seek
    // replaces the deferred target anyway.
    if (state.status !== "ready" || deferred.chapterIndex !== state.position.chapterIndex) return;
    if (deferred.page !== undefined) {
      this.dispatch({
        type: "SEEK",
        chapterIndex: deferred.chapterIndex,
        progress: pageToProgress(deferred.page, state.presentation.total),
      });
    } else if (deferred.progress !== undefined) {
      this.dispatch({
        type: "SEEK",
        chapterIndex: deferred.chapterIndex,
        progress: deferred.progress,
      });
    }
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
    this.cancelAllTasks();
    this.deferredSeek = null;
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
