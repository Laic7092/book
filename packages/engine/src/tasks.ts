/**
 * Minimal structured-concurrency runtime for the engine's load pipeline.
 *
 * This replaces the hand-rolled dual-AbortController discipline that used to
 * live in engine.ts / reflowable-host.ts. The invariants that previously
 * survived only in comments ("auto loads must never abort a main load",
 * "aborting a load strands the machine in loading") are now structural
 * properties of the scope tree:
 *
 *   - A TaskScope is a cancellation unit. cancel() aborts its AbortSignal
 *     exactly once and recursively cancels every descendant.
 *   - Cancellation flows DOWN the tree only: children can never cancel their
 *     ancestors, so a background auto-load can never kill the main load.
 *   - A cancelled scope refuses new work: run() throws TaskCancelledError
 *     instead of silently running against a dead signal.
 *   - A scope forked under a cancelled ancestor is born cancelled, closing
 *     the fork/cancel race.
 *
 * The engine keeps two stable scope roots:
 *   - mainLoadScope — one per chapter load; superseded (cancelled) by the
 *     next load, a mode switch and teardown.
 *   - autoLoadScope — background scroll-chaining loads, forked as children
 *     so a new main load (which replaces the DOM they were writing into)
 *     cancels them wholesale.
 */

let nextScopeId = 1;

export class TaskScope {
  readonly id: number;
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly children = new Set<TaskScope>();
  private cancelled = false;

  private readonly parent: TaskScope | null;

  constructor(parent: TaskScope | null = null) {
    this.id = nextScopeId++;
    this.parent = parent;
    this.signal = this.controller.signal;
  }

  /** True when this scope or any ancestor is cancelled. */
  get isCancelled(): boolean {
    return this.cancelled || (this.parent?.isCancelled ?? false);
  }

  /**
   * Child scope: cancelled with this scope. A scope forked under a cancelled
   * ancestor is born cancelled (its signal is already aborted), so work that
   * starts against a dead tree fails loudly instead of racing.
   */
  fork(): TaskScope {
    const child = new TaskScope(this);
    this.children.add(child);
    if (this.isCancelled) child.controller.abort();
    return child;
  }

  /** Cancel this scope and every descendant. Idempotent. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.controller.abort();
    for (const child of this.children) child.cancel();
  }

  /**
   * Run fn in this scope. Refuses (TaskCancelledError) when the scope is
   * already cancelled; otherwise fn receives the scope's signal and is
   * responsible for observing it (abort listener, fetch signal, checks).
   */
  async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.isCancelled) throw new TaskCancelledError(`scope #${this.id} cancelled`);
    return fn(this.signal);
  }
}

/** Thrown when work is started against an already-cancelled scope. */
export class TaskCancelledError extends Error {
  constructor(message = "task cancelled") {
    super(message);
    this.name = "TaskCancelledError";
  }
}
