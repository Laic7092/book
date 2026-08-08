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

// 兜底识别:parser 未声明 requiresBrowser 但仍用到浏览器全局时,
// ReferenceError 文案在 Chrome/Firefox 是 "X is not defined",
// Safari 是 "Can't find variable: X"。仅匹配已知浏览器全局,避免误伤业务错误。
const BROWSER_GLOBALS = ["window", "document", "DOMParser", "navigator", "Worker"] as const;

function isBrowserApiError(err: unknown): boolean {
  if (!(err instanceof ReferenceError)) return false;
  const msg = err.message;
  return BROWSER_GLOBALS.some(
    (g) => msg.includes(`${g} is not defined`) || msg.includes(`Can't find variable: ${g}`),
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

  // DOM-dependent formats can never run in a worker — bail out with the
  // needsMainThread flag instead of failing with a ReferenceError.
  if (parser.requiresBrowser) {
    postMessage({
      type: "error",
      id,
      error: `${parser.format} parser requires browser APIs; falling back to main thread`,
      needsMainThread: true,
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
