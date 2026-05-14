import { BaseBookParser, generateId } from "../base";
import type { BookParser, ParserResult, ChapterData } from "../types";

async function getPdfjsModule() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href;
  return pdfjsLib;
}

export class PdfParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = ["application/pdf", "application/x-pdf"];

  readonly format = "pdf";

  supportsFormat(mimeType: string): boolean {
    return PdfParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async extractChapterContent(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;
    const pageNum = parseInt(chapter.href, 10);
    if (isNaN(pageNum)) return undefined;

    try {
      const imgBlob = await PdfParser.renderPage(rawData, pageNum);
      const url = URL.createObjectURL(imgBlob);
      return PdfParser.pageToHtml(url, pageNum);
    } catch {
      return undefined;
    }
  }

  async extractResource(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined> {
    const pageNum = parseInt(path, 10);
    if (isNaN(pageNum)) return undefined;

    try {
      const imgBlob = await PdfParser.renderPage(rawData, pageNum);
      return await imgBlob.arrayBuffer();
    } catch {
      return undefined;
    }
  }

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const pdfjsLib = await getPdfjsModule();

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
    const numPages = pdf.numPages;

    const meta = await pdf.getMetadata();
    const xmp = meta.metadata;
    const metaInfo = meta.info as Record<string, unknown> | undefined;
    const title =
      (typeof xmp?.get === "function" ? xmp.get("dc:title") : "") ||
      (typeof metaInfo?.Title === "string" ? metaInfo.Title : "") ||
      file.name.replace(/\.pdf$/i, "") ||
      "Untitled";
    const author =
      (typeof xmp?.get === "function" ? xmp.get("dc:creator") : "") ||
      (typeof metaInfo?.Author === "string" ? metaInfo.Author : "") ||
      "Unknown Author";
    const bookId = generateId("book");

    const chapters: ChapterData[] = await PdfParser.buildOutlineChapters(pdf, numPages);

    const coverBlob = await PdfParser.renderPage(arrayBuffer, 1, 0.5);
    const resources = new Map<string, ArrayBuffer>();
    resources.set("1", await coverBlob.arrayBuffer());

    await pdf.destroy();

    return {
      id: bookId,
      title,
      author,
      coverUrl: "1",
      chapters,
      content: new Map(),
      resources,
      rawData: arrayBuffer,
    };
  }

  private static async buildOutlineChapters(pdf: any, numPages: number): Promise<ChapterData[]> {
    const outline: Array<{
      title: string;
      dest: string | Array<any> | null;
      items: Array<any>;
    }> = await pdf.getOutline();

    if (!outline || outline.length === 0) {
      return Array.from({ length: numPages }, (_, i) => ({
        id: generateId("ch"),
        title: `Page ${i + 1}`,
        href: String(i + 1),
        order: i,
      }));
    }

    const namedDests: Map<string, any> = new Map();
    try {
      const dests = await pdf.getDestinations();
      if (dests) {
        for (const [name, dest] of Object.entries(dests)) {
          namedDests.set(name, dest);
        }
      }
    } catch {}

    const chapters: ChapterData[] = [];

    const flatten = async (nodes: Array<any>) => {
      for (const node of nodes) {
        if (!node.title) continue;

        let pageNum = 0;
        try {
          const dest = node.dest;
          if (Array.isArray(dest) && dest.length > 0) {
            pageNum = await pdf.getPageIndex(dest[0]);
          } else if (typeof dest === "string" && namedDests.has(dest)) {
            const resolvedDest = namedDests.get(dest);
            if (Array.isArray(resolvedDest) && resolvedDest.length > 0) {
              pageNum = await pdf.getPageIndex(resolvedDest[0]);
            }
          }
        } catch {
          pageNum = chapters.length > 0 ? Number(chapters[chapters.length - 1].href) - 1 : 0;
        }

        chapters.push({
          id: generateId("ch"),
          title: node.title,
          href: String(pageNum + 1),
          order: chapters.length,
        });

        if (node.items && node.items.length > 0) {
          await flatten(node.items);
        }
      }
    };

    await flatten(outline);

    if (chapters.length === 0) {
      return Array.from({ length: numPages }, (_, i) => ({
        id: generateId("ch"),
        title: `Page ${i + 1}`,
        href: String(i + 1),
        order: i,
      }));
    }

    return chapters;
  }

  private static async renderPage(
    pdfData: ArrayBuffer,
    pageNum: number,
    scale = 1.5,
  ): Promise<Blob> {
    const pdfjsLib = await getPdfjsModule();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData.slice(0)) }).promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    page.cleanup();
    await pdf.destroy();

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        0.85,
      );
    });
  }

  private static pageToHtml(imageUrl: string, pageNum: number): string {
    return `<html style="height:100%;margin:0"><body style="height:100%;margin:0;display:flex;align-items:center;justify-content:center"><img src="${imageUrl}" data-page="${pageNum}" style="max-width:100%;max-height:100%;object-fit:contain;display:block"></body></html>`;
  }
}
