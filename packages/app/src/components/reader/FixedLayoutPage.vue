<script setup lang="ts">
import { ref, onUnmounted, nextTick } from "vue";
import { openPdf } from "../../utils/pdf-renderer";
import type { FixedLayoutSurface } from "@book/reader-host";

const props = defineProps<{
  bookId: string;
  format: "pdf" | "cbz";
}>();

const emit = defineEmits<{
  linkClick: [href: string];
}>();

// ── Template refs ──

const containerRef = ref<HTMLElement | null>(null);
const pdfContainerRef = ref<HTMLDivElement | null>(null);
const pdfViewerRef = ref<HTMLDivElement | null>(null);
const imageUrl = ref("");
const isCbzReady = ref(false);

// ── Internal state ──

let pdfDoc: any = null;
let viewer: any = null;
let currentBlobUrl: string | null = null;
let currentPage = 0;
let pageCount = 0;
const outline = ref<Array<{ title: string; pageNumber: number }>>([]);

// ── FixedLayoutSurface implementation ──

async function loadChapter(href: string, rawData: ArrayBuffer): Promise<void> {
  if (props.format === "pdf") {
    await loadPdfChapter(href, rawData);
  } else if (props.format === "cbz") {
    await loadCbzChapter(href, rawData);
  }
}

async function loadPdfChapter(href: string, rawData: ArrayBuffer): Promise<void> {
  const pageNum = parseInt(href, 10);
  if (isNaN(pageNum)) return;

  if (!pdfDoc) {
    pdfDoc = await openPdf(rawData);
    pageCount = pdfDoc.numPages;
    await initPdfViewer();
    await extractOutline();
  }

  viewer.currentPageNumber = pageNum;
  currentPage = pageNum - 1;
}

async function initPdfViewer(): Promise<void> {
  await nextTick();
  const container = pdfContainerRef.value;
  const viewerDiv = pdfViewerRef.value;
  if (!container || !viewerDiv) return;

  const { PDFSinglePageViewer, EventBus, SimpleLinkService } =
    await import("pdfjs-dist/web/pdf_viewer.mjs");
  await import("pdfjs-dist/web/pdf_viewer.css");

  const eventBus = new EventBus();
  const linkService = new SimpleLinkService();
  linkService.externalLinkEnabled = true;

  viewer = new PDFSinglePageViewer({
    container,
    viewer: viewerDiv,
    eventBus,
    linkService,
    textLayerMode: 1,
    annotationMode: 2,
    removePageBorders: true,
  });

  linkService.setViewer(viewer);
  linkService.setDocument(pdfDoc);
  viewer.setDocument(pdfDoc);

  eventBus.on("linkclicked", (evt: any) => {
    if (evt.source instanceof HTMLAnchorElement) return;
    emit("linkClick", String(evt.pageNumber));
  });
}

async function extractOutline(): Promise<void> {
  if (!pdfDoc) return;
  try {
    const rawOutline = await pdfDoc.getOutline();
    if (rawOutline?.length) {
      const flatten = async (nodes: any[]): Promise<void> => {
        for (const node of nodes) {
          if (!node.title) continue;
          let pn = 1;
          try {
            if (Array.isArray(node.dest) && node.dest.length > 0) {
              pn = (await pdfDoc.getPageIndex(node.dest[0])) + 1;
            }
          } catch {
            /* unresolvable */
          }
          outline.value.push({ title: node.title, pageNumber: pn });
          if (node.items?.length) await flatten(node.items);
        }
      };
      await flatten(rawOutline);
    }
  } catch {
    /* outline is optional */
  }
}

async function loadCbzChapter(href: string, rawData: ArrayBuffer): Promise<void> {
  isCbzReady.value = false;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  imageUrl.value = "";

  const ext = href.split(".").pop() || "jpg";
  const mimeType = getMimeType(ext);

  const { ZipReader, Uint8ArrayReader, BlobWriter } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(rawData)));
  try {
    const entries = await reader.getEntries();
    const allFiles = entries.filter((e: any) => !e.directory);
    pageCount = allFiles.length;
    const entry = allFiles.find((e: any) => e.filename === href) as any;
    if (!entry) return;
    const blob = (await entry.getData(new BlobWriter())) as Blob;
    const data = await blob.arrayBuffer();
    currentBlobUrl = URL.createObjectURL(new Blob([data], { type: mimeType }));
    imageUrl.value = currentBlobUrl;
    currentPage = allFiles.indexOf(entry);
    nextTick(() => {
      isCbzReady.value = true;
    });
  } finally {
    await reader.close();
  }
}

function getMimeType(ext: string): string {
  const m: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return m[ext.toLowerCase()] || "image/jpeg";
}

function getCurrentPage(): number {
  return currentPage;
}

function getPageCount(): number {
  return pageCount;
}

function goToPage(page: number): void {
  if (viewer) {
    viewer.currentPageNumber = page + 1;
    currentPage = page;
  }
}

function zoomIn(): void {
  if (!viewer) return;
  viewer.increaseScale({ scaleFactor: 1.1 });
}
function zoomOut(): void {
  if (!viewer) return;
  viewer.decreaseScale({ scaleFactor: 1.1 });
}
function zoomFit(): void {
  if (!viewer) return;
  viewer.currentScaleValue = "page-fit";
}
function zoomWidth(): void {
  if (!viewer) return;
  viewer.currentScaleValue = "page-width";
}
function rotate(deg: number): void {
  if (!viewer) return;
  viewer.pagesRotation = (((viewer.pagesRotation + deg) % 360) + 360) % 360;
}

function destroy(): void {
  viewer?.cleanup();
  viewer = null;
  pdfDoc = null;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

// ── Lifecycle ──

onUnmounted(() => {
  destroy();
});

defineExpose({
  loadChapter,
  getCurrentPage,
  getPageCount,
  goToPage,
  zoomIn,
  zoomOut,
  zoomFit,
  zoomWidth,
  rotate,
  destroy,
  getDocument: () => null,
  getOutline: () => outline.value,
  getContainer: () => containerRef.value,
} satisfies Partial<FixedLayoutSurface>);
</script>

<template>
  <div ref="containerRef" class="fl-container">
    <!-- PDF: pdfjs viewer manages its own canvas + text + annotation layers -->
    <div v-if="format === 'pdf'" ref="pdfContainerRef" class="fl-pdf-viewer">
      <div ref="pdfViewerRef" class="pdfViewer"></div>
    </div>

    <!-- CBZ -->
    <div v-else-if="format === 'cbz'" class="fl-cbz-wrapper">
      <div class="fl-cbz-inner" :class="{ 'fl-ready': isCbzReady }">
        <img v-if="imageUrl" class="fl-image" alt="" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fl-container {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: #1a1a1a;
}

.fl-pdf-viewer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.fl-cbz-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.fl-cbz-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  opacity: 0;
  transition: opacity 150ms ease;
}
.fl-cbz-inner.fl-ready {
  opacity: 1;
}

.fl-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
