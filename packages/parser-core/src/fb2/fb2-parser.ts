import { BaseBookParser, generateId } from "../base";
import type { BookParser, ParserResult, ChapterData } from "../types";

export class Fb2Parser extends BaseBookParser implements BookParser {
  private static readonly SUPPORTED_MIME_TYPES = [
    "application/x-fictionbook+xml",
    "application/x-fictionbook",
    "text/xml",
  ];

  readonly format = "fb2";

  supportsFormat(mimeType: string): boolean {
    return Fb2Parser.SUPPORTED_MIME_TYPES.includes(mimeType);
  }

  async parse(file: File): Promise<ParserResult> {
    const rawContent = await this.readAsText(file);
    const xmlDoc = new DOMParser().parseFromString(rawContent, "application/xml");

    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) throw new Error("FB2 XML parse error");

    const root = xmlDoc.documentElement;
    const desc =
      root.querySelector("description > title-info") ?? root.querySelector("description");

    const title =
      Fb2Parser.getTextContent(desc, "book-title") ||
      file.name.replace(/\.fb2$/i, "") ||
      "Untitled";
    const author =
      [
        Fb2Parser.getTextContent(desc, "author > firstName"),
        Fb2Parser.getTextContent(desc, "author > lastName"),
      ]
        .filter(Boolean)
        .join(" ") || "Unknown Author";
    const bookId = generateId("book");

    // Extract binary resources (base64-encoded images)
    const binaries = new Map<string, string>();
    for (const bin of root.querySelectorAll("binary")) {
      const id = bin.getAttribute("id");
      const contentType = bin.getAttribute("content-type") || "image/jpeg";
      if (id && bin.textContent) {
        binaries.set(id, `data:${contentType};base64,${bin.textContent.replace(/\s/g, "")}`);
      }
    }

    // Convert resources to ArrayBuffer for the resource map
    const resources = new Map<string, ArrayBuffer>();
    for (const [id, dataUri] of binaries) {
      const response = await fetch(dataUri);
      const buf = await response.arrayBuffer();
      resources.set(id, buf);
    }

    // Extract cover from first binary that looks like an image
    let coverUrl: string | undefined;
    if (binaries.size > 0) {
      const firstBinId = binaries.keys().next().value;
      if (firstBinId) coverUrl = firstBinId;
    }

    // Build chapters from <body> <section> elements
    const body = root.querySelector("body");
    const sections = body ? Array.from(body.children).filter((el) => el.tagName === "section") : [];
    const content = new Map<string, string>();
    const chapters: ChapterData[] = [];

    if (sections.length === 0 && body) {
      // No sections — treat entire body as one chapter
      const id = generateId("ch");
      const html = Fb2Parser.sectionToHtml(body as Element, binaries);
      content.set(id, html);
      chapters.push({ id, title, order: 0 });
    }

    for (const section of sections) {
      const id = generateId("ch");
      const titleEl = section.querySelector("title");
      const chapterTitle = titleEl
        ? Fb2Parser.getElementText(titleEl)
        : `Chapter ${chapters.length + 1}`;
      const html = Fb2Parser.sectionToHtml(section, binaries);
      content.set(id, html);
      chapters.push({ id, title: chapterTitle, order: chapters.length });
    }

    return {
      id: bookId,
      title,
      author,
      coverUrl,
      chapters,
      content,
      resources: resources.size > 0 ? resources : undefined,
    };
  }

  async extractChapterContent(
    rawData: ArrayBuffer,
    chapter: { id: string; href?: string },
  ): Promise<string | undefined> {
    if (!chapter.href) return undefined;
    try {
      const decoder = new TextDecoder();
      const xml = decoder.decode(rawData);
      const xmlDoc = new DOMParser().parseFromString(xml, "application/xml");

      const binaries = new Map<string, string>();
      for (const bin of xmlDoc.querySelectorAll("binary")) {
        const id = bin.getAttribute("id");
        const ct = bin.getAttribute("content-type") || "image/jpeg";
        if (id && bin.textContent) {
          binaries.set(id, `data:${ct};base64,${bin.textContent.replace(/\s/g, "")}`);
        }
      }

      // href is the chapter id — find section by order
      const sections = Array.from(xmlDoc.querySelectorAll("section"));
      const idx = parseInt(chapter.href, 10);
      const section = sections[idx];
      if (!section) return undefined;

      return Fb2Parser.sectionToHtml(section, binaries);
    } catch {
      return undefined;
    }
  }

  async extractResource(rawData: ArrayBuffer, path: string): Promise<ArrayBuffer | undefined> {
    try {
      const decoder = new TextDecoder();
      const xml = decoder.decode(rawData);
      const xmlDoc = new DOMParser().parseFromString(xml, "application/xml");
      const bin = xmlDoc.querySelector(`binary[id="${path}"]`);
      if (bin?.textContent) {
        const ct = bin.getAttribute("content-type") || "image/jpeg";
        const dataUri = `data:${ct};base64,${bin.textContent.replace(/\s/g, "")}`;
        const response = await fetch(dataUri);
        return response.arrayBuffer();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // ── Helpers ──

  private static getTextContent(parent: Element | null, selector: string): string {
    if (!parent) return "";
    const el = parent.querySelector(selector);
    return el?.textContent?.trim() ?? "";
  }

  private static getElementText(el: Element): string {
    return Array.from(el.querySelectorAll("p"))
      .map((p) => p.textContent?.trim() || "")
      .filter(Boolean)
      .join(" ");
  }

  /** Convert an FB2 element (section or body) to clean HTML. */
  private static sectionToHtml(section: Element, binaries: Map<string, string>): string {
    const parts: string[] = [];
    for (const node of Array.from(section.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        switch (tag) {
          case "title": {
            const text = Fb2Parser.getElementText(el);
            if (text) parts.push(`<h2>${Fb2Parser.escapeHtml(text)}</h2>`);
            break;
          }
          case "subtitle": {
            const text = el.textContent?.trim();
            if (text) parts.push(`<h3>${Fb2Parser.escapeHtml(text)}</h3>`);
            break;
          }
          case "p":
            parts.push(`<p>${Fb2Parser.convertInline(el, binaries)}</p>`);
            break;
          case "poem": {
            const stanza = el.querySelector("stanza");
            if (stanza) {
              const lines = Array.from(stanza.querySelectorAll("v"))
                .map((v) => v.textContent?.trim() || "")
                .filter(Boolean);
              parts.push(`<blockquote>${lines.map((l) => l).join("<br>")}</blockquote>`);
            }
            break;
          }
          case "epigraph":
            parts.push(`<blockquote>${Fb2Parser.convertInline(el, binaries)}</blockquote>`);
            break;
          case "section":
            // Nested section — handled by parent recursion
            break;
          case "image": {
            const href = el.getAttribute("l:href") || el.getAttribute("href");
            if (href) {
              const id = href.replace(/^#/, "");
              const dataUri = binaries.get(id);
              if (dataUri) {
                parts.push(`<img src="${dataUri}" alt="" style="max-width:100%">`);
              }
            }
            break;
          }
          case "empty-line":
            parts.push("<br>");
            break;
          case "annotation": {
            const text = el.textContent?.trim();
            if (text) parts.push(`<blockquote>${Fb2Parser.escapeHtml(text)}</blockquote>`);
            break;
          }
          default:
            // Unhandled elements — extract text content
            const text = el.textContent?.trim();
            if (text) parts.push(`<p>${Fb2Parser.escapeHtml(text)}</p>`);
        }
      }
    }
    return `<html><body>${parts.join("\n")}</body></html>`;
  }

  private static convertInline(el: Element, binaries: Map<string, string>): string {
    let html = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        html += Fb2Parser.escapeHtml(node.textContent ?? "");
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element;
        const tag = child.tagName.toLowerCase();
        switch (tag) {
          case "strong":
          case "b":
            html += `<strong>${Fb2Parser.convertInline(child, binaries)}</strong>`;
            break;
          case "emphasis":
          case "i":
            html += `<em>${Fb2Parser.convertInline(child, binaries)}</em>`;
            break;
          case "style":
            // FB2 style element (e.g., font styling) — pass text through
            html += Fb2Parser.convertInline(child, binaries);
            break;
          case "a":
            html += `<a href="${child.getAttribute("href") || "#"}">${Fb2Parser.convertInline(child, binaries)}</a>`;
            break;
          case "image": {
            const href = child.getAttribute("l:href") || child.getAttribute("href");
            if (href) {
              const id = href.replace(/^#/, "");
              const dataUri = binaries.get(id);
              if (dataUri) html += `<img src="${dataUri}" alt="" style="max-width:100%">`;
            }
            break;
          }
          case "sup":
            html += `<sup>${Fb2Parser.convertInline(child, binaries)}</sup>`;
            break;
          case "sub":
            html += `<sub>${Fb2Parser.convertInline(child, binaries)}</sub>`;
            break;
          case "code":
            html += `<code>${Fb2Parser.convertInline(child, binaries)}</code>`;
            break;
          case "strikethrough":
            html += `<del>${Fb2Parser.convertInline(child, binaries)}</del>`;
            break;
          default:
            html += Fb2Parser.convertInline(child, binaries);
        }
      }
    }
    return html;
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
