// Full-text search engine

import type { SearchResult, Chapter } from "../core/types";
import { getChapterContent } from "../storage/books";

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
  contextLength?: number;
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  caseSensitive: false,
  wholeWord: false,
  maxResults: 100,
  contextLength: 50,
};

/**
 * Search within a book's content
 */
export async function searchInBook(
  bookId: string,
  query: string,
  chapters: Chapter[],
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: SearchResult[] = [];

  if (!query.trim()) {
    return results;
  }

  const searchPattern = opts.wholeWord ? `\\b${escapeRegExp(query)}\\b` : escapeRegExp(query);

  const flags = opts.caseSensitive ? "g" : "gi";
  const regex = new RegExp(searchPattern, flags);

  for (const chapter of chapters) {
    if (results.length >= opts.maxResults) {
      break;
    }

    const content = await getChapterContent(bookId, chapter.id);
    if (!content) {
      continue;
    }

    // Strip HTML tags for searching
    const textContent = stripHtml(content);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(textContent)) !== null) {
      if (results.length >= opts.maxResults) {
        break;
      }

      const position = match.index;
      const context = extractContext(textContent, position, opts.contextLength);

      results.push({
        bookId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        text: match[0],
        position,
        context,
      });
    }
  }

  return results;
}

/**
 * Extract context around a match position
 */
function extractContext(text: string, position: number, contextLength: number): string {
  const start = Math.max(0, position - contextLength);
  const end = Math.min(text.length, position + contextLength + 100);

  let context = text.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) {
    context = "..." + context;
  }
  if (end < text.length) {
    context = context + "...";
  }

  // Normalize whitespace
  return context.replace(/\s+/g, " ").trim();
}

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight search matches in HTML content
 */
export function highlightMatches(html: string, query: string, caseSensitive = false): string {
  if (!query.trim()) {
    return html;
  }

  // Don't modify HTML tags
  const temp = document.createElement("div");
  temp.innerHTML = html;

  highlightTextNodes(temp, query, caseSensitive);

  return temp.innerHTML;
}

/**
 * Recursively highlight text nodes
 */
function highlightTextNodes(element: Element, query: string, caseSensitive: boolean): void {
  const textNodes: Text[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      textNodes.push(child as Text);
    } else if (child instanceof Element) {
      highlightTextNodes(child, query, caseSensitive);
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || "";
    const highlighted = highlightText(text, query, caseSensitive);

    if (highlighted !== text) {
      const wrapper = document.createElement("span");
      wrapper.innerHTML = highlighted;

      while (wrapper.firstChild) {
        textNode.parentNode?.insertBefore(wrapper.firstChild, textNode);
      }
      textNode.remove();
    }
  }
}

/**
 * Highlight text with mark tags
 */
function highlightText(text: string, query: string, caseSensitive: boolean): string {
  const escaped = escapeRegExp(query);
  const flags = caseSensitive ? "g" : "gi";
  return text.replace(new RegExp(`(${escaped})`, flags), "<mark>$1</mark>");
}

/**
 * Remove highlights from HTML
 */
export function removeHighlights(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;

  const marks = temp.querySelectorAll("mark");
  for (const mark of marks) {
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent?.insertBefore(mark.firstChild, mark);
    }
    mark.remove();
  }

  return temp.innerHTML;
}
