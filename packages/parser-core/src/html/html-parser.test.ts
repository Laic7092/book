// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { HtmlParser } from "./html-parser";

function makeFile(content: string, name = "book.html"): File {
  return new File([content], name, { type: "text/html" });
}

const parser = new HtmlParser();

describe("HtmlParser", () => {
  it("treats a page without headings as a single chapter", async () => {
    const result = await parser.parse(
      makeFile(
        "<!DOCTYPE html><html><head><title>我的书</title></head><body><p>正文</p></body></html>",
      ),
    );
    expect(result.title).toBe("我的书");
    expect(result.chapters.length).toBe(1);
    expect(result.chapters[0].title).toBe("我的书");
    expect(result.content.get(result.chapters[0].id)).toContain("<p>正文</p>");
  });

  it("splits chapters on headings, keeping pre-heading content as an intro chapter", async () => {
    const html = `<html><head><title>T</title></head><body>
      <p>前言</p>
      <h1>第一章</h1><p>内容一</p>
      <h2>第二章</h2><p>内容二</p>
    </body></html>`;
    const result = await parser.parse(makeFile(html));
    expect(result.chapters.map((c) => c.title)).toEqual(["T", "第一章", "第二章"]);
    expect(result.content.get(result.chapters[0].id)).toContain("<p>前言</p>");
    // Each chapter keeps its own heading element
    expect(result.content.get(result.chapters[1].id)).toContain("<h1>第一章</h1>");
    expect(result.content.get(result.chapters[1].id)).toContain("<p>内容一</p>");
    expect(result.content.get(result.chapters[2].id)).toContain("<p>内容二</p>");
  });

  it("falls back to the filename when there is no title tag", async () => {
    const result = await parser.parse(makeFile("<html><body><p>x</p></body></html>", "无名.html"));
    expect(result.title).toBe("无名");
    expect(result.chapters[0].title).toBe("无名");
  });
});
