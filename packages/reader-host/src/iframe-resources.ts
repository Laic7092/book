export interface ResourceInfo {
  id: string;
  type: "style" | "link";
  content: string;
  element?: HTMLElement;
}

export function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function generateResourceId(element: HTMLElement): string {
  if (element instanceof HTMLStyleElement) {
    const content = element.textContent || "";
    return `style-${hashCode(content)}`;
  }

  if (element instanceof HTMLLinkElement) {
    return `link-${element.href}`;
  }

  const tag = element.tagName.toLowerCase();
  const attrs = Array.from(element.attributes)
    .map((attr) => `${attr.name}=${attr.value}`)
    .join(",");
  return `${tag}-${hashCode(attrs)}`;
}

export function injectResources(
  doc: Document,
  elements: HTMLElement[],
  injectedResources: Map<string, ResourceInfo>,
  styleTagId = "resource-style",
  dynamicAttrName = "data-resource-dynamic",
): void {
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

  const oldResourceIds = new Set(injectedResources.keys());
  const newResourceIds = new Set(newResources.keys());

  const toRemove = [...oldResourceIds].filter((id) => !newResourceIds.has(id));
  const toAdd = [...newResourceIds].filter((id) => !oldResourceIds.has(id));
  const toUpdate = [...newResourceIds].filter((id) => {
    if (!oldResourceIds.has(id)) return false;
    const oldInfo = injectedResources.get(id);
    const newInfo = newResources.get(id);
    return oldInfo && newInfo && oldInfo.content !== newInfo.content;
  });

  for (const id of toRemove) {
    const resourceInfo = injectedResources.get(id);
    if (resourceInfo?.element) {
      resourceInfo.element.remove();
    }
    injectedResources.delete(id);
  }

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

  for (const link of newLinkElements) {
    doc.head.appendChild(link);
  }
}

export function clearResources(
  doc: Document,
  injectedResources: Map<string, ResourceInfo>,
  styleTagId = "resource-style",
): void {
  const styleTag = doc.getElementById(styleTagId);
  if (styleTag) {
    styleTag.textContent = "";
  }

  for (const [_id, info] of injectedResources.entries()) {
    if (info?.element) {
      info.element.remove();
    }
  }

  injectedResources.clear();
}
