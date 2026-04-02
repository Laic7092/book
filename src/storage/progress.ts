// Reading progress storage module

import type { ReadingProgress } from "../core/types";
import { STORES, dbPut, dbGet, dbDelete } from "./db";

/**
 * Save reading progress for a book
 */
export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await dbPut(STORES.PROGRESS, {
    ...progress,
    updatedAt: Date.now(),
  });
}

/**
 * Get reading progress for a book
 */
export async function getProgress(bookId: string): Promise<ReadingProgress | undefined> {
  return dbGet<ReadingProgress>(STORES.PROGRESS, bookId);
}

/**
 * Update reading position
 */
export async function updateProgress(
  bookId: string,
  chapterId: string,
  chapterPercentage: number,
  percentage: number,
): Promise<void> {
  const progress: ReadingProgress = {
    bookId,
    chapterId,
    scrollPosition: chapterPercentage,
    percentage,
    chapterPercentage,
    updatedAt: Date.now(),
  };

  await saveProgress(progress);
}

/**
 * Delete progress for a book
 */
export async function deleteProgress(bookId: string): Promise<void> {
  await dbDelete(STORES.PROGRESS, bookId);
}

/**
 * Get the last read chapter for a book
 */
export async function getLastReadChapter(bookId: string): Promise<string | undefined> {
  const progress = await getProgress(bookId);
  return progress?.chapterId;
}
