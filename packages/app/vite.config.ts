import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

// ── Config ──

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
    }),
  ],
  base: "/book/",
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "node",
  },
  staged: {
    "*": "vp check --fix",
  },
});
