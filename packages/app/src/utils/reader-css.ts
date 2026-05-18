import type { ReaderSettings } from "../plugins/settings/types";
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

export function generateBaseCSS(): string {
  return `
    html, body {
      margin: 0;
      padding: 0;
      scrollbar-width: none;
    }

    body.reader-content {
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
      -webkit-hyphens: auto;
      margin: var(--page-margin, 24px);
    }

    body.reader-content h1,
    body.reader-content h2,
    body.reader-content h3,
    body.reader-content h4,
    body.reader-content h5,
    body.reader-content h6 {
      break-inside: avoid;
    }

    body.reader-content img,
    body.reader-content svg,
    body.reader-content video,
    body.reader-content audio {
      max-width: 100% !important;
      height: auto !important;
      width: auto !important;
    }

    body.reader-content img {
      object-fit: contain;
      display: block;
      -webkit-user-drag: none;
      user-drag: none;
    }

    body.reader-content svg image {
      max-width: 100% !important;
      height: auto !important;
      width: auto !important;
      display: inline;
      margin: 0;
    }

    body.reader-content figure {
      max-width: 100% !important;
      margin: 1em auto;
      text-align: center;
    }

    body.reader-content figcaption {
      font-size: 0.9em;
      color: var(--text-secondary);
      margin-top: 0.5em;
      text-align: center;
    }

    html[data-mode="paginated"] {
      overflow: hidden;
    }
    html[data-mode="paginated"] body.reader-content {
      column-width: calc(100dvw - 2 * var(--page-margin, 24px));
      column-gap: calc(2 * var(--page-margin, 24px));
      column-fill: auto;
      height: calc(100dvh - 2 * var(--page-margin, 24px));
      overflow: visible;
      transform: translateX(calc(-1 * var(--current-page, 0) * 100dvw));
    }

    html[data-mode="scroll"] {
      overflow-y: auto;
    }
    html[data-mode="scroll"] body.reader-content {
      touch-action: pan-y;
      padding-bottom: 40vh;
      margin: var(--page-margin, 24px);
    }
    html[data-mode="scroll"] .scroll-chapter:not(:first-child) {
      border-top: 1px solid var(--border-subtle, rgba(128,128,128,0.25));
      padding-top: 0;
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
