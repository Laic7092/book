// Content processing pipeline: rewrites resource paths and applies plugin
// content transformers. Shared by pagination and scroll rendering paths.

import { rewriteResourcePaths } from "./resource-resolver";
import { applyContentTransformers } from "../plugins/manager/registry";

/**
 * Process a single chapter's HTML through the full pipeline:
 *   1. Rewrite resource paths (EPUB internal → blob URLs)
 *   2. Apply plugin content transformers (theme, typography, etc.)
 *
 * Returns un-transformed content on transformer failure.
 */
export async function processChapterHtml(
  rawHtml: string,
  bookId: string,
  chapterId: string,
  resourceUrls: Map<string, string> | undefined,
): Promise<string> {
  let html: string;

  if (resourceUrls && resourceUrls.size > 0) {
    const doc = rewriteResourcePaths(rawHtml, resourceUrls);
    html = doc.body.innerHTML;
  } else {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    html = doc.body.innerHTML;
  }

  try {
    html = await applyContentTransformers(html, { bookId, chapterId });
  } catch {
    // Return un-transformed content on error
  }

  return html;
}
