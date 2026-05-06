import { registerPlugin, initializePlugins, loadPluginStates } from "./registry";
import { PLUGIN_BRAND } from "./types";
import type { Plugin } from "./types";

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

// Compile-time extraction from zero-dependency meta files
const metas = import.meta.glob<{ loadOn: Scene }>("./*/meta.ts", { eager: true });

// True lazy loaders — only called when a scene is triggered
const pluginLoaders = import.meta.glob<Record<string, unknown>>("./*/index.ts");

type Scene = "app" | "book-import" | "bookshelf" | "reader";

const sceneMap = new Map<Scene, Array<() => Promise<void>>>();
const loaded = new Set<Scene>();

for (const [path, meta] of Object.entries(metas)) {
  if (!meta.loadOn) continue;

  const dir = path.split("/").slice(-2, -1)[0];
  const loader = pluginLoaders[`./${dir}/index.ts`];
  if (!loader) continue;

  if (!sceneMap.has(meta.loadOn)) sceneMap.set(meta.loadOn, []);
  sceneMap.get(meta.loadOn)!.push(async () => {
    const mod = await loader();
    for (const exportValue of Object.values(mod)) {
      if (isPlugin(exportValue)) registerPlugin(exportValue);
    }
    await loadPluginStates();
    await initializePlugins();
  });
}

export async function loadPluginsFor(scene: Scene): Promise<void> {
  if (loaded.has(scene)) return;
  loaded.add(scene);

  const tasks = sceneMap.get(scene) || [];
  await Promise.all(tasks.map((fn) => fn()));
}
