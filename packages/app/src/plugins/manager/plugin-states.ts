// Plugin enable/disable state management.
// Backed by createEntityStore, scoped to the manager plugin's storage namespace.

import { watch } from "vue";
import { createPluginStorageAdapter } from "../context";
import { createEntityStore } from "../store-factory";

export type PluginStateEntity = { id: string; enabled: boolean };

// Storage scoped to the manager plugin
const _storage = createPluginStorageAdapter("manager");

export const pluginStatesStore = createEntityStore<PluginStateEntity>(_storage, "plugin-state");

/** Await the store's initial cache load. */
async function ensureLoaded(): Promise<void> {
  if (!pluginStatesStore.loaded.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => pluginStatesStore.loaded.value,
        (v) => {
          if (v) {
            stop();
            resolve();
          }
        },
      );
    });
  }
}

/** Read all plugin states as a map (pluginId → enabled). */
export async function getAllPluginStates(): Promise<Record<string, boolean>> {
  await ensureLoaded();
  const result: Record<string, boolean> = {};
  for (const entity of pluginStatesStore.items.value) {
    result[entity.id] = entity.enabled;
  }
  return result;
}

/** Save or update a single plugin's state. */
export async function savePluginState(id: string, enabled: boolean): Promise<void> {
  const existing = pluginStatesStore.getById(id);
  if (existing) {
    await pluginStatesStore.update(id, { enabled });
  } else {
    await pluginStatesStore.add({ id, enabled });
  }
}

/** Bulk-save all plugin states (calls add/update per plugin). */
export async function saveAllPluginStates(states: Record<string, boolean>): Promise<void> {
  await ensureLoaded();
  const tasks: Promise<void>[] = [];
  for (const [id, enabled] of Object.entries(states)) {
    tasks.push(savePluginState(id, enabled));
  }
  await Promise.all(tasks);
}
