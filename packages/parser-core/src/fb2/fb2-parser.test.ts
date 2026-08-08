// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { Fb2Parser } from "./fb2-parser";

function makeFile(content: string, name = "book.fb2"): File {
  return new File([content], name, { type: "application/x-fictionbook+xml" });
}

const parser = new Fb2Parser();

const BASE = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<FictionBook>
  <description><title-info>
    <book-title>测试之书</book-title>
    <author><firstName>张</firstName><lastName>三</lastName></author>
  </title-info></description>
  ${body}
</FictionBook>`;

describe("Fb2Parser", () => {
  it("parses sections into chapters with metadata", async () => {
    const xml = BASE(`
      <body>
        <section><title><p>第一章</p></title><p>内容一</p></section>
        <section><title><p>第二章</p></title><p>内容二</p></section>
      </body>`);
    const result = await parser.parse(makeFile(xml));
    expect(result.title).toBe("测试之书");
    expect(result.author).toBe("张 三");
    expect(result.chapters.map((c) => c.title)).toEqual(["第一章", "第二章"]);
    expect(result.content.get(result.chapters[0].id)).toContain("<h2>第一章</h2>");
    expect(result.content.get(result.chapters[0].id)).toContain("<p>内容一</p>");
    expect(result.content.get(result.chapters[1].id)).toContain("<p>内容二</p>");
  });

  it("treats a body without sections as one book-titled chapter", async () => {
    const xml = BASE(`<body><p>整本书的内容</p></body>`);
    const result = await parser.parse(makeFile(xml));
    expect(result.chapters.length).toBe(1);
    expect(result.chapters[0].title).toBe("测试之书");
    expect(result.content.get(result.chapters[0].id)).toContain("<p>整本书的内容</p>");
  });

  it("converts inline formatting and poems", async () => {
    const xml = BASE(`
      <body>
        <section>
          <title><p>格式</p></title>
          <p>普通 <strong>加粗</strong> 与 <emphasis>斜体</emphasis></p>
          <poem><stanza><v>第一行</v><v>第二行</v></stanza></poem>
          <epigraph><p>引言</p></epigraph>
        </section>
      </body>`);
    const result = await parser.parse(makeFile(xml));
    const html = result.content.get(result.chapters[0].id)!;
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<blockquote>第一行<br>第二行</blockquote>");
    expect(html).toContain("<blockquote>引言</blockquote>");
  });

  it("re-escapes XML-escaped content when building HTML", async () => {
    // In XML, angle brackets in text must be entity-escaped; the parser decodes
    // them back to literal <script>, which must be escaped again in the HTML.
    const xml = BASE(
      `<body><section><title><p>第一章</p></title><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></section></body>`,
    );
    const result = await parser.parse(makeFile(xml));
    const html = result.content.get(result.chapters[0].id)!;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects malformed XML", async () => {
    await expect(parser.parse(makeFile("<FictionBook><body></FictionBook>"))).rejects.toThrow();
  });

  it("falls back to the filename for the title when metadata is missing", async () => {
    const xml = `<FictionBook><body><p>x</p></body></FictionBook>`;
    const result = await parser.parse(makeFile(xml, "无名.fb2"));
    expect(result.title).toBe("无名");
  });
});
