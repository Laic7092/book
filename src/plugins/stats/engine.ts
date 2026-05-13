// Reading statistics computation engine.
// Uses factory pattern — storage and readerHost are injected via createStatsEngine().

import type { ReadingSession, BookReadingStats } from "../../core/types";
import type { PluginStorageAdapter } from "../types";
import type { ReaderSession } from "../../reader-engine/session";

const SESSIONS_KEY = "sessions";

function statsKey(bookId: string): string {
  return `stats:${bookId}`;
}

// ── Engine factory ──

export function createStatsEngine(
  storage: PluginStorageAdapter,
  getSession: () => ReaderSession | null,
) {
  // ── Session helpers ──

  async function getSessions(): Promise<ReadingSession[]> {
    const data = await storage.get<{ sessions: ReadingSession[] }>(SESSIONS_KEY);
    return data?.sessions || [];
  }

  async function saveSessions(sessions: ReadingSession[]): Promise<void> {
    await storage.put(SESSIONS_KEY, { sessions });
  }

  // ── Public API ──

  async function startSession(bookId: string): Promise<void> {
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
  }

  async function endSession(
    bookId: string,
    chapterId?: string,
    wordsRead?: number,
  ): Promise<BookReadingStats> {
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
    if (wordsRead) {
      sessions[idx].wordsRead = (sessions[idx].wordsRead ?? 0) + wordsRead;
    }
    await saveSessions(sessions);

    return updateStats(bookId);
  }

  async function recordChapterRead(bookId: string, chapterId: string): Promise<void> {
    const sessions = await getSessions();
    const session = sessions.find((s) => s.bookId === bookId && !s.endTime);
    if (session && !session.chaptersRead.includes(chapterId)) {
      session.chaptersRead.push(chapterId);
      await saveSessions(sessions);
    }
  }

  async function recordWordsRead(bookId: string, words: number): Promise<void> {
    const sessions = await getSessions();
    const session = sessions.find((s) => s.bookId === bookId && !s.endTime);
    if (session) {
      session.wordsRead = (session.wordsRead ?? 0) + words;
      await saveSessions(sessions);
    }
  }

  async function getStats(bookId: string): Promise<BookReadingStats | undefined> {
    return storage.get<BookReadingStats>(statsKey(bookId));
  }

  async function getAllStats(): Promise<BookReadingStats[]> {
    const all = await storage.getAll<BookReadingStats>();
    // Filter out the sessions entry ("{ sessions: [...] }") that snuck in
    return all
      .filter((s): s is BookReadingStats => {
        const r = s as unknown as Record<string, unknown>;
        return typeof r.bookId === "string" && typeof r.totalReadingTime === "number";
      })
      .map((s) => {
        if (!Array.isArray(s.activeHours)) s.activeHours = [];
        return s;
      });
  }

  async function updateStats(bookId: string): Promise<BookReadingStats> {
    const allBookSessions = (await getSessions()).filter((s) => s.bookId === bookId);

    const totalSessions = allBookSessions.length;
    const totalReadingTime = allBookSessions.reduce((sum, s) => {
      const duration = (s.endTime ?? Date.now()) - s.startTime;
      return sum + Math.max(0, duration);
    }, 0);
    const averageSessionTime = totalSessions > 0 ? Math.round(totalReadingTime / totalSessions) : 0;
    const wordsRead = allBookSessions.reduce((sum, s) => sum + (s.wordsRead ?? 0), 0);
    const readingSpeed =
      totalReadingTime > 0 ? Math.round((wordsRead / totalReadingTime) * 3600000) : 0;
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
      firstReadAt: allBookSessions[0]?.startTime,
      lastReadAt: lastSession?.endTime,
    };

    await storage.put(statsKey(bookId), stats);
    return stats;
  }

  async function getSummaryStats(): Promise<{
    totalBooks: number;
    totalReadingTime: number;
    totalSessions: number;
    booksInProgress: number;
    completedBooks: number;
    thisWeekReadingTime: number;
  }> {
    const allStats = await getAllStats();
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    let thisWeekReadingTime = 0;
    allStats.forEach((stats) => {
      if (stats.lastReadAt && stats.lastReadAt > weekAgo) {
        const sessionsThisWeek = Math.ceil(stats.totalSessions / 4);
        thisWeekReadingTime += stats.averageSessionTime * sessionsThisWeek;
      }
    });

    return {
      totalBooks: allStats.length,
      totalReadingTime: allStats.reduce((sum, s) => sum + s.totalReadingTime, 0),
      totalSessions: allStats.reduce((sum, s) => sum + s.totalSessions, 0),
      booksInProgress: allStats.filter((s) => s.chaptersCompleted > 0).length,
      completedBooks: 0,
      thisWeekReadingTime,
    };
  }

  async function deleteStats(bookId: string): Promise<void> {
    await storage.delete(statsKey(bookId));

    const sessions = await getSessions();
    const filtered = sessions.filter((s) => s.bookId !== bookId);
    if (filtered.length > 0) {
      await saveSessions(filtered);
    } else {
      await storage.delete(SESSIONS_KEY);
    }
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

let _engine: ReturnType<typeof createStatsEngine> | null = null;

export function setStatsEngine(engine: ReturnType<typeof createStatsEngine> | null): void {
  _engine = engine;
}

export function getStatsEngine(): ReturnType<typeof createStatsEngine> {
  if (!_engine) throw new Error("[stats] Engine not initialized — plugin setup hasn't run yet");
  return _engine;
}
