// Plain-TS module for reader-level state that doesn't belong in the state machine
// but is needed by the bridge to execute effects (e.g., the current parser instance).
// This avoids pulling Pinia into useReaderMachine.

import type { BookParser } from "./types";

let _currentParser: BookParser | null = null;

export function setCurrentParser(parser: BookParser | null): void {
  _currentParser = parser;
}

export function getCurrentParser(): BookParser | null {
  return _currentParser;
}
