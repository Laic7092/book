import type { BookParser } from "./types";

const cache = new Map<string, BookParser>();
const loaders = new Map<string, () => Promise<BookParser>>();
const extensionToFormat = new Map<string, string>();

export function getParsers(): BookParser[] {
  return [...cache.values()];
}

export function getParserForFormat(format: string): BookParser | null {
  return cache.get(format) ?? null;
}

export function registerParserLoader(
  format: string,
  extensions: string[],
  loader: () => Promise<BookParser>,
): void {
  loaders.set(format, loader);
  for (const ext of extensions) {
    extensionToFormat.set(ext, format);
  }
}

export async function loadParserForFormat(format: string): Promise<void> {
  if (cache.has(format)) return;
  const loader = loaders.get(format);
  if (!loader) return;
  const parser = await loader();
  cache.set(format, parser);
}

export function getFormatForExtension(ext: string): string | undefined {
  return extensionToFormat.get(ext);
}

export async function getParserForFileAuto(file: File): Promise<BookParser | null> {
  for (const parser of getParsers()) {
    if (parser.supportsFormat(file.type)) return parser;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext) {
    const format = getFormatForExtension(ext);
    if (format) {
      await loadParserForFormat(format);
      return cache.get(format) ?? null;
    }
  }

  return null;
}
