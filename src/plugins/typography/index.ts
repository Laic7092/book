import TypographySettings from "./TypographySettings.vue";
import type { Plugin } from "../types";

export const typographyPlugin: Plugin = {
  id: "typography",
  name: "Typography",
  version: "1.0.0",
  core: true,
  modalComponents: { typographySettings: TypographySettings },
};
