import type { Annotation } from "../../core/types";
import { resolveCfiRange, compareCfi } from "../../utils/epub-cfi";
import { hexToRgba } from "../../utils/colors";
import { useDocumentMarker } from "../../composables/useDocumentMarker";

export interface SelectionInfo {
  rect: { top: number; left: number; bottom: number; right: number };
  text: string;
  rawRect: any;
}

export function useAnnotationRenderer(getDocument: () => Document | null | undefined) {
  const marker = useDocumentMarker(getDocument);
  let cleanupFns: (() => void)[] = [];

  function applyStyle(ann: Annotation, el: HTMLElement) {
    if (ann.type === "highlight") {
      el.style.backgroundColor = hexToRgba(ann.color, 0.35);
      el.style.borderRadius = "2px";
      el.style.textDecoration = "";
    } else {
      el.style.backgroundColor = "";
      el.style.textDecoration = "underline";
      el.style.textDecorationColor = ann.color;
      el.style.textDecorationThickness = "2px";
      el.style.textUnderlineOffset = "2px";
    }
    el.style.cursor = "pointer";
  }

  function applyToContent(annotations: Annotation[]) {
    const doc = getDocument();
    if (!doc) return;

    const targetIds = new Set(annotations.map((a) => a.id));

    // Remove spans for deleted annotations
    doc.querySelectorAll("[data-annotation-id]").forEach((el) => {
      const id = el.getAttribute("data-annotation-id")!;
      if (!targetIds.has(id)) marker.remove(id);
    });

    // Update styles for existing annotations
    for (const ann of annotations) {
      const existing = doc.querySelector(`[data-annotation-id="${ann.id}"]`) as HTMLElement | null;
      if (existing) applyStyle(ann, existing);
    }

    // Add new annotations (reverse document order to avoid position shifting)
    const renderedIds = new Set(
      Array.from(doc.querySelectorAll("[data-annotation-id]")).map(
        (el) => el.getAttribute("data-annotation-id")!,
      ),
    );
    const toAdd = annotations
      .filter((a) => !renderedIds.has(a.id))
      .sort((a, b) => compareCfi(b.startCfi, a.startCfi));

    for (const ann of toAdd) {
      const range = resolveCfiRange(ann.startCfi, ann.endCfi, doc.body);
      if (!range || range.collapsed) continue;

      marker.add({
        id: ann.id,
        range,
        attributes: {
          "data-annotation-id": ann.id,
          "data-annotation-type": ann.type,
        },
      });

      // Apply annotation-specific styling
      doc.querySelectorAll(`[data-annotation-id="${ann.id}"]`).forEach((el) => {
        applyStyle(ann, el as HTMLElement);
      });
    }
  }

  function removeSpans() {
    marker.removeAll();
  }

  function setupListeners(handlers: {
    onSelectionChange: (info: SelectionInfo | null) => void;
    onAnnotationClick: (annotationId: string, rect: DOMRect) => void;
  }): () => void {
    const doc = getDocument();
    if (!doc) return () => {};

    let debounceTimer: ReturnType<typeof setTimeout>;

    function toPageRect(iframeRect: DOMRect) {
      const iframe = doc!.defaultView?.frameElement as HTMLElement | null;
      if (!iframe) return iframeRect;
      const containerRect = iframe.getBoundingClientRect();
      return {
        top: containerRect.top + iframeRect.top,
        left: containerRect.left + iframeRect.left,
        bottom: containerRect.top + iframeRect.bottom,
        right: containerRect.left + iframeRect.right,
      };
    }

    function emitSelection() {
      const sel = doc!.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        handlers.onSelectionChange(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        handlers.onSelectionChange(null);
        return;
      }
      handlers.onSelectionChange({
        rect: toPageRect({
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
        } as DOMRect),
        text: sel.toString(),
        rawRect: rect,
      });
    }

    function handleSelectionChange() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(emitSelection, 200);
    }

    function handleSelectionEnd() {
      clearTimeout(debounceTimer);
      emitSelection();
    }

    doc.addEventListener("selectionchange", handleSelectionChange);
    doc.addEventListener("mouseup", handleSelectionEnd);
    doc.addEventListener("touchend", handleSelectionEnd);

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const annotationEl = target.closest("[data-annotation-id]");
      if (!annotationEl) return;
      const id = annotationEl.getAttribute("data-annotation-id")!;
      const rawRect = annotationEl.getBoundingClientRect();
      const pageRect = toPageRect(rawRect);
      handlers.onAnnotationClick(id, pageRect as DOMRect);
      e.stopPropagation();
      e.preventDefault();
    }
    doc.addEventListener("click", handleClick, true);

    cleanupFns.push(() => {
      doc.removeEventListener("selectionchange", handleSelectionChange);
      doc.removeEventListener("mouseup", handleSelectionEnd);
      doc.removeEventListener("touchend", handleSelectionEnd);
      doc.removeEventListener("click", handleClick, true);
      clearTimeout(debounceTimer);
    });

    return () => {
      doc.removeEventListener("selectionchange", handleSelectionChange);
      doc.removeEventListener("mouseup", handleSelectionEnd);
      doc.removeEventListener("touchend", handleSelectionEnd);
      doc.removeEventListener("click", handleClick, true);
      clearTimeout(debounceTimer);
    };
  }

  function cleanup() {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
    marker.cleanup();
  }

  return { applyToContent, removeSpans, setupListeners, cleanup };
}
