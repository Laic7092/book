/**
 * Application-wide constants.
 */

// Reader layout constants
export const READER_HEADER_HEIGHT = 60;
export const READER_FOOTER_HEIGHT = 60;

// Touch gesture constants
export const SWIPE_THRESHOLD = 50;
export const PAGE_CHANGE_COOLDOWN_MS = 300;

// Debounce and throttle delays
export const DEBOUNCE_DELAY = 1000;
export const PROGRESS_SAVE_DELAY = 1000;
export const TOAST_DURATION = 3000;

// Chapter loading constants
export const CHAPTER_BUFFER_SIZE = 2;
export const CHAPTER_CACHE_MAX_SIZE = 10;

// Parser chunking constants
export const PARAGRAPHS_PER_CHUNK = 320;
export const MAX_CHARS_PER_CHUNK = 50_000; // Maximum characters per chunk (~50KB)
export const MAX_CHARS_PER_CHAPTER = 100_000; // Hard limit for a single chapter (~100KB)

// Tap zone ratios for pagination (left 30%, right 30%)
export const TAP_ZONE_LEFT = 0.3;
export const TAP_ZONE_RIGHT = 0.7;

// Animation durations (ms)
export const TRANSITION_FAST = 150;
export const TRANSITION_BASE = 200;
export const TRANSITION_SLOW = 300;

// Fallback page height for pagination
export const FALLBACK_PAGE_HEIGHT = 600;

// File validation constants
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
export const ALLOWED_FILE_EXTENSIONS = [
  ".txt",
  ".epub",
  ".pdf",
  ".cbz",
  ".fb2",
  ".cbr",
  ".mobi",
  ".azw3",
  ".azw",
] as const;

// Toast message constants
export const TOAST_TITLE_MAX_LENGTH = 10; // Max characters for book title in toast messages

// Block tags for pagination splitting
export const BLOCK_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "figure",
  "figcaption",
  "table",
  "hr",
  "ul",
  "ol",
] as const;

// ── Utility functions ──

/**
 * Creates a debounced version of a function that delays invocation
 * until after wait milliseconds have elapsed since the last call.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: number | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

/**
 * Creates a throttled version of a function that limits execution
 * to once per specified interval.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      window.setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Truncate a book title for toast messages.
 */
export function truncateTitle(title: string, maxLength = TOAST_TITLE_MAX_LENGTH): string {
  if (title.length <= maxLength) return title;
  const truncated = title.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength - 5) {
    return truncated.slice(0, lastSpace) + "…";
  }
  return truncated.trimEnd() + "…";
}

/**
 * Format a toast message with a book title.
 */
export function formatBookToast(title: string, action: string): { title: string; message: string } {
  return {
    title: truncateTitle(title),
    message: action,
  };
}
