import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [vue(), VitePWA({ registerType: "autoUpdate" })],
  base: "/book/",
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
