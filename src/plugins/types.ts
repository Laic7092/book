import type { Component, App } from "vue";
import type { Pinia } from "pinia";
import type { BookParser, ReaderSettings, SearchResult } from "../core/types";
import type { ReaderHost } from "../core/reader-host";

// ── Search API (defined here so core doesn't need to know about search) ──

export interface SearchApi {
  searchQuery: string;
  searchResults: SearchResult[];
  hasHighlights: boolean;
  currentResultIndex: number;
  doSearch: () => Promise<void>;
  clearHighlights: () => Promise<void>;
  goToNextMatch: () => number | undefined;
  goToPreviousMatch: () => number | undefined;
  navigateToResult: (result: SearchResult) => Promise<void>;
  reset: () => void;
}

/** Map of event names to their payload types. */
export interface PluginEventMap {
  "book:opened": { bookId: string };
  "book:closed": { bookId: string; chapterId?: string };
  "book:deleted": { bookId: string };
  "chapter:changed": { bookId: string; chapterId: string; previousChapterId?: string };
  "page:changed": { bookId: string; chapterId: string; page: number; totalPages: number };
  "settings:changed": { changes: Partial<ReaderSettings> };
  "content:loaded": { bookId: string; chapterId: string };
  "reader:mounted": { bookId: string };
  "reader:unmounted": { bookId: string };
  [key: string]: unknown;
}

/** Brand property required on every Plugin for identity verification. */
export const PLUGIN_BRAND = "__plugin" as const;

export type EventHandler<T> = (payload: T) => unknown;

/** Typed event bus interface. */
export interface IEventBus<T extends Record<string, unknown>> {
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): () => void;
  emit<K extends keyof T>(event: K, payload: T[K]): Promise<void>;
}

/**
 * Footer toolbar action declared by a plugin.
 * ReaderFooter builds its buttons from these dynamically.
 */
export interface FooterAction {
  id: string;
  position: "bar" | "menu";
  label: string;
  icon: string;
  modal?: string;
  order: number;
}

// ── PluginContext types ──

export interface PluginStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T, createdAt?: number): Promise<void>;
  getAll<T>(): Promise<T[]>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ToolbarItem {
  id: string;
  order: number;
  component: Component;
}

export interface UISlots {
  registerModal(name: string, component: Component): void;
  registerOverlay(name: string, component: Component): void;
  registerFooterAction(action: FooterAction): void;
  registerFooterContent(component: Component): void;
  /** Register a widget rendered in the bookshelf (e.g. stats bar). */
  registerBookshelfWidget(component: Component): void;
  /** Register an item in the reader right-edge toolbar (e.g. auto-read, TTS). */
  registerToolbarItem(item: ToolbarItem): void;
}

export interface ContentTransformer {
  id: string;
  /** Lower runs first. Default 100. */
  priority: number;
  transform(html: string, ctx: { bookId: string; chapterId: string }): string | Promise<string>;
}

export interface PluginContext {
  id: string;
  storage: PluginStorageAdapter;
  pinia: Pinia;
  app: App<Element>;
  ui: UISlots;
  events: IEventBus<PluginEventMap>;
  /** Register/unregister runtime capabilities. */
  capabilities: {
    register<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]): void;
    unregister<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]): void;
  };
  /** Register a cleanup callback called when the plugin is disabled/removed. */
  onCleanup(fn: () => void | Promise<void>): void;
  /** ReaderHost getter — returns null before a book is opened. */
  readerHost: () => ReaderHost | null;
  /** Register a content transformer applied to chapter HTML before rendering. */
  registerContentTransformer(transformer: ContentTransformer): void;
  /** Navigate to a route. */
  navigate: (url: string, replace?: boolean) => void;
}

export interface PluginBootstrap {
  app: App<Element>;
  pinia: Pinia;
}

// ── Capability map ──

export interface CapabilityMap {
  parsers: BookParser[];
  searchApis: SearchApi[];
}

// ── Plugin interface ──

export interface Plugin {
  /** Brand for duck-typing. Key is the string "__plugin". */
  [PLUGIN_BRAND]?: true;
  id: string;
  name: string;
  version: string;
  enabled?: boolean;
  core?: boolean;

  /** Plugin IDs this plugin depends on. Dependencies are initialized first. */
  dependsOn?: string[];

  /** Capabilities provided to the core. */
  provide?: Partial<CapabilityMap>;

  /** Called after registration, before mount. Use ctx.ui / ctx.storage / ctx.events. */
  setup?: (context: PluginContext) => void | Promise<void>;

  /** Called when the plugin is disabled. Clean up registrations, state, timers. */
  teardown?: (context: PluginContext) => void | Promise<void>;
}
