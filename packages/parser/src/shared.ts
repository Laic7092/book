/**
 * Shared helpers for the format parsers. Each of these previously existed as
 * 2-4 near-identical copies inside individual parsers (with subtle behavioral
 * drift — escape sets, mime fallbacks). Single implementations here keep the
 * behavior explicit and testable.
 */

/**
 * Resolve a path inside a zip/archive relative to a base directory, with
 * `..`/`.` normalization. A leading `/` is treated as relative to the archive
 * root. The returned path never starts with `/`.
 */
export function resolvePath(base: string, relative: string): string {
  if (relative.startsWith("/")) return relative.slice(1);
  const parts = (base + relative).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      stack.pop();
    } else if (part && part !== ".") {
      stack.push(part);
    }
  }
  return stack.join("/");
}

/**
 * Escape text for safe inclusion in HTML. `&` is replaced first so the other
 * entities are never double-escaped. Covers `& < > " '` — the strictest set
 * found across the parsers, and the fix for txt which did not escape at all.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Full standalone HTML document wrapping a body. */
export function wrapHtml(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${bodyHtml}</body></html>`;
}

/** Minimal structural contract of a parent element for child collection. */
export interface ChildrenCollectorLike {
  children: ArrayLike<{ outerHTML: string }>;
}

/** Concatenate the outerHTML of children in [start, end). */
export function collectChildren(parent: ChildrenCollectorLike, start: number, end: number): string {
  let html = "";
  for (let i = start; i < end && i < parent.children.length; i++) {
    html += parent.children[i].outerHTML;
  }
  return html;
}

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  css: "text/css",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

/**
 * Mime type for a path/extension. Callers pass their own fallback: cbz/cbr
 * want `"image/jpeg"` (every entry is an image), the resource pipelines use
 * `"application/octet-stream"` (the default).
 */
export function getMimeType(pathOrExt: string, fallback = "application/octet-stream"): string {
  const ext = pathOrExt.split(".").pop()?.toLowerCase();
  return MIME_TYPES[ext || ""] || fallback;
}

/**
 * HTML page rendering a single fixed-layout image. `pageNum`, when given,
 * is recorded as a `data-page` attribute (PDF uses it for page tracking).
 */
export function pageToHtml(imageUrl: string, pageNum?: number): string {
  const dataPage = pageNum !== undefined ? ` data-page="${pageNum}"` : "";
  return `<html style="height:100%;margin:0"><body style="height:100%;margin:0;display:flex;align-items:center;justify-content:center"><img src="${imageUrl}"${dataPage} style="max-width:100%;max-height:100%;object-fit:contain;display:block"></body></html>`;
}

export interface ZipModule {
  ZipReader: typeof import("@zip.js/zip.js").ZipReader;
  Uint8ArrayReader: typeof import("@zip.js/zip.js").Uint8ArrayReader;
  BlobReader: typeof import("@zip.js/zip.js").BlobReader;
  BlobWriter: typeof import("@zip.js/zip.js").BlobWriter;
  TextWriter: typeof import("@zip.js/zip.js").TextWriter;
}

let zipModule: Promise<ZipModule> | null = null;

/** Lazily loaded zip.js subset, cached across parsers. */
export function getZipModule(): Promise<ZipModule> {
  if (!zipModule) {
    zipModule = import("@zip.js/zip.js").then((mod) => ({
      ZipReader: mod.ZipReader,
      Uint8ArrayReader: mod.Uint8ArrayReader,
      BlobReader: mod.BlobReader,
      BlobWriter: mod.BlobWriter,
      TextWriter: mod.TextWriter,
    }));
  }
  return zipModule;
}

/** Parse an HTML string (no parsererror check — HTML parsing never errors). */
export function parseHTML(content: string): Document {
  return new DOMParser().parseFromString(content, "text/html");
}
