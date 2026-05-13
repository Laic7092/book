<script setup lang="ts">
import { ref } from "vue";
import type { Chapter } from "../../core/types";
import TableOfContents from "./TableOfContents.vue";
import { computed } from "vue";
import { getModalComponents, pluginStateVersion } from "../../plugins/manager/registry";

const pluginModals = computed(() => {
  void pluginStateVersion.value;
  return getModalComponents();
});

const props = defineProps<{
  modalType: string | null;
  chapters?: Chapter[];
  currentChapterId?: string | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select-chapter", chapterId: string): void;
}>();

const isClosing = ref(false);

function handleClose() {
  if (isClosing.value) return;
  isClosing.value = true;
}

function onAnimationEnd() {
  if (isClosing.value) {
    isClosing.value = false;
    emit("close");
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modalType"
      class="modal-overlay"
      :class="{ closing: isClosing }"
      @click.stop="handleClose"
      @animationend="onAnimationEnd"
    >
      <div class="modal-content modal-panel" @click.stop @animationend="onAnimationEnd">
        <!-- Core: Table of Contents -->
        <TableOfContents
          v-if="modalType === 'toc'"
          :chapters="chapters"
          :current-chapter-id="currentChapterId"
          @select-chapter="emit('select-chapter', $event)"
          @close="handleClose"
        />

        <!-- All plugin modals (search, bookmarks, annotations, settings, typographySettings, stats, + any future plugins) -->
        <component
          v-else-if="modalType && pluginModals[modalType]"
          :is="pluginModals[modalType]"
          v-bind="$attrs"
          @close="handleClose"
        />
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Shared modal shell — used by all plugin panels via .modal-content-inner / .modal-body */
.modal-content-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 0;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  overscroll-behavior-y: contain;
}

.modal-body.scroll-body {
  scrollbar-width: thin;
}
</style>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: var(--z-chrome);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fadeIn 300ms ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  touch-action: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.closing.modal-overlay {
  animation: overlayFadeOut 300ms ease forwards;
}

@keyframes overlayFadeOut {
  from {
    opacity: 1;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  to {
    opacity: 0;
    backdrop-filter: blur(0px);
    -webkit-backdrop-filter: blur(0px);
  }
}

.closing .modal-content {
  animation: slideDown 300ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
}

@keyframes slideDown {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

.modal-content {
  background: var(--modal-bg, var(--bg-elevated));
  color: var(--modal-text, var(--reader-text));
  border-radius: 16px 16px 0 0;
  width: 100%;
  max-width: 560px;
  overflow: hidden;
  animation: slideUp 450ms cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.25);
  border-top: 1px solid var(--border-subtle);
  margin: 0 auto;
  touch-action: pan-y;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.modal-panel {
  height: 85vh;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .modal-content {
    border-radius: 14px 14px 0 0;
    max-height: 80vh;
  }
}
</style>
