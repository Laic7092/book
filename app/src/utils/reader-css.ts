import type { ReaderSettings } from "../core/reader-settings";
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
