import { describe, expect, it } from "vite-plus/test";
import { parseRule } from "./rule-parser";

describe("parseRule", () => {
  it("parses plain JSOUP chain with extractor", () => {
    const r = parseRule("class.item.0@tag.a@href")!;
    expect(r.type).toBe("jsoup");
    expect(r.extractor).toBe("href");
    expect(r.steps).toEqual([{ css: ".item", index: 0 }, { css: "a" }]);
  });

  it("parses text.keyword matching segments (Legado text.N)", () => {
    const r = parseRule("tag.li@text.推荐@tag.a@href")!;
    expect(r.type).toBe("jsoup");
    expect(r.extractor).toBe("href");
    expect(r.steps).toEqual([{ css: "li" }, { css: "*", text: "推荐" }, { css: "a" }]);
  });

  it("keeps text.0 as index for backward compatibility", () => {
    const r = parseRule("class.item.0@text.0@tag.a@href")!;
    expect(r.steps[1]).toEqual({ css: "*", index: 0 });
  });

  it("supports multi-step @css: rules", () => {
    const r = parseRule("@css:div.list@css:a.title@href")!;
    expect(r.type).toBe("jsoup");
    expect(r.extractor).toBe("href");
    expect(r.steps).toEqual([{ css: "div.list" }, { css: "a.title" }]);
  });

  it("keeps single-step @css: rules working (trailing extractor)", () => {
    const r = parseRule("@css:div.book > a.title@href")!;
    expect(r.steps).toEqual([{ css: "div.book > a.title" }]);
    expect(r.extractor).toBe("href");
  });

  it("parses @css: without extractor as text", () => {
    const r = parseRule("@css:div#content")!;
    expect(r.steps).toEqual([{ css: "div#content" }]);
    expect(r.extractor).toBe("text");
  });

  it("detects XPath rules", () => {
    const r = parseRule("//div[@id='list']/dl/dt")!;
    expect(r.type).toBe("xpath");
    expect(r.xpath).toBe("//div[@id='list']/dl/dt");
  });

  it("detects regex AllInOne rules", () => {
    const r = parseRule(':href="(/read[^"]*html)">([^<]*)')!;
    expect(r.type).toBe("regex-allinone");
    expect(r.regexPattern).toBe('href="(/read[^"]*html)">([^<]*)');
  });

  it("strips trailing ##regex##replacement transform", () => {
    const r = parseRule("tag.a@href##/read/(\\d+).html##")!;
    expect(r.extractor).toBe("href");
    expect(r.regex).toBeDefined();
    expect(r.regex![0].source).toBe("\\/read\\/(\\d+).html");
    expect(r.regex![1]).toBe("");
  });

  it("returns null for empty rules", () => {
    expect(parseRule("")).toBeNull();
    expect(parseRule("   ")).toBeNull();
  });
});
