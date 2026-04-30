import type { Annotation } from "../core/types";
import { resolveCfiRange, compareCfi } from "../utils/epub-cfi";
import { hexToRgba } from "../utils/colors";

export interface SelectionInfo {
  rect: { top: number; left: number; bottom: number; right: number };
  text: string;
}

export function useAnnotationRenderer(getDocument: () => Document | null | undefined) {
  let cleanupFns: (() => void)[] = [];

  function removeSpans() {
    const doc = getDocument();
    if (!doc) return;
    doc.querySelectorAll("[data-annotation-id]").forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      el.remove();
    });
  }

  function applyToContent(annotations: Annotation[]) {
    const doc = getDocument();
    if (!doc) return;

    // Collect currently rendered annotation IDs
    const renderedIds = new Set<string>();
    doc.querySelectorAll("[data-annotation-id]").forEach((el) => {
      renderedIds.add(el.getAttribute("data-annotation-id")!);
    });
    const targetIds = new Set(annotations.map((a) => a.id));

    // Remove spans for annotations that were deleted
    doc.querySelectorAll("[data-annotation-id]").forEach((el) => {
      const id = el.getAttribute("data-annotation-id")!;
      if (!targetIds.has(id)) {
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          el.remove();
        }
      }
    });

    // Update styles for existing annotations that may have changed
    for (const ann of annotations) {
      if (renderedIds.has(ann.id)) {
        const span = doc.querySelector(`[data-annotation-id="${ann.id}"]`) as HTMLElement | null;
        if (span) {
          if (ann.type === "highlight") {
            span.style.backgroundColor = hexToRgba(ann.color, 0.35);
            span.style.textDecoration = "";
          } else {
            span.style.backgroundColor = "";
            span.style.textDecoration = "underline";
            span.style.textDecorationColor = ann.color;
            span.style.textDecorationThickness = "2px";
            span.style.textUnderlineOffset = "2px";
          }
        }
      }
    }

    // Only wrap new annotations — existing ones keep their spans (and split text
    // nodes) intact so stored CFI offsets stay valid.
    const toAdd = annotations.filter((a) => !renderedIds.has(a.id));
    if (toAdd.length === 0) return;

    // Sort in reverse document order so wrapping doesn't shift earlier positions
    const sorted = [...toAdd].sort((a, b) => compareCfi(b.startCfi, a.startCfi));

    for (const ann of sorted) {
      const range = resolveCfiRange(ann.startCfi, ann.endCfi, doc.body);
      if (!range || range.collapsed) continue;

      const wrapper = doc.createElement("span");
      wrapper.setAttribute("data-annotation-id", ann.id);
      wrapper.setAttribute("data-annotation-type", ann.type);

      if (ann.type === "highlight") {
        wrapper.style.backgroundColor = hexToRgba(ann.color, 0.35);
        wrapper.style.borderRadius = "2px";
      } else {
        wrapper.style.textDecoration = "underline";
        wrapper.style.textDecorationColor = ann.color;
        wrapper.style.textDecorationThickness = "2px";
        wrapper.style.textUnderlineOffset = "2px";
      }
      wrapper.style.cursor = "pointer";

      wrapRange(doc, range, wrapper);
    }
  }

  function wrapRange(doc: Document, range: Range, wrapper: HTMLElement) {
    if (range.collapsed) return;

    // Collect text nodes that intersect the range.
    // Handle the common single-text-node case directly to avoid TreeWalker
    // edge cases when the range is rooted at a text node.
    const textNodes: Text[] = [];
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      textNodes.push(range.startContainer as Text);
    } else {
      const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent && node.textContent.length > 0) {
          textNodes.push(node);
        }
      }
    }

    for (const textNode of textNodes) {
      let startOffset = 0;
      let endOffset = (textNode.textContent || "").length;

      if (textNode === range.startContainer) startOffset = range.startOffset;
      if (textNode === range.endContainer) endOffset = range.endOffset;
      if (startOffset >= endOffset) continue;

      textNode.splitText(endOffset);
      const selectedNode = startOffset > 0 ? textNode.splitText(startOffset) : textNode;

      if (selectedNode.textContent && selectedNode.textContent.length > 0) {
        const span = wrapper.cloneNode() as HTMLElement;
        selectedNode.parentNode!.insertBefore(span, selectedNode);
        span.appendChild(selectedNode);
      }
    }
  }

  function setupListeners(handlers: {
    onSelectionChange: (info: SelectionInfo | null) => void;
    onAnnotationClick: (annotationId: string, rect: DOMRect) => void;
  }): () => void {
    const doc = getDocument();
    if (!doc) return () => {};

    let debounceTimer: ReturnType<typeof setTimeout>;

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
        rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
        text: sel.toString(),
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
      const rect = annotationEl.getBoundingClientRect();
      handlers.onAnnotationClick(id, rect);
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
  }

  return { applyToContent, removeSpans, setupListeners, cleanup };
}
