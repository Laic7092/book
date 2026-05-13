import { getMimeTypeFromExtension } from "../../storage/books";
import { getZip } from "./zips";

/**
 * Extract a resource from the stored zip on demand.
 * No longer caches to a separate RESOURCES store — pure lazy extraction.
 */
export async function getResourceUrl(
  bookId: string,
  resourceId: string,
  lazyExtract?: (rawData: ArrayBuffer, resourceId: string) => Promise<ArrayBuffer>,
): Promise<string | null> {
  if (!lazyExtract) return null;

  const zipData = await getZip(bookId);
  if (!zipData) return null;

  try {
    const data = await lazyExtract(zipData, resourceId);
    const mimeType = getMimeTypeFromExtension(resourceId);
    return URL.createObjectURL(new Blob([data], { type: mimeType }));
  } catch {
    return null;
  }
}
