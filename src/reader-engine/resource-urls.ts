// Utility for rewriting resource paths in HTML content using blob URLs

/**
 * Rewrite resource paths in HTML content to use blob URLs
 * Called at render time with the current resourceUrls mapping
 */
export function rewriteResourcePaths(
  htmlContent: string,
  resourceUrls: Map<string, string>,
): Document {
  // Parse the HTML - use text/html to handle HTML fragments properly
  const parser = new DOMParser();

  if (!resourceUrls || resourceUrls.size === 0) {
    return parser.parseFromString(`<html></html>`, "text/html");
  }
  const doc = parser.parseFromString(htmlContent, "text/html");

  // Rewrite img src attributes
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src) {
      const blobUrl = findResourceUrl(src, resourceUrls);
      if (blobUrl) {
        img.setAttribute("src", blobUrl);
      }
    }
  });

  doc.querySelectorAll("image").forEach((img) => {
    const src = img.getAttribute("xlink:href");
    if (src) {
      const blobUrl = findResourceUrl(src, resourceUrls);
      if (blobUrl) {
        img.setAttribute("xlink:href", blobUrl);
      }
    }
  });

  // Rewrite link href for CSS stylesheets
  doc.querySelectorAll("link[rel='stylesheet']").forEach((link) => {
    const href = link.getAttribute("href");
    if (href) {
      const blobUrl = findResourceUrl(href, resourceUrls);
      if (blobUrl) {
        link.setAttribute("href", blobUrl);
      }
    }
  });

  // Rewrite background/image URLs in inline styles
  doc.querySelectorAll("*[style]").forEach((el) => {
    const style = el.getAttribute("style");
    if (style && (style.includes("url(") || style.includes("background"))) {
      const rewrittenStyle = rewriteCssUrls(style, resourceUrls);
      if (rewrittenStyle !== style) {
        el.setAttribute("style", rewrittenStyle);
      }
    }
  });

  // Handle embedded CSS in style elements
  doc.querySelectorAll("style").forEach((styleEl) => {
    const cssContent = styleEl.textContent;
    if (cssContent) {
      const rewrittenCss = rewriteCssUrls(cssContent, resourceUrls);
      if (rewrittenCss !== cssContent) {
        styleEl.textContent = rewrittenCss;
      }
    }
  });

  // Return the body innerHTML to preserve fragment structure
  // This strips the auto-added html/head/body wrapper tags
  return doc;
}

/**
 * Find a blob URL for a resource path
 * Tries multiple path variations to handle relative paths in EPUBs
 */
function findResourceUrl(path: string, resourceUrls: Map<string, string>): string | null {
  // Normalize the path - remove leading slashes, fragments, and query strings
  const normalizedPath = path.replace(/^\//, "").split("#")[0].split("?")[0];

  // Decode URI component to handle encoded paths
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(normalizedPath);
  } catch {
    decodedPath = normalizedPath;
  }

  // Build a list of all possible path variations to try
  const pathsToTry: string[] = [];

  // Original and normalized
  pathsToTry.push(path);
  pathsToTry.push(normalizedPath);
  pathsToTry.push(decodedPath);

  // Decode normalized
  if (decodedPath !== normalizedPath) {
    pathsToTry.push(decodedPath);
  }

  // Basename variations (for resources referenced by filename only)
  const basename = normalizedPath.split("/").pop();
  if (basename && basename !== normalizedPath) {
    pathsToTry.push(basename);
    try {
      const decodedBasename = decodeURIComponent(basename);
      if (decodedBasename !== basename) {
        pathsToTry.push(decodedBasename);
      }
    } catch {
      // ignore
    }
  }

  // Also try with decoded full path's basename
  const decodedBasename = decodedPath.split("/").pop();
  if (decodedBasename && decodedBasename !== decodedPath) {
    pathsToTry.push(decodedBasename);
  }

  // Try each variation
  for (const tryPath of pathsToTry) {
    if (tryPath && resourceUrls.has(tryPath)) {
      return resourceUrls.get(tryPath)!;
    }
  }

  // Last resort: try to match by basename against all resource URLs
  const finalBasename = normalizedPath.split("/").pop() || "";
  for (const [resourcePath, blobUrl] of resourceUrls.entries()) {
    const resourceBasename = resourcePath.split("/").pop() || "";
    if (finalBasename && finalBasename === resourceBasename) {
      return blobUrl;
    }
  }

  return null;
}

/**
 * Rewrite CSS url() references to use blob URLs
 */
function rewriteCssUrls(cssContent: string, resourceUrls: Map<string, string>): string {
  const urlPattern = /url\(['"]?([^'")\s]+)['"]?\)/gi;

  return cssContent.replace(urlPattern, (match, url) => {
    const blobUrl = findResourceUrl(url, resourceUrls);
    if (blobUrl) {
      return `url("${blobUrl}")`;
    }
    return match;
  });
}
