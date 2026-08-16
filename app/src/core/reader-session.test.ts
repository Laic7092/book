import { describe, it, expect } from "vite-plus/test";
import type { ReaderSession, ReaderState } from "@book/engine";
import {
  applyPositionSnapshot,
  snapshotFromSession,
  type ReaderPositionSnapshot,
} from "./reader-session";
import type { InitConfig } from "./plugin-runtime/types";

function makeSession(state: ReaderState): ReaderSession {
  return {
    dispatch: () => {},
    getState: () => state,
    getDocument: () => null,
    setPageMargin: () => {},
    setMode: () => {},
    navigateToCfi: async () => {},
  };
}

const baseConfig: InitConfig = { bookId: "book-1", chapterIndex: 0, mode: "pagination" };

const paginationState: ReaderState = {
  bookId: "book-1",
  chapters: [
    { id: "ch-1", bookId: "book-1", title: "One", order: 0 },
    { id: "ch-2", bookId: "book-1", title: "Two", order: 1 },
  ],
  position: { chapterIndex: 1, progress: 0.4 },
  status: "ready",
  lastError: null,
  presentation: { mode: "pagination", page: 3, total: 10 },
};

describe("snapshotFromSession", () => {
  it("captures chapter, mode, page and progress from a live session", () => {
    const snap = snapshotFromSession(makeSession(paginationState));
    expect(snap).toEqual({
      chapterId: "ch-2",
      chapterIndex: 1,
      mode: "pagination",
      page: 3,
      progress: 0.4,
    });
  });

  it("returns undefined for a null session", () => {
    expect(snapshotFromSession(null)).toBeUndefined();
  });

  it("returns undefined when the chapter is not resolved yet", () => {
    const empty: ReaderState = {
      ...paginationState,
      chapters: [],
      position: { chapterIndex: 0, progress: 0 },
    };
    expect(snapshotFromSession(makeSession(empty))).toBeUndefined();
  });
});

describe("applyPositionSnapshot", () => {
  it("restores the exact page when reopening in pagination", () => {
    const snap: ReaderPositionSnapshot = {
      chapterId: "ch-2",
      chapterIndex: 1,
      mode: "pagination",
      page: 3,
      progress: 0.4,
    };
    const config = applyPositionSnapshot(baseConfig, snap);
    expect(config).toMatchObject({ chapterIndex: 1, initialPage: 3 });
  });

  it("falls back to unified progress when reopening in scroll mode", () => {
    const snap: ReaderPositionSnapshot = {
      chapterId: "ch-2",
      chapterIndex: 1,
      mode: "pagination",
      page: 3,
      progress: 0.4,
      anchor: 0.5,
    };
    const config = applyPositionSnapshot({ ...baseConfig, mode: "scroll" }, snap);
    expect(config).toMatchObject({
      chapterIndex: 1,
      initialPosition: { progress: 0.4, anchor: 0.5 },
    });
  });

  it("uses progress + anchor for scroll-mode snapshots in any mode", () => {
    const snap: ReaderPositionSnapshot = {
      chapterId: "ch-1",
      chapterIndex: 0,
      mode: "scroll",
      page: 0,
      progress: 0.75,
      anchor: 0.2,
    };
    for (const mode of ["pagination", "scroll"] as const) {
      const config = applyPositionSnapshot({ ...baseConfig, mode }, snap);
      expect(config).toMatchObject({
        chapterIndex: 0,
        initialPosition: { progress: 0.75, anchor: 0.2 },
      });
    }
  });

  it("never restores page 0 as an exact page", () => {
    const snap: ReaderPositionSnapshot = {
      chapterId: "ch-1",
      chapterIndex: 0,
      mode: "pagination",
      page: 0,
      progress: 0.1,
    };
    const config = applyPositionSnapshot(baseConfig, snap);
    expect(config.initialPage).toBeUndefined();
    expect(config.initialPosition).toMatchObject({ progress: 0.1 });
  });
});
