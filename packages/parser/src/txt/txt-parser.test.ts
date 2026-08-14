import { describe, it, expect } from "vite-plus/test";
import { TxtParser } from "./txt-parser";

// The vitest node environment lacks FileReader (Node 24 has it globally, but
// vitest's environment shadows it). Polyfill the one method readAsArrayBuffer
// uses, backed by File.arrayBuffer().
(globalThis as { FileReader?: unknown }).FileReader = class {
  result: ArrayBuffer | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: ((err: Error) => void) | null = null;

  readAsArrayBuffer(file: File): void {
    file.arrayBuffer().then(
      (buf) => {
        this.result = buf;
        this.onload?.();
      },
      (err) => {
        this.error = err;
        this.onerror?.(err);
      },
    );
  }
};

function makeFile(content: string, name = "book.txt"): File {
  return new File([content], name, { type: "text/plain" });
}

/** Body text between two markers must exceed MARKER_DEDUPLICATION_THRESHOLD
 * (30 chars) or the nearby markers collapse into one. */
const FILLER = "这是一段用于拉开章节间距的正文内容。".repeat(4);

const parser = new TxtParser();

describe("TxtParser", () => {
  it("parses plain text without markers as a single book-titled chapter", async () => {
    const result = await parser.parse(makeFile("第一段内容。\n\n第二段内容。"));
    expect(result.title).toBe("book");
    expect(result.chapters.length).toBe(1);
    expect(result.chapters[0].title).toBe("book");
    expect(result.content.get(result.chapters[0].id)).toContain("<p>第一段内容。</p>");
    expect(result.content.get(result.chapters[0].id)).toContain("<p>第二段内容。</p>");
  });

  it("splits by Chinese chapter markers", async () => {
    const content = `第一章 开头\n\n${FILLER}\n\n第二章 发展\n\n${FILLER}`;
    const result = await parser.parse(makeFile(content));
    expect(result.chapters.map((c) => c.title)).toEqual(["第一章 开头", "第二章 发展"]);
    expect(result.content.get(result.chapters[0].id)).toContain("<p>这是");
    // The title line itself is stripped from the body (it lives in the h2 only)
    expect(result.content.get(result.chapters[0].id)).not.toContain("<p>第一章");
  });

  it("recognizes special markers (楔子/序章/尾声)", async () => {
    const content = `楔子\n\n${FILLER}\n\n第一章 正篇\n\n${FILLER}`;
    const result = await parser.parse(makeFile(content));
    expect(result.chapters.map((c) => c.title)).toEqual(["楔子", "第一章 正篇"]);
  });

  it("recognizes markdown headings", async () => {
    const content = `# 第一章\n\n${FILLER}\n\n## 小节\n\n${FILLER}`;
    const result = await parser.parse(makeFile(content));
    expect(result.chapters.map((c) => c.title)).toEqual(["# 第一章", "## 小节"]);
  });

  it("recognizes English chapter markers", async () => {
    const content = `Chapter 1\nThe beginning.\n\n${FILLER}\n\nChapter 2\nThe middle.`;
    const result = await parser.parse(makeFile(content));
    expect(result.chapters.map((c) => c.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("keeps text before the first marker as an intro chapter titled by the book", async () => {
    const content = `前言简介文字\n\n第一章 故事\n\n${FILLER}`;
    const result = await parser.parse(makeFile(content, "我的书.txt"));
    expect(result.chapters.map((c) => c.title)).toEqual(["我的书", "第一章 故事"]);
    expect(result.content.get(result.chapters[0].id)).toContain("前言简介文字");
  });

  it("normalizes CRLF and CR line endings", async () => {
    const content = `第一章 A\r\n${FILLER}\r\n\r\n第二章 B\r\n${FILLER}`;
    const result = await parser.parse(makeFile(content));
    expect(result.chapters.map((c) => c.title)).toEqual(["第一章 A", "第二章 B"]);
  });

  it("deduplicates nearby markers keeping the higher score", async () => {
    // 数字列表(60 分)紧跟标准章节(100 分),距离 < 30 字符应被合并
    const content = "第一章 主线\n1. 子项\n\n正文";
    const result = await parser.parse(makeFile(content));
    expect(result.chapters.map((c) => c.title)).toEqual(["第一章 主线"]);
  });

  it("splits oversized chapters into numbered sub-chapters", async () => {
    // 700 paragraphs > 2 × PARAGRAPHS_PER_CHUNK(320), so the chapter is chunked
    const paragraphs = Array.from({ length: 700 }, (_, i) => `段落 ${i}`);
    const result = await parser.parse(makeFile(`第一章 长章\n\n${paragraphs.join("\n\n")}`));
    const titles = result.chapters.map((c) => c.title);
    expect(titles).toEqual(["第一章 长章（1/3）", "第一章 长章（2/3）", "第一章 长章（3/3）"]);
    expect(result.chapters.every((c) => result.content.has(c.id))).toBe(true);
  });

  it("escapes HTML in chapter content", async () => {
    const result = await parser.parse(makeFile(`第一章\n\n<script>alert("x")</script>`));
    const html = result.content.get(result.chapters[0].id)!;
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("derives the title from the filename without extension", async () => {
    const result = await parser.parse(makeFile("正文", "我的小说.txt"));
    expect(result.title).toBe("我的小说");
  });

  it("rejects files over the size limit", async () => {
    const file = makeFile("正文");
    Object.defineProperty(file, "size", { value: 100 * 1024 * 1024 + 1 });
    await expect(parser.parse(file)).rejects.toThrow(/exceeds maximum allowed size/);
  });
});
