import { describe, it, expect } from "vite-plus/test";
import { Engine, type EngineOptions } from "./engine";
import type { ReaderEffect, ReaderAction } from "./machine";

/**
 * Effect fan-out contract:
 *
 * Every non-FETCH effect must reach BOTH consumers:
 *  - runEffect (host DOM side effects)
 *  - onEffect (app layer: plugin event bus)
 *
 * FETCH_CHAPTER is engine-internal (hosts override fetchAndLoadChapter) and
 * must NEVER surface to onEffect.
 *
 * Regression: reflowable-host used to consume MODE_CHANGED/PAGE_POSITION_CHANGED
 * and break, so the app's translateEffect could never emit "mode:changed"
 * even though plugins were listening.
 */

class StubEngine extends Engine {
  domEffects: ReaderEffect[] = [];

  constructor(options: EngineOptions) {
    super(options);
  }

  getDocument(): Document | null {
    return null;
  }

  protected async runEffect(effect: ReaderEffect): Promise<void> {
    this.domEffects.push(effect);
  }
}

function makeEngine(overrides: Partial<EngineOptions> = {}) {
  const appEffects: ReaderEffect[] = [];
  const engine = new StubEngine({
    fetchChapter: async () => ({ html: "<p>hello</p>" }),
    onEffect: (e) => {
      appEffects.push(e);
    },
    ...overrides,
  });
  return { engine, appEffects };
}

/** Let the fire-and-forget dispatch pipeline settle. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("Engine effect fan-out", () => {
  it("delivers MODE_CHANGED to onEffect on init (regression: mode:changed dead link)", async () => {
    const { engine, appEffects } = makeEngine();
    engine.init("book1", [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }], 0, "pagination");
    await flush();

    const types = appEffects.map((e) => e.type);
    expect(types).toContain("MODE_CHANGED");
    expect(types).not.toContain("FETCH_CHAPTER");
  });

  it("delivers MODE_CHANGED to onEffect on SET_MODE mid-session", async () => {
    const { engine, appEffects } = makeEngine();
    engine.init("book1", [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }], 0, "pagination");
    await flush();
    engine.dispatch({ type: "PAGE_COUNT_UPDATED", chapterId: "ch1", total: 5 });
    await flush();

    appEffects.length = 0;
    engine.dispatch({ type: "SET_MODE", mode: "scroll" });
    await flush();

    expect(appEffects).toContainEqual({ type: "MODE_CHANGED", mode: "scroll" });
  });

  it("never surfaces FETCH_CHAPTER to onEffect", async () => {
    const { engine, appEffects } = makeEngine();
    engine.init("book1", [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }], 0, "pagination");
    await flush();

    // Nested dispatches (CHAPTER_LOADED etc.) may add effects; FETCH_CHAPTER
    // must never be among them.
    expect(appEffects.some((e) => e.type === "FETCH_CHAPTER")).toBe(false);
  });

  it("forwards FETCH_CHAPTER to onEffect when no fetchChapter is provided", async () => {
    const { engine, appEffects } = makeEngine({ fetchChapter: undefined });
    engine.init("book1", [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }], 0, "pagination");
    await flush();

    expect(appEffects.some((e) => e.type === "FETCH_CHAPTER")).toBe(true);
  });

  it("delivers the same effect to the host and the app layer", async () => {
    const { engine, appEffects } = makeEngine();
    engine.init("book1", [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }], 0, "pagination");
    await flush();

    const action: ReaderAction = { type: "SET_MODE", mode: "scroll" };
    engine.dispatch(action);
    await flush();

    const hostTypes = engine.domEffects.map((e) => e.type);
    const appTypes = appEffects.map((e) => e.type);
    expect(hostTypes).toContain("MODE_CHANGED");
    expect(appTypes).toContain("MODE_CHANGED");
  });
});
