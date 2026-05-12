import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./index.css";

import { setBootstrap } from "./plugins/manager/registry";
import { loadPluginsFor } from "./plugins/loader";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

setBootstrap({ app, pinia });
void loadPluginsFor("app").finally(() => {
  app.mount("#app");
});
