import {
  registerPlugin,
  initializePlugins,
  loadPluginStates,
  pluginModuleLoaders,
} from "./manager/registry";
import { PLUGIN_BRAND } from "./types";
import type { Plugin, Scene } from "./types";
import { getAllPluginStates } from "./manager/plugin-states";
import { pluginManifest } from "./plugin-manifest";

function isPlugin(obj: unknown): obj is Plugin {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (obj as Record<string, unknown>)[PLUGIN_BRAND] === true &&
    "id" in obj &&
    "name" in obj &&
    "version" in obj
  );
}

// ── Meta collected eagerly at import time ──

interface PluginMeta {
  loadOn: string | string[];
  pluginId?: string;
  name?: string;
  /** Path relative to src/plugins/, e.g. "annotations/index.ts" */
  dir: string;
}

const metas: PluginMeta[] = [];
const pluginLoaders = import.meta.glob<Record<string, unknown>>("./*/index.ts");

for (const meta of pluginManifest) {
  if (!meta.loadOn || (Array.isArray(meta.loadOn) && meta.loadOn.length === 0)) continue;
  const loader = pluginLoaders[`./${meta.dir}/index.ts`];
  if (!loader) continue;
  metas.push({ loadOn: meta.loadOn, pluginId: meta.pluginId, name: meta.name, dir: meta.dir });
}

// ── Lazy scene map built once we know enable states ──

let sceneMapReady = false;
const sceneMap = new Map<Scene, Array<() => Promise<void>>>();
const loaded = new Set<Scene>();

async function ensureSceneMap(): Promise<void> {
  if (sceneMapReady) return;
  sceneMapReady = true;

  // Pre-load enable states from the manager plugin's entity store
  const states = await getAllPluginStates();

  for (const meta of metas) {
    const loader = pluginLoaders[`./${meta.dir}/index.ts`];
    if (!loader) continue;

    // Check if this is a parser plugin (has formats in manifest)
    const manifestEntry = pluginManifest.find((m) => m.dir === meta.dir);
    const isParser = manifestEntry ? !!manifestEntry.formats?.length : false;

    // Always register a stub from manifest metadata so the plugin is visible in the panel
    if (meta.pluginId) {
      registerPlugin({
        [PLUGIN_BRAND]: true as const,
        id: meta.pluginId,
        name: meta.name ?? meta.pluginId,
        version: "0.0.0",
        enabled: states?.[meta.pluginId] !== false,
        core: false,
      });
    }

    // If disabled, store the loader for later and skip scene loading
    if (meta.pluginId && states?.[meta.pluginId] === false) {
      if (loader) pluginModuleLoaders.set(meta.pluginId, loader);
      continue;
    }

    // Parser plugins are loaded on-demand via loadParserForFormat, not via scene
    if (isParser) continue;

    // The manifest values are guaranteed to be valid Scene values
    const scenes = (Array.isArray(meta.loadOn) ? meta.loadOn : [meta.loadOn]) as Scene[];
    for (const scene of scenes) {
      if (!sceneMap.has(scene)) sceneMap.set(scene, []);
      sceneMap.get(scene)!.push(async () => {
        const mod = await loader();
        for (const exportValue of Object.values(mod)) {
          if (isPlugin(exportValue)) registerPlugin(exportValue);
        }
        // States already known but re-apply to catch any toggle since pre-load
        await loadPluginStates();
        await initializePlugins();
      });
    }
  }
}

export async function loadPluginsFor(scene: Scene): Promise<void> {
  if (loaded.has(scene)) return;
  await ensureSceneMap(); // ← ensures sceneMap is built with state awareness
  loaded.add(scene);

  const tasks = sceneMap.get(scene) || [];
  await Promise.all(tasks.map((fn) => fn()));
}

// ── On-demand parser loading ──

/**
 * Load only the parser plugin that handles the given file format.
 * Uses the build-time manifest to find the right plugin without loading all parsers.
 */
export async function loadParserForFormat(format: string): Promise<void> {
  const entry = pluginManifest.find((m) => m.formats?.includes(format));
  if (!entry) return;

  const loader = pluginLoaders[`./${entry.dir}/index.ts`];
  if (!loader) return;

  const mod = await loader();
  for (const exportValue of Object.values(mod)) {
    if (isPlugin(exportValue)) registerPlugin(exportValue);
  }
  await loadPluginStates();
  await initializePlugins();
}
