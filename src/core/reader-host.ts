// ReaderSession — the API surface exposed to plugins for interacting with
// the active reader session. Replaces the old 20-method ReaderHost with
// three focused primitives:
//
//   dispatch(action) — send an action to the state machine
//   getState()      — read current machine state
//   getDocument()   — access the iframe document (for DOM plugins)
//
// A session is registered when a book is opened and cleared when closed.

import type { ReaderAction, ReaderState } from "../reader-engine/reader-machine";

export interface ReaderSession {
  dispatch(action: ReaderAction): void;
  getState(): ReaderState;
  getDocument(): Document | null;
  setPageMargin(margin: number): void;
}

let currentSession: ReaderSession | null = null;

export function registerReaderSession(session: ReaderSession): void {
  currentSession = session;
}

export function unregisterReaderSession(): void {
  currentSession = null;
}

export function getReaderSession(): ReaderSession | null {
  return currentSession;
}
