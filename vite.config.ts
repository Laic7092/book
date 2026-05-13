import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
// eslint-disable-next-line no-control-regex
const INVALID_CHAR_REGEX = /[\x00-\x1F\x7F<>*#"{}|^[\]`;?:&=+$,]/g;
const DRIVE_LETTER_REGEX = /^[a-z]:/i;

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
    environment: "happy-dom",
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ["server/**"],
  },
  build: {
    rolldownOptions: {
      output: {
        sanitizeFileName(name: string): string {
          const match = DRIVE_LETTER_REGEX.exec(name);
          const driveLetter = match ? match[0] : "";
          return driveLetter + name.slice(driveLetter.length).replace(INVALID_CHAR_REGEX, "");
        },
      },
    },
  },
});
