import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";
import { registerLastBook } from "../../core/last-book";

export const lastBookPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "last-book",
  name: "Last Book Restore",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    registerLastBook(ctx);
  },
};
