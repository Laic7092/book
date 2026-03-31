// Reading statistics storage module

import type { ReadingSession, BookReadingStats } from "../core/types";
import { STORES, dbPut, dbGet, dbDelete, dbGetAllFromIndex } from "./db";

const SESSIONS_DB_KEY = "__reading_sessions__";

/**
 * Get all sessions from storage
 */
async function getSessions(): Promise<ReadingSession[]> {
  const data = await dbGet<{ bookId: string; sessions: ReadingSession[] }>(
    STORES.STATS,
    SESSIONS_DB_KEY as any,
  );
  return data?.sessions || [];
}

/**
 * Save sessions to storage
 */
async function saveSessions(sessions: ReadingSession[]): Promise<void> {
  await dbPut(STORES.STATS, { bookId: SESSIONS_DB_KEY, sessions });
}

/**
 * Start a new reading session for a book
 */
export async function startSession(bookId: string): Promise<void> {
  const sessions = await getSessions();

  // Close any unclosed sessions for this book
  sessions.forEach((session) => {
    if (session.bookId === bookId && !session.endTime) {
      session.endTime = Date.now();
    }
  });

  const newSession: ReadingSession = {
    bookId,
    startTime: Date.now(),
    chaptersRead: [],
    wordsRead: 0,
  };

  sessions.push(newSession);
  await saveSessions(sessions);
}

/**
 * End a reading session and update statistics
 */
export async function endSession(
  bookId: string,
  chapterId?: string,
  wordsRead?: number,
): Promise<BookReadingStats> {
  const sessions = await getSessions();

  // Find the most recent unclosed session for this book
  const sessionIndex = sessions.findIndex((s) => s.bookId === bookId && !s.endTime);

  if (sessionIndex === -1) {
    // No active session, return current stats or empty stats
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

  const session = sessions[sessionIndex];
  session.endTime = Date.now();

  if (chapterId && !session.chaptersRead.includes(chapterId)) {
    session.chaptersRead.push(chapterId);
  }

  if (wordsRead) {
    session.wordsRead = (session.wordsRead || 0) + wordsRead;
  }

  sessions[sessionIndex] = session;
  await saveSessions(sessions);

  // Update and return stats
  const stats = await updateStats(bookId);
  return stats;
}

/**
 * Record that a chapter was read in the current session
 */
export async function recordChapterRead(bookId: string, chapterId: string): Promise<void> {
  const sessions = await getSessions();

  const activeSession = sessions.find((s) => s.bookId === bookId && !s.endTime);

  if (activeSession && !activeSession.chaptersRead.includes(chapterId)) {
    activeSession.chaptersRead.push(chapterId);
    await saveSessions(sessions);
  }
}

/**
 * Record words read in the current session
 */
export async function recordWordsRead(bookId: string, words: number): Promise<void> {
  const sessions = await getSessions();

  const activeSession = sessions.find((s) => s.bookId === bookId && !s.endTime);

  if (activeSession) {
    activeSession.wordsRead = (activeSession.wordsRead || 0) + words;
    await saveSessions(sessions);
  }
}

/**
 * Get reading statistics for a book
 */
export async function getStats(bookId: string): Promise<BookReadingStats | undefined> {
  return dbGet<BookReadingStats>(STORES.STATS, bookId as any);
}

/**
 * Get statistics for all books
 */
export async function getAllStats(): Promise<BookReadingStats[]> {
  return dbGetAllFromIndex<BookReadingStats>(STORES.STATS, "lastReadAt");
}

/**
 * Update statistics for a book based on sessions
 */
export async function updateStats(bookId: string): Promise<BookReadingStats> {
  const sessions = await getSessions();
  const bookSessions = sessions.filter((s) => s.bookId === bookId && s.endTime);

  // Calculate total reading time from completed sessions
  const totalReadingTime = bookSessions.reduce(
    (sum, session) => sum + (session.endTime! - session.startTime),
    0,
  );

  // Calculate total words read
  const totalWordsRead = bookSessions.reduce((sum, session) => sum + (session.wordsRead || 0), 0);

  // Get unique chapters read
  const allChaptersRead = new Set<string>();
  bookSessions.forEach((session) => {
    session.chaptersRead.forEach((chapterId) => {
      allChaptersRead.add(chapterId);
    });
  });

  // Calculate active hours
  const activeHoursSet = new Set<number>();
  bookSessions.forEach((session) => {
    const startHour = new Date(session.startTime).getHours();
    activeHoursSet.add(startHour);
  });

  const activeHours = Array.from(activeHoursSet).sort((a, b) => a - b);

  // Get last active date
  const lastSession = bookSessions[bookSessions.length - 1];
  const lastActiveDate = lastSession
    ? new Date(lastSession.startTime).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  // Calculate reading speed (words per minute)
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

  await dbPut(STORES.STATS, stats);
  return stats;
}

/**
 * Get summary statistics for all books
 */
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
    // Count sessions from this week
    if (stats.lastReadAt && stats.lastReadAt > weekAgo) {
      // Estimate this week's reading time based on average
      const sessionsThisWeek = Math.ceil(stats.totalSessions / 4); // Rough estimate
      thisWeekReadingTime += stats.averageSessionTime * sessionsThisWeek;
    }
  });

  return {
    totalBooks: allStats.length,
    totalReadingTime: allStats.reduce((sum, s) => sum + s.totalReadingTime, 0),
    totalSessions: allStats.reduce((sum, s) => sum + s.totalSessions, 0),
    booksInProgress: allStats.filter((s) => s.chaptersCompleted > 0).length,
    completedBooks: 0, // Would need total chapter count to determine
    thisWeekReadingTime,
  };
}

/**
 * Delete statistics for a book
 */
export async function deleteStats(bookId: string): Promise<void> {
  await dbDelete(STORES.STATS, bookId as any);

  // Also remove associated sessions
  const sessions = await getSessions();
  const filtered = sessions.filter((s) => s.bookId !== bookId);
  await saveSessions(filtered);
}
