import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Book Reader",
        short_name: "Book",
        description: "EPUB/TXT Reader Application",
        theme_color: "#fdfcfb",
        background_color: "#fdfcfb",
        display: "standalone",
        orientation: "any",
        scope: "/book/",
        start_url: "/book/",
        categories: ["books", "reading"],
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}"],
      },
    }),
  ],
  base: "/book/",
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
