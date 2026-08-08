// EPUB CFI (Canonical Fragment Identifier) utilities
// Based on EPUB CFI Specification: https://www.w3.org/TR/epub-cfi/
//
// CFI Structure: epubcfi(<spine-ref>!<local-path>[~<local-end-path>],<text-start>,<text-end>)
//
// Spine reference: /6/<spine-index>/<step>*
//   - /6/ is the prefix indicating the root element of the content document
//   - spine-index is 1-based index into the spine
//   - steps are child indices (even = element, odd = text node)
//
// Each step: <index>[<assertions>]
//   - index: 1-based child position * 2 (even for elements, odd for text)
//   - assertions: optional id, before/after, text location markers

export interface ParsedCfi {
  spineIndex: number;
  steps: CfiStep[];
  endSteps?: CfiStep[];
  textOffsetStart?: number;
  textOffsetEnd?: number;
}

export interface CfiStep {
  index: number;
  idAssertion?: string;
  hasTextLocation?: boolean;
}

export interface CfiTarget {
  node: Node;
  offset: number;
}

// ─── Special character escaping per CFI spec ───────────────────────────────

const CFI_ESCAPE_CHARS = /[()[\]^,;=~]/g;
const CFI_UNESCAPE_PATTERN = /\^([0-9a-fA-F]{2})/g;

function escapeCfiChar(char: string): string {
  return `^${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
}

function escapeCfiText(text: string): string {
  return text.replace(CFI_ESCAPE_CHARS, escapeCfiChar);
}

function unescapeCfiText(text: string): string {
  return text.replace(CFI_UNESCAPE_PATTERN, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── Parsing ───────────────────────────────────────────────────────────────

function parseStep(raw: string): CfiStep | null {
  const match = raw.match(/^(\d+)(.*)$/);
  if (!match) return null;

  const index = parseInt(match[1], 10);
  if (isNaN(index) || index < 1) return null;

  let assertions = match[2] || "";
  let idAssertion: string | undefined;
  let hasTextLocation = false;

  // Parse bracket assertions: [id], [!], [@]
  if (assertions.startsWith("[")) {
    const endBracket = assertions.lastIndexOf("]");
    if (endBracket !== -1) {
      const inner = assertions.slice(1, endBracket);
      assertions = assertions.slice(endBracket + 1);

      if (inner === "!") {
        hasTextLocation = true;
      } else if (inner === "@") {
        hasTextLocation = true;
      } else {
        idAssertion = unescapeCfiText(inner);
      }
    }
  }

  return { index, idAssertion, hasTextLocation };
}

function parseSteps(path: string): CfiStep[] {
  const parts = path.split("/").filter(Boolean);
  const steps: CfiStep[] = [];
  for (const part of parts) {
    const step = parseStep(part);
    if (step) steps.push(step);
  }
  return steps;
}

export function parseCfi(cfi: string): ParsedCfi | null {
  if (!cfi) return null;

  // Strip epubcfi() wrapper
  let inner: string;
  if (cfi.startsWith("epubcfi(") && cfi.endsWith(")")) {
    inner = cfi.slice(8, -1).trim();
  } else {
    inner = cfi.trim();
  }

  if (!inner.startsWith("/")) return null;

  // Split on ! for range support (start ~ end)
  const rangeSplit = inner.split("~");
  const startPart = rangeSplit[0];
  const endPart = rangeSplit.length > 1 ? rangeSplit[1] : undefined;

  // Parse spine reference: /6/<spine-index>
  const spineMatch = startPart.match(/^\/6\/(\d+)(.*)$/);
  if (!spineMatch) return null;

  const spineIndex = parseInt(spineMatch[1], 10) - 1; // Convert to 0-based
  if (isNaN(spineIndex)) return null;

  const localPath = spineMatch[2] || "";

  // Split local path from text offset (comma separates path from text offset)
  const commaIndex = localPath.indexOf(",");
  let pathStr = localPath;
  let textOffsetStart: number | undefined;
  let textOffsetEnd: number | undefined;

  if (commaIndex !== -1) {
    pathStr = localPath.slice(0, commaIndex);
    const offsets = localPath.slice(commaIndex + 1).split(",");
    if (offsets[0]) textOffsetStart = parseInt(offsets[0], 10);
    if (offsets[1]) textOffsetEnd = parseInt(offsets[1], 10);
  }

  const steps = parseSteps(pathStr);

  let endSteps: CfiStep[] | undefined;
  if (endPart) {
    endSteps = parseSteps(endPart.startsWith("/") ? endPart : `/${endPart}`);
  }

  return { spineIndex, steps, endSteps, textOffsetStart, textOffsetEnd };
}

// ─── DOM → CFI Generation ─────────────────────────────────────────────────

function isTextNode(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE;
}

function isIgnorableNode(node: Node): boolean {
  // Per CFI spec, certain nodes are ignored in index calculation:
  // comments, processing instructions, and empty text nodes (whitespace-only)
  if (node.nodeType === Node.COMMENT_NODE) return true;
  if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) return true;
  if (isTextNode(node) && (node.textContent || "").trim().length === 0) return true;
  // Annotation spans are presentation-only, skip them so CFI paths remain stable
  // regardless of whether annotations are rendered
  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute("data-annotation-id"))
    return true;
  return false;
}

function getCfiIndex(node: Node): number {
  // Per CFI spec:
  // Element nodes get even indices: (elementPosition + 1) * 2
  // Text nodes get odd indices: (textPosition + 1) * 2 - 1
  const parent = node.parentNode;
  if (!parent) return 0;

  let elPosition = 0;
  let textPosition = 0;
  const siblings = parent.childNodes;

  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (isIgnorableNode(sibling)) continue;
    if (sibling === node) {
      if (isTextNode(sibling)) {
        return (textPosition + 1) * 2 - 1;
      }
      return (elPosition + 1) * 2;
    }
    if (isTextNode(sibling)) {
      textPosition++;
    } else {
      elPosition++;
    }
  }

  return 0;
}

function buildStep(node: Node): string {
  const index = getCfiIndex(node);
  if (index === 0) return "";

  // Add id assertion if element has an id
  if (node.nodeType === Node.ELEMENT_NODE) {
    const id = (node as Element).getAttribute("id");
    if (id) {
      return `${index}[${escapeCfiText(id)}]`;
    }
  }

  return `${index}`;
}

function buildPathFromNode(
  node: Node,
  root: Node,
  offset = 0,
): { path: string; textOffset?: number } {
  const steps: string[] = [];
  let current: Node | null = node;
  let textOffset: number | undefined;

  // For text nodes, the offset is the character position within the text node
  // This goes AFTER the comma in the CFI, not as a path step
  if (isTextNode(node)) {
    textOffset = offset;
  }

  while (current && current !== root) {
    const parentNode: Node | null = current.parentNode;
    if (!parentNode) break;

    const step = buildStep(current);
    if (step) {
      steps.unshift(step);
    }

    current = parentNode;
  }

  return { path: steps.length > 0 ? `/${steps.join("/")}` : "", textOffset };
}

function buildPathFromRange(range: Range, root: Node): { path: string; textOffset?: number } {
  const startContainer = range.startContainer;
  const startOffset = range.startOffset;

  if (isTextNode(startContainer)) {
    return buildPathFromNode(startContainer, root, startOffset);
  }

  if (startOffset === 0) {
    return buildPathFromNode(startContainer, root, 0);
  }

  if (startOffset < startContainer.childNodes.length) {
    const child = startContainer.childNodes[startOffset];
    return buildPathFromNode(child, root, 0);
  }

  return buildPathFromNode(startContainer, root, 0);
}

/**
 * Generate a CFI from a DOM Range.
 * @param spineIndex - 0-based index of the spine item (chapter)
 * @param range - DOM Range representing the target location
 * @param contentRoot - Root element of the content document (e.g., <body> or <html>)
 */
export function generateCfiFromRange(
  spineIndex: number,
  range: Range,
  contentRoot: Element,
): string {
  const { path, textOffset } = buildPathFromRange(range, contentRoot);
  const offsetPart = textOffset !== undefined ? `,${textOffset}` : "";
  return `epubcfi(/6/${spineIndex + 1}${path}${offsetPart})`;
}

/**
 * Generate a CFI for a specific element position.
 * Useful for bookmarking the top of an element.
 */
export function generateCfiFromElement(
  spineIndex: number,
  element: Element,
  contentRoot: Element,
): string {
  const { path } = buildPathFromNode(element, contentRoot);
  return `epubcfi(/6/${spineIndex + 1}${path})`;
}

/**
 * Generate a CFI for a text position within a container.
 * @param spineIndex - 0-based spine index
 * @param container - Container element (e.g., article or body)
 * @param charOffset - Character offset from the start of the container's text content
 */
export function generateCfiFromCharOffset(
  spineIndex: number,
  container: Element,
  charOffset: number,
): string {
  // Walk through text nodes to find the target position
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let currentOffset = 0;
  let targetNode: Text | null = null;
  let targetOffset = 0;

  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent || "";
    const textLen = text.length;

    if (currentOffset + textLen >= charOffset) {
      targetNode = node as Text;
      targetOffset = charOffset - currentOffset;
      break;
    }

    currentOffset += textLen;
    node = walker.nextNode();
  }

  if (!targetNode) {
    // Fallback: use the last text node
    const allText = container.textContent || "";
    targetNode = container.ownerDocument.createTextNode("");
    targetOffset = Math.min(charOffset, allText.length);

    // Try to find the actual last text node
    const lastWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let last: Node | null = null;
    let n: Node | null = lastWalker.nextNode();
    while (n) {
      last = n;
      n = lastWalker.nextNode();
    }
    if (last) targetNode = last as Text;
  }

  const { path, textOffset } = buildPathFromNode(targetNode, container, targetOffset);
  const offsetPart = textOffset !== undefined ? `,${textOffset}` : "";
  return `epubcfi(/6/${spineIndex + 1}${path}${offsetPart})`;
}

// ─── CFI → DOM Resolution ─────────────────────────────────────────────────

function findNthNonIgnorableChild(parent: Node, targetIndex: number): Node | null {
  // targetIndex is an even CFI index (element step).
  // getCfiIndex uses separate elPosition/textPosition counters, so we
  // must only count element children here — not text nodes.
  const position = targetIndex / 2 - 1;
  let count = 0;

  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (isIgnorableNode(child)) continue;
    if (isTextNode(child)) continue;
    if (count === position) return child;
    count++;
  }

  return null;
}

function resolveSteps(steps: CfiStep[], root: Node): { node: Node; offset: number } | null {
  if (steps.length === 0) {
    return { node: root, offset: 0 };
  }

  let current: Node = root;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // If the step index is odd, it refers to a text node
    if (step.index % 2 === 1) {
      // Find the nth non-ignorable text node among children
      let textNodeCount = 0;
      const targetPosition = Math.floor(step.index / 2);
      let found = false;

      const children = current.childNodes;
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        if (isIgnorableNode(child)) continue;
        if (!isTextNode(child)) continue;
        if (textNodeCount === targetPosition) {
          current = child;
          found = true;
          break;
        }
        textNodeCount++;
      }

      if (!found) return null;

      // If there are more steps, we need to continue from this text node's parent
      // but text nodes don't have children, so this is the target
      if (i < steps.length - 1) {
        // This shouldn't happen in a valid CFI, but handle gracefully
        return null;
      }

      // The last step for a text node might be a character offset
      // (handled separately via textOffsetStart)
      return { node: current, offset: 0 };
    }

    // Even index: element node
    const child = findNthNonIgnorableChild(current, step.index);
    if (!child) return null;
    current = child;
  }

  return { node: current, offset: 0 };
}

/**
 * Resolve a CFI to the nearest Element (ascending from text node if needed).
 */
export function resolveCfiToElement(cfi: string, contentRoot: Element): Element | null {
  const target = resolveCfi(cfi, contentRoot);
  if (!target) return null;
  if (target.node.nodeType === Node.TEXT_NODE) {
    return (target.node as Text).parentElement;
  }
  return target.node as Element;
}

/**
 * LEGACY_FALLBACK_CFI — used for bookmarks migrated from the pre-CFI schema.
 */
export const LEGACY_FALLBACK_CFI = "epubcfi(/6/1/2)";

/**
 * Resolve a CFI to a DOM target within a content document.
 * @param cfi - The CFI string
 * @param contentRoot - Root element of the content document
 */
export function resolveCfi(cfi: string, contentRoot: Element): CfiTarget | null {
  const parsed = parseCfi(cfi);
  if (!parsed) return null;

  const result = resolveSteps(parsed.steps, contentRoot);
  if (!result) return null;

  const { node, offset } = result;

  // Apply text offset if present
  if (parsed.textOffsetStart !== undefined && isTextNode(node)) {
    const textLen = (node.textContent || "").length;
    const clampedOffset = Math.min(Math.max(0, parsed.textOffsetStart), textLen);
    return { node, offset: clampedOffset };
  }

  return { node, offset };
}

/**
 * Resolve a start+end CFI pair to a DOM Range spanning both positions.
 */
export function resolveCfiRange(
  startCfi: string,
  endCfi: string,
  contentRoot: Element,
): Range | null {
  const start = resolveCfi(startCfi, contentRoot);
  const end = resolveCfi(endCfi, contentRoot);
  if (!start || !end) return null;

  const range = contentRoot.ownerDocument!.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

// ─── Comparison ────────────────────────────────────────────────────────────

/**
 * Compare two CFIs according to the EPUB CFI specification.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Comparison rules (per spec):
 * 1. Compare spine indices
 * 2. Compare step indices lexicographically
 * 3. Compare text offsets
 */
export function compareCfi(a: string, b: string): number {
  const parsedA = parseCfi(a);
  const parsedB = parseCfi(b);

  if (!parsedA && !parsedB) return 0;
  if (!parsedA) return -1;
  if (!parsedB) return 1;

  // 1. Compare spine indices
  if (parsedA.spineIndex !== parsedB.spineIndex) {
    return parsedA.spineIndex - parsedB.spineIndex;
  }

  // 2. Compare steps
  const maxSteps = Math.max(parsedA.steps.length, parsedB.steps.length);
  for (let i = 0; i < maxSteps; i++) {
    const stepA = parsedA.steps[i]?.index ?? 0;
    const stepB = parsedB.steps[i]?.index ?? 0;
    if (stepA !== stepB) return stepA - stepB;
  }

  // 3. Compare text offsets
  const offsetA = parsedA.textOffsetStart ?? 0;
  const offsetB = parsedB.textOffsetStart ?? 0;
  return offsetA - offsetB;
}

// ─── Utilities ─────────────────────────────────────────────────────────────
