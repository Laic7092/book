// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./cbr/unrar.d.ts" />

export type {
  BookParser,
  ParserResult,
  ChapterData,
  StreamingChapter,
  StreamingParseEvent,
} from "./types";
export type { PdfOutlineItem } from "./pdf/pdf-renderer";
export {
  registerParserLoader,
  getParserForFormat,
  loadParserForFormat,
  getParserForFileAuto,
  getParsers,
  getFormatForExtension,
} from "./registry";
export { generateId, getFileMetadata, readAsText, readAsArrayBuffer, parseXML } from "./base";
export {
  resolvePath,
  escapeHtml,
  wrapHtml,
  collectChildren,
  getMimeType,
  pageToHtml,
  getZipModule,
  parseHTML,
} from "./shared";
export { getParseWorker, ParseWorkerClient } from "./parse-worker/client";

// ── Built-in parsers (registered eagerly at import time) ──

import { registerParserLoader } from "./registry";

registerParserLoader("epub", ["epub"], () =>
  import("./epub/epub-parser").then((m) => new m.EpubParser()),
);
registerParserLoader("txt", ["txt"], () =>
  import("./txt/txt-parser").then((m) => new m.TxtParser()),
);
registerParserLoader("pdf", ["pdf"], () =>
  import("./pdf/pdf-parser").then((m) => new m.PdfParser()),
);
registerParserLoader("cbz", ["cbz"], () =>
  import("./cbz/cbz-parser").then((m) => new m.CbzParser()),
);
registerParserLoader("fb2", ["fb2"], () =>
  import("./fb2/fb2-parser").then((m) => new m.Fb2Parser()),
);
registerParserLoader("html", ["html", "htm"], () =>
  import("./html/html-parser").then((m) => new m.HtmlParser()),
);
registerParserLoader("docx", ["docx"], () =>
  import("./docx/docx-parser").then((m) => new m.DocxParser()),
);
registerParserLoader("cbr", ["cbr"], () =>
  import("./cbr/cbr-parser").then((m) => new m.CbrParser()),
);
registerParserLoader("mobi", ["mobi", "azw3", "azw"], () =>
  import("./mobi/mobi-parser").then((m) => new m.MobiParser()),
);
