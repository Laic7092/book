<script setup lang="ts">
import type { ReaderSettings, Chapter } from "../../core/types";

defineProps<{
  content: string;
  settings: ReaderSettings;
  isPaginationMode: boolean;
  isPaginating?: boolean;
  paginationAnimationClass?: string;
  chapters?: Chapter[];
  allLoadedContent?: Array<{ chapterId: string; title: string; content: string; order: number }>;
  transitioning?: boolean;
}>();
</script>

<template>
  <main class="reader-view" :class="{ 'pagination-mode': isPaginationMode }">
    <!-- Pagination Mode -->
    <article
      v-if="isPaginationMode"
      class="reader-content pagination-content"
      :class="[paginationAnimationClass, { paginating: isPaginating }]"
      :style="{
        maxWidth: `${settings.columnWidth}px`,
        margin: '0 auto',
        padding: `${settings.margin}px`,
        fontSize: `${settings.fontSize}px`,
        fontFamily: settings.fontFamily,
        lineHeight: String(settings.lineHeight),
        letterSpacing: `${settings.letterSpacing || 0}em`,
        textAlign: settings.textAlign || 'left',
      }"
      v-html="content"
    ></article>

    <!-- Vertical Scroll Mode -->
    <article
      v-else
      class="reader-content vertical-content"
      :class="{ transitioning }"
      :style="{
        maxWidth: `${settings.columnWidth}px`,
        margin: '0 auto',
        padding: `${settings.margin}px`,
        fontSize: `${settings.fontSize}px`,
        fontFamily: settings.fontFamily,
        lineHeight: String(settings.lineHeight),
        letterSpacing: `${settings.letterSpacing || 0}em`,
        textAlign: settings.textAlign || 'left',
      }"
    >
      <div
        v-for="chapter in allLoadedContent"
        :key="chapter.chapterId"
        class="chapter-container"
        :data-chapter-id="chapter.chapterId"
      >
        <h2 class="chapter-heading">{{ chapter.title }}</h2>
        <div class="chapter-body" v-html="chapter.content"></div>
      </div>
    </article>
  </main>
</template>

<style scoped>
.reader-view {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--reader-bg);
  scroll-behavior: smooth;
  position: relative;
  -webkit-overflow-scrolling: touch;
}

.reader-view.pagination-mode {
  overflow: hidden;
}

.reader-content {
  min-height: 100%;
  transition:
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  transform: translateY(0);
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}

/* Vertical scrolling */
.vertical-content {
  padding-bottom: 40vh;
}

.chapter-container {
  margin-bottom: 3em;
  scroll-margin-top: 2em;
}

.chapter-container:not(:first-child) .chapter-heading {
  margin-top: 3em;
  padding-top: 2em;
  border-top: 1px solid var(--border-subtle);
}

.chapter-heading {
  font-family: var(--font-display);
  font-size: 1.8em;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--reader-text);
  text-align: center;
  padding-bottom: 1.5em;
  margin-bottom: 1em;
  border-bottom: 1px solid var(--border-subtle);
}

.chapter-body {
  padding-top: 0.5em;
  white-space: break-spaces;
}

.reader-content.transitioning {
  opacity: 0;
  transform: translateY(8px);
}

.reader-content :deep(p) {
  margin-bottom: calc(var(--paragraph-spacing, 1.2) * 1em);
  text-rendering: optimizeLegibility;
}

/* Pagination Mode */
.pagination-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-height: 100%;
  overflow: hidden;
}

.pagination-content.paginating {
  pointer-events: none;
}

/* Slide animation */
.pagination-slide-enter-active,
.pagination-slide-leave-active {
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pagination-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.pagination-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Flip animation */
.pagination-flip-enter-active,
.pagination-flip-leave-active {
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.pagination-flip-enter-from {
  transform: rotateY(-180deg);
  opacity: 0;
}

.pagination-flip-leave-to {
  transform: rotateY(180deg);
  opacity: 0;
}

.pagination-flip-enter-from,
.pagination-flip-leave-to {
  backface-visibility: hidden;
}

/* Fade animation */
.pagination-fade-enter-active,
.pagination-fade-leave-active {
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pagination-fade-enter-from,
.pagination-fade-leave-to {
  opacity: 0;
}

/* Scrollbar */
.reader-view::-webkit-scrollbar {
  width: 7px;
}

.reader-view::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.reader-view::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--border) 70%, var(--reader-text));
}
</style>
