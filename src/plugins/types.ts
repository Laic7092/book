import type { Component, App } from "vue";
import type { Pinia } from "pinia";
import type { BookParser } from "../core/types";
import type { EventBus } from "./context";

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

export interface UISlots {
  registerModal(name: string, component: Component): void;
  registerOverlay(name: string, component: Component): void;
  registerFooterAction(action: FooterAction): void;
  /** Register a widget rendered in the bookshelf (e.g. stats bar). */
  registerBookshelfWidget(component: Component): void;
}

export interface PluginContext {
  id: string;
  storage: PluginStorageAdapter;
  pinia: Pinia;
  app: App<Element>;
  ui: UISlots;
  events: EventBus;
}

export interface PluginBootstrap {
  app: App<Element>;
  pinia: Pinia;
}

// ── Capability map ──

/**
 * Registry of capabilities plugins can provide.
 * Only "parsers" remains — everything else moved to parser methods or events.
 */
export interface CapabilityMap {
  parsers: BookParser[];
}

// ── Plugin interface ──

export interface Plugin {
  id: string;
  name: string;
  version: string;
  enabled?: boolean;
  core?: boolean;

  /** Capabilities provided to the core. */
  provide?: Partial<CapabilityMap>;

  /** Called after registration, before mount. Use ctx.ui / ctx.storage / ctx.events. */
  setup?: (context: PluginContext) => void | Promise<void>;
}
