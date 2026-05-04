import { TxtParser } from "./txt-parser";
import type { Plugin } from "../types";

export const txtParserPlugin: Plugin = {
  id: "txt-parser",
  name: "TXT Parser",
  version: "1.0.0",
  core: true,
  provide: {
    parsers: [new TxtParser()],
  },
};
