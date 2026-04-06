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
) {
  const isReady = ref(false);
  let iframeDoc: Document | null = null;
  let isInitialized = false;
  let gestures: ReturnType<typeof useIframeGestures> | null = null;

  // 资源追踪：记录已注入的资源详细信息
  const injectedResources = new Map<string, ResourceInfo>();

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
      </head>
      <body class="reader-content${!options.value.isPaginationMode ? " vertical-content" : ""}"></body>
      </html>
    `);
    iframeDoc.close();

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
