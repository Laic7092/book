import { CbzParser } from "./cbz-parser";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const cbzPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "cbz-parser",
  name: "CBZ Parser",
  version: "1.0.0",
  core: false,
  provide: {
    parsers: [new CbzParser()],
  },
};
