import type { ReaderAction, ReaderState } from "../reader-engine/reader-machine";

// ── ReaderSession (plugin bridge) ──

export interface ReaderSession {
  dispatch(action: ReaderAction): void;
  getState(): ReaderState;
  getDocument(): Document | null;
  setPageMargin(margin: number): void;
  navigateToCfi(cfi: string, chapterId: string): Promise<void>;
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
