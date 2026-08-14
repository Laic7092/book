<script setup lang="ts">
import { ref } from "vue";
import ModalHeader from "./ModalHeader.vue";

defineProps<{
  title: string;
  /** Optional padding for the scrollable body (e.g. "20px" or "16px 20px 24px"). */
  bodyPadding?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const bodyEl = ref<HTMLElement | null>(null);
/** Exposed so callers can scroll the body (e.g. TableOfContents). */
defineExpose({ bodyEl });
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader :title="title" @close="emit('close')">
      <template v-if="$slots.prefix" #prefix>
        <slot name="prefix" />
      </template>
      <template v-if="$slots.extra" #extra>
        <slot name="extra" />
      </template>
    </ModalHeader>

    <!-- Non-scrolling strip between header and body (filters, action bars…) -->
    <slot name="toolbar" />

    <div
      ref="bodyEl"
      class="modal-body scroll-body"
      :style="bodyPadding ? { padding: bodyPadding } : undefined"
    >
      <slot />
    </div>
  </div>
</template>

<style>
/* Shared modal shell — every plugin panel renders inside ModalPanel.
   Kept unscoped so these layout primitives stay usable by any consumer. */
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
