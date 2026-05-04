import { shallowRef } from "vue";
import type { Component } from "vue";
import { openDB, STORES } from "../storage/db";
import type {
  PluginContext,
  PluginStorageAdapter,
  UISlots,
  PluginBootstrap,
  FooterAction,
} from "./types";

// ── PluginStorageAdapter implementation ──

export function createPluginStorageAdapter(pluginId: string): PluginStorageAdapter {
  const SN = STORES.PLUGIN_STORE;

  return {
    get<T>(key: string) {
      return new Promise<T | undefined>((resolve, reject) => {
        void openDB().then((db) => {
          const tx = db.transaction(SN, "readonly");
          const req = tx.objectStore(SN).get([pluginId, key]);
          req.onsuccess = () => resolve(req.result?.value as T | undefined);
          req.onerror = () => reject(req.error);
        });
      });
    },

    put<T>(key: string, value: T, createdAt?: number) {
      return new Promise<void>((resolve, reject) => {
        void openDB().then((db) => {
          const tx = db.transaction(SN, "readwrite");
          const req = tx.objectStore(SN).put({
            pluginId,
            key,
            value,
            createdAt: createdAt ?? Date.now(),
          });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    },

    getAll<T>() {
      return new Promise<T[]>((resolve, reject) => {
        void openDB().then((db) => {
          const tx = db.transaction(SN, "readonly");
          const req = tx.objectStore(SN).index("pluginId").getAll(IDBKeyRange.only(pluginId));
          req.onsuccess = () => resolve(req.result.map((r: { value: T }) => r.value));
          req.onerror = () => reject(req.error);
        });
      });
    },

    delete(key: string) {
      return new Promise<void>((resolve, reject) => {
        void openDB().then((db) => {
          const tx = db.transaction(SN, "readwrite");
          const req = tx.objectStore(SN).delete([pluginId, key]);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    },

    clear() {
      return new Promise<void>((resolve, reject) => {
        void openDB().then((db) => {
          const tx = db.transaction(SN, "readwrite");
          const idx = tx.objectStore(SN).index("pluginId");
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
      });
    },
  };
}

// ── UISlots implementation ──

export const registeredModals = shallowRef<Record<string, Component>>({});
export const registeredOverlays = shallowRef<Record<string, Component>>({});
export const registeredFooterActions = shallowRef<FooterAction[]>([]);
export const registeredBookshelfWidgets = shallowRef<Component[]>([]);

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

// ── Event emitter ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (...args: any[]) => any;

export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  async emit(event: string, ...args: unknown[]): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) await h(...args);
  }
}

/** Global event bus. Core emits; plugins listen. */
export const pluginEvents = new EventBus();

// ── PluginContext factory ──

export function createPluginContext(id: string, bootstrap: PluginBootstrap): PluginContext {
  return {
    id,
    storage: createPluginStorageAdapter(id),
    pinia: bootstrap.pinia,
    app: bootstrap.app,
    ui: createUISlots(),
    events: pluginEvents,
  };
}
