import { defineStore } from "pinia";
import type { Annotation } from "../../core/types";
import { ErrorCode, createReaderError } from "../../core/errors";
import type { PluginStorageAdapter } from "../types";

let adapter: PluginStorageAdapter | null = null;

export function setAnnotationsAdapter(a: PluginStorageAdapter) {
  adapter = a;
}

function useAdapter() {
  return adapter!;
}

function createAnnotation(
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

export interface AnnotationsState {
  currentBookId: string | null;
  currentChapterId: string | null;
  annotations: Annotation[];
  allAnnotations: Annotation[];
}

export const useAnnotationsStore = defineStore("annotations", {
  state: (): AnnotationsState => ({
    currentBookId: null,
    currentChapterId: null,
    annotations: [],
    allAnnotations: [],
  }),

  actions: {
    async loadAnnotationsForChapter(bookId: string, chapterId: string): Promise<Annotation[]> {
      this.currentBookId = bookId;
      this.currentChapterId = chapterId;
      const all = await useAdapter().getAll<Annotation>();
      this.annotations = all
        .filter((a) => a.bookId === bookId && a.chapterId === chapterId)
        .sort((a, b) => a.createdAt - b.createdAt);
      return this.annotations;
    },

    async loadAnnotationsForBook(bookId: string): Promise<Annotation[]> {
      const all = await useAdapter().getAll<Annotation>();
      this.allAnnotations = all
        .filter((a) => a.bookId === bookId)
        .sort((a, b) => a.createdAt - b.createdAt);
      return this.allAnnotations;
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
      const annotation = createAnnotation(
        bookId,
        chapterId,
        type,
        startCfi,
        endCfi,
        color,
        textPreview,
        note,
      );
      await useAdapter().put(annotation.id, annotation, annotation.createdAt);

      if (this.currentBookId === bookId && this.currentChapterId === chapterId) {
        this.annotations.push(annotation);
      }
      if (this.currentBookId === bookId) {
        this.allAnnotations.push(annotation);
      }
      return annotation;
    },

    async updateAnnotation(id: string, updates: Partial<Annotation>): Promise<void> {
      const a = useAdapter();
      const existing = await a.get<Annotation>(id);
      if (!existing) {
        throw createReaderError(`Annotation ${id} not found`, ErrorCode.BOOKMARK_NOT_FOUND);
      }
      await a.put(id, { ...existing, ...updates, updatedAt: Date.now() });
      const updated = await a.get<Annotation>(id);
      const index = this.annotations.findIndex((a) => a.id === id);
      if (index !== -1 && updated) {
        this.annotations[index] = updated;
      }
    },

    async removeAnnotation(id: string): Promise<void> {
      await useAdapter().delete(id);
      this.annotations = this.annotations.filter((a) => a.id !== id);
      this.allAnnotations = this.allAnnotations.filter((a) => a.id !== id);
    },

    reset(): void {
      this.currentBookId = null;
      this.currentChapterId = null;
      this.annotations = [];
      this.allAnnotations = [];
    },
  },
});
