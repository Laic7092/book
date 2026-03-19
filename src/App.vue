<script setup lang="ts">
import { ref } from "vue";
import Bookshelf from "./components/Bookshelf.vue";
import ReaderView from "./components/ReaderView.vue";
import type { Book } from "./core/types";

const currentBook = ref<Book | null>(null);
const isTransitioning = ref(false);

function handleBookSelect(book: Book) {
  isTransitioning.value = true;
  currentBook.value = book;
  setTimeout(() => {
    isTransitioning.value = false;
  }, 300);
}

function handleCloseReader() {
  isTransitioning.value = true;
  currentBook.value = null;
  setTimeout(() => {
    isTransitioning.value = false;
  }, 300);
}
</script>

<template>
  <div class="app" :class="{ transitioning: isTransitioning }">
    <Transition name="page" mode="out-in">
      <Bookshelf v-if="!currentBook" @book:select="handleBookSelect" />
      <ReaderView v-else :book="currentBook" @close="handleCloseReader" />
    </Transition>
  </div>
</template>

<style>
/* Import Google Fonts */
@import url("https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Literata:ital,opsz,wght@0,7..72,300;0,7..72,400;0,7..72,500;0,7..72,600;0,7..72,700;1,7..72,400&display=swap");

/* Global styles */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* Primary colors */
  --color-accent: #f57c3e;
  --color-accent-hover: #e06a2e;
  --color-accent-soft: rgba(245, 124, 62, 0.12);

  /* Light theme (warm paper tone) */
  --bg-primary: #faf9f7;
  --bg-secondary: #f2f0eb;
  --bg-tertiary: #e8e6df;
  --text-primary: #2d2a26;
  --text-secondary: #5a554d;
  --text-muted: #8a8478;
  --border-color: #e0ded8;
  --shadow-sm: 0 1px 3px rgba(45, 42, 38, 0.08);
  --shadow-md: 0 4px 12px rgba(45, 42, 38, 0.1);
  --shadow-lg: 0 8px 30px rgba(45, 42, 38, 0.12);
  --shadow-xl: 0 20px 60px rgba(45, 42, 38, 0.15);

  /* Dark theme */
  --bg-primary-dark: #1a1815;
  --bg-secondary-dark: #24221e;
  --bg-tertiary-dark: #2f2d28;
  --text-primary-dark: #e8e6df;
  --text-secondary-dark: #b8b4a8;
  --text-muted-dark: #7a7468;
  --border-color-dark: #3a3730;
  --shadow-sm-dark: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md-dark: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg-dark: 0 8px 30px rgba(0, 0, 0, 0.5);
  --shadow-xl-dark: 0 20px 60px rgba(0, 0, 0, 0.6);

  /* Sepia theme */
  --bg-primary-sepia: #f4ecd8;
  --bg-secondary-sepia: #e8dcc4;
  --bg-tertiary-sepia: #d4c5a9;
  --text-primary-sepia: #4a4030;
  --text-secondary-sepia: #6b5d4a;
  --text-muted-sepia: #9a8a70;
  --border-color-sepia: #c9b896;

  /* Typography */
  --font-ui: "Instrument Sans", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-reading: "Literata", Georgia, serif;

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

html,
body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
}

/* Smooth scrolling */
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

/* Focus styles */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Selection color */
::selection {
  background-color: var(--color-accent-soft);
  color: var(--text-primary);
}

.app {
  height: 100vh;
  overflow: hidden;
}

.app.transitioning {
  pointer-events: none;
}

/* Page Transitions */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: scale(0.98);
}

.page-leave-to {
  opacity: 0;
  transform: scale(1.02);
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
