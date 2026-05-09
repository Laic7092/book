// Iframe resource injection utilities
// Incrementally updates <link> and <style> elements in the reader iframe

/** 资源追踪：记录已注入的资源详细信息 */
export interface ResourceInfo {
  id: string;
  type: "style" | "link";
  content: string; // 对于 style 是 CSS 内容，对于 link 是 href
  element?: HTMLElement; // 实际注入的 DOM 元素
}

/**
 * 简单的哈希函数
 */
export function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 生成资源 ID（基于元素内容和类型）
 */
export function generateResourceId(element: HTMLElement): string {
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
 * 注入资源到 iframe 的 head 中
 * 智能对比新旧资源，执行增量更新
 *
 * @param doc iframe 的 Document 对象
 * @param elements 要注入的资源元素数组
 * @param injectedResources 已注入资源的追踪 Map
 * @param styleTagId 用于合并 CSS 的 style 标签 ID（默认 "epub-style"）
 * @param dynamicAttrName 动态元素的属性名（默认 "data-dynamic"）
 */
export function injectResources(
  doc: Document,
  elements: HTMLElement[],
  injectedResources: Map<string, ResourceInfo>,
  styleTagId = "resource-style",
  dynamicAttrName = "data-resource-dynamic",
): void {
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

  // 需要移除的资源
  const toRemove = [...oldResourceIds].filter((id) => !newResourceIds.has(id));

  // 需要添加的资源
  const toAdd = [...newResourceIds].filter((id) => !oldResourceIds.has(id));

  // 需要更新的资源
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

  for (const id of toUpdate) {
    const newInfo = newResources.get(id);
    const oldInfo = injectedResources.get(id);

    if (!newInfo || !oldInfo) continue;

    if (newInfo.type === "style") {
      if (oldInfo.element) {
        oldInfo.element.remove();
      }

      const styleEl = doc.createElement("style");
      styleEl.textContent = newInfo.content;
      styleEl.setAttribute(dynamicAttrName, "true");
      newInfo.element = styleEl;
    } else if (newInfo.type === "link") {
      if (oldInfo.element) {
        oldInfo.element.remove();
      }

      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = newInfo.content;
      link.setAttribute(dynamicAttrName, "true");
      newLinkElements.push(link);
      newInfo.element = link;
    }

    injectedResources.set(id, newInfo);
  }

  // 5. 执行添加操作
  for (const id of toAdd) {
    const resourceInfo = newResources.get(id);
    if (!resourceInfo) continue;

    if (resourceInfo.type === "style") {
      const styleEl = doc.createElement("style");
      styleEl.textContent = resourceInfo.content;
      styleEl.setAttribute(dynamicAttrName, "true");
      resourceInfo.element = styleEl;
    } else if (resourceInfo.type === "link") {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = resourceInfo.content;
      link.setAttribute(dynamicAttrName, "true");
      newLinkElements.push(link);
      resourceInfo.element = link;
    }

    injectedResources.set(id, resourceInfo);
  }

  // 6. 合并所有 CSS 到指定 style 标签
  const allCssParts: string[] = [];
  for (const [_id, info] of injectedResources.entries()) {
    if (info.type === "style") {
      allCssParts.push(info.content);
    }
  }

  const styleTag = doc.getElementById(styleTagId);
  if (styleTag) {
    styleTag.textContent = allCssParts.join("\n");
  }

  // 7. 注入新的 link 元素
  for (const link of newLinkElements) {
    doc.head.appendChild(link);
  }
}

/**
 * 清空所有注入的资源
 *
 * @param doc iframe 的 Document 对象
 * @param injectedResources 已注入资源的追踪 Map
 * @param styleTagId 用于合并 CSS 的 style 标签 ID（默认 "epub-style"）
 */
export function clearResources(
  doc: Document,
  injectedResources: Map<string, ResourceInfo>,
  styleTagId = "resource-style",
): void {
  // 清空 style 标签内容
  const styleTag = doc.getElementById(styleTagId);
  if (styleTag) {
    styleTag.textContent = "";
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
