// Reading statistics computation engine.
// Depends on PluginStorageAdapter (injected via setStatsAdapter) for data access.

import type { ReadingSession, BookReadingStats } from "../../core/types";
import type { PluginStorageAdapter } from "../types";
import type { ReaderHost } from "../../core/reader-host";

let adapter: PluginStorageAdapter | null = null;
let _readerHost: (() => ReaderHost | null) | null = null;

export function setStatsAdapter(a: PluginStorageAdapter | null) {
  adapter = a;
}

function useAdapter() {
  return adapter!;
}

export function setReaderHost(h: (() => ReaderHost | null) | null) {
  _readerHost = h;
}

export function getReaderHost(): ReaderHost | null {
  return _readerHost?.() ?? null;
}

const SESSIONS_KEY = "sessions";

function statsKey(bookId: string) {
  return `stats:${bookId}`;
}

// ── Session management ──

async function getSessions(): Promise<ReadingSession[]> {
  const data = await useAdapter().get<{ sessions: ReadingSession[] }>(SESSIONS_KEY);
  return data?.sessions || [];
}

async function saveSessions(sessions: ReadingSession[]): Promise<void> {
  await useAdapter().put(SESSIONS_KEY, { sessions });
}

export async function startSession(bookId: string): Promise<void> {
  const sessions = await getSessions();

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

export async function endSession(
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
        lastActiveDate: new Date().toISOString().split("T")[0],
        activeHours: [],
        firstReadAt: undefined,
        lastReadAt: undefined,
      }
    );
  }

  const session = sessions[idx];
  session.endTime = Date.now();

  if (chapterId && !session.chaptersRead.includes(chapterId)) {
    session.chaptersRead.push(chapterId);
  }
  if (wordsRead) {
    session.wordsRead = (session.wordsRead || 0) + wordsRead;
  }

  sessions[idx] = session;
  await saveSessions(sessions);

  return updateStats(bookId);
}

export async function recordChapterRead(bookId: string, chapterId: string): Promise<void> {
  const sessions = await getSessions();
  const active = sessions.find((s) => s.bookId === bookId && !s.endTime);
  if (active && !active.chaptersRead.includes(chapterId)) {
    active.chaptersRead.push(chapterId);
    await saveSessions(sessions);
  }
}

export async function recordWordsRead(bookId: string, words: number): Promise<void> {
  const sessions = await getSessions();
  const active = sessions.find((s) => s.bookId === bookId && !s.endTime);
  if (active) {
    active.wordsRead = (active.wordsRead || 0) + words;
    await saveSessions(sessions);
  }
}

// ── Stats queries ──

export async function getStats(bookId: string): Promise<BookReadingStats | undefined> {
  return useAdapter().get<BookReadingStats>(statsKey(bookId));
}

export async function getAllStats(): Promise<BookReadingStats[]> {
  const all = await useAdapter().getAll<{ value: BookReadingStats }>();
  return all.filter((r) => "totalSessions" in r).map((r) => r as unknown as BookReadingStats);
}

export async function updateStats(bookId: string): Promise<BookReadingStats> {
  const sessions = await getSessions();
  const bookSessions = sessions.filter((s) => s.bookId === bookId && s.endTime);

  const totalReadingTime = bookSessions.reduce((sum, s) => sum + (s.endTime! - s.startTime), 0);
  const totalWordsRead = bookSessions.reduce((sum, s) => sum + (s.wordsRead || 0), 0);
  const allChaptersRead = new Set<string>();
  bookSessions.forEach((s) => s.chaptersRead.forEach((c) => allChaptersRead.add(c)));

  const activeHoursSet = new Set<number>();
  bookSessions.forEach((s) => activeHoursSet.add(new Date(s.startTime).getHours()));
  const activeHours = Array.from(activeHoursSet).sort((a, b) => a - b);

  const lastSession = bookSessions[bookSessions.length - 1];
  const lastActiveDate = lastSession
    ? new Date(lastSession.startTime).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const totalReadingTimeMinutes = totalReadingTime / 60000;
  const readingSpeed =
    totalReadingTimeMinutes > 0 ? Math.round(totalWordsRead / totalReadingTimeMinutes) : 0;

  const stats: BookReadingStats = {
    bookId,
    totalSessions: bookSessions.length,
    totalReadingTime,
    averageSessionTime:
      bookSessions.length > 0 ? Math.round(totalReadingTime / bookSessions.length) : 0,
    wordsRead: totalWordsRead,
    readingSpeed,
    chaptersCompleted: allChaptersRead.size,
    lastActiveDate,
    activeHours,
    firstReadAt: bookSessions[0]?.startTime,
    lastReadAt: lastSession?.endTime,
  };

  await useAdapter().put(statsKey(bookId), stats);
  return stats;
}

export async function getSummaryStats(): Promise<{
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

export async function deleteStats(bookId: string): Promise<void> {
  await useAdapter().delete(statsKey(bookId));

  const sessions = await getSessions();
  const filtered = sessions.filter((s) => s.bookId !== bookId);
  if (filtered.length > 0) {
    await saveSessions(filtered);
  } else {
    await useAdapter().delete(SESSIONS_KEY);
  }
}
