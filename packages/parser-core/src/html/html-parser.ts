import { generateId, readAsText } from "../base";
import { collectChildren, wrapHtml, parseHTML } from "../shared";
import type { BookParser, ParserResult, ChapterData } from "../types";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);

export class HtmlParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = ["text/html", "application/xhtml+xml"];

  readonly format = "html";
  readonly requiresBrowser = true;

  supportsFormat(mimeType: string): boolean {
    return HtmlParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    const rawHtml = await readAsText(file);
    const doc = parseHTML(rawHtml);

    const title =
      doc.querySelector("title")?.textContent?.trim() ||
      file.name.replace(/\.[^.]+$/, "") ||
      "Untitled";
    const bookId = generateId("book");

    // Detect chapters by heading elements — walk the body children
    const body = doc.body;
    const headings: Array<{ el: Element; index: number }> = [];
    for (let i = 0; i < body.children.length; i++) {
      const child = body.children[i];
      if (HEADING_TAGS.has(child.tagName.toLowerCase())) {
        headings.push({ el: child, index: i });
      }
    }

    const content = new Map<string, string>();
    const chapters: ChapterData[] = [];

    if (headings.length === 0) {
      // No heading structure — single chapter
      const id = generateId("ch");
      content.set(id, wrapHtml(body.innerHTML, title));
      chapters.push({ id, title, order: 0 });
    } else {
      // Introductory content before first heading
      if (headings[0].index > 0) {
        const introHtml = collectChildren(body, 0, headings[0].index);
        if (introHtml.trim()) {
          const id = generateId("ch");
          content.set(id, wrapHtml(introHtml, title));
          chapters.push({ id, title, order: chapters.length });
        }
      }

      // Chapters between headings
      for (let i = 0; i < headings.length; i++) {
        const startIdx = headings[i].index;
        const endIdx = i + 1 < headings.length ? headings[i + 1].index : body.children.length;
        const headingTitle = headings[i].el.textContent?.trim() || `Chapter ${i + 1}`;

        const chapterHtml = collectChildren(body, startIdx, endIdx);

        const id = generateId("ch");
        content.set(id, wrapHtml(chapterHtml, headingTitle));
        chapters.push({ id, title: headingTitle, order: chapters.length });
      }
    }

    return {
      id: bookId,
      title,
      author: "Unknown Author",
      chapters,
      content,
    };
  }
}
