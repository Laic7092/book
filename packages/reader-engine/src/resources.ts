import { getMimeType } from "@book/parser-core";
import type { BookParser } from "@book/parser-core";

export interface ResourceInfo {
  id: string;
  type: "style" | "link";
  content: string;
  element?: HTMLElement;
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function generateResourceId(element: HTMLElement): string {
  if (element instanceof HTMLStyleElement) {
    const content = element.textContent || "";
    return `style-${hashCode(content)}`;
  }
  if (element instanceof HTMLLinkElement) {
    return `link-${element.href}`;
  }
  const tag = element.tagName.toLowerCase();
  const attrs = Array.from(element.attributes)
    .map((attr) => `${attr.name}=${attr.value}`)
    .join(",");
  return `${tag}-${hashCode(attrs)}`;
}

export function injectResources(
  doc: Document,
  elements: HTMLElement[],
  injectedResources: Map<string, ResourceInfo>,
  styleTagId = "resource-style",
  dynamicAttrName = "data-resource-dynamic",
): void {
  const newResources = new Map<string, ResourceInfo>();
  for (const el of elements) {
    const resourceId = generateResourceId(el);
    if (el instanceof HTMLStyleElement) {
      const cssContent = el.textContent || "";
      if (cssContent) {
        newResources.set(resourceId, { id: resourceId, type: "style", content: cssContent });
      }
    } else if (el instanceof HTMLLinkElement && el.rel === "stylesheet") {
      newResources.set(resourceId, { id: resourceId, type: "link", content: el.href });
    }
  }

  const oldResourceIds = new Set(injectedResources.keys());
  const newResourceIds = new Set(newResources.keys());
  const toRemove = [...oldResourceIds].filter((id) => !newResourceIds.has(id));
  const toAdd = [...newResourceIds].filter((id) => !oldResourceIds.has(id));
  const toUpdate = [...newResourceIds].filter((id) => {
    if (!oldResourceIds.has(id)) return false;
    const oldInfo = injectedResources.get(id);
    const newInfo = newResources.get(id);
    return oldInfo && newInfo && oldInfo.content !== newInfo.content;
  });

  for (const id of toRemove) {
    const resourceInfo = injectedResources.get(id);
    if (resourceInfo?.element) resourceInfo.element.remove();
    injectedResources.delete(id);
  }

  const newLinkElements: HTMLLinkElement[] = [];

  for (const id of toUpdate) {
    const newInfo = newResources.get(id);
    const oldInfo = injectedResources.get(id);
    if (!newInfo || !oldInfo) continue;
    if (newInfo.type === "style") {
      if (oldInfo.element) oldInfo.element.remove();
      const styleEl = doc.createElement("style");
      styleEl.textContent = newInfo.content;
      styleEl.setAttribute(dynamicAttrName, "true");
      newInfo.element = styleEl;
    } else if (newInfo.type === "link") {
      if (oldInfo.element) oldInfo.element.remove();
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = newInfo.content;
      link.setAttribute(dynamicAttrName, "true");
      newLinkElements.push(link);
      newInfo.element = link;
    }
    injectedResources.set(id, newInfo);
  }

  for (const id of toAdd) {
    const resourceInfo = newResources.get(id);
    if (!resourceInfo) continue;
    if (resourceInfo.type === "style") {
      const styleEl = doc.createElement("style");
      styleEl.textContent = resourceInfo.content;
      styleEl.setAttribute(dynamicAttrName, "true");
      resourceInfo.element = styleEl;
    } else if (resourceInfo.type === "link") {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = resourceInfo.content;
      link.setAttribute(dynamicAttrName, "true");
      newLinkElements.push(link);
      resourceInfo.element = link;
    }
    injectedResources.set(id, resourceInfo);
  }

  const allCssParts: string[] = [];
  for (const [, info] of injectedResources.entries()) {
    if (info.type === "style") allCssParts.push(info.content);
  }
  const cssText = allCssParts.join("\n");
  const styleTag = doc.getElementById(styleTagId);
  if (styleTag) {
    styleTag.textContent = cssText;
  } else if (cssText) {
    const tag = doc.createElement("style");
    tag.id = styleTagId;
    tag.setAttribute(dynamicAttrName, "true");
    tag.textContent = cssText;
    doc.head.appendChild(tag);
  }

  for (const link of newLinkElements) {
    doc.head.appendChild(link);
  }
}

export function clearResources(
  doc: Document,
  injectedResources: Map<string, ResourceInfo>,
  styleTagId = "resource-style",
  dynamicAttrName = "data-resource-dynamic",
): void {
  const styleTag = doc.getElementById(styleTagId);
  if (styleTag) {
    // 动态创建的聚合标签直接移除;宿主自带的静态标签只清空内容
    if (styleTag.hasAttribute(dynamicAttrName)) styleTag.remove();
    else styleTag.textContent = "";
  }
  for (const [, info] of injectedResources.entries()) {
    if (info?.element) info.element.remove();
  }
  injectedResources.clear();
}

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
      for (const [, url] of style.matchAll(CSS_URL_PATTERN)) paths.add(url);
    }
  });
  doc.querySelectorAll("style").forEach((el) => {
    const css = el.textContent;
    if (css) {
      for (const [, url] of css.matchAll(CSS_URL_PATTERN)) paths.add(url);
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
      const mimeType = getMimeType(path);
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
  if (decodedBasename && decodedBasename !== decodedPath) pathsToTry.push(decodedBasename);
  for (const tryPath of pathsToTry) {
    if (tryPath && resourceUrls.has(tryPath)) return resourceUrls.get(tryPath)!;
  }
  const finalBasename = normalizedPath.split("/").pop() || "";
  for (const [resourcePath, blobUrl] of resourceUrls.entries()) {
    if (finalBasename && finalBasename === resourcePath.split("/").pop()) return blobUrl;
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
