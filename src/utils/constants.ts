/**
 * Application-wide constants.
 */

// Reader layout constants
export const READER_HEADER_HEIGHT = 60;
export const READER_FOOTER_HEIGHT = 60;
export const READER_SAFE_TOP = "max(12px, env(safe-area-inset-top, 12px))";
export const READER_SAFE_BOTTOM = "max(10px, env(safe-area-inset-bottom, 10px))";

// Touch gesture constants
export const SWIPE_THRESHOLD = 50;
export const PAGE_CHANGE_COOLDOWN_MS = 300;

// Debounce and throttle delays
export const DEBOUNCE_DELAY = 1000;
export const SCROLL_SAVE_DELAY = 1000;
export const TOAST_DURATION = 3000;

// Chapter loading constants
export const CHAPTER_BUFFER_SIZE = 2;

// Parser chunking constants
export const PARAGRAPHS_PER_CHUNK = 80;
export const MIN_PARAGRAPHS_FOR_SPLIT = 50;

// Tap zone ratios for pagination (left 30%, right 30%)
export const TAP_ZONE_LEFT = 0.3;
export const TAP_ZONE_RIGHT = 0.7;

// Animation durations (ms)
export const TRANSITION_FAST = 150;
export const TRANSITION_BASE = 200;
export const TRANSITION_SLOW = 300;

// Fallback page height for pagination
export const FALLBACK_PAGE_HEIGHT = 600;

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
