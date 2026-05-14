<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { getZip } from "../../storage/raw-data";
import { openPdf } from "../../utils/pdf-renderer";

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
const pdfContainerRef = ref<HTMLDivElement | null>(null);
const pdfViewerRef = ref<HTMLDivElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);

const imageUrl = ref("");
const isCbzReady = ref(false);
const pageCount = ref(0);
const currentScale = ref(1);

// ── State ──

let viewer: import("pdfjs-dist/web/pdf_viewer.mjs").PDFSinglePageViewer | null = null;
let currentBlobUrl: string | null = null;
const outline = ref<Array<{ title: string; pageNumber: number }>>([]);

// ── CBZ ──

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

async function loadCbzImage(filename: string): Promise<void> {
  isCbzReady.value = false;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

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
    nextTick(() => {
      isCbzReady.value = true;
    });
  } finally {
    await reader.close();
  }
}

// ── PDF (pdfjs-dist PDFSinglePageViewer) ──

async function initPdf() {
  const zipData = await getZip(props.bookId);
  if (!zipData) return;

  const pdfDoc = await openPdf(zipData);
  pageCount.value = pdfDoc.numPages;

  const { PDFSinglePageViewer, EventBus, SimpleLinkService } =
    await import("pdfjs-dist/web/pdf_viewer.mjs");
  await import("pdfjs-dist/web/pdf_viewer.css");

  await nextTick();
  const container = pdfContainerRef.value;
  const viewerDiv = pdfViewerRef.value;
  if (!container || !viewerDiv) return;

  const eventBus = new EventBus();
  const linkService = new SimpleLinkService();
  linkService.externalLinkEnabled = true;

  viewer = new PDFSinglePageViewer({
    container,
    viewer: viewerDiv,
    eventBus,
    linkService,
    textLayerMode: 1, // ENABLE
    annotationMode: 2, // ENABLE
    removePageBorders: true,
  });

  linkService.setViewer(viewer as any);
  linkService.setDocument(pdfDoc as any);

  viewer.setDocument(pdfDoc);

  // Extract outline for TOC
  try {
    const rawOutline = await pdfDoc.getOutline();
    if (rawOutline?.length) {
      const flatten = async (nodes: any[]): Promise<void> => {
        for (const node of nodes) {
          if (!node.title) continue;
          let pageNum = 1;
          try {
            if (Array.isArray(node.dest) && node.dest.length > 0) {
              pageNum = (await pdfDoc.getPageIndex(node.dest[0])) + 1;
            }
          } catch {
            /* unresolvable dest, use page 1 */
          }
          outline.value.push({ title: node.title, pageNumber: pageNum });
          if (node.items?.length) await flatten(node.items);
        }
      };
      await flatten(rawOutline);
    }
  } catch {
    /* outline is optional */
  }

  // Forward internal link clicks from the link service
  eventBus.on("pagenumberchanged", () => {
    // handled by FixedLayoutReader via chapter navigation
  });
  eventBus.on("linkclicked", (evt: any) => {
    if (evt.source instanceof HTMLAnchorElement) return; // external links handled by browser
    emit("linkClick", String(evt.pageNumber));
  });

  // Go to initial page
  const pageNum = props.chapterHref ? parseInt(props.chapterHref, 10) : 1;
  if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
    viewer.currentPageNumber = pageNum;
  }

  currentScale.value = viewer.currentScale;
}

async function renderPdfPage(pageNum: number) {
  if (!viewer) return;
  viewer.currentPageNumber = pageNum;
  currentScale.value = viewer.currentScale;
}

// ── Lifecycle ──

onMounted(async () => {
  if (props.format === "pdf") {
    await initPdf();
    emit("ready");
  } else if (props.format === "cbz") {
    if (props.chapterHref) await loadCbzImage(props.chapterHref);
    emit("ready");
  }
});

watch(
  () => props.chapterHref,
  async (href) => {
    if (!href) return;
    if (props.format === "pdf") {
      const pageNum = parseInt(href, 10);
      if (!isNaN(pageNum)) await renderPdfPage(pageNum);
    } else if (props.format === "cbz") {
      await loadCbzImage(href);
    }
  },
);

onUnmounted(() => {
  viewer?.cleanup();
  viewer = null;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
});

// ── Expose ──

function zoomIn() {
  if (!viewer) return;
  viewer.increaseScale({ scaleFactor: 1.1 });
  currentScale.value = viewer.currentScale;
}
function zoomOut() {
  if (!viewer) return;
  viewer.decreaseScale({ scaleFactor: 1.1 });
  currentScale.value = viewer.currentScale;
}
function zoomFit() {
  if (!viewer) return;
  viewer.currentScaleValue = "page-fit";
  currentScale.value = viewer.currentScale;
}
function zoomWidth() {
  if (!viewer) return;
  viewer.currentScaleValue = "page-width";
  currentScale.value = viewer.currentScale;
}
function rotate(deg: number) {
  if (!viewer) return;
  viewer.pagesRotation = (((viewer.pagesRotation + deg) % 360) + 360) % 360;
}

defineExpose({
  getDocument: () => null,
  getContainer: () => containerRef.value,
  getPageCount: () => pageCount.value,
  getOutline: () => outline.value,
  goToPage(pageNum: number) {
    renderPdfPage(pageNum);
  },
  zoomIn,
  zoomOut,
  zoomFit,
  zoomWidth,
  rotate,
});
</script>

<template>
  <div ref="containerRef" class="fl-container">
    <div v-if="chapterLoading" class="fl-loading-overlay" />

    <!-- PDF: pdfjs viewer manages its own canvas + text + annotation layers -->
    <div v-if="format === 'pdf'" ref="pdfContainerRef" class="fl-pdf-viewer">
      <div ref="pdfViewerRef" class="pdfViewer"></div>
    </div>

    <!-- CBZ -->
    <div v-else-if="format === 'cbz'" class="fl-cbz-wrapper">
      <div class="fl-cbz-inner" :class="{ 'fl-ready': isCbzReady }">
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
  background: #1a1a1a;
}

.fl-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  cursor: wait;
}

/* ── PDF viewer container ── */
.fl-pdf-viewer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* ── CBZ ── */
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
