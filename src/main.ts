// Reader Application - Vue 3 Entry Point

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/index.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount("#app");
