import { ref, watch } from "vue";
import type { Annotation } from "../../core/types";
import { getReaderHost } from "./store";
import { useAnnotationsStore } from "./store";
import { useAnnotationRenderer } from "./useAnnotationRenderer";
import { generateCfiFromRange } from "../../utils/epub-cfi";

export function useAnnotationUI() {
  const host = getReaderHost();
  const store = useAnnotationsStore();

  const renderer = useAnnotationRenderer(() => host?.getDocument() ?? null);

  // Re-render highlights whenever local annotations change (covers panel delete, popover delete, etc.)
  watch(
    () => store.annotations,
    () => {
      renderer.applyToContent(store.annotations);
    },
  );

  // Toolbar state
  const showToolbar = ref(false);
  const toolbarPos = ref({ top: 0, left: 0 });
  const showNoteInput = ref(false);
  const pendingSelection = ref<{
    startCfi: string;
    endCfi: string;
    text: string;
  } | null>(null);

  // Popover state
  const showPopover = ref(false);
  const popoverAnnotation = ref<Annotation | null>(null);
  const popoverPosition = ref({ top: 0, left: 0, height: 0 });

  let listenerCleanup: (() => void) | null = null;

  function setupListeners() {
    const doc = host?.getDocument();
    if (!doc) return;

    listenerCleanup?.();
    listenerCleanup = renderer.setupListeners({
      onSelectionChange: (info) => {
        if (!info) {
          showToolbar.value = false;
          showNoteInput.value = false;
          return;
        }
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        const spineIndex = host?.getCurrentChapter()?.order ?? 0;

        const startCollapsed = doc.createRange();
        startCollapsed.setStart(range.startContainer, range.startOffset);
        startCollapsed.collapse(true);
        const startCfi = generateCfiFromRange(spineIndex, startCollapsed, doc.body);

        const endCollapsed = doc.createRange();
        endCollapsed.setStart(range.endContainer, range.endOffset);
        endCollapsed.collapse(true);
        const endCfi = generateCfiFromRange(spineIndex, endCollapsed, doc.body);

        pendingSelection.value = { startCfi, endCfi, text: info.text };
        toolbarPos.value = {
          top: Math.max(56, info.rect.top),
          left: info.rect.left,
        };
        showToolbar.value = true;
      },
      onAnnotationClick: (annotationId, rect) => {
        const annotation = store.annotations.find((a) => a.id === annotationId);
        if (!annotation) return;
        popoverAnnotation.value = annotation;
        popoverPosition.value = { top: rect.top, left: rect.left, height: rect.height };
        showPopover.value = true;
      },
    });
  }

  function applyAnnotations() {
    renderer.applyToContent(store.annotations);
  }

  // Set up listeners once the iframe is ready
  host?.onReady(async () => {
    setupListeners();

    // Load annotations for the current chapter (already loaded before onReady fired)
    const currentChapterId = host.getCurrentChapter()?.id;
    if (currentChapterId && host.getCurrentBookId()) {
      await store.loadAnnotationsForChapter(host.getCurrentBookId()!, currentChapterId);
      applyAnnotations();
    }

    // Re-apply annotations when chapter changes
    host.onChapterChange(async (chapterId) => {
      await store.loadAnnotationsForChapter(host.getCurrentBookId() || "", chapterId);
      applyAnnotations();
    });
  });

  // Clean up on host cleanup
  host?.registerCleanup(() => {
    listenerCleanup?.();
    renderer.cleanup();
    store.reset();
  });

  // ── CRUD handlers ──

  async function handleHighlight(color: string) {
    const sel = pendingSelection.value;
    if (!sel || !host?.getCurrentChapter()) return;
    showToolbar.value = false;
    showNoteInput.value = false;
    await store.addAnnotation(
      host.getCurrentBookId()!,
      host.getCurrentChapter()!.id,
      "highlight",
      sel.startCfi,
      sel.endCfi,
      color,
      sel.text,
    );
    applyAnnotations();
    pendingSelection.value = null;
  }

  async function handleUnderline() {
    const sel = pendingSelection.value;
    if (!sel || !host?.getCurrentChapter()) return;
    showToolbar.value = false;
    await store.addAnnotation(
      host.getCurrentBookId()!,

      host.getCurrentChapter()!.id,
      "underline",
      sel.startCfi,
      sel.endCfi,
      "#60a5fa",
      sel.text,
    );
    applyAnnotations();
    pendingSelection.value = null;
  }

  function handleAddNote() {
    showNoteInput.value = true;
  }

  async function handleSaveNote(noteText: string) {
    const sel = pendingSelection.value;
    if (!sel || !host?.getCurrentChapter()) return;
    showToolbar.value = false;
    showNoteInput.value = false;
    await store.addAnnotation(
      host.getCurrentBookId()!,

      host.getCurrentChapter()!.id,
      "highlight",
      sel.startCfi,
      sel.endCfi,
      "#fbbf24",
      sel.text,
      noteText,
    );
    applyAnnotations();
    pendingSelection.value = null;
  }

  function handleCancelNote() {
    showToolbar.value = false;
    showNoteInput.value = false;
  }

  async function handleUpdateNote(id: string, note: string) {
    await store.updateAnnotation(id, { note } as Partial<Annotation>);
    showPopover.value = false;
  }

  async function handleUpdateColor(id: string, color: string) {
    await store.updateAnnotation(id, { color } as Partial<Annotation>);
    applyAnnotations();
  }

  async function handleDeleteAnnotation(id: string) {
    await store.removeAnnotation(id);
    showPopover.value = false;
    applyAnnotations();
  }

  return {
    showToolbar,
    toolbarPos,
    showNoteInput,
    showPopover,
    popoverAnnotation,
    popoverPosition,
    handleHighlight,
    handleUnderline,
    handleAddNote,
    handleSaveNote,
    handleCancelNote,
    handleUpdateNote,
    handleUpdateColor,
    handleDeleteAnnotation,
    applyAnnotations,
  };
}
