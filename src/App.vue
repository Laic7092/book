<script setup lang="ts">
import { computed, watch, defineAsyncComponent } from "vue";
import Bookshelf from "./components/Bookshelf.vue";
import { useReaderStore } from "./stores/reader";
import { useUIStore } from "./stores/ui";
import { currentRoute, navigate } from "./utils/router";
import { getPageComponent } from "./plugins/manager/registry";

const ReflowableReader = defineAsyncComponent(() => import("./components/ReflowableReader.vue"));
const FixedLayoutReader = defineAsyncComponent(() => import("./components/FixedLayoutReader.vue"));

const readerStore = useReaderStore();
const uiStore = useUIStore();

const isFixedLayout = computed(() => {
  const fmt = readerStore.currentBook?.format;
  return fmt === "pdf" || fmt === "cbz";
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
  </Transition>
</template>

<style>
:root {
  --shadow-xs: 0 1px 2px rgba(31, 26, 23, 0.04);
  --shadow-sm: 0 2px 8px rgba(31, 26, 23, 0.06);
  --shadow-md: 0 4px 16px rgba(31, 26, 23, 0.08);
  --shadow-lg: 0 8px 32px rgba(31, 26, 23, 0.1);
  --shadow-xl: 0 16px 64px rgba(31, 26, 23, 0.12);
  --shadow-inner: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  --shadow-dark-sm: 0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-dark-md: 0 4px 16px rgba(0, 0, 0, 0.5);
  --shadow-dark-lg: 0 8px 32px rgba(0, 0, 0, 0.6);

  --z-content: 0;
  --z-overlay: 100;
  --z-chrome: 200;

  --font-ui: "Instrument Sans", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: "Cormorant", Georgia, serif;
  --font-reading: "Literata", Georgia, serif;

  --transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 280ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 480ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-page: 350ms cubic-bezier(0.4, 0, 0.2, 1);
}
/* Focus styles - refined focus rings */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}

/* Selection color - warm accent */
::selection {
  background-color: var(--accent-muted);
  color: var(--reader-text);
}

.reader-loading {
  height: 100%;
  background: var(--reader-bg);
}

.app.transitioning {
  pointer-events: none;
}

/* Page Transitions — simultaneous enter/leave, no gap */
.page-enter-active,
.page-leave-active {
  transition: all var(--transition-page);
}

.page-enter-active {
  position: fixed;
  inset: 0;
  z-index: 1;
}

.page-leave-active {
  position: fixed;
  inset: 0;
  z-index: 2;
}

.page-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}

.page-leave-to {
  opacity: 0;
  transform: translateX(80px);
}

/* Animation keyframes */
@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }

  100% {
    background-position: 200% 0;
  }
}

/* Utility animation classes */
.animate-fade-in {
  animation: fadeIn var(--transition-base) ease-out;
}

.animate-fade-in-up {
  animation: fadeInUp var(--transition-slow) ease-out;
}

.animate-fade-in-down {
  animation: fadeInDown var(--transition-base) ease-out;
}

.animate-scale-in {
  animation: scaleIn var(--transition-spring) ease-out;
}

/* Skeleton loader */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-secondary) 0%,
    var(--bg-tertiary) 50%,
    var(--bg-secondary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 0;
  height: 0;
}

::-webkit-scrollbar-thumb {
  width: 0;
  height: 0;
}

* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
</style>
