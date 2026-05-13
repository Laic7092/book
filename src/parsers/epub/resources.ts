import type { Resource } from "../../core/types";
import { STORES, dbGet } from "../../storage/db";
import { saveResource, getMimeTypeFromExtension } from "../../storage/resources";
import { getZip } from "./zips";

export async function getResourceUrl(
  bookId: string,
  resourceId: string,
  lazyExtract?: (rawData: ArrayBuffer, resourceId: string) => Promise<ArrayBuffer>,
): Promise<string | null> {
  const resource = await dbGet<Resource>(STORES.RESOURCES, [bookId, resourceId]);
  if (resource) return URL.createObjectURL(new Blob([resource.data], { type: resource.mimeType }));
  if (!lazyExtract) return null;

  const zipData = await getZip(bookId);
  if (!zipData) return null;

  try {
    const data = await lazyExtract(zipData, resourceId);
    const mimeType = getMimeTypeFromExtension(resourceId);
    await saveResource(bookId, resourceId, data, mimeType);
    return URL.createObjectURL(new Blob([data], { type: mimeType }));
  } catch {
    return null;
  }
}
