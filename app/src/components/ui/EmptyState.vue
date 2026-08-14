<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** Optional icon from the shared registry. Override via `#icon` slot. */
    icon?: IconName;
    /** Icon pixel size (default 48). */
    iconSize?: number;
    /** Icon stroke width (default 1.5). */
    iconStrokeWidth?: number;
  }>(),
  { iconSize: 48, iconStrokeWidth: 1.5 },
);
</script>

<template>
  <div class="empty-state">
    <slot name="icon">
      <div v-if="icon" class="empty-icon">
        <AppIcon :name="icon" :size="iconSize" :stroke-width="iconStrokeWidth" />
      </div>
    </slot>
    <p class="empty-title">{{ title }}</p>
    <span v-if="description" class="empty-desc">{{ description }}</span>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 48px 20px;
  gap: 8px;
  text-align: center;
  color: var(--text-secondary);
  flex: 1;
}

.empty-icon {
  display: flex;
  margin-bottom: 10px;
  opacity: 0.5;
}

.empty-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.empty-desc {
  font-size: 12px;
  opacity: 0.75;
  line-height: 1.5;
}
</style>
