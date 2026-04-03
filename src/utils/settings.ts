// Font options for settings UI
export const FONT_OPTIONS = [
  { label: "Literata", value: "Literata, Georgia, serif", preview: "Literata" },
  { label: "Cormorant", value: "Cormorant, Georgia, serif", preview: "Cormorant" },
  {
    label: "Sans Serif",
    value: "Instrument Sans, -apple-system, sans-serif",
    preview: "Instrument Sans",
  },
  { label: "System", value: "system-ui, -apple-system, sans-serif", preview: "system-ui" },
  { label: "Mono", value: "JetBrains Mono, Consolas, monospace", preview: "JetBrains Mono" },
] as const;

// Theme options
export const THEME_OPTIONS = [
  { label: "Light", value: "light", desc: "Easy on battery" },
  { label: "Dark", value: "dark", desc: "Night reading" },
  { label: "Sepia", value: "sepia", desc: "Paper-like comfort" },
] as const;

// Contrast options for dark mode
export const CONTRAST_OPTIONS = [
  { label: "Soft", value: "soft" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
] as const;

// Text alignment options
export const TEXT_ALIGN_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Justify", value: "justify" },
] as const;

// Reading mode options
export const SCROLL_MODE_OPTIONS = [
  { label: "Vertical", value: "vertical", desc: "Continuous scroll" },
  { label: "Pagination", value: "pagination", desc: "Page by page" },
] as const;

// Pagination animation options
export const ANIMATION_OPTIONS = [
  { label: "Slide", value: "slide", desc: "Smooth slide" },
  { label: "Flip", value: "flip", desc: "Page flip" },
  { label: "Fade", value: "fade", desc: "Fade transition" },
] as const;

// Size presets
export const FONT_SIZE_PRESETS = [14, 16, 18, 20, 22, 24] as const;
export const LINE_HEIGHT_PRESETS = [1.4, 1.6, 1.8, 2.0] as const;
export const MARGIN_PRESETS = [16, 24, 32, 48] as const;
