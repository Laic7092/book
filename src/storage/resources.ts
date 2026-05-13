import type { Resource } from "../core/types";
import { STORES, dbPut, dbDelete, dbGetAllFromIndex } from "./db";

export function getMimeTypeFromExtension(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
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
  return mimeTypes[ext || ""] || "application/octet-stream";
}

function getResourceType(mimeType: string): "image" | "css" | "font" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "text/css") return "css";
  if (mimeType.includes("font")) return "font";
  return "other";
}

function sanitizeCssFonts(data: ArrayBuffer): ArrayBuffer {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const css = decoder.decode(data);
  const cleaned = css.replace(
    /url\(\s*['"]?(?:res|file|app|content):\/\/[^'")\s]*['"]?\s*\)/gi,
    "url(data:,)",
  );
  return encoder.encode(cleaned).buffer;
}

export async function saveResource(
  bookId: string,
  resourceId: string,
  data: ArrayBuffer,
  mimeType: string,
): Promise<void> {
  const resource: Resource = {
    bookId,
    resourceId,
    data,
    mimeType,
    type: getResourceType(mimeType),
  };
  await dbPut(STORES.RESOURCES, resource);
}

export async function getResourceUrls(bookId: string): Promise<Map<string, string>> {
  const resources = await dbGetAllFromIndex<Resource>(STORES.RESOURCES, "bookId", bookId);
  const urlMap = new Map<string, string>();

  for (const resource of resources) {
    let data = resource.data;
    if (resource.mimeType === "text/css") {
      data = sanitizeCssFonts(data);
    }
    const blob = new Blob([data], { type: resource.mimeType });
    urlMap.set(resource.resourceId, URL.createObjectURL(blob));
  }

  return urlMap;
}

export async function deleteResources(bookId: string): Promise<void> {
  const resources = await dbGetAllFromIndex<Resource>(STORES.RESOURCES, "bookId", bookId);
  for (const resource of resources) {
    await dbDelete(STORES.RESOURCES, [bookId, resource.resourceId]);
  }
}

export function revokeResourceUrls(urlMap: Map<string, string>): void {
  for (const [, blobUrl] of urlMap) {
    URL.revokeObjectURL(blobUrl);
  }
}
