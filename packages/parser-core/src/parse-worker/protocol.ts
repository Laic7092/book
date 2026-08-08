import type { StreamingParseEvent } from "../types";

/** Wire format of a parsed book, shared by the worker and its client. */
export interface SerializedResult {
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

export interface WorkerMessageIn {
  id: number;
  file: File;
}

export interface WorkerMessageOut {
  type: "success" | "stream-event" | "stream-done" | "error";
  id: number;
  result?: SerializedResult;
  event?: StreamingParseEvent;
  error?: string;
  needsMainThread?: boolean;
}
