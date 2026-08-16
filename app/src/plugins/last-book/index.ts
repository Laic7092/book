import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import { registerLastBook } from "./service";

/**
 * Last Book Restore — optional plugin, enabled by default.
 *
 * Domain logic lives in ./service.ts; this file only registers it. All shared
 * infrastructure (events / storage / navigate) comes from core via ctx.
 * Disabling it = the app opens on the bookshelf instead of auto-resuming.
 */
export const lastBookPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "last-book",
  name: "Last Book Restore",
  version: "1.0.0",
  setup(ctx) {
    registerLastBook(ctx);
  },
};
