import { rewriteResourcePaths } from "../../reader-engine/resource-resolver";
import { applyContentTransformers } from "../../plugins/manager/registry";

/**
 * Unified content processing pipeline shared by both reading strategies.
 *
 * Pipeline: raw HTML → resource path rewrite → plugin content transformers → final HTML
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

/**
 * Process multiple chapters in parallel with deduplication by chapterId.
 * Handles the transformSeq pattern to prevent stale results.
 */
export function createBatchProcessor() {
  let seq = 0;

  async function processAll(
    chapters: Array<{ chapterId: string; title: string; content: string; order: number }>,
    bookId: string,
    resourceUrls: Map<string, string> | undefined,
  ): Promise<Array<{ chapterId: string; title: string; content: string; order: number }>> {
    const currentSeq = ++seq;
    const results = await Promise.all(
      chapters.map(async (ch) => ({
        ...ch,
        content: await processChapterHtml(ch.content, bookId, ch.chapterId, resourceUrls),
      })),
    );
    if (currentSeq !== seq) return []; // Stale, caller should ignore
    return results;
  }

  return { processAll };
}
