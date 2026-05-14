import { BaseBookParser, generateId } from "../base";
import type { BookParser, ParserResult, ChapterData } from "../types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return map[ext.toLowerCase()] || "image/jpeg";
}

export class CbrParser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/vnd.comicbook+rar",
    "application/x-cbr",
    "application/rar",
    "application/x-rar-compressed",
  ];

  readonly format = "cbr";

  supportsFormat(mimeType: string): boolean {
    return CbrParser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    const arrayBuffer = await this.readAsArrayBuffer(file);
    const { default: unrar } = await import("unrar-js/lib/Unrar.js");
    const files = unrar(arrayBuffer);

    const imageEntries = files
      .filter((f) => {
        const ext = f.filename.split(".").pop()?.toLowerCase();
        return ext ? IMAGE_EXTENSIONS.has(ext) : false;
      })
      .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

    if (imageEntries.length === 0) {
      throw new Error("CBR has an unsupported format: no image files found");
    }

    const bookId = generateId("book");
    const title = file.name.replace(/\.cbr$/i, "") || "Untitled";

    const chapters: ChapterData[] = imageEntries.map((entry, i) => ({
      id: generateId("ch"),
      title:
        entry.filename
          .split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "") || `Page ${i + 1}`,
      href: entry.filename,
      order: i,
    }));

    let coverUrl: string | undefined;
    const resources = new Map<string, ArrayBuffer>();
    const firstEntry = imageEntries[0];
    if (firstEntry) {
      coverUrl = firstEntry.filename;
      const buf = firstEntry.fileData.buffer;
      resources.set(firstEntry.filename, buf.slice(0) as ArrayBuffer);
    }

    return {
      id: bookId,
      title,
      author: "Unknown Author",
      coverUrl,
      chapters,
      content: new Map(),
      resources,
      rawData: arrayBuffer,
    };
  }

  async extractChapterContent(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;

    const ext = chapter.href.split(".").pop() || "jpg";
    const mimeType = getMimeType(ext);

    try {
      const { default: unrar } = await import("unrar-js/lib/Unrar.js");
      const files = unrar(rawData);
      const entry = files.find((f) => f.filename === chapter.href);
      if (!entry?.fileData) return undefined;

      const blob = new Blob([entry.fileData.buffer as ArrayBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      return CbrParser.pageToHtml(url);
    } catch {
      return undefined;
    }
  }

  async extractResource(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined> {
    try {
      const { default: unrar } = await import("unrar-js/lib/Unrar.js");
      const files = unrar(rawData);
      const entry = files.find((f) => f.filename === path);
      return entry?.fileData?.buffer.slice(0) as ArrayBuffer | undefined;
    } catch {
      return undefined;
    }
  }

  private static pageToHtml(imageUrl: string): string {
    return `<html style="height:100%;margin:0"><body style="height:100%;margin:0;display:flex;align-items:center;justify-content:center"><img src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;display:block"></body></html>`;
  }
}
