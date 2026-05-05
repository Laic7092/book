import { shallowRef } from "vue";
import type { Component } from "vue";
import { openDB, STORES } from "../storage/db";
import type {
  PluginContext,
  PluginStorageAdapter,
  UISlots,
  PluginBootstrap,
  FooterAction,
  PluginEventMap,
  CapabilityMap,
  IEventBus,
  EventHandler,
  ContentTransformer,
} from "./types";
import { getReaderHost } from "../core/reader-host";

// ── PluginStorageAdapter implementation ──

export function createPluginStorageAdapter(pluginId: string): PluginStorageAdapter {
  const SN = STORES.PLUGIN_STORE;

  async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await openDB();
    const tx = db.transaction(SN, mode);
    const store = tx.objectStore(SN);
    return new Promise((resolve, reject) => {
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async get<T>(key: string) {
      const result = await withStore("readonly", (store) => store.get([pluginId, key]));
      return (result as { value: T } | undefined)?.value;
    },

    async put<T>(key: string, value: T, createdAt?: number) {
      await withStore("readwrite", (store) =>
        store.put({ pluginId, key, value, createdAt: createdAt ?? Date.now() }),
      );
    },

    async getAll<T>() {
      const db = await openDB();
      const tx = db.transaction(SN, "readonly");
      const index = tx.objectStore(SN).index("pluginId");
      return new Promise<T[]>((resolve, reject) => {
        const req = index.getAll(IDBKeyRange.only(pluginId));
        req.onsuccess = () => resolve(req.result.map((r: { value: T }) => r.value));
        req.onerror = () => reject(req.error);
      });
    },

    async delete(key: string) {
      await withStore("readwrite", (store) => store.delete([pluginId, key]));
    },

    async clear() {
      const db = await openDB();
      const tx = db.transaction(SN, "readwrite");
      const idx = tx.objectStore(SN).index("pluginId");
      return new Promise<void>((resolve, reject) => {
        const req = idx.openCursor(IDBKeyRange.only(pluginId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else resolve();
        };
        req.onerror = () => reject(req.error);
      });
    },
  };
}

// ── UISlots implementation ──

export const registeredModals = shallowRef<Record<string, Component>>({});
export const registeredOverlays = shallowRef<Record<string, Component>>({});
export const registeredFooterActions = shallowRef<FooterAction[]>([]);
export const registeredBookshelfWidgets = shallowRef<Component[]>([]);
export const registeredContentTransformers = shallowRef<ContentTransformer[]>([]);

export function createUISlots(): UISlots {
  return {
    registerModal(name: string, component: Component) {
      registeredModals.value = {
        ...registeredModals.value,
        [name]: component,
      };
    },
    registerOverlay(name: string, component: Component) {
      registeredOverlays.value = {
        ...registeredOverlays.value,
        [name]: component,
      };
    },
    registerFooterAction(action: FooterAction) {
      const actions = [...registeredFooterActions.value, action];
      actions.sort((a, b) => a.order - b.order);
      registeredFooterActions.value = actions;
    },
    registerBookshelfWidget(component: Component) {
      registeredBookshelfWidgets.value = [...registeredBookshelfWidgets.value, component];
    },
  };
}

export function registerContentTransformer(t: ContentTransformer): void {
  const transformers = [...registeredContentTransformers.value, t];
  transformers.sort((a, b) => a.priority - b.priority);
  registeredContentTransformers.value = transformers;
}

export function unregisterContentTransformer(t: ContentTransformer): void {
  registeredContentTransformers.value = registeredContentTransformers.value.filter(
    (x) => x.id !== t.id,
  );
}

export async function applyContentTransformers(
  html: string,
  ctx: { bookId: string; chapterId: string },
): Promise<string> {
  let result = html;
  for (const t of registeredContentTransformers.value) {
    try {
      result = await t.transform(result, ctx);
    } catch (err) {
      console.error(`[ContentTransformer] "${t.id}" failed:`, err);
    }
  }
  return result;
}

// ── Event emitter ──

export class EventBus<T extends Record<string, unknown>> implements IEventBus<T> {
  private listeners = new Map<keyof T, Set<EventHandler<T[keyof T]>>>();

  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as EventHandler<T[keyof T]>);
    return () => {
      this.listeners.get(event)?.delete(handler as EventHandler<T[keyof T]>);
    };
  }

  async emit<K extends keyof T>(event: K, payload: T[K]): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    const results = await Promise.allSettled(
      [...handlers].map((h) => {
        try {
          return Promise.resolve(h(payload));
        } catch (err) {
          return Promise.reject(err);
        }
      }),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[EventBus] Handler error for "${String(event)}":`, r.reason);
      }
    }
  }
}

/** Global event bus. Core emits; plugins listen. */
export const pluginEvents = new EventBus<PluginEventMap>();

// ── PluginContext factory ──

export function createPluginContext(id: string, bootstrap: PluginBootstrap): PluginContext {
  return {
    id,
    storage: createPluginStorageAdapter(id),
    pinia: bootstrap.pinia,
    app: bootstrap.app,
    ui: createUISlots(),
    events: pluginEvents,
    capabilities: createCapabilitySlots(),
    onCleanup(_fn: () => void | Promise<void>) {},
    readerHost: () => getReaderHost(),
    registerContentTransformer,
  };
}

/** Tracked context: wraps UI slots and events for automatic cleanup on teardown. */
export interface TrackedContext extends PluginContext {
  runCleanup(): Promise<void>;
}

export function createTrackedContext(id: string, bootstrap: PluginBootstrap): TrackedContext {
  const rawUi = createUISlots();
  const cleanupFns: (() => void | Promise<void>)[] = [];
  const eventUnsubs: (() => void)[] = [];
  const registeredCapKeys: { key: keyof CapabilityMap; value: unknown }[] = [];

  const ui: UISlots = {
    registerModal(name, component) {
      rawUi.registerModal(name, component);
      cleanupFns.push(() => {
        const copy = { ...registeredModals.value };
        delete copy[name];
        registeredModals.value = copy;
      });
    },
    registerOverlay(name, component) {
      rawUi.registerOverlay(name, component);
      cleanupFns.push(() => {
        const copy = { ...registeredOverlays.value };
        delete copy[name];
        registeredOverlays.value = copy;
      });
    },
    registerFooterAction(action) {
      rawUi.registerFooterAction(action);
      cleanupFns.push(() => {
        registeredFooterActions.value = registeredFooterActions.value.filter(
          (a) => a.id !== action.id,
        );
      });
    },
    registerBookshelfWidget(component) {
      rawUi.registerBookshelfWidget(component);
      cleanupFns.push(() => {
        registeredBookshelfWidgets.value = registeredBookshelfWidgets.value.filter(
          (c) => c !== component,
        );
      });
    },
  };

  const events: IEventBus<PluginEventMap> = {
    on<K extends keyof PluginEventMap>(event: K, handler: EventHandler<PluginEventMap[K]>) {
      const unsub = pluginEvents.on(event, handler);
      eventUnsubs.push(unsub);
      return unsub;
    },
    emit: pluginEvents.emit.bind(pluginEvents),
  };

  const rawCaps = createCapabilitySlots();

  const capabilities = {
    register<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]) {
      rawCaps.register(key, value);
      registeredCapKeys.push({ key, value });
    },
    unregister<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]) {
      rawCaps.unregister(key, value);
      const idx = registeredCapKeys.findIndex((r) => r.key === key && r.value === value);
      if (idx >= 0) registeredCapKeys.splice(idx, 1);
    },
  };

  const trackedTransformers: ContentTransformer[] = [];

  return {
    id,
    storage: createPluginStorageAdapter(id),
    pinia: bootstrap.pinia,
    app: bootstrap.app,
    ui,
    events,
    capabilities,
    onCleanup(fn: () => void | Promise<void>) {
      cleanupFns.push(fn);
    },
    readerHost: () => getReaderHost(),
    registerContentTransformer(t: ContentTransformer) {
      registerContentTransformer(t);
      trackedTransformers.push(t);
    },
    async runCleanup() {
      const unsubResults = await Promise.allSettled(
        eventUnsubs.map((fn) => {
          try {
            fn();
            return Promise.resolve();
          } catch (e) {
            return Promise.reject(e);
          }
        }),
      );
      for (const r of unsubResults) {
        if (r.status === "rejected") console.error("[TrackedContext] Event unsub error:", r.reason);
      }
      eventUnsubs.length = 0;
      const results = await Promise.allSettled(
        cleanupFns.map((fn) => {
          try {
            return Promise.resolve(fn());
          } catch (e) {
            return Promise.reject(e);
          }
        }),
      );
      for (const r of results) {
        if (r.status === "rejected") console.error("[TrackedContext] Cleanup error:", r.reason);
      }
      cleanupFns.length = 0;
      for (const { key, value } of registeredCapKeys) {
        rawCaps.unregister(key as keyof CapabilityMap, value as never);
      }
      registeredCapKeys.length = 0;
      for (const t of trackedTransformers) {
        unregisterContentTransformer(t);
      }
      trackedTransformers.length = 0;
    },
  };
}

// ── Dynamic capability storage ──

type CapabilityArrayMap = { [K in keyof CapabilityMap]: CapabilityMap[K][number][] };

export const dynamicCapabilities: CapabilityArrayMap = {
  parsers: [],
  searchApis: [],
};

export function createCapabilitySlots() {
  return {
    register<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]) {
      (dynamicCapabilities[key] as CapabilityMap[K][number][]).push(value);
    },
    unregister<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]) {
      const arr = dynamicCapabilities[key] as CapabilityMap[K][number][];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };
}
