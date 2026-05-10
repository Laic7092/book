<script setup lang="ts">
import { ref, computed } from "vue";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { getAllPlugins, setPluginEnabled, pluginStateVersion } from "../../plugins/registry";
import type { Plugin } from "../../plugins/types";

// ── Scene to label mapping ──

const metas = import.meta.glob<{ loadOn: string }>("../../plugins/*/meta.ts", { eager: true });

const pluginSceneMap = new Map<string, string>();
for (const [path, meta] of Object.entries(metas)) {
  const dir = path.split("/").slice(-2, -1)[0]; // e.g. "annotations"
  if (meta.loadOn) {
    pluginSceneMap.set(dir, meta.loadOn);
  }
}

const TAB_CONFIG: { key: string; label: string }[] = [
  { key: "book-import", label: "书籍解析" },
  { key: "bookshelf", label: "书架功能" },
  { key: "reader", label: "阅读体验" },
];

const SCENE_LABELS: Record<string, string> = {
  "book-import": "书籍解析",
  bookshelf: "书架功能",
  reader: "阅读体验",
};

// ── Plugin list ──

const allPlugins = computed(() => {
  void pluginStateVersion.value;
  return getAllPlugins();
});

const activeTab = ref(TAB_CONFIG[0]?.key ?? "reader");

const filteredPlugins = computed(() =>
  allPlugins.value.filter((p) => pluginSceneMap.get(p.id) === activeTab.value),
);

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

    <!-- Tabs -->
    <div class="plugin-tabs">
      <button
        v-for="tab in TAB_CONFIG"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="plugin-body">
      <p class="plugin-hint">
        核心插件（带 <span class="core-badge-sm">核心</span> 标记）不可禁用。 关闭后即时生效。
      </p>

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

      <p v-if="filteredPlugins.length === 0" class="empty-tab">该分类下暂无插件</p>
    </div>
  </div>
</template>

<style scoped>
.plugin-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
}

.tab-btn {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color 150ms,
    border-color 150ms;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

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
  gap: 2px;
}

.plugin-name {
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-id {
  font-size: 12px;
  color: var(--text-muted);
}

.core-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft, #eef2ff);
  padding: 2px 8px;
  border-radius: 10px;
}

.empty-tab {
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  padding: 40px 0;
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
