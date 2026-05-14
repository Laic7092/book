import {
  createReaderMachine,
  type ReaderState,
  type ReaderAction,
  type ReaderEffect,
  type ReaderSession,
  type Chapter,
} from "@book/reader-core";
import { getParserForFormat } from "@book/parser-core";
import { BASE_CSS, PAGINATION_CSS } from "./base-css";
import { resolveChapterResources } from "./content-pipeline";
import { injectResources, clearResources, type ResourceInfo } from "./iframe-resources";

export interface ReaderHostOptions {
  container: HTMLElement;
  onEffect?: (effect: ReaderEffect) => void | Promise<void>;
  onStateChange?: (state: ReaderState) => void;
  onReady?: () => void;
  onClick?: (e: MouseEvent) => void;
  navigateToCfi?: (cfi: string, chapterId: string) => Promise<void>;
  fetchChapter?: (
    bookId: string,
    chapterId: string,
  ) => Promise<{ html: string | undefined; rawData?: ArrayBuffer }>;
  transformContent?: (html: string, bookId: string, chapterId: string) => Promise<string>;
}

export class ReaderHost {
  private machine = createReaderMachine();
  private state!: ReaderState;
  private unsub: () => void;
  private iframe!: HTMLIFrameElement;
  private iframeDoc!: Document;
  private container: HTMLElement;
  private onReady: (() => void) | undefined;
  private onEffect: ((effect: ReaderEffect) => void) | undefined;
  private navigateToCfi: ((cfi: string, chapterId: string) => Promise<void>) | undefined;
  private clickHandlerRef: ((e: MouseEvent) => void) | null = null;
  private fetchChapter: ReaderHostOptions["fetchChapter"];
  private transformContent: ReaderHostOptions["transformContent"];
  private bookFormat = "";
  private resourceUrls = new Map<string, string>();
  private injectedResources = new Map<string, ResourceInfo>();

  constructor(options: ReaderHostOptions) {
    this.container = options.container;
    this.onReady = options.onReady;
    this.onEffect = options.onEffect;
    this.navigateToCfi = options.navigateToCfi;
    this.fetchChapter = options.fetchChapter;
    this.transformContent = options.transformContent;
    this.state = this.machine.getState();
    this.unsub = this.machine.subscribe((s) => {
      this.state = s;
      this.afterState(s);
      options.onStateChange?.(s);
    });
    this.createIframe();
    this.setupClickHandler(options.onClick);
  }

  // ── Public API ──

  init(
    bookId: string,
    chapters: Chapter[],
    chapterIndex = 0,
    mode: "pagination" | "scroll" = "pagination",
    format = "",
  ): void {
    this.bookFormat = format;
    this.dispatch({
      type: "INIT",
      bookId,
      chapters,
      chapterIndex,
      mode,
    });
  }

  loadChapter(chapterId: string, html: string): void {
    this.dispatch({
      type: "CHAPTER_LOADED",
      chapterId,
      html,
    });
  }

  nextPage(): void {
    this.dispatch({ type: "NEXT_PAGE" });
  }

  prevPage(): void {
    this.dispatch({ type: "PREV_PAGE" });
  }

  goToChapter(chapterId: string): void {
    this.dispatch({ type: "GO_TO_CHAPTER", chapterId });
  }

  dispatch(action: ReaderAction): void {
    const effects = this.machine.dispatch(action);
    void this.runEffects(effects);
  }

  getState(): ReaderState {
    return this.state;
  }

  getDocument(): Document | null {
    return this.iframeDoc ?? null;
  }

  getIframeElement(): HTMLIFrameElement {
    return this.iframe;
  }

  setPageMargin(margin: number): void {
    this.iframeDoc.documentElement.style.setProperty("--page-margin", `${margin}px`);
  }

  getSession(): ReaderSession {
    return {
      dispatch: (a) => this.dispatch(a),
      getState: () => this.getState(),
      getDocument: () => this.getDocument(),
      setPageMargin: (m) => this.setPageMargin(m),
      navigateToCfi: (cfi, ch) => this.navigateToCfi?.(cfi, ch) ?? Promise.resolve(),
    };
  }

  handleInternalLink(href: string): void {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))
      return;

    const hashIndex = href.indexOf("#");
    const filePath = hashIndex > 0 ? href.substring(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : "";

    const targetChapter = this.state.chapters.find(
      (c) =>
        c.href &&
        (c.href === filePath || c.href.endsWith(filePath) || c.href.endsWith("/" + filePath)),
    );

    const currentId = this.state.chapters[this.state.currentChapterIndex]?.id;

    if (!filePath) {
      if (anchor) {
        const el =
          this.iframeDoc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
          this.iframeDoc.querySelector(`[name="${CSS.escape(anchor)}"]`);
        if (el) {
          if (this.state.mode === "pagination") {
            const offset =
              el.getBoundingClientRect().left - this.iframeDoc.body.getBoundingClientRect().left;
            const step = this.state.page.iframeWidth || this.iframeDoc.documentElement.clientWidth;
            if (step > 0) {
              this.dispatch({
                type: "GO_TO_PAGE",
                page: Math.floor(offset / step),
              });
            }
          } else {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
      return;
    }

    if (!targetChapter) return;

    if (targetChapter.id !== currentId) {
      this.goToChapter(targetChapter.id);
      return;
    }

    if (anchor) {
      const el =
        this.iframeDoc.querySelector(`[id="${CSS.escape(anchor)}"]`) ||
        this.iframeDoc.querySelector(`[name="${CSS.escape(anchor)}"]`);
      if (el) {
        if (this.state.mode === "pagination") {
          const offset =
            el.getBoundingClientRect().left - this.iframeDoc.body.getBoundingClientRect().left;
          const step = this.state.page.iframeWidth || this.iframeDoc.documentElement.clientWidth;
          if (step > 0) {
            this.dispatch({
              type: "GO_TO_PAGE",
              page: Math.floor(offset / step),
            });
          }
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }

  destroy(): void {
    this.dispatch({ type: "CLEANUP" });
    this.unsub();
    if (this.clickHandlerRef) {
      this.iframeDoc.removeEventListener("click", this.clickHandlerRef);
    }
    clearResources(this.iframeDoc, this.injectedResources);
    for (const [, blobUrl] of this.resourceUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.resourceUrls.clear();
    this.iframe.remove();
  }

  // ── Iframe ──

  private createIframe(): void {
    this.iframe = document.createElement("iframe");
    this.iframe.style.cssText = "width:100%;height:100%;border:none";
    this.container.appendChild(this.iframe);

    const doc = this.iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html data-mode="paginated">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style id="base-style">${BASE_CSS}\n${PAGINATION_CSS}</style>
</head>
<body class="reader-content">
</body>
</html>`);
    doc.close();
    this.iframeDoc = doc;
  }

  private setupClickHandler(onClick: ((e: MouseEvent) => void) | undefined): void {
    this.clickHandlerRef = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest?.("a[href]");
      if (link) {
        e.preventDefault();
        this.handleInternalLink(link.getAttribute("href")!);
        return;
      }
      onClick?.(e);
    };
    this.iframeDoc.addEventListener("click", this.clickHandlerRef);
  }

  // ── Chapter fetching & content pipeline ──

  private async fetchAndLoadChapter(bookId: string, chapterId: string): Promise<void> {
    const { html, rawData } = await this.fetchChapter!(bookId, chapterId);
    if (!html) {
      this.dispatch({ type: "CHAPTER_FAILED", chapterId, error: "Content not found" });
      return;
    }

    let processed = html;

    const parser = getParserForFormat(this.bookFormat);
    if (parser && parser.extractResource) {
      const resolved = await resolveChapterResources(html, rawData, parser, this.resourceUrls);
      if (resolved.resources.length > 0) {
        injectResources(this.iframeDoc, resolved.resources, this.injectedResources);
      }
      processed = resolved.html;
    }

    if (this.transformContent) {
      processed = await this.transformContent(processed, bookId, chapterId);
    }

    this.loadChapter(chapterId, processed);
  }

  // ── Effect runner ──

  private async runEffects(effects: ReaderEffect[]): Promise<void> {
    for (const effect of effects) {
      await this.runEffect(effect);
    }
  }

  private async runEffect(effect: ReaderEffect): Promise<void> {
    switch (effect.type) {
      case "FETCH_CHAPTER":
        if (this.fetchChapter) {
          await this.fetchAndLoadChapter(effect.bookId, effect.chapterId);
        } else {
          await Promise.resolve(this.onEffect?.(effect));
        }
        break;
      case "EMIT":
      case "FETCH_CHAPTERS":
        await Promise.resolve(this.onEffect?.(effect));
        break;

      case "RENDER_HTML": {
        this.iframeDoc.body.innerHTML = effect.html;
        break;
      }

      case "SET_PAGE_CSS":
        this.iframeDoc.documentElement.style.setProperty("--current-page", String(effect.page));
        break;

      case "SET_MODE_CSS":
        this.iframeDoc.documentElement.dataset.mode = effect.mode;
        break;

      case "SET_PAGE_MARGIN_CSS":
        this.iframeDoc.documentElement.style.setProperty("--page-margin", `${effect.margin}px`);
        break;

      case "MEASURE_LAYOUT": {
        requestAnimationFrame(() => {
          if (!this.iframeDoc.body) return;
          const contentWidth = this.iframeDoc.body.scrollWidth;
          const iframeWidth = this.iframeDoc.documentElement.clientWidth;
          this.dispatch({
            type: "LAYOUT_MEASURED",
            contentWidth: Math.max(contentWidth, iframeWidth),
            iframeWidth: Math.max(iframeWidth, 1),
          });
        });
        break;
      }

      case "SCROLL_INTO_VIEW": {
        const el = this.iframeDoc.querySelector<HTMLElement>(
          `[data-chapter-id="${effect.chapterId}"]`,
        );
        if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
        break;
      }

      case "NOOP":
        break;
    }
  }

  // ── State change watcher ──

  private afterState(state: ReaderState): void {
    if (state.status === "ready" && this.onReady) {
      this.onReady();
      this.onReady = undefined;
    }
  }
}
