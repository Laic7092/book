// Resources storage module for EPUB assets (images, CSS, fonts)

import type { Resource } from "../core/types";
import { STORES, dbPut, dbDelete, dbGetAllFromIndex } from "./db";

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
    const blob = new Blob([resource.data], { type: resource.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    // We need to map the original path to the blob URL
    // The resourceId stores the original relative path
    urlMap.set(resource.resourceId, blobUrl);
  }

  return urlMap;
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
