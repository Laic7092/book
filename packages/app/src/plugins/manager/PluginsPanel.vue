<script setup lang="ts">
import { ref, computed } from "vue";
import ModalPanel from "../../components/modals/ModalPanel.vue";
import FilterBar from "../../components/ui/FilterBar.vue";
import ToggleSwitch from "../../components/ui/ToggleSwitch.vue";
import {
  getAllPlugins,
  setPluginEnabled,
  pluginStateVersion,
} from "../../plugins/manager/registry";
import PLUGIN_METADATA from "../../plugins/plugin-metadata.json";
import type { Plugin } from "../../plugins/types";

// ── Scene metadata ──

const SCENE_META: Record<string, { label: string }> = {
  "book-import": { label: "书籍解析" },
  bookshelf: { label: "书架功能" },
  reader: { label: "阅读体验" },
  app: { label: "启动加载" },
};

const SCENE_ORDER = ["reader", "book-import", "bookshelf", "app"];

// ── Scene map built from manifest ──

const pluginSceneMap = new Map<string, string | string[]>();
const sceneCount = new Map<string, number>();

for (const meta of PLUGIN_METADATA) {
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
  const pills: FilterPill[] = [];
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

// setup 失败 (含 apiVersion 不匹配) 时展示错误原因; 错误只影响该插件自身.
const setupErrors = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {};
  for (const p of allPlugins.value) {
    const err = (p as Plugin & { setupError?: Error }).setupError;
    if (err) result[p.id] = err.message;
  }
  return result;
});

const activeFilter = ref("reader");

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
  <ModalPanel title="插件管理" body-padding="0 20px 20px" @close="$emit('close')">
    <template #toolbar>
      <FilterBar v-model="activeFilter" :items="filterPills" />
    </template>
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
            <span v-if="setupErrors[p.id]" class="setup-error" :title="setupErrors[p.id]">
              加载失败
            </span>
            <span class="scene-badges">
              <span v-for="label in getSceneLabels(p.id)" :key="label" class="scene-badge">{{
                label
              }}</span>
            </span>
          </span>
        </div>
        <ToggleSwitch
          v-if="!isCore(p)"
          :model-value="isEnabled(p)"
          :disabled="toggling.has(p.id)"
          :label="p.name"
          @update:model-value="toggle(p.id)"
        />
      </div>
    </div>

    <p v-if="filteredPlugins.length === 0" class="empty-tab">该分类下暂无插件</p>
  </ModalPanel>
</template>

<style scoped>
/* ── Plugin list ── */

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
  color: var(--text-secondary);
  white-space: nowrap;
}

.setup-error {
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
  background: rgba(220, 38, 38, 0.1);
  padding: 1px 8px;
  border-radius: 8px;
  cursor: help;
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
  color: var(--text-secondary);
  font-size: 14px;
  padding: 40px 0;
}

.scene-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--hover-bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  white-space: nowrap;
}
</style>
