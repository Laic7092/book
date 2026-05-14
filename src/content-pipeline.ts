import type { BookParser } from "@book/parser-core";
import { applyContentTransformers } from "./plugins/manager/registry";
import { getMimeTypeFromExtension } from "./storage/books";

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
  rawData: ArrayBuffer | undefined,
  paths: string[],
  resourceUrls: Map<string, string>,
  parser: BookParser,
): Promise<void> {
  if (!rawData || !parser.extractResource) return;
  const missingPaths = paths.filter((p) => !resourceUrls.has(p));
  if (missingPaths.length === 0) return;

  const results = await Promise.all(
    missingPaths.map(async (path) => ({
      path,
      data: await parser.extractResource!(rawData, path),
    })),
  );

  for (const { path, data } of results) {
    if (data) {
      const mimeType = getMimeTypeFromExtension(path);
      resourceUrls.set(path, URL.createObjectURL(new Blob([data], { type: mimeType })));
    }
  }
}

function findResourceUrl(path: string, resourceUrls: Map<string, string>): string | null {
  const normalizedPath = path.replace(/^\//, "").split("#")[0].split("?")[0];

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(normalizedPath);
  } catch {
    decodedPath = normalizedPath;
  }

  const pathsToTry = [path, normalizedPath, decodedPath];
  if (decodedPath !== normalizedPath) pathsToTry.push(decodedPath);

  const basename = normalizedPath.split("/").pop();
  if (basename && basename !== normalizedPath) {
    pathsToTry.push(basename);
    try {
      const db = decodeURIComponent(basename);
      if (db !== basename) pathsToTry.push(db);
    } catch {
      /* ignore */
    }
  }

  const decodedBasename = decodedPath.split("/").pop();
  if (decodedBasename && decodedBasename !== decodedPath) {
    pathsToTry.push(decodedBasename);
  }

  for (const tryPath of pathsToTry) {
    if (tryPath && resourceUrls.has(tryPath)) return resourceUrls.get(tryPath)!;
  }

  const finalBasename = normalizedPath.split("/").pop() || "";
  for (const [resourcePath, blobUrl] of resourceUrls.entries()) {
    if (finalBasename && finalBasename === resourcePath.split("/").pop()) {
      return blobUrl;
    }
  }

  return null;
}

function rewriteCssUrls(cssContent: string, resourceUrls: Map<string, string>): string {
  return cssContent.replace(/url\(['"]?([^'")\s]+)['"]?\)/gi, (match, url) => {
    const blobUrl = findResourceUrl(url, resourceUrls);
    return blobUrl ? `url("${blobUrl}")` : match;
  });
}

function rewriteResourcePaths(htmlContent: string, resourceUrls: Map<string, string>): Document {
  const parser = new DOMParser();
  if (!resourceUrls || resourceUrls.size === 0) {
    return parser.parseFromString("<html></html>", "text/html");
  }
  const doc = parser.parseFromString(htmlContent, "text/html");

  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src) {
      const blobUrl = findResourceUrl(src, resourceUrls);
      if (blobUrl) img.setAttribute("src", blobUrl);
    }
  });

  doc.querySelectorAll("image").forEach((img) => {
    const src = img.getAttribute("xlink:href");
    if (src) {
      const blobUrl = findResourceUrl(src, resourceUrls);
      if (blobUrl) img.setAttribute("xlink:href", blobUrl);
    }
  });

  doc.querySelectorAll("link[rel='stylesheet']").forEach((link) => {
    const href = link.getAttribute("href");
    if (href) {
      const blobUrl = findResourceUrl(href, resourceUrls);
      if (blobUrl) link.setAttribute("href", blobUrl);
    }
  });

  doc.querySelectorAll("*[style]").forEach((el) => {
    const style = el.getAttribute("style");
    if (style && (style.includes("url(") || style.includes("background"))) {
      const rewritten = rewriteCssUrls(style, resourceUrls);
      if (rewritten !== style) el.setAttribute("style", rewritten);
    }
  });

  doc.querySelectorAll("style").forEach((styleEl) => {
    const cssContent = styleEl.textContent;
    if (cssContent) {
      const rewritten = rewriteCssUrls(cssContent, resourceUrls);
      if (rewritten !== cssContent) styleEl.textContent = rewritten;
    }
  });

  return doc;
}

export interface ResolvedChapter {
  html: string;
  resources: HTMLElement[];
}

export async function processChapterHtml(
  rawHtml: string,
  bookId: string,
  chapterId: string,
  resourceUrls: Map<string, string> | undefined,
): Promise<string> {
  let html: string;

  if (resourceUrls && resourceUrls.size > 0) {
    const doc = rewriteResourcePaths(rawHtml, resourceUrls);
    html = doc.body.innerHTML;
  } else {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    html = doc.body.innerHTML;
  }

  try {
    html = await applyContentTransformers(html, { bookId, chapterId });
  } catch {
    // Return un-transformed content on error
  }

  return html;
}

export async function resolveChapterResources(
  rawHtml: string,
  rawData: ArrayBuffer | undefined,
  parser: BookParser,
  resourceUrls: Map<string, string>,
): Promise<ResolvedChapter> {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");

  const resourcePaths = collectResourcePaths(doc);
  if (resourcePaths.length > 0) {
    await resolveMissingResources(rawData, resourcePaths, resourceUrls, parser);
  }

  if (resourceUrls.size > 0) {
    const rewrittenDoc = rewriteResourcePaths(rawHtml, resourceUrls);

    const resources: HTMLElement[] = [];
    for (const element of Array.from(rewrittenDoc.head.children)) {
      resources.push(element.cloneNode(true) as HTMLElement);
    }

    return { html: rewrittenDoc.body.innerHTML, resources };
  }

  return { html: doc.body.innerHTML, resources: [] };
}
