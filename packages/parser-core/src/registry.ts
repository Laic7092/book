import type { BookParser } from "./types";

const cache = new Map<string, BookParser>();
const loaders = new Map<string, () => Promise<BookParser>>();

export function getParsers(): BookParser[] {
  return [...cache.values()];
}

export function getParserForFormat(format: string): BookParser | null {
  return cache.get(format) ?? null;
}

export function registerParserLoader(format: string, loader: () => Promise<BookParser>): void {
  loaders.set(format, loader);
}

export async function loadParserForFormat(format: string): Promise<void> {
  if (cache.has(format)) return;
  const loader = loaders.get(format);
  if (!loader) return;
  const parser = await loader();
  cache.set(parser.format, parser);
}

export const EXTENSION_MIME_MAP: Record<string, string> = {
  txt: "text/plain",
  epub: "application/epub+zip",
  pdf: "application/pdf",
  cbz: "application/vnd.comicbook+zip",
};

export function getParserForFile(file: File): BookParser | null {
  const parsers = getParsers();

  for (const parser of parsers) {
    if (parser.supportsFormat(file.type)) return parser;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    for (const parser of parsers) {
      if (parser.supportsFormat(EXTENSION_MIME_MAP[ext])) {
        return parser;
      }
    }
  }

  return null;
}
