/**
 * Self-contained PDF renderer using pdf.js.
 * Follows the classic PDF.js Hello World pattern:
 * getDocument → getPage → page.render(canvasContext).
 * Manages its own canvas inside a host-provided container.
 */
export class PdfRenderer {
  private container: HTMLElement | null = null;
  private pdfDoc: any = null;
  private canvas: HTMLCanvasElement | null = null;
  private currentPage = 0;
  private pageCount = 0;
  private scale = 1;
  private rotation = 0;
  /** Incremented before each render; any in-flight render with a stale id is discarded. */
  private renderId = 0;

  onPageChange?: (page: number, total: number) => void;

  async mount(container: HTMLElement, href: string, rawData: ArrayBuffer): Promise<void> {
    this.container = container;
    const pageNum = parseInt(href, 10);
    if (isNaN(pageNum)) return;

    if (!this.pdfDoc) {
      await this.initPdf(rawData);
    }
    this.currentPage = pageNum - 1;

    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.display = "block";
      container.appendChild(this.canvas);
    }

    await this.renderCurrentPage();
  }

  unmount(): void {
    this.renderId++;
    this.canvas?.remove();
    this.canvas = null;
    if (this.container) {
      this.container.innerHTML = "";
    }
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  goToPage(page: number): void {
    this.currentPage = page;
    void this.renderCurrentPage();
  }

  zoomIn(): void {
    this.scale *= 1.2;
    void this.renderCurrentPage();
  }

  zoomOut(): void {
    this.scale /= 1.2;
    void this.renderCurrentPage();
  }

  zoomFit(): void {
    this.scale = 1;
    void this.renderCurrentPage();
  }

  zoomWidth(): void {
    this.scale = -1; // sentinel: fit width
    void this.renderCurrentPage();
  }

  rotate(degrees: number): void {
    this.rotation = (((this.rotation + degrees) % 360) + 360) % 360;
    void this.renderCurrentPage();
  }

  destroy(): void {
    this.renderId++;
    this.canvas?.remove();
    this.canvas = null;
    this.pdfDoc = null;
    this.container = null;
  }

  // ── Private ──

  private async initPdf(rawData: ArrayBuffer): Promise<void> {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;

    try {
      this.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(rawData.slice(0)) }).promise;
    } catch (err) {
      this.pdfDoc = null;
      throw new Error(`Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.pageCount = this.pdfDoc.numPages;
  }

  private async renderCurrentPage(): Promise<void> {
    if (!this.pdfDoc || !this.canvas || !this.container) return;

    const id = ++this.renderId;

    let page: any;
    try {
      page = await this.pdfDoc.getPage(this.currentPage + 1);
    } catch {
      return;
    }
    // Invalidated while waiting for getPage
    if (id !== this.renderId) return;

    // Determine effective scale
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    const baseViewport = page.getViewport({ scale: 1, rotation: this.rotation });

    let effectiveScale: number;
    if (this.scale === -1) {
      // zoomWidth mode: fit page width to container
      effectiveScale = containerWidth / baseViewport.width;
    } else if (this.scale <= 0) {
      // zoomFit mode: fit entire page
      const sx = containerWidth / baseViewport.width;
      const sy = containerHeight / baseViewport.height;
      effectiveScale = Math.min(sx, sy);
    } else {
      effectiveScale = this.scale;
    }

    const viewport = page.getViewport({ scale: effectiveScale, rotation: this.rotation });

    // HiDPI/retina support
    const outputScale = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(viewport.width * outputScale);
    this.canvas.height = Math.floor(viewport.height * outputScale);
    this.canvas.style.width = `${Math.floor(viewport.width)}px`;
    this.canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = this.canvas.getContext("2d")!;
    const transform =
      outputScale !== 1 ? ([outputScale, 0, 0, outputScale, 0, 0] as unknown as any[]) : undefined;

    // Cancel any previous in-flight render
    try {
      await page.render({ canvasContext: ctx, viewport, transform }).promise;
    } catch {
      return; // Render was cancelled by pdf.js internals or errored
    }

    // Invalidated while rendering
    if (id !== this.renderId) return;

    this.onPageChange?.(this.currentPage, this.pageCount);
  }
}
