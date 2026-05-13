import type { BookParser, ParsedBook, Chapter } from "../../core/types";
import { BaseBookParser, generateId } from "../base";
import { revokeResourceUrls as revokeUrls } from "../../storage/books";

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

  // ── Format-specific lifecycle ──

  // Resources are now extracted lazily from the stored zip — no pre-extraction.

  async saveRawData(bookId: string, rawData: ArrayBuffer, fileSize: number): Promise<void> {
    const { saveZip } = await import("../epub/zips");
    await saveZip(bookId, rawData, fileSize);
  }

  async loadChapterContent(
    bookId: string,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;
    const pageNum = parseInt(chapter.href, 10);
    if (isNaN(pageNum)) return undefined;

    const { getZip } = await import("../epub/zips");
    const zipData = await getZip(bookId);
    if (!zipData) return undefined;

    try {
      const imgBlob = await PdfParser.renderPage(zipData, pageNum);
      const url = URL.createObjectURL(imgBlob);

      return PdfParser.pageToHtml(url, pageNum);
    } catch (err) {
      console.error("[PDF Parser] Failed to render page:", err);
      return undefined;
    }
  }

  async resolveResourceUrl(bookId: string, path: string): Promise<string | null> {
    const pageNum = parseInt(path, 10);
    if (isNaN(pageNum)) return null;

    const { getZip } = await import("../epub/zips");
    const zipData = await getZip(bookId);
    if (!zipData) return null;

    try {
      const imgBlob = await PdfParser.renderPage(zipData, pageNum);
      return URL.createObjectURL(imgBlob);
    } catch {
      return null;
    }
  }

  revokeResourceUrls(urls: Map<string, string>): void {
    revokeUrls(urls);
  }

  // ── Phase 1: Parse ──

  async parse(file: File): Promise<ParsedBook> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const pdfjsLib = await getPdfjsModule();

    // pdfjs may transfer the buffer to its worker, so work on a copy
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
    const numPages = pdf.numPages;

    const meta = await pdf.getMetadata();

    // Prefer XMP metadata (UTF-8), fall back to info dict (may use PDFDocEncoding)
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

    const chapters: Chapter[] = await PdfParser.buildOutlineChapters(pdf, bookId, numPages);

    // Render first page as cover thumbnail
    const coverBlob = await PdfParser.renderPage(arrayBuffer, 1, 0.5);
    const resources = new Map<string, ArrayBuffer>();
    resources.set("1", await coverBlob.arrayBuffer());

    await pdf.destroy();

    const book = {
      id: bookId,
      title,
      author,
      coverUrl: "1",
      format: "pdf" as const,
      fileSize: file.size,
      addedAt: Date.now(),
    };

    return {
      book,
      chapters,
      content: new Map(),
      resources,
      rawData: arrayBuffer,
    };
  }

  /**
   * Build chapters from PDF outline (TOC), falling back to page-based chapters.
   */
  private static async buildOutlineChapters(
    pdf: any,
    bookId: string,
    numPages: number,
  ): Promise<Chapter[]> {
    const outline: Array<{
      title: string;
      dest: string | Array<any> | null;
      items: Array<any>;
    }> = await pdf.getOutline();

    if (!outline || outline.length === 0) {
      // Fallback: one chapter per page
      return Array.from({ length: numPages }, (_, i) => ({
        id: generateId("ch"),
        bookId,
        title: `Page ${i + 1}`,
        href: String(i + 1),
        order: i,
      }));
    }

    // Pre-resolve named destinations
    const namedDests: Map<string, any> = new Map();
    try {
      const dests = await pdf.getDestinations();
      if (dests) {
        for (const [name, dest] of Object.entries(dests)) {
          namedDests.set(name, dest);
        }
      }
    } catch {
      // Named destinations are optional
    }

    const chapters: Chapter[] = [];

    const flatten = async (nodes: Array<any>) => {
      for (const node of nodes) {
        if (!node.title) continue;

        let pageNum = 0;
        try {
          const dest = node.dest;
          if (Array.isArray(dest) && dest.length > 0) {
            // Explicit destination: [pageRef, ...]
            pageNum = await pdf.getPageIndex(dest[0]);
          } else if (typeof dest === "string" && namedDests.has(dest)) {
            const resolvedDest = namedDests.get(dest);
            if (Array.isArray(resolvedDest) && resolvedDest.length > 0) {
              pageNum = await pdf.getPageIndex(resolvedDest[0]);
            }
          }
        } catch {
          // Unresolvable dest, use last known page
          pageNum = chapters.length > 0 ? Number(chapters[chapters.length - 1].href) - 1 : 0;
        }

        chapters.push({
          id: generateId("ch"),
          bookId,
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

    // If outline had no resolvable items, fall back to page-based
    if (chapters.length === 0) {
      return Array.from({ length: numPages }, (_, i) => ({
        id: generateId("ch"),
        bookId,
        title: `Page ${i + 1}`,
        href: String(i + 1),
        order: i,
      }));
    }

    return chapters;
  }

  /**
   * Render a PDF page to a JPEG Blob.
   */
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
