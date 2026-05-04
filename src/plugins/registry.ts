import { ref, type Component } from "vue";
import type { BookParser } from "../core/types";
import type { Plugin, FooterAction } from "./types";
import { STORES, dbPut, dbGet } from "../storage/db";

const plugins: Plugin[] = [];

/** Incremented every time plugin state changes; used by UI computeds to track reactivity */
export const pluginStateVersion = ref(0);

function bump() {
  pluginStateVersion.value++;
}

const PLUGIN_STATES_KEY = "__plugin_states__";

/** Filter plugins to only enabled ones */
function enabled(p: Plugin): boolean {
  return p.enabled !== false;
}

export function registerPlugin(p: Plugin): void {
  plugins.push(p);
  bump();
}

export function getAllPlugins(): readonly Plugin[] {
  return plugins;
}

/** Toggle a plugin on/off at runtime and persist */
export function setPluginEnabled(id: string, on: boolean): void {
  const p = plugins.find((p) => p.id === id);
  if (p) p.enabled = on;
  bump();
  savePluginStates();
}

/** Snapshot current enabled states to IndexedDB */
function savePluginStates(): void {
  const states: Record<string, boolean> = {};
  for (const p of plugins) {
    states[p.id] = enabled(p);
  }
  dbPut(STORES.SETTINGS, { key: PLUGIN_STATES_KEY, value: states }).catch(() => {});
}

/** Restore persisted enabled states. Call after all registerPlugin() calls. */
export async function loadPluginStates(): Promise<void> {
  const stored = await dbGet<{ value: Record<string, boolean> }>(
    STORES.SETTINGS,
    PLUGIN_STATES_KEY,
  );
  if (!stored?.value) return;
  for (const [id, on] of Object.entries(stored.value)) {
    const p = plugins.find((p) => p.id === id);
    if (p) p.enabled = on;
  }
  bump();
}

/** Check whether a plugin is enabled */
export function isPluginEnabled(id: string): boolean {
  return plugins.find((p) => p.id === id)?.enabled !== false;
}

/** Collect enabled BookParser instances from registered plugins */
export function getParsers(): BookParser[] {
  return plugins.filter(enabled).flatMap((p) => p.parsers ?? []);
}

/** Collect modal components from enabled plugins */
export function getModalComponents(): Record<string, Component> {
  const result: Record<string, Component> = {};
  for (const p of plugins) {
    if (!enabled(p) || !p.modalComponents) continue;
    for (const [key, comp] of Object.entries(p.modalComponents)) {
      result[key] = comp;
    }
  }
  return result;
}

/** Resolve a lazy chapter extractor from first enabled plugin that provides one */
export function getLazyExtractChapter():
  | ((zipData: ArrayBuffer, href: string) => Promise<string>)
  | null {
  for (const p of plugins) {
    if (enabled(p) && p.lazyExtractChapter) return p.lazyExtractChapter;
  }
  return null;
}

/** Resolve a lazy resource extractor from first enabled plugin that provides one */
export function getLazyExtractResource():
  | ((zipData: ArrayBuffer, resourceId: string) => Promise<ArrayBuffer>)
  | null {
  for (const p of plugins) {
    if (enabled(p) && p.lazyExtractResource) return p.lazyExtractResource;
  }
  return null;
}

/** Resolve resource resolver from first enabled plugin that provides one */
export function getResourceResolver() {
  for (const p of plugins) {
    if (enabled(p) && p.resourceResolver) return p.resourceResolver;
  }
  return null;
}

/** Resolve resource saver from first enabled plugin that provides one */
export function getResourceSaver() {
  for (const p of plugins) {
    if (enabled(p) && p.resourceSaver) return p.resourceSaver;
  }
  return null;
}

/** Resolve zip store from first enabled plugin that provides one */
export function getZipStore() {
  for (const p of plugins) {
    if (enabled(p) && p.zipStore) return p.zipStore;
  }
  return null;
}

/** Resolve session tracker from first enabled plugin that provides one */
export function getSessionTracker() {
  for (const p of plugins) {
    if (enabled(p) && p.sessionTracker) return p.sessionTracker;
  }
  return null;
}

/** Resolve stats provider from first enabled plugin that provides one */
export function getStatsProvider() {
  for (const p of plugins) {
    if (enabled(p) && p.statsProvider) return p.statsProvider;
  }
  return null;
}

/** Collect overlay components from enabled plugins */
export function getOverlayComponents(): Record<string, Component> {
  const result: Record<string, Component> = {};
  for (const p of plugins) {
    if (!enabled(p) || !p.overlayComponents) continue;
    for (const [key, comp] of Object.entries(p.overlayComponents)) {
      result[key] = comp;
    }
  }
  return result;
}

/** Collect footer actions from enabled plugins, sorted by order */
export function getFooterActions(): FooterAction[] {
  const actions: FooterAction[] = [];
  for (const p of plugins) {
    if (!enabled(p) || !p.footerActions) continue;
    actions.push(...p.footerActions);
  }
  return actions.sort((a, b) => a.order - b.order);
}

export async function dispatchOnInit(): Promise<void> {
  for (const p of plugins) {
    if (enabled(p) && p.onInit) await p.onInit();
  }
}

export async function dispatchOnBookOpen(bookId: string): Promise<void> {
  for (const p of plugins) {
    if (enabled(p) && p.onBookOpen) await p.onBookOpen(bookId);
  }
}

export async function dispatchOnBookClose(): Promise<void> {
  for (const p of plugins) {
    if (enabled(p) && p.onBookClose) p.onBookClose();
  }
}

export function dispatchOnModalOpen(modalName: string): void {
  // Find which plugin owns this modal
  for (const p of plugins) {
    if (!enabled(p) || !p.modalComponents) continue;
    if (modalName in p.modalComponents) {
      p.onModalOpen?.(modalName);
      return;
    }
  }
}

export function dispatchOnModalClose(modalName: string): void {
  for (const p of plugins) {
    if (!enabled(p) || !p.modalComponents) continue;
    if (modalName in p.modalComponents) {
      p.onModalClose?.(modalName);
      return;
    }
  }
}
