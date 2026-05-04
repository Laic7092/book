import { EpubParser } from "./epub-parser";
import * as resources from "./resources";
import * as zips from "./zips";
import type { Plugin } from "../types";

export const epubPlugin: Plugin = {
  id: "epub",
  name: "EPUB Parser",
  version: "1.0.0",
  parsers: [new EpubParser()],
  lazyExtractChapter: (zipData, href) => EpubParser.extractChapterContent(zipData, href),
  lazyExtractResource: (zipData, resourceId) => EpubParser.extractResource(zipData, resourceId),
  resourceResolver: {
    getResourceUrl: resources.getResourceUrl,
    revokeResourceUrls: resources.revokeResourceUrls,
  },
  resourceSaver: {
    saveResource: resources.saveResource,
  },
  zipStore: {
    saveZip: zips.saveZip,
    getZip: zips.getZip,
  },
};
