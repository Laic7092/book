import { applyContentTransformers } from "./plugins/manager/registry";

export async function processChapterHtml(
  rawHtml: string,
  bookId: string,
  chapterId: string,
  resourceUrls: Map<string, string> | undefined,
): Promise<string> {
  let html: string;

  if (resourceUrls && resourceUrls.size > 0) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
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
