import { EpubParser } from "./epub-parser";
import type { Plugin } from "../types";

export const epubPlugin: Plugin = {
  id: "epub",
  name: "EPUB Parser",
  version: "1.0.0",
  core: true,
  provide: {
    parsers: [new EpubParser()],
  },
};
