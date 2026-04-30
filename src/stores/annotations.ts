import { defineStore } from "pinia";
import type { Annotation } from "../core/types";
import { ErrorCode, createReaderError } from "../core/errors";
import * as annotationsStorage from "../storage/annotations";
import { dbPut, STORES } from "../storage/db";

export interface AnnotationsState {
  currentBookId: string | null;
  currentChapterId: string | null;
  annotations: Annotation[];
}

export const useAnnotationsStore = defineStore("annotations", {
  state: (): AnnotationsState => ({
    currentBookId: null,
    currentChapterId: null,
    annotations: [],
  }),

  actions: {
    async loadAnnotationsForChapter(bookId: string, chapterId: string): Promise<Annotation[]> {
      this.currentBookId = bookId;
      this.currentChapterId = chapterId;
      this.annotations = await annotationsStorage.getAnnotationsByChapter(bookId, chapterId);
      return this.annotations;
    },

    async loadAnnotationsForBook(bookId: string): Promise<Annotation[]> {
      const result = await annotationsStorage.getAnnotationsByBook(bookId);
      return result;
    },

    async addAnnotation(
      bookId: string,
      chapterId: string,
      type: "highlight" | "underline",
      startCfi: string,
      endCfi: string,
      color: string,
      textPreview: string,
      note?: string,
    ): Promise<Annotation> {
      const annotation = annotationsStorage.createAnnotation(
        bookId,
        chapterId,
        type,
        startCfi,
        endCfi,
        color,
        textPreview,
        note,
      );
      await annotationsStorage.addAnnotation(annotation);

      if (this.currentBookId === bookId && this.currentChapterId === chapterId) {
        this.annotations.push(annotation);
      }

      return annotation;
    },

    async updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void> {
      const existing = await annotationsStorage.getAnnotation(id);
      if (!existing) {
        throw createReaderError("Annotation not found", ErrorCode.BOOKMARK_NOT_FOUND);
      }
      const updated = { ...existing, ...updates, updatedAt: Date.now() };
      await dbPut(STORES.ANNOTATIONS, updated);

      const index = this.annotations.findIndex((a) => a.id === id);
      if (index !== -1) {
        this.annotations[index] = updated;
      }
    },

    async removeAnnotation(id: string): Promise<void> {
      await annotationsStorage.deleteAnnotation(id);
      this.annotations = this.annotations.filter((a) => a.id !== id);
    },

    reset(): void {
      this.currentBookId = null;
      this.currentChapterId = null;
      this.annotations = [];
    },
  },
});
