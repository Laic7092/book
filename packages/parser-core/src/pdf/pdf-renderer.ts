// pdf-viewer-renderer.ts
import "pdfjs-dist/web/pdf_viewer.css";
import * as pdfjsLib from "pdfjs-dist";
import * as pdfjsViewer from "pdfjs-dist/web/pdf_viewer.mjs";

export class PdfRenderer {
  // ── 公开属性 ──
  onPageChange?: (page: number, total: number) => void;

  // ── 内部状态 ──
  private container: HTMLElement | null = null;
  private pdfDoc: any = null;
  private pdfViewer: pdfjsViewer.PDFViewer | null = null;
  private currentPage = 0;
  private pageCount = 0;
  private scale = 1;

  constructor() {
    // 可传入额外配置，这里保持简单
  }

  /**
   * 挂载到指定容器并打开 PDF。
   * @param container  宿主 DOM 元素
   * @param href       要跳转的页码字符串，例如 "3"
   * @param rawData    文件的 ArrayBuffer
   */
  async mount(container: HTMLElement, href: string, rawData: ArrayBuffer): Promise<void> {
    // 如果之前在别的容器上挂载过，先清理
    this.unmount();

    this.container = container;
    const pageNum = parseInt(href, 10);
    if (isNaN(pageNum)) return;

    // 初始化 PDF.js 文档（只需要一次）
    if (!this.pdfDoc) {
      await this.initPdf(rawData);
    }
    this.currentPage = pageNum - 1;

    // 创建 Viewer 实例
    await this.createViewer();

    // 跳转到目标页
    this.goToPage(this.currentPage);
  }

  /** 清理当前容器中的所有 Viewer 元素 */
  unmount(): void {
    if (this.pdfViewer) {
      // 移除 viewer 生成的所有 DOM
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
    this.scale = currentScale * 1.2;
    this.pdfViewer.currentScale = this.scale;
  }

  zoomOut(): void {
    if (!this.pdfViewer) return;
    const currentScale = this.pdfViewer.currentScale;
    this.scale = currentScale / 1.2;
    this.pdfViewer.currentScale = this.scale;
  }

  zoomFit(): void {
    if (this.pdfViewer) {
      this.pdfViewer.currentScaleValue = "page-fit";
      this.scale = 1; // 重置标记，下次 zoomIn 会基于实际 scale
    }
  }

  zoomWidth(): void {
    if (this.pdfViewer) {
      this.pdfViewer.currentScaleValue = "page-width";
      this.scale = 1;
    }
  }

  /** 旋转功能通过 CSS 实现，会对 viewer 容器整体旋转 */
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

  destroy(): void {
    this.unmount();
    this.pdfDoc = null;
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
  }

  private async createViewer(): Promise<void> {
    if (!this.container || !this.pdfDoc) return;

    // 清空容器（mount 时可能已有旧内容）
    this.container.innerHTML = "";

    // 创建 viewer 所需的 DOM 结构
    const viewerDiv = document.createElement("div");
    viewerDiv.className = "pdfViewer";
    this.container.appendChild(viewerDiv);

    // 准备事件总线与辅助服务
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

    // 绑定页面变化事件，用于 onPageChange 回调
    eventBus.on("pagechanging", (evt: { pageNumber: number }) => {
      this.currentPage = evt.pageNumber - 1;
      this.onPageChange?.(this.currentPage, this.pageCount);
    });

    // 加载文档并设置
    this.pdfViewer.setDocument(this.pdfDoc);
    linkService.setDocument(this.pdfDoc, null);

    // 等待至少一页渲染完成，确保后续缩放等操作有效
    await this.pdfViewer.firstPagePromise;
  }
}
