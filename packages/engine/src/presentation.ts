import { type Presentation } from "./machine";

/**
 * Common contract for the two reflowable presentations.
 *
 * The state machine speaks one position language; the host only needs this
 * small interface to render, measure, switch and apply position readouts.
 * Pagination and scroll remain separate DOM strategies, but the orchestration
 * in ReflowableHost no longer needs to know which one is active.
 */
export interface ReflowablePresentation {
  readonly mode: "pagination" | "scroll";
  start(): void;
  stop(): void;
  teardown(): void;
  beforeChapterLoad(): void;
  renderChapter(chapterId: string, html: string): void;
  restructure(chapterId: string, html: string): void;
  applyPosition(presentation: Presentation): void;
  navigateToAnchor(el: Element): void;
}
