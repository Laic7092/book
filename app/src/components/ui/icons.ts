/**
 * Shared icon registry for AppIcon.
 *
 * Each entry is the inner SVG markup (paths/lines/circles…) rendered inside
 * a 24×24 viewBox. The wrapping <svg> provides `stroke="currentColor"` so
 * icons inherit color from `currentColor`; filled shapes opt out via an
 * explicit `fill` attribute.
 *
 * Path data is transcribed from the original inline SVGs across the app so
 * rendering stays pixel-identical.
 */
export const ICONS = {
  close: '<path d="M18 6L6 18M6 6l12 12" />',
  search: '<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  minus: '<path d="M5 12h14" />',
  check: '<polyline points="20 6 9 17 4 12" />',
  "chevron-left": '<polyline points="15 18 9 12 15 6" />',
  "chevron-right": '<polyline points="9 18 15 12 9 6" />',
  "arrow-left": '<path d="M19 12H5M12 19l-7-7 7-7" />',
  trash:
    '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />',
  folder: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />',
  dots: '<circle cx="12" cy="5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="19" r="1.5" fill="currentColor" />',
  alert: '<circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />',
  pencil:
    '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />',
  underline: '<path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3" /><line x1="4" y1="21" x2="20" y2="21" />',
  note: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" />',
  pause:
    '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />',
  "skip-back": '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor" />',
  "skip-forward": '<path d="M4 18l8.5-6L4 6v12zm9-12v12h2V6h-2z" fill="currentColor" />',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />',
  mic: '<path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" />',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />',
  reset: '<path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" /><path d="M3 3v5h5" />',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />',
  list: '<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4" />',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16" />',
  sliders:
    '<rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" fill="currentColor" />',
  spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56" />',
} as const;

export type IconName = keyof typeof ICONS;
