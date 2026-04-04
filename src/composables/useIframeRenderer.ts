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

  // 资源追踪：记录已注入的资源详细信息
  interface ResourceInfo {
    id: string;
    type: "style" | "link";
    content: string; // 对于 style 是 CSS 内容，对于 link 是 href
    element?: HTMLElement; // 实际注入的 DOM 元素
  }
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
   * 生成资源 ID（基于元素内容和类型）
   */
  function generateResourceId(element: HTMLElement): string {
    // 对于 style 元素，使用内容哈希
    if (element instanceof HTMLStyleElement) {
      const content = element.textContent || "";
      return `style-${hashCode(content)}`;
    }

    // 对于 link 元素，使用 href
    if (element instanceof HTMLLinkElement) {
      return `link-${element.href}`;
    }

    // 其他元素使用标签和属性的哈希
    const tag = element.tagName.toLowerCase();
    const attrs = Array.from(element.attributes)
      .map((attr) => `${attr.name}=${attr.value}`)
      .join(",");
    return `${tag}-${hashCode(attrs)}`;
  }

  /**
   * 简单的哈希函数
   */
  function hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
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

    // 1. 构建新资源列表
    const newResources = new Map<string, ResourceInfo>();
    for (const el of elements) {
      const resourceId = generateResourceId(el);

      if (el instanceof HTMLStyleElement) {
        const cssContent = el.textContent || "";
        if (cssContent) {
          newResources.set(resourceId, {
            id: resourceId,
            type: "style",
            content: cssContent,
          });
        }
      } else if (el instanceof HTMLLinkElement && el.rel === "stylesheet") {
        newResources.set(resourceId, {
          id: resourceId,
          type: "link",
          content: el.href,
        });
      }
    }

    // 2. 对比并执行操作
    const oldResourceIds = new Set(injectedResources.keys());
    const newResourceIds = new Set(newResources.keys());

    // 需要移除的资源（在旧列表中但不在新列表中）
    const toRemove = [...oldResourceIds].filter((id) => !newResourceIds.has(id));

    // 需要添加的资源（在新列表中但不在旧列表中）
    const toAdd = [...newResourceIds].filter((id) => !oldResourceIds.has(id));

    // 需要更新的资源（在两个列表中都存在，但内容变化了）
    const toUpdate = [...newResourceIds].filter((id) => {
      if (!oldResourceIds.has(id)) return false;
      const oldInfo = injectedResources.get(id);
      const newInfo = newResources.get(id);
      return oldInfo && newInfo && oldInfo.content !== newInfo.content;
    });

    // 3. 执行移除操作
    for (const id of toRemove) {
      const resourceInfo = injectedResources.get(id);
      if (resourceInfo?.element) {
        resourceInfo.element.remove();
      }
      injectedResources.delete(id);
    }

    // 4. 执行更新操作
    const newLinkElements: HTMLLinkElement[] = [];

    // 处理需要更新的资源
    for (const id of toUpdate) {
      const newInfo = newResources.get(id);
      const oldInfo = injectedResources.get(id);

      if (!newInfo || !oldInfo) continue;

      if (newInfo.type === "style") {
        // 移除旧的 style 元素
        if (oldInfo.element) {
          oldInfo.element.remove();
        }

        // 创建新的 style 元素
        const styleEl = iframeDoc.createElement("style");
        styleEl.textContent = newInfo.content;
        styleEl.setAttribute("data-epub-dynamic", "true");
        styleEl.setAttribute("data-resource-id", id);
        newInfo.element = styleEl;
      } else if (newInfo.type === "link") {
        // 移除旧的 link 元素
        if (oldInfo.element) {
          oldInfo.element.remove();
        }

        // 创建新的 link 元素
        const link = iframeDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = newInfo.content;
        link.setAttribute("data-epub-dynamic", "true");
        link.setAttribute("data-resource-id", id);
        newLinkElements.push(link);
        newInfo.element = link;
      }

      // 更新追踪信息
      injectedResources.set(id, newInfo);
    }

    // 5. 执行添加操作
    for (const id of toAdd) {
      const resourceInfo = newResources.get(id);
      if (!resourceInfo) continue;

      if (resourceInfo.type === "style") {
        const styleEl = iframeDoc.createElement("style");
        styleEl.textContent = resourceInfo.content;
        styleEl.setAttribute("data-epub-dynamic", "true");
        styleEl.setAttribute("data-resource-id", id);
        resourceInfo.element = styleEl;
      } else if (resourceInfo.type === "link") {
        const link = iframeDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = resourceInfo.content;
        link.setAttribute("data-epub-dynamic", "true");
        link.setAttribute("data-resource-id", id);
        newLinkElements.push(link);
        resourceInfo.element = link;
      }

      injectedResources.set(id, resourceInfo);
    }

    // 6. 合并所有 CSS 到 epub-style 标签
    // 收集所有当前有效的 style 资源内容
    const allCssParts: string[] = [];
    for (const [_id, info] of injectedResources.entries()) {
      if (info.type === "style") {
        allCssParts.push(info.content);
      }
    }

    const epubStyle = iframeDoc.getElementById("epub-style");
    if (epubStyle) {
      epubStyle.textContent = allCssParts.join("\n");
    }

    // 7. 注入新的 link 元素
    for (const link of newLinkElements) {
      iframeDoc.head.appendChild(link);
    }
  }

  /**
   * 清空 EPUB 资源样式
   */
  function clearEpubResources(): void {
    if (!iframeDoc) return;

    // 清空 epub-style 标签内容
    const epubStyle = iframeDoc.getElementById("epub-style");
    if (epubStyle) {
      epubStyle.textContent = "";
    }

    // 移除所有追踪的动态资源元素
    for (const [_id, info] of injectedResources.entries()) {
      if (info?.element) {
        info.element.remove();
      }
    }

    // 清空资源追踪
    injectedResources.clear();
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
