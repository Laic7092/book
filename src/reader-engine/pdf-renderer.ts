/**
 * pdf.js wrapper: init, page render, text layer, annotation layer.
 * Uses pdfjs-dist v5 built-in TextLayer for text selection.
 */
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href;
  return pdfjsLib;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await getPdfjs();
  return lib.getDocument({ data: new Uint8Array(data) }).promise;
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  viewport: import("pdfjs-dist").PageViewport,
  canvas: HTMLCanvasElement,
): Promise<RenderTask> {
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const task = page.render({ canvas, viewport });
  return task;
}

/**
 * Render a text layer using pdfjs-dist's built-in TextLayer class.
 * Returns the TextLayer instance so callers can manage its lifecycle.
 */
export async function renderPdfTextLayer(
  page: PDFPageProxy,
  viewport: import("pdfjs-dist").PageViewport,
  container: HTMLElement,
) {
  const lib = await getPdfjs();
  const textContent = await page.getTextContent();
  const textLayer = new lib.TextLayer({
    textContentSource: textContent,
    container,
    viewport,
  });
  // TextLayer.render() is called internally by the constructor in v5,
  // but we call update to ensure correct rendering.
  textLayer.update({ viewport });
  return textLayer;
}

export interface AnnotationRect {
  subtype: string;
  rect: [number, number, number, number];
  url?: string;
  dest?: string | any[];
}

/**
 * Extract link annotations from a page, with viewport-mapped rects.
 */
export async function getAnnotationRects(
  page: PDFPageProxy,
  viewport: import("pdfjs-dist").PageViewport,
): Promise<AnnotationRect[]> {
  const annotations = await page.getAnnotations();
  return annotations
    .filter((a: any) => a.subtype === "Link")
    .map((a: any) => {
      const vr = viewport.convertToViewportRectangle(a.rect);
      return {
        subtype: a.subtype,
        rect: vr as [number, number, number, number],
        url: a.url,
        dest: a.dest,
      };
    });
}

export function getPageViewport(
  page: PDFPageProxy,
  containerWidth: number,
  containerHeight: number,
  devicePixelRatio: number,
) {
  const base = page.getViewport({ scale: 1 });
  const scaleW = containerWidth / base.width;
  const scaleH = containerHeight / base.height;
  const scale = Math.min(scaleW, scaleH) * devicePixelRatio;
  return page.getViewport({ scale });
}

export type { PDFDocumentProxy, PDFPageProxy, RenderTask };
