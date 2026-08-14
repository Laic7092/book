<script setup lang="ts">
import { computed, watch, defineAsyncComponent } from "vue";
import Bookshelf from "./components/Bookshelf.vue";
import { useReaderStore } from "./stores/reader";
import { useUIStore } from "./stores/ui";
import { currentRoute, navigate } from "./utils/router";
import { getPageComponent } from "./core/plugin-runtime/registry";

const ReflowableReader = defineAsyncComponent(() => import("./components/ReflowableReader.vue"));
const FixedLayoutReader = defineAsyncComponent(() => import("./components/FixedLayoutReader.vue"));

const readerStore = useReaderStore();
const uiStore = useUIStore();

const isFixedLayout = computed(() => {
  const fmt = readerStore.currentBook?.format;
  return fmt === "pdf" || fmt === "cbz" || fmt === "cbr";
});

const pageComponent = computed(() => {
  if (currentRoute.name !== "page") return null;
  return getPageComponent(currentRoute.params.pageName) || null;
});

watch(
  () => ({ name: currentRoute.name, bookId: currentRoute.params.bookId }),
  async (current, prev) => {
    if (current.name === "reader" && current.bookId) {
      if (readerStore.currentBook?.id !== current.bookId) {
        try {
          await readerStore.openBook(current.bookId);
        } catch (err) {
          console.error("Failed to open book:", err);
          uiStore.triggerToast("Failed to open book. Please try again.", true);
          navigate("/", true);
        }
      }
    } else if (prev?.name === "reader" && current.name !== "reader") {
      readerStore.closeBook();
    }
    setTimeout(() => {
      uiStore.setTransitioning(false);
    }, 300);
  },
  { immediate: true },
);
</script>

<template>
  <Transition name="page">
    <KeepAlive :include="['ReflowableReader', 'FixedLayoutReader', 'Bookshelf']">
      <component
        v-if="currentRoute.name === 'page' && pageComponent"
        :is="pageComponent"
        key="page"
      />
      <template v-else-if="currentRoute.name === 'reader'" key="reader">
        <FixedLayoutReader
          v-if="readerStore.currentBook && isFixedLayout"
          :book="readerStore.currentBook"
        />
        <ReflowableReader v-else-if="readerStore.currentBook" :book="readerStore.currentBook" />
        <div v-else class="reader-loading" />
      </template>
      <Bookshelf v-else key="bookshelf" />
    </KeepAlive>
  </Transition>
</template>
