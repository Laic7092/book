export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  order: number;
  inToc?: boolean;
}

const PENDING_TARGET_LAST_PAGE = -1;

export interface PageState {
  current: number;
  total: number;
  pendingTarget: number | null;
}

export interface ReaderState {
  bookId: string;
  chapters: Chapter[];
  currentChapterIndex: number;
  mode: "pagination" | "scroll";
  status: "idle" | "loading" | "ready" | "error";

  page: PageState;
  /** In scroll mode: progress within the current chapter (0..1), not whole-book. */
  scrollProgress: number;
  /** Viewport-top offset inside the chapter (0..1), for exact restore. */
  scrollAnchor: number | undefined;
  lastError: string | null;
}

export type ReaderAction =
  | {
      type: "INIT";
      bookId: string;
      chapters: Chapter[];
      chapterIndex: number;
      mode: "pagination" | "scroll";
      initialPage?: Partial<PageState>;
      initialScroll?: Partial<{ progress: number; anchor?: number }>;
    }
  | { type: "CHAPTER_LOADED"; chapterId: string }
  | { type: "CHAPTER_FAILED"; chapterId: string; error: string }
  | { type: "PAGE_COUNT_UPDATED"; chapterId: string; total: number }
  | { type: "NEXT_PAGE" }
  | { type: "PREV_PAGE" }
  | { type: "GO_TO_CHAPTER"; chapterId: string; targetPage?: number }
  | { type: "GO_TO_PAGE"; page: number }
  | { type: "SET_MODE"; mode: "pagination" | "scroll" }
  | { type: "SCROLL_PROGRESS"; bookProgress: number; anchor?: number }
  | { type: "SET_CURRENT_CHAPTER"; chapterId: string }
  | { type: "RETRY" }
  | { type: "TEARDOWN" };

export type ReaderEffect =
  | { type: "FETCH_CHAPTER"; bookId: string; chapterId: string }
  | { type: "SCROLL_PROGRESS_UPDATED"; progress: number; anchor?: number }
  | { type: "PAGE_POSITION_CHANGED"; page: number }
  | { type: "MODE_CHANGED"; mode: "pagination" | "scroll" }
  | { type: "CHAPTER_DID_CHANGE"; chapterId: string; previousChapterId: string | null }
  | { type: "PAGE_DID_CHANGE"; page: number; totalPages: number; chapterId: string }
  | { type: "CONTENT_DID_LOAD"; chapterId: string }
  | {
      type: "READER_UNMOUNTED";
      bookId: string;
      chapterId: string | null;
      chapterIndex: number;
      mode: "pagination" | "scroll";
      page: number;
      scrollProgress: number;
      scrollAnchor: number | undefined;
    };

export function createInitialState(): ReaderState {
  return {
    bookId: "",
    chapters: [],
    currentChapterIndex: -1,
    mode: "pagination",
    status: "idle",
    page: { current: 0, total: 0, pendingTarget: null },
    scrollProgress: 0,
    scrollAnchor: undefined,
    lastError: null,
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

// ── Reducers ──

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
    scrollProgress: action.initialScroll?.progress ?? 0,
    scrollAnchor: action.initialScroll?.anchor,
    lastError: null,
  };

  return {
    state: next,
    effects: [
      { type: "FETCH_CHAPTER", bookId: action.bookId, chapterId },
      { type: "MODE_CHANGED", mode: action.mode },
    ],
  };
}

function chapterLoadedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_LOADED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterIdx = findChapterIndex(state.chapters, action.chapterId);
  if (chapterIdx < 0) return { state, effects: [] };

  // Ignore stale responses for chapters we've navigated away from
  if (action.chapterId !== getChapterId(state)) return { state, effects: [] };

  const prevChapterId = getChapterId(state);

  const next: ReaderState = {
    ...state,
    currentChapterIndex: chapterIdx,
    page: state.page,
    status: state.mode === "scroll" ? "ready" : state.status,
  };

  const effects: ReaderEffect[] = [];
  if (prevChapterId !== action.chapterId && prevChapterId) {
    effects.push(
      { type: "CHAPTER_DID_CHANGE", chapterId: action.chapterId, previousChapterId: prevChapterId },
      {
        type: "PAGE_DID_CHANGE",
        chapterId: action.chapterId,
        page: next.page.current,
        totalPages: next.page.total,
      },
      { type: "CONTENT_DID_LOAD", chapterId: action.chapterId },
    );
  } else {
    effects.push({ type: "CONTENT_DID_LOAD", chapterId: action.chapterId });
  }

  return { state: next, effects };
}

function chapterFailedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "CHAPTER_FAILED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  return {
    state: { ...state, status: "error", lastError: action.error },
    effects: [],
  };
}

function pageCountUpdatedReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "PAGE_COUNT_UPDATED" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination") return { state, effects: [] };
  if (action.chapterId !== getChapterId(state)) return { state, effects: [] };
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
    page: { current: resolvedPage, total: newTotal, pendingTarget: null },
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
  if (state.mode !== "pagination" || state.status === "loading") return { state, effects: [] };

  const { current, total } = state.page;

  if (current < total - 1) {
    if (state.status !== "ready") return { state, effects: [] };
    const newPage = current + 1;
    const next: ReaderState = { ...state, page: { ...state.page, current: newPage } };
    const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page: newPage }];
    const chapterId = getChapterId(next);
    if (chapterId) {
      effects.push({ type: "PAGE_DID_CHANGE", chapterId, page: newPage, totalPages: total });
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
    lastError: null,
  };
  return {
    state: next,
    effects: [{ type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: nextChapter.id }],
  };
}

function prevPageReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination" || state.status === "loading") return { state, effects: [] };

  if (state.page.current > 0) {
    if (state.status !== "ready") return { state, effects: [] };
    const newPage = state.page.current - 1;
    const next: ReaderState = { ...state, page: { ...state.page, current: newPage } };
    const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page: newPage }];
    const chapterId = getChapterId(next);
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
    lastError: null,
  };
  return {
    state: next,
    effects: [{ type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: prevChapter.id }],
  };
}

function goToChapterReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "GO_TO_CHAPTER" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const idx = findChapterIndex(state.chapters, action.chapterId);
  if (idx < 0) return { state, effects: [] };

  const prevChapterId = getChapterId(state);
  const next: ReaderState = {
    ...state,
    status: "loading",
    currentChapterIndex: idx,
    page: { ...state.page, current: 0, total: 0, pendingTarget: action.targetPage ?? null },
    scrollProgress: 0,
    scrollAnchor: undefined,
    lastError: null,
  };

  // Notify chapter change immediately (plugins save progress on chapter:changed;
  // the later CHAPTER_LOADED can't tell the chapter actually changed, since
  // currentChapterIndex was already updated here).
  const effects: ReaderEffect[] = [
    { type: "FETCH_CHAPTER", bookId: state.bookId, chapterId: action.chapterId },
  ];
  if (prevChapterId && prevChapterId !== action.chapterId) {
    effects.push({
      type: "CHAPTER_DID_CHANGE",
      chapterId: action.chapterId,
      previousChapterId: prevChapterId,
    });
  }

  return { state: next, effects };
}

function goToPageReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "GO_TO_PAGE" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode !== "pagination" || state.status !== "ready") return { state, effects: [] };
  const page = clampPage(action.page, state.page.total);

  const next: ReaderState = { ...state, page: { ...state.page, current: page } };
  const effects: ReaderEffect[] = [{ type: "PAGE_POSITION_CHANGED", page }];
  const chapterId = getChapterId(next);
  if (chapterId) {
    effects.push({ type: "PAGE_DID_CHANGE", chapterId, page, totalPages: state.page.total });
  }
  return { state: next, effects };
}

function setModeReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SET_MODE" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.mode === action.mode) return { state, effects: [] };
  if (state.status !== "ready") return { state, effects: [] };

  const next: ReaderState = {
    ...state,
    mode: action.mode,
    page: { current: 0, total: 0, pendingTarget: null },
    scrollProgress: 0,
    scrollAnchor: undefined,
  };

  return {
    state: next,
    effects: [{ type: "MODE_CHANGED", mode: action.mode }],
  };
}

function scrollProgressReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SCROLL_PROGRESS" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.status !== "ready") return { state, effects: [] };
  return {
    // anchor may be absent while the restored document is still settling;
    // keep the saved anchor rather than overwriting it with the clamped value.
    state: {
      ...state,
      scrollProgress: action.bookProgress,
      scrollAnchor: action.anchor !== undefined ? action.anchor : state.scrollAnchor,
    },
    // Notify so plugins can debounce-persist; no polling needed.
    effects: [
      { type: "SCROLL_PROGRESS_UPDATED", progress: action.bookProgress, anchor: action.anchor },
    ],
  };
}

function setCurrentChapterReducer(
  state: ReaderState,
  action: Extract<ReaderAction, { type: "SET_CURRENT_CHAPTER" }>,
): { state: ReaderState; effects: ReaderEffect[] } {
  const idx = findChapterIndex(state.chapters, action.chapterId);
  if (idx < 0 || idx === state.currentChapterIndex) return { state, effects: [] };

  const prevChapterId = getChapterId(state);
  const next: ReaderState = { ...state, currentChapterIndex: idx };

  return {
    state: next,
    effects: [
      { type: "CHAPTER_DID_CHANGE", chapterId: action.chapterId, previousChapterId: prevChapterId },
    ],
  };
}

function retryReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  if (state.status !== "error") return { state, effects: [] };

  const chapterId = getChapterId(state);
  if (!chapterId) return { state, effects: [] };

  const next: ReaderState = {
    ...state,
    status: "loading",
    page: { ...state.page, current: 0, total: 0, pendingTarget: null },
    lastError: null,
  };

  return {
    state: next,
    effects: [{ type: "FETCH_CHAPTER", bookId: state.bookId, chapterId }],
  };
}

function teardownReducer(state: ReaderState): { state: ReaderState; effects: ReaderEffect[] } {
  const chapterId = getChapterId(state);
  const effects: ReaderEffect[] = [];
  if (state.bookId) {
    // Snapshot the full position: the state is reset synchronously, so any
    // effect consumer reading it afterwards would see an empty machine.
    effects.push({
      type: "READER_UNMOUNTED",
      bookId: state.bookId,
      chapterId,
      chapterIndex: state.currentChapterIndex,
      mode: state.mode,
      page: state.page.current,
      scrollProgress: state.scrollProgress,
      scrollAnchor: state.scrollAnchor,
    });
  }
  return { state: createInitialState(), effects };
}

export function reducer(state: ReaderState, action: ReaderAction) {
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
    case "SET_CURRENT_CHAPTER":
      return setCurrentChapterReducer(state, action);
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
