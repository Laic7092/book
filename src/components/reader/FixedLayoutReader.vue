<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { getZip } from "../../plugins/epub/zips";
import { STORES, dbPut, dbGet } from "../../storage/db";
import type { Resource } from "../../core/types";
import {
  openPdf,
  renderPageToCanvas,
  renderPdfTextLayer,
  getAnnotationRects,
  getPageViewport,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "../../reader-engine/pdf-renderer";

const props = defineProps<{
  bookId: string;
  format: "pdf" | "cbz";
  chapterHref?: string;
  chapterLoading?: boolean;
}>();

const emit = defineEmits<{
  ready: [];
  linkClick: [href: string];
}>();

// ── Refs ──

const containerRef = ref<HTMLElement | null>(null);
const pageWrapperRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const textLayerRef = ref<HTMLElement | null>(null);
const annotationLayerRef = ref<HTMLElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);

const imageUrl = ref("");
const isPdfReady = ref(false);
const isCbzReady = ref(false);
const pageCount = ref(0);

// ── State ──

let pdfDoc: PDFDocumentProxy | null = null;
let currentPage: PDFPageProxy | null = null;
let currentRenderTask: { cancel(): void } | null = null;
let currentBlobUrl: string | null = null;
let resizeObserver: ResizeObserver | null = null;

// ── MIME helpers ──

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

// ── CBZ ──

async function loadCbzImage(filename: string): Promise<void> {
  isCbzReady.value = false;

  // Revoke previous blob URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  // Check cache
  const cached = await dbGet<Resource>(STORES.RESOURCES, [props.bookId, filename]);
  if (cached) {
    currentBlobUrl = URL.createObjectURL(new Blob([cached.data], { type: cached.mimeType }));
    imageUrl.value = currentBlobUrl;
    nextTick(() => {
      isCbzReady.value = true;
    });
    return;
  }

  // Extract from ZIP
  const zipData = await getZip(props.bookId);
  if (!zipData) return;

  const { ZipReader, Uint8ArrayReader, BlobWriter } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(zipData)));
  try {
    const entries = await reader.getEntries();
    const entry = entries.find((e: any) => !e.directory && e.filename === filename) as any;
    if (!entry) return;
    const blob = (await entry.getData(new BlobWriter())) as Blob;
    const data = await blob.arrayBuffer();
    const ext = filename.split(".").pop() || "jpg";
    const mimeType = getMimeType(ext);

    currentBlobUrl = URL.createObjectURL(new Blob([data], { type: mimeType }));
    imageUrl.value = currentBlobUrl;

    // Cache for next time
    const resource: Resource = {
      bookId: props.bookId,
      resourceId: filename,
      data,
      mimeType,
      type: "image",
    };
    dbPut(STORES.RESOURCES, resource).catch(() => {});
    nextTick(() => {
      isCbzReady.value = true;
    });
  } finally {
    await reader.close();
  }
}

// ── PDF ──

function applyFitScale(canvas: HTMLCanvasElement) {
  const pw = pageWrapperRef.value;
  if (!pw || !canvas) return;
  // Reset inline styles so CSS can control visual size
  canvas.style.width = "";
  canvas.style.height = "";
}

async function renderPdfPage(pageNum: number) {
  if (!pdfDoc) return;
  isPdfReady.value = false;

  // Cancel in-flight render
  if (currentRenderTask) {
    currentRenderTask.cancel();
    currentRenderTask = null;
  }
  currentPage?.cleanup();
  currentPage = null;

  const canvas = canvasRef.value;
  const textLayer = textLayerRef.value;
  const annotationLayer = annotationLayerRef.value;
  if (!canvas) return;

  const page = await pdfDoc.getPage(pageNum);
  currentPage = page;

  const dpr = window.devicePixelRatio || 1;
  const pw = pageWrapperRef.value;
  const cw = pw?.clientWidth || canvas.clientWidth || 800;
  const ch = pw?.clientHeight || canvas.clientHeight || 600;
  const viewport = getPageViewport(page, cw, ch, dpr);
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const task = await renderPageToCanvas(page, viewport, canvas);
  currentRenderTask = task;

  // Scale canvas visual size to fit container
  const visualScale = Math.min(cw / viewport.width, ch / viewport.height);
  canvas.style.width = viewport.width * visualScale + "px";
  canvas.style.height = viewport.height * visualScale + "px";

  await task.promise;

  // Text layer — use pdfjs-dist's built-in TextLayer for proper text selection
  if (textLayer) {
    textLayer.innerHTML = "";
    textLayer.style.width = canvas.style.width;
    textLayer.style.height = canvas.style.height;
    textLayer.style.transform = `scale(${visualScale})`;
    textLayer.style.transformOrigin = "top left";
    void renderPdfTextLayer(page, viewport, textLayer);
  }

  // Annotation layer (links)
  if (annotationLayer) {
    const annotations = await getAnnotationRects(page, viewport);
    annotationLayer.style.width = canvas.style.width;
    annotationLayer.style.height = canvas.style.height;
    annotationLayer.style.transform = `scale(${visualScale})`;
    annotationLayer.style.transformOrigin = "top left";
    annotationLayer.innerHTML = "";
    for (const ann of annotations) {
      const [x1, y1, x2, y2] = ann.rect;
      const link = document.createElement("a");
      link.style.position = "absolute";
      link.style.left = Math.min(x1, x2) + "px";
      link.style.top = Math.min(y1, y2) + "px";
      link.style.width = Math.abs(x2 - x1) + "px";
      link.style.height = Math.abs(y2 - y1) + "px";
      link.style.cursor = "pointer";
      link.style.pointerEvents = "auto";
      if (ann.url) {
        link.href = ann.url;
        link.target = "_blank";
      } else if (ann.dest) {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          emit("linkClick", typeof ann.dest === "string" ? ann.dest : JSON.stringify(ann.dest));
        });
      }
      annotationLayer.appendChild(link);
    }
  }

  isPdfReady.value = true;
}

async function initPdf() {
  const zipData = await getZip(props.bookId);
  if (!zipData) return;

  pdfDoc?.destroy();
  pdfDoc = null;
  currentPage?.cleanup();
  currentPage = null;

  pdfDoc = await openPdf(zipData);
  pageCount.value = pdfDoc.numPages;

  const pageNum = props.chapterHref ? parseInt(props.chapterHref, 10) : 1;
  if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
    await renderPdfPage(pageNum);
  }
}

// ── Resize handling ──

function onResize() {
  if (props.format !== "pdf") return;
  const pageNum = props.chapterHref ? parseInt(props.chapterHref, 10) : 1;
  if (isNaN(pageNum) || !pdfDoc) return;
  renderPdfPage(pageNum);
}

function setupResizeObserver() {
  if (!pageWrapperRef.value) return;
  resizeObserver = new ResizeObserver(() => {
    onResize();
  });
  resizeObserver.observe(pageWrapperRef.value);
}

// ── Lifecycle ──

onMounted(async () => {
  if (props.format === "pdf") {
    await initPdf();
    setupResizeObserver();
    emit("ready");
  } else if (props.format === "cbz") {
    if (props.chapterHref) {
      await loadCbzImage(props.chapterHref);
    }
    emit("ready");
  }
});

watch(
  () => props.chapterHref,
  async (href) => {
    if (!href) return;
    if (props.format === "pdf") {
      const pageNum = parseInt(href, 10);
      if (!isNaN(pageNum)) {
        await renderPdfPage(pageNum);
      }
    } else if (props.format === "cbz") {
      await loadCbzImage(href);
    }
  },
);

onUnmounted(() => {
  currentRenderTask?.cancel();
  currentPage?.cleanup();
  pdfDoc?.destroy();
  pdfDoc = null;
  currentPage = null;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
});

// ── Expose ──

defineExpose({
  getDocument: () => null,
  getContainer: () => containerRef.value,
  getPageCount: () => pageCount.value,
  goToPage(pageNum: number) {
    renderPdfPage(pageNum);
  },
});
</script>

<template>
  <div ref="containerRef" class="fl-container">
    <div v-if="chapterLoading" class="fl-loading-overlay" />

    <!-- PDF -->
    <div v-if="format === 'pdf'" ref="pageWrapperRef" class="fl-page-wrapper">
      <div class="fl-page-inner" :class="{ 'fl-ready': isPdfReady }">
        <canvas ref="canvasRef" class="fl-canvas" />
        <div ref="textLayerRef" class="fl-text-layer" />
        <div ref="annotationLayerRef" class="fl-annotation-layer" />
      </div>
    </div>

    <!-- CBZ -->
    <div v-else-if="format === 'cbz'" ref="pageWrapperRef" class="fl-page-wrapper">
      <div class="fl-page-inner" :class="{ 'fl-ready': isCbzReady }">
        <img v-if="imageUrl" ref="imgRef" :src="imageUrl" class="fl-image" alt="" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fl-container {
  position: relative;
  flex: 1;
  overflow: hidden;
  contain: strict;
  background: #1a1a1a;
}

.fl-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  cursor: wait;
}

.fl-page-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.fl-page-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  opacity: 0;
  transition: opacity 150ms ease;
}
.fl-page-inner.fl-ready {
  opacity: 1;
}

.fl-canvas {
  display: block;
  /* Visual size set via JS style.width/height */
}

.fl-text-layer {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: text;
  /* spans inside have pointer-events: auto for text selection */
}

.fl-annotation-layer {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  pointer-events: none;
}

.fl-annotation-layer a {
  pointer-events: auto;
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
