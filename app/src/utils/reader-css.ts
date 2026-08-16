import type { CustomFontFace, ReaderSettings } from "../core/reader-settings";
import { themeRegistry } from "../core/theme-registry";

export function generateThemeCSS(
  theme: string | null,
  contrast?: string,
  customColors?: {
    bg?: string;
    text?: string;
    bgImage?: string;
    bgImageRepeat?: string;
    bgImageSize?: string;
  },
): string {
  let bg: string;
  let text: string;
  let textSecondary: string;
  let borderSubtle: string;

  if (theme) {
    const def = themeRegistry.get(theme);
    bg = def.content.background;
    text = def.content.text;

    if (theme === "dark" && contrast) {
      if (contrast === "soft") {
        bg = "#2a2a2a";
        text = "#d0d0d0";
      } else if (contrast === "high") {
        bg = "#000000";
        text = "#ffffff";
      }
    }

    textSecondary =
      def.content.textSecondary ??
      (theme === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)");
    borderSubtle =
      def.content.borderSubtle ?? (theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)");
  } else {
    bg = "#fdfcfb";
    text = "#1f1a17";
    textSecondary = "rgba(0,0,0,0.55)";
    borderSubtle = "rgba(0,0,0,0.08)";
  }

  if (customColors?.bg) bg = customColors.bg;
  if (customColors?.text) text = customColors.text;

  const bgImageCSS = customColors?.bgImage
    ? `
      background-image: url("${customColors.bgImage}");
      background-repeat: ${customColors.bgImageRepeat || "no-repeat"};
      background-size: ${customColors.bgImageSize || "cover"};
      background-position: center;
    `
    : "";

  return `
    :root {
      --reader-bg: ${bg};
      --reader-text: ${text};
      --border-subtle: ${borderSubtle};
      --text-secondary: ${textSecondary};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
      ${bgImageCSS}
    }
  `;
}

export function generateTypographyCSS(settings: ReaderSettings): string {
  const useCustom = settings.customTypography ?? false;

  const fontSizeCSS = settings.fontSize != null ? `font-size: ${settings.fontSize}px;` : "";

  if (!useCustom) {
    return fontSizeCSS ? `body.reader-content { ${fontSizeCSS} }` : "";
  }

  const rules = [
    fontSizeCSS,
    `font-family: ${settings.fontFamily};`,
    `line-height: ${settings.lineHeight};`,
    `letter-spacing: ${settings.letterSpacing || 0}em;`,
    `text-align: ${settings.textAlign || "left"};`,
  ]
    .filter(Boolean)
    .join("\n      ");

  return `
    body.reader-content {
      ${rules}
    }

    body.reader-content p {
      margin-bottom: calc(var(--paragraph-spacing, ${settings.paragraphSpacing || 1.2}) * 1em);
      text-rendering: optimizeLegibility;
    }

    body.reader-content .chapter-heading {
      margin-bottom: 1em;
      border-bottom: 1px solid var(--border-subtle);
    }
  `;
}

// ── Full reader iframe CSS builder ──

export interface CustomColors {
  bg?: string;
  text?: string;
  bgImage?: string;
  bgImageRepeat?: string;
  bgImageSize?: string;
}

export function buildCustomColors(s: {
  useCustomColors?: boolean;
  customBgColor?: string;
  customTextColor?: string;
  customBgImage?: string;
  customBgImageRepeat?: string;
  customBgImageSize?: string;
}): CustomColors | undefined {
  if (!s.useCustomColors && !s.customBgImage) return undefined;
  return {
    bg: s.useCustomColors ? s.customBgColor : undefined,
    text: s.useCustomColors ? s.customTextColor : undefined,
    bgImage: s.customBgImage,
    bgImageRepeat: s.customBgImageRepeat,
    bgImageSize: s.customBgImageSize,
  };
}

function buildFontFacesCSS(fonts: CustomFontFace[]): string {
  return fonts
    .map(
      (f) => `
@font-face {
  font-family: "${f.name}";
  src: url("${f.data}") format("${f.format}");
  font-display: swap;
}`,
    )
    .join("\n");
}

function getActiveCustomFont(
  fonts: CustomFontFace[],
  settings: ReaderSettings,
): CustomFontFace | undefined {
  if (!settings.customFontFamily) return undefined;
  return fonts.find((f) => f.name === settings.customFontFamily);
}

/**
 * Build the full style block injected into the reader iframe: custom font
 * faces + theme + typography increments.
 */
export function buildReaderFullCSS(settings: ReaderSettings, fonts?: CustomFontFace[]): string {
  const customColors = buildCustomColors(settings);
  const themeCSS =
    settings.theme || settings.useCustomColors || settings.customBgImage
      ? generateThemeCSS(settings.theme, settings.contrast, customColors)
      : "";
  let fontFacesCSS = "";
  const activeFont = fonts ? getActiveCustomFont(fonts, settings) : undefined;
  if (activeFont) {
    fontFacesCSS = buildFontFacesCSS([activeFont]);
  }
  // Base layout CSS is owned by reader-engine (injected into the iframe);
  // this style only carries theme + typography increments.
  return fontFacesCSS + themeCSS + generateTypographyCSS(settings);
}
