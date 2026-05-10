import {
  registerPlugin,
  initializePlugins,
  loadPluginStates,
  pluginModuleLoaders,
} from "./registry";
import { PLUGIN_BRAND } from "./types";
import type { Plugin, Scene } from "./types";
import { STORES, dbGet } from "../storage/db";

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
  loadOn: Scene | Scene[];
  pluginId?: string;
  name?: string;
  /** Path relative to src/plugins/, e.g. "annotations/index.ts" */
  dir: string;
}

const metas: PluginMeta[] = [];
const pluginLoaders = import.meta.glob<Record<string, unknown>>("./*/index.ts");

const eagerMetas = import.meta.glob<{ loadOn: Scene | Scene[]; pluginId?: string; name?: string }>(
  "./*/meta.ts",
  { eager: true },
);

for (const [path, raw] of Object.entries(eagerMetas)) {
  if (!raw.loadOn || (Array.isArray(raw.loadOn) && raw.loadOn.length === 0)) continue;
  const dir = path.split("/").slice(-2, -1)[0];
  const loader = pluginLoaders[`./${dir}/index.ts`];
  if (!loader) continue;
  metas.push({ loadOn: raw.loadOn, pluginId: raw.pluginId, name: raw.name, dir });
}

// ── Lazy scene map built once we know enable states ──

let sceneMapReady = false;
const sceneMap = new Map<Scene, Array<() => Promise<void>>>();
const loaded = new Set<Scene>();

async function ensureSceneMap(): Promise<void> {
  if (sceneMapReady) return;
  sceneMapReady = true;

  // Pre-load enable states once — queried from DB directly since
  // managedPlugins entries don't exist until scene tasks run.
  const stored = await dbGet<{ value: Record<string, boolean> }>(
    STORES.SETTINGS,
    "__plugin_states__",
  );
  const states = stored?.value ?? null;

  for (const meta of metas) {
    const loader = pluginLoaders[`./${meta.dir}/index.ts`];
    if (!loader) continue;

    // Register a stub for disabled plugins, then skip the import
    if (meta.pluginId && states?.[meta.pluginId] === false) {
      registerPlugin({
        [PLUGIN_BRAND]: true as const,
        id: meta.pluginId,
        name: meta.name ?? meta.pluginId,
        version: "0.0.0",
        enabled: false,
        core: false,
      });
      pluginModuleLoaders.set(meta.pluginId, loader);
      continue;
    }

    const scenes = Array.isArray(meta.loadOn) ? meta.loadOn : [meta.loadOn];
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
