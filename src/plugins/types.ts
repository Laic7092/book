import type { Component, App } from "vue";
import type { Pinia } from "pinia";
import type { SearchResult } from "../core/types";
import type { ReaderSettings } from "./settings/types";
import type { ReaderSession } from "../reader-engine/session";
import type { ServerClient } from "../utils/api";

/** Scene a plugin loads during. */
export type Scene = "app" | "book-import" | "bookshelf" | "reader";

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
  "reader:init": { bookId: string };
  "reader:before-init": {
    bookId: string;
    chapterIndex: number;
    mode: "pagination" | "scroll";
    initialPage?: Partial<import("../reader-engine/reader-machine").PageState>;
    initialScroll?: Partial<import("../reader-engine/reader-machine").ScrollState>;
  };
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

/** A menu item in the bookshelf menu-popover, registered by a plugin. */
export interface BookshelfMenuAction {
  id: string;
  order: number;
  label: string;
  /** SVG icon path data (inner `<path>` or `<circle>` elements). */
  icon: string;
  /** If set, clicking opens this modal name. */
  modal?: string;
  /** If set and no modal, called directly on click. */
  onClick?: () => void;
}

/**
 * Header toolbar action declared by a plugin.
 * ReaderHeader builds its buttons from these dynamically.
 */
export interface HeaderAction {
  id: string;
  order: number;
  icon: string;
  label: string;
  onClick: () => void;
}

// ── CSS injection API ──

export interface CssAPI {
  /** Set theme class on document.body + .reader-view-container. Auto-cleaned on teardown. */
  setTheme(theme: string): void;
  /** Inject or update a <style> element in the reader iframe. */
  injectIframeStyle(id: string, css: string): void;
  /** Remove an injected <style> from the reader iframe. */
  removeIframeStyle(id: string): void;
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
  registerModal(name: string, component: Component | (() => Promise<Component>)): void;
  registerOverlay(name: string, component: Component | (() => Promise<Component>)): void;
  registerFooterAction(action: FooterAction): void;
  /** Register a widget rendered in the bookshelf (e.g. stats bar). */
  registerBookshelfWidget(component: Component | (() => Promise<Component>)): void;
  /** Register a menu item in the bookshelf menu-popover. */
  registerBookshelfMenuAction(action: BookshelfMenuAction): void;
  /** Register an item in the reader right-edge toolbar (e.g. auto-read, TTS). */
  registerToolbarItem(item: ToolbarItem): void;
  /** Register an action button in the reader header (e.g. settings gear). */
  registerHeaderAction(action: HeaderAction): void;
  /** Register a full-page component navigable via /page/<name>. */
  registerPage(name: string, component: Component | (() => Promise<Component>)): void;
  /** Open a modal by name (delegates to uiStore). */
  openModal(name: string): void;
  /** Set theme class on document.body + .reader-view-container. Auto-cleaned on teardown. */
  setTheme(theme: string): void;
  /** Inject or update a <style> element in the reader iframe. Auto-cleaned on teardown. */
  injectIframeStyle(id: string, css: string): void;
  /** Remove an injected <style> from the reader iframe. */
  removeIframeStyle(id: string): void;
}

export interface ContentTransformer {
  id: string;
  /** Lower runs first. Default 100. */
  priority: number;
  transform(html: string, ctx: { bookId: string; chapterId: string }): string | Promise<string>;
}

export interface PluginContext {
  storage: PluginStorageAdapter;
  pinia: Pinia;
  ui: UISlots;
  events: IEventBus<PluginEventMap>;
  /** Register/unregister runtime capabilities. */
  capabilities: {
    register<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]): void;
    unregister<K extends keyof CapabilityMap>(key: K, value: CapabilityMap[K][number]): void;
  };
  /** Register a cleanup callback called when the plugin is disabled/removed. */
  onCleanup(fn: () => void | Promise<void>): void;
  /** ReaderSession getter — returns null before a book is opened. */
  readerSession: () => ReaderSession | null;
  /** Register a content transformer applied to chapter HTML before rendering. */
  registerContentTransformer(transformer: ContentTransformer): void;
  /** Navigate to a route. */
  navigate: (url: string, replace?: boolean) => void;
  /** Access Node capabilities (net, fs, …) through the proxy server. */
  server: ServerClient;
}

export interface PluginBootstrap {
  app: App<Element>;
  pinia: Pinia;
}

// ── Capability map ──

export interface CapabilityMap {
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

  /** Called after registration, before mount. Use ctx.ui / ctx.storage / ctx.events. */
  setup?: (context: PluginContext) => void | Promise<void>;

  /** Called when the plugin is disabled. Clean up registrations, state, timers. */
  teardown?: (context: PluginContext) => void | Promise<void>;

  /**
   * Optional capability check. Called before setup() with the same context.
   * Return false to prevent the plugin from activating — it will be hidden
   * from the plugin management list and setup() will be skipped.
   */
  canActivate?: (context: PluginContext) => boolean | Promise<boolean>;

  /**
   * Shown in logs / dev info when canActivate returns false.
   * Example: "Requires backend server" / "Network unavailable"
   */
  activationFailedReason?: string;
}
