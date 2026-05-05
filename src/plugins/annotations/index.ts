import AnnotationsPanel from "./AnnotationsPanel.vue";
import AnnotationOverlay from "./AnnotationOverlay.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { useAnnotationsStore, setAnnotationsAdapter, setReaderHost } from "./store";

let store: ReturnType<typeof useAnnotationsStore> | null = null;

export const annotationsPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "annotations",
  name: "Annotations",
  version: "1.0.0",
  setup(ctx) {
    setAnnotationsAdapter(ctx.storage);
    setReaderHost(ctx.readerHost);
    store = useAnnotationsStore(ctx.pinia);

    ctx.events.on("book:opened", ({ bookId }) => store?.loadAnnotationsForBook(bookId));
    ctx.events.on("book:closed", () => store?.reset());

    ctx.ui.registerModal("annotations", AnnotationsPanel);
    ctx.ui.registerOverlay("annotations", AnnotationOverlay);
    ctx.ui.registerFooterAction({
      id: "annotations",
      position: "menu",
      label: "Annotations",
      icon: '<path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />',
      modal: "annotations",
      order: 30,
    });
  },
  teardown() {
    setAnnotationsAdapter(null);
    setReaderHost(null);
    store = null;
  },
};
