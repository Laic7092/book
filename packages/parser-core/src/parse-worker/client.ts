import type { BookParser, ParserResult, StreamingParseEvent } from "../types";
import type { SerializedResult, WorkerMessageIn, WorkerMessageOut } from "./protocol";

function deserialize(msg: SerializedResult): ParserResult {
  return {
    id: msg.id,
    title: msg.title,
    author: msg.author,
    coverUrl: msg.coverUrl,
    chapters: msg.chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      href: ch.href,
      order: ch.order,
    })),
    content: new Map(msg.contentEntries),
    rawData: msg.rawData,
  };
}

export class ParseWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    | {
        kind: "parse";
        resolve: (result: ParserResult) => void;
        reject: (err: Error & { needsMainThread?: boolean }) => void;
      }
    | {
        kind: "stream";
        controller: ReadableStreamDefaultController<StreamingParseEvent>;
        reject: (err: Error & { needsMainThread?: boolean }) => void;
      }
  >();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (e: MessageEvent<WorkerMessageOut>) => {
        this.handleMessage(e.data);
      };
      this.worker.onerror = (err) => {
        for (const [, p] of this.pending) {
          p.reject(new Error(`Worker error: ${err.message}`));
        }
        this.pending.clear();
      };
    }
    return this.worker;
  }

  private handleMessage(msg: WorkerMessageOut): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;

    switch (msg.type) {
      case "success": {
        if (pending.kind !== "parse" || !msg.result) return;
        this.pending.delete(msg.id);
        pending.resolve(deserialize(msg.result));
        break;
      }
      case "stream-event": {
        if (pending.kind !== "stream" || !msg.event) return;
        pending.controller.enqueue(msg.event);
        break;
      }
      case "stream-done": {
        if (pending.kind !== "stream") return;
        this.pending.delete(msg.id);
        pending.controller.close();
        break;
      }
      case "error": {
        this.pending.delete(msg.id);
        const err = new Error(msg.error) as Error & { needsMainThread?: boolean };
        err.needsMainThread = msg.needsMainThread;
        if (pending.kind === "stream") {
          pending.controller.error(err);
        } else {
          pending.reject(err);
        }
        break;
      }
    }
  }

  /** Parse a file in the worker. Falls back to main thread for DOM-dependent formats. */
  async parse(file: File, mainThreadParser?: BookParser): Promise<ParserResult> {
    const id = this.nextId++;

    try {
      return await new Promise<ParserResult>((resolve, reject) => {
        this.pending.set(id, { kind: "parse", resolve, reject });
        this.getWorker().postMessage({ id, file } satisfies WorkerMessageIn);
      });
    } catch (err) {
      if ((err as { needsMainThread?: boolean }).needsMainThread) {
        return this.parseOnMainThread(file, mainThreadParser);
      }
      throw err;
    }
  }

  /**
   * Stream a file through the worker's parseStreaming. Yields events as they
   * arrive; a `needsMainThread` error surfaces from the generator and the
   * caller can retry on the main thread.
   */
  async *parseStreaming(file: File): AsyncGenerator<StreamingParseEvent> {
    const id = this.nextId++;

    const stream = new ReadableStream<StreamingParseEvent>({
      start: (controller) => {
        this.pending.set(id, {
          kind: "stream",
          controller,
          reject: (err) => controller.error(err),
        });
        this.getWorker().postMessage({ id, file } satisfies WorkerMessageIn);
      },
      cancel: () => {
        this.pending.delete(id);
      },
    });

    for await (const event of stream) {
      yield event;
    }
  }

  private async parseOnMainThread(file: File, parser?: BookParser): Promise<ParserResult> {
    const { getParserForFileAuto } = await import("../index");
    const p = parser ?? (await getParserForFileAuto(file));
    if (!p) throw new Error(`Unsupported file format: ${file.type || file.name}`);
    return p.parse(file);
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, p] of this.pending) {
      if (p.kind === "stream") p.controller.error(new Error("Parse worker destroyed"));
    }
    this.pending.clear();
  }
}

let client: ParseWorkerClient | null = null;

export function getParseWorker(): ParseWorkerClient {
  if (!client) {
    client = new ParseWorkerClient();
  }
  return client;
}
