/**
 * Book source definitions — Legado-compatible format.
 * Supports persistence (imported sources stored in IndexedDB),
 * import from URL / file, and merging with built-in sources.
 */

import type { ServerClient } from "../../utils/api";
import type { NetFetchInit } from "@book/contracts";
import type { PluginStorageAdapter } from "../../core/plugin-runtime/types";
import {
  parseSearchResults,
  parseBookInfo,
  parseChapterList,
  getChapterList,
  extractContent,
  type BookSearchItem,
  type BookChapter,
  querySingle,
} from "./rule-parser";

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

// ── Built-in source ──

const BUILT_IN: LegadoSource[] = [
  {
    bookSourceName: "顶点小说",
    bookSourceUrl: "http://www.xsbook.org/",
    bookSourceGroup: "XPath; 正则",
    searchUrl: "/search44.html?searchkey={{key}}",
    ruleSearch: {
      bookList: "//div[@class='l rank']/div[@class='item']",
      name: "//dt/a/text()",
      author: "//div[@class='btm']/a[1]/text()",
      coverUrl: "//div[@class='image']/img/@src",
      bookUrl: "//dt/a/@href",
      kind: "",
    },
    ruleBookInfo: {
      name: "//*[@property='og:novel:book_name']/@content",
      author: "//*[@property='og:novel:author']/@content",
      coverUrl: "//*[@property='og:image']/@content",
      intro: "//*[@property='og:description']/@content",
      kind: "//*[@property='og:novel:category']/@content",
    },
    ruleToc: {
      chapterList:
        "//div[@id='list']/dl/dt[contains(text(),'全部章节目录')]/following-sibling::a[@rel='chapter']",
      chapterName: "dd/text()",
      chapterUrl: "@href",
    },
    ruleContent: {
      content: "//div[@id='booktxt']",
      nextContentUrl: "//a[contains(text(),'下一页')]/@href",
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

export function createSourceManager(
  server: ServerClient,
  storage: PluginStorageAdapter,
): SourceManager {
  // Cache of loaded imported sources
  let importedCache: LegadoSource[] | null = null;

  async function getImported(): Promise<LegadoSource[]> {
    if (!importedCache) {
      importedCache = await storage.getAll<LegadoSource>();
    }
    return importedCache;
  }

  function invalidateCache(): void {
    importedCache = null;
  }

  async function fetchHtml(url: string, method = "GET", body?: string): Promise<string> {
    const init: NetFetchInit = { method };
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
      await storage.put(source.bookSourceUrl, source, Date.now());
      invalidateCache();
    },

    async remove(sourceUrl: string) {
      await storage.delete(sourceUrl);
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
        await storage.put(src.bookSourceUrl, src, Date.now());
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
      // 1. 解析当前的请求 URL 用于处理相对链接
      const currentFullUrl = resolveUrl(source, chapterUrl);

      // 2. 获取第一页
      let html = await fetchHtml(currentFullUrl);
      let content = extractContent(html, source.ruleContent.content);
      if (!content) return "";

      // 3. 分页拼装
      const nextUrlRule = source.ruleContent.nextContentUrl;
      if (nextUrlRule) {
        let nextUrl = querySingle(new DOMParser().parseFromString(html, "text/html"), nextUrlRule);

        // 防止无限循环，限制最多合并 50 页
        let pageCount = 1;
        const MAX_PAGES = 50;

        while (nextUrl && pageCount < MAX_PAGES) {
          // 将相对链接转为绝对链接
          const nextFullUrl = new URL(nextUrl, currentFullUrl).href;

          html = await fetchHtml(nextFullUrl);
          const nextContent = extractContent(html, source.ruleContent.content);
          if (nextContent) content += nextContent;

          nextUrl = querySingle(new DOMParser().parseFromString(html, "text/html"), nextUrlRule);
          pageCount++;
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
