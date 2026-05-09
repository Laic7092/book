<script setup lang="ts">
import { ref } from "vue";
import { HIGHLIGHT_COLORS } from "../../config/colors";

defineProps<{
  visible: boolean;
  position: { top: number; left: number };
  showNoteInput: boolean;
}>();

const emit = defineEmits<{
  (e: "highlight", color: string): void;
  (e: "underline"): void;
  (e: "add-note"): void;
  (e: "save-note", text: string): void;
  (e: "cancel-note"): void;
}>();

let noteText = ref("");
</script>

<template>
  <Transition name="toolbar-fade">
    <div
      v-if="visible"
      class="selection-toolbar"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >
      <template v-if="!showNoteInput">
        <div class="toolbar-row">
          <button
            v-for="c in HIGHLIGHT_COLORS"
            :key="c.value"
            class="color-btn"
            :style="{ backgroundColor: c.value }"
            :title="c.label"
            @mousedown.prevent
            @click.stop="emit('highlight', c.value)"
          />
          <span class="toolbar-divider" />
          <button
            class="toolbar-btn"
            title="Underline"
            @mousedown.prevent
            @click.stop="emit('underline')"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3" />
              <line x1="4" y1="21" x2="20" y2="21" />
            </svg>
          </button>
          <button
            class="toolbar-btn"
            title="Add Note"
            @mousedown.prevent
            @click.stop="emit('add-note')"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </button>
        </div>
      </template>
      <template v-else>
        <div class="note-input-row">
          <textarea
            v-model="noteText"
            class="note-textarea"
            placeholder="Add a note..."
            rows="2"
            @mousedown.stop
            autofocus
          />
          <div class="note-actions">
            <button class="note-btn cancel" @mousedown.prevent @click.stop="emit('cancel-note')">
              Cancel
            </button>
            <button
              class="note-btn save"
              @mousedown.prevent
              @click.stop="emit('save-note', noteText)"
            >
              Save
            </button>
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.selection-toolbar {
  position: fixed;
  z-index: var(--z-overlay);
  transform: translateY(-100%) translateY(-8px);
  background: var(--modal-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px 8px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    transform 120ms ease;
  padding: 0;
}

.color-btn:hover {
  border-color: var(--accent, #6366f1);
  transform: scale(1.15);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border-subtle, #e5e7eb);
  margin: 0 4px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 120ms ease;
}

.toolbar-btn:hover {
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-primary, #111827);
}

.note-input-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-textarea {
  width: 200px;
  padding: 8px;
  border: 1px solid var(--border-subtle, #e5e7eb);
  border-radius: 6px;
  font-size: 16px;
  font-family: inherit;
  color: var(--text-primary, #111827);
  background: var(--bg, #fff);
  resize: none;
  outline: none;
}

.note-textarea:focus {
  border-color: var(--accent, #6366f1);
}

.note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.note-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}

.note-btn.cancel {
  background: transparent;
  color: var(--text-secondary, #6b7280);
}

.note-btn.cancel:hover {
  background: var(--hover-bg, #f3f4f6);
}

.note-btn.save {
  background: var(--accent, #6366f1);
  color: #fff;
}

.note-btn.save:hover {
  opacity: 0.9;
}

.toolbar-fade-enter-active,
.toolbar-fade-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.toolbar-fade-enter-from,
.toolbar-fade-leave-to {
  opacity: 0;
  transform: translateY(-100%) translateY(-4px);
}
</style>
