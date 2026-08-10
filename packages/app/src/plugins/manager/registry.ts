import { ref, type Component } from "vue";
import type { Plugin, FooterAction, BookshelfMenuAction, PluginBootstrap } from "../types";
import { PLUGIN_BRAND, PLUGIN_API_VERSION } from "../types";
import { createPluginStorageAdapter } from "../context";
import { createEntityStore } from "../store-factory";
import {
  createTrackedContext,
  registeredModals,
  registeredOverlays,
  registeredFooterActions,
  registeredBookshelfWidgets,
  registeredBookshelfMenuActions,
  registeredToolbarItems,
  registeredHeaderActions,
  registeredContentTransformers,
  registeredPages,
  type TrackedContext,
} from "../context";
import type { ContentTransformer, ToolbarItem, HeaderAction } from "../types";

// ── Internal state ──

interface ManagedPlugin {
  plugin: Plugin;
  enabled: boolean;
  setupError?: Error;
}

const managedPlugins = new Map<string, ManagedPlugin>();
const pluginContexts = new Map<string, TrackedContext>();

/** Populated by loader.ts — maps pluginId → lazy module loader for stub upgrade. */
export const pluginModuleLoaders = new Map<string, () => Promise<Record<string, unknown>>>();

/** Incremented every time plugin state changes; used by UI computeds to track reactivity */
export const pluginStateVersion = ref(0);

function bump() {
  pluginStateVersion.value++;
}

function isEnabled(p: Plugin): boolean {
  return p.enabled !== false;
}

// ── Registration ──

export function registerPlugin(p: Plugin): void {
  managedPlugins.set(p.id, { plugin: p, enabled: isEnabled(p) });
}

// ── Initialization ──

let storedBootstrap: PluginBootstrap | null = null;

export function setBootstrap(bootstrap: PluginBootstrap): void {
  storedBootstrap = bootstrap;
}

export async function initializePlugins(bootstrap?: PluginBootstrap): Promise<void> {
  if (bootstrap) storedBootstrap = bootstrap;
  const bs = storedBootstrap ?? bootstrap;
  if (!bs) {
    console.warn("[Plugins] Cannot initialize: bootstrap not available");
    return;
  }

  for (const [id, mp] of managedPlugins) {
    if (pluginContexts.has(id)) continue; // already initialized
    if (!mp.enabled || !mp.plugin.setup) continue;
    await setupPluginInternal(id, bs);
  }

  bump();
}

async function setupPluginInternal(id: string, bootstrap: PluginBootstrap): Promise<void> {
  const mp = managedPlugins.get(id);
  if (!mp || !mp.plugin.setup) return;

  // API version gate: a plugin targeting a different PluginContext version is
  // rejected at setup (recorded as setupError, visible to the manager panel)
  // instead of running against an unknown surface (docs/plugin-contract.md §三).
  const apiVersion = mp.plugin.apiVersion ?? 1;
  if (apiVersion !== PLUGIN_API_VERSION) {
    const err = new Error(
      `[Plugin ${id}] apiVersion ${apiVersion} does not match PLUGIN_API_VERSION ${PLUGIN_API_VERSION} — setup rejected`,
    );
    console.error(err.message);
    mp.setupError = err;
    return;
  }

  try {
    const tracked = createTrackedContext(id, bootstrap);
    await mp.plugin.setup(tracked, { onTeardown: (fn) => tracked.addTeardown(fn) });
    mp.setupError = undefined;
    pluginContexts.set(id, tracked);
  } catch (err) {
    console.error(`[Plugin ${id}] setup() failed:`, err);
    mp.setupError = err instanceof Error ? err : new Error(String(err));
  }
}

// ── Lifecycle: enable / disable ──

export async function teardownPlugin(id: string): Promise<void> {
  const mp = managedPlugins.get(id);
  if (!mp) return;

  const ctx = pluginContexts.get(id);
  if (!ctx) return;

  await ctx.runCleanup();
  pluginContexts.delete(id);
}

export async function setupPlugin(id: string): Promise<void> {
  if (!storedBootstrap) {
    console.warn(`[Plugin ${id}] Cannot setup: bootstrap not available`);
    return;
  }
  await setupPluginInternal(id, storedBootstrap);
}

export async function setPluginEnabled(id: string, on: boolean): Promise<void> {
  const mp = managedPlugins.get(id);
  if (!mp) return;

  if (mp.plugin.core) {
    console.warn(`[Plugin ${id}] Core plugins cannot be toggled`);
    return;
  }

  if (on && !mp.enabled) {
    // If this is a stub (registered from metadata, no setup), load the real module
    if (!mp.plugin.setup) {
      const loader = pluginModuleLoaders.get(id);
      if (loader) {
        pluginModuleLoaders.delete(id);
        const mod = await loader();
        const realPlugin = Object.values(mod).find(
          (v): v is Plugin =>
            typeof v === "object" &&
            v !== null &&
            (v as Record<string, unknown>)[PLUGIN_BRAND] === true,
        );
        if (!realPlugin) {
          console.error(`[Plugins] No plugin export found in module for "${id}"`);
          return;
        }
        realPlugin.enabled = true;
        registerPlugin(realPlugin);
      }
    }

    // Re-fetch in case stub was upgraded (registerPlugin replaces the ManagedPlugin entry)
    const current = managedPlugins.get(id);
    if (!current) return;
    await setupPlugin(id);
    current.enabled = true;
    current.plugin.enabled = true;
  } else if (!on && mp.enabled) {
    await teardownPlugin(id);
    mp.enabled = false;
    mp.plugin.enabled = false;
  }

  bump();
  await savePluginStates();
}

// ── Plugin state storage (IndexedDB-backed, manager namespace) ──

type PluginStateEntity = { id: string; enabled: boolean };

const _stateStorage = createPluginStorageAdapter("manager");
const pluginStatesStore = createEntityStore<PluginStateEntity>(_stateStorage, "plugin-state");

async function savePluginState(id: string, enabled: boolean): Promise<void> {
  const existing = pluginStatesStore.getById(id);
  if (existing) {
    await pluginStatesStore.update(id, { enabled });
  } else {
    await pluginStatesStore.add({ id, enabled });
  }
}

export async function getAllPluginStates(): Promise<Record<string, boolean>> {
  await pluginStatesStore.whenLoaded();
  const result: Record<string, boolean> = {};
  for (const entity of pluginStatesStore.items.value) {
    result[entity.id] = entity.enabled;
  }
  return result;
}

async function saveAllPluginStates(states: Record<string, boolean>): Promise<void> {
  await pluginStatesStore.whenLoaded();
  const tasks: Promise<void>[] = [];
  for (const [id, enabled] of Object.entries(states)) {
    tasks.push(savePluginState(id, enabled));
  }
  await Promise.all(tasks);
}

// ── Persistence ──

async function savePluginStates(): Promise<void> {
  const states: Record<string, boolean> = {};
  for (const [id, mp] of managedPlugins) {
    states[id] = mp.enabled;
  }
  await saveAllPluginStates(states);
}

export async function loadPluginStates(): Promise<void> {
  const stored = await getAllPluginStates();
  if (!stored) return;
  for (const [id, on] of Object.entries(stored)) {
    const mp = managedPlugins.get(id);
    if (mp) {
      mp.enabled = on;
      mp.plugin.enabled = on;
    }
  }
  bump();
}

// ── Queries ──

export function getAllPlugins(): readonly Plugin[] {
  return [...managedPlugins.values()].map((mp) => mp.plugin);
}

export function isPluginEnabled(id: string): boolean {
  return managedPlugins.get(id)?.enabled !== false;
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

export function getBookshelfMenuActions(): BookshelfMenuAction[] {
  return [...registeredBookshelfMenuActions.value];
}

export function getToolbarItems(): ToolbarItem[] {
  return [...registeredToolbarItems.value];
}

export function getHeaderActions(): HeaderAction[] {
  return [...registeredHeaderActions.value];
}

export function getPageComponent(name: string): Component | undefined {
  return registeredPages.value[name];
}

// ── Content transformers ──

export function getContentTransformers(): ContentTransformer[] {
  return [...registeredContentTransformers.value];
}

export { applyContentTransformers } from "../context";

// ── Plugin event bus (re-export for convenience) ──

export { pluginEvents } from "../context";
