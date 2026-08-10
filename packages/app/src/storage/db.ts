const DB_NAME = "reader-db";
const DB_VERSION = 12;

export const STORES = {
  BOOKS: "books",
  CHAPTERS: "chapters",
  ZIPS: "zips",
  PLUGIN_STORE: "plugin_store",
  COVERS: "covers",
  FOLDERS: "folders",
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

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction;

      // Books store
      if (!db.objectStoreNames.contains(STORES.BOOKS)) {
        const booksStore = db.createObjectStore(STORES.BOOKS, { keyPath: "id" });
        booksStore.createIndex("lastReadAt", "lastReadAt");
        booksStore.createIndex("addedAt", "addedAt");
      }

      if (!db.objectStoreNames.contains(STORES.CHAPTERS)) {
        const chaptersStore = db.createObjectStore(STORES.CHAPTERS, {
          keyPath: ["bookId", "chapterId"],
        });
        chaptersStore.createIndex("bookId", "bookId");
        chaptersStore.createIndex("order", "order");
      }

      if (!db.objectStoreNames.contains(STORES.ZIPS)) {
        db.createObjectStore(STORES.ZIPS, { keyPath: "bookId" });
      }

      if (!db.objectStoreNames.contains("plugin_store")) {
        const ps = db.createObjectStore("plugin_store", {
          keyPath: ["pluginId", "key"],
        });
        ps.createIndex("pluginId", "pluginId", { unique: false });
        ps.createIndex("createdAt", "createdAt", { unique: false });
      }

      // v12: dedicated stores for covers and folders. Core data previously
      // lived in plugin_store under the fake plugin ids "_covers"/"_folders",
      // which coupled the storage layer to the plugin schema and forced
      // deleteBook to scan the whole plugin store with fuzzy key matching.
      if (!db.objectStoreNames.contains(STORES.COVERS)) {
        db.createObjectStore(STORES.COVERS, { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
        db.createObjectStore(STORES.FOLDERS, { keyPath: "id" });
      }

      // Migrate legacy data out of plugin_store (runs once on upgrade from <12).
      if (event.oldVersion < 12 && tx && db.objectStoreNames.contains("plugin_store")) {
        migrateLegacyCoversAndFolders(tx);
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

  return new Promise<T>((resolve, reject) => {
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    const request = operation(store);
    request.onsuccess = () => {
      result = request.result;
    };
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

  return new Promise<T>((resolve, reject) => {
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    operation(stores)
      .then((r) => {
        result = r;
      })
      .catch(reject);
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

/**
 * v12 migration: move core data out of plugin_store (where it lived under the
 * fake plugin ids "_covers"/"_folders") into the dedicated covers/folders
 * stores. Runs inside the versionchange transaction, so it is atomic with the
 * upgrade; legacy records are deleted after being copied.
 */
function migrateLegacyCoversAndFolders(tx: IDBTransaction): void {
  const ps = tx.objectStore("plugin_store");
  const covers = tx.objectStore(STORES.COVERS);
  const folders = tx.objectStore(STORES.FOLDERS);

  const req = ps.openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    const rec = cursor.value as {
      pluginId: string;
      key: string;
      value: unknown;
      createdAt?: number;
    };
    if (rec.pluginId === "_covers") {
      covers.put({
        bookId: rec.key,
        blob: rec.value as Blob,
        createdAt: rec.createdAt ?? Date.now(),
      });
      cursor.delete();
    } else if (rec.pluginId === "_folders") {
      for (const folder of rec.value as import("../core/types").Folder[]) {
        folders.put(folder);
      }
      cursor.delete();
    }
    cursor.continue();
  };
}
