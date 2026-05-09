/**
 * pdf.js wrapper: init + document loading.
 * Rendering is delegated to pdfjs-dist's PDFSinglePageViewer.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

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

export type { PDFDocumentProxy };
