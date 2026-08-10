import { describe, it, expect, beforeEach } from "vite-plus/test";
import { createStatsEngine } from "./engine";
import type { PluginStorageAdapter } from "../../core/plugin-runtime/types";

/** In-memory adapter — same semantics as the IndexedDB one. */
class MemoryAdapter implements PluginStorageAdapter {
  private map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }

  async getAll<T>(): Promise<T[]> {
    return [...this.map.values()] as T[];
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let storage: MemoryAdapter;

beforeEach(() => {
  storage = new MemoryAdapter();
});

function engine() {
  return createStatsEngine(storage, () => null);
}

/** Past timestamp relative to now, clamped so `new Date(ts).getHours()` is stable. */
function hoursAgo(hours: number): number {
  return Date.now() - hours * HOUR;
}

describe("startSession", () => {
  it("opens a new session for a book", async () => {
    const eng = engine();
    await eng.startSession("b1");

    const data = await storage.get<{ sessions: { endTime?: number }[] }>("sessions");
    expect(data?.sessions).toHaveLength(1);
    expect(data?.sessions[0]).toMatchObject({ bookId: "b1" });
    expect(data?.sessions[0].endTime).toBeUndefined();
  });

  it("closes any lingering open session for the same book", async () => {
    const eng = engine();
    await eng.startSession("b1");
    await eng.startSession("b1");

    const data = await storage.get<{ sessions: { endTime?: number }[] }>("sessions");
    expect(data?.sessions).toHaveLength(2);
    expect(data?.sessions[0].endTime).toBeTypeOf("number");
    expect(data?.sessions[1].endTime).toBeUndefined();
  });
});

describe("recordChapterRead", () => {
  it("records a chapter and dedupes repeats", async () => {
    const eng = engine();
    await eng.startSession("b1");

    await eng.recordChapterRead("b1", "c1");
    await eng.recordChapterRead("b1", "c1");
    await eng.recordChapterRead("b1", "c2");

    const stats = await eng.updateStats("b1");
    expect(stats.chaptersCompleted).toBe(2);
  });
});

describe("recordWordsRead", () => {
  it("adds words to the open session and to stats", async () => {
    const eng = engine();
    await eng.startSession("b1");

    await eng.recordWordsRead("b1", "c1", 500);
    await eng.recordWordsRead("b1", "c2", 300);

    const stats = await eng.updateStats("b1");
    expect(stats.wordsRead).toBe(800);
  });

  it("counts a chapter only once even across sessions", async () => {
    const eng = engine();
    await eng.startSession("b1");
    await eng.recordWordsRead("b1", "c1", 500);
    await eng.endSession("b1");

    // Reopen the book, read the same chapter again (e.g. after a refresh).
    await eng.startSession("b1");
    await eng.recordWordsRead("b1", "c1", 500);
    await eng.recordWordsRead("b1", "c3", 200);

    const stats = await eng.updateStats("b1");
    expect(stats.wordsRead).toBe(700);
  });

  it("does nothing when no session is open", async () => {
    const eng = engine();
    await eng.recordWordsRead("b1", "c1", 500);
    expect(await storage.get("sessions")).toBeUndefined();
  });
});

describe("endSession", () => {
  it("computes reading time and average", async () => {
    const eng = engine();
    await eng.startSession("b1");

    // Wait a bit so the session has measurable duration.
    await new Promise((r) => setTimeout(r, 30));
    const stats = await eng.endSession("b1");

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalReadingTime).toBeGreaterThan(0);
    expect(stats.totalReadingTime).toBeLessThan(10 * 1000);
    expect(stats.averageSessionTime).toBe(stats.totalReadingTime);
    expect(stats.firstReadAt).toBeTypeOf("number");
    expect(stats.lastReadAt).toBeTypeOf("number");
  });

  it("stores the total chapter count", async () => {
    const eng = engine();
    await eng.startSession("b1");
    const stats = await eng.endSession("b1", "c1", 42);
    expect(stats.chaptersTotal).toBe(42);
  });

  it("returns existing stats when no session is open", async () => {
    const eng = engine();
    await eng.startSession("b1");
    const before = await eng.endSession("b1", "c1", 10);
    const again = await eng.endSession("b1");
    expect(again.totalSessions).toBe(before.totalSessions);
  });
});

describe("updateStats", () => {
  it("reports words per minute", async () => {
    const eng = engine();
    const start = Date.now();
    await eng.startSession("b1");
    await eng.recordWordsRead("b1", "c1", 100);
    // End the session by hand so duration is exactly one minute.
    const sessions = (await storage.get<{ sessions: { startTime: number }[] }>("sessions"))!
      .sessions;
    sessions[0].startTime = start - MINUTE;
    await storage.put("sessions", { sessions });

    const stats = await eng.updateStats("b1");
    expect(stats.readingSpeed).toBe(100);
  });

  it("builds an active-hours histogram from session start times", async () => {
    const eng = engine();
    await eng.startSession("b1");
    const sessions = (await storage.get<{ sessions: { startTime: number }[] }>("sessions"))!
      .sessions;
    sessions[0].startTime = hoursAgo(3);
    await storage.put("sessions", { sessions });

    const stats = await eng.updateStats("b1");
    const expectedHour = new Date(hoursAgo(3)).getHours();
    expect(stats.activeHours[expectedHour]).toBe(1);
    expect(stats.activeHours.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("getSummaryStats", () => {
  it("aggregates only sessions overlapping the last 7 days", async () => {
    const eng = engine();
    await eng.startSession("b1");
    const sessions = (await storage.get<{ sessions: import("../../core/types").ReadingSession[] }>(
      "sessions",
    ))!.sessions;
    // This week: 10 minutes ending 3 days ago.
    sessions[0] = {
      ...sessions[0],
      startTime: hoursAgo(3 * 24) - 10 * MINUTE,
      endTime: hoursAgo(3 * 24),
    };
    // Older than a week: must not count.
    sessions.push({
      bookId: "b1",
      startTime: Date.now() - 10 * DAY,
      endTime: Date.now() - 10 * DAY + 5 * MINUTE,
      chaptersRead: [],
    });
    await storage.put("sessions", { sessions });
    await eng.updateStats("b1");

    const summary = await eng.getSummaryStats();
    expect(summary.thisWeekReadingTime).toBe(10 * MINUTE);
    expect(summary.totalSessions).toBe(2);
  });

  it("counts an in-progress session up to now", async () => {
    const eng = engine();
    await eng.startSession("b1");
    const sessions = (await storage.get<{ sessions: { startTime: number }[] }>("sessions"))!
      .sessions;
    sessions[0].startTime = Date.now() - 5 * MINUTE;
    await storage.put("sessions", { sessions });

    const summary = await eng.getSummaryStats();
    expect(summary.thisWeekReadingTime).toBeGreaterThan(0);
    expect(summary.thisWeekReadingTime).toBeLessThanOrEqual(5 * MINUTE + 1000);
  });
});

describe("deleteStats", () => {
  it("removes the book's stats and sessions", async () => {
    const eng = engine();
    await eng.startSession("b1");
    await eng.recordWordsRead("b1", "c1", 100);
    await eng.endSession("b1", "c1");

    await eng.deleteStats("b1");

    expect(await eng.getStats("b1")).toBeUndefined();
    expect(await storage.get("sessions")).toBeUndefined();
  });

  it("keeps other books' sessions", async () => {
    const eng = engine();
    await eng.startSession("b1");
    await eng.endSession("b1");
    await eng.startSession("b2");
    await eng.endSession("b2");

    await eng.deleteStats("b1");

    const summary = await eng.getSummaryStats();
    expect(summary.totalBooks).toBe(1);
    expect(summary.totalSessions).toBe(1);
  });
});
