import { EpubParser } from "./epub-parser";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const loadOn = "" as const; // loaded via factory.ts
export const epubPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "epub",
  name: "EPUB Parser",
  version: "1.0.0",
  core: true,
  provide: {
    parsers: [new EpubParser()],
  },
};
