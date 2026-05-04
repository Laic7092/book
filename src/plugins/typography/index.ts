import TypographySettings from "./TypographySettings.vue";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const typographyPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "typography",
  name: "Typography",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    ctx.ui.registerModal("typographySettings", TypographySettings);
  },
};
