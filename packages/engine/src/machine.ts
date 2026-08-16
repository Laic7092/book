/**
 * Reader core: the single authority over WHERE the reader is in the book and
 * WHETHER the chapter content is materialized.
 *
 * First-principles decomposition:
 *   - A book is an ordered flow of chapters. The reader's position is one
 *     coordinate: (chapterIndex, in-chapter flow progress 0..1).
 *   - Content must be materialized (fetched + rendered) before it can be
 *     shown; materialization is async and can fail — that lifecycle is the
 *     only true state machine here.
 *   - Pagination and scroll are two presentations of the same position
 *     (viewport offset in the flow). Page numbers are a host-measured
 *     readout, not a second coordinate. There is no `mode` in the machine:
 *     the host reports how it renders (`presentation`), and it is a fact,
 *     never a behavioral branch.
 *
 * The machine knows nothing about layout, measurement or DOM. It exposes one
 * navigation primitive (`SEEK`), one continuous-position channel
 * (`POSITION_REPORT`), and the load lifecycle. Everything else is the host's
 * job.
 *
 * Targets the machine cannot resolve yet (a page seek before the chapter is
 * measured, any in-chapter seek while materializing) are NOT deferred here:
 * the engine holds them and re-dispatches a progress SEEK after MEASURED.
 */

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  order: number;
  inToc?: boolean;
}

export type ReaderStatus = "idle" | "loading" | "ready" | "error";

export interface Position {
  chapterIndex: number;
  /** In-chapter flow progress 0..1 — the single, mode-independent coordinate. */
  progress: number;
  /**
   * Viewport-top offset inside the chapter (0..1), for exact scroll restore.
   * Set by POSITION_REPORT while scrolling; cleared by explicit navigation.
   */
  anchor?: number;
}

export interface Presentation {
  /** How the host currently renders the position. Host-reported, read-only. */
  mode: "pagination" | "scroll";
  /** Pagination readout of position.progress; 0 in scroll mode. */
  page: number;
  /** Host-measured page count; 0 in scroll mode / before first measurement. */
  total: number;
}

export interface ReaderState {
  bookId: string;
  chapters: Chapter[];
  position: Position;
  status: ReaderStatus;
  lastError: string | null;
  /** Host-measured presentation facts (see Presentation). */
  presentation: Presentation;
}

export type ReaderAction =
  | {
      type: "INIT";
      bookId: string;
      chapters: Chapter[];
      chapterIndex: number;
      /** Exact position restore (scroll-style: progress + optional anchor). */
      initialPosition?: Partial<Position>;
    }
  /** The only navigation primitive. page -1 means "last page". */
  | { type: "SEEK"; chapterIndex: number; progress?: number; page?: number }
  /**
   * Continuous position truth from the host (scrolling, anchor restore).
   * Never triggers a fetch; the host only reports chapters it has materialized.
   */
  | { type: "POSITION_REPORT"; chapterIndex: number; progress: number; anchor?: number }
  | { type: "CHAPTER_LOADED"; chapterId: string }
  | { type: "CHAPTER_FAILED"; chapterId: string; error: string }
  /**
   * Host finished rendering + measuring the current chapter. The only
   * transition into `ready`; also carries mode/pagination facts.
   */
  | { type: "MEASURED"; chapterId: string; total: number; mode: "pagination" | "scroll" }
  | { type: "RETRY" }
  | { type: "TEARDOWN" };

export type ReaderEffect =
  | { type: "FETCH_CHAPTER"; bookId: string; chapterId: string }
  | {
      type: "POSITION_CHANGED";
      chapterId: string | null;
      previousChapterId: string | null;
      position: Position;
      presentation: Presentation;
    }
  | { type: "CONTENT_READY"; chapterId: string }
  | { type: "MODE_CHANGED"; mode: "pagination" | "scroll" }
  | {
      type: "READER_UNMOUNTED";
      bookId: string;
      chapterId: string | null;
      chapterIndex: number;
      progress: number;
      anchor: number | undefined;
      mode: "pagination" | "scroll";
      page: number;
    };

export function createInitialState(): ReaderState {
  return {
    bookId: "",
    chapters: [],
    position: { chapterIndex: -1, progress: 0 },
    status: "idle",
    lastError: null,
    presentation: { mode: "pagination", page: 0, total: 0 },
  };
}

// ── Pure math ──

function currentChapter(state: ReaderState): Chapter | undefined {
  return state.chapters[state.position.chapterIndex];
}

function currentChapterId(state: ReaderState): string | null {
  return currentChapter(state)?.id ?? null;
}

function clampProgress(p: number): number {
  return Math.min(1, Math.max(0, p));
}

/** page → in-chapter progress. page < 0 means "last page". */
export function pageToProgress(page: number, total: number): number {
  if (total <= 0) return 0;
  const p = page < 0 ? total - 1 : Math.min(page, total - 1);
  return p / total;
}

/** progress → pagination page readout (with float fudge). */
export function progressToPage(progress: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.floor(clampProgress(progress) * total + 1e-9));
}

/** Build the POSITION_CHANGED effect describing the current state. */
function positionChanged(state: ReaderState, prevChapterIndex: number): ReaderEffect {
  return {
    type: "POSITION_CHANGED",
    chapterId: currentChapterId(state),
    previousChapterId:
      prevChapterIndex >= 0 && prevChapterIndex < state.chapters.length
        ? state.chapters[prevChapterIndex].id
        : null,
    position: state.position,
    presentation: state.presentation,
  };
}

// ── Reducers ──

function initReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "INIT" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterId = action.chapters[action.chapterIndex]?.id;
  if (!chapterId || action.chapters.length === 0) return { state, effects: [] };

  const next: ReaderState = {
    ...state,
    bookId: action.bookId,
    chapters: action.chapters,
    position: {
      chapterIndex: action.chapterIndex,
      progress: action.initialPosition?.progress ?? 0,
      anchor: action.initialPosition?.anchor,
    },
    status: "loading",
    lastError: null,
    presentation: { mode: "pagination", page: 0, total: 0 },
  };

  return {
    state: next,
    effects: [{ type: "FETCH_CHAPTER", bookId: action.bookId, chapterId }],
  };
}

function seekReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SEEK" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const idx = action.chapterIndex;
  if (idx < 0 || idx >= state.chapters.length) return { state, effects: [] };

  const sameChapter = idx === state.position.chapterIndex;
  const prevChapterIndex = state.position.chapterIndex;

  if (sameChapter && state.status !== "ready") {
    // Not resolvable while materializing. The engine defers the target and
    // re-dispatches a progress SEEK after MEASURED makes the chapter ready.
    return { state, effects: [] };
  }

  if (!sameChapter) {
    const hasPage = action.page !== undefined;
    const progress = hasPage || action.progress === undefined ? 0 : clampProgress(action.progress);
    const next: ReaderState = {
      ...state,
      position: { chapterIndex: idx, progress, anchor: undefined },
      status: "loading",
      lastError: null,
      // Old measurement belongs to the previous chapter.
      presentation: { ...state.presentation, page: 0, total: 0 },
    };
    return {
      state: next,
      effects: [
        // Report the chapter change BEFORE fetching: the nested dispatches
        // from the fetch (MEASURED resolution) must not be clobbered by this
        // stale snapshot (it carries a reset presentation).
        positionChanged(next, prevChapterIndex),
        { type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: state.chapters[idx].id },
      ],
    };
  }

  // Same chapter, ready: resolve immediately.
  const total = state.presentation.total;
  let progress: number;
  let page: number;
  if (action.page !== undefined && total > 0) {
    progress = pageToProgress(action.page, total);
    page = action.page < 0 ? total - 1 : Math.min(action.page, total - 1);
  } else if (action.progress !== undefined) {
    progress = clampProgress(action.progress);
    page = progressToPage(progress, total);
  } else {
    return { state, effects: [] };
  }

  const next: ReaderState = {
    ...state,
    position: { chapterIndex: idx, progress, anchor: undefined },
    // Page is a readout of progress. In scroll mode total is 0, so this
    // always stays 0 and the presentation object is effectively unchanged.
    presentation: { ...state.presentation, page },
  };
  return { state: next, effects: [positionChanged(next, prevChapterIndex)] };
}

function positionReportReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "POSITION_REPORT" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.status !== "ready") return { state, effects: [] };

  const prevChapterIndex = state.position.chapterIndex;
  const progress = clampProgress(action.progress);
  // Keep the saved anchor while the document settles; only overwrite when a
  // fresh anchor is actually reported.
  const anchor = action.anchor !== undefined ? action.anchor : state.position.anchor;

  if (
    action.chapterIndex === prevChapterIndex &&
    progress === state.position.progress &&
    anchor === state.position.anchor
  ) {
    return { state, effects: [] };
  }

  const next: ReaderState = {
    ...state,
    position: { chapterIndex: action.chapterIndex, progress, anchor },
  };
  return { state: next, effects: [positionChanged(next, prevChapterIndex)] };
}

function chapterLoadedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_LOADED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  // Ignore stale responses for chapters we've navigated away from.
  if (action.chapterId !== currentChapterId(state)) return { state, effects: [] };
  // Content is in the DOM but not yet measured — `ready` comes from MEASURED.
  return { state, effects: [{ type: "CONTENT_READY", chapterId: action.chapterId }] };
}

function chapterFailedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_FAILED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (action.chapterId !== currentChapterId(state)) return { state, effects: [] };
  return { state: { ...state, status: "error", lastError: action.error }, effects: [] };
}

function measuredReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "MEASURED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (action.chapterId !== currentChapterId(state)) return { state, effects: [] };

  const prev = state.presentation;
  const modeChanged = prev.mode !== action.mode;
  const total = Math.max(0, action.total);
  let progress = state.position.progress;
  let positionChangedFlag = false;

  // Pagination: keep progress within the measurable range (page 0..total-1).
  if (action.mode === "pagination" && total > 0) {
    const maxProgress = (total - 1) / total;
    if (progress > maxProgress) {
      progress = maxProgress;
      positionChangedFlag = true;
    }
  }

  const page = action.mode === "pagination" && total > 0 ? progressToPage(progress, total) : 0;
  const presentationChanged =
    prev.mode !== action.mode || prev.page !== page || prev.total !== total;

  // Identical re-measurement of an already-ready chapter: keep the state
  // object, no effects. Never early-return while loading — the loading →
  // ready transition is the whole point of MEASURED, even when the
  // presentation facts are unchanged (scroll-mode reloads always are).
  if (state.status === "ready" && !modeChanged && !positionChangedFlag && !presentationChanged) {
    return { state, effects: [] };
  }

  const next: ReaderState = {
    ...state,
    position: positionChangedFlag
      ? { ...state.position, progress, anchor: undefined }
      : state.position,
    status: "ready",
    lastError: null,
    presentation: { mode: action.mode, page, total },
  };

  const effects: ReaderEffect[] = [];
  if (modeChanged) effects.push({ type: "MODE_CHANGED", mode: action.mode });
  if (positionChangedFlag || presentationChanged) {
    effects.push(positionChanged(next, state.position.chapterIndex));
  }
  return { state: next, effects };
}

function retryReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.status !== "error") return { state, effects: [] };
  const chapterId = currentChapterId(state);
  if (!chapterId) return { state, effects: [] };
  return {
    state: { ...state, status: "loading", lastError: null },
    effects: [{ type: "FETCH_CHAPTER", bookId: state.bookId, chapterId }],
  };
}

function teardownReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  const effects: ReaderEffect[] = [];
  if (state.bookId) {
    effects.push({
      type: "READER_UNMOUNTED",
      bookId: state.bookId,
      chapterId: currentChapterId(state),
      chapterIndex: state.position.chapterIndex,
      progress: state.position.progress,
      anchor: state.position.anchor,
      mode: state.presentation.mode,
      page: state.presentation.page,
    });
  }
  return { state: createInitialState(), effects };
}

export function reducer(state: ReaderState, action: ReaderAction) {
  switch (action.type) {
    case "INIT":
      return initReducer(state, action);
    case "SEEK":
      return seekReducer(state, action);
    case "POSITION_REPORT":
      return positionReportReducer(state, action);
    case "CHAPTER_LOADED":
      return chapterLoadedReducer(state, action);
    case "CHAPTER_FAILED":
      return chapterFailedReducer(state, action);
    case "MEASURED":
      return measuredReducer(state, action);
    case "RETRY":
      return retryReducer(state);
    case "TEARDOWN":
      return teardownReducer(state);
  }
}

export function createReaderMachine() {
  let state: ReaderState = createInitialState();
  const subscribers = new Set<(s: ReaderState) => void>();

  return {
    getState() {
      return state;
    },

    subscribe(fn: (s: ReaderState) => void) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    dispatch(action: ReaderAction): ReaderEffect[] {
      const result = reducer(state, action);
      state = result.state;
      subscribers.forEach((fn) => fn(state));
      return result.effects;
    },
  };
}
