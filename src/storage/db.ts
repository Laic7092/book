// IndexedDB wrapper with Promise-based API

const DB_NAME = "reader-db";
const DB_VERSION = 2;

export const STORES = {
  BOOKS: "books",
  CHAPTERS: "chapters",
  PROGRESS: "progress",
  BOOKMARKS: "bookmarks",
  SETTINGS: "settings",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

interface DbInstance {
  db: IDBDatabase | null;
  openPromise: Promise<IDBDatabase> | null;
}

const dbInstance: DbInstance = {
  db: null,
  openPromise: null,
};

export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance.db) {
    return dbInstance.db;
  }

  if (dbInstance.openPromise) {
    return dbInstance.openPromise;
  }

  dbInstance.openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInstance.openPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance.db = request.result;
      dbInstance.openPromise = null;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Books store
      if (!db.objectStoreNames.contains(STORES.BOOKS)) {
        const booksStore = db.createObjectStore(STORES.BOOKS, { keyPath: "id" });
        booksStore.createIndex("lastReadAt", "lastReadAt");
        booksStore.createIndex("addedAt", "addedAt");
      }

      // Chapters store (content storage)
      if (!db.objectStoreNames.contains(STORES.CHAPTERS)) {
        const chaptersStore = db.createObjectStore(STORES.CHAPTERS, {
          keyPath: ["bookId", "chapterId"],
        });
        chaptersStore.createIndex("bookId", "bookId");
      }

      // Add title field to chapters store (v2)
      // Title is optional, no index needed

      // Progress store
      if (!db.objectStoreNames.contains(STORES.PROGRESS)) {
        const progressStore = db.createObjectStore(STORES.PROGRESS, { keyPath: "bookId" });
        progressStore.createIndex("updatedAt", "updatedAt");
      }

      // Bookmarks store
      if (!db.objectStoreNames.contains(STORES.BOOKMARKS)) {
        const bookmarksStore = db.createObjectStore(STORES.BOOKMARKS, { keyPath: "id" });
        bookmarksStore.createIndex("bookId", "bookId");
        bookmarksStore.createIndex("createdAt", "createdAt");
      }

      // Settings store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
      }
    };
  });

  return dbInstance.openPromise;
}

export async function dbOperation<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);

  return new Promise((resolve, reject) => {
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbTransaction<T>(
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  operation: (stores: Map<StoreName, IDBObjectStore>) => Promise<T>,
): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(storeNames, mode);

  const stores = new Map<StoreName, IDBObjectStore>();
  for (const storeName of storeNames) {
    stores.set(storeName, tx.objectStore(storeName));
  }

  return new Promise((resolve, reject) => {
    const promise = operation(stores);
    promise.then(resolve).catch(reject);

    tx.oncomplete = () => {
      if (!promise.then) {
        resolve(undefined as T);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Generic CRUD operations
export async function dbGet<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return dbOperation(storeName, "readonly", (store) => store.get(key));
}

export async function dbGetAll<T>(storeName: StoreName): Promise<T[]> {
  return dbOperation(storeName, "readonly", (store) => store.getAll());
}

export async function dbPut<T>(
  storeName: StoreName,
  value: T,
  key?: IDBValidKey,
): Promise<IDBValidKey> {
  return dbOperation(storeName, "readwrite", (store) => store.put(value, key));
}

export async function dbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
  return dbOperation(storeName, "readwrite", (store) => store.delete(key));
}

export async function dbGetByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);

  return new Promise((resolve, reject) => {
    const request = index.get(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGetAllFromIndex<T>(
  storeName: StoreName,
  indexName: string,
  value?: IDBValidKey,
): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);

  return new Promise((resolve, reject) => {
    const request = value ? index.getAll(value) : index.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function initSettings(settings: { key: string; value: unknown }): Promise<void> {
  await dbPut(STORES.SETTINGS, settings);
}
