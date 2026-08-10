<script setup lang="ts">
import AppIcon from "./ui/AppIcon.vue";
import { useUIStore } from "../stores/ui";

const uiStore = useUIStore();
</script>

<template>
  <transition name="toast">
    <div
      v-if="uiStore.showToast"
      class="toast"
      :class="{ 'toast--error': uiStore.toastError }"
      :key="uiStore.toastMessage + Date.now()"
      role="status"
      aria-live="polite"
    >
      <AppIcon
        v-if="!uiStore.toastError"
        name="check"
        class="toast-icon"
        :size="18"
        :stroke-width="2.5"
      />
      <AppIcon v-else name="alert" class="toast-icon" :size="18" :stroke-width="2.5" />
      <div class="toast-content">
        <span class="toast-title">{{ uiStore.toastTitle }}</span>
        <span class="toast-desc">{{ uiStore.toastMessage }}</span>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  top: max(16px, env(safe-area-inset-top, 16px));
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 11px;
  padding: 13px 17px;
  background: rgba(31, 26, 23, 0.92);
  color: #f7f5f2;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.18),
    0 2px 8px rgba(0, 0, 0, 0.1);
  font-family: var(--font-ui);
  z-index: 3000;
  backdrop-filter: blur(16px) saturate(180%);
  max-width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}

.toast--error {
  background: rgba(180, 30, 30, 0.9);
  box-shadow: 0 8px 32px rgba(180, 30, 30, 0.2);
}

.toast-enter-active {
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scale(0.98);
}

.toast-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.toast-icon:first-child {
  color: #4ade80;
}
.toast--error .toast-icon {
  color: #fca5a5;
}

.toast-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.toast-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toast-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
  color: rgba(247, 245, 242, 0.65);
}
.toast--error .toast-desc {
  color: rgba(255, 255, 255, 0.7);
}
</style>
