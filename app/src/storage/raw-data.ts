import { STORES, dbPut, dbGet, dbDelete } from "./db";

interface StoredZip {
  bookId: string;
  data: ArrayBuffer;
  fileSize: number;
}

const OPFS_DIR = "book-zips";
let opfsDir: FileSystemDirectoryHandle | null | undefined;

// In-memory LRU cache for zip data
const ZIP_CACHE_MAX = 6;
const zipCache = new Map<string, ArrayBuffer>();

function cacheGet(bookId: string): ArrayBuffer | undefined {
  const entry = zipCache.get(bookId);
  if (entry) {
    // Bump to end (most recently used)
    zipCache.delete(bookId);
    zipCache.set(bookId, entry);
    return entry;
  }
  return undefined;
}

function cacheSet(bookId: string, data: ArrayBuffer): void {
  if (zipCache.has(bookId)) {
    zipCache.delete(bookId);
  } else if (zipCache.size >= ZIP_CACHE_MAX) {
    // Evict least recently used (first entry)
    const oldest = zipCache.keys().next();
    if (!oldest.done) zipCache.delete(oldest.value);
  }
  zipCache.set(bookId, data);
}

function cacheDelete(bookId: string): void {
  zipCache.delete(bookId);
}

async function getOpfsDir(): Promise<FileSystemDirectoryHandle | null | undefined> {
  if (opfsDir !== undefined) return opfsDir;
  try {
    const root = await navigator.storage.getDirectory();
    opfsDir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch {
    opfsDir = null;
  }
  return opfsDir;
}

/**
 * Save a File/Blob directly to OPFS without reading into memory first.
 * Falls back to read + IDB when OPFS is unavailable.
 */
export async function saveZipFromFile(bookId: string, file: File, fileSize: number): Promise<void> {
  cacheDelete(bookId);
  const dir = await getOpfsDir();
  if (dir) {
    try {
      const handle = await dir.getFileHandle(bookId, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return;
    } catch (err) {
      console.warn(`[raw-data] OPFS write failed for "${bookId}", falling back to IndexedDB:`, err);
    }
  }
  const data = await file.arrayBuffer();
  cacheSet(bookId, data);
  await dbPut(STORES.ZIPS, { bookId, data, fileSize } satisfies StoredZip);
}

export async function saveZip(bookId: string, data: ArrayBuffer, fileSize: number): Promise<void> {
  cacheSet(bookId, data);
  const dir = await getOpfsDir();
  if (dir) {
    try {
      const handle = await dir.getFileHandle(bookId, { create: true });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    } catch (err) {
      console.warn(`[raw-data] OPFS write failed for "${bookId}", falling back to IndexedDB:`, err);
    }
  }
  await dbPut(STORES.ZIPS, { bookId, data, fileSize } satisfies StoredZip);
}

export async function getZip(bookId: string): Promise<ArrayBuffer | undefined> {
  const cached = cacheGet(bookId);
  if (cached) return cached;

  const dir = await getOpfsDir();
  let data: ArrayBuffer | undefined;
  if (dir) {
    try {
      const handle = await dir.getFileHandle(bookId);
      const file = await handle.getFile();
      data = await file.arrayBuffer();
    } catch {
      // File may not exist in OPFS, fall through to IndexedDB
    }
  }
  if (!data) {
    const entry = await dbGet<StoredZip>(STORES.ZIPS, bookId);
    data = entry?.data;
  }
  if (data) cacheSet(bookId, data);
  return data;
}

export async function deleteZip(bookId: string): Promise<void> {
  cacheDelete(bookId);
  const dir = await getOpfsDir();
  if (dir) {
    try {
      await dir.removeEntry(bookId);
    } catch {
      // File may not exist in OPFS, still try IDB
    }
  }
  await dbDelete(STORES.ZIPS, bookId);
}

export function clearZipCache(): void {
  zipCache.clear();
}
