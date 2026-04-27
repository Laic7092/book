// Resources storage module for EPUB assets (images, CSS, fonts)

import type { Resource } from "../core/types";
import { STORES, dbPut, dbDelete, dbGet, dbGetAllFromIndex } from "./db";

/**
 * Save a resource to the database
 */
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

/**
 * Get resource type from MIME type
 */
function getResourceType(mimeType: string): "image" | "css" | "font" | "other" {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "text/css") {
    return "css";
  }
  if (mimeType.includes("font")) {
    return "font";
  }
  return "other";
}

/**
 * Get all resources for a book as Blob URL mappings
 */
export async function getResourceUrls(bookId: string): Promise<Map<string, string>> {
  const resources = await dbGetAllFromIndex<Resource>(STORES.RESOURCES, "bookId", bookId);
  const urlMap = new Map<string, string>();

  for (const resource of resources) {
    let data = resource.data;

    // Strip @font-face rules that reference unsupported protocols (res://, file://, etc.)
    if (resource.mimeType === "text/css") {
      data = sanitizeCssFonts(data);
    }

    const blob = new Blob([data], { type: resource.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    urlMap.set(resource.resourceId, blobUrl);
  }

  return urlMap;
}

function sanitizeCssFonts(data: ArrayBuffer): ArrayBuffer {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const css = decoder.decode(data);
  // Replace any url() referencing unsupported protocols with empty url
  const cleaned = css.replace(
    /url\(\s*['"]?(?:res|file|app|content):\/\/[^'")\s]*['"]?\s*\)/gi,
    "url(data:,)",
  );
  return encoder.encode(cleaned).buffer;
}

/**
 * Get a single resource as a Blob URL
 */
export async function getResourceUrl(bookId: string, resourceId: string): Promise<string | null> {
  const resource = await dbGet<Resource>(STORES.RESOURCES, [bookId, resourceId]);
  if (!resource) return null;
  const blob = new Blob([resource.data], { type: resource.mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Delete all resources for a book
 */
export async function deleteResources(bookId: string): Promise<void> {
  const resources = await dbGetAllFromIndex<Resource>(STORES.RESOURCES, "bookId", bookId);

  for (const resource of resources) {
    await dbDelete(STORES.RESOURCES, [bookId, resource.resourceId]);
  }
}

/**
 * Clean up Blob URLs when closing a book
 */
export function revokeResourceUrls(urlMap: Map<string, string>): void {
  for (const [, blobUrl] of urlMap) {
    URL.revokeObjectURL(blobUrl);
  }
}
