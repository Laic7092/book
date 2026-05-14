/**
 * OPDS Atom XML feed parser.
 *
 * Extracts both navigation links (sub-catalogs) and book entries
 * from an OPDS 1.x / 2.0 catalog feed.
 */

export interface OpdsNavLink {
  title: string;
  href: string;
}

export interface DownloadFormat {
  url: string;
  type: string;
  label: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  /** First acquisition link (backwards compat). */
  downloadUrl?: string;
  format?: string;
  /** All acquisition links, one per available format. */
  formats: DownloadFormat[];
}

export interface OpdsPagination {
  next?: string;
  previous?: string;
  first?: string;
  last?: string;
}

export interface OpdsFeed {
  title: string;
  totalResults?: number;
  /** Sub-catalog navigation links (from <link rel="subsection"> at feed level). */
  navLinks: OpdsNavLink[];
  /** Book entries (entries with acquisition links). */
  entries: OpdsEntry[];
  /** Pagination links for multi-page catalogs. */
  pagination: OpdsPagination;
}

const ATOM_NS = "http://www.w3.org/2005/Atom";

function getText(el: Element | null, tag: string): string {
  const child = el?.getElementsByTagNameNS?.(ATOM_NS, tag)?.[0];
  return child?.textContent?.trim() || "";
}

/** Resolve a possibly-relative href against a base URL. */
function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export function parseOpdsFeed(xml: string, baseUrl: string): OpdsFeed {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) {
    throw new Error(`OPDS parse error: ${err.textContent?.slice(0, 200)}`);
  }

  const feedTitle = getText(doc.querySelector("feed"), "title") || "OPDS Catalog";

  // Total results — search feed-level children by namespace-aware tag name to
  // avoid CSS selector escaping issues (opds:totalResults with colon).
  let totalResults: number | undefined;
  const feedEl = doc.querySelector("feed");
  if (feedEl) {
    for (const child of feedEl.children) {
      if (child.localName === "totalResults" && child.namespaceURI?.includes("opds-spec")) {
        totalResults = parseInt(child.textContent || "", 10) || undefined;
        break;
      }
    }
    if (totalResults === undefined) {
      const link = feedEl.querySelector('link[rel*="totalResults"]');
      if (link) {
        totalResults =
          parseInt(link.getAttribute("title") || "", 10) ||
          parseInt(link.getAttribute("count") || "", 10) ||
          undefined;
      }
    }
  }

  // Feed-level nav links (<link rel="subsection">, <link rel="subcollection">)
  const navLinks: OpdsNavLink[] = [];
  const pagination: OpdsPagination = {};
  if (feedEl) {
    const feedLinks = feedEl.querySelectorAll(":scope > link");
    for (const link of feedLinks) {
      const rel = link.getAttribute("rel") || "";
      const href = link.getAttribute("href");
      const title = link.getAttribute("title") || "Untitled";
      if (!href) continue;
      if (rel.includes("subsection") || rel.includes("subcollection")) {
        navLinks.push({ title, href: resolveUrl(href, baseUrl) });
      } else if (rel === "next") {
        pagination.next = resolveUrl(href, baseUrl);
      } else if (rel === "previous") {
        pagination.previous = resolveUrl(href, baseUrl);
      } else if (rel === "first") {
        pagination.first = resolveUrl(href, baseUrl);
      } else if (rel === "last") {
        pagination.last = resolveUrl(href, baseUrl);
      }
    }
  }

  // Parse entries
  const entries: OpdsEntry[] = [];
  const entryNodes = doc.querySelectorAll("entry") as NodeListOf<Element>;

  for (const entry of entryNodes) {
    const title = getText(entry, "title");
    const author = getText(entry, "author") || getText(entry, "name");
    const id = getText(entry, "id") || title;

    // Collect all links and classify the entry.
    const allLinks = entry.querySelectorAll("link");
    let isNavEntry = false;
    let navHref = "";
    const acquLinks: Element[] = [];
    const coverLink = entry.querySelector('link[rel*="opds-spec.org/image"], link[rel*="image"]');

    for (const link of allLinks) {
      const rel = link.getAttribute("rel") || "";
      const type = link.getAttribute("type") || "";
      const href = link.getAttribute("href");
      if (!href) continue;

      // Navigation: subsection, subcollection, or any catalog link (atom+xml)
      if (
        rel.includes("subsection") ||
        rel.includes("subcollection") ||
        type.includes("atom+xml")
      ) {
        isNavEntry = true;
        navHref = href;
      }
      // Acquisition: ebook format links (not catalog feed links)
      if (rel.includes("acquisition") && !type.includes("atom+xml")) {
        acquLinks.push(link);
      }
    }

    if (isNavEntry && !acquLinks.length) {
      if (navHref) {
        navLinks.push({ title: title || "Untitled", href: resolveUrl(navHref, baseUrl) });
      }
      continue; // Pure navigation entry
    }

    // Build format list from all acquisition links
    const formats: DownloadFormat[] = acquLinks.map((l) => ({
      url: resolveUrl(l.getAttribute("href")!, baseUrl),
      type: l.getAttribute("type") || "",
      label:
        l.getAttribute("title") ||
        l.getAttribute("type")?.split("/")[1]?.toUpperCase() ||
        "Download",
    }));

    const firstAcqu = acquLinks[0];

    entries.push({
      id: id || title || "Unknown",
      title: title || "Untitled",
      author: author || "Unknown",
      coverUrl: coverLink?.getAttribute("href")
        ? resolveUrl(coverLink.getAttribute("href")!, baseUrl)
        : undefined,
      downloadUrl: firstAcqu?.getAttribute("href")
        ? resolveUrl(firstAcqu.getAttribute("href")!, baseUrl)
        : undefined,
      format: firstAcqu?.getAttribute("type") || undefined,
      formats,
    });
  }

  return { title: feedTitle, totalResults, navLinks, entries, pagination };
}
