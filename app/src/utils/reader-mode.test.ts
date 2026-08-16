import { describe, expect, it } from "vite-plus/test";
import { normalizeReaderMode } from "./reader-mode";

describe("reader-mode vocabulary", () => {
  it("accepts the canonical engine mode", () => {
    expect(normalizeReaderMode("scroll")).toBe("scroll");
    expect(normalizeReaderMode("pagination")).toBe("pagination");
  });

  it("maps the legacy UI vertical label to scroll", () => {
    expect(normalizeReaderMode("vertical")).toBe("scroll");
  });

  it("defaults unknown and empty values to pagination", () => {
    expect(normalizeReaderMode(undefined)).toBe("pagination");
    expect(normalizeReaderMode(null)).toBe("pagination");
    expect(normalizeReaderMode("anything-else")).toBe("pagination");
  });
});
