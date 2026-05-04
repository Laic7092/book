// Reader Application - Vue 3 Entry Point

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/index.css";

import { registerPlugin, initializePlugins, loadPluginStates } from "./plugins/registry";
import { PLUGIN_BRAND } from "./plugins/types";
import type { Plugin } from "./plugins/types";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// Phase 1: auto-discover and register all plugins
const modules = import.meta.glob<Record<string, unknown>>("./plugins/*/index.ts", { eager: true });

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

const allPlugins: Plugin[] = [];

for (const [, mod] of Object.entries(modules)) {
  for (const exportValue of Object.values(mod)) {
    if (isPlugin(exportValue)) {
      allPlugins.push(exportValue);
    }
  }
}

// Sort: core plugins first, then alphabetically by id
allPlugins.sort((a, b) => {
  if (a.core !== b.core) return a.core ? -1 : 1;
  return a.id.localeCompare(b.id);
});

for (const p of allPlugins) {
  registerPlugin(p);
}

// Phase 2: restore persisted enabled/disabled states
await loadPluginStates();

// Phase 3: initialize (setup() called only for enabled plugins)
await initializePlugins({ app, pinia });

app.mount("#app");
