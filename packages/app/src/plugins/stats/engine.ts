// Reading statistics computation engine.
// Uses factory pattern — storage and readerHost are injected via createStatsEngine().

import type { ReadingSession, BookReadingStats } from "../../core/types";
import type { PluginStorageAdapter } from "../../core/plugin-runtime/types";
import type { ReaderSession } from "@book/reader-engine";

const SESSIONS_KEY = "sessions";

function statsKey(bookId: string): string {
  return `stats:${bookId}`;
}

// ── Engine factory ──

export function createStatsEngine(
  storage: PluginStorageAdapter,
  getSession: () => ReaderSession | null,
) {
  // Plugin events fire without awaiting their handlers, so concurrent calls
  // (e.g. book:closed while a content:loaded handler is still writing) could
  // interleave read-modify-write cycles on the sessions record. Serialize all
  // storage-touching operations through a promise queue.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  }

  // ── Session helpers ──

  async function getSessions(): Promise<ReadingSession[]> {
    const data = await storage.get<{ sessions: ReadingSession[] }>(SESSIONS_KEY);
    return data?.sessions || [];
  }

  async function saveSessions(sessions: ReadingSession[]): Promise<void> {
    await storage.put(SESSIONS_KEY, { sessions });
  }

  // ── Public API ──

  function startSession(bookId: string): Promise<void> {
    return enqueue(async () => {
      const sessions = await getSessions();

      // Close any lingering open sessions for this book
      sessions.forEach((session) => {
        if (session.bookId === bookId && !session.endTime) {
          session.endTime = Date.now();
        }
      });

      sessions.push({
        bookId,
        startTime: Date.now(),
        chaptersRead: [],
        wordsRead: 0,
      });

      await saveSessions(sessions);
    });
  }

  function endSession(
    bookId: string,
    chapterId?: string,
    totalChapters?: number,
  ): Promise<BookReadingStats> {
    return enqueue(async () => {
      const sessions = await getSessions();
      const idx = sessions.findIndex((s) => s.bookId === bookId && !s.endTime);

      if (idx === -1) {
        const existingStats = await getStats(bookId);
        return (
          existingStats || {
            bookId,
            totalSessions: 0,
            totalReadingTime: 0,
            averageSessionTime: 0,
            wordsRead: 0,
            readingSpeed: 0,
            chaptersCompleted: 0,
            lastActiveDate: "",
            activeHours: [],
            firstReadAt: undefined,
            lastReadAt: undefined,
          }
        );
      }

      sessions[idx].endTime = Date.now();
      if (chapterId && !sessions[idx].chaptersRead.includes(chapterId)) {
        sessions[idx].chaptersRead.push(chapterId);
      }
      await saveSessions(sessions);

      return computeStats(bookId, totalChapters);
    });
  }

  function recordChapterRead(bookId: string, chapterId: string): Promise<void> {
    return enqueue(async () => {
      const sessions = await getSessions();
      const session = sessions.find((s) => s.bookId === bookId && !s.endTime);
      if (session && !session.chaptersRead.includes(chapterId)) {
        session.chaptersRead.push(chapterId);
        await saveSessions(sessions);
      }
    });
  }

  function recordWordsRead(bookId: string, chapterId: string, words: number): Promise<void> {
    return enqueue(async () => {
      const sessions = await getSessions();

      // Dedupe across every session of this book: a chapter's word count is
      // only counted once even if it is reopened after a page refresh.
      const alreadyCounted = sessions.some(
        (s) => s.bookId === bookId && s.wordsByChapter?.[chapterId] !== undefined,
      );
      if (alreadyCounted) return;

      const session = sessions.find((s) => s.bookId === bookId && !s.endTime);
      if (!session) return;

      session.wordsByChapter = { ...session.wordsByChapter, [chapterId]: words };
      session.wordsRead = (session.wordsRead ?? 0) + words;
      await saveSessions(sessions);
    });
  }

  function getStats(bookId: string): Promise<BookReadingStats | undefined> {
    return storage.get<BookReadingStats>(statsKey(bookId));
  }

  async function getAllStats(): Promise<BookReadingStats[]> {
    const all = await storage.getAll<BookReadingStats | { sessions: ReadingSession[] }>();
    return all.filter(isBookReadingStats).map((s) => {
      if (!Array.isArray(s.activeHours)) s.activeHours = [];
      return s;
    });
  }

  /**
   * Sessions live in the same storage partition as per-book stats; only the
   * `sessions` key holds a non-stats record, which this guard filters out.
   */
  function isBookReadingStats(value: unknown): value is BookReadingStats {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Record<string, unknown>;
    return typeof r.bookId === "string" && typeof r.totalReadingTime === "number";
  }

  /**
   * Recompute and persist the aggregate stats for a book. Plain internal
   * function — callers already inside the queue (e.g. endSession) must use
   * this directly; the public updateStats wraps it in a queued call.
   */
  async function computeStats(bookId: string, totalChapters?: number): Promise<BookReadingStats> {
    const allBookSessions = (await getSessions()).filter((s) => s.bookId === bookId);

    const totalSessions = allBookSessions.length;
    const totalReadingTime = allBookSessions.reduce((sum, s) => {
      const duration = (s.endTime ?? Date.now()) - s.startTime;
      return sum + Math.max(0, duration);
    }, 0);
    const averageSessionTime = totalSessions > 0 ? Math.round(totalReadingTime / totalSessions) : 0;
    const wordsRead = allBookSessions.reduce((sum, s) => sum + (s.wordsRead ?? 0), 0);
    // Words per minute
    const readingSpeed =
      totalReadingTime > 0 ? Math.round((wordsRead / totalReadingTime) * 60000) : 0;
    const chaptersCompleted = new Set(allBookSessions.flatMap((s) => s.chaptersRead)).size;

    // Active hours histogram
    const activeHours: number[] = Array.from({ length: 24 }, () => 0);
    for (const s of allBookSessions) {
      const hour = new Date(s.startTime).getHours();
      activeHours[hour]++;
    }

    const lastSession = allBookSessions[allBookSessions.length - 1];
    const lastActiveDate = lastSession?.endTime
      ? new Date(lastSession.endTime).toISOString().slice(0, 10)
      : "";
    const stats: BookReadingStats = {
      bookId,
      totalSessions,
      totalReadingTime,
      averageSessionTime,
      wordsRead,
      readingSpeed,
      chaptersCompleted,
      lastActiveDate,
      activeHours,
      chaptersTotal: totalChapters,
      firstReadAt: allBookSessions[0]?.startTime,
      lastReadAt: lastSession?.endTime,
    };

    await storage.put(statsKey(bookId), stats);
    return stats;
  }

  function updateStats(bookId: string, totalChapters?: number): Promise<BookReadingStats> {
    return enqueue(() => computeStats(bookId, totalChapters));
  }

  async function getSummaryStats(): Promise<{
    totalBooks: number;
    totalReadingTime: number;
    totalSessions: number;
    thisWeekReadingTime: number;
  }> {
    const allStats = await getAllStats();
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Real weekly aggregate: sum the overlap of every session with the last
    // 7 days (in-progress sessions count up to now).
    let thisWeekReadingTime = 0;
    for (const s of await getSessions()) {
      const start = Math.max(s.startTime, weekAgo);
      const end = Math.min(s.endTime ?? now, now);
      if (end > start) thisWeekReadingTime += end - start;
    }

    return {
      totalBooks: allStats.length,
      totalReadingTime: allStats.reduce((sum, s) => sum + s.totalReadingTime, 0),
      totalSessions: allStats.reduce((sum, s) => sum + s.totalSessions, 0),
      thisWeekReadingTime,
    };
  }

  function deleteStats(bookId: string): Promise<void> {
    return enqueue(async () => {
      await storage.delete(statsKey(bookId));

      const sessions = await getSessions();
      const filtered = sessions.filter((s) => s.bookId !== bookId);
      if (filtered.length > 0) {
        await saveSessions(filtered);
      } else {
        await storage.delete(SESSIONS_KEY);
      }
    });
  }

  return {
    startSession,
    endSession,
    recordChapterRead,
    recordWordsRead,
    getStats,
    getAllStats,
    updateStats,
    getSummaryStats,
    deleteStats,
    getSession: () => getSession(),
  };
}

// ── Module-level singleton accessor (set during plugin setup) ──
//
// Plugin-internal state sharing only: consumed exclusively by this plugin's
// UI components (StatsBar/StatsPanel/StatsPage). Per docs/plugin-contract.md
// §五.4, this must NOT be imported by other plugins — cross-plugin
// communication only goes through ctx.events (or a future official channel).

let _engine: ReturnType<typeof createStatsEngine> | null = null;

export function setStatsEngine(engine: ReturnType<typeof createStatsEngine> | null): void {
  _engine = engine;
}

export function getStatsEngine(): ReturnType<typeof createStatsEngine> {
  if (!_engine) throw new Error("[stats] Engine not initialized — plugin setup hasn't run yet");
  return _engine;
}
