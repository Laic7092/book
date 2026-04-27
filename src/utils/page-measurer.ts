// Hidden iframe measurer for pagination — encapsulates iframe lifecycle,
// style injection, EPUB resource management, and content height measurement.

import type { ReaderSettings } from "../core/types";
import { generateIframeStyles } from "./reader-styles";
import { type ResourceInfo, injectResources, clearResources } from "./iframe-resources";

export class PageMeasurer {
  private iframe: HTMLIFrameElement | null = null;
  private doc: Document | null = null;
  private body: HTMLElement | null = null;
  private injectedResources = new Map<string, ResourceInfo>();

  get isReady(): boolean {
    return this.body !== null;
  }

  /** Create the hidden iframe and write initial styles. Throws if document is unavailable. */
  init(width: number, height: number, settings: ReaderSettings): void {
    if (this.iframe) this.destroy();

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;left:0;top:0;pointer-events:none;visibility:hidden;border:none;z-index:-1";
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document || null;
    if (!doc) {
      iframe.remove();
      throw new Error("PageMeasurer: cannot access iframe document");
    }

    const styles = generateIframeStyles(settings);

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <style>${styles.theme}</style>
        <style>${styles.base}</style>
        <style>${styles.typography}</style>
        <style id="epub-style"></style>
      </head>
      <body class="reader-content"></body>
      </html>
    `);
    doc.close();

    this.iframe = iframe;
    this.doc = doc;
    this.body = doc.body;
  }

  updateSize(width: number, height: number): void {
    if (!this.iframe) return;
    this.iframe.style.width = `${width}px`;
    this.iframe.style.height = `${height}px`;
  }

  /** Update theme/base/typography style elements when settings change. */
  updateStyles(settings: ReaderSettings): void {
    if (!this.doc) return;
    const styles = generateIframeStyles(settings);
    const elements = this.doc.querySelectorAll("style");
    if (elements.length >= 3) {
      elements[0].textContent = styles.theme;
      elements[1].textContent = styles.base;
      elements[2].textContent = styles.typography;
    }
  }

  injectResources(resources: HTMLElement[]): void {
    if (!this.doc) return;
    injectResources(
      this.doc,
      resources,
      this.injectedResources,
      "epub-style",
      "data-measure-dynamic",
    );
  }

  clearInjectedResources(): void {
    if (!this.doc) return;
    clearResources(this.doc, this.injectedResources, "epub-style");
  }

  // ── Content manipulation ──

  setBodyHTML(html: string): void {
    this.body!.innerHTML = html;
  }

  getBodyHTML(): string {
    return this.body!.innerHTML;
  }

  clearBody(): void {
    this.body!.innerHTML = "";
  }

  /** Parse HTML and append child nodes to body. Returns the appended nodes for later removal. */
  appendChildren(html: string): Node[] {
    const temp = this.doc!.createElement("div");
    temp.innerHTML = html;
    const nodes: Node[] = [];
    for (const child of Array.from(temp.childNodes)) {
      this.body!.appendChild(child);
      nodes.push(child);
    }
    return nodes;
  }

  removeChildren(nodes: Node[]): void {
    for (const node of nodes) {
      this.body!.removeChild(node);
    }
  }

  // ── Measurement ──

  getContentHeight(): number {
    return this.doc?.documentElement?.offsetHeight ?? 100;
  }

  createElement(tag: string): HTMLElement {
    return this.doc!.createElement(tag);
  }

  // ── Cleanup ──

  destroy(): void {
    this.clearInjectedResources();
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
      this.doc = null;
      this.body = null;
    }
  }
}
