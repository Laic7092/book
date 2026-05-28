import type { BookParser, ParserResult } from "../types";

interface SerializedResult {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  chapters: Array<{
    id: string;
    title: string;
    href?: string;
    order: number;
    content?: string;
  }>;
  contentEntries: Array<[string, string]>;
  rawData?: ArrayBuffer;
}

interface WorkerMessageIn {
  id: number;
  file: File;
}

interface WorkerMessageOut {
  type: "success";
  id: number;
  result: SerializedResult;
}

interface WorkerMessageError {
  type: "error";
  id: number;
  error: string;
  needsMainThread?: boolean;
}

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
    {
      resolve: (result: ParserResult) => void;
      reject: (err: Error & { needsMainThread?: boolean }) => void;
    }
  >();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (e: MessageEvent<WorkerMessageOut | WorkerMessageError>) => {
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

  private handleMessage(msg: WorkerMessageOut | WorkerMessageError): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;

    if (msg.type === "success") {
      this.pending.delete(msg.id);
      pending.resolve(deserialize(msg.result));
    } else if (msg.type === "error") {
      this.pending.delete(msg.id);
      const err = new Error(msg.error) as Error & { needsMainThread?: boolean };
      err.needsMainThread = msg.needsMainThread;
      pending.reject(err);
    }
  }

  /** Parse a file in the worker. Falls back to main thread for DOM-dependent formats. */
  async parse(file: File, mainThreadParser?: BookParser): Promise<ParserResult> {
    const id = this.nextId++;

    try {
      return await new Promise<ParserResult>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.getWorker().postMessage({ id, file } satisfies WorkerMessageIn);
      });
    } catch (err) {
      if ((err as { needsMainThread?: boolean }).needsMainThread) {
        return this.parseOnMainThread(file, mainThreadParser);
      }
      throw err;
    }
  }

  private async parseOnMainThread(file: File, parser?: BookParser): Promise<ParserResult> {
    const { getParserForFileAuto } = await import("../index");
    const p = parser ?? (await getParserForFileAuto(file));
    if (!p) throw new Error(`Unsupported format: ${file.type || file.name}`);
    return p.parse(file);
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
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
