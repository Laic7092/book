import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import { createReadingProgressController } from "../../core/reading-progress";

export const readingProgressPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "reading-progress",
  name: "Reading Progress",
  version: "1.0.0",
  core: true,
  setup(ctx, { onTeardown }) {
    createReadingProgressController(ctx, onTeardown);
  },
};
