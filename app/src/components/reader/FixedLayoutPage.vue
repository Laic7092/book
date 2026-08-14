<script setup lang="ts">
import { ref, onUnmounted, nextTick } from "vue";
import type { FixedLayoutSurface } from "@book/engine";

const props = defineProps<{
  bookId: string;
}>();

// ── Template refs ──

const imageUrl = ref("");
const isReady = ref(false);

// ── Internal state ──

let currentBlobUrl: string | null = null;
let currentPage = 0;
let pageCount = 0;
let currentZipReader: any = null;

// ── FixedLayoutSurface implementation ──

async function loadChapter(href: string, rawData: ArrayBuffer): Promise<void> {
  isReady.value = false;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  imageUrl.value = "";

  const ext = href.split(".").pop() || "jpg";
  const mimeType = getMimeType(ext);

  const { ZipReader, Uint8ArrayReader, BlobWriter } = await import("@zip.js/zip.js");
  await currentZipReader?.close();
  currentZipReader = new ZipReader(new Uint8ArrayReader(new Uint8Array(rawData)));
  try {
    const entries = await currentZipReader.getEntries();
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
      isReady.value = true;
    });
  } finally {
    if (currentZipReader) {
      await currentZipReader.close();
      currentZipReader = null;
    }
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
  currentPage = page;
}

function zoomIn(): void {
  /* no-op for CBZ */
}
function zoomOut(): void {
  /* no-op for CBZ */
}
function zoomFit(): void {
  /* no-op for CBZ */
}
function zoomWidth(): void {
  /* no-op for CBZ */
}
function rotate(_deg: number): void {
  /* no-op for CBZ */
}

function destroy(): void {
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
} satisfies Partial<FixedLayoutSurface>);
</script>

<template>
  <div class="fl-cbz-wrapper">
    <div class="fl-cbz-inner" :class="{ 'fl-ready': isReady }">
      <img v-if="imageUrl" class="fl-image" alt="" />
    </div>
  </div>
</template>

<style scoped>
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
