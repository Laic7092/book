import { createApp } from "vue";
import App from "./App.vue";
import "./index.css";

import { setBootstrap } from "./plugins/manager/registry";
import { loadPluginsFor } from "./plugins/loader";

const app = createApp(App);

setBootstrap({ app });
void loadPluginsFor("app").finally(() => {
  app.mount("#app");
});
