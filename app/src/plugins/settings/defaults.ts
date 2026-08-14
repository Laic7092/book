import type { ReaderSettings } from "../../core/reader-settings";

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
