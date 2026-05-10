/**
 * Generic cover-image cache.
 *
 * Decouples the bookshelf from parser plugins: covers are resolved during
 * import (when the parser is available) and cached as raw Blobs.
 * The bookshelf can then display covers without depending on any parser.
 */

import { STORES, dbPut, dbGet, dbDelete } from "./db";

const PLUGIN_ID = "_covers";

interface CoverEntry {
  pluginId: string;
  key: string;
  value: Blob;
  createdAt: number;
}

function key(bookId: string): string {
  return bookId;
}

/** Save a cover Blob for the given book. */
export async function saveCoverBlob(bookId: string, blob: Blob): Promise<void> {
  await dbPut(STORES.PLUGIN_STORE, {
    pluginId: PLUGIN_ID,
    key: key(bookId),
    value: blob,
    createdAt: Date.now(),
  } as CoverEntry);
}

/** Retrieve the cover Blob for a book, or null if not cached. */
export async function getCoverBlob(bookId: string): Promise<Blob | null> {
  const entry = await dbGet<CoverEntry>(STORES.PLUGIN_STORE, [PLUGIN_ID, key(bookId)]);
  return entry?.value ?? null;
}

/** Delete the cached cover Blob for a book. */
export async function deleteCoverBlob(bookId: string): Promise<void> {
  await dbDelete(STORES.PLUGIN_STORE, [PLUGIN_ID, key(bookId)]);
}
