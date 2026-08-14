// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EpubParser } from "./epub-parser";

const parser = new EpubParser();

const FIXTURE_DIR = join(process.cwd(), "packages/parser/src/epub/__fixtures__");

function loadFixture(name: string): File {
  const buf = readFileSync(join(FIXTURE_DIR, name));
  return new File([buf], name, { type: "application/epub+zip" });
}

describe("EpubParser", () => {
  it("parses a minimal EPUB: metadata, spine order and TOC titles", async () => {
    const result = await parser.parse(loadFixture("minimal.epub"));
    expect(result.title).toBe("测试书");
    expect(result.author).toBe("作者甲");
    expect(result.chapters.map((c) => c.title)).toEqual(["第一章", "第二章"]);
    expect(result.chapters.map((c) => c.href)).toEqual(["OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml"]);
    expect(result.chapters.map((c) => c.order)).toEqual([0, 1]);
    expect(result.coverUrl).toBe("cover.jpg");
  });

  it("throws when container.xml is missing", async () => {
    await expect(parser.parse(loadFixture("no-container.epub"))).rejects.toThrow(
      /Missing container\.xml/,
    );
  });

  it("throws when content.opf is missing", async () => {
    await expect(parser.parse(loadFixture("no-opf.epub"))).rejects.toThrow(/Missing content\.opf/);
  });

  it("extracts chapter content from the stored zip", async () => {
    const result = await parser.parse(loadFixture("minimal.epub"));
    expect(result.rawData).toBeDefined();

    const html = await parser.extractChapterContent(result.rawData!, {
      id: result.chapters[0].id,
      href: result.chapters[0].href,
    });
    expect(html).toContain("第一章的内容");
  });

  it("falls back to NCX navigation when no nav document exists", async () => {
    const result = await parser.parse(loadFixture("ncx-toc.epub"));
    expect(result.chapters.map((c) => c.title)).toEqual(["旧章一", "旧章二"]);
  });
});
