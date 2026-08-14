import { describe, it, expect } from "vite-plus/test";
import {
  computePageFromOffset,
  computeAnchorScrollTop,
  computePageCount,
  computeScrollTarget,
  hasScrolledAway,
  computePrependCompensation,
} from "./layout";

describe("computePageFromOffset", () => {
  it("returns page 0 for an element at the body origin", () => {
    expect(computePageFromOffset(0, 0, 100)).toBe(0);
  });

  it("returns 1 when the offset equals one full step", () => {
    expect(computePageFromOffset(100, 0, 100)).toBe(1);
  });

  it("floors when the offset is just under a step boundary", () => {
    expect(computePageFromOffset(199, 0, 100)).toBe(1);
  });

  it("accounts for a non-zero body origin", () => {
    expect(computePageFromOffset(250, 50, 100)).toBe(2);
  });

  it("clamps negative offsets to page 0", () => {
    expect(computePageFromOffset(-10, 0, 100)).toBe(-1);
  });
});

describe("computeAnchorScrollTop", () => {
  it("sums rect top with the current scrollTop", () => {
    expect(computeAnchorScrollTop(200, 500)).toBe(700);
  });

  it("handles an element above the viewport (negative rect top)", () => {
    expect(computeAnchorScrollTop(-150, 500)).toBe(350);
  });
});

describe("computePageCount", () => {
  it("returns 1 for empty content", () => {
    expect(computePageCount(0, 800)).toBe(1);
  });

  it("returns 1 when content exactly fits one page", () => {
    expect(computePageCount(800, 800)).toBe(1);
  });

  it("returns 2 when content exceeds one page", () => {
    expect(computePageCount(801, 800)).toBe(2);
  });

  it("clamps a zero viewport width so division cannot explode", () => {
    expect(computePageCount(800, 0)).toBe(800);
  });
});

describe("computeScrollTarget", () => {
  it("returns the offset at progress 0", () => {
    expect(computeScrollTarget(0, 1000, 40)).toBe(40);
  });

  it("returns maxScroll + offset at progress 1", () => {
    expect(computeScrollTarget(1, 1000, 40)).toBe(1040);
  });

  it("lands at the midpoint for progress 0.5", () => {
    expect(computeScrollTarget(0.5, 1000, 40)).toBe(540);
  });
});

describe("hasScrolledAway", () => {
  it("is false when the position did not move", () => {
    expect(hasScrolledAway(500, 500)).toBe(false);
  });

  it("is false within the default tolerance of 1px", () => {
    expect(hasScrolledAway(501, 500)).toBe(false);
  });

  it("is true beyond the tolerance", () => {
    expect(hasScrolledAway(502, 500)).toBe(true);
  });

  it("respects a custom tolerance", () => {
    expect(hasScrolledAway(503, 500, 5)).toBe(false);
    expect(hasScrolledAway(506, 500, 5)).toBe(true);
  });
});

describe("computePrependCompensation", () => {
  it("adds the growth delta to scrollTop", () => {
    expect(computePrependCompensation(1000, 3000, 500)).toBe(2500);
  });

  it("subtracts when the content shrank", () => {
    expect(computePrependCompensation(3000, 1000, 500)).toBe(-1500);
  });

  it("is a no-op when heights are equal", () => {
    expect(computePrependCompensation(1000, 1000, 500)).toBe(500);
  });
});
