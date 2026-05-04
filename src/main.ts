// Reader Application - Vue 3 Entry Point

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/index.css";

import { registerPlugin, loadPluginStates, dispatchOnInit } from "./plugins/registry";
import { txtParserPlugin } from "./plugins/txt-parser";
import { epubPlugin } from "./plugins/epub";
import { annotationsPlugin } from "./plugins/annotations";
import { bookmarksPlugin } from "./plugins/bookmarks";
import { searchPlugin } from "./plugins/search";
import { statsPlugin } from "./plugins/stats";
import { themesPlugin } from "./plugins/themes";

registerPlugin(txtParserPlugin);
registerPlugin(epubPlugin);
registerPlugin(annotationsPlugin);
registerPlugin(bookmarksPlugin);
registerPlugin(searchPlugin);
registerPlugin(statsPlugin);
registerPlugin(themesPlugin);

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

// Restore persisted plugin enabled/disabled states from IndexedDB
await loadPluginStates();

// Plugins may need Pinia stores, so init after pinia is installed
await dispatchOnInit();

app.mount("#app");
