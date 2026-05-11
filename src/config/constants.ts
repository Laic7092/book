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
export const ALLOWED_FILE_EXTENSIONS = [".txt", ".epub", ".pdf", ".cbz"] as const;

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
