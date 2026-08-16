import { shallowRef } from "vue";
import type { ReaderSession } from "@book/engine";
import type { InitConfig } from "./plugin-runtime/types";

export const currentSession = shallowRef<ReaderSession | null>(null);

/**
 * Canonical position snapshot — the reader's own recovery protocol.
 *
 * Aligned 1:1 with the `reader:unmounted` event payload and the
 * `reader:init-config` flow: the reader emits this shape when it unmounts, and
 * any recovery source (reading-progress plugin, future sync, …) persists and
 * restores through it. Persistence format is plugin-private; this shape is the
 * in-memory contract.
 */
export interface ReaderPositionSnapshot {
  chapterId: string;
  chapterIndex: number;
  mode: "pagination" | "scroll";
  /** Exact pagination page at snapshot time (meaningful in pagination mode). */
  page: number;
  /** Mode-independent in-chapter flow progress 0..1 — the canonical coordinate. */
  progress: number;
  /** Viewport-top offset inside the chapter (0..1), for exact scroll restore. */
  anchor?: number;
}

/** Capture the current position from a live session (undefined before init). */
export function snapshotFromSession(
  session: ReaderSession | null,
): ReaderPositionSnapshot | undefined {
  if (!session) return undefined;
  const s = session.getState();
  const chapter = s.chapters[s.position.chapterIndex];
  if (!chapter) return undefined;
  return {
    chapterId: chapter.id,
    chapterIndex: s.position.chapterIndex,
    mode: s.presentation.mode,
    page: s.presentation.page,
    progress: s.position.progress,
    anchor: s.position.anchor,
  };
}

/**
 * Apply a snapshot onto a reader init config.
 *
 * Exact page restore when reopening in pagination with a stable layout;
 * otherwise the unified position (progress + anchor) restores in either mode
 * (pagination derives the page readout, scroll restores exactly).
 */
export function applyPositionSnapshot(
  config: InitConfig,
  snapshot: ReaderPositionSnapshot,
): InitConfig {
  const exactPage = snapshot.mode === "pagination" ? snapshot.page : undefined;
  if (exactPage !== undefined && exactPage > 0 && config.mode === "pagination") {
    return {
      ...config,
      chapterIndex: snapshot.chapterIndex,
      initialPage: exactPage,
    };
  }
  return {
    ...config,
    chapterIndex: snapshot.chapterIndex,
    initialPosition: { progress: snapshot.progress, anchor: snapshot.anchor },
  };
}
