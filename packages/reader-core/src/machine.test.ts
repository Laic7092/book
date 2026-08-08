import { expect, test, describe } from "vite-plus/test";
import {
  reducer,
  createInitialState,
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
} from "./machine";

const CHAPTERS = [
  { id: "ch1", bookId: "book1", title: "Chapter 1", order: 0, inToc: true },
  { id: "ch2", bookId: "book1", title: "Chapter 2", order: 1, inToc: true },
  { id: "ch3", bookId: "book1", title: "Chapter 3", order: 2, inToc: true },
];

function readyState(overrides?: Partial<ReaderState>): ReaderState {
  return {
    bookId: "book1",
    chapters: CHAPTERS,
    currentChapterIndex: 0,
    mode: "pagination",
    status: "ready",
    page: { current: 0, total: 10, pendingTarget: null },
    scrollProgress: 0,
    lastError: null,
    ...overrides,
  };
}

function dispatch(state: ReaderState, action: ReaderAction) {
  return reducer(state, action);
}

// ── Initial state ──

test("createInitialState returns idle state", () => {
  const state = createInitialState();
  expect(state.status).toBe("idle");
  expect(state.bookId).toBe("");
  expect(state.chapters).toEqual([]);
  expect(state.currentChapterIndex).toBe(-1);
  expect(state.page.current).toBe(0);
  expect(state.page.total).toBe(0);
  expect(state.lastError).toBeNull();
});

// ── INIT ──

describe("INIT", () => {
  test("transitions to loading and emits FETCH_CHAPTER + MODE_CHANGED", () => {
    const result = dispatch(createInitialState(), {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      mode: "pagination",
    });

    expect(result.state.status).toBe("loading");
    expect(result.state.bookId).toBe("book1");
    expect(result.state.currentChapterIndex).toBe(0);
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch1",
    });
    expect(result.effects).toContainEqual({ type: "MODE_CHANGED", mode: "paginated" });
  });

  test("scroll mode emits MODE_CHANGED with scroll", () => {
    const result = dispatch(createInitialState(), {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 1,
      mode: "scroll",
    });

    expect(result.state.mode).toBe("scroll");
    expect(result.effects).toContainEqual({ type: "MODE_CHANGED", mode: "scroll" });
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch2",
    });
  });

  test("restores initial page and scroll state", () => {
    const result = dispatch(createInitialState(), {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      mode: "pagination",
      initialPage: { current: 5, total: 10 },
      initialScroll: { progress: 0.5 },
    });

    expect(result.state.page.current).toBe(5);
    expect(result.state.page.total).toBe(10);
    expect(result.state.scrollProgress).toBe(0.5);
  });

  test("no-ops with empty chapters", () => {
    const initial = createInitialState();
    const result = dispatch(initial, {
      type: "INIT",
      bookId: "book1",
      chapters: [],
      chapterIndex: 0,
      mode: "pagination",
    });

    expect(result.state).toBe(initial);
    expect(result.effects).toEqual([]);
  });
});

// ── CHAPTER_LOADED ──

describe("CHAPTER_LOADED", () => {
  test("emits CONTENT_DID_LOAD and stays loading in pagination mode", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });

    expect(result.state.status).toBe("loading"); // waits for PAGE_COUNT_UPDATED
    expect(result.effects).toContainEqual({ type: "CONTENT_DID_LOAD", chapterId: "ch1" });
  });

  test("emits CONTENT_DID_LOAD and transitions to ready in scroll mode", () => {
    const state = readyState({ status: "loading", mode: "scroll" });
    const result = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });

    expect(result.state.status).toBe("ready");
    expect(result.effects).toContainEqual({ type: "CONTENT_DID_LOAD", chapterId: "ch1" });
  });

  test("stays loading in pagination mode until PAGE_COUNT_UPDATED", () => {
    const state = readyState({ status: "loading", mode: "pagination" });
    const result = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });

    expect(result.state.status).toBe("loading");
  });

  test("transitions to ready in scroll mode", () => {
    const state = readyState({ status: "loading", mode: "scroll" });
    const result = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });

    expect(result.state.status).toBe("ready");
  });

  test("ignores stale responses for chapters navigated away from", () => {
    const state = readyState({ status: "loading", currentChapterIndex: 2 });
    const result = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("ignores unknown chapter IDs", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "unknown" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

// ── CHAPTER_FAILED ──

describe("CHAPTER_FAILED", () => {
  test("sets status to error and stores error message", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, {
      type: "CHAPTER_FAILED",
      chapterId: "ch1",
      error: "Network error",
    });

    expect(result.state.status).toBe("error");
    expect(result.state.lastError).toBe("Network error");
    expect(result.effects).toEqual([]);
  });
});

// ── PAGE_COUNT_UPDATED ──

describe("PAGE_COUNT_UPDATED", () => {
  test("transitions to ready and emits PAGE_POSITION_CHANGED + PAGE_DID_CHANGE", () => {
    const state = readyState({
      status: "loading",
      page: { current: 0, total: 0, pendingTarget: null },
    });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 15 });

    expect(result.state.status).toBe("ready");
    expect(result.state.page.total).toBe(15);
    expect(result.state.page.current).toBe(0);
    expect(result.effects).toContainEqual({ type: "PAGE_POSITION_CHANGED", page: 0 });
    expect(result.effects).toContainEqual({
      type: "PAGE_DID_CHANGE",
      chapterId: "ch1",
      page: 0,
      totalPages: 15,
    });
  });

  test("clamps page to new total if current exceeds it", () => {
    const state = readyState({
      status: "loading",
      page: { current: 12, total: 12, pendingTarget: null },
    });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 5 });

    expect(result.state.page.current).toBe(4);
    expect(result.state.page.total).toBe(5);
  });

  test("resolves pendingTarget", () => {
    const state = readyState({
      status: "loading",
      page: { current: 0, total: 0, pendingTarget: 3 },
    });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 10 });

    expect(result.state.page.current).toBe(3);
    expect(result.state.page.pendingTarget).toBeNull();
  });

  test("resolves PENDING_TARGET_LAST_PAGE to last page", () => {
    const state = readyState({
      status: "loading",
      page: { current: 0, total: 0, pendingTarget: -1 },
    });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 10 });

    expect(result.state.page.current).toBe(9);
  });

  test("ensures total is at least 1", () => {
    const state = readyState({
      status: "loading",
      page: { current: 0, total: 0, pendingTarget: null },
    });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 0 });

    expect(result.state.page.total).toBe(1);
  });

  test("ignored when not in pagination mode", () => {
    const state = readyState({ status: "loading", mode: "scroll" });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 10 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("ignored for stale chapter", () => {
    const state = readyState({ status: "loading", currentChapterIndex: 1 });
    const result = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 10 });

    expect(result.effects).toEqual([]);
  });
});

// ── NEXT_PAGE ──

describe("NEXT_PAGE", () => {
  test("increments page within chapter", () => {
    const state = readyState();
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state.page.current).toBe(1);
    expect(result.effects).toContainEqual({ type: "PAGE_POSITION_CHANGED", page: 1 });
    expect(result.effects).toContainEqual({
      type: "PAGE_DID_CHANGE",
      chapterId: "ch1",
      page: 1,
      totalPages: 10,
    });
  });

  test("crosses chapter boundary on last page", () => {
    const state = readyState({ page: { current: 9, total: 10, pendingTarget: null } });
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state.status).toBe("loading");
    expect(result.state.currentChapterIndex).toBe(1);
    expect(result.state.page.current).toBe(0);
    expect(result.state.page.total).toBe(0);
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch2",
    });
  });

  test("no-ops at end of book", () => {
    const state = readyState({
      currentChapterIndex: 2,
      page: { current: 9, total: 10, pendingTarget: null },
    });
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops in scroll mode", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops when loading", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops for same-chapter page turn when in error", () => {
    const state = readyState({ status: "error", lastError: "fail" });
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("recovers from error via cross-chapter navigation", () => {
    const state = readyState({
      status: "error",
      lastError: "fail",
      page: { current: 9, total: 10, pendingTarget: null },
    });
    const result = dispatch(state, { type: "NEXT_PAGE" });

    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
    expect(result.state.currentChapterIndex).toBe(1);
  });
});

// ── PREV_PAGE ──

describe("PREV_PAGE", () => {
  test("decrements page within chapter", () => {
    const state = readyState({ page: { current: 5, total: 10, pendingTarget: null } });
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.state.page.current).toBe(4);
    expect(result.effects).toContainEqual({ type: "PAGE_POSITION_CHANGED", page: 4 });
  });

  test("crosses chapter boundary with PENDING_TARGET_LAST_PAGE on first page", () => {
    const state = readyState();
    const result = dispatch(state, { type: "PREV_PAGE" });

    // At current=0, prevIndex=0-1=-1, so no-op at start of book
    expect(result.effects).toEqual([]);
  });

  test("crosses chapter boundary backward from chapter 2", () => {
    const state = readyState({
      currentChapterIndex: 1,
      page: { current: 0, total: 8, pendingTarget: null },
    });
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.state.status).toBe("loading");
    expect(result.state.currentChapterIndex).toBe(0);
    expect(result.state.page.pendingTarget).toBe(-1); // PENDING_TARGET_LAST_PAGE
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch1",
    });
  });

  test("no-ops at start of book", () => {
    const state = readyState();
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.effects).toEqual([]);
  });

  test("no-ops in scroll mode", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops when loading", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops for same-chapter page turn when in error", () => {
    const state = readyState({
      status: "error",
      lastError: "fail",
      page: { current: 5, total: 10, pendingTarget: null },
    });
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("recovers from error via cross-chapter backward navigation", () => {
    const state = readyState({
      status: "error",
      lastError: "fail",
      currentChapterIndex: 1,
      page: { current: 0, total: 8, pendingTarget: null },
    });
    const result = dispatch(state, { type: "PREV_PAGE" });

    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
    expect(result.state.currentChapterIndex).toBe(0);
  });
});

// ── GO_TO_CHAPTER ──

describe("GO_TO_CHAPTER", () => {
  test("navigates to target chapter and emits FETCH_CHAPTER", () => {
    const state = readyState();
    const result = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "ch2" });

    expect(result.state.status).toBe("loading");
    expect(result.state.currentChapterIndex).toBe(1);
    expect(result.state.page.current).toBe(0);
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch2",
    });
  });

  test("passes targetPage as pendingTarget", () => {
    const state = readyState();
    const result = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "ch2", targetPage: 3 });

    expect(result.state.page.pendingTarget).toBe(3);
  });

  test("clears error status", () => {
    const state = readyState({ status: "error", lastError: "fail" });
    const result = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "ch2" });

    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
  });

  test("emits CHAPTER_DID_CHANGE when switching to a different chapter", () => {
    const state = readyState();
    const result = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "ch2" });

    expect(result.effects).toContainEqual({
      type: "CHAPTER_DID_CHANGE",
      chapterId: "ch2",
      previousChapterId: "ch1",
    });
  });

  test("no CHAPTER_DID_CHANGE when re-loading the current chapter", () => {
    const state = readyState({ currentChapterIndex: 0 });
    const result = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "ch1" });

    expect(result.effects.some((e) => e.type === "CHAPTER_DID_CHANGE")).toBe(false);
  });

  test("no-ops for unknown chapter", () => {
    const state = readyState();
    const result = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "unknown" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

// ── GO_TO_PAGE ──

describe("GO_TO_PAGE", () => {
  test("jumps to target page within current chapter", () => {
    const state = readyState();
    const result = dispatch(state, { type: "GO_TO_PAGE", page: 7 });

    expect(result.state.page.current).toBe(7);
    expect(result.effects).toContainEqual({ type: "PAGE_POSITION_CHANGED", page: 7 });
  });

  test("clamps to valid range", () => {
    const state = readyState();
    const result = dispatch(state, { type: "GO_TO_PAGE", page: 999 });

    expect(result.state.page.current).toBe(9);
  });

  test("no-ops in scroll mode", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "GO_TO_PAGE", page: 3 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops when not ready (error)", () => {
    const state = readyState({ status: "error", lastError: "fail" });
    const result = dispatch(state, { type: "GO_TO_PAGE", page: 3 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

// ── SET_MODE ──

describe("SET_MODE", () => {
  test("switches from pagination to scroll without refetching", () => {
    const state = readyState();
    const result = dispatch(state, { type: "SET_MODE", mode: "scroll" });

    expect(result.state.mode).toBe("scroll");
    expect(result.state.status).toBe("ready"); // stays ready — no refetch needed
    expect(result.effects).toContainEqual({ type: "MODE_CHANGED", mode: "scroll" });
    expect(result.effects).not.toContainEqual(expect.objectContaining({ type: "FETCH_CHAPTER" }));
  });

  test("switches from scroll to pagination without refetching", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "SET_MODE", mode: "pagination" });

    expect(result.state.mode).toBe("pagination");
    expect(result.state.status).toBe("ready");
    expect(result.effects).toContainEqual({ type: "MODE_CHANGED", mode: "paginated" });
    expect(result.effects).not.toContainEqual(expect.objectContaining({ type: "FETCH_CHAPTER" }));
  });

  test("no-ops when already in target mode", () => {
    const state = readyState();
    const result = dispatch(state, { type: "SET_MODE", mode: "pagination" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops when not ready (error)", () => {
    const state = readyState({ status: "error", lastError: "fail" });
    const result = dispatch(state, { type: "SET_MODE", mode: "scroll" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

// ── SCROLL_PROGRESS ──

describe("SCROLL_PROGRESS", () => {
  test("updates scroll progress when ready", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "SCROLL_PROGRESS", bookProgress: 0.75 });

    expect(result.state.scrollProgress).toBe(0.75);
    expect(result.effects).toEqual([{ type: "SCROLL_PROGRESS_UPDATED", progress: 0.75 }]);
  });

  test("ignored when loading", () => {
    const state = readyState({ mode: "scroll", status: "loading" });
    const result = dispatch(state, { type: "SCROLL_PROGRESS", bookProgress: 0.5 });

    expect(result.state).toBe(state);
  });

  test("ignored when in error", () => {
    const state = readyState({ mode: "scroll", status: "error", lastError: "fail" });
    const result = dispatch(state, { type: "SCROLL_PROGRESS", bookProgress: 0.5 });

    expect(result.state).toBe(state);
  });
});

// ── SET_CURRENT_CHAPTER ──

describe("SET_CURRENT_CHAPTER", () => {
  test("updates chapter index and emits CHAPTER_DID_CHANGE", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "SET_CURRENT_CHAPTER", chapterId: "ch2" });

    expect(result.state.currentChapterIndex).toBe(1);
    expect(result.effects).toContainEqual({
      type: "CHAPTER_DID_CHANGE",
      chapterId: "ch2",
      previousChapterId: "ch1",
    });
  });

  test("no-ops for same chapter", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "SET_CURRENT_CHAPTER", chapterId: "ch1" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops for unknown chapter", () => {
    const state = readyState({ mode: "scroll" });
    const result = dispatch(state, { type: "SET_CURRENT_CHAPTER", chapterId: "unknown" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

// ── TEARDOWN ──

describe("TEARDOWN", () => {
  test("resets state and emits READER_UNMOUNTED", () => {
    const state = readyState();
    const result = dispatch(state, { type: "TEARDOWN" });

    expect(result.state.status).toBe("idle");
    expect(result.state.bookId).toBe("");
    expect(result.effects).toContainEqual({
      type: "READER_UNMOUNTED",
      bookId: "book1",
      chapterId: "ch1",
      chapterIndex: 0,
      mode: "pagination",
      page: 0,
      scrollProgress: 0,
    });
  });

  test("no READER_UNMOUNTED when bookId is empty", () => {
    const result = dispatch(createInitialState(), { type: "TEARDOWN" });

    expect(result.effects).toEqual([]);
  });
});

// ── createReaderMachine ──

describe("createReaderMachine", () => {
  test("dispatch returns effects and updates state", () => {
    const machine = createReaderMachine();
    const effects = machine.dispatch({
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      mode: "pagination",
    });

    expect(effects.length).toBeGreaterThan(0);
    expect(machine.getState().bookId).toBe("book1");
  });

  test("subscribe receives state updates", () => {
    const machine = createReaderMachine();
    const states: ReaderState[] = [];
    machine.subscribe((s) => states.push(s));

    machine.dispatch({
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      mode: "pagination",
    });

    expect(states.length).toBe(1);
    expect(states[0].bookId).toBe("book1");
  });

  test("unsubscribe stops receiving updates", () => {
    const machine = createReaderMachine();
    const states: ReaderState[] = [];
    const unsub = machine.subscribe((s) => states.push(s));

    // First dispatch — should be received
    machine.dispatch({
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      mode: "pagination",
    });
    expect(states.length).toBe(1);

    unsub();
    machine.dispatch({ type: "CHAPTER_LOADED", chapterId: "ch1" });
    expect(states.length).toBe(1);
  });
});

// ── Full lifecycle integration ──

describe("full lifecycle", () => {
  test("INIT → CHAPTER_LOADED → PAGE_COUNT_UPDATED reaches ready", () => {
    let state = createInitialState();

    const r1 = dispatch(state, {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      mode: "pagination",
    });
    state = r1.state;
    expect(state.status).toBe("loading");

    const r2 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });
    state = r2.state;
    expect(state.status).toBe("loading"); // still loading in pagination mode

    const r3 = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 12 });
    expect(r3.state.status).toBe("ready");
    expect(r3.state.page.total).toBe(12);
  });

  test("error recovery: FAILED → GO_TO_CHAPTER → CHAPTER_LOADED → PAGE_COUNT_UPDATED", () => {
    let state = readyState();

    const r1 = dispatch(state, {
      type: "CHAPTER_FAILED",
      chapterId: "ch1",
      error: "Boom",
    });
    state = r1.state;
    expect(state.status).toBe("error");

    // Navigate away to recover
    const r2 = dispatch(state, { type: "GO_TO_CHAPTER", chapterId: "ch2" });
    state = r2.state;
    expect(state.status).toBe("loading");
    expect(state.lastError).toBeNull();

    const r3 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch2" });
    state = r3.state;

    const r4 = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch2", total: 5 });
    expect(r4.state.status).toBe("ready");
  });

  test("error recovery: FAILED → NEXT_PAGE cross-chapter", () => {
    const state = readyState({
      status: "error",
      lastError: "Boom",
      page: { current: 9, total: 10, pendingTarget: null },
    });

    const result = dispatch(state, { type: "NEXT_PAGE" });
    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
    expect(result.state.currentChapterIndex).toBe(1);
  });

  test("error recovery: FAILED → RETRY", () => {
    const state = readyState({ status: "error", lastError: "Boom" });

    const result = dispatch(state, { type: "RETRY" });
    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch1",
    });
  });

  test("RETRY no-ops when not in error", () => {
    const state = readyState();
    const result = dispatch(state, { type: "RETRY" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("prevPage across chapter resolves to last page via PENDING_TARGET_LAST_PAGE", () => {
    let state = readyState({ currentChapterIndex: 1 });

    // Previous page on first page of chapter 2 → go to chapter 1
    const r1 = dispatch(state, { type: "PREV_PAGE" });
    state = r1.state;
    expect(state.currentChapterIndex).toBe(0);
    expect(state.page.pendingTarget).toBe(-1);

    // Chapter loaded, page count received — should land on last page
    const r2 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });
    state = r2.state;

    const r3 = dispatch(state, { type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 15 });
    expect(r3.state.status).toBe("ready");
    expect(r3.state.page.current).toBe(14);
  });
});
