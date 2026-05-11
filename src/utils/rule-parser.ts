/**
 * Legado-style rule parser — supports JSOUP, CSS selectors, XPath,
 * regex AllInOne (chapter lists), and regex cleanup.
 *
 * JSOUP:    class.name.0@tag.a.0@text
 * CSS:      @css:div.book > a.title@href
 * XPath:    //*[@id="content"]
 * Regex:    :href="(/read[^"]*html)">([^<]*)
 * Cleanup:  ##old##new
 */

// ── Types ──

export interface RuleSeg {
  css: string;
  index?: number;
}

export interface ParsedRule {
  type: "jsoup" | "xpath" | "regex-allinone";
  steps: RuleSeg[];
  extractor: string;
  /** XPath expression (xpath mode) */
  xpath?: string;
  /** Regex pattern (regex-allinone mode) */
  regexPattern?: string;
  regex?: [RegExp, string];
}

export interface BookSearchItem {
  name: string;
  author: string;
  coverUrl?: string;
  bookUrl: string;
  summary?: string;
  kind?: string;
}

export interface BookChapter {
  name: string;
  url: string;
}

// ── Detect rule type ──

function detectType(rule: string): "jsoup" | "xpath" | "regex-allinone" {
  if (rule.startsWith("//") || rule.startsWith("@XPath:")) return "xpath";
  if (rule.startsWith(":")) return "regex-allinone";
  // 新增：单属性/单元素 XPath (如 @href, dd/text())
  if (/^@\w+$|^[a-z0-9]+(\/.+)?$/.test(rule) && rule.includes("/")) return "xpath";
  return "jsoup";
}

// ── Parse ──

export function parseRule(raw: string): ParsedRule | null {
  if (!raw) return null;
  let rule = raw.trim();

  // Strip trailing regex transform  ##pat##replacement
  let regex: [RegExp, string] | undefined;
  const rxMatch = rule.match(/##(.+?)##(.*)$/);
  if (rxMatch) {
    try {
      regex = [new RegExp(rxMatch[1], "g"), rxMatch[2]];
    } catch {
      /* ignore invalid regex */
    }
    rule = rule.slice(0, rxMatch.index);
  }

  const type = detectType(rule);

  if (type === "xpath") {
    const xpath = rule.startsWith("@XPath:") ? rule.slice(7).trim() : rule;
    return { type, steps: [], extractor: "text", xpath, regex };
  }

  if (type === "regex-allinone") {
    // Strip leading ":"
    return { type, steps: [], extractor: "text", regexPattern: rule.slice(1), regex };
  }

  // JSOUP / CSS mode
  if (rule.startsWith("@css:")) {
    const rest = rule.slice(5);
    const atPos = rest.lastIndexOf("@");
    if (atPos > 0) {
      return {
        type,
        steps: [{ css: rest.slice(0, atPos).trim() }],
        extractor: rest.slice(atPos + 1).trim() || "text",
        regex,
      };
    }
    return { type, steps: [{ css: rest.trim() }], extractor: "text", regex };
  }

  // JSOUP-style: split by @
  const parts = rule.split("@");
  if (parts.length === 0) return null;

  const rawSteps = parts.slice(0, -1);
  const last = parts[parts.length - 1];
  let extractor = "text";
  const steps: RuleSeg[] = [];

  for (const s of rawSteps) {
    const seg = parseSegment(s);
    if (seg) steps.push(seg);
  }

  const lastSeg = parseSegment(last);
  if (lastSeg && !isExtractor(last)) {
    steps.push(lastSeg);
  } else if (isExtractor(last)) {
    extractor = last;
  } else if (lastSeg) {
    steps.push(lastSeg);
  }

  return { type, steps, extractor, regex };
}

function parseSegment(s: string): RuleSeg | null {
  if (!s) return null;
  if (s === "children") return { css: ":scope > *" };

  const parts = s.split(".");
  const type = parts[0];

  if (type === "children") {
    const idx = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
    return { css: ":scope > *", index: isNaN(idx!) ? undefined : idx };
  }

  if (type === "text") {
    // text keyword matching not implemented in simplified edition
    const idxVal = parts.map((p) => parseInt(p, 10)).find((n) => !isNaN(n));
    return { css: "*", index: idxVal };
  }

  const name = parts
    .slice(1)
    .filter((p) => isNaN(parseInt(p, 10)))
    .join(".");
  const idxVal = parts.map((p) => parseInt(p, 10)).find((n) => !isNaN(n));

  let css: string;
  switch (type) {
    case "class":
      css = name ? `.${name.replace(/\s+/g, ".")}` : "*";
      break;
    case "id":
      css = name ? `#${name}` : "*";
      break;
    case "tag":
      css = name || "*";
      break;
    default:
      css = name || "*";
  }

  return { css, index: idxVal };
}

function isExtractor(s: string): boolean {
  return ["text", "ownText", "textNodes", "href", "src", "html", "all"].includes(s.trim());
}

// ── XPath evaluation ──

/**
 * Evaluate an XPath expression against a context node.
 * When `root` is an Element, `//` is automatically scoped to `.//`
 * so the search is confined to that element's subtree.
 */
function evalXPathNodes(root: Node, xpath: string): Node[] {
  const doc =
    root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : (root.ownerDocument ?? document);

  try {
    // 对于属性 XPath（@href），用 evaluate 获取 STRING_TYPE 也可
    const scoped =
      root.nodeType === Node.ELEMENT_NODE && !xpath.startsWith(".")
        ? `.${xpath.startsWith("/") ? "" : "/"}${xpath}`
        : xpath;

    // 先判断是否为纯属性 XPath（以 @ 开头且只有属性）
    if (/^@[^/]+$/.test(xpath.trim())) {
      // 直接获取属性值
      if (root.nodeType === Node.ELEMENT_NODE) {
        const attrName = xpath.trim().slice(1);
        const value = (root as Element).getAttribute(attrName);
        // @ts-ignore
        return value ? [new Attr(attrName, value)] : [];
      }
    }

    const result = doc.evaluate(scoped, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const nodes: Node[] = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      const n = result.snapshotItem(i);
      if (n) nodes.push(n);
    }
    return nodes;
  } catch (e) {
    console.error("XPath evaluation error", xpath, e);
    return [];
  }
}

function extractXPathValues(root: Node, xpath: string): string[] {
  const doc =
    root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : (root.ownerDocument ?? document);

  // 处理纯属性 XPath（如 @href）
  if (/^@[^/]+$/.test(xpath.trim()) && root.nodeType === Node.ELEMENT_NODE) {
    const attrName = xpath.trim().slice(1);
    const value = (root as Element).getAttribute(attrName);
    return value ? [value] : [];
  }

  // Try STRING_TYPE first (handles /@content, /text() patterns)
  try {
    const scoped =
      root.nodeType === Node.ELEMENT_NODE && !xpath.startsWith(".")
        ? `.${xpath.startsWith("/") ? "" : "/"}${xpath}`
        : xpath;
    const strResult = doc.evaluate(scoped, root, null, XPathResult.STRING_TYPE, null);
    if (strResult.stringValue) return [strResult.stringValue];
  } catch {
    /* fall through */
  }

  const nodes = evalXPathNodes(root, xpath);
  return nodes
    .map((n) => {
      if (n.nodeType === Node.ATTRIBUTE_NODE) return (n as Attr).value;
      if (n.nodeType === Node.TEXT_NODE) return (n as Text).textContent?.trim() ?? "";
      return (n as Element).textContent?.trim() ?? "";
    })
    .filter(Boolean);
}

// ── Regex AllInOne ──

function applyRegexAllInOne(html: string, pattern: string): RegExpExecArray[] {
  const regex = new RegExp(pattern, "g");
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    matches.push(m);
  }
  return matches;
}

// ── Public query API ──

export function queryAll(root: ParentNode, rule: string, html?: string): string[] {
  const parsed = parseRule(rule);
  if (!parsed) return [];

  if (parsed.type === "xpath") {
    return extractXPathValues(root as Node, parsed.xpath!).map((v) =>
      parsed.regex ? v.replace(parsed.regex[0], parsed.regex[1]).trim() : v.trim(),
    );
  }

  if (parsed.type === "regex-allinone" && html) {
    const matches = applyRegexAllInOne(html, parsed.regexPattern!);
    // For regex-allinone, the rule itself defines captures.
    // queryAll returns the full match text; capture group extraction
    // is handled separately via getChapterList().
    return matches.map((m) => m[0]);
  }

  const elements = applySteps(root, parsed.steps);
  return elements
    .map((el) => {
      const val = extract(el, parsed.extractor);
      if (val === null) return "";
      return parsed.regex ? val.replace(parsed.regex[0], parsed.regex[1]).trim() : val.trim();
    })
    .filter(Boolean);
}

export function querySingle(root: ParentNode, rule: string, html?: string): string | null {
  const vals = queryAll(root, rule, html);
  return vals.length > 0 ? vals[0] : null;
}

// ── Chapter list extraction (regex AllInOne) ──

export function getChapterList(
  html: string,
  listRule: string,
  nameGroup: string,
  urlGroup: string,
): BookChapter[] {
  const parsed = parseRule(listRule);
  if (!parsed || parsed.type !== "regex-allinone") return [];

  const matches = applyRegexAllInOne(html, parsed.regexPattern!);

  // Parse capture group references like "$1", "$2"
  const nameIdx = parseInt(nameGroup.replace("$", ""), 10);
  const urlIdx = parseInt(urlGroup.replace("$", ""), 10);

  return matches
    .map((m) => ({
      name: m[nameIdx] ?? "",
      url: m[urlIdx] ?? "",
    }))
    .filter((c) => c.name && c.url);
}

// ── Search result parsing (XPath + mixed) ──

export function parseSearchResults(html: string, rules: Record<string, string>): BookSearchItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Detect rule type
  const listRule = rules.bookList || "tag.li";
  const listType = detectType(listRule);

  let listElements: Element[] = [];

  if (listType === "xpath") {
    const nodes = evalXPathNodes(
      doc,
      listRule.startsWith("@XPath:") ? listRule.slice(7) : listRule,
    );
    listElements = nodes.filter((n) => n instanceof Element) as Element[];
  } else {
    const parsed = parseRule(listRule);
    if (parsed) listElements = applySteps(doc, parsed.steps);
  }

  return listElements.map((el) => ({
    name: querySingle(el, rules.name || "tag.a@text") || "",
    author: querySingle(el, rules.author || "tag.span@text") || "",
    coverUrl: rules.coverUrl ? (querySingle(el, rules.coverUrl) ?? undefined) : undefined,
    bookUrl: querySingle(el, rules.bookUrl || "tag.a@href") || "",
    summary: rules.summary ? (querySingle(el, rules.summary) ?? undefined) : undefined,
    kind: rules.kind ? (querySingle(el, rules.kind) ?? undefined) : undefined,
  }));
}

// ── Book info extraction (XPath-based) ──

export function parseBookInfo(html: string, rules: Record<string, string>): Record<string, string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const info: Record<string, string> = {};

  for (const [key, rule] of Object.entries(rules)) {
    if (!rule) continue;
    const val = querySingle(doc, rule);
    if (val) info[key] = val;
  }

  return info;
}

// ── Chapter list (JSOUP/CSS mode) ──

export function parseChapterList(
  html: string,
  listRule: string,
  nameRule: string,
  urlRule: string,
): BookChapter[] {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const parsed = parseRule(listRule);
  if (!parsed) return [];

  let listElements: Element[] = [];

  if (parsed.type === "xpath" && parsed.xpath) {
    // 使用 evalXPathNodes 获取章节链接元素
    const nodes = evalXPathNodes(doc, parsed.xpath);
    listElements = nodes.filter((n) => n instanceof Element) as Element[];
  } else {
    // JSOUP/CSS 模式
    listElements = applySteps(doc, parsed.steps);
  }

  const seen = new Set<string>();

  const chapters = listElements
    .map((el) => {
      let name = "";
      let url = "";

      if (nameRule && detectType(nameRule) === "xpath") {
        const nodes = evalXPathNodes(el, nameRule);
        name = nodes.map((n) => (n as Text).textContent?.trim() ?? "").join("") || "";
      } else {
        name = querySingle(el, nameRule || "tag.a@text") || "";
      }

      if (urlRule && detectType(urlRule) === "xpath") {
        const nodes = evalXPathNodes(el, urlRule);
        url = (nodes[0] as Attr)?.value ?? "";
      } else {
        url = querySingle(el, urlRule || "tag.a@href") || "";
      }

      return { name, url };
    })
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

  return chapters;
}

// ── Content extraction ──

export function extractContent(html: string, rule: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const result = querySingle(doc, rule) ?? "";
  // Cleanup if requested (already handled via regex in querySingle)
  return result;
}

// ── Internal helpers ──

function applySteps(root: ParentNode, steps: RuleSeg[]): Element[] {
  let current: Element[] = [];

  if (steps.length === 0) {
    if (root instanceof Element) return [root];
    return [];
  }

  const firstStep = steps[0];
  if (firstStep.css === ":scope > *") {
    current = Array.from(root.children) as Element[];
  } else {
    current = Array.from(root.querySelectorAll(firstStep.css));
  }

  if (firstStep.index !== undefined) {
    const idx = firstStep.index < 0 ? current.length + firstStep.index : firstStep.index;
    current = idx >= 0 && idx < current.length ? [current[idx]] : [];
  }

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    const next: Element[] = [];
    for (const el of current) {
      if (step.css === ":scope > *") {
        next.push(...(Array.from(el.children) as Element[]));
      } else {
        next.push(...Array.from(el.querySelectorAll(step.css)));
      }
    }
    if (step.index !== undefined) {
      const idx = step.index < 0 ? next.length + step.index : step.index;
      current = idx >= 0 && idx < next.length ? [next[idx]] : [];
    } else {
      current = next;
    }
  }

  return current;
}

function extract(el: Element, extractor: string): string | null {
  switch (extractor) {
    case "text":
      return el.textContent?.trim() ?? "";
    case "ownText":
      return (
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim() ?? "")
          .join("")
          .trim() || null
      );
    case "textNodes":
      return el.textContent?.trim() ?? null;
    case "href":
      return (el as HTMLAnchorElement).getAttribute("href");
    case "src":
      return (el as HTMLImageElement).getAttribute("src");
    case "html":
      return el.innerHTML;
    case "all":
      return el.outerHTML;
    default:
      return el.textContent?.trim() ?? null;
  }
}
