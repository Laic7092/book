import { PdfParser } from "./pdf-parser";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

const parser = new PdfParser();

export const pdfPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "pdf-parser",
  name: "PDF Parser",
  version: "1.0.0",
  core: false,
  setup(ctx) {
    ctx.capabilities.register("parsers", parser);
  },
  teardown(ctx) {
    ctx.capabilities.unregister("parsers", parser);
  },
};
