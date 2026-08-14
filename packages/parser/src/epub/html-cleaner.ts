import { parseXML } from "../base";

function sanitizeResourceAttrs(html: string): string {
  return html
    .replace(
      /(<(?:img|image|video|audio|source|embed|iframe|script)\s[^>]*?)\b(src|srcset|poster)\s*=/gi,
      "$1_$2=",
    )
    .replace(/(<link\s[^>]*?)\b(href)\s*=/gi, "$1_$2=")
    .replace(/(<object\s[^>]*?)\b(data)\s*=/gi, "$1_$2=")
    .replace(/(<svg:image\s[^>]*?)\b(xlink:href|href)\s*=/gi, "$1_$2=")
    .replace(/(<style[^>]*>[\s\S]*?)@import\b/gi, "$1/* @import */");
}

function restoreResourceAttrs(html: string): string {
  return html
    .replace(
      /(<(?:img|image|video|audio|source|embed|iframe|script)\s[^>]*?)\b_(src|srcset|poster)\s*=/gi,
      "$1$2=",
    )
    .replace(/(<link\s[^>]*?)\b_(href)\s*=/gi, "$1$2=")
    .replace(/(<object\s[^>]*?)\b_(data)\s*=/gi, "$1$2=")
    .replace(/(<svg:image\s[^>]*?)\b_(xlink:href|href)\s*=/gi, "$1$2=")
    .replace(/(<style[^>]*>[\s\S]*?)\/\* @import \*\//gi, "$1@import");
}

function applyDomCleanup(doc: Document | HTMLElement): void {
  const removable = doc.querySelectorAll("script, style, noscript");
  removable.forEach((el) => el.remove());

  const mediaElements = doc.querySelectorAll("img, svg, image, video, figure");
  mediaElements.forEach((el) => {
    if (el.tagName.toLowerCase() === "svg") {
      if (!el.getAttribute("viewBox")) {
        const width = el.getAttribute("width");
        const height = el.getAttribute("height");
        if (width && height) {
          const widthNum = parseFloat(width);
          const heightNum = parseFloat(height);
          if (!isNaN(widthNum) && !isNaN(heightNum)) {
            el.setAttribute("viewBox", `0 0 ${widthNum} ${heightNum}`);
          }
        }
      }
    }

    el.removeAttribute("width");
    el.removeAttribute("height");

    const style = el.getAttribute("style");
    if (style) {
      const cleanedStyle = style
        .split(";")
        .filter((prop) => {
          const trimmed = prop.trim().toLowerCase();
          return (
            !trimmed.startsWith("width:") &&
            !trimmed.startsWith("height:") &&
            !trimmed.startsWith("max-width:") &&
            !trimmed.startsWith("max-height:")
          );
        })
        .join(";")
        .trim();

      if (cleanedStyle) {
        el.setAttribute("style", cleanedStyle);
      } else {
        el.removeAttribute("style");
      }
    }
  });
}

function splitBrBlocks(root: Document | HTMLElement): void {
  const SKIP_TAGS = new Set(["pre", "code", "h1", "h2", "h3", "h4", "h5", "h6", "li"]);

  const brs = root.querySelectorAll("br");
  const parents = new Set<Element>();
  for (const br of brs) {
    const p = br.parentElement;
    if (p && p !== root && !SKIP_TAGS.has(p.tagName.toLowerCase())) {
      parents.add(p);
    }
  }
  if (parents.size === 0) return;

  const sorted = Array.from(parents).sort((a, b) => {
    let da = 0,
      db = 0;
    let na: Node | null = a,
      nb: Node | null = b;
    while (na) {
      da++;
      na = na.parentNode;
    }
    while (nb) {
      db++;
      nb = nb.parentNode;
    }
    return db - da;
  });

  for (const el of sorted) {
    const ownerDoc = el.ownerDocument!;
    const tag = el.tagName.toLowerCase();
    const fragment = ownerDoc.createDocumentFragment();
    let group: Node[] = [];
    let firstGroup = true;

    const flush = () => {
      const meaningful = group.filter((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          return n.textContent !== null && n.textContent.trim().length > 0;
        }
        return true;
      });
      if (meaningful.length > 0) {
        const clone = ownerDoc.createElement(tag);
        for (const attr of Array.from(el.attributes)) {
          if (attr.name === "id" && !firstGroup) continue;
          clone.setAttribute(attr.name, attr.value);
        }
        for (const n of meaningful) {
          clone.appendChild(n.cloneNode(true));
        }
        fragment.appendChild(clone);
        firstGroup = false;
      }
      group = [];
    };

    for (const child of Array.from(el.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).tagName.toLowerCase() === "br"
      ) {
        flush();
      } else {
        group.push(child);
      }
    }
    flush();

    el.replaceWith(fragment);
  }
}

export function cleanHtml(html: string): string {
  const xmlDoc = parseXML(html, "application/xhtml+xml");
  const hasXmlError = xmlDoc.querySelector("parsererror");

  if (!hasXmlError) {
    applyDomCleanup(xmlDoc);
    splitBrBlocks(xmlDoc);
    return xmlDoc.documentElement.innerHTML;
  }

  const safeHtml = sanitizeResourceAttrs(html);
  const temp = document.createElement("div");
  temp.innerHTML = safeHtml;

  applyDomCleanup(temp);
  splitBrBlocks(temp);

  const result = temp.innerHTML;
  return restoreResourceAttrs(result);
}
