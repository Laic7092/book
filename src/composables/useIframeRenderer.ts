import { ref, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";
import {
  generateIframeStyles,
  generateThemeCSS,
  generateTypographyCSS,
} from "../utils/reader-styles";
import { type ResourceInfo, injectResources, clearResources } from "../utils/iframe-resources";

export interface IframeRendererOptions {
  settings: ReaderSettings;
  isPaginationMode: boolean;
}

export interface IframeLinkClickEvent {
  type: "link-click";
  href: string;
}

/**
 * Iframe 渲染器 composable（纯渲染，不处理手势/滚动）
 *
 * iframe 内部样式结构:
 * - <style id="theme-style"> 主题颜色变量
 * - <style id="base-style"> 基础重置
 * - <style id="typography-style"> 排版设置
 * - <style id="epub-style"> EPUB 资源样式
 * - <style id="pagination-style"> 分页列布局
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

    const styles = generateIframeStyles(options.value.settings);

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
        <style id="theme-style">${styles.theme}</style>
        <style id="base-style">${styles.base}</style>
        <style id="typography-style">${styles.typography}</style>
        <style id="epub-style"></style>
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

  function updateStyles() {
    if (!iframeDoc) return;

    const themeStyle = iframeDoc.getElementById("theme-style");
    const typographyStyle = iframeDoc.getElementById("typography-style");

    if (themeStyle) {
      themeStyle.textContent = generateThemeCSS(
        options.value.settings.theme,
        options.value.settings.contrast,
      );
    }

    if (typographyStyle) {
      typographyStyle.textContent = generateTypographyCSS(options.value.settings);
    }
  }

  function updateEpubResources(elements: HTMLElement[]): void {
    if (!iframeDoc) return;
    injectResources(iframeDoc, elements, injectedResources, "epub-style", "data-epub-dynamic");
  }

  function clearEpubResources(): void {
    if (!iframeDoc) return;
    clearResources(iframeDoc, injectedResources, "epub-style");
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
    clearEpubResources();
    window.removeEventListener("message", messageHandler);
    iframeDoc = null;
    isReady.value = false;
  }

  return {
    isReady,
    initIframe,
    updateContent,
    updateStyles,
    updateEpubResources,
    clearEpubResources,
    getArticle,
    getDocument,
    scrollToChapter,
    restoreScrollPosition,
    cleanup,
  };
}
