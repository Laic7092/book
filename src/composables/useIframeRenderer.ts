// Thin iframe initialization utility.
// DOM manipulation (content, page, mode, resources) is handled by the
// state machine bridge via effects — this file only sets up the bare iframe.

import { ref, type Ref } from "vue";
import { generateBaseCSS } from "../reader-engine/reader-styles";

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
  const isReady = ref(false);
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

    isReady.value = true;

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
    isReady.value = false;
  }

  return {
    isReady,
    initIframe,
    getDocument,
    getArticle,
    cleanup,
  };
}
