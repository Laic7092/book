<script setup lang="ts">
import { ref } from "vue";
import ModalHeader from "./ModalHeader.vue";
import { getAllPlugins, setPluginEnabled } from "../../plugins/registry";
import type { Plugin } from "../../plugins/types";

const plugins = ref(getAllPlugins());

function toggle(id: string) {
  const p = plugins.value.find((p) => p.id === id);
  if (!p) return;
  const next = !isEnabled(p);
  p.enabled = next;
  setPluginEnabled(id, next);
}

function isEnabled(p: Plugin): boolean {
  return p.enabled !== false;
}

defineEmits<{ close: [] }>();
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="插件管理" @close="$emit('close')" />

    <div class="plugin-body">
      <p class="plugin-hint">禁用插件会立即生效。核心插件（TXT/EPUB 解析器）建议保持启用。</p>

      <div class="plugin-list">
        <label
          v-for="p in plugins"
          :key="p.id"
          class="plugin-row"
          :class="{ disabled: !isEnabled(p) }"
        >
          <div class="plugin-info">
            <span class="plugin-name">{{ p.name }}</span>
            <span class="plugin-id">{{ p.id }} · v{{ p.version }}</span>
          </div>
          <div class="toggle" @click.prevent="toggle(p.id)">
            <input type="checkbox" :checked="isEnabled(p)" @change="toggle(p.id)" />
            <span class="toggle-track">
              <span class="toggle-thumb" />
            </span>
          </div>
        </label>
      </div>
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

.plugin-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.plugin-hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px;
  line-height: 1.5;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.plugin-row:hover {
  background: var(--hover-bg);
}

.plugin-row.disabled {
  opacity: 0.55;
}

.plugin-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-name {
  font-size: 15px;
  font-weight: 500;
}

.plugin-id {
  font-size: 12px;
  color: var(--text-muted);
}

/* Toggle */
.toggle {
  position: relative;
  display: flex;
  align-items: center;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: var(--border-color);
  transition: background-color 200ms ease;
  display: flex;
  align-items: center;
  padding: 0 3px;
  flex-shrink: 0;
}

input:checked + .toggle-track {
  background: var(--color-accent);
}

.toggle-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 200ms ease;
}

input:checked + .toggle-track .toggle-thumb {
  transform: translateX(18px);
}
</style>
