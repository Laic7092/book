export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  order: number;
  inToc?: boolean;
}

/** Sentinel value indicating "go to the last page" when used as pendingTarget */
export const PENDING_TARGET_LAST_PAGE = -1;

export interface PageState {
  current: number;
  total: number;
  pendingTarget: number | null;
}

export interface ScrollState {
  progress: number;
}

export interface ReaderState {
  bookId: string;
  chapters: Chapter[];
  currentChapterIndex: number;
  mode: "pagination" | "scroll";
  status: "idle" | "loading" | "ready";

  page: PageState;
  scroll: ScrollState;
}

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
  | { type: "CHAPTER_LOADED"; chapterId: string; position?: "replace" | "append" | "prepend" }
  | { type: "CHAPTER_FAILED"; chapterId: string; error: string }
  | { type: "PAGE_COUNT_UPDATED"; total: number }
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
  | { type: "TEARDOWN" };

export type ReaderEffect =
  | { type: "FETCH_CHAPTER"; bookId: string; chapterId: string }
  | { type: "PAGE_POSITION_CHANGED"; page: number }
  | { type: "MODE_CHANGED"; mode: "paginated" | "scroll" }
  | { type: "CHAPTER_DID_CHANGE"; chapterId: string; previousChapterId: string | null }
  | { type: "PAGE_DID_CHANGE"; page: number; totalPages: number; chapterId: string }
  | { type: "CONTENT_DID_LOAD"; chapterId: string }
  | { type: "READER_UNMOUNTED"; bookId: string; chapterId: string | null };

export function createInitialState(): ReaderState {
  return {
    bookId: "",
    chapters: [],
    currentChapterIndex: -1,
    mode: "pagination",
    status: "idle",
    page: { current: 0, total: 0, pendingTarget: null },
    scroll: { progress: 0 },
  };
}

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

function chapterChangeEffects(
  state: ReaderState,
  chapterId: string,
  previousChapterId: string | null,
): ReaderEffect[] {
  const effects: ReaderEffect[] = [
    {
      type: "CHAPTER_DID_CHANGE",
      chapterId,
      previousChapterId,
    },
    {
      type: "PAGE_DID_CHANGE",
      chapterId,
      page: state.page.current,
      totalPages: state.page.total,
    },
    {
      type: "CONTENT_DID_LOAD",
      chapterId,
    },
  ];
  return effects;
}

function initReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "INIT" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterId = action.chapters[action.chapterIndex]?.id;
  if (!chapterId || action.chapters.length === 0) {
    return { state, effects: [] };
  }

  const next: ReaderState = {
    ...state,
    bookId: action.bookId,
    chapters: action.chapters,
    currentChapterIndex: action.chapterIndex,
    mode: action.mode,
    status: "loading",
    page: { current: 0, total: 0, pendingTarget: null, ...action.initialPage },
    scroll: {
      progress: 0,
      ...action.initialScroll,
    },
  };

  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: action.bookId, chapterId },
    { type: "MODE_CHANGED", mode: action.mode === "pagination" ? "paginated" : "scroll" },
  ];

  return { state: next, effects };
}

function chapterLoadedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_LOADED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterIdx = findChapterIndex(state.chapters, action.chapterId);
  if (chapterIdx < 0) {
    return { state, effects: [] };
  }

  const position = action.position ?? "replace";

  // Adjacent load (append/prepend) — don't change current chapter
  if (position === "append" || position === "prepend") {
    return {
      state,
      effects: [{ type: "CONTENT_DID_LOAD", chapterId: action.chapterId }],
    };
  }

  // Replace mode
  const previousChapterId = getChapterId(state);

  const next: ReaderState = {
    ...state,
    currentChapterIndex: chapterIdx,
    page: state.page,
    status: state.mode === "scroll" ? "ready" : state.status,
  };

  const effects: ReaderEffect[] = [];

  if (previousChapterId !== action.chapterId && previousChapterId) {
    effects.push(...chapterChangeEffects(next, action.chapterId, previousChapterId));
  } else {
    effects.push({ type: "CONTENT_DID_LOAD", chapterId: action.chapterId });
  }

  return { state: next, effects };
}

function chapterFailedReducer(
  state: ReaderState,
  _action: Extract<ReaderAction, { type: "CHAPTER_FAILED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  return { state: { ...state, status: "ready" }, effects: [] };
}

function pageCountUpdatedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "PAGE_COUNT_UPDATED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  const newTotal = Math.max(1, action.total);

  const pendingTarget = state.page.pendingTarget;
  const resolvedPage =
    pendingTarget !== null
      ? clampPage(pendingTarget, newTotal)
      : state.page.current >= newTotal
        ? Math.max(0, newTotal - 1)
        : state.page.current;

  const next: ReaderState = {
    ...state,
    status: "ready",
    page: {
      current: resolvedPage,
      total: newTotal,
      pendingTarget: null,
    },
  };

  const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page: resolvedPage }];

  const chapterId = getChapterId(next);
  if (chapterId) {
    effects.push({
      type: "PAGE_DID_CHANGE",
      chapterId,
      page: resolvedPage,
      totalPages: newTotal,
    });
  }

  return { state: next, effects };
}

function nextPageReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  if (state.status === "loading") return { state, effects: [] };

  const { current, total } = state.page;

  if (current < total - 1) {
    const newPage = current + 1;
    const next: ReaderState = {
      ...state,
      page: { ...state.page, current: newPage },
    };

    const chapterId = getChapterId(next);
    const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page: newPage }];
    if (chapterId) {
      effects.push({
        type: "PAGE_DID_CHANGE",
        chapterId,
        page: newPage,
        totalPages: total,
      });
    }
    return { state: next, effects };
  }

  const nextIdx = state.currentChapterIndex + 1;
  if (nextIdx >= state.chapters.length) return { state, effects: [] };

  const nextChapter = state.chapters[nextIdx];
  const next: ReaderState = {
    ...state,
    status: "loading",
    currentChapterIndex: nextIdx,
    page: { ...state.page, current: 0, total: 0, pendingTarget: null },
  };
  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: nextChapter.id },
  ];
  return { state: next, effects };
}

function prevPageReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  if (state.status === "loading") return { state, effects: [] };

  if (state.page.current > 0) {
    const newPage = state.page.current - 1;
    const next: ReaderState = {
      ...state,
      page: { ...state.page, current: newPage },
    };

    const chapterId = getChapterId(next);
    const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page: newPage }];
    if (chapterId) {
      effects.push({
        type: "PAGE_DID_CHANGE",
        chapterId,
        page: newPage,
        totalPages: state.page.total,
      });
    }
    return { state: next, effects };
  }

  const prevIdx = state.currentChapterIndex - 1;
  if (prevIdx < 0) return { state, effects: [] };

  const prevChapter = state.chapters[prevIdx];
  const next: ReaderState = {
    ...state,
    status: "loading",
    currentChapterIndex: prevIdx,
    page: { ...state.page, current: 0, total: 0, pendingTarget: PENDING_TARGET_LAST_PAGE },
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
    status: "loading",
    currentChapterIndex: idx,
    page: { ...state.page, current: 0, total: 0, pendingTarget: action.targetPage ?? null },
    scroll: state.scroll,
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
  const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page }];
  if (chapterId) {
    effects.push({
      type: "PAGE_DID_CHANGE",
      chapterId,
      page,
      totalPages: state.page.total,
    });
  }
  return { state: next, effects };
}

function setModeReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SET_MODE" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode === action.mode) return { state, effects: [] };

  const chapterId = getChapterId(state);

  const next: ReaderState = {
    ...state,
    mode: action.mode,
    page: { current: 0, total: 0, pendingTarget: null },
    scroll: { progress: 0 },
    status: "loading",
  };

  const effects: ReaderEffect[] = [
    { type: "MODE_CHANGED", mode: action.mode === "pagination" ? "paginated" : "scroll" },
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
        type: "CHAPTER_DID_CHANGE",
        chapterId: action.visibleChapterId,
        previousChapterId,
      });
    }
  }

  return { state: next, effects };
}

function teardownReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterId = getChapterId(state);
  const effects: ReaderEffect[] = [];
  if (state.bookId) {
    effects.push({
      type: "READER_UNMOUNTED",
      bookId: state.bookId,
      chapterId,
    });
  }
  return { state: createInitialState(), effects };
}

export type ReducerResult = { state: ReaderState; effects: ReaderEffect[] };

export function reducer(state: ReaderState, action: ReaderAction): ReducerResult {
  switch (action.type) {
    case "INIT":
      return initReducer(state, action);
    case "CHAPTER_LOADED":
      return chapterLoadedReducer(state, action);
    case "CHAPTER_FAILED":
      return chapterFailedReducer(state, action);
    case "PAGE_COUNT_UPDATED":
      return pageCountUpdatedReducer(state, action);
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
    case "TEARDOWN":
      return teardownReducer(state);
  }
}

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
