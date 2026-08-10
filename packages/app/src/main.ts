import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/tokens.css";
import "./index.css";

import { setBootstrap } from "./core/plugin-runtime/registry";
import { loadPluginsFor } from "./core/plugin-runtime/loader";

const app = createApp(App);
app.use(createPinia());

setBootstrap({ app });
void loadPluginsFor("app").finally(() => {
  app.mount("#app");
});
