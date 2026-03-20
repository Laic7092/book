<script setup lang="ts">
import type { Bookmark } from "../../core/types";

defineProps<{
  bookmark: Bookmark;
}>();

const emit = defineEmits<{
  (e: "save", bookmark: Bookmark): void;
  (e: "close"): void;
}>();

function handleSave() {
  emit("save", props.bookmark);
}
</script>

<template>
  <div class="modal-content-inner">
    <div class="modal-header">
      <h3>Edit Bookmark</h3>
      <button class="modal-close" @click="emit('close')">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Title</label>
        <input
          type="text"
          :value="bookmark.title"
          placeholder="Bookmark title"
          class="form-input"
          @input="
            $emit('update:bookmark', {
              ...bookmark,
              title: ($event.target as HTMLInputElement).value,
            })
          "
        />
      </div>
      <div class="form-group">
        <label>Color</label>
        <div class="color-options">
          <button
            v-for="color in ['blue', 'red', 'green', 'yellow', 'purple']"
            :key="color"
            class="color-btn"
            :class="{ active: bookmark.color === color }"
            :style="{ backgroundColor: `var(--bookmark-${color})` }"
            @click="$emit('update:bookmark', { ...bookmark, color })"
          />
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" @click="emit('close')">Cancel</button>
      <button class="btn-primary" @click="handleSave">Save</button>
    </div>
  </div>
</template>

<style scoped>
.modal-content-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
  color: var(--modal-text);
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--modal-text);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 22px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--modal-bg);
  color: var(--modal-text);
  transition: all 150ms ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.color-options {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.color-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 150ms ease;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: var(--modal-text);
  box-shadow:
    0 0 0 2px var(--modal-bg),
    0 0 0 4px var(--border);
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 18px 22px;
  border-top: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  flex-shrink: 0;
}

.btn-secondary,
.btn-primary {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--modal-text);
}

.btn-secondary:hover {
  background: var(--hover-bg);
}

.btn-primary {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
}

.btn-primary:hover {
  opacity: 0.9;
}
</style>
