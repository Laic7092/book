import { ref, watch, computed, onUnmounted } from "vue";
import type { Annotation } from "../../core/types";
import { currentSession } from "../../stores/reader-session";
import { useAnnotationStore, useAnnotationFilters, createAnnotation } from "./index";
import { useAnnotationRenderer } from "./useAnnotationRenderer";
import { generateCfiFromRange } from "../../utils/epub-cfi";

export function useAnnotationUI() {
  const session = currentSession.value;
  const store = useAnnotationStore();
  const { currentBookId, currentChapterId } = useAnnotationFilters();

  const renderer = useAnnotationRenderer(() => session?.getDocument() ?? null);

  // Derive chapter-scoped view from the full entity store cache.
  const annotationsForChapter = computed(() =>
    store.items.value.filter(
      (a) => a.bookId === currentBookId.value && a.chapterId === currentChapterId.value,
    ),
  );

  // Re-render highlights whenever chapter annotations change.
  watch(annotationsForChapter, () => {
    renderer.applyToContent(annotationsForChapter.value);
  });

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
    const doc = session?.getDocument();
    if (!doc) return;

    const s = session?.getState();
    if (!s) return;
    const chapter = s.chapters[s.currentChapterIndex];

    listenerCleanup?.();
    listenerCleanup = renderer.setupListeners({
      onSelectionChange: (info) => {
        const BAR_WIDTH = 320;
        const BAR_HEIGHT = 45;
        const VIEW_EDGE = 24; // 距视口边缘的安全距离
        const GAP = 24 + 45; // 与选区的垂直间距

        if (!info) {
          showToolbar.value = false;
          showNoteInput.value = false;
          showPopover.value = false;
          return;
        }

        const rect = info.rawRect;
        if (!rect) return;

        const { top, bottom, left, right } = rect;
        const viewWidth = doc.documentElement.offsetWidth;
        const viewHeight = doc.documentElement.offsetHeight;

        // ---- 垂直定位：优先下方（避开系统菜单），空间不够则上方 ----
        // 候选1：选区下方 + GAP
        let barTop = bottom + GAP;
        // 如果下方放不下（超出底部 VIEW_EDGE 安全区），改上方
        if (barTop + BAR_HEIGHT > viewHeight - VIEW_EDGE) {
          barTop = top - BAR_HEIGHT - GAP;
          // 上方也不够（超出顶部 VIEW_EDGE 安全区），强制吸附到顶部安全线
          if (barTop < VIEW_EDGE) {
            barTop = VIEW_EDGE;
          }
        }
        // 最终垂直边界确保在 [VIEW_EDGE, viewHeight - BAR_HEIGHT - VIEW_EDGE]
        barTop = Math.max(VIEW_EDGE, Math.min(barTop, viewHeight - BAR_HEIGHT - VIEW_EDGE));

        // ---- 水平定位：与选区居中对齐，仅受 VIEW_EDGE 约束 ----
        let barLeft = (left + right) / 2 - BAR_WIDTH / 2;
        barLeft = Math.max(VIEW_EDGE, Math.min(barLeft, viewWidth - BAR_WIDTH - VIEW_EDGE));
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        const spineIndex = chapter?.order ?? 0;

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
          top: barTop,
          left: barLeft,
        };
        showToolbar.value = true;
      },
      onAnnotationClick: (annotationId, rect) => {
        const annotation = annotationsForChapter.value.find((a) => a.id === annotationId);
        if (!annotation) return;
        popoverAnnotation.value = annotation;
        popoverPosition.value = { top: rect.top, left: rect.left, height: rect.height };
        showPopover.value = true;
      },
    });
  }

  function applyAnnotations() {
    renderer.applyToContent(annotationsForChapter.value);
  }

  // Set up listeners once the iframe is ready, and re-apply on chapter change.
  // Use a polling approach for onReady — check if document is available
  let initDone = false;
  let lastChapterId = "";

  const stopDocCheck = watch(
    () => session?.getDocument(),
    (doc) => {
      if (initDone || !doc || !session) return;

      const s = session.getState();
      if (s.status !== "ready") return;

      initDone = true;
      setupListeners();

      const currentCh = s.chapters[s.currentChapterIndex];
      if (currentCh?.id && s.bookId) {
        currentChapterId.value = currentCh.id;
        void store.reload().then(() => applyAnnotations());
      }

      lastChapterId = currentCh?.id ?? "";
    },
    { immediate: true },
  );

  // Re-apply annotations when machine state chapter changes
  const stopChapterWatch = watch(
    () => {
      const s = session?.getState();
      return s ? s.chapters[s.currentChapterIndex]?.id : null;
    },
    (chapterId) => {
      if (chapterId && chapterId !== lastChapterId && initDone) {
        lastChapterId = chapterId;
        currentChapterId.value = chapterId;
        void store.reload().then(() => applyAnnotations());
        // Re-setup listeners since the iframe content changed
        setupListeners();
      }
    },
  );

  onUnmounted(() => {
    stopDocCheck();
    stopChapterWatch();
    listenerCleanup?.();
    renderer.cleanup();
  });

  // ── CRUD handlers ──

  function getCurrentChapterInfo() {
    const s = session?.getState();
    if (!s) return { bookId: "", chapterId: "" };
    const chapter = s.chapters[s.currentChapterIndex];
    return { bookId: s.bookId, chapterId: chapter?.id ?? "" };
  }

  async function handleHighlight(color: string) {
    const sel = pendingSelection.value;
    const { bookId, chapterId } = getCurrentChapterInfo();
    if (!sel || !bookId || !chapterId) return;
    showToolbar.value = false;
    showNoteInput.value = false;
    await store.add(
      createAnnotation(bookId, chapterId, "highlight", sel.startCfi, sel.endCfi, color, sel.text),
    );
    applyAnnotations();
    pendingSelection.value = null;
  }

  async function handleUnderline() {
    const sel = pendingSelection.value;
    const { bookId, chapterId } = getCurrentChapterInfo();
    if (!sel || !bookId || !chapterId) return;
    showToolbar.value = false;
    await store.add(
      createAnnotation(
        bookId,
        chapterId,
        "underline",
        sel.startCfi,
        sel.endCfi,
        "#60a5fa",
        sel.text,
      ),
    );
    applyAnnotations();
    pendingSelection.value = null;
  }

  function handleAddNote() {
    showNoteInput.value = true;
  }

  async function handleSaveNote(_noteText: string) {
    const sel = pendingSelection.value;
    const { bookId, chapterId } = getCurrentChapterInfo();
    if (!sel || !bookId || !chapterId) return;
    showToolbar.value = false;
    showNoteInput.value = false;
    await store.add(
      createAnnotation(
        bookId,
        chapterId,
        "highlight",
        sel.startCfi,
        sel.endCfi,
        "#fbbf24",
        sel.text,
      ),
    );
    applyAnnotations();
    pendingSelection.value = null;
  }

  async function handleDeleteAnnotation(id: string) {
    await store.remove(id);
    showPopover.value = false;
    applyAnnotations();
  }

  function handleCancelNote() {
    showNoteInput.value = false;
    showToolbar.value = true;
  }

  async function handleUpdateNote(note: string) {
    const ann = popoverAnnotation.value;
    if (!ann) return;
    await store.update(ann.id, { note, updatedAt: Date.now() });
    applyAnnotations();
  }

  async function handleUpdateColor(color: string) {
    const ann = popoverAnnotation.value;
    if (!ann) return;
    await store.update(ann.id, { color, updatedAt: Date.now() });
    applyAnnotations();
  }

  function handleDismissPopover() {
    showPopover.value = false;
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
    handleDismissPopover,
  };
}
