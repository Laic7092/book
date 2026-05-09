import { TxtParser } from "./txt-parser";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";

export const loadOn = "" as const; // loaded via factory.ts

const parser = new TxtParser();

export const txtParserPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "txt-parser",
  name: "TXT Parser",
  version: "1.0.0",
  core: true,
  setup(ctx) {
    ctx.capabilities.register("parsers", parser);
  },
  teardown(ctx) {
    ctx.capabilities.unregister("parsers", parser);
  },
};
