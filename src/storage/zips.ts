// Raw zip ArrayBuffer storage for lazy EPUB extraction

import { STORES, dbPut, dbGet, dbDelete } from "./db";

interface StoredZip {
  bookId: string;
  data: ArrayBuffer;
  fileSize: number;
}

export async function saveZip(bookId: string, data: ArrayBuffer, fileSize: number): Promise<void> {
  await dbPut(STORES.ZIPS, { bookId, data, fileSize } satisfies StoredZip);
}

export async function getZip(bookId: string): Promise<ArrayBuffer | undefined> {
  const entry = await dbGet<StoredZip>(STORES.ZIPS, bookId);
  return entry?.data;
}

export async function deleteZip(bookId: string): Promise<void> {
  await dbDelete(STORES.ZIPS, bookId);
}
