import { describe, it, expect } from "vite-plus/test";
import { Engine, type EngineOptions } from "./engine";
import type { ReaderEffect } from "./machine";

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
 * The machine is mode-free: MODE_CHANGED is a host-reported presentation
 * fact (MEASURED), never an init-time event. The regression this guards is
 * the same as before — a host that consumes an effect and breaks the app's
 * observation of it.
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

  mainSignal(): AbortSignal {
    return this.nextFetchSignal();
  }

  autoSignal(): AbortSignal {
    return this.nextAutoLoadSignal();
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
  it("delivers MODE_CHANGED to onEffect when the host reports a mode switch", async () => {
    const { engine, appEffects } = makeEngine();
    engine.init("book1", [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }], 0, "pagination");
    await flush();

    appEffects.length = 0;
    engine.dispatch({ type: "MEASURED", chapterId: "ch1", total: 0, mode: "scroll" });
    await flush();

    expect(appEffects).toContainEqual({ type: "MODE_CHANGED", mode: "scroll" });
    expect(appEffects.some((e) => e.type === "FETCH_CHAPTER")).toBe(false);
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

    // Reach ready, then a SEEK must fan out to both consumers.
    engine.dispatch({ type: "MEASURED", chapterId: "ch1", total: 5, mode: "pagination" });
    await flush();
    appEffects.length = 0;
    engine.domEffects.length = 0;

    engine.dispatch({ type: "SEEK", chapterIndex: 0, page: 2 });
    await flush();

    const hostTypes = engine.domEffects.map((e) => e.type);
    const appTypes = appEffects.map((e) => e.type);
    expect(hostTypes).toContain("POSITION_CHANGED");
    expect(appTypes).toContain("POSITION_CHANGED");
  });

  it("resolves an initialPage restore through the lifecycle", async () => {
    const { engine, appEffects } = makeEngine();
    engine.init(
      "book1",
      [{ id: "ch1", bookId: "book1", title: "C1", order: 0 }],
      0,
      "pagination",
      undefined,
      7,
    );
    await flush();
    engine.dispatch({ type: "MEASURED", chapterId: "ch1", total: 10, mode: "pagination" });
    await flush();

    expect(engine.getState().status).toBe("ready");
    expect(engine.getState().position.progress).toBe(0.7);
    expect(engine.getState().presentation.page).toBe(7);
    expect(appEffects).toContainEqual(expect.objectContaining({ type: "POSITION_CHANGED" }));
  });

  it("an auto-load abort never cancels an in-flight main load (scroll sentinel race)", () => {
    const { engine } = makeEngine();
    // A queued scroll-sentinel callback opens a new auto-load scope, which
    // aborts only the previous auto-load scope. The in-flight chapter load
    // must survive — aborting it strands the machine in "loading" (permanent
    // black overlay, dead scroll).
    const auto1 = engine.autoSignal();
    const main = engine.mainSignal();
    engine.autoSignal(); // sentinel fires mid-load: new auto-load scope
    expect(auto1.aborted).toBe(true); // previous auto-load cancelled
    expect(main.aborted).toBe(false); // the chapter load survives

    // A newer main load supersedes the previous main load (rapid navigation).
    const main2 = engine.mainSignal();
    expect(main.aborted).toBe(true);
    expect(main2.aborted).toBe(false);
  });
});
