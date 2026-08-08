import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { ParseWorkerClient } from "./client";
import type { StreamingParseEvent } from "../types";

/**
 * Fake Worker: captures the message handler installed by ParseWorkerClient
 * so tests can drive it with hand-built protocol messages.
 */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: Array<{ id: number; file: File }> = [];

  postMessage(msg: { id: number; file: File }): void {
    this.posted.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Deliver a protocol message from the "worker" side. */
  deliver(msg: unknown): void {
    this.onmessage?.({ data: msg } as MessageEvent);
  }

  fail(err: Error): void {
    this.onerror?.({ message: err.message } as ErrorEvent);
  }
}

/** Minimal File-like; the client never reads its contents. */
function fakeFile(): File {
  return new File(["x"], "book.cbz");
}

beforeEach(() => {
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Recording stub: registers every constructed FakeWorker instance. */
function stubRecordingWorker(): FakeWorker[] {
  const instances: FakeWorker[] = [];
  class RecordingWorker extends FakeWorker {
    constructor() {
      super();
      instances.push(this);
    }
  }
  vi.stubGlobal("Worker", RecordingWorker);
  return instances;
}

describe("ParseWorkerClient.parseStreaming", () => {
  it("yields stream events in order and completes on stream-done", async () => {
    const instances = stubRecordingWorker();
    const client = new ParseWorkerClient();
    const gen = client.parseStreaming(fakeFile());

    const received: StreamingParseEvent[] = [];
    const done = (async () => {
      for await (const e of gen) received.push(e);
    })();

    await Promise.resolve();
    expect(instances).toHaveLength(1);
    const worker = instances[0];
    expect(worker.posted).toHaveLength(1);
    const id = worker.posted[0].id;

    worker.deliver({
      type: "stream-event",
      id,
      event: { type: "metadata", id: "b1", title: "T", author: "A" },
    });
    worker.deliver({
      type: "stream-event",
      id,
      event: { type: "chapter", chapter: { id: "c1", title: "C1", order: 0, href: "x.html" } },
    });
    worker.deliver({ type: "stream-done", id });

    await done;
    expect(received.map((e) => e.type)).toEqual(["metadata", "chapter"]);
  });

  it("completes after stream-done and errors carry needsMainThread", async () => {
    const instances = stubRecordingWorker();

    const client = new ParseWorkerClient();
    const gen = client.parseStreaming(fakeFile());

    const received: StreamingParseEvent[] = [];
    const done = (async () => {
      for await (const e of gen) received.push(e);
    })();

    // First next() creates the worker and posts the request.
    await Promise.resolve();
    expect(instances).toHaveLength(1);
    const worker = instances[0];
    expect(worker.posted).toHaveLength(1);

    worker.deliver({
      type: "stream-event",
      id: worker.posted[0].id,
      event: { type: "metadata", id: "b1", title: "T", author: "A" },
    });
    worker.deliver({ type: "stream-done", id: worker.posted[0].id });

    await done;
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "metadata", id: "b1" });

    // Error path with needsMainThread
    const client2 = new ParseWorkerClient();
    const gen2 = client2.parseStreaming(fakeFile());
    const iterator = gen2[Symbol.asyncIterator]();

    // Kick the stream off first, then let the worker get constructed.
    const errorPromise = iterator.next().then(
      () => {
        throw new Error("expected rejection");
      },
      (err: Error & { needsMainThread?: boolean }) => err,
    );
    await Promise.resolve();
    const worker2 = instances[instances.length - 1];
    worker2.deliver({
      type: "error",
      id: worker2.posted[0].id,
      error: "DOMParser is not defined",
      needsMainThread: true,
    });

    const err = await errorPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { needsMainThread?: boolean }).message).toContain("DOMParser");
    expect((err as Error & { needsMainThread?: boolean }).needsMainThread).toBe(true);
  });

  it("rejects a pending stream when the worker errors out", async () => {
    const instances = stubRecordingWorker();

    const client = new ParseWorkerClient();
    const gen = client.parseStreaming(fakeFile());
    const iterator = gen[Symbol.asyncIterator]();

    const errorPromise = iterator.next().then(
      () => {
        throw new Error("expected rejection");
      },
      (err: Error) => err,
    );
    await Promise.resolve();
    const worker = instances[0];
    worker.fail(new Error("boom"));

    const err = await errorPromise;
    expect((err as Error).message).toContain("boom");
  });

  it("destroys a pending stream with an error", async () => {
    stubRecordingWorker();

    const client = new ParseWorkerClient();
    const gen = client.parseStreaming(fakeFile());
    const iterator = gen[Symbol.asyncIterator]();
    await Promise.resolve();

    const errorPromise = iterator.next().then(
      () => {
        throw new Error("expected rejection");
      },
      (err: Error) => err,
    );
    client.destroy();

    const err = await errorPromise;
    expect((err as Error).message).toContain("destroyed");
  });
});
