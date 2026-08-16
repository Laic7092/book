/**
 * Reader mode vocabulary.
 *
 * The canonical mode is the engine mode: "pagination" | "scroll".
 * "vertical" is only a legacy UI label for scroll mode; it is accepted when
 * normalizing persisted settings but never stored or passed around as a
 * separate domain type.
 */

export type ReaderMode = "pagination" | "scroll";

export function normalizeReaderMode(mode: string | null | undefined): ReaderMode {
  return mode === "scroll" || mode === "vertical" ? "scroll" : "pagination";
}
