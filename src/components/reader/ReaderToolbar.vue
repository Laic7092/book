<script setup lang="ts">
import { computed } from "vue";
import { getToolbarItems, pluginStateVersion } from "../../plugins/manager/registry";
import { useUIStore } from "../../stores/ui";

const uiStore = useUIStore();

const toolbarItems = computed(() => {
  void pluginStateVersion.value;
  return getToolbarItems();
});
</script>

<template>
  <div
    v-if="toolbarItems.length > 0"
    class="reader-toolbar"
    :class="{ visible: uiStore.effectiveShowControls }"
  >
    <component v-for="item in toolbarItems" :key="item.id" :is="item.component" />
  </div>
</template>

<style scoped>
.reader-toolbar {
  position: fixed;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom) + 80px);
  z-index: var(--z-chrome);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 250ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.reader-toolbar.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

@media (max-width: 480px) {
  .reader-toolbar {
    right: 10px;
    gap: 6px;
  }
}
</style>
