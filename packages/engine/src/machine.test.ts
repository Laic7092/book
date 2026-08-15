import { expect, test, describe } from "vite-plus/test";
import {
  reducer,
  createInitialState,
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
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
    position: { chapterIndex: 0, progress: 0 },
    status: "ready",
    lastError: null,
    presentation: { mode: "pagination", page: 0, total: 10 },
    pendingSeek: null,
    ...overrides,
  };
}

function dispatch(state: ReaderState, action: ReaderAction) {
  return reducer(state, action);
}

function effectsOf(...types: ReaderEffect["type"][]): ReaderEffect[] {
  return types.map((type) => expect.objectContaining({ type }));
}

function posChanged(chapterId: string | null, prev: string | null) {
  return expect.objectContaining({ type: "POSITION_CHANGED", chapterId, previousChapterId: prev });
}

// ── Initial state ──

test("createInitialState returns idle state", () => {
  const state = createInitialState();
  expect(state.status).toBe("idle");
  expect(state.bookId).toBe("");
  expect(state.chapters).toEqual([]);
  expect(state.position).toEqual({ chapterIndex: -1, progress: 0 });
  expect(state.lastError).toBeNull();
});

// ── INIT ──

describe("INIT", () => {
  test("transitions to loading and emits FETCH_CHAPTER", () => {
    const result = dispatch(createInitialState(), {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
    });

    expect(result.state.status).toBe("loading");
    expect(result.state.bookId).toBe("book1");
    expect(result.state.position.chapterIndex).toBe(0);
    expect(result.state.position.progress).toBe(0);
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch1",
    });
  });

  test("restores exact scroll position from initialPosition", () => {
    const result = dispatch(createInitialState(), {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 1,
      initialPosition: { progress: 0.5, anchor: 0.25 },
    });

    expect(result.state.position).toEqual({ chapterIndex: 1, progress: 0.5, anchor: 0.25 });
    expect(result.state.pendingSeek).toBeNull();
  });

  test("stores initialPage as pendingSeek until measured", () => {
    const result = dispatch(createInitialState(), {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
      initialPage: 7,
    });

    expect(result.state.pendingSeek).toEqual({ chapterIndex: 0, page: 7 });
    expect(result.state.position.progress).toBe(0);
  });

  test("no-ops with empty chapters", () => {
    const initial = createInitialState();
    const result = dispatch(initial, {
      type: "INIT",
      bookId: "book1",
      chapters: [],
      chapterIndex: 0,
    });

    expect(result.state).toBe(initial);
    expect(result.effects).toEqual([]);
  });
});

// ── SEEK ──

describe("SEEK", () => {
  test("same-chapter page seek resolves to progress and emits POSITION_CHANGED", () => {
    const result = dispatch(readyState(), { type: "SEEK", chapterIndex: 0, page: 5 });

    expect(result.state.position).toEqual({ chapterIndex: 0, progress: 0.5 });
    expect(result.state.presentation.page).toBe(5);
    expect(result.state.status).toBe("ready");
    expect(result.effects).toEqual([posChanged("ch1", "ch1")]);
  });

  test("same-chapter progress seek clamps to 0..1", () => {
    const result = dispatch(readyState(), { type: "SEEK", chapterIndex: 0, progress: 1.5 });

    expect(result.state.position.progress).toBe(1);
    expect(result.state.presentation.page).toBe(9); // progressToPage(1, 10)
  });

  test("page seek clamps to valid range", () => {
    const result = dispatch(readyState(), { type: "SEEK", chapterIndex: 0, page: 999 });

    expect(result.state.position.progress).toBe(0.9);
    expect(result.state.presentation.page).toBe(9);
  });

  test("page -1 resolves to last page", () => {
    const result = dispatch(readyState(), { type: "SEEK", chapterIndex: 0, page: -1 });

    expect(result.state.position.progress).toBe(0.9);
    expect(result.state.presentation.page).toBe(9);
  });

  test("cross-chapter seek goes loading, fetches and reports the chapter change", () => {
    const state = readyState({ position: { chapterIndex: 0, progress: 0.5 } });
    const result = dispatch(state, { type: "SEEK", chapterIndex: 2, page: 3 });

    expect(result.state.status).toBe("loading");
    expect(result.state.position).toEqual({ chapterIndex: 2, progress: 0 });
    expect(result.state.presentation).toEqual({ mode: "pagination", page: 0, total: 0 });
    expect(result.state.pendingSeek).toEqual({ chapterIndex: 2, page: 3 });
    expect(result.state.lastError).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch3",
    });
    expect(result.effects).toContainEqual(posChanged("ch3", "ch1"));
    // The chapter change is reported BEFORE the fetch: the fetch's nested
    // dispatches (MEASURED resolution) must land after this stale snapshot.
    expect(result.effects.map((e) => e.type)).toEqual(["POSITION_CHANGED", "FETCH_CHAPTER"]);
  });

  test("cross-chapter progress seek keeps progress immediately", () => {
    const result = dispatch(readyState(), { type: "SEEK", chapterIndex: 1, progress: 0.4 });

    expect(result.state.position).toEqual({ chapterIndex: 1, progress: 0.4 });
    expect(result.state.pendingSeek).toBeNull();
  });

  test("no-ops for invalid chapter index", () => {
    const state = readyState();
    const result = dispatch(state, { type: "SEEK", chapterIndex: 99, page: 1 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no-ops at negative chapter index (book start)", () => {
    const state = readyState();
    const result = dispatch(state, { type: "SEEK", chapterIndex: -1, page: -1 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("same-chapter seek while loading stores pendingSeek", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, { type: "SEEK", chapterIndex: 0, page: 4 });

    expect(result.state.pendingSeek).toEqual({ chapterIndex: 0, page: 4 });
    expect(result.effects).toEqual([]);
  });

  test("same-chapter seek in error state no-ops", () => {
    const state = readyState({ status: "error", lastError: "Boom" });
    const result = dispatch(state, { type: "SEEK", chapterIndex: 0, page: 4 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("cross-chapter seek recovers from error", () => {
    const state = readyState({ status: "error", lastError: "Boom" });
    const result = dispatch(state, { type: "SEEK", chapterIndex: 1 });

    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
  });

  test("SEEK in scroll presentation keeps page readout untouched", () => {
    const state = readyState({
      position: { chapterIndex: 0, progress: 0.2 },
      presentation: { mode: "scroll", page: 0, total: 0 },
    });
    const result = dispatch(state, { type: "SEEK", chapterIndex: 0, progress: 0.7 });

    expect(result.state.position.progress).toBe(0.7);
    expect(result.state.presentation).toEqual({ mode: "scroll", page: 0, total: 0 });
  });
});

// ── POSITION_REPORT ──

describe("POSITION_REPORT", () => {
  test("updates position and emits POSITION_CHANGED", () => {
    const result = dispatch(readyState({ presentation: { mode: "scroll", page: 0, total: 0 } }), {
      type: "POSITION_REPORT",
      chapterIndex: 0,
      progress: 0.75,
      anchor: 0.6,
    });

    expect(result.state.position).toEqual({ chapterIndex: 0, progress: 0.75, anchor: 0.6 });
    expect(result.effects).toEqual([posChanged("ch1", "ch1")]);
  });

  test("reports visible chapter change without fetching", () => {
    const result = dispatch(readyState({ position: { chapterIndex: 0, progress: 0.9 } }), {
      type: "POSITION_REPORT",
      chapterIndex: 1,
      progress: 0.1,
      anchor: 0.05,
    });

    expect(result.state.position.chapterIndex).toBe(1);
    expect(result.effects).toEqual([posChanged("ch2", "ch1")]);
    expect(result.effects.some((e) => e.type === "FETCH_CHAPTER")).toBe(false);
  });

  test("keeps saved anchor when none is reported", () => {
    const state = readyState({
      position: { chapterIndex: 0, progress: 0.5, anchor: 0.4 },
    });
    const result = dispatch(state, { type: "POSITION_REPORT", chapterIndex: 0, progress: 0.55 });

    expect(result.state.position.anchor).toBe(0.4);
  });

  test("no-ops when nothing changed", () => {
    const state = readyState({ position: { chapterIndex: 0, progress: 0.5 } });
    const result = dispatch(state, { type: "POSITION_REPORT", chapterIndex: 0, progress: 0.5 });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("ignored when loading", () => {
    const state = readyState({ status: "loading" });
    const result = dispatch(state, { type: "POSITION_REPORT", chapterIndex: 0, progress: 0.5 });

    expect(result.state).toBe(state);
  });

  test("ignored when in error", () => {
    const state = readyState({ status: "error", lastError: "Boom" });
    const result = dispatch(state, { type: "POSITION_REPORT", chapterIndex: 0, progress: 0.5 });

    expect(result.state).toBe(state);
  });
});

// ── CHAPTER_LOADED ──

describe("CHAPTER_LOADED", () => {
  test("emits CONTENT_READY and stays loading (ready comes from MEASURED)", () => {
    const result = dispatch(readyState({ status: "loading" }), {
      type: "CHAPTER_LOADED",
      chapterId: "ch1",
    });

    expect(result.state.status).toBe("loading");
    expect(result.effects).toEqual([{ type: "CONTENT_READY", chapterId: "ch1" }]);
  });

  test("ignores stale responses for chapters navigated away from", () => {
    const state = readyState({ status: "loading", position: { chapterIndex: 2, progress: 0 } });
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
  test("sets status to error and stores the message", () => {
    const result = dispatch(readyState({ status: "loading" }), {
      type: "CHAPTER_FAILED",
      chapterId: "ch1",
      error: "Network error",
    });

    expect(result.state.status).toBe("error");
    expect(result.state.lastError).toBe("Network error");
    expect(result.effects).toEqual([]);
  });

  test("ignores stale failures", () => {
    const state = readyState({ status: "loading", position: { chapterIndex: 1, progress: 0 } });
    const result = dispatch(state, { type: "CHAPTER_FAILED", chapterId: "ch1", error: "x" });

    expect(result.state).toBe(state);
  });
});

// ── MEASURED ──

describe("MEASURED", () => {
  test("transitions to ready and emits POSITION_CHANGED with presentation", () => {
    const state = readyState({
      status: "loading",
      presentation: { mode: "pagination", page: 0, total: 0 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 15,
      mode: "pagination",
    });

    expect(result.state.status).toBe("ready");
    expect(result.state.presentation).toEqual({ mode: "pagination", page: 0, total: 15 });
    expect(result.effects).toEqual([posChanged("ch1", "ch1")]);
  });

  test("resolves pendingSeek page target", () => {
    const state = readyState({
      status: "loading",
      position: { chapterIndex: 0, progress: 0 },
      presentation: { mode: "pagination", page: 0, total: 0 },
      pendingSeek: { chapterIndex: 0, page: 3 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 10,
      mode: "pagination",
    });

    expect(result.state.status).toBe("ready");
    expect(result.state.position.progress).toBe(0.3);
    expect(result.state.presentation.page).toBe(3);
    expect(result.state.pendingSeek).toBeNull();
    expect(result.effects).toEqual([posChanged("ch1", "ch1")]);
  });

  test("resolves pendingSeek page -1 to last page", () => {
    const state = readyState({
      status: "loading",
      pendingSeek: { chapterIndex: 0, page: -1 },
      presentation: { mode: "pagination", page: 0, total: 0 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 15,
      mode: "pagination",
    });

    expect(result.state.position.progress).toBe(14 / 15);
    expect(result.state.presentation.page).toBe(14);
  });

  test("clamps progress to measurable range when total shrinks", () => {
    const state = readyState({
      status: "ready",
      position: { chapterIndex: 0, progress: 0.9 },
      presentation: { mode: "pagination", page: 9, total: 10 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 5,
      mode: "pagination",
    });

    expect(result.state.position.progress).toBe(0.8);
    expect(result.state.presentation.page).toBe(4);
    expect(result.effects).toEqual([posChanged("ch1", "ch1")]);
  });

  test("re-measure preserves position and updates the page readout", () => {
    const state = readyState({
      position: { chapterIndex: 0, progress: 0.5 },
      presentation: { mode: "pagination", page: 5, total: 10 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 20,
      mode: "pagination",
    });

    expect(result.state.position.progress).toBe(0.5);
    expect(result.state.presentation.page).toBe(10);
    expect(result.effects).toEqual([posChanged("ch1", "ch1")]);
  });

  test("emits MODE_CHANGED when the host switches presentation mode", () => {
    const state = readyState({ presentation: { mode: "pagination", page: 3, total: 10 } });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 0,
      mode: "scroll",
    });

    expect(result.state.presentation).toEqual({ mode: "scroll", page: 0, total: 0 });
    expect(result.effects).toContainEqual({ type: "MODE_CHANGED", mode: "scroll" });
    expect(result.effects).toContainEqual(posChanged("ch1", "ch1"));
  });

  test("mode switch preserves position (no more position loss)", () => {
    const state = readyState({
      position: { chapterIndex: 0, progress: 0.5, anchor: 0.3 },
      presentation: { mode: "pagination", page: 5, total: 10 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 0,
      mode: "scroll",
    });

    expect(result.state.position.progress).toBe(0.5);
    expect(result.state.position.anchor).toBe(0.3);
  });

  test("scroll mode measurement goes ready without a page readout", () => {
    const state = readyState({
      status: "loading",
      presentation: { mode: "pagination", page: 0, total: 0 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 0,
      mode: "scroll",
    });

    expect(result.state.status).toBe("ready");
    expect(result.state.presentation).toEqual({ mode: "scroll", page: 0, total: 0 });
  });

  test("ignored for stale chapter", () => {
    const state = readyState({ status: "loading", position: { chapterIndex: 1, progress: 0 } });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 10,
      mode: "pagination",
    });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("no effects when nothing changed", () => {
    const state = readyState();
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 10,
      mode: "pagination",
    });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  test("transitions to ready even when the presentation is unchanged (scroll reload)", () => {
    // A scroll-mode chapter reload reports the same facts (scroll, total 0);
    // the loading → ready transition must still happen.
    const state = readyState({
      status: "loading",
      presentation: { mode: "scroll", page: 0, total: 0 },
    });
    const result = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 0,
      mode: "scroll",
    });

    expect(result.state.status).toBe("ready");
    expect(result.effects).toEqual([]);
  });
});

// ── RETRY ──

describe("RETRY", () => {
  test("re-fetches the current chapter from error", () => {
    const state = readyState({ status: "error", lastError: "Boom" });
    const result = dispatch(state, { type: "RETRY" });

    expect(result.state.status).toBe("loading");
    expect(result.state.lastError).toBeNull();
    expect(result.state.pendingSeek).toBeNull();
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch1",
    });
  });

  test("no-ops when not in error", () => {
    const state = readyState();
    const result = dispatch(state, { type: "RETRY" });

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

// ── TEARDOWN ──

describe("TEARDOWN", () => {
  test("snapshots the position and resets state", () => {
    const state = readyState({
      position: { chapterIndex: 1, progress: 0.5, anchor: 0.4 },
      presentation: { mode: "scroll", page: 0, total: 0 },
    });
    const result = dispatch(state, { type: "TEARDOWN" });

    expect(result.state.status).toBe("idle");
    expect(result.state.bookId).toBe("");
    expect(result.effects).toEqual([
      {
        type: "READER_UNMOUNTED",
        bookId: "book1",
        chapterId: "ch2",
        chapterIndex: 1,
        progress: 0.5,
        anchor: 0.4,
        mode: "scroll",
        page: 0,
      },
    ]);
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
    });

    expect(states.length).toBe(1);
    expect(states[0].bookId).toBe("book1");
  });

  test("unsubscribe stops receiving updates", () => {
    const machine = createReaderMachine();
    const states: ReaderState[] = [];
    const unsub = machine.subscribe((s) => states.push(s));

    machine.dispatch({
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
    });
    expect(states.length).toBe(1);

    unsub();
    machine.dispatch({ type: "CHAPTER_LOADED", chapterId: "ch1" });
    expect(states.length).toBe(1);
  });
});

// ── Full lifecycle ──

describe("full lifecycle", () => {
  test("INIT → CHAPTER_LOADED → MEASURED reaches ready", () => {
    let state = createInitialState();

    const r1 = dispatch(state, {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 0,
    });
    state = r1.state;
    expect(state.status).toBe("loading");

    const r2 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });
    state = r2.state;
    expect(state.status).toBe("loading");
    expect(r2.effects).toEqual([{ type: "CONTENT_READY", chapterId: "ch1" }]);

    const r3 = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 12,
      mode: "pagination",
    });
    expect(r3.state.status).toBe("ready");
    expect(r3.state.presentation.total).toBe(12);
  });

  test("SEEK cross-chapter → load → measure lands on the target page", () => {
    let state = readyState();

    const r1 = dispatch(state, { type: "SEEK", chapterIndex: 1, page: 4 });
    state = r1.state;
    expect(state.status).toBe("loading");

    const r2 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch2" });
    state = r2.state;

    const r3 = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch2",
      total: 8,
      mode: "pagination",
    });
    expect(r3.state.status).toBe("ready");
    expect(r3.state.position.progress).toBe(0.5);
    expect(r3.state.presentation.page).toBe(4);
  });

  test("error recovery: FAILED → SEEK to another chapter → load → ready", () => {
    let state = readyState({ status: "loading" });

    const r1 = dispatch(state, { type: "CHAPTER_FAILED", chapterId: "ch1", error: "Boom" });
    state = r1.state;
    expect(state.status).toBe("error");

    const r2 = dispatch(state, { type: "SEEK", chapterIndex: 1 });
    state = r2.state;
    expect(state.status).toBe("loading");
    expect(state.lastError).toBeNull();

    const r3 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch2" });
    state = r3.state;

    const r4 = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch2",
      total: 5,
      mode: "pagination",
    });
    expect(r4.state.status).toBe("ready");
  });

  test("error recovery: FAILED → RETRY", () => {
    const state = readyState({ status: "error", lastError: "Boom" });
    const result = dispatch(state, { type: "RETRY" });

    expect(result.state.status).toBe("loading");
    expect(result.effects).toContainEqual({
      type: "FETCH_CHAPTER",
      bookId: "book1",
      chapterId: "ch1",
    });
  });

  test("prevPage across chapter boundary resolves to last page", () => {
    // Compiled intent: SEEK previous chapter with page -1 (last page).
    let state = readyState({ position: { chapterIndex: 1, progress: 0 } });

    const r1 = dispatch(state, { type: "SEEK", chapterIndex: 0, page: -1 });
    state = r1.state;
    expect(state.status).toBe("loading");
    expect(state.pendingSeek).toEqual({ chapterIndex: 0, page: -1 });

    const r2 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch1" });
    state = r2.state;

    const r3 = dispatch(state, {
      type: "MEASURED",
      chapterId: "ch1",
      total: 15,
      mode: "pagination",
    });
    expect(r3.state.status).toBe("ready");
    expect(r3.state.position.progress).toBe(14 / 15);
    expect(r3.state.presentation.page).toBe(14);
  });

  test("scroll session: INIT with position → load → ready, position preserved", () => {
    let state = createInitialState();

    const r1 = dispatch(state, {
      type: "INIT",
      bookId: "book1",
      chapters: CHAPTERS,
      chapterIndex: 1,
      initialPosition: { progress: 0.5, anchor: 0.4 },
    });
    state = r1.state;

    const r2 = dispatch(state, { type: "CHAPTER_LOADED", chapterId: "ch2" });
    state = r2.state;
    expect(state.position.progress).toBe(0.5);

    const r3 = dispatch(state, { type: "MEASURED", chapterId: "ch2", total: 0, mode: "scroll" });
    expect(r3.state.status).toBe("ready");
    expect(r3.state.position).toEqual({ chapterIndex: 1, progress: 0.5, anchor: 0.4 });
    expect(r3.effects).toContainEqual({ type: "MODE_CHANGED", mode: "scroll" });
  });

  test("scroll progress report chain: POSITION_REPORT → events", () => {
    const state = readyState({
      position: { chapterIndex: 0, progress: 0.1, anchor: 0.05 },
      presentation: { mode: "scroll", page: 0, total: 0 },
    });
    const result = dispatch(state, {
      type: "POSITION_REPORT",
      chapterIndex: 1,
      progress: 0.2,
      anchor: 0.15,
    });

    expect(result.state.position.chapterIndex).toBe(1);
    const effect = result.effects.find((e) => e.type === "POSITION_CHANGED");
    expect(effect).toMatchObject({ chapterId: "ch2", previousChapterId: "ch1" });
    if (effect?.type === "POSITION_CHANGED") {
      expect(effect.position).toEqual({ chapterIndex: 1, progress: 0.2, anchor: 0.15 });
    }
    expect(result.effects).toEqual(effectsOf("POSITION_CHANGED"));
  });
});
