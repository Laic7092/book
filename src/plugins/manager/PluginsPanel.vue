<script setup lang="ts">
import { ref, computed } from "vue";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import {
  getAllPlugins,
  setPluginEnabled,
  pluginStateVersion,
} from "../../plugins/manager/registry";
import { pluginManifest } from "../../plugins/plugin-manifest";
import type { Plugin } from "../../plugins/types";

// ── Scene metadata ──

const SCENE_META: Record<string, { label: string }> = {
  "book-import": { label: "书籍解析" },
  bookshelf: { label: "书架功能" },
  reader: { label: "阅读体验" },
  app: { label: "启动加载" },
};

const SCENE_ORDER = ["book-import", "bookshelf", "reader", "app"];

// ── Scene map built from manifest ──

const pluginSceneMap = new Map<string, string | string[]>();
const sceneCount = new Map<string, number>();

for (const meta of pluginManifest) {
  if (!meta.loadOn) continue;
  pluginSceneMap.set(meta.dir, meta.loadOn);
  const scenes = Array.isArray(meta.loadOn) ? meta.loadOn : [meta.loadOn];
  for (const s of scenes) {
    sceneCount.set(s, (sceneCount.get(s) ?? 0) + 1);
  }
}

// ── Filter pills ──

interface FilterPill {
  key: string;
  label: string;
  count?: number;
}

const filterPills = computed<FilterPill[]>(() => {
  const pills: FilterPill[] = [{ key: "all", label: "全部", count: pluginManifest.length }];
  for (const key of SCENE_ORDER) {
    const meta = SCENE_META[key];
    if (meta && sceneCount.has(key)) {
      pills.push({ key, label: meta.label, count: sceneCount.get(key) });
    }
  }
  return pills;
});

// ── Plugin list ──

const allPlugins = computed(() => {
  void pluginStateVersion.value;
  return getAllPlugins();
});

const activeFilter = ref("all");

const filteredPlugins = computed(() => {
  const af = activeFilter.value;
  if (af === "all") return allPlugins.value;
  return allPlugins.value.filter((p) => {
    const scenes = pluginSceneMap.get(p.id);
    if (Array.isArray(scenes)) return scenes.includes(af);
    return scenes === af;
  });
});

function getSceneLabels(pluginId: string): string[] {
  const scenes = pluginSceneMap.get(pluginId);
  if (!scenes) return [];
  const arr = Array.isArray(scenes) ? scenes : [scenes];
  return arr.map((s) => SCENE_META[s]?.label ?? s);
}

// ── Toggle logic ──

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

    <!-- Filter pills -->
    <div class="filter-bar">
      <button
        v-for="pill in filterPills"
        :key="pill.key"
        class="pill"
        :class="{ active: activeFilter === pill.key }"
        @click="activeFilter = pill.key"
      >
        {{ pill.label }}
        <span v-if="pill.count != null" class="pill-count">{{ pill.count }}</span>
      </button>
    </div>

    <div class="plugin-body">
      <div class="plugin-list">
        <div
          v-for="p in filteredPlugins"
          :key="p.id"
          class="plugin-row"
          :class="{ disabled: !isEnabled(p), toggling: toggling.has(p.id) }"
        >
          <div class="plugin-info">
            <span class="plugin-name">
              {{ p.name }}
              <span v-if="isCore(p)" class="core-badge">核心</span>
            </span>
            <span class="plugin-id-line">
              <span class="plugin-id">{{ p.id }} · v{{ p.version }}</span>
              <span class="scene-badges">
                <span v-for="label in getSceneLabels(p.id)" :key="label" class="scene-badge">{{
                  label
                }}</span>
              </span>
            </span>
          </div>
          <div v-if="!isCore(p)" class="toggle" @click.prevent="toggle(p.id)">
            <input type="checkbox" :checked="isEnabled(p)" @change="toggle(p.id)" />
            <span class="toggle-track">
              <span class="toggle-thumb" />
            </span>
          </div>
        </div>
      </div>

      <p v-if="filteredPlugins.length === 0" class="empty-tab">该分类下暂无插件</p>
    </div>
  </div>
</template>

<style scoped>
/* ── Filter pills ── */

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background 150ms,
    color 150ms,
    border-color 150ms;
}

.pill:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.pill.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.1);
}

.pill.active .pill-count {
  background: rgba(255, 255, 255, 0.25);
}

/* ── Plugin body ── */

.plugin-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.plugin-hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 16px 0;
  line-height: 1.5;
}

.core-badge-sm {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
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

.plugin-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.plugin-name {
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-id-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-id {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.core-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft, #eef2ff);
  padding: 2px 8px;
  border-radius: 10px;
}

.scene-badges {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* ── Empty state ── */

.empty-tab {
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  padding: 40px 0;
}

.scene-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--hover-bg);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

.toggle {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 12px;
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
