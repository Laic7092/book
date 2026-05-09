import { PdfParser } from "./pdf-parser";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const pdfPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "pdf-parser",
  name: "PDF Parser",
  version: "1.0.0",
  core: false,
  provide: {
    parsers: [new PdfParser()],
  },
};
