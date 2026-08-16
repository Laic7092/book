import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import { createReadingProgressController } from "./progress";

/**
 * Reading Progress — optional plugin, enabled by default.
 *
 * Domain logic (persistence + restore) lives in ./progress.ts; this file only
 * wires it into the plugin lifecycle. Disabling it = no position restore.
 */
export const readingProgressPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "reading-progress",
  name: "Reading Progress",
  version: "1.0.0",
  setup(ctx, { onTeardown }) {
    createReadingProgressController(ctx, onTeardown);
  },
};
