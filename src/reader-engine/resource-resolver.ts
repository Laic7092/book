import type { BookParser } from "../core/types";
import { rewriteResourcePaths } from "./resource-urls";

const CSS_URL_PATTERN = /url\(['"]?([^'")\s]+)['"]?\)/gi;

function collectResourcePaths(doc: Document): string[] {
  const paths = new Set<string>();

  doc.querySelectorAll("img[src]").forEach((el) => {
    const src = el.getAttribute("src");
    if (src) paths.add(src);
  });

  doc.querySelectorAll("image").forEach((el) => {
    const href = el.getAttribute("xlink:href");
    if (href) paths.add(href);
  });

  doc.querySelectorAll("link[rel='stylesheet'][href]").forEach((el) => {
    const href = el.getAttribute("href");
    if (href) paths.add(href);
  });

  doc.querySelectorAll("*[style]").forEach((el) => {
    const style = el.getAttribute("style");
    if (style) {
      for (const [, url] of style.matchAll(CSS_URL_PATTERN)) {
        paths.add(url);
      }
    }
  });

  doc.querySelectorAll("style").forEach((el) => {
    const css = el.textContent;
    if (css) {
      for (const [, url] of css.matchAll(CSS_URL_PATTERN)) {
        paths.add(url);
      }
    }
  });

  return Array.from(paths);
}

async function resolveMissingResources(
  bookId: string,
  paths: string[],
  resourceUrls: Map<string, string>,
  parser: BookParser,
): Promise<void> {
  const missingPaths = paths.filter((p) => !resourceUrls.has(p));
  if (missingPaths.length === 0) return;

  const results = await Promise.all(
    missingPaths.map(async (path) => ({
      path,
      url: await parser.resolveResourceUrl?.(bookId, path),
    })),
  );

  for (const { path, url } of results) {
    if (url) resourceUrls.set(path, url);
  }
}

export interface ResolvedChapter {
  html: string;
  resources: HTMLElement[];
}

/**
 * Resolve EPUB/format-specific resources in chapter HTML.
 * Handles: img src, image xlink:href, stylesheet link href,
 * inline style url(), and embedded <style> url() references.
 */
export async function resolveChapterResources(
  rawHtml: string,
  bookId: string,
  parser: BookParser,
  resourceUrls: Map<string, string>,
): Promise<ResolvedChapter> {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");

  const resourcePaths = collectResourcePaths(doc);
  if (resourcePaths.length > 0 && parser.resolveResourceUrl) {
    await resolveMissingResources(bookId, resourcePaths, resourceUrls, parser);
  }

  if (resourceUrls.size > 0) {
    const rewrittenDoc = rewriteResourcePaths(rawHtml, resourceUrls);

    const resources: HTMLElement[] = [];
    const headElements = Array.from(rewrittenDoc.head.children);
    for (const element of headElements) {
      resources.push(element.cloneNode(true) as HTMLElement);
    }

    return { html: rewrittenDoc.body.innerHTML, resources };
  }

  return { html: doc.body.innerHTML, resources: [] };
}
