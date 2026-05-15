import {
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
  type Chapter,
} from "@book/reader-core";
import type { ReaderSession } from "./session";

export interface BaseHostOptions {
  onEffect?: (effect: ReaderEffect) => void | Promise<void>;
  onStateChange?: (state: ReaderState) => void;
  onReady?: () => void;
  fetchChapter?: (
    bookId: string,
    chapterId: string,
  ) => Promise<{ html: string | undefined; rawData?: ArrayBuffer }>;
}

export abstract class BaseHost {
  protected machine = createReaderMachine();
  protected state: ReaderState;
  private unsub: () => void;
  private onReady: (() => void) | undefined;
  protected onEffect: ((effect: ReaderEffect) => void | Promise<void>) | undefined;
  protected fetchChapter: BaseHostOptions["fetchChapter"];

  constructor(options: BaseHostOptions) {
    this.onReady = options.onReady;
    this.onEffect = options.onEffect;
    this.fetchChapter = options.fetchChapter;
    this.state = this.machine.getState();
    this.unsub = this.machine.subscribe((s) => {
      this.state = s;
      this.afterState(s);
      options.onStateChange?.(s);
    });
  }

  // ── Public API ──

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
    this.dispatch({ type: "TEARDOWN" });
    this.unsub();
  }

  // ── Effect dispatch ──

  protected async runEffects(effects: ReaderEffect[]): Promise<void> {
    for (const effect of effects) {
      await this.runEffect(effect);
    }
  }

  protected abstract runEffect(effect: ReaderEffect): void | Promise<void>;

  /** Handle effects common to all host types. */
  protected async runGenericEffect(effect: ReaderEffect): Promise<void> {
    switch (effect.type) {
      case "FETCH_CHAPTER":
        if (this.fetchChapter) {
          await this.fetchAndLoadChapter(effect.bookId, effect.chapterId);
        } else {
          await Promise.resolve(this.onEffect?.(effect));
        }
        break;
      default:
        // Structured effects (CHAPTER_DID_CHANGE, PAGE_DID_CHANGE, etc.)
        // forwarded to onEffect for the composable to translate into plugin events.
        await Promise.resolve(this.onEffect?.(effect));
    }
  }

  protected async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    const { html } = await this.fetchChapter!(bookId, chapterId);
    if (!html) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Content not found" });
      return;
    }
    this.dispatch({ type: "CHAPTER_LOADED", chapterId, html });
  }

  // ── State watcher ──

  private afterState(state: ReaderState): void {
    if (state.status === "ready" && this.onReady) {
      this.onReady();
      this.onReady = void 0;
    }
  }
}
