<script setup lang="ts">
defineProps<{
  currentPage: number;
  totalPages: number;
  show: boolean;
}>();
</script>

<template>
  <div v-if="show" class="page-indicator" :class="{ visible: show }">
    <span class="page-number">{{ currentPage + 1 }} / {{ totalPages }}</span>
  </div>
</template>

<style scoped>
.page-indicator {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--bg-elevated, var(--reader-bg));
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  z-index: 99;
  opacity: 0;
  pointer-events: none;
  transition: all var(--transition-base);
}

.page-indicator.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}

.page-number {
  font-size: 13px;
  font-weight: 600;
  color: var(--reader-text);
  white-space: nowrap;
}
</style>
