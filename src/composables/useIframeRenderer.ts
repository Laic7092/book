import { ref, type Ref } from "vue";
import { generateBaseCSS } from "../reader-engine/reader-styles";
import {
  type ResourceInfo,
  injectResources,
  clearResources,
} from "../reader-engine/iframe-resources";

export interface IframeRendererOptions {
  isPaginationMode: boolean;
}

export interface IframeLinkClickEvent {
  type: "link-click";
  href: string;
}

/**
 * Iframe renderer composable.
 *
 * iframe internal style structure:
 * - <style id="base-style">       — constant reset styles
 * - <style id="resource-style">   — format resource styles (CSS, fonts)
 * - <style id="pagination-style"> — pagination column layout
 * - <style id="plugin-*">         — plugin-injected styles (theme, typography via CssAPI)
 */
export function useIframeRenderer(
  iframeRef: Ref<HTMLIFrameElement | null>,
  options: Ref<IframeRendererOptions>,
  onLinkClick?: (message: IframeLinkClickEvent) => void,
) {
  const isReady = ref(false);
  let iframeDoc: Document | null = null;

  const injectedResources = new Map<string, ResourceInfo>();

  const messageHandler = (event: MessageEvent) => {
    if (!onLinkClick || !event.data || event.data.type !== "link-click") return;
    onLinkClick(event.data as IframeLinkClickEvent);
  };

  function initIframe() {
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
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <style id="base-style">${baseCSS}</style>
        <style id="resource-style"></style>
        <style id="pagination-style"></style>
        ${linkHandlerScript}
      </head>
      <body class="reader-content${!options.value.isPaginationMode ? " vertical-content" : ""}"></body>
      </html>
    `);
    iframeDoc.close();

    isReady.value = true;

    if (onLinkClick) {
      window.addEventListener("message", messageHandler);
    }
  }

  function updateContent(html: string) {
    if (!iframeDoc?.body) return;
    iframeDoc.body.innerHTML = html;
  }

  function syncResources(elements: HTMLElement[]): void {
    if (!iframeDoc) return;
    injectResources(
      iframeDoc,
      elements,
      injectedResources,
      "resource-style",
      "data-resource-dynamic",
    );
  }

  function clearSyncedResources(): void {
    if (!iframeDoc) return;
    clearResources(iframeDoc, injectedResources, "resource-style");
  }

  function getArticle(): HTMLElement | null {
    return iframeDoc?.body || null;
  }

  function getDocument(): Document | null {
    return iframeDoc;
  }

  function scrollToChapter(chapterId: string): void {
    if (!iframeDoc) return;
    const el = iframeDoc.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }

  function restoreScrollPosition(chapterId: string, progress: number): void {
    if (!iframeDoc) return;
    const el = iframeDoc.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
    if (el) {
      const targetY = el.offsetTop + (progress / 100) * el.offsetHeight;
      const win = iframeDoc.defaultView;
      if (win) {
        win.scrollTo({ top: targetY, behavior: "instant" });
      }
    }
  }

  function cleanup() {
    clearSyncedResources();
    window.removeEventListener("message", messageHandler);
    iframeDoc = null;
    isReady.value = false;
  }

  return {
    isReady,
    initIframe,
    updateContent,
    syncResources,
    clearSyncedResources,
    getArticle,
    getDocument,
    scrollToChapter,
    restoreScrollPosition,
    cleanup,
  };
}
