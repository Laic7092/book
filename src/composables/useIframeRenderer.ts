import { ref, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";
import {
  generateIframeStyles,
  generateThemeCSS,
  generateTypographyCSS,
} from "../utils/reader-styles";
import { useIframeGestures, type IframeGestureHandlers } from "./useIframeGestures";
import { type ResourceInfo, injectResources, clearResources } from "../utils/iframe-resources";

export interface IframeRendererOptions {
  settings: ReaderSettings;
  isPaginationMode: boolean;
}

export interface IframeLinkClickEvent {
  type: "link-click";
  href: string;
}

export interface IframeScrollUpdate {
  type: "scroll-update";
  percent: number;
  chapterId: string | null;
  chapterProgress: number;
}

type IframeMessageHandler = (message: IframeLinkClickEvent) => void;
type ScrollUpdateHandler = (data: IframeScrollUpdate) => void;

/**
 * Iframe 渲染器 composable
 * 使用 DOM 操作更新内容，避免 document.write 导致的事件监听器丢失
 *
 * iframe 内部样式结构:
 * - <style id="theme-style"> 主题颜色变量（背景、文字、边框）
 * - <style id="base-style"> 基础重置（换行、图片响应式、断行）
 * - <style id="typography-style"> 排版设置（字号、字体、行距、间距）
 * - <style id="epub-style"> EPUB 资源样式（动态注入/移除）
 */
export function useIframeRenderer(
  iframeRef: Ref<HTMLIFrameElement | null>,
  options: Ref<IframeRendererOptions>,
  gestureHandlers?: IframeGestureHandlers,
  onLinkClick?: IframeMessageHandler,
  onScrollUpdate?: ScrollUpdateHandler,
) {
  const isReady = ref(false);
  let iframeDoc: Document | null = null;
  let isInitialized = false;
  let gestures: ReturnType<typeof useIframeGestures> | null = null;

  // 资源追踪：记录已注入的资源详细信息
  const injectedResources = new Map<string, ResourceInfo>();

  // Scroll handler cleanup
  let scrollCleanup: (() => void) | null = null;

  // Message handler for iframe link clicks
  const messageHandler = (event: MessageEvent) => {
    if (!onLinkClick || !event.data || event.data.type !== "link-click") return;
    onLinkClick(event.data as IframeLinkClickEvent);
  };

  /**
   * 初始化 iframe 文档结构（仅调用一次）
   */
  function initIframe() {
    const iframe = iframeRef.value;
    if (!iframe) return;

    iframeDoc = iframe.contentDocument || iframe.contentWindow?.document || null;
    if (!iframeDoc) return;

    // 一次性写入基础结构
    const styles = generateIframeStyles(options.value.settings);

    // 注入链接点击处理脚本（通过 postMessage 传递到主文档）
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
        ${linkHandlerScript}
      </head>
      <body class="reader-content${!options.value.isPaginationMode ? " vertical-content" : ""}"></body>
      </html>
    `);
    iframeDoc.close();

    isInitialized = true;
    isReady.value = true;

    // Register message listener for link clicks
    if (onLinkClick) {
      window.addEventListener("message", messageHandler);
    }

    // 初始化手势识别
    if (gestureHandlers && iframeDoc) {
      gestures = useIframeGestures(iframeDoc, gestureHandlers, {
        enableTap: true,
        enableSwipe: true,
      });
    }

    // 滚动模式：监听 iframe 内部滚动
    if (!options.value.isPaginationMode && onScrollUpdate) {
      setupScrollHandler();
    }
  }

  /**
   * 更新 iframe 内容（使用 DOM 操作）
   */
  function updateContent(html: string) {
    if (!iframeDoc?.body) return;

    iframeDoc.body.innerHTML = html;
  }

  /**
   * 更新样式（直接修改 style 标签内容）
   */
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

  /**
   * 更新 EPUB 资源样式
   * 接收 EPUB 的 <link> 和 <style> 元素，注入到 iframe head
   * 智能对比新旧资源，执行增量更新：
   * - 保留未变化的资源
   * - 更新内容变化的资源
   * - 添加新增的资源
   * - 移除不再需要的资源
   */
  function updateEpubResources(elements: HTMLElement[]): void {
    if (!iframeDoc) return;
    injectResources(iframeDoc, elements, injectedResources, "epub-style", "data-epub-dynamic");
  }

  /**
   * 清空 EPUB 资源样式
   */
  function clearEpubResources(): void {
    if (!iframeDoc) return;
    clearResources(iframeDoc, injectedResources, "epub-style");
  }

  /**
   * 获取 iframe 的 body 元素
   */
  function getBody(): HTMLElement | null {
    return iframeDoc?.body || null;
  }

  /**
   * 获取 iframe 的 body 元素（兼容旧接口）
   */
  function getArticle(): HTMLElement | null {
    return iframeDoc?.body || null;
  }

  /**
   * 获取 iframe document
   */
  function getDocument(): Document | null {
    return iframeDoc;
  }

  // ── 滚动模式：滚动处理 ──

  function setupScrollHandler() {
    if (!iframeDoc || !onScrollUpdate) return;

    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!iframeDoc) return;
        const win = iframeDoc.defaultView;
        if (!win) return;

        const scrollTop = win.scrollY || iframeDoc.documentElement.scrollTop || 0;
        const scrollHeight =
          iframeDoc.documentElement.scrollHeight - iframeDoc.documentElement.clientHeight;
        if (scrollHeight <= 0) return;

        const percent = Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)));

        // 检测当前章节
        const midpoint = scrollTop + win.innerHeight / 2;
        const containers = iframeDoc.querySelectorAll<HTMLElement>("[data-chapter-id]");
        let currentChapterId: string | null = null;
        for (const el of containers) {
          if (midpoint >= el.offsetTop && midpoint < el.offsetTop + el.offsetHeight) {
            currentChapterId = el.getAttribute("data-chapter-id");
            break;
          }
        }

        // 计算章节内进度
        let chapterProgress = 0;
        if (currentChapterId) {
          const el = iframeDoc.querySelector<HTMLElement>(
            `[data-chapter-id="${currentChapterId}"]`,
          );
          if (el && el.offsetHeight > 0) {
            const scrolled = scrollTop - el.offsetTop;
            chapterProgress = Math.min(
              100,
              Math.max(0, Math.round((scrolled / el.offsetHeight) * 100)),
            );
          }
        }

        onScrollUpdate({
          type: "scroll-update",
          percent,
          chapterId: currentChapterId,
          chapterProgress,
        });
      });
    };

    iframeDoc.addEventListener("scroll", handler, { passive: true });
    scrollCleanup = () => iframeDoc?.removeEventListener("scroll", handler);
  }

  /**
   * 滚动到指定章节
   */
  function scrollToChapter(chapterId: string): void {
    if (!iframeDoc) return;
    const el = iframeDoc.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }

  /**
   * 恢复滚动位置（按章节内进度百分比）
   */
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

  /**
   * 滚动到指定 Y 位置
   */
  function scrollTo(y: number): void {
    if (!iframeDoc) return;
    const win = iframeDoc.defaultView;
    if (win) {
      win.scrollTo({ top: y, behavior: "instant" });
    }
  }

  /**
   * 清理
   */
  function cleanup() {
    // 清理滚动监听
    if (scrollCleanup) {
      scrollCleanup();
      scrollCleanup = null;
    }

    clearEpubResources();

    // Remove message listener
    window.removeEventListener("message", messageHandler);

    // 清理手势监听
    if (gestures) {
      gestures.unbind();
      gestures = null;
    }

    iframeDoc = null;
    isInitialized = false;
    isReady.value = false;
  }

  return {
    isReady,
    isInitialized,
    initIframe,
    updateContent,
    updateStyles,
    updateEpubResources,
    clearEpubResources,
    getBody,
    getArticle,
    getDocument,
    scrollToChapter,
    restoreScrollPosition,
    scrollTo,
    cleanup,
  };
}
