export interface MarkerOptions {
  id: string;
  range: Range;
  style?: Partial<CSSStyleDeclaration>;
  className?: string;
  attributes?: Record<string, string>;
}

/**
 * Generic iframe document marker.
 *
 * Wraps arbitrary DOM Ranges in styled <span> elements and manages
 * their lifecycle. Used by annotations plugin (highlights/underlines)
 * and available for other plugins (TTS word highlight, auto-read
 * paragraph highlight, etc.).
 */
export function useDocumentMarker(getDocument: () => Document | null | undefined) {
  const markers = new Map<string, HTMLElement[]>();

  function add(options: MarkerOptions): void {
    const doc = getDocument();
    if (!doc) return;

    const wrapper = doc.createElement("span");
    wrapper.setAttribute("data-marker-id", options.id);
    if (options.className) wrapper.className = options.className;
    if (options.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        wrapper.setAttribute(key, value);
      }
    }
    if (options.style) {
      const style = wrapper.style as unknown as Record<string, string>;
      for (const [key, value] of Object.entries(options.style)) {
        style[key] = String(value as unknown as string);
      }
    }

    const spans = wrapRange(doc, options.range, wrapper);
    markers.set(options.id, spans);
  }

  function remove(id: string): void {
    const spans = markers.get(id);
    if (!spans) return;
    for (const span of spans) {
      const parent = span.parentNode;
      if (parent) {
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        span.remove();
      }
    }
    markers.delete(id);
  }

  function removeAll(): void {
    for (const id of Array.from(markers.keys())) {
      remove(id);
    }
  }

  function getElement(id: string): HTMLElement | null {
    const doc = getDocument();
    if (!doc) return null;
    return doc.querySelector(`[data-marker-id="${id}"]`);
  }

  function updateStyle(id: string, style: Partial<CSSStyleDeclaration>): void {
    const doc = getDocument();
    if (!doc) return;
    doc.querySelectorAll(`[data-marker-id="${id}"]`).forEach((el) => {
      const elStyle = (el as HTMLElement).style as unknown as Record<string, string>;
      for (const [key, value] of Object.entries(style)) {
        elStyle[key] = String(value as unknown as string);
      }
    });
  }

  function cleanup(): void {
    removeAll();
  }

  return { add, remove, removeAll, getElement, updateStyle, cleanup };
}

// ── Internal: wrap a DOM Range in wrapper elements ──

function wrapRange(doc: Document, range: Range, wrapper: HTMLElement): HTMLElement[] {
  if (range.collapsed) return [];

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

  const spans: HTMLElement[] = [];
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
      spans.push(span);
    }
  }

  return spans;
}
