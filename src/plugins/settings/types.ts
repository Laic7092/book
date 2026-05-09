export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: "light" | "dark" | "sepia";
  margin: number;
  letterSpacing?: number;
  paragraphSpacing?: number;
  textAlign?: "left" | "center" | "justify";
  contrast?: "soft" | "normal" | "high";
  scrollMode?: "vertical" | "pagination";
  paginationAnimation?: "slide" | "flip" | "fade";
  /** Whether to apply custom typography settings (fontFamily, lineHeight, etc.). When false, EPUB original styling is preserved. */
  customTypography?: boolean;
}

export const THEME_COLORS = {
  light: {
    background: "#ffffff",
    text: "#333333",
  },
  dark: {
    background: "#1a1a1a",
    text: "#e0e0e0",
  },
  sepia: {
    background: "#f4ecd8",
    text: "#5b4636",
  },
};
