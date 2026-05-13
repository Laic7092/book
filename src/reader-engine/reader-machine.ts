// Pure TypeScript state machine for the reader engine.
// Zero Vue dependencies — all state transitions are synchronous and deterministic.
//
// Architecture:
//   dispatch(action) → reducer(state, action) → { state, effects[] }
//
// Vue only does two things:
//   1. Render: subscribe to state changes → update DOM
//   2. Input:  user gestures → dispatch actions
//
// Side effects (storage I/O, DOM manipulation, event emission) are described
// as plain data objects ("effects") and executed by the Vue bridge layer.
//
// State is minimised to only what's needed for rendering decisions.
// Navigation history, progress percentages, and resource metadata are
// managed by the bridge layer, not by this state machine.

import type { Chapter } from "../core/types";

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════

export interface PageState {
  current: number;
  total: number;
  iframeWidth: number;
  /** Page to navigate to once column layout is measured. null = no pending. */
  pendingTarget: number | null;
}

export interface ScrollState {
  windowStart: number;
  windowEnd: number;
  progress: number;
}

export interface ReaderState {
  bookId: string;
  chapters: Chapter[];
  currentChapterIndex: number;
  mode: "pagination" | "scroll";
  status: "idle" | "loading-chapter" | "rendered" | "ready";

  page: PageState;
  scroll: ScrollState;

  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════════════════════════════════

export type ReaderAction =
  | {
      type: "INIT";
      bookId: string;
      chapters: Chapter[];
      chapterIndex: number;
      mode: "pagination" | "scroll";
      initialPage?: Partial<PageState>;
      initialScroll?: Partial<ScrollState>;
    }
  | {
      type: "CHAPTER_LOADED";
      chapterId: string;
      /** Fully processed HTML (resource paths rewritten + transformers applied) */
      html: string;
    }
  | { type: "CHAPTER_FAILED"; chapterId: string; error: string }
  | { type: "LAYOUT_MEASURED"; contentWidth: number; iframeWidth: number }
  | { type: "NEXT_PAGE" }
  | { type: "PREV_PAGE" }
  | { type: "GO_TO_CHAPTER"; chapterId: string; targetPage?: number }
  | { type: "GO_TO_PAGE"; page: number }
  | { type: "SET_MODE"; mode: "pagination" | "scroll" }
  | {
      type: "SCROLL_PROGRESS";
      bookProgress: number;
      visibleChapterId?: string;
    }
  | { type: "SCROLL_WINDOW_EXPANDED"; direction: "up" | "down"; newStart: number; newEnd: number }
  | { type: "CLEANUP" };

// ═══════════════════════════════════════════════════════════════════════════
// Effects (descriptions of side effects for the Vue bridge to execute)
// ═══════════════════════════════════════════════════════════════════════════

export type ReaderEffect =
  | { type: "FETCH_CHAPTER"; bookId: string; chapterId: string }
  | { type: "FETCH_CHAPTERS"; bookId: string; chapterIds: string[] }
  | { type: "RENDER_HTML"; html: string }
  | { type: "SET_PAGE_CSS"; page: number }
  | { type: "SET_MODE_CSS"; mode: "paginated" | "scroll" }
  | { type: "SET_PAGE_MARGIN_CSS"; margin: number }
  | { type: "EMIT"; event: string; payload: Record<string, unknown> }
  | { type: "SCROLL_INTO_VIEW"; chapterId: string }
  | {
      type: "MEASURE_LAYOUT";
      /** The chapter whose content is in the DOM and needs measurement. */
      chapterId: string;
    }
  | { type: "NOOP" };

// ═══════════════════════════════════════════════════════════════════════════
// Initial state
// ═══════════════════════════════════════════════════════════════════════════

export function createInitialState(): ReaderState {
  return {
    bookId: "",
    chapters: [],
    currentChapterIndex: -1,
    mode: "pagination",
    status: "idle",
    page: { current: 0, total: 1, iframeWidth: 0, pendingTarget: null },
    scroll: { windowStart: 0, windowEnd: 0, progress: 0 },
    error: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers
// ═══════════════════════════════════════════════════════════════════════════

function clampPage(target: number | null, total: number): number {
  if (target === null) return 0;
  if (total <= 0) return 0;
  if (target < 0) return Math.max(0, total - 1);
  return Math.min(target, total - 1);
}

function getChapterId(state: ReaderState): string | null {
  return state.chapters[state.currentChapterIndex]?.id ?? null;
}

function findChapterIndex(chapters: Chapter[], chapterId: string): number {
  return chapters.findIndex((c) => c.id === chapterId);
}

/** Build the effects emitted on a chapter change. */
function chapterChangeEffects(
  state: ReaderState,
  chapterId: string,
  previousChapterId: string | undefined,
): ReaderEffect[] {
  const effects: ReaderEffect[] = [];
  effects.push({
    type: "EMIT",
    event: "chapter:changed",
    payload: { bookId: state.bookId, chapterId, previousChapterId },
  });
  effects.push({
    type: "EMIT",
    event: "page:changed",
    payload: {
      bookId: state.bookId,
      chapterId,
      page: state.page.current,
      totalPages: state.page.total,
    },
  });
  effects.push({
    type: "EMIT",
    event: "content:loaded",
    payload: { bookId: state.bookId, chapterId },
  });
  return effects;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-reducers — each handles one action type, returns new state + effects
// ═══════════════════════════════════════════════════════════════════════════

function initReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "INIT" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterId = action.chapters[action.chapterIndex]?.id;
  if (!chapterId || action.chapters.length === 0) {
    return {
      state: { ...state, error: "No chapters in book" },
      effects: [],
    };
  }

  const next: ReaderState = {
    ...state,
    bookId: action.bookId,
    chapters: action.chapters,
    currentChapterIndex: action.chapterIndex,
    mode: action.mode,
    status: "loading-chapter",
    page: { current: 0, total: 1, iframeWidth: 0, pendingTarget: null, ...action.initialPage },
    scroll: {
      windowStart: action.chapterIndex,
      windowEnd: action.chapterIndex,
      progress: 0,
      ...action.initialScroll,
    },
    error: null,
  };

  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: action.bookId, chapterId },
    { type: "SET_MODE_CSS", mode: action.mode === "pagination" ? "paginated" : "scroll" },
  ];

  return { state: next, effects };
}

function chapterLoadedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_LOADED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterIdx = findChapterIndex(state.chapters, action.chapterId);
  if (chapterIdx < 0) {
    return { state: { ...state, error: `Chapter not found: ${action.chapterId}` }, effects: [] };
  }

  const previousChapterId = getChapterId(state);

  const next: ReaderState = {
    ...state,
    status: "rendered",
    currentChapterIndex: chapterIdx,
    page: {
      ...state.page,
      current: clampPage(state.page.pendingTarget, state.page.total),
      total: 1,
    },
    error: null,
  };

  const effects: ReaderEffect[] = [
    { type: "RENDER_HTML", html: action.html },
    { type: "MEASURE_LAYOUT", chapterId: action.chapterId },
  ];

  if (previousChapterId !== action.chapterId) {
    effects.push(...chapterChangeEffects(next, action.chapterId, previousChapterId ?? undefined));
  } else {
    effects.push({
      type: "EMIT",
      event: "content:loaded",
      payload: { bookId: state.bookId, chapterId: action.chapterId },
    });
  }

  return { state: next, effects };
}

function chapterFailedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_FAILED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  return {
    state: { ...state, status: "ready", error: action.error },
    effects: [],
  };
}

function layoutMeasuredReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "LAYOUT_MEASURED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const step = action.iframeWidth || 0;
  const newTotal = step > 0 ? Math.max(1, Math.ceil(action.contentWidth / step)) : 1;

  const pendingTarget = state.page.pendingTarget;
  const resolvedPage =
    pendingTarget !== null
      ? clampPage(pendingTarget, newTotal)
      : state.page.current >= newTotal
        ? Math.max(0, newTotal - 1)
        : state.page.current;

  const next: ReaderState = {
    ...state,
    status: state.status === "rendered" ? "ready" : state.status,
    page: {
      current: resolvedPage,
      total: newTotal,
      iframeWidth: step,
      pendingTarget: null,
    },
  };

  const effects: ReaderEffect[] = [{ type: "SET_PAGE_CSS", page: resolvedPage }];

  const chapterId = getChapterId(next);
  if (chapterId) {
    effects.push({
      type: "EMIT",
      event: "page:changed",
      payload: { bookId: next.bookId, chapterId, page: resolvedPage, totalPages: newTotal },
    });
  }

  return { state: next, effects };
}

function nextPageReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  if (state.status === "loading-chapter") return { state, effects: [] };

  const { current, total } = state.page;

  if (current < total - 1) {
    const newPage = current + 1;
    const next: ReaderState = {
      ...state,
      page: { ...state.page, current: newPage },
    };

    const chapterId = getChapterId(next);
    const effects: ReaderEffect[] = [{ type: "SET_PAGE_CSS", page: newPage }];
    if (chapterId) {
      effects.push({
        type: "EMIT",
        event: "page:changed",
        payload: { bookId: next.bookId, chapterId, page: newPage, totalPages: total },
      });
    }
    return { state: next, effects };
  }

  // Last page — transition to next chapter
  const nextIdx = state.currentChapterIndex + 1;
  if (nextIdx >= state.chapters.length) return { state, effects: [] };

  const nextChapter = state.chapters[nextIdx];
  const next: ReaderState = {
    ...state,
    status: "loading-chapter",
    currentChapterIndex: nextIdx,
    page: { ...state.page, current: 0, total: 1, pendingTarget: null },
  };
  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: nextChapter.id },
  ];
  return { state: next, effects };
}

function prevPageReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  if (state.status === "loading-chapter") return { state, effects: [] };

  if (state.page.current > 0) {
    const newPage = state.page.current - 1;
    const next: ReaderState = {
      ...state,
      page: { ...state.page, current: newPage },
    };

    const chapterId = getChapterId(next);
    const effects: ReaderEffect[] = [{ type: "SET_PAGE_CSS", page: newPage }];
    if (chapterId) {
      effects.push({
        type: "EMIT",
        event: "page:changed",
        payload: { bookId: next.bookId, chapterId, page: newPage, totalPages: state.page.total },
      });
    }
    return { state: next, effects };
  }

  // First page — go to last page of previous chapter
  const prevIdx = state.currentChapterIndex - 1;
  if (prevIdx < 0) return { state, effects: [] };

  const prevChapter = state.chapters[prevIdx];
  const next: ReaderState = {
    ...state,
    status: "loading-chapter",
    currentChapterIndex: prevIdx,
    page: { ...state.page, current: 0, total: 1, pendingTarget: -1 },
  };
  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: prevChapter.id },
  ];
  return { state: next, effects };
}

function goToChapterReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "GO_TO_CHAPTER" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const idx = findChapterIndex(state.chapters, action.chapterId);
  if (idx < 0) return { state, effects: [] };

  const next: ReaderState = {
    ...state,
    status: "loading-chapter",
    currentChapterIndex: idx,
    page: { ...state.page, current: 0, total: 1, pendingTarget: action.targetPage ?? null },
  };

  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: action.chapterId },
  ];

  return { state: next, effects };
}

function goToPageReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "GO_TO_PAGE" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  const page = clampPage(action.page, state.page.total);

  const next: ReaderState = {
    ...state,
    page: { ...state.page, current: page },
  };

  const chapterId = getChapterId(next);
  const effects: ReaderEffect[] = [{ type: "SET_PAGE_CSS", page }];
  if (chapterId) {
    effects.push({
      type: "EMIT",
      event: "page:changed",
      payload: { bookId: next.bookId, chapterId, page, totalPages: state.page.total },
    });
  }
  return { state: next, effects };
}

function setModeReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SET_MODE" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode === action.mode) return { state, effects: [] };

  const next: ReaderState = {
    ...state,
    mode: action.mode,
    page: { current: 0, total: 1, iframeWidth: 0, pendingTarget: null },
    scroll: {
      windowStart: state.currentChapterIndex,
      windowEnd: state.currentChapterIndex,
      progress: 0,
    },
    status: "loading-chapter",
  };

  const chapterId = getChapterId(next);
  const effects: ReaderEffect[] = [
    { type: "SET_MODE_CSS", mode: action.mode === "pagination" ? "paginated" : "scroll" },
  ];
  if (chapterId) {
    effects.push({ type: "FETCH_CHAPTER", bookId: state.bookId, chapterId });
  }
  return { state: next, effects };
}

function scrollProgressReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SCROLL_PROGRESS" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const next: ReaderState = {
    ...state,
    scroll: { ...state.scroll, progress: action.bookProgress },
  };

  const effects: ReaderEffect[] = [];

  if (action.visibleChapterId && action.visibleChapterId !== getChapterId(state)) {
    const idx = findChapterIndex(state.chapters, action.visibleChapterId);
    if (idx >= 0) {
      const previousChapterId = getChapterId(state);
      next.currentChapterIndex = idx;
      effects.push({
        type: "EMIT",
        event: "chapter:changed",
        payload: {
          bookId: state.bookId,
          chapterId: action.visibleChapterId,
          previousChapterId,
        },
      });
    }
  }

  return { state: next, effects };
}

function scrollWindowExpandedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SCROLL_WINDOW_EXPANDED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  return {
    state: {
      ...state,
      scroll: {
        ...state.scroll,
        windowStart: action.newStart,
        windowEnd: action.newEnd,
      },
    },
    effects: [],
  };
}

function cleanupReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterId = getChapterId(state);
  const effects: ReaderEffect[] = [];
  if (state.bookId) {
    effects.push({
      type: "EMIT",
      event: "reader:unmounted",
      payload: { bookId: state.bookId, chapterId },
    });
  }
  return { state: createInitialState(), effects };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main reducer
// ═══════════════════════════════════════════════════════════════════════════

export type ReducerResult = { state: ReaderState; effects: ReaderEffect[] };

export function reducer(state: ReaderState, action: ReaderAction): ReducerResult {
  switch (action.type) {
    case "INIT":
      return initReducer(state, action);
    case "CHAPTER_LOADED":
      return chapterLoadedReducer(state, action);
    case "CHAPTER_FAILED":
      return chapterFailedReducer(state, action);
    case "LAYOUT_MEASURED":
      return layoutMeasuredReducer(state, action);
    case "NEXT_PAGE":
      return nextPageReducer(state);
    case "PREV_PAGE":
      return prevPageReducer(state);
    case "GO_TO_CHAPTER":
      return goToChapterReducer(state, action);
    case "GO_TO_PAGE":
      return goToPageReducer(state, action);
    case "SET_MODE":
      return setModeReducer(state, action);
    case "SCROLL_PROGRESS":
      return scrollProgressReducer(state, action);
    case "SCROLL_WINDOW_EXPANDED":
      return scrollWindowExpandedReducer(state, action);
    case "CLEANUP":
      return cleanupReducer(state);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Machine factory
// ═══════════════════════════════════════════════════════════════════════════

export interface ReaderMachine {
  getState(): ReaderState;
  subscribe(fn: (state: ReaderState) => void): () => void;
  dispatch(action: ReaderAction): ReaderEffect[];
}

export function createReaderMachine(): ReaderMachine {
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
