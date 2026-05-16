import type { ReaderAction, ReaderState } from "@book/reader-core";

export interface ReaderSession {
  dispatch(action: ReaderAction): void;
  getState(): ReaderState;
  getDocument(): Document | null;
  setPageMargin(margin: number): void;
  navigateToCfi(cfi: string, chapterId: string): Promise<void>;
}
