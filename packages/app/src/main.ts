import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/tokens.css";
import "./index.css";

import { setBootstrap } from "./plugins/manager/registry";
import { loadPluginsFor } from "./plugins/loader";

const app = createApp(App);
app.use(createPinia());

setBootstrap({ app });
void loadPluginsFor("app").finally(() => {
  app.mount("#app");
});
