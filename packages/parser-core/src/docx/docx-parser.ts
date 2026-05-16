import { generateId, readAsArrayBuffer } from "../base";
import type { BookParser, ParserResult, ChapterData } from "../types";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DC_NS = "http://purl.org/dc/elements/1.1/";

async function getZipModule() {
  const mod = await import("@zip.js/zip.js");
  return {
    ZipReader: mod.ZipReader,
    Uint8ArrayReader: mod.Uint8ArrayReader,
    BlobWriter: mod.BlobWriter,
  };
}

interface DocxRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

interface DocxParagraph {
  runs: DocxRun[];
  style: string | null;
  headingLevel: number | null;
}

export class DocxParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];

  readonly format = "docx";

  supportsFormat(mimeType: string): boolean {
    return DocxParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await readAsArrayBuffer(file);
    const { ZipReader, Uint8ArrayReader, BlobWriter } = await getZipModule();
    const zipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(arrayBuffer)));

    try {
      const entries = await zipReader.getEntries();
      const files = new Map<string, Blob>();
      for (const entry of entries) {
        if (!entry.directory) {
          files.set(entry.filename, await (entry as any).getData(new BlobWriter()));
        }
      }

      // Metadata
      let title = file.name.replace(/\.docx$/i, "") || "Untitled";
      let author = "Unknown Author";

      const coreXml = files.get("docProps/core.xml");
      if (coreXml) {
        const doc = new DOMParser().parseFromString(await coreXml.text(), "text/xml");
        const titleEl = doc.getElementsByTagNameNS(DC_NS, "title")[0];
        if (titleEl?.textContent?.trim()) title = titleEl.textContent.trim();
        const dcCreator = doc.getElementsByTagNameNS(DC_NS, "creator")[0];
        if (dcCreator?.textContent?.trim()) author = dcCreator.textContent.trim();
      }

      const bookId = generateId("book");

      // Parse styles for heading info
      const headingStyles = new Set<string>();
      const stylesXml = files.get("word/styles.xml");
      if (stylesXml) {
        const doc = new DOMParser().parseFromString(await stylesXml.text(), "text/xml");
        const styleEls = doc.getElementsByTagNameNS(WORD_NS, "style");
        for (const style of styleEls) {
          const styleId = style.getAttributeNS(WORD_NS, "val");
          const type = style.getAttributeNS(WORD_NS, "type");
          if (type === "paragraph" && styleId && /^heading\s*\d$/i.test(styleId)) {
            headingStyles.add(styleId.toLowerCase());
          }
        }
      }

      // Parse document body
      const docXml = files.get("word/document.xml");
      if (!docXml) throw new Error("DOCX: word/document.xml not found");

      const xmlStr = await docXml.text();
      const doc = new DOMParser().parseFromString(xmlStr, "text/xml");

      const paragraphs = DocxParser.parseParagraphs(doc);
      const chapters = DocxParser.buildChapters(paragraphs, headingStyles, title);

      return {
        id: bookId,
        title,
        author,
        chapters: chapters.chapters,
        content: chapters.content,
      };
    } finally {
      await zipReader.close();
    }
  }

  // ── XML parsing ──

  private static parseParagraphs(doc: Document): DocxParagraph[] {
    const body = doc.getElementsByTagNameNS(WORD_NS, "body")[0];
    if (!body) return [];

    const paragraphs: DocxParagraph[] = [];
    const pEls = body.getElementsByTagNameNS(WORD_NS, "p");

    for (const p of pEls) {
      const pPr = p.getElementsByTagNameNS(WORD_NS, "pPr")[0];
      let style: string | null = null;
      let headingLevel: number | null = null;

      if (pPr) {
        const pStyle = pPr.getElementsByTagNameNS(WORD_NS, "pStyle")[0];
        if (pStyle) {
          style = pStyle.getAttributeNS(WORD_NS, "val") || null;
          if (style) {
            const match = style.match(/heading\s*(\d)/i);
            if (match) headingLevel = parseInt(match[1], 10);
          }
        }
        // Also check for outline level
        const outlineLvl = pPr.getElementsByTagNameNS(WORD_NS, "outlineLvl")[0];
        if (!headingLevel && outlineLvl) {
          const val = outlineLvl.getAttributeNS(WORD_NS, "val");
          if (val) headingLevel = parseInt(val, 10) + 1;
        }
      }

      const runs: DocxRun[] = [];
      const rEls = p.getElementsByTagNameNS(WORD_NS, "r");

      for (const r of rEls) {
        const rPr = r.getElementsByTagNameNS(WORD_NS, "rPr")[0];
        const bold = !!rPr?.getElementsByTagNameNS(WORD_NS, "b")[0];
        const italic = !!rPr?.getElementsByTagNameNS(WORD_NS, "i")[0];

        const texts: string[] = [];
        const tEls = r.getElementsByTagNameNS(WORD_NS, "t");
        for (const t of tEls) {
          texts.push(t.textContent ?? "");
        }

        if (texts.length > 0) {
          runs.push({ text: texts.join(""), bold, italic });
        }
      }

      // Check if it's a table or image wrapper — skip if no runs
      const drawings = p.getElementsByTagNameNS(WORD_NS, "drawing").length;
      if (runs.length === 0 && drawings === 0) continue;

      paragraphs.push({ runs, style, headingLevel });
    }

    return paragraphs;
  }

  private static buildChapters(
    paragraphs: DocxParagraph[],
    headingStyles: Set<string>,
    fallbackTitle: string,
  ): { chapters: ChapterData[]; content: Map<string, string> } {
    const content = new Map<string, string>();
    const chapters: ChapterData[] = [];

    if (paragraphs.length === 0) return { chapters, content };

    // Find heading boundaries
    const headingIndices: number[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p.headingLevel !== null || (p.style && headingStyles.has(p.style.toLowerCase()))) {
        headingIndices.push(i);
      }
    }

    if (headingIndices.length === 0) {
      // Single chapter
      const id = generateId("ch");
      content.set(id, DocxParser.paragraphsToHtml(paragraphs));
      chapters.push({ id, title: fallbackTitle, order: 0 });
      return { chapters, content };
    }

    // Introductory content before first heading
    if (headingIndices[0] > 0) {
      const intro = paragraphs.slice(0, headingIndices[0]);
      const text = DocxParser.paragraphText(intro);
      if (text.trim()) {
        const id = generateId("ch");
        content.set(id, DocxParser.paragraphsToHtml(intro));
        chapters.push({ id, title: fallbackTitle, order: chapters.length });
      }
    }

    // Chapters between headings
    for (let i = 0; i < headingIndices.length; i++) {
      const startIdx = headingIndices[i];
      const endIdx = i + 1 < headingIndices.length ? headingIndices[i + 1] : paragraphs.length;

      const headingPara = paragraphs[startIdx];
      const headingTitle = DocxParser.runText(headingPara.runs) || `Chapter ${i + 1}`;

      const bodyParas = paragraphs.slice(startIdx + 1, endIdx);
      const id = generateId("ch");
      content.set(id, DocxParser.paragraphsToHtml(bodyParas));
      chapters.push({ id, title: headingTitle, order: chapters.length });
    }

    return { chapters, content };
  }

  // ── HTML conversion ──

  private static paragraphsToHtml(paragraphs: DocxParagraph[]): string {
    const parts = ['<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'];
    for (const p of paragraphs) {
      if (p.headingLevel !== null) {
        const tag = `h${Math.min(p.headingLevel, 6)}`;
        parts.push(`<${tag}>${DocxParser.runText(p.runs)}</${tag}>`);
      } else {
        parts.push(`<p>${DocxParser.runsToHtml(p.runs)}</p>`);
      }
    }
    parts.push("</body></html>");
    return parts.join("\n");
  }

  private static runText(runs: DocxRun[]): string {
    return runs.map((r) => r.text).join("");
  }

  private static runsToHtml(runs: DocxRun[]): string {
    return runs
      .map((r) => {
        let text = DocxParser.escapeHtml(r.text);
        if (r.bold) text = `<strong>${text}</strong>`;
        if (r.italic) text = `<em>${text}</em>`;
        return text;
      })
      .join("");
  }

  private static paragraphText(paragraphs: DocxParagraph[]): string {
    return paragraphs.map((p) => DocxParser.runText(p.runs)).join(" ");
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
