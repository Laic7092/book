import { describe, it, expect } from "vite-plus/test";
import { TaskScope, TaskCancelledError } from "./tasks";

describe("TaskScope", () => {
  it("starts uncancelled with a live signal", () => {
    const scope = new TaskScope();
    expect(scope.isCancelled).toBe(false);
    expect(scope.signal.aborted).toBe(false);
  });

  it("cancel aborts the signal and marks the scope", () => {
    const scope = new TaskScope();
    scope.cancel();
    expect(scope.isCancelled).toBe(true);
    expect(scope.signal.aborted).toBe(true);
  });

  it("cancel is idempotent", () => {
    const scope = new TaskScope();
    let aborts = 0;
    scope.signal.addEventListener("abort", () => aborts++);
    scope.cancel();
    scope.cancel();
    expect(aborts).toBe(1);
  });

  it("cancelling a parent cancels all descendants", () => {
    const root = new TaskScope();
    const child = root.fork();
    const grandchild = child.fork();
    root.cancel();
    expect(root.isCancelled).toBe(true);
    expect(child.signal.aborted).toBe(true);
    expect(grandchild.signal.aborted).toBe(true);
  });

  it("cancelling a child leaves the parent alive (auto-load can never kill the main load)", () => {
    const root = new TaskScope();
    const child = root.fork();
    child.cancel();
    expect(child.signal.aborted).toBe(true);
    expect(root.signal.aborted).toBe(false);
    expect(root.isCancelled).toBe(false);
  });

  it("a scope forked under a cancelled ancestor is born cancelled", () => {
    const root = new TaskScope();
    root.cancel();
    const lateChild = root.fork();
    expect(lateChild.signal.aborted).toBe(true);
    expect(lateChild.isCancelled).toBe(true);
  });

  it("run executes fn with the scope signal", async () => {
    const scope = new TaskScope();
    let seen: AbortSignal | null = null;
    await scope.run(async (signal) => {
      seen = signal;
    });
    expect(seen).toBe(scope.signal);
  });

  it("run refuses to start after cancellation", async () => {
    const scope = new TaskScope();
    scope.cancel();
    await expect(scope.run(async () => {})).rejects.toThrow(TaskCancelledError);
  });

  it("run refuses to start under a cancelled ancestor", async () => {
    const root = new TaskScope();
    const child = root.fork();
    root.cancel();
    await expect(child.run(async () => {})).rejects.toThrow(TaskCancelledError);
  });

  it("cancellation during a run aborts the signal the fn observes", async () => {
    const scope = new TaskScope();
    let aborted = false;
    const done = scope.run(async (signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve());
      });
      aborted = signal.aborted;
    });
    scope.cancel();
    await done;
    expect(aborted).toBe(true);
  });
});
