/**
 * 统一的阅读器样式管理
 * 所有 iframe 的 CSS 都从这里生成，确保一致性
 *
 * 样式分层结构:
 * 1. theme-style    → 主题颜色变量（背景、文字、边框）
 * 2. base-style     → 基础重置（换行、图片响应式、断行）
 * 3. typography-style → 排版设置（字号、字体、行距、间距）
 * 4. epub-style     → EPUB 资源样式（动态注入）
 */

import type { ReaderSettings } from "../core/types";
import { THEME_COLORS } from "../core/types";

// ============================================================
// 独立样式生成函数（按需调用）
// ============================================================

/**
 * 生成主题 CSS 变量（仅颜色相关）
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
    }
  `;
}

/**
 * 生成基础重置样式（始终注入）
 */
export function generateBaseCSS(): string {
  return `
    html, body {
      margin: 0;
      padding: 0;
    }

    body {
      display: flow-root;
    }

    p,h1,h2,h3,h4,h5,h6 {
      margin-top: 0;
    }

    body.reader-content {
      word-wrap: break-word;
      overflow-wrap: break-word;
      hyphens: auto;
      -webkit-hyphens: auto;
      margin: 24px;
      touch-action: pan-y;
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

    /* 垂直滚动模式：底部留白供进度条 */
    body.reader-content.vertical-content {
      padding-bottom: 40vh;
    }
  `;
}

/**
 * 生成排版 CSS（字号、字体、行距、间距等）
 * 当 customTypography=false 时，只注入字号（核心设置）
 * 当 customTypography=true 时，注入全部排版设置
 */
export function generateTypographyCSS(settings: ReaderSettings): string {
  const useCustom = settings.customTypography ?? false;

  if (!useCustom) {
    // 只注入字号
    return `
      body.reader-content {
        font-size: ${settings.fontSize}px;
      }
    `;
  }

  // 全部排版设置
  return `
    body.reader-content {
      font-size: ${settings.fontSize}px;
      font-family: ${settings.fontFamily};
      line-height: ${settings.lineHeight};
      letter-spacing: ${settings.letterSpacing || 0}em;
      text-align: ${settings.textAlign || "left"};
      margin: ${settings.margin || 24}px;
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

// ============================================================
// 组合函数（一次性生成完整样式）
// ============================================================

/**
 * @deprecated 使用 generateTypographyCSS 替代
 */
export function generateCustomTypographyCSS(settings: ReaderSettings): string {
  return generateTypographyCSS(settings);
}

/**
 * 生成完整的样式表（主题 + 基础 + 排版）
 */
export function generateFullCSS(settings: ReaderSettings): string {
  return (
    generateThemeCSS(settings.theme, settings.contrast) +
    generateBaseCSS() +
    generateTypographyCSS(settings)
  );
}

/**
 * 生成 iframe 分层样式对象
 */
export function generateIframeStyles(settings: ReaderSettings) {
  return {
    theme: generateThemeCSS(settings.theme, settings.contrast),
    base: generateBaseCSS(),
    typography: generateTypographyCSS(settings),
  };
}
