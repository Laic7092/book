import { ref, type Ref } from "vue";
import type { ReaderSettings } from "../core/types";
import {
  generateThemeCSS,
  generateBaseCSS,
  generateCustomTypographyCSS,
} from "../utils/reader-styles";
import { useIframeGestures, type IframeGestureHandlers } from "./useIframeGestures";

export interface IframeRendererOptions {
  settings: ReaderSettings;
  isPaginationMode: boolean;
}

/**
 * Iframe 渲染器 composable
 * 使用 DOM 操作更新内容，避免 document.write 导致的事件监听器丢失
 *
 * iframe 内部样式结构:
 * - <style id="theme-style"> 主题样式 (ReaderSettings: 主题、对比度)
 * - <style id="base-style"> 基础重置样式 (始终注入)
 * - <style id="typography-style"> 自定义排版 (TypographySettings 开关控制)
 * - <style id="epub-style"> EPUB 资源样式 (动态注入/移除)
 */
export function useIframeRenderer(
  iframeRef: Ref<HTMLIFrameElement | null>,
  options: Ref<IframeRendererOptions>,
  gestureHandlers?: IframeGestureHandlers,
) {
  const isReady = ref(false);
  let iframeDoc: Document | null = null;
  let articleEl: HTMLElement | null = null;
  let isInitialized = false;
  let gestures: ReturnType<typeof useIframeGestures> | null = null;

  /**
   * 初始化 iframe 文档结构（仅调用一次）
   */
  function initIframe() {
    const iframe = iframeRef.value;
    if (!iframe) return;

    iframeDoc = iframe.contentDocument || iframe.contentWindow?.document || null;
    if (!iframeDoc) return;

    // 一次性写入基础结构
    const themeCSS = generateThemeCSS(
      options.value.settings.theme,
      options.value.settings.contrast,
    );
    const baseCSS = generateBaseCSS();
    const typographyCSS = generateCustomTypographyCSS(options.value.settings);

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style id="theme-style">${themeCSS}</style>
        <style id="base-style">${baseCSS}</style>
        <style id="typography-style">${typographyCSS}</style>
        <style id="epub-style"></style>
      </head>
      <body>
        <article class="reader-content${!options.value.isPaginationMode ? " vertical-content" : ""}"></article>
      </body>
      </html>
    `);
    iframeDoc.close();

    articleEl = iframeDoc.querySelector(".reader-content");
    isInitialized = true;
    isReady.value = true;

    // 初始化手势识别
    if (gestureHandlers && iframeDoc) {
      gestures = useIframeGestures(iframeDoc, gestureHandlers, {
        enableTap: true,
        enableSwipe: true,
      });
    }
  }

  /**
   * 更新 iframe 内容（使用 DOM 操作）
   */
  function updateContent(html: string) {
    if (!articleEl) return;

    articleEl.innerHTML = html;
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
      typographyStyle.textContent = generateCustomTypographyCSS(options.value.settings);
    }
  }

  /**
   * 更新 EPUB 资源样式
   * 接收 EPUB 的 <link> 和 <style> 元素，注入到 iframe head
   * 当切换章节或关闭书籍时，需要调用此方法更新或清空
   */
  function updateEpubResources(elements: HTMLElement[]): void {
    if (!iframeDoc) return;

    const epubStyle = iframeDoc.getElementById("epub-style");
    if (!epubStyle) return;

    // 清空之前的 EPUB 资源
    epubStyle.textContent = "";

    // 收集所有 CSS 内容并合并
    const cssParts: string[] = [];

    for (const el of elements) {
      if (el instanceof HTMLStyleElement) {
        cssParts.push(el.textContent || "");
      } else if (el instanceof HTMLLinkElement && el.rel === "stylesheet") {
        // <link> 元素无法直接获取内容，需要通过 href 加载
        // 这里我们假设 href 已经是 blob URL，直接创建 <link> 标签
        const link = iframeDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = el.href;
        iframeDoc.head.appendChild(link);
      }
    }

    // 合并所有 CSS 到 epub-style
    if (cssParts.length > 0) {
      epubStyle.textContent = cssParts.join("\n");
    }
  }

  /**
   * 清空 EPUB 资源样式
   */
  function clearEpubResources(): void {
    if (!iframeDoc) return;

    const epubStyle = iframeDoc.getElementById("epub-style");
    if (epubStyle) {
      epubStyle.textContent = "";
    }

    // 移除动态添加的 <link> 标签
    const links = iframeDoc.head.querySelectorAll("link[data-epub-resource]");
    links.forEach((link) => link.remove());
  }

  /**
   * 获取 iframe 的 body 元素
   */
  function getBody(): HTMLElement | null {
    return iframeDoc?.body || null;
  }

  /**
   * 获取 iframe 的 article 元素
   */
  function getArticle(): HTMLElement | null {
    return articleEl;
  }

  /**
   * 获取 iframe document
   */
  function getDocument(): Document | null {
    return iframeDoc;
  }

  /**
   * 清理
   */
  function cleanup() {
    clearEpubResources();

    // 清理手势监听
    if (gestures) {
      gestures.unbind();
      gestures = null;
    }

    iframeDoc = null;
    articleEl = null;
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
    cleanup,
  };
}
