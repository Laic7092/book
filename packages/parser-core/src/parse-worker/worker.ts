// Web Worker for book parsing. Runs parsers off the main thread.
// Formats that need browser APIs (DOMParser, window, canvas) will throw
// during import or parse — the client catches these and retries on the main thread.

import type { StreamingParseEvent } from "../index";

interface ParseRequest {
  id: number;
  file: File;
}

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

interface ParseSuccessMessage {
  type: "success";
  id: number;
  result: SerializedResult;
}

interface ParseStreamEventMessage {
  type: "stream-event";
  id: number;
  event: StreamingParseEvent;
}

interface ParseStreamDoneMessage {
  type: "stream-done";
  id: number;
}

interface ParseErrorMessage {
  type: "error";
  id: number;
  error: string;
  needsMainThread?: boolean;
}

function isBrowserApiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("window is not defined") ||
    msg.includes("DOMParser is not defined") ||
    msg.includes("document is not defined") ||
    msg.includes("navigator is not defined") ||
    msg.includes("Worker is not defined")
  );
}

async function doParse(id: number, file: File): Promise<void> {
  let mod: typeof import("../index");
  try {
    mod = await import("../index");
  } catch (err) {
    postMessage({
      type: "error",
      id,
      error: err instanceof Error ? err.message : String(err),
      needsMainThread: isBrowserApiError(err),
    } satisfies ParseErrorMessage);
    return;
  }

  const parser = await mod.getParserForFileAuto(file);
  if (!parser) {
    postMessage({
      type: "error",
      id,
      error: `Unsupported format: ${file.type || file.name}`,
    } satisfies ParseErrorMessage);
    return;
  }

  if (parser.parseStreaming) {
    try {
      const gen = parser.parseStreaming(file);
      for await (const event of gen) {
        postMessage({ type: "stream-event", id, event } satisfies ParseStreamEventMessage);
      }
      // The stream contract ends with an explicit done message; without it
      // the client's pending promise would never resolve.
      postMessage({ type: "stream-done", id } satisfies ParseStreamDoneMessage);
    } catch (err) {
      postMessage({
        type: "error",
        id,
        error: err instanceof Error ? err.message : String(err),
        needsMainThread: isBrowserApiError(err),
      } satisfies ParseErrorMessage);
    }
    return;
  }

  try {
    const result = await parser.parse(file);
    const serialized: SerializedResult = {
      id: result.id,
      title: result.title,
      author: result.author,
      coverUrl: result.coverUrl,
      chapters: result.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        href: ch.href,
        order: ch.order,
        content: result.content.get(ch.id),
      })),
      contentEntries: [...result.content],
      rawData: result.rawData,
    };

    const transfer: Transferable[] = [];
    if (serialized.rawData) transfer.push(serialized.rawData);

    postMessage(
      { type: "success", id, result: serialized } satisfies ParseSuccessMessage,
      transfer.length ? { transfer } : undefined,
    );
  } catch (err) {
    postMessage({
      type: "error",
      id,
      error: err instanceof Error ? err.message : String(err),
      needsMainThread: isBrowserApiError(err),
    } satisfies ParseErrorMessage);
  }
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  void doParse(e.data.id, e.data.file);
};
