import type { BookParser } from "../core/types";

const cache = new Map<string, BookParser>();

export function getParsers(): BookParser[] {
  return [...cache.values()];
}

export function getParserForFormat(format: string): BookParser | null {
  return cache.get(format) ?? null;
}

const loaders: Record<string, () => Promise<BookParser>> = {
  epub: () => import("./epub/epub-parser").then((m) => new m.EpubParser()),
  txt: () => import("./txt-parser/txt-parser").then((m) => new m.TxtParser()),
  pdf: () => import("./pdf-parser/pdf-parser").then((m) => new m.PdfParser()),
  cbz: () => import("./cbz-parser/cbz-parser").then((m) => new m.CbzParser()),
};

export async function loadParserForFormat(format: string): Promise<void> {
  if (cache.has(format)) return;
  const loader = loaders[format];
  if (!loader) return;
  const parser = await loader();
  cache.set(parser.format, parser);
}
