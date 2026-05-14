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

// ── Built-in parsers (registered eagerly at import time) ──

import { registerParserLoader } from "./registry";

registerParserLoader("epub", () => import("./epub/epub-parser").then((m) => new m.EpubParser()));
registerParserLoader("txt", () => import("./txt/txt-parser").then((m) => new m.TxtParser()));
registerParserLoader("pdf", () => import("./pdf/pdf-parser").then((m) => new m.PdfParser()));
registerParserLoader("cbz", () => import("./cbz/cbz-parser").then((m) => new m.CbzParser()));
registerParserLoader("fb2", () => import("./fb2/fb2-parser").then((m) => new m.Fb2Parser()));
registerParserLoader("html", () => import("./html/html-parser").then((m) => new m.HtmlParser()));
registerParserLoader("docx", () => import("./docx/docx-parser").then((m) => new m.DocxParser()));
registerParserLoader("cbr", () => import("./cbr/cbr-parser").then((m) => new m.CbrParser()));
registerParserLoader("mobi", () => import("./mobi/mobi-parser").then((m) => new m.MobiParser()));
registerParserLoader("azw3", () => import("./mobi/mobi-parser").then((m) => new m.MobiParser()));
registerParserLoader("azw", () => import("./mobi/mobi-parser").then((m) => new m.MobiParser()));
