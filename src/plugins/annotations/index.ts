import { useAnnotationsStore } from "./store";
import AnnotationsPanel from "./AnnotationsPanel.vue";
import AnnotationOverlay from "./AnnotationOverlay.vue";
import type { Plugin } from "../types";

// Re-export storage API (used by plugins/search for scroll-mode annotation sync)
export { getAnnotationsByChapter } from "./storage";

let store: ReturnType<typeof useAnnotationsStore> | null = null;

export const annotationsPlugin: Plugin = {
  id: "annotations",
  name: "Annotations",
  version: "1.0.0",
  modalComponents: { annotations: AnnotationsPanel },
  overlayComponents: { annotations: AnnotationOverlay },
  footerActions: [
    {
      id: "annotations",
      position: "menu",
      label: "Annotations",
      icon: '<path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />',
      modal: "annotations",
      order: 30,
    },
  ],
  onInit() {
    store = useAnnotationsStore();
  },
  async onBookOpen(bookId: string) {
    if (store) await store.loadAnnotationsForBook(bookId);
  },
  onBookClose() {
    if (store) store.reset();
  },
};
