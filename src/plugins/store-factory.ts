/**
 * Reactive entity store & singleton store for plugins.
 *
 * Replaces the old pattern of:
 *   Pinia store + global setter + manual storage.get/put/delete
 *
 * With:
 *   const store = createEntityStore<X>(ctx.storage, 'name', (x) => x.id)
 *   store.items       → Readonly<Ref<readonly X[]>>  (reactive, auto-loaded)
 *   store.add(item)   → persist + auto-sync to items
 *   store.remove(id)  → delete + auto-sync
 *   store.update(...) → merge + persist + auto-sync
 */

import { ref, shallowRef, triggerRef, type Ref } from "vue";
import type { PluginStorageAdapter } from "./types";

// ── Key helpers ──

function storageKey(name: string, id: string): string {
  return `${name}:${id}`;
}

// ── EntityStore (collection mode) ──

export interface EntityStore<T extends { id: string }> {
  /** Reactive view of all items in storage. Auto-populated on creation. */
  items: Readonly<Ref<readonly T[]>>;
  /** True after the initial load from storage completes. */
  loaded: Ref<boolean>;

  /** Lookup in local cache (no storage round-trip). */
  getById(id: string): T | undefined;

  /** Fetch from storage (bypasses cache). */
  fetchById(id: string): Promise<T | undefined>;

  /**
   * Add a new item. Persists to storage and appends to the reactive cache.
   * If an item with the same key already exists, it is overwritten.
   */
  add(item: T): Promise<void>;

  /**
   * Merge a partial update into an existing item.
   * Throws if the item is not found (neither in cache nor storage).
   */
  update(id: string, patch: Partial<T>): Promise<T>;

  /** Remove by id. Persists deletion and removes from reactive cache. */
  remove(id: string): Promise<void>;

  /** Re-read all items from storage into the reactive cache. */
  reload(): Promise<void>;
}

export function createEntityStore<T extends { id: string }>(
  storage: PluginStorageAdapter,
  /** Logical entity name, used as storage key prefix (e.g. "bookmark" → keys "bookmark:xxx"). */
  name: string,
  /** Extract the unique key from an item. Defaults to item.id. */
  getKey: (item: T) => string = (item) => item.id,
): EntityStore<T> {
  const _cache: T[] = [];
  const _itemsRef = shallowRef<readonly T[]>(_cache);
  const loaded = ref(false);

  function sync(): void {
    triggerRef(_itemsRef);
  }

  async function loadAll(): Promise<void> {
    const all = await storage.getAll<T>();
    _cache.length = 0;
    _cache.push(...all);
    loaded.value = true;
    sync();
  }

  // Kick off initial load (non-blocking).
  void loadAll();

  return {
    items: _itemsRef as Readonly<Ref<readonly T[]>>,
    loaded,

    getById(id: string): T | undefined {
      return _cache.find((i) => getKey(i) === id);
    },

    async fetchById(id: string): Promise<T | undefined> {
      return storage.get<T>(storageKey(name, id));
    },

    async add(item: T): Promise<void> {
      const key = storageKey(name, getKey(item));
      await storage.put(key, item, Date.now());
      _cache.push(item);
      sync();
    },

    async update(id: string, patch: Partial<T>): Promise<T> {
      const key = storageKey(name, id);
      const existing = _cache.find((i) => getKey(i) === id) ?? (await storage.get<T>(key));
      if (!existing) {
        throw new Error(`${name} "${id}" not found`);
      }
      const merged: T = { ...existing, ...patch };
      // Preserve the original id even if patch tries to change it.
      (merged as Record<string, unknown>).id = existing.id;
      await storage.put(key, merged, Date.now());
      const idx = _cache.findIndex((i) => getKey(i) === id);
      if (idx >= 0) _cache[idx] = merged;
      sync();
      return merged;
    },

    async remove(id: string): Promise<void> {
      const key = storageKey(name, id);
      await storage.delete(key);
      const idx = _cache.findIndex((i) => getKey(i) === id);
      if (idx >= 0) _cache.splice(idx, 1);
      sync();
    },

    async reload(): Promise<void> {
      await loadAll();
    },
  };
}

// ── SingletonStore (single-document mode) ──

export interface SingletonStore<T> {
  /** The current value (null until loaded). Read-only from the consumer side. */
  value: Ref<T | null>;
  /** True after the initial or latest load completes. */
  loaded: Ref<boolean>;

  /** Load value for the given scope key. Omit scope for a global singleton. */
  load(scope?: string): Promise<void>;

  /** Persist and update the reactive value. */
  save(value: T): Promise<void>;

  /** Remove from storage and reset value to null. */
  clear(): Promise<void>;
}

export function createSingletonStore<T>(
  storage: PluginStorageAdapter,
  /** Logical entity name. Used as the storage key (with optional scope suffix). */
  name: string,
): SingletonStore<T> {
  const _value = ref<T | null>(null) as Ref<T | null>;
  const loaded = ref(false);
  let _currentKey: string = name;

  return {
    value: _value,
    loaded,

    async load(scope?: string): Promise<void> {
      _currentKey = scope ? `${name}:${scope}` : name;
      const result = await storage.get<T>(_currentKey);
      _value.value = result ?? null;
      loaded.value = true;
    },

    async save(val: T): Promise<void> {
      _value.value = val;
      await storage.put(_currentKey, val, Date.now());
    },

    async clear(): Promise<void> {
      _value.value = null;
      await storage.delete(_currentKey);
    },
  };
}
