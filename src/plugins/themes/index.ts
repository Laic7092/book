import ReaderSettings from "./ReaderSettings.vue";
import type { Plugin } from "../types";

export const themesPlugin: Plugin = {
  id: "themes",
  name: "Themes",
  version: "1.0.0",
  core: true,
  modalComponents: { settings: ReaderSettings },
};
