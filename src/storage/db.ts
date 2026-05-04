// IndexedDB wrapper with Promise-based API

const DB_NAME = "reader-db";
const DB_VERSION = 9;

export const STORES = {
  BOOKS: "books",
  CHAPTERS: "chapters",
  BOOKMARKS: "bookmarks",
  SETTINGS: "settings",
  RESOURCES: "resources",
  STATS: "stats",
  ANNOTATIONS: "annotations",
  ZIPS: "zips",
  /** v9: isolated per-plugin key-value storage. Compound key: [pluginId, key]. */
  PLUGIN_STORE: "plugin_store",
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
        chaptersStore.createIndex("order", "order");
      }

      // v2: title field added (optional, no index needed)
      // v3: order field added for proper chapter sorting

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

      // Resources store (v4): stores EPUB resources (images, CSS, fonts)
      if (!db.objectStoreNames.contains(STORES.RESOURCES)) {
        const resourcesStore = db.createObjectStore(STORES.RESOURCES, {
          keyPath: ["bookId", "resourceId"],
        });
        resourcesStore.createIndex("bookId", "bookId");
        resourcesStore.createIndex("type", "type");
      }

      // Stats store (v5): stores reading statistics
      if (!db.objectStoreNames.contains(STORES.STATS)) {
        const statsStore = db.createObjectStore(STORES.STATS, { keyPath: "bookId" });
        statsStore.createIndex("lastActiveDate", "lastActiveDate");
        statsStore.createIndex("lastReadAt", "lastReadAt");
      }

      // v6: CFI field added to bookmarks (migration handled lazily in getBookmarks)

      // v7: Annotations store
      if (!db.objectStoreNames.contains(STORES.ANNOTATIONS)) {
        const annotationsStore = db.createObjectStore(STORES.ANNOTATIONS, { keyPath: "id" });
        annotationsStore.createIndex("bookId", "bookId", { unique: false });
        annotationsStore.createIndex("chapterId", "chapterId", { unique: false });
        annotationsStore.createIndex("book_chapter", ["bookId", "chapterId"], { unique: false });
        annotationsStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // v8: Raw zip storage for lazy EPUB extraction
      if (!db.objectStoreNames.contains(STORES.ZIPS)) {
        db.createObjectStore(STORES.ZIPS, { keyPath: "bookId" });
      }

      // v9: Isolated plugin key-value store
      if (!db.objectStoreNames.contains("plugin_store")) {
        const ps = db.createObjectStore("plugin_store", {
          keyPath: ["pluginId", "key"],
        });
        ps.createIndex("pluginId", "pluginId", { unique: false });
        ps.createIndex("createdAt", "createdAt", { unique: false });
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
    tx.onerror = () => reject(tx.error);
    operation(stores).then(resolve).catch(reject);
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

// ── v9 plugin_store data migration ──

const MIGRATION_V9_KEY = "__migration_v9_done__";

async function isMigrationV9Done(): Promise<boolean> {
  const record = await dbGet<{ value: boolean }>(STORES.SETTINGS, MIGRATION_V9_KEY);
  return record?.value === true;
}

async function markMigrationV9Done(): Promise<void> {
  await dbPut(STORES.SETTINGS, { key: MIGRATION_V9_KEY, value: true });
}

/** Migrate data from legacy shared stores into plugin_store. */
export async function migrateToPluginStore(): Promise<void> {
  if (await isMigrationV9Done()) return;

  const db = await openDB();

  // ── bookmarks → plugin_store (pluginId: "bookmarks") ──
  if (db.objectStoreNames.contains(STORES.BOOKMARKS)) {
    const bookmarks = await dbGetAll<Record<string, unknown>>(STORES.BOOKMARKS);
    for (const bm of bookmarks) {
      await dbPut(STORES.PLUGIN_STORE, {
        pluginId: "bookmarks",
        key: bm.id as string,
        value: bm,
        createdAt: (bm.createdAt as number) || Date.now(),
      });
    }
  }

  // ── annotations → plugin_store (pluginId: "annotations") ──
  if (db.objectStoreNames.contains(STORES.ANNOTATIONS)) {
    const annotations = await dbGetAll<Record<string, unknown>>(STORES.ANNOTATIONS);
    for (const ann of annotations) {
      await dbPut(STORES.PLUGIN_STORE, {
        pluginId: "annotations",
        key: ann.id as string,
        value: ann,
        createdAt: (ann.createdAt as number) || Date.now(),
      });
    }
  }

  // ── stats → plugin_store (pluginId: "stats") ──
  if (db.objectStoreNames.contains(STORES.STATS)) {
    const stats = await dbGetAll<Record<string, unknown>>(STORES.STATS);
    for (const s of stats) {
      // The sessions record has bookId = "__reading_sessions__"
      const bid = s.bookId as string;
      const key = bid === "__reading_sessions__" ? "sessions" : `stats:${bid}`;
      await dbPut(STORES.PLUGIN_STORE, {
        pluginId: "stats",
        key,
        value: s,
        createdAt: Date.now(),
      });
    }
  }

  await markMigrationV9Done();
}
