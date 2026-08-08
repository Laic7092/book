import { expect, test, describe } from "vite-plus/test";
import { computeChapterScrollProgress, type ChapterWrapperLike } from "./scroll-progress";

function makeWrapper(
  id: string,
  top: number,
  bottom: number,
  scrollHeight: number,
): ChapterWrapperLike {
  return {
    dataset: { chapterId: id },
    getBoundingClientRect: () => ({ top, bottom }),
    scrollHeight,
  };
}

const CLIENT_HEIGHT = 1000;

describe("computeChapterScrollProgress", () => {
  test("single chapter scrolled 40% into it", () => {
    const wrapper = makeWrapper("ch1", -200, 800, 1500);
    const result = computeChapterScrollProgress([wrapper], 200, CLIENT_HEIGHT, 5000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBeCloseTo(200 / 500, 5);
    expect(result.anchor).toBeCloseTo(200 / 1500, 5);
  });

  test("wrapper top above viewport uses -rect.top as in-chapter scrollTop", () => {
    const wrapper = makeWrapper("ch1", -300, 700, 1300);
    const result = computeChapterScrollProgress([wrapper], 300, CLIENT_HEIGHT, 5000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBeCloseTo(300 / 300, 5);
  });

  test("wrapper top below viewport top (gap) clamps to 0", () => {
    const wrapper = makeWrapper("ch1", 50, 1050, 1500);
    const result = computeChapterScrollProgress([wrapper], 0, CLIENT_HEIGHT, 5000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBe(0);
  });

  test("short chapter (scrollHeight <= clientHeight) yields 0, not NaN", () => {
    const wrapper = makeWrapper("ch1", 0, 1000, 1000);
    const result = computeChapterScrollProgress([wrapper], 0, CLIENT_HEIGHT, 5000);
    expect(result.progress).toBe(0);
    expect(Number.isNaN(result.progress)).toBe(false);
  });

  test("no visible wrapper falls back to whole-document ratio", () => {
    const wrapper = makeWrapper("ch1", 2000, 3000, 1500);
    const result = computeChapterScrollProgress([wrapper], 1000, CLIENT_HEIGHT, 3000);
    expect(result.chapterId).toBeUndefined();
    expect(result.progress).toBeCloseTo(1000 / 2000, 5);
  });

  test("picks the wrapper whose top entered the viewport most recently", () => {
    const ch1 = makeWrapper("ch1", 2000, 3000, 1500); // fully scrolled past
    const ch2 = makeWrapper("ch2", -100, 900, 1500);
    const result = computeChapterScrollProgress([ch1, ch2], 2100, CLIENT_HEIGHT, 6000);
    expect(result.chapterId).toBe("ch2");
    expect(result.progress).toBeCloseTo(100 / 500, 5);
  });

  test("viewport top edge still inside the previous chapter keeps its anchor", () => {
    // ch1's trailing 50px and ch2's leading 50px share the viewport; the
    // reader is still looking at ch1 content, so the anchor stays on ch1.
    const ch1 = makeWrapper("ch1", -950, 50, 2000);
    const ch2 = makeWrapper("ch2", 50, 1050, 1500);
    const result = computeChapterScrollProgress([ch1, ch2], 950, CLIENT_HEIGHT, 6000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBeCloseTo(950 / 1000, 5);
  });

  test("previous chapter with half a screen left shares the viewport with the next chapter's top", () => {
    // The reported bug: ch1 trailing half-screen + ch2 leading half-screen
    // used to switch the anchor to ch2, so re-entering dropped ch1's tail.
    // The anchor must keep ch1 AND carry the exact viewport-top offset so
    // re-entry restores the same half-and-half viewport.
    const ch1 = makeWrapper("ch1", -600, 400, 1000);
    const ch2 = makeWrapper("ch2", 400, 1400, 1000);
    const result = computeChapterScrollProgress([ch1, ch2], 600, 800, 2000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBe(1);
    expect(result.anchor).toBeCloseTo(600 / 1000, 5);
  });

  test("after prepend compensation the current chapter top sits at viewport top", () => {
    // autoLoad prepend of ch1 shifts scrollTop by ch1's height; the chained
    // chapter's top is at 0 while the prepended one hangs above the viewport.
    const ch1 = makeWrapper("ch1", -1200, 0, 1200); // prepended, above the viewport
    const ch2 = makeWrapper("ch2", 0, 1000, 1500); // current chapter top at viewport top
    const result = computeChapterScrollProgress([ch1, ch2], 1200, CLIENT_HEIGHT, 6000);
    expect(result.chapterId).toBe("ch2");
    expect(result.progress).toBe(0);
  });

  test("scrolling back up switches when the previous chapter's top re-enters", () => {
    const ch1 = makeWrapper("ch1", -100, 900, 1500); // top re-entered the viewport
    const ch2 = makeWrapper("ch2", -2100, -1100, 1500); // far above
    const result = computeChapterScrollProgress([ch1, ch2], 100, CLIENT_HEIGHT, 6000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBeCloseTo(100 / 500, 5);
  });

  test("scrolled to chapter end clamps at 1.0", () => {
    const wrapper = makeWrapper("ch1", -1000, 100, 2000);
    const result = computeChapterScrollProgress([wrapper], 1000, CLIENT_HEIGHT, 5000);
    expect(result.chapterId).toBe("ch1");
    expect(result.progress).toBe(1);
  });

  test("empty wrapper list falls back to whole-document ratio", () => {
    const result = computeChapterScrollProgress([], 500, CLIENT_HEIGHT, 2000);
    expect(result.chapterId).toBeUndefined();
    expect(result.progress).toBeCloseTo(500 / 1000, 5);
  });
});
