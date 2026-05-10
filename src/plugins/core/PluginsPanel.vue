<script setup lang="ts">
import { ref, computed } from "vue";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { getAllPlugins, setPluginEnabled, pluginStateVersion } from "../../plugins/registry";
import type { Plugin } from "../../plugins/types";

const allPlugins = computed(() => {
  void pluginStateVersion.value;
  return getAllPlugins();
});

const corePlugins = computed(() => allPlugins.value.filter((p) => p.core));

const optionalPlugins = computed(() => allPlugins.value.filter((p) => !p.core));

const toggling = ref<Set<string>>(new Set());

async function toggle(id: string) {
  const p = allPlugins.value.find((p) => p.id === id);
  if (!p || toggling.value.has(id)) return;
  const next = !isEnabled(p);
  toggling.value.add(id);
  try {
    await setPluginEnabled(id, next);
  } finally {
    toggling.value.delete(id);
  }
}

function isEnabled(p: Plugin): boolean {
  return p.enabled !== false;
}

function isCore(p: Plugin): boolean {
  return p.core === true;
}

defineEmits<{ close: [] }>();
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="插件管理" @close="$emit('close')" />

    <div class="plugin-body">
      <p class="plugin-hint">核心插件无法禁用。非核心插件禁用后会立即生效。</p>

      <div v-if="corePlugins.length" class="core-plugins">
        <div class="section-label">核心插件</div>
        <div class="core-list">
          <div v-for="p in corePlugins" :key="p.id" class="core-item">
            <span class="core-name">{{ p.name }}</span>
            <span class="core-badge">核心</span>
          </div>
        </div>
      </div>

      <div v-if="optionalPlugins.length" class="optional-plugins">
        <div class="section-label">可选插件</div>
        <div class="plugin-list">
          <div
            v-for="p in optionalPlugins"
            :key="p.id"
            class="plugin-row"
            :class="{ disabled: !isEnabled(p), toggling: toggling.has(p.id) }"
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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.core-plugins {
  margin-bottom: 20px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.core-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.core-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-secondary);
  border-radius: 10px;
  font-size: 14px;
}

.core-name {
  font-weight: 500;
}

.optional-plugins {
  margin-top: 4px;
}

.plugin-hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 16px 0;
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

.plugin-row.toggling {
  pointer-events: none;
  opacity: 0.7;
}

.core-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft, #eef2ff);
  padding: 4px 10px;
  border-radius: 12px;
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
