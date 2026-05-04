import { ref, type Component } from "vue";
import type { Plugin, FooterAction, PluginBootstrap } from "./types";
import { STORES, dbPut, dbGet } from "../storage/db";
import {
  createPluginContext,
  registeredModals,
  registeredOverlays,
  registeredFooterActions,
  registeredBookshelfWidgets,
} from "./context";
import type { BookParser } from "../core/types";

const plugins: Plugin[] = [];

/** Incremented every time plugin state changes; used by UI computeds to track reactivity */
export const pluginStateVersion = ref(0);

function bump() {
  pluginStateVersion.value++;
}

const PLUGIN_STATES_KEY = "__plugin_states__";

function enabled(p: Plugin): boolean {
  return p.enabled !== false;
}

export function registerPlugin(p: Plugin): void {
  plugins.push(p);
}

export async function initializePlugins(bootstrap: PluginBootstrap): Promise<void> {
  for (const p of plugins) {
    if (enabled(p) && p.setup) {
      const ctx = createPluginContext(p.id, bootstrap);
      await p.setup(ctx);
    }
  }
  bump();
}

export function getAllPlugins(): readonly Plugin[] {
  return plugins;
}

export function setPluginEnabled(id: string, on: boolean): void {
  const p = plugins.find((p) => p.id === id);
  if (p) p.enabled = on;
  bump();
  savePluginStates();
}

function savePluginStates(): void {
  const states: Record<string, boolean> = {};
  for (const p of plugins) {
    states[p.id] = enabled(p);
  }
  dbPut(STORES.SETTINGS, {
    key: PLUGIN_STATES_KEY,
    value: states,
  }).catch(() => {});
}

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

export function isPluginEnabled(id: string): boolean {
  return plugins.find((p) => p.id === id)?.enabled !== false;
}

// ── UI collectors ──

export function getModalComponents(): Record<string, Component> {
  return { ...registeredModals.value };
}

export function getOverlayComponents(): Record<string, Component> {
  return { ...registeredOverlays.value };
}

export function getFooterActions(): FooterAction[] {
  return [...registeredFooterActions.value];
}

export function getBookshelfWidgets(): Component[] {
  return [...registeredBookshelfWidgets.value];
}

// ── Parser registry (the only remaining capability) ──

export function getParsers(): BookParser[] {
  const result: BookParser[] = [];
  for (const p of plugins) {
    if (!enabled(p) || !p.provide?.parsers) continue;
    result.push(...p.provide.parsers);
  }
  return result;
}

export function getParserForFormat(format: string): BookParser | null {
  for (const p of getParsers()) {
    if (p.format === format) return p;
  }
  return null;
}
