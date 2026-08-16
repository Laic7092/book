// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vite-plus/test";
import { ReflowableHost } from "./reflowable-host";
import type { Chapter } from "./machine";

// happy-dom lacks some browser APIs used by the host; shim the missing ones.
beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    (globalThis as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
    (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
  if (typeof globalThis.IntersectionObserver === "undefined") {
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function flush(ms = 20): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const CHAPTERS: Chapter[] = [
  { id: "ch1", bookId: "b1", title: "1", order: 0, inToc: true },
  { id: "ch2", bookId: "b1", title: "2", order: 1, inToc: true },
  { id: "ch3", bookId: "b1", title: "3", order: 2, inToc: true },
];

function makeHost() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const host = new ReflowableHost({
    container,
    fetchChapter: async (_b, id) => ({ html: `<p>content of ${id}</p>` }),
  });
  return { host, container };
}

describe("ReflowableHost scroll-mode TOC switching", () => {
  it("TOC switch in scroll mode reaches ready and renders the target chapter", async () => {
    const { host, container } = makeHost();
    host.init("b1", CHAPTERS, 0, "scroll");
    await flush();

    expect(host.getState().status).toBe("ready");
    expect(host.getState().position.chapterIndex).toBe(0);
    expect(host.getDocument()?.body?.innerHTML).toContain("content of ch1");

    // TOC click → chapter 3
    host.goToChapter("ch3", 0);
    await flush();

    const state = host.getState();
    expect(state.status).toBe("ready");
    expect(state.position.chapterIndex).toBe(2);
    expect(state.position.progress).toBe(0);
    const body = host.getDocument()?.body;
    expect(body?.innerHTML).toContain("content of ch3");
    expect(body?.querySelector('[data-chapter-id="ch3"]')).toBeTruthy();
    container.remove();
  });

  it("rapid TOC switches settle on the last target", async () => {
    const { host, container } = makeHost();
    host.init("b1", CHAPTERS, 0, "scroll");
    await flush();

    host.goToChapter("ch2", 0);
    host.goToChapter("ch3", 0);
    await flush();

    const state = host.getState();
    expect(state.status).toBe("ready");
    expect(state.position.chapterIndex).toBe(2);
    expect(host.getDocument()?.body?.innerHTML).toContain("content of ch3");
    container.remove();
  });
});

describe("ReflowableHost presentation lifecycle", () => {
  it("pagination init reaches ready and renders the raw chapter", async () => {
    const { host, container } = makeHost();
    host.init("b1", CHAPTERS, 0, "pagination");
    await flush();

    expect(host.getState().status).toBe("ready");
    expect(host.getState().presentation.mode).toBe("pagination");
    expect(host.getDocument()?.body?.innerHTML).toContain("content of ch1");
    expect(host.getDocument()?.body?.querySelector('[data-chapter-id="ch1"]')).toBeNull();
    container.remove();
  });

  it("pagination → scroll → pagination preserves the current chapter and readiness", async () => {
    const { host, container } = makeHost();
    host.init("b1", CHAPTERS, 0, "pagination");
    await flush();

    host.setMode("scroll");
    await flush();

    expect(host.getState().status).toBe("ready");
    expect(host.getState().position.chapterIndex).toBe(0);
    expect(host.getState().presentation.mode).toBe("scroll");
    expect(host.getDocument()?.body?.querySelector('[data-chapter-id="ch1"]')).toBeTruthy();

    host.setMode("pagination");
    await flush();

    expect(host.getState().status).toBe("ready");
    expect(host.getState().position.chapterIndex).toBe(0);
    expect(host.getState().presentation.mode).toBe("pagination");
    expect(host.getDocument()?.body?.querySelector('[data-chapter-id="ch1"]')).toBeNull();
    expect(host.getDocument()?.body?.innerHTML).toContain("content of ch1");
    container.remove();
  });
});
