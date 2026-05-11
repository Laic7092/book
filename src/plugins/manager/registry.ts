import { ref, type Component } from "vue";
import type { Plugin, FooterAction, BookshelfMenuAction, PluginBootstrap } from "../types";
import { PLUGIN_BRAND } from "../types";
import { saveAllPluginStates, getAllPluginStates } from "./plugin-states";
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
  dynamicCapabilities,
  type TrackedContext,
} from "../context";
import type { ContentTransformer, SearchApi, ToolbarItem, HeaderAction } from "../types";
import type { BookParser } from "../../core/types";

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

  // Reset dynamic capabilities only on first initialization
  const isFirstInit = pluginContexts.size === 0;
  if (isFirstInit) {
    dynamicCapabilities.parsers.length = 0;
    dynamicCapabilities.searchApis.length = 0;
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

    // Optional capability check before setup
    const ctxForCheck = pluginContexts.get(id);
    if (mp.plugin.canActivate && !ctxForCheck) {
      const checkCtx = createTrackedContext(id, bs);
      try {
        const ok = await Promise.resolve(mp.plugin.canActivate(checkCtx));
        if (!ok) {
          mp.available = false;
          mp.availableReason = mp.plugin.activationFailedReason ?? "Capability check failed";
          console.warn(`[Plugin ${id}] Skipped: ${mp.availableReason}`);
          void checkCtx.runCleanup();
          continue;
        }
      } catch (err) {
        mp.available = false;
        mp.availableReason = mp.plugin.activationFailedReason ?? `Error: ${String(err)}`;
        console.warn(`[Plugin ${id}] canActivate() threw:`, err);
        void checkCtx.runCleanup();
        continue;
      }
    }

    await setupPluginInternal(id, bs);
  }

  bump();
}

async function setupPluginInternal(id: string, bootstrap: PluginBootstrap): Promise<void> {
  const mp = managedPlugins.get(id);
  if (!mp || !mp.plugin.setup) return;

  try {
    const tracked = createTrackedContext(id, bootstrap);
    await mp.plugin.setup(tracked);
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

  try {
    if (mp.plugin.teardown) {
      await mp.plugin.teardown(ctx);
    }
  } catch (err) {
    console.error(`[Plugin ${id}] teardown() failed:`, err);
  }

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

  // Re-run canActivate if the plugin was previously hidden
  if (mp.available === false && mp.plugin.canActivate) {
    const checkCtx = createTrackedContext(id, storedBootstrap);
    try {
      const ok = await Promise.resolve(mp.plugin.canActivate(checkCtx));
      if (!ok) {
        void checkCtx.runCleanup();
        console.warn(`[Plugin ${id}] Still unavailable: ${mp.availableReason}`);
        return;
      }
      mp.available = true;
      mp.availableReason = undefined;
      void checkCtx.runCleanup();
    } catch (err) {
      void checkCtx.runCleanup();
      console.warn(`[Plugin ${id}] canActivate() re-threw:`, err);
      return;
    }
  }

  // Reset dynamic capabilities for this plugin by rebuilding from remaining contexts
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

    // If this is a stub (registered from meta, no setup), load the real module first
    if (!mp.plugin.setup && pluginModuleLoaders.has(id)) {
      const loader = pluginModuleLoaders.get(id)!;
      pluginModuleLoaders.delete(id);
      const mod = await loader();
      let upgraded = false;
      for (const val of Object.values(mod)) {
        if (
          typeof val === "object" &&
          val !== null &&
          (val as Record<string, unknown>)[PLUGIN_BRAND] === true
        ) {
          const realPlugin = val as unknown as Plugin;
          // Preserve the disabled flag — registerPlugin sets it from realPlugin,
          // but we're about to enable it, so set enabled: true first
          realPlugin.enabled = true;
          registerPlugin(realPlugin);
          upgraded = true;
          break;
        }
      }
      if (!upgraded) {
        console.error(`[Plugins] Failed to find branded export in module for "${id}"`);
        return;
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
  savePluginStates();
}

// ── Persistence ──

function savePluginStates(): void {
  const states: Record<string, boolean> = {};
  for (const [id, mp] of managedPlugins) {
    states[id] = mp.enabled;
  }
  void saveAllPluginStates(states);
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

// ── Capability collectors ──

export function getParsers(): BookParser[] {
  return [...dynamicCapabilities.parsers];
}

export function getParserForFormat(format: string): BookParser | null {
  for (const p of getParsers()) {
    if (p.format === format) return p;
  }
  return null;
}

/** Returns all registered search APIs from plugins (dynamic capabilities + static provides). */
export function getSearchApis(): SearchApi[] {
  return [...dynamicCapabilities.searchApis];
}

// ── Content transformers ──

export function getContentTransformers(): ContentTransformer[] {
  return [...registeredContentTransformers.value];
}

export { applyContentTransformers } from "../context";

// ── Plugin event bus (re-export for convenience) ──

export { pluginEvents } from "../context";
