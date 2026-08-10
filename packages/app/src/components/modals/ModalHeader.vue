<script setup lang="ts">
import AppIcon from "../ui/AppIcon.vue";

defineProps<{
  title: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <div class="modal-header">
    <div class="modal-header-row">
      <div class="modal-header-left">
        <slot name="prefix" />
        <h3>{{ title }}</h3>
      </div>
      <button class="modal-close" @click="emit('close')" aria-label="Close">
        <AppIcon name="close" :size="20" :stroke-width="1.5" />
      </button>
    </div>
    <slot name="extra" />
  </div>
</template>

<style scoped>
.modal-header {
  flex-shrink: 0;
  background: var(--modal-bg, var(--bg-elevated));
  border-bottom: 1px solid var(--border-subtle);
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  color: var(--modal-text, var(--reader-text));
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--bg-secondary);
  color: var(--reader-text);
}
</style>
