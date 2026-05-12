import { type Ref } from "vue";
import type { ReaderSettings } from "../plugins/settings/types";
import { THEME_COLORS } from "../plugins/settings/types";

/**
 * Initialize the iframe with the base HTML skeleton and link-click handler.
 *
 * iframe internal style structure:
 * - <style id="base-style">       — reset + mode CSS
 * - <style id="resource-style">   — format resource styles (CSS, fonts) — managed by bridge
 * - <style id="plugin-*">         — plugin-injected styles (theme, typography)
 */
export function useIframeRenderer(
  iframeRef: Ref<HTMLIFrameElement | null>,
  onLinkClick?: (href: string) => void,
) {
  let iframeDoc: Document | null = null;

  const messageHandler = (event: MessageEvent) => {
    if (!onLinkClick || !event.data || event.data.type !== "link-click") return;
    onLinkClick(event.data.href);
  };

  function initIframe(initialMode: "scroll" | "paginated") {
    const iframe = iframeRef.value;
    if (!iframe) return;

    iframeDoc = iframe.contentDocument || iframe.contentWindow?.document || null;
    if (!iframeDoc) return;

    const baseCSS = generateBaseCSS();

    const linkHandlerScript = onLinkClick
      ? `<script>
      (function() {
        document.addEventListener('click', function(e) {
          var link = e.target.closest('a[href]');
          if (!link) return;
          var href = link.getAttribute('href');
          if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return;
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: 'link-click', href: href }, window.location.origin);
        }, true);
      })();
    </script>`
      : "";

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html data-mode="${initialMode}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <style id="base-style">${baseCSS}</style>
        <style id="resource-style"></style>
        ${linkHandlerScript}
      </head>
      <body class="reader-content"></body>
      </html>
    `);
    iframeDoc.close();

    if (onLinkClick) {
      window.addEventListener("message", messageHandler);
    }
  }

  function getDocument(): Document | null {
    return iframeDoc;
  }

  function getArticle(): HTMLElement | null {
    return iframeDoc?.body || null;
  }

  function cleanup() {
    window.removeEventListener("message", messageHandler);
    iframeDoc = null;
  }

  return {
    initIframe,
    getDocument,
    getArticle,
    cleanup,
  };
}

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

    /* ── Mode-specific layout ── */

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
      will-change: transform;
      padding-bottom: 40vh;
      margin: var(--page-margin, 24px);
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
