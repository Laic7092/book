export type { BookParser, ParserResult, ChapterData } from "./types";
export {
  registerParserLoader,
  getParserForFormat,
  getParserForFile,
  loadParserForFormat,
  getParsers,
  EXTENSION_MIME_MAP,
} from "./registry";
export {
  BaseBookParser,
  generateId,
  sanitizeFilename,
  parseXML,
  extractTextFromHtml,
  cleanHtml,
} from "./base";
export { EpubParser } from "./epub/epub-parser";
export { TxtParser } from "./txt/txt-parser";
export { PdfParser } from "./pdf/pdf-parser";
export { CbzParser } from "./cbz/cbz-parser";

// ── Built-in parsers (registered eagerly at import time) ──

import { registerParserLoader } from "./registry";

registerParserLoader("epub", () => import("./epub/epub-parser").then((m) => new m.EpubParser()));
registerParserLoader("txt", () => import("./txt/txt-parser").then((m) => new m.TxtParser()));
registerParserLoader("pdf", () => import("./pdf/pdf-parser").then((m) => new m.PdfParser()));
registerParserLoader("cbz", () => import("./cbz/cbz-parser").then((m) => new m.CbzParser()));
