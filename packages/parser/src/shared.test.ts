import { describe, it, expect } from "vite-plus/test";
import {
  resolvePath,
  escapeHtml,
  wrapHtml,
  collectChildren,
  getMimeType,
  pageToHtml,
} from "./shared";

describe("resolvePath", () => {
  it("joins a base and relative path", () => {
    expect(resolvePath("OEBPS/Text/", "chapter1.xhtml")).toBe("OEBPS/Text/chapter1.xhtml");
  });

  it("treats a leading slash as archive-root relative", () => {
    expect(resolvePath("OEBPS/Text/", "/images/cover.png")).toBe("images/cover.png");
  });

  it("resolves .. segments", () => {
    expect(resolvePath("OEBPS/Text/", "../Styles/main.css")).toBe("OEBPS/Styles/main.css");
  });

  it("drops . segments", () => {
    expect(resolvePath("OEBPS/", "./Text/ch1.xhtml")).toBe("OEBPS/Text/ch1.xhtml");
  });
});

describe("escapeHtml", () => {
  it("escapes all five special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("does not double-escape existing entities", () => {
    expect(escapeHtml("a &amp; b")).toBe("a &amp;amp; b");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Hello, 世界!")).toBe("Hello, 世界!");
  });

  it("handles the empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("wrapHtml", () => {
  it("wraps body and escapes the title", () => {
    expect(wrapHtml("<p>x</p>", `A "quoted" & titled`)).toBe(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>A &quot;quoted&quot; &amp; titled</title></head><body><p>x</p></body></html>',
    );
  });
});

describe("collectChildren", () => {
  it("concatenates outerHTML of the selected range", () => {
    const parent = {
      children: [{ outerHTML: "<a></a>" }, { outerHTML: "<b></b>" }, { outerHTML: "<c></c>" }],
    };
    expect(collectChildren(parent, 1, 3)).toBe("<b></b><c></c>");
  });

  it("stops at the end of children", () => {
    const parent = { children: [{ outerHTML: "<a></a>" }] };
    expect(collectChildren(parent, 0, 10)).toBe("<a></a>");
  });
});

describe("getMimeType", () => {
  it("maps known extensions", () => {
    expect(getMimeType("cover.jpg")).toBe("image/jpeg");
    expect(getMimeType("style.css")).toBe("text/css");
    expect(getMimeType("font.woff2")).toBe("font/woff2");
  });

  it("is case-insensitive", () => {
    expect(getMimeType("COVER.PNG")).toBe("image/png");
  });

  it("uses the caller-provided fallback for unknown extensions", () => {
    expect(getMimeType("page.xyz", "image/jpeg")).toBe("image/jpeg");
    expect(getMimeType("page.xyz")).toBe("application/octet-stream");
  });

  it("falls back for empty input", () => {
    expect(getMimeType("")).toBe("application/octet-stream");
  });
});

describe("pageToHtml", () => {
  it("omits data-page when pageNum is not given", () => {
    expect(pageToHtml("blob:x")).toBe(
      `<html style="height:100%;margin:0"><body style="height:100%;margin:0;display:flex;align-items:center;justify-content:center"><img src="blob:x" style="max-width:100%;max-height:100%;object-fit:contain;display:block"></body></html>`,
    );
  });

  it("includes data-page when pageNum is given", () => {
    expect(pageToHtml("blob:x", 3)).toContain(`data-page="3"`);
  });
});
