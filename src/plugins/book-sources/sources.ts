/**
 * Book source definitions — Legado-compatible format.
 * Supports persistence (imported sources stored in IndexedDB),
 * import from URL / file, and merging with built-in sources.
 */

import type { ServerClient } from "../../core/api";
import { STORES, dbPut, dbGetAll, dbDelete } from "../../storage/db";
import {
  parseSearchResults,
  parseBookInfo,
  parseChapterList,
  getChapterList,
  extractContent,
  type BookSearchItem,
  type BookChapter,
} from "../../utils/rule-parser";

// ── Types ──

export interface LegadoSource {
  bookSourceName: string;
  bookSourceUrl: string;
  bookSourceGroup?: string;
  bookSourceType?: number;
  searchUrl: string;
  ruleSearch: Record<string, string>;
  ruleBookInfo?: Record<string, string>;
  ruleToc: {
    chapterList: string;
    chapterName: string;
    chapterUrl: string;
    nextTocUrl?: string;
    [key: string]: unknown;
  };
  ruleContent: {
    content: string;
    nextContentUrl?: string;
    replaceRegex?: string;
    [key: string]: unknown;
  };
  exploreUrl?: string;
  ruleExplore?: Record<string, string>;
  loginUrl?: string;
  bookUrlPattern?: string;
  weight?: number;
  customOrder?: number;
  [key: string]: unknown; // allow other Legado fields
}

export interface SourceManager {
  /** All available sources (built-in + imported). */
  getAll(): LegadoSource[];
  /** Built-in sources only. */
  getBuiltIn(): LegadoSource[];
  /** Imported sources only. */
  getImported(): Promise<LegadoSource[]>;
  /** Persist a new source. */
  save(source: LegadoSource): Promise<void>;
  /** Remove an imported source. */
  remove(sourceUrl: string): Promise<void>;
  /** Fetch book source JSON from URL and persist all sources in it. */
  importFromUrl(url: string): Promise<LegadoSource[]>;
  /** Search across a specific source. */
  search(source: LegadoSource, keyword: string): Promise<BookSearchItem[]>;
  /** Get book info page. */
  getBookInfo(source: LegadoSource, bookUrl: string): Promise<Record<string, string>>;
  /** Get chapter list for a book. */
  getChapters(source: LegadoSource, bookUrl: string): Promise<BookChapter[]>;
  /** Get chapter content. */
  getChapterContent(source: LegadoSource, chapterUrl: string): Promise<string>;
}

// ── Persistence ──

const STORE_ID = "_book_sources";

interface PersistedSource {
  pluginId: string;
  key: string;
  value: LegadoSource;
  createdAt: number;
}

async function loadPersistedSources(): Promise<LegadoSource[]> {
  const all = await dbGetAll<PersistedSource>(STORES.PLUGIN_STORE);
  return all.filter((r) => r.pluginId === STORE_ID).map((r) => r.value);
}

async function persistSource(source: LegadoSource): Promise<void> {
  await dbPut(STORES.PLUGIN_STORE, {
    pluginId: STORE_ID,
    key: source.bookSourceUrl,
    value: source,
    createdAt: Date.now(),
  } as PersistedSource);
}

async function removePersistedSource(sourceUrl: string): Promise<void> {
  await dbDelete(STORES.PLUGIN_STORE, [STORE_ID, sourceUrl]);
}

// ── Built-in source ──

const BUILT_IN: LegadoSource[] = [
  {
    bookSourceName: "采墨阁手机版",
    bookSourceUrl: "https://m.caimoge.com",
    bookSourceGroup: "XPath; 正则",
    searchUrl: '/search.html,{\n  "method": "POST",\n  "body": "searchkey={{key}}"\n}',
    ruleSearch: {
      bookList: '//*[@id="sitebox"]/dl',
      name: "//h3/a/text()",
      author: "//dd[2]/text()",
      coverUrl: "//img/@src",
      bookUrl: "//dt/a/@href",
      kind: "//dd[2]/span/text()",
    },
    ruleBookInfo: {
      name: '//*[@property="og:novel:book_name"]/@content',
      author: '//*[@property="og:novel:author"]/@content',
      coverUrl: '//*[@property="og:image"]/@content',
      intro: '//*[@property="og:description"]/@content',
      kind: '//*[@property="og:novel:category"]/@content',
    },
    ruleToc: {
      chapterList: ':href="(/read[^"]*html)">([^<]*)',
      chapterName: "$2",
      chapterUrl: "$1",
    },
    ruleContent: {
      content: '//*[@id="content"]',
    },
  },
];

// ── Parse Legado URL format ──

interface RequestConfig {
  url: string;
  method: string;
  body?: string;
  charset?: string;
}

function parseLegadoUrl(raw: string): RequestConfig {
  raw = raw.trim();
  const commaIdx = raw.indexOf(",");
  if (commaIdx === -1) return { url: raw, method: "GET" };
  const url = raw.slice(0, commaIdx).trim();
  try {
    const opts = JSON.parse(raw.slice(commaIdx + 1));
    return {
      url,
      method: opts.method || "GET",
      body: opts.body || undefined,
      charset: opts.charset,
    };
  } catch {
    return { url: raw, method: "GET" };
  }
}

// ── Factory ──

export function createSourceManager(server: ServerClient): SourceManager {
  // Cache of loaded imported sources
  let importedCache: LegadoSource[] | null = null;

  async function getImported(): Promise<LegadoSource[]> {
    if (!importedCache) importedCache = await loadPersistedSources();
    return importedCache;
  }

  function invalidateCache(): void {
    importedCache = null;
  }

  async function fetchHtml(url: string, method = "GET", body?: string): Promise<string> {
    const init: RequestInit = { method };
    if (body) {
      init.body = body;
      init.headers = { "content-type": "application/x-www-form-urlencoded" };
    }
    const res = await server.net.fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
  }

  function resolveUrl(source: LegadoSource, path: string): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    if (path.startsWith("//")) return `https:${path}`;
    const base = source.bookSourceUrl.replace(/\/+$/, "");
    const clean = path.replace(/^\.\//, "/");
    return clean.startsWith("/") ? `${base}${clean}` : `${base}/${clean}`;
  }

  return {
    getAll() {
      return [...BUILT_IN, ...(importedCache ?? [])];
    },
    getBuiltIn() {
      return [...BUILT_IN];
    },
    async getImported() {
      return getImported();
    },

    async save(source: LegadoSource) {
      await persistSource(source);
      invalidateCache();
    },

    async remove(sourceUrl: string) {
      await removePersistedSource(sourceUrl);
      invalidateCache();
    },

    async importFromUrl(url: string): Promise<LegadoSource[]> {
      const res = await server.net.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      // Try JSON array first, then single object
      let sources: LegadoSource[];
      try {
        const parsed = JSON.parse(raw);
        sources = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        throw new Error("无效的书源 JSON 格式");
      }
      for (const src of sources) {
        await persistSource(src);
      }
      invalidateCache();
      return sources;
    },

    async search(source: LegadoSource, keyword: string): Promise<BookSearchItem[]> {
      const { url, method, body } = parseLegadoUrl(source.searchUrl);
      const finalUrl = url.replace("{{key}}", encodeURIComponent(keyword));
      const finalBody = body?.replace("{{key}}", keyword);
      const html = await fetchHtml(resolveUrl(source, finalUrl), method, finalBody);
      const results = parseSearchResults(html, source.ruleSearch);
      for (const item of results) {
        if (item.coverUrl) item.coverUrl = resolveUrl(source, item.coverUrl);
        item.bookUrl = resolveUrl(source, item.bookUrl);
      }
      return results;
    },

    async getBookInfo(source: LegadoSource, bookUrl: string): Promise<Record<string, string>> {
      if (!source.ruleBookInfo) return {};
      const html = await fetchHtml(bookUrl);
      const info = parseBookInfo(html, source.ruleBookInfo);
      if (info.coverUrl) info.coverUrl = resolveUrl(source, info.coverUrl);
      if (info.tocUrl) info.tocUrl = resolveUrl(source, info.tocUrl);
      return info;
    },

    async getChapters(source: LegadoSource, bookUrl: string): Promise<BookChapter[]> {
      const html = await fetchHtml(bookUrl);
      const listRule = source.ruleToc.chapterList;
      if (listRule.startsWith(":")) {
        const chapters = getChapterList(
          html,
          listRule,
          source.ruleToc.chapterName,
          source.ruleToc.chapterUrl,
        );
        for (const ch of chapters) ch.url = resolveUrl(source, ch.url);
        return chapters;
      }
      const chapters = parseChapterList(
        html,
        listRule,
        source.ruleToc.chapterName,
        source.ruleToc.chapterUrl,
      );
      for (const ch of chapters) ch.url = resolveUrl(source, ch.url);
      return chapters;
    },

    async getChapterContent(source: LegadoSource, chapterUrl: string): Promise<string> {
      const html = await fetchHtml(chapterUrl);
      let content = extractContent(html, source.ruleContent.content);
      if (!content) return "";

      // Apply replaceRegex if present (Legado-specific)
      if (source.ruleContent.replaceRegex) {
        const parts = source.ruleContent.replaceRegex.split("##");
        try {
          const pattern = parts[0] ? new RegExp(parts[0], "g") : null;
          const replacement = parts[1] ?? "";
          if (pattern) content = content.replace(pattern, replacement);
        } catch {
          /* ignore bad regex */
        }
      }

      // Standard HTML cleanup
      return content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/&nbsp;/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<p[^>]*>/gi, "\n")
        .replace(/<\/p>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&ldquo;/g, "\u201C")
        .replace(/&rdquo;/g, "\u201D")
        .replace(/&mdash;/g, "\u2014")
        .replace(/&[a-z]+;/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    },
  };
}
