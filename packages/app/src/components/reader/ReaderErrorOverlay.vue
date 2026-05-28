<script setup lang="ts">
defineProps<{
  message: string | null;
}>();

const emit = defineEmits<{
  (e: "retry"): void;
  (e: "close"): void;
}>();
</script>

<template>
  <div class="reader-error-overlay">
    <div class="error-card">
      <div class="error-icon">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p class="error-title">Failed to load chapter</p>
      <p class="error-message" v-if="message">{{ message }}</p>
      <p class="error-hint" v-else>
        The chapter could not be loaded. You can try again or return to the library.
      </p>
      <div class="error-actions">
        <button class="error-btn error-btn-primary" @click="emit('retry')">Retry</button>
        <button class="error-btn error-btn-secondary" @click="emit('close')">
          Back to library
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reader-error-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay, 50);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--reader-bg, #1a1a1a);
  animation: error-fade-in 200ms ease;
}

.error-card {
  text-align: center;
  max-width: 340px;
  padding: 32px 28px;
  animation: error-slide-up 300ms ease;
}

.error-icon {
  color: var(--text-muted, #888);
  margin-bottom: 16px;
  display: inline-flex;
}

.error-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--reader-text, #ddd);
  margin: 0 0 8px;
}

.error-message {
  font-size: 13px;
  color: var(--text-muted, #888);
  margin: 0 0 20px;
  line-height: 1.5;
  word-break: break-word;
}

.error-hint {
  font-size: 13px;
  color: var(--text-muted, #666);
  margin: 0 0 20px;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.error-btn {
  padding: 10px 22px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 120ms ease,
    opacity 120ms ease;
}

.error-btn-primary {
  background: var(--accent, #3b82f6);
  color: #fff;
}

.error-btn-primary:hover {
  opacity: 0.9;
}

.error-btn-secondary {
  background: transparent;
  color: var(--reader-text, #bbb);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
}

.error-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.06);
}

@keyframes error-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes error-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
