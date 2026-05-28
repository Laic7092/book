import { shallowRef, defineAsyncComponent } from "vue";
import type { Component } from "vue";
import { openDB, STORES } from "../storage/db";
import type {
  PluginContext,
  PluginStorageAdapter,
  UISlots,
  PluginBootstrap,
  FooterAction,
  HeaderAction,
  BookshelfMenuAction,
  PluginEventMap,
  IEventBus,
  EventHandler,
  ContentTransformer,
  ToolbarItem,
  HookRegistry,
  HookMap,
  FilterHandler,
} from "./types";
import { themeRegistry } from "../core/theme-registry";
import { currentSession } from "../stores/reader-session";
import { navigate as routerNavigate } from "../utils/router";
import { createServerClient } from "../utils/api";
import { useUIStore } from "../stores/ui";

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
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error ?? new Error("transaction aborted"));
      if (mode === "readonly") {
        req.onsuccess = () => resolve(req.result);
      } else {
        // For readwrite, wait for tx.oncomplete to ensure data is committed to disk
        req.onsuccess = () => {
          /* data queued, wait for commit */
        };
        tx.oncomplete = () => resolve(req.result);
      }
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

export const registeredModals = shallowRef<Record<string, Component>>({});
export const registeredOverlays = shallowRef<Record<string, Component>>({});
export const registeredFooterActions = shallowRef<FooterAction[]>([]);
export const registeredBookshelfWidgets = shallowRef<Component[]>([]);
export const registeredBookshelfMenuActions = shallowRef<BookshelfMenuAction[]>([]);
export const registeredContentTransformers = shallowRef<ContentTransformer[]>([]);
export const registeredToolbarItems = shallowRef<ToolbarItem[]>([]);
export const registeredHeaderActions = shallowRef<HeaderAction[]>([]);
export const registeredPages = shallowRef<Record<string, Component>>({});

function resolveComponent(v: Component | (() => Promise<Component>)): Component {
  return typeof v === "function" ? defineAsyncComponent(v as never) : v;
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

// ── Filter hooks ──

interface RegisteredFilter {
  priority: number;
  handler: FilterHandler<any>;
}

class HookBus implements HookRegistry {
  private filters = new Map<keyof HookMap, RegisteredFilter[]>();

  filter<K extends keyof HookMap>(
    name: K,
    handler: FilterHandler<HookMap[K]>,
    priority = 100,
  ): () => void {
    if (!this.filters.has(name)) this.filters.set(name, []);
    const entry: RegisteredFilter = { priority, handler };
    const list = this.filters.get(name)!;
    list.push(entry);
    // Keep sorted: lower priority first
    list.sort((a, b) => a.priority - b.priority);
    return () => {
      const idx = list.indexOf(entry);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  async run<K extends keyof HookMap>(name: K, payload: HookMap[K]): Promise<HookMap[K]> {
    const list = this.filters.get(name);
    if (!list || list.length === 0) return payload;
    let result = payload;
    for (const { handler } of list) {
      try {
        result = await handler(result);
      } catch (err) {
        console.error(`[HookBus] Filter error for "${String(name)}":`, err);
      }
    }
    return result;
  }
}

/** Global hook bus. Plugins register filters; reader runs them before init. */
export const pluginHooks = new HookBus();

function resetThemeVars() {
  const root = document.documentElement;
  const props = [
    "--reader-bg",
    "--reader-text",
    "--text-secondary",
    "--header-bg",
    "--border",
    "--border-subtle",
    "--hover-bg",
    "--accent",
    "--accent-text",
    "--accent-soft",
    "--accent-muted",
    "--accent-hover",
    "--modal-bg",
    "--modal-text",
    "--progress-track",
    "--bg-elevated",
    "--bg-secondary",
    "--bg-tertiary",
  ] as const;
  for (const p of props) root.style.removeProperty(p);
  root.removeAttribute("data-theme");
}

export interface TrackedContext extends PluginContext {
  runCleanup(): Promise<void>;
  addTeardown(fn: () => void | Promise<void>): void;
}

function applyCssTheme(theme: string) {
  const def = themeRegistry.get(theme);
  const c = def.chrome;
  const root = document.documentElement;
  root.style.setProperty("--reader-bg", c.bg);
  root.style.setProperty("--reader-text", c.text);
  root.style.setProperty("--text-secondary", c.textSecondary);
  root.style.setProperty("--header-bg", c.headerBg);
  root.style.setProperty("--border", c.border);
  root.style.setProperty("--border-subtle", c.borderSubtle);
  root.style.setProperty("--hover-bg", c.hoverBg);
  root.style.setProperty("--accent", c.accent);
  root.style.setProperty("--accent-text", c.accentText);
  root.style.setProperty("--accent-soft", c.accentSoft);
  root.style.setProperty("--modal-bg", c.modalBg);
  root.style.setProperty("--modal-text", c.modalText);
  root.style.setProperty("--progress-track", c.progressTrack);
  root.style.setProperty("--bg-elevated", c.bgElevated);
  root.style.setProperty("--bg-secondary", c.bgSecondary);
  root.style.setProperty("--bg-tertiary", c.bgTertiary);
  root.style.setProperty("--accent-muted", c.accentMuted);
  root.style.setProperty("--accent-hover", c.accentHover);
  root.setAttribute("data-theme", theme);
}

function injectStyle(id: string, css: string) {
  const doc = currentSession.value?.getDocument();
  if (!doc) return;
  const el =
    doc.getElementById(`plugin-${id}`) ??
    Object.assign(doc.createElement("style"), { id: `plugin-${id}` });
  if (!el.parentNode) doc.head.appendChild(el);
  el.textContent = css;
}

function removeStyle(id: string) {
  const doc = currentSession.value?.getDocument();
  doc?.getElementById(`plugin-${id}`)?.remove();
}

export function createTrackedContext(id: string, _bootstrap: PluginBootstrap): TrackedContext {
  const cleanupFns: (() => void | Promise<void>)[] = [];
  const eventUnsubs: (() => void)[] = [];
  const hookUnsubs: (() => void)[] = [];
  const trackedTransformers: ContentTransformer[] = [];
  const injectedStyleIds: string[] = [];
  let themeWasSet = false;

  const ui: UISlots = {
    registerModal(name, component) {
      const resolved = resolveComponent(component);
      registeredModals.value = { ...registeredModals.value, [name]: resolved };
      cleanupFns.push(() => {
        const copy = { ...registeredModals.value };
        delete copy[name];
        registeredModals.value = copy;
      });
    },
    registerOverlay(name, component) {
      const resolved = resolveComponent(component);
      registeredOverlays.value = { ...registeredOverlays.value, [name]: resolved };
      cleanupFns.push(() => {
        const copy = { ...registeredOverlays.value };
        delete copy[name];
        registeredOverlays.value = copy;
      });
    },
    registerFooterAction(action) {
      const existing = registeredFooterActions.value.filter((a) => a.id !== action.id);
      const actions = [...existing, action].sort((a, b) => a.order - b.order);
      registeredFooterActions.value = actions;
      cleanupFns.push(() => {
        registeredFooterActions.value = registeredFooterActions.value.filter(
          (a) => a.id !== action.id,
        );
      });
    },
    registerBookshelfWidget(component) {
      const resolved = resolveComponent(component);
      registeredBookshelfWidgets.value = [...registeredBookshelfWidgets.value, resolved];
      cleanupFns.push(() => {
        registeredBookshelfWidgets.value = registeredBookshelfWidgets.value.filter(
          (c) => c !== resolved,
        );
      });
    },
    registerBookshelfMenuAction(action) {
      const existing = registeredBookshelfMenuActions.value.filter((a) => a.id !== action.id);
      const actions = [...existing, action].sort((a, b) => a.order - b.order);
      registeredBookshelfMenuActions.value = actions;
      cleanupFns.push(() => {
        registeredBookshelfMenuActions.value = registeredBookshelfMenuActions.value.filter(
          (a) => a.id !== action.id,
        );
      });
    },
    registerToolbarItem(item) {
      const existing = registeredToolbarItems.value.filter((i) => i.id !== item.id);
      const items = [...existing, item].sort((a, b) => a.order - b.order);
      registeredToolbarItems.value = items;
      cleanupFns.push(() => {
        registeredToolbarItems.value = registeredToolbarItems.value.filter((i) => i.id !== item.id);
      });
    },
    registerHeaderAction(action) {
      const existing = registeredHeaderActions.value.filter((a) => a.id !== action.id);
      const actions = [...existing, action].sort((a, b) => a.order - b.order);
      registeredHeaderActions.value = actions;
      cleanupFns.push(() => {
        registeredHeaderActions.value = registeredHeaderActions.value.filter(
          (a) => a.id !== action.id,
        );
      });
    },
    registerPage(name, component) {
      const resolved = resolveComponent(component);
      registeredPages.value = { ...registeredPages.value, [name]: resolved };
      cleanupFns.push(() => {
        const copy = { ...registeredPages.value };
        delete copy[name];
        registeredPages.value = copy;
      });
    },
    openModal: (name) => useUIStore().openModal(name),
    setTheme(theme) {
      if (!themeWasSet) {
        themeWasSet = true;
        cleanupFns.push(resetThemeVars);
      }
      applyCssTheme(theme);
    },
    clearTheme() {
      resetThemeVars();
    },
    injectIframeStyle(id, css) {
      injectStyle(id, css);
      if (!injectedStyleIds.includes(id)) {
        injectedStyleIds.push(id);
        cleanupFns.push(() => removeStyle(id));
      }
    },
    removeIframeStyle(id) {
      removeStyle(id);
      const idx = injectedStyleIds.indexOf(id);
      if (idx >= 0) injectedStyleIds.splice(idx, 1);
    },
  };

  return {
    storage: createPluginStorageAdapter(id),
    ui,
    events: {
      on<K extends keyof PluginEventMap>(event: K, handler: EventHandler<PluginEventMap[K]>) {
        const unsub = pluginEvents.on(event, handler);
        eventUnsubs.push(unsub);
        return unsub;
      },
      emit: pluginEvents.emit.bind(pluginEvents),
    },
    hooks: {
      filter<K extends keyof HookMap>(
        name: K,
        handler: FilterHandler<HookMap[K]>,
        priority?: number,
      ) {
        const unsub = pluginHooks.filter(name, handler, priority);
        hookUnsubs.push(unsub);
        return unsub;
      },
      run: pluginHooks.run.bind(pluginHooks),
    },
    readerSession: () => currentSession.value,
    addTeardown(fn: () => void | Promise<void>) {
      cleanupFns.push(fn);
    },
    registerContentTransformer(t: ContentTransformer) {
      registerContentTransformer(t);
      trackedTransformers.push(t);
    },
    navigate: routerNavigate,
    server: createServerClient(),
    themes: themeRegistry,
    async runCleanup() {
      for (const fn of eventUnsubs) {
        try {
          fn();
        } catch (e) {
          console.error("[TrackedContext] Event unsub error:", e);
        }
      }
      eventUnsubs.length = 0;
      for (const fn of hookUnsubs) {
        try {
          fn();
        } catch (e) {
          console.error("[TrackedContext] Hook unsub error:", e);
        }
      }
      hookUnsubs.length = 0;
      for (const fn of cleanupFns) {
        try {
          await fn();
        } catch (e) {
          console.error("[TrackedContext] Cleanup error:", e);
        }
      }
      cleanupFns.length = 0;
      for (const t of trackedTransformers) {
        unregisterContentTransformer(t);
      }
      trackedTransformers.length = 0;
    },
  };
}
