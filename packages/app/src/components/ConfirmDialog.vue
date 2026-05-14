<script setup lang="ts">
import { useUIStore } from "../stores/ui";

const uiStore = useUIStore();
</script>

<template>
  <transition name="fade">
    <div
      v-if="uiStore.showConfirm"
      class="confirm-backdrop"
      @click.self="uiStore.cancelConfirmation()"
    >
      <div class="confirm-dialog">
        <h3 class="confirm-title">{{ uiStore.confirmTitle }}</h3>
        <p class="confirm-message">{{ uiStore.confirmMessage }}</p>
        <div class="confirm-actions">
          <button class="confirm-btn" @click="uiStore.cancelConfirmation()">Cancel</button>
          <button class="confirm-btn confirm-danger" @click="uiStore.confirm()">Delete</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  animation: fadeIn 0.25s ease-out;
  backdrop-filter: blur(6px);
}

.confirm-dialog {
  background: var(--reader-bg);
  border-radius: 16px;
  padding: 28px;
  max-width: 340px;
  width: 90%;
  animation: scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid var(--border);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.15),
    0 4px 12px rgba(0, 0, 0, 0.08);
}

.confirm-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--reader-text);
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 22px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 11px 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-ui);
  background: var(--bg-secondary);
  color: var(--reader-text);
}

.confirm-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-muted);
}

.confirm-danger {
  background: #dc2626;
  color: #fff;
  border-color: #dc2626;
}

.confirm-danger:hover {
  background: #b91c1c !important;
  border-color: #b91c1c;
}
</style>
