import type { BookParser } from "../core/types";

const CSS_URL_PATTERN = /url\(['"]?([^'")\s]+)['"]?\)/gi;

// ── Path collection ──

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

// ── Blob URL resolution ──

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

// ── Path rewriting ──

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

  // Last resort: basename match against all resource keys
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

/**
 * Rewrite resource paths in HTML content to use blob URLs.
 */
export function rewriteResourcePaths(
  htmlContent: string,
  resourceUrls: Map<string, string>,
): Document {
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

// ── Public API ──

export interface ResolvedChapter {
  html: string;
  resources: HTMLElement[];
}

/**
 * Resolve format-specific resources in chapter HTML.
 * Collects resource paths → resolves to blob URLs → rewrites HTML → extracts head elements.
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
    for (const element of Array.from(rewrittenDoc.head.children)) {
      resources.push(element.cloneNode(true) as HTMLElement);
    }

    return { html: rewrittenDoc.body.innerHTML, resources };
  }

  return { html: doc.body.innerHTML, resources: [] };
}
