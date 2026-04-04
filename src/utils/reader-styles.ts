/**
 * 统一的阅读器样式管理
 * 所有 iframe 的 CSS 都从这里生成，确保一致性
 */

import type { ReaderSettings } from "../core/types";
import { THEME_COLORS } from "../core/types";

/**
 * 生成主题 CSS 变量
 * 来自 ReaderSettings: 主题、对比度
 */
export function generateThemeCSS(theme: string, contrast?: string): string {
  const colors = THEME_COLORS[theme as keyof typeof THEME_COLORS] || THEME_COLORS.light;
  let bg = colors.background;
  let text = colors.text;

  if (theme === "dark" && contrast) {
    if (contrast === "soft") {
      bg = "#2a2a2a";
      text = "#d0d0d0";
    } else if (contrast === "high") {
      bg = "#000000";
      text = "#ffffff";
    }
  }

  return `
    :root {
      --reader-bg: ${bg};
      --reader-text: ${text};
      --border-subtle: ${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"};
      --text-secondary: ${theme === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)"};
    }
    body {
      background-color: var(--reader-bg);
      color: var(--reader-text);
      margin: 0;
      padding: 0;
    }
    html,body {
      width: 100%;
      height: 100%;
    }
    * {
      box-sizeing: border-box;
    }
  `;
}

/**
 * 生成基础重置样式（始终注入，不依赖 customTypography 开关）
 * 包含：文字换行、图片响应式、标题断行、默认页边距等基础功能
 */
export function generateBaseCSS(): string {
  return `
    .reader-content {
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
      -webkit-hyphens: auto;
      padding: 24px;
      overflow-x: hidden;
      scrollbar-width: none;
    }

    .reader-content h1,
    .reader-content h2,
    .reader-content h3,
    .reader-content h4,
    .reader-content h5,
    .reader-content h6 {
      break-inside: avoid;
    }

    .reader-content img,
    .reader-content svg,
    .reader-content video,
    .reader-content audio {
      max-width: 100% !important;
      height: auto !important;
      width: auto !important;
    }

    .reader-content img {
      object-fit: contain;
      display: block;
      -webkit-user-drag: none;
      user-drag: none;
    }

    .reader-content svg image {
      max-width: 100% !important;
      height: auto !important;
      width: auto !important;
      display: inline;
      margin: 0;
    }

    .reader-content figure {
      max-width: 100% !important;
      margin: 1em auto;
      text-align: center;
    }

    .reader-content figcaption {
      font-size: 0.9em;
      color: var(--text-secondary);
      margin-top: 0.5em;
      text-align: center;
    }

    .vertical-content {
      padding-bottom: 40vh;
    }
  `;
}

/**
 * 生成自定义排版 CSS
 * 来自 TypographySettings: 字体、行距、字间距、对齐、段落间距
 * 仅当 customTypography=true 时注入，否则返回空字符串
 */
export function generateCustomTypographyCSS(settings: ReaderSettings): string {
  const useCustom = settings.customTypography ?? false;
  if (!useCustom) {
    return "";
  }

  return `
    .reader-content {
      font-family: ${settings.fontFamily};
      line-height: ${settings.lineHeight};
      letter-spacing: ${settings.letterSpacing || 0}em;
      text-align: ${settings.textAlign || "left"};
      padding: ${settings.margin || 24}px;
    }

    .reader-content p {
      margin-bottom: calc(var(--paragraph-spacing, ${settings.paragraphSpacing || 1.2}) * 1em);
      text-rendering: optimizeLegibility;
    }

    .reader-content .chapter-heading {
      margin-bottom: 1em;
      border-bottom: 1px solid var(--border-subtle);
    }
  `;
}

/**
 * 生成完整的样式表（主题 + 基础 + 自定义排版）
 */
export function generateFullCSS(settings: ReaderSettings): string {
  return (
    generateThemeCSS(settings.theme, settings.contrast) +
    generateBaseCSS() +
    generateCustomTypographyCSS(settings)
  );
}
