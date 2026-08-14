<script setup lang="ts">
export interface FilterItem {
  key: string;
  label: string;
  count?: number;
}

defineProps<{
  items: FilterItem[];
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [key: string];
}>();
</script>

<template>
  <div class="filter-bar">
    <button
      v-for="item in items"
      :key="item.key"
      class="pill"
      :class="{ active: modelValue === item.key }"
      @click="emit('update:modelValue', item.key)"
    >
      {{ item.label }}
      <span v-if="item.count != null" class="pill-count">{{ item.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: var(--font-ui);
  transition:
    background 150ms,
    color 150ms,
    border-color 150ms;
}

.pill:hover {
  background: var(--hover-bg);
  color: var(--reader-text);
}

.pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.1);
}

.pill.active .pill-count {
  background: rgba(255, 255, 255, 0.25);
}
</style>
