<script setup lang="ts">
import { ref } from "vue";
import type { Annotation } from "../../core/types";
import { HIGHLIGHT_COLORS } from "../../utils/colors";

const props = defineProps<{
  visible: boolean;
  annotation: Annotation | null;
  position: { top: number; left: number; height: number };
}>();

const emit = defineEmits<{
  (e: "update-note", id: string, note: string): void;
  (e: "update-color", id: string, color: string): void;
  (e: "delete", id: string): void;
  (e: "close"): void;
}>();

const editing = ref(false);
const noteText = ref("");
const showColors = ref(false);

function startEdit() {
  noteText.value = props.annotation?.note || "";
  editing.value = true;
}

function saveNote() {
  if (props.annotation) {
    emit("update-note", props.annotation.id, noteText.value);
  }
  editing.value = false;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}
</script>

<template>
  <Transition name="popover-fade">
    <div
      v-if="visible && annotation"
      class="annotation-popover"
      :style="{
        top: `${Math.max(8, position.top + position.height + 4)}px`,
        left: `${position.left}px`,
      }"
    >
      <div class="popover-header">
        <span
          class="type-indicator"
          :style="{
            backgroundColor:
              annotation.type === 'highlight' ? annotation.color + '55' : 'transparent',
            borderBottom:
              annotation.type === 'underline' ? `2px solid ${annotation.color}` : 'none',
          }"
        />
        <span class="popover-type">{{
          annotation.type === "highlight" ? "Highlight" : "Underline"
        }}</span>
        <span class="popover-date">{{ formatDate(annotation.createdAt) }}</span>
        <button class="popover-close" @click="emit('close')">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="popover-preview">{{ annotation.textPreview }}</div>

      <div v-if="annotation.note && !editing" class="popover-note">{{ annotation.note }}</div>

      <div v-if="editing" class="popover-edit">
        <textarea
          v-model="noteText"
          class="edit-textarea"
          rows="3"
          placeholder="Add a note..."
          autofocus
        />
        <div class="edit-actions">
          <button class="edit-btn cancel" @click="editing = false">Cancel</button>
          <button class="edit-btn save" @click="saveNote">Save</button>
        </div>
      </div>

      <div class="popover-actions">
        <button class="action-link" @click="startEdit">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {{ annotation.note ? "Edit" : "Add Note" }}
        </button>
        <div class="color-mini-picker" :class="{ open: showColors }">
          <button class="action-link" @click="showColors = !showColors">Color</button>
          <div v-if="showColors" class="color-dropdown">
            <button
              v-for="c in HIGHLIGHT_COLORS"
              :key="c.value"
              class="mini-color-btn"
              :class="{ active: annotation.color === c.value }"
              :style="{ backgroundColor: c.value }"
              @click="
                emit('update-color', annotation.id, c.value);
                showColors = false;
              "
            />
          </div>
        </div>
        <button class="action-link danger" @click="emit('delete', annotation.id)">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
            />
          </svg>
          Delete
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.annotation-popover {
  position: fixed;
  z-index: 1001;
  width: 280px;
  background: var(--modal-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 12px;
}

.popover-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.type-indicator {
  display: inline-block;
  width: 8px;
  height: 14px;
  border-radius: 2px;
}

.popover-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.popover-date {
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
  margin-left: auto;
}

.popover-close {
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
}

.popover-close:hover {
  background: var(--hover-bg, #f3f4f6);
}

.popover-preview {
  font-size: 13px;
  color: var(--text-primary, #111827);
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.popover-note {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
  padding: 8px;
  background: var(--hover-bg, #f3f4f6);
  border-radius: 6px;
  margin-bottom: 8px;
}

.popover-edit {
  margin-bottom: 8px;
}

.edit-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-subtle, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary, #111827);
  background: var(--bg, #fff);
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.edit-textarea:focus {
  border-color: var(--accent, #6366f1);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}

.edit-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.edit-btn.cancel {
  background: transparent;
  color: var(--text-secondary, #6b7280);
}

.edit-btn.save {
  background: var(--accent, #6366f1);
  color: #fff;
}

.popover-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle, #e5e7eb);
}

.action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--accent, #6366f1);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}

.action-link:hover {
  background: var(--accent-soft, #eef2ff);
}

.action-link.danger {
  color: #dc2626;
}

.action-link.danger:hover {
  background: #fef2f2;
}

.color-mini-picker {
  position: relative;
}

.color-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  display: flex;
  gap: 4px;
  padding: 6px;
  background: var(--modal-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.mini-color-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: border-color 120ms ease;
}

.mini-color-btn.active {
  border-color: var(--text-primary, #111827);
}

.mini-color-btn:hover {
  border-color: var(--accent, #6366f1);
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 120ms ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
}
</style>
