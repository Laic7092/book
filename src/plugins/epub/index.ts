import { EpubParser } from "./epub-parser";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

const parser = new EpubParser();

export const epubPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "epub",
  name: "EPUB Parser",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    ctx.capabilities.register("parsers", parser);
  },
  teardown(ctx) {
    ctx.capabilities.unregister("parsers", parser);
  },
};
