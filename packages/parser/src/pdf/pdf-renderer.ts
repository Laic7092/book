// pdf-viewer-renderer.ts
import "pdfjs-dist/web/pdf_viewer.css";
import * as pdfjsLib from "pdfjs-dist";
import * as pdfjsViewer from "pdfjs-dist/web/pdf_viewer.mjs";

export interface PdfOutlineItem {
  title: string;
  bold?: boolean;
  italic?: boolean;
  color?: number[];
  dest?: string | any[] | null;
  url?: string | null;
  unsafeUrl?: string | null;
  newWindow?: boolean;
  items: PdfOutlineItem[];
}

export class PdfRenderer {
  onPageChange?: (page: number, total: number) => void;

  private container: HTMLElement | null = null;
  private pdfDoc: any = null;
  private pdfViewer: pdfjsViewer.PDFViewer | null = null;
  private currentPage = 0;
  private pageCount = 0;
  private outlineCache: PdfOutlineItem[] | null = null;

  async mount(container: HTMLElement, href: string, rawData: ArrayBuffer): Promise<void> {
    this.unmount();
    this.container = container;
    const pageNum = parseInt(href, 10);
    if (isNaN(pageNum)) return;

    if (!this.pdfDoc) {
      await this.initPdf(rawData);
    }
    this.currentPage = pageNum - 1;
    await this.createViewer();
    this.goToPage(this.currentPage);
  }

  unmount(): void {
    if (this.pdfViewer) {
      if (this.container) {
        this.container.innerHTML = "";
      }
      this.pdfViewer = null;
    }
    this.container = null;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.pageCount) return;
    this.currentPage = page;
    if (this.pdfViewer) {
      this.pdfViewer.currentPageNumber = page + 1;
    }
  }

  zoomIn(): void {
    if (!this.pdfViewer) return;
    const currentScale = this.pdfViewer.currentScale;
    this.pdfViewer.currentScale = currentScale * 1.2;
  }

  zoomOut(): void {
    if (!this.pdfViewer) return;
    const currentScale = this.pdfViewer.currentScale;
    this.pdfViewer.currentScale = currentScale / 1.2;
  }

  zoomFit(): void {
    if (this.pdfViewer) {
      this.pdfViewer.currentScaleValue = "page-fit";
    }
  }

  zoomWidth(): void {
    if (this.pdfViewer) {
      this.pdfViewer.currentScaleValue = "page-width";
    }
  }

  rotate(degrees: number): void {
    if (!this.container || !this.pdfViewer) return;
    const viewerDiv = this.container.firstElementChild as HTMLElement;
    if (!viewerDiv) return;
    const current = viewerDiv.style.transform.match(/rotate\(([^)]+)deg\)/);
    const currentDeg = current ? parseFloat(current[1]) : 0;
    const newDeg = currentDeg + degrees;
    viewerDiv.style.transform = `rotate(${newDeg}deg)`;
    viewerDiv.style.transformOrigin = "center center";
  }

  getCurrentScale(): number {
    return this.pdfViewer?.currentScale ?? 1;
  }

  async getOutline(): Promise<PdfOutlineItem[]> {
    if (this.outlineCache) return this.outlineCache;
    if (!this.pdfDoc) return [];
    try {
      const outline = await this.pdfDoc.getOutline();
      this.outlineCache = outline || [];
      return this.outlineCache!;
    } catch {
      return [];
    }
  }

  async goToOutlineItem(item: PdfOutlineItem): Promise<void> {
    if (!this.pdfDoc || !this.pdfViewer) return;
    try {
      if (item.url) {
        window.open(item.url, item.newWindow ? "_blank" : "_self");
        return;
      }
      let dest = item.dest;
      if (typeof dest === "string") {
        const destArr = await this.pdfDoc.getDestination(dest);
        if (destArr) dest = destArr;
      }
      if (Array.isArray(dest) && dest.length > 0) {
        const pageIndex = await this.pdfDoc.getPageIndex(dest[0]);
        this.goToPage(pageIndex);
      }
    } catch {
      // ignore navigation errors
    }
  }

  destroy(): void {
    this.unmount();
    this.pdfDoc = null;
    this.outlineCache = null;
  }

  // ── 私有方法 ──

  private async initPdf(rawData: ArrayBuffer): Promise<void> {
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
    this.outlineCache = null;
  }

  private async createViewer(): Promise<void> {
    if (!this.container || !this.pdfDoc) return;

    this.container.innerHTML = "";

    const viewerDiv = document.createElement("div");
    viewerDiv.className = "pdfViewer";
    this.container.appendChild(viewerDiv);

    const eventBus = new pdfjsViewer.EventBus();
    const linkService = new pdfjsViewer.PDFLinkService({ eventBus });

    this.pdfViewer = new pdfjsViewer.PDFViewer({
      container: this.container as HTMLDivElement,
      viewer: viewerDiv,
      eventBus,
      linkService,
      findController: undefined,
      scriptingManager: undefined,
    });

    linkService.setViewer(this.pdfViewer);

    eventBus.on("pagechanging", (evt: { pageNumber: number }) => {
      this.currentPage = evt.pageNumber - 1;
      this.onPageChange?.(this.currentPage, this.pageCount);
    });

    this.pdfViewer.setDocument(this.pdfDoc);
    linkService.setDocument(this.pdfDoc, null);

    await this.pdfViewer.firstPagePromise;
  }
}
