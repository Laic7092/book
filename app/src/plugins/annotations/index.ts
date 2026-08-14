import { ref } from "vue";
// Async components — loaded on demand
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import { createEntityStore, type EntityStore } from "../../core/plugin-runtime/store-factory";
import type { Annotation } from "../../core/types";
// ── Module-level state ──

let _store: EntityStore<Annotation> | null = null;
const _currentBookId = ref<string | null>(null);
const _currentChapterId = ref<string | null>(null);

/** Access the reactive annotation store from Vue components. */
export function useAnnotationStore(): EntityStore<Annotation> {
  if (!_store) throw new Error("[annotations] Plugin not initialized");
  return _store;
}

/** Create a new Annotation object with a unique ID. */
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

/** Reactive filters scoped to the currently open book/chapter. */
export function useAnnotationFilters() {
  return {
    currentBookId: _currentBookId,
    currentChapterId: _currentChapterId,
  };
}

// ── Plugin registration ──

export const annotationsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "annotations",
  name: "Annotations",
  version: "1.0.0",
  setup(ctx) {
    _store = createEntityStore<Annotation>(ctx.storage, "annotation", (a) => a.id);

    ctx.events.on("book:opened", ({ bookId }) => {
      _currentBookId.value = bookId;
      void _store?.reload();
    });
    ctx.events.on("book:closed", () => {
      _currentBookId.value = null;
      _currentChapterId.value = null;
    });
    ctx.events.on("chapter:changed", ({ chapterId }) => {
      _currentChapterId.value = chapterId;
    });
    ctx.events.on("book:deleted", async ({ bookId }) => {
      const store = _store;
      if (!store) return;
      for (const a of store.items.value) {
        if (a.bookId === bookId) await store.remove(a.id);
      }
    });

    ctx.ui.registerModal("annotations", () => import("./AnnotationsPanel.vue"));
    ctx.ui.registerOverlay("annotations", () => import("./AnnotationOverlay.vue"));
    ctx.ui.registerFooterAction({
      id: "annotations",
      position: "menu",
      label: "Annotations",
      icon: '<path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />',
      modal: "annotations",
      order: 30,
    });
  },
};
