import type { Annotation } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import { STORES, dbPut, dbGet, dbGetAll, dbDelete, dbGetAllFromIndex } from "./db";

export function createAnnotation(
  bookId: string,
  chapterId: string,
  type: "highlight" | "underline",
  startCfi: string,
  endCfi: string,
  color: string,
  textPreview: string,
  note?: string,
): Annotation {
  const now = Date.now();
  return {
    id: `an_${now}_${Math.random().toString(36).substring(2, 9)}`,
    bookId,
    chapterId,
    type,
    startCfi,
    endCfi,
    color,
    note: note || "",
    textPreview,
    createdAt: now,
    updatedAt: now,
  };
}

export async function addAnnotation(annotation: Annotation): Promise<void> {
  await dbPut(STORES.ANNOTATIONS, annotation);
}

export async function getAnnotation(id: string): Promise<Annotation | undefined> {
  return dbGet<Annotation>(STORES.ANNOTATIONS, id);
}

export async function getAnnotationsByChapter(
  bookId: string,
  chapterId: string,
): Promise<Annotation[]> {
  const annotations = await dbGetAllFromIndex<Annotation>(STORES.ANNOTATIONS, "book_chapter", [
    bookId,
    chapterId,
  ]);
  return annotations.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAnnotationsByBook(bookId: string): Promise<Annotation[]> {
  const annotations = await dbGetAllFromIndex<Annotation>(STORES.ANNOTATIONS, "bookId", bookId);
  return annotations.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAllAnnotations(): Promise<Annotation[]> {
  const annotations = await dbGetAll<Annotation>(STORES.ANNOTATIONS);
  return annotations.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void> {
  const existing = await getAnnotation(id);
  if (!existing) {
    throw createReaderError(`Annotation ${id} not found`, ErrorCode.BOOKMARK_NOT_FOUND);
  }
  await dbPut(STORES.ANNOTATIONS, { ...existing, ...updates, updatedAt: Date.now() });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await dbDelete(STORES.ANNOTATIONS, id);
}

export async function deleteAnnotationsByChapter(bookId: string, chapterId: string): Promise<void> {
  const annotations = await getAnnotationsByChapter(bookId, chapterId);
  for (const ann of annotations) {
    await dbDelete(STORES.ANNOTATIONS, ann.id);
  }
}
