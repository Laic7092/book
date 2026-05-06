// Reader Application - Vue 3 Entry Point

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/index.css";

import { setBootstrap } from "./plugins/registry";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

setBootstrap({ app, pinia });
app.mount("#app");
