export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  /** null = no theme applied — falls back to index.css neutral defaults */
  theme: "light" | "dark" | "sepia" | null;
  margin: number;
  letterSpacing?: number;
  paragraphSpacing?: number;
  textAlign?: "left" | "center" | "justify";
  contrast?: "soft" | "normal" | "high";
  readingMode?: "vertical" | "pagination";
  paginationAnimation?: "slide" | "flip" | "fade";
  /** Whether to apply custom typography settings (fontFamily, lineHeight, etc.). When false, EPUB original styling is preserved. */
  customTypography?: boolean;
}

/** @deprecated Use ThemeRegistry (src/core/theme-registry.ts) instead. */
export const THEME_COLORS = {} as Record<string, { background: string; text: string }>;
