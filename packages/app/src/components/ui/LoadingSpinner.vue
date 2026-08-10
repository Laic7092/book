<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Spinner diameter in px: sm=16, md=28, lg=32. */
    size?: "sm" | "md" | "lg";
    /** Optional caption rendered next to the spinner. */
    label?: string;
    /** Column layout (spinner above label); default is a row. */
    block?: boolean;
    /** Render only the spinner span, without the layout wrapper. */
    bare?: boolean;
  }>(),
  { size: "md", block: false, bare: false },
);
</script>

<template>
  <div v-if="!bare" class="loading-state" :class="[size, { block }]">
    <span class="spinner" />
    <p v-if="label" class="loading-label">{{ label }}</p>
  </div>
  <span v-else class="spinner" :class="size" />
</template>

<style scoped>
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-ui);
}

.loading-state.block {
  flex-direction: column;
  gap: 16px;
  padding: 48px 20px;
}

.spinner {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-state.sm .spinner {
  width: 16px;
  height: 16px;
}

.loading-state.lg .spinner {
  width: 32px;
  height: 32px;
}

.loading-label {
  margin: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
