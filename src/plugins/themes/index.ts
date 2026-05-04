import ReaderSettings from "./ReaderSettings.vue";
import TypographySettings from "./TypographySettings.vue";
import type { Plugin } from "../types";

export const themesPlugin: Plugin = {
  id: "themes",
  name: "Themes & Typography",
  version: "1.0.0",
  modalComponents: { settings: ReaderSettings, typographySettings: TypographySettings },
};
