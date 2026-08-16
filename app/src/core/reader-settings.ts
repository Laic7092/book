import type { ReaderMode } from "../utils/reader-mode";

/**
 * Reader typography/theme settings.
 *
 * Lives in core (not in the settings plugin) because the reader's CSS
 * pipeline (`utils/reader-css.ts`) and the plugin event bus
 * (`core/plugin-runtime/types.ts` → `settings:changed`) both consume it — core must
 * never import from a plugin. The settings plugin only *owns* the state:
 * defaults, persistence and the settings UI.
 */
export interface ReaderSettings {
  /** null = use EPUB original font size */
  fontSize: number | null;
  fontFamily: string;
  lineHeight: number;
  /** null = no theme applied — falls back to index.css neutral defaults */
  theme: "light" | "dark" | "sepia" | null;
  margin: number;
  letterSpacing?: number;
  paragraphSpacing?: number;
  textAlign?: "left" | "center" | "justify";
  contrast?: "soft" | "normal" | "high";
  readingMode?: ReaderMode;
  paginationAnimation?: "slide" | "flip" | "fade";
  /** Whether to apply custom typography settings (fontFamily, lineHeight, etc.). When false, EPUB original styling is preserved. */
  customTypography?: boolean;

  /** Custom background/text color overrides */
  useCustomColors?: boolean;
  customBgColor?: string;
  customTextColor?: string;
  /** Custom background image (base64 data URL) */
  customBgImage?: string;
  customBgImageRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  customBgImageSize?: "cover" | "contain" | "auto";
  /** Name of a user-uploaded custom font to use */
  customFontFamily?: string;
}

/**
 * A user-uploaded custom font face.
 *
 * Moved to core because the CSS builder and the settings UI both consume it;
 * core must not depend on plugin-private types.
 */
export interface CustomFontFace {
  id: string;
  name: string;
  data: string; // base64-encoded font data
  format: string; // "woff2" | "ttf" | "otf"
}

/**
 * Default reader settings.
 *
 * Kept in core because the reader pipeline and the settings UI both need the
 * canonical defaults; the settings plugin owns persistence/UI only.
 */
export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: null,
  fontFamily: "Literata, Georgia, serif",
  lineHeight: 1.6,
  theme: null,
  margin: 24,
  letterSpacing: 0,
  paragraphSpacing: 1.2,
  textAlign: "left",
  contrast: "normal",
  readingMode: "pagination",
  paginationAnimation: "fade",
  customTypography: false,
  useCustomColors: false,
  customBgColor: "#fdfcfb",
  customTextColor: "#1f1a17",
  customBgImage: undefined,
  customBgImageRepeat: "no-repeat",
  customBgImageSize: "cover",
  customFontFamily: undefined,
};
