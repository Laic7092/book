import { ref, type Component } from "vue";
import type { Plugin, FooterAction, BookshelfMenuAction, PluginBootstrap } from "../types";
import { PLUGIN_BRAND } from "../types";
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
  /** false when canActivate() failed — plugin skipped, hidden from list. */
  available: boolean;
  /** Reason why available is false, from plugin.activationFailedReason. */
  availableReason?: string;
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

// ── Dependency resolution ──

interface DepGraphResult {
  sorted: string[];
  errors: string[];
}

function resolveDepGraph(): DepGraphResult {
  const ids = [...managedPlugins.keys()];
  const errors: string[] = [];

  for (const [id, mp] of managedPlugins) {
    if (mp.plugin.dependsOn) {
      for (const dep of mp.plugin.dependsOn) {
        if (!managedPlugins.has(dep)) {
          errors.push(`Plugin "${id}" depends on unknown plugin "${dep}"`);
        }
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const [id, mp] of managedPlugins) {
    if (mp.plugin.dependsOn) {
      for (const dep of mp.plugin.dependsOn) {
        if (managedPlugins.has(dep)) {
          adj.get(dep)!.push(id);
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
        }
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  // Sort alphabetically within each dependency level for determinism
  queue.sort((a, b) => a.localeCompare(b));

  const sorted: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sorted.push(id);
    const neighbors = adj.get(id) || [];
    neighbors.sort((a, b) => a.localeCompare(b));
    for (const neighbor of neighbors) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== ids.length) {
    const cycleNodes = ids.filter((id) => (inDegree.get(id) || 0) > 0);
    errors.push(`Plugin dependency cycle detected involving: ${cycleNodes.join(", ")}`);
  }

  return { sorted, errors };
}

// ── Registration ──

export function registerPlugin(p: Plugin): void {
  managedPlugins.set(p.id, { plugin: p, enabled: isEnabled(p), available: true });
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

  const { sorted, errors } = resolveDepGraph();
  for (const err of errors) {
    console.warn(`[Plugins] ${err}`);
  }

  for (const id of sorted) {
    if (pluginContexts.has(id)) continue; // already initialized
    const mp = managedPlugins.get(id);
    if (!mp) continue;
    if (!mp.enabled || !mp.plugin.setup) continue;

    // Check dependencies are enabled and healthy
    const missingDep = (mp.plugin.dependsOn || []).find((dep) => {
      const depMp = managedPlugins.get(dep);
      return !depMp || !depMp.enabled || depMp.setupError;
    });
    if (missingDep) {
      console.warn(`[Plugin ${id}] Skipping: dependency "${missingDep}" is disabled or errored`);
      mp.enabled = false;
      continue;
    }

    // Optional capability check — reuse the same context for setup
    if (mp.plugin.canActivate) {
      const ctx = createTrackedContext(id, bs);
      try {
        const ok = await Promise.resolve(mp.plugin.canActivate(ctx));
        if (!ok) {
          mp.available = false;
          mp.availableReason = mp.plugin.activationFailedReason ?? "Capability check failed";
          console.warn(`[Plugin ${id}] Skipped: ${mp.availableReason}`);
          void ctx.runCleanup();
          continue;
        }
      } catch (err) {
        mp.available = false;
        mp.availableReason = mp.plugin.activationFailedReason ?? `Error: ${String(err)}`;
        console.warn(`[Plugin ${id}] canActivate() threw:`, err);
        void ctx.runCleanup();
        continue;
      }
      await setupPluginInternal(id, bs, ctx);
    } else {
      await setupPluginInternal(id, bs);
    }
  }

  bump();
}

async function setupPluginInternal(
  id: string,
  bootstrap: PluginBootstrap,
  ctx?: TrackedContext,
): Promise<void> {
  const mp = managedPlugins.get(id);
  if (!mp || !mp.plugin.setup) return;

  try {
    const tracked = ctx ?? createTrackedContext(id, bootstrap);
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
  const mp = managedPlugins.get(id);
  if (!mp) return;

  if (!storedBootstrap) {
    console.warn(`[Plugin ${id}] Cannot setup: bootstrap not available`);
    return;
  }

  // Re-run canActivate if the plugin was previously hidden — reuse context
  if (mp.available === false && mp.plugin.canActivate) {
    const ctx = createTrackedContext(id, storedBootstrap);
    try {
      const ok = await Promise.resolve(mp.plugin.canActivate(ctx));
      if (!ok) {
        void ctx.runCleanup();
        console.warn(`[Plugin ${id}] Still unavailable: ${mp.availableReason}`);
        return;
      }
      mp.available = true;
      mp.availableReason = undefined;
      await setupPluginInternal(id, storedBootstrap, ctx);
      return;
    } catch (err) {
      void ctx.runCleanup();
      console.warn(`[Plugin ${id}] canActivate() re-threw:`, err);
      return;
    }
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
    const missingDep = (mp.plugin.dependsOn || []).find((dep) => {
      const depMp = managedPlugins.get(dep);
      return !depMp || !depMp.enabled;
    });
    if (missingDep) {
      console.warn(`[Plugin ${id}] Cannot enable: dependency "${missingDep}" is disabled`);
      return;
    }

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
    // Check if any enabled plugin depends on this one
    const dependent = [...managedPlugins.values()].find(
      (other) =>
        other.enabled && other.plugin.id !== id && (other.plugin.dependsOn || []).includes(id),
    );
    if (dependent) {
      console.warn(`[Plugin ${id}] Cannot disable: "${dependent.plugin.id}" depends on it`);
      return;
    }
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
  return [...managedPlugins.values()].filter((mp) => mp.available !== false).map((mp) => mp.plugin);
}

/** Count of plugins hidden due to failed canActivate(). */
export function getUnavailablePluginCount(): number {
  return [...managedPlugins.values()].filter((mp) => mp.available === false).length;
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
