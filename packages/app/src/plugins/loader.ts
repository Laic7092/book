import {
  registerPlugin,
  initializePlugins,
  loadPluginStates,
  getAllPluginStates,
  pluginModuleLoaders,
} from "./manager/registry";
import { PLUGIN_BRAND } from "./types";
import type { Plugin, Scene } from "./types";
import PLUGIN_METADATA from "./plugin-metadata.json";

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
  /** Whether to enable by default when no stored state exists. Defaults to true. */
  defaultEnabled?: boolean;
}

const metas: PluginMeta[] = [];
const pluginLoaders = import.meta.glob<Record<string, unknown>>("./*/index.ts");
// Template is documentation, not a loadable plugin — keep it out of the map.
delete pluginLoaders["./_template/index.ts"];

for (const meta of PLUGIN_METADATA) {
  if (!meta.loadOn || (Array.isArray(meta.loadOn) && meta.loadOn.length === 0)) continue;
  const loader = pluginLoaders[`./${meta.dir}/index.ts`];
  if (!loader) continue;
  metas.push({
    loadOn: meta.loadOn,
    pluginId: meta.pluginId,
    name: meta.name,
    dir: meta.dir,
    defaultEnabled: meta.defaultEnabled,
  });
}

// ── Lazy scene map built once we know enable states ──

let sceneMapReady = false;
const sceneMap = new Map<Scene, Array<() => Promise<void>>>();
const loaded = new Set<Scene>();

async function ensureSceneMap(): Promise<void> {
  if (sceneMapReady) return;
  sceneMapReady = true;

  const states = await getAllPluginStates();

  for (const meta of metas) {
    if (!meta.pluginId) continue;
    const loader = pluginLoaders[`./${meta.dir}/index.ts`];
    if (!loader) continue;

    const effectiveEnabled = states?.[meta.pluginId] ?? meta.defaultEnabled ?? true;

    // Register metadata stub for panel visibility, store loader for later enabling
    registerPlugin({
      [PLUGIN_BRAND]: true as const,
      id: meta.pluginId,
      name: meta.name ?? meta.pluginId,
      version: "0.0.0",
      enabled: effectiveEnabled,
      core: false,
    });
    pluginModuleLoaders.set(meta.pluginId, loader);

    if (!effectiveEnabled) continue;

    const scenes = (Array.isArray(meta.loadOn) ? meta.loadOn : [meta.loadOn]) as Scene[];
    for (const scene of scenes) {
      if (!sceneMap.has(scene)) sceneMap.set(scene, []);
      sceneMap.get(scene)!.push(async () => {
        const mod = await loader();
        for (const exportValue of Object.values(mod)) {
          if (isPlugin(exportValue)) registerPlugin(exportValue);
        }
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
