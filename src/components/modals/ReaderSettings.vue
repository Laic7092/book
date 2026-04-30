<script setup lang="ts">
import { onUnmounted } from "vue";
import type { ReaderSettings } from "../../core/types";
import {
  THEME_OPTIONS,
  SCROLL_MODE_OPTIONS,
  ANIMATION_OPTIONS,
  FONT_SIZE_PRESETS,
} from "../../utils/settings";

const props = defineProps<{
  settings: ReaderSettings;
}>();

const emit = defineEmits<{
  (e: "update-settings", settings: Partial<ReaderSettings>): void;
  (e: "close"): void;
  (e: "open-typography-settings"): void;
}>();

let searchDebounceTimer: number | null = null;
onUnmounted(() => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
});
</script>

<template>
  <div class="modal-content-inner">
    <div class="modal-header">
      <div class="header-title">
        <h3>阅读设置</h3>
      </div>
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
      <!-- 核心设置 -->
      <div class="core-settings">
        <!-- 主题 -->
        <div class="setting-row">
          <label class="setting-label">主题</label>
          <div class="theme-options">
            <button
              v-for="theme in THEME_OPTIONS"
              :key="theme.value"
              :class="['theme-btn', { active: settings.theme === theme.value }]"
              @click="emit('update-settings', { theme: theme.value })"
            >
              <div :class="['theme-preview', `theme-${theme.value}`]"></div>
              <span>{{ theme.label }}</span>
            </button>
          </div>
        </div>

        <!-- 字号 -->
        <div class="setting-row">
          <label class="setting-label">字号</label>
          <div class="size-options">
            <button
              v-for="size in FONT_SIZE_PRESETS"
              :key="size"
              :class="['size-btn', { active: settings.fontSize === size }]"
              @click="emit('update-settings', { fontSize: size })"
            >
              {{ size }}
            </button>
          </div>
        </div>

        <!-- 阅读模式 -->
        <div class="setting-row">
          <label class="setting-label">阅读模式</label>
          <div class="mode-options">
            <button
              v-for="mode in SCROLL_MODE_OPTIONS"
              :key="mode.value"
              :class="['mode-btn', { active: (settings.scrollMode || 'vertical') === mode.value }]"
              @click="emit('update-settings', { scrollMode: mode.value })"
            >
              <svg
                v-if="mode.value === 'vertical'"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
              <svg
                v-else
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M9 4v16M4 12h16" />
              </svg>
              <span>{{ mode.label }}</span>
              <span class="mode-desc">{{ mode.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 翻页动画 -->
        <div
          class="setting-row"
          v-if="(settings.scrollMode || 'vertical') === 'pagination' && false"
        >
          <label class="setting-label">
            <span>翻页效果</span>
            <span class="setting-value">{{ settings.paginationAnimation || "fade" }}</span>
          </label>
          <div class="anim-options">
            <button
              v-for="anim in ANIMATION_OPTIONS"
              :key="anim.value"
              :class="[
                'anim-btn',
                { active: (settings.paginationAnimation || 'fade') === anim.value },
              ]"
              @click="emit('update-settings', { paginationAnimation: anim.value })"
            >
              {{ anim.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 自定义排版按钮 -->
      <button class="typography-btn" @click="emit('open-typography-settings')">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
        <span>自定义排版</span>
        <svg
          class="arrow-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
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
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  flex-shrink: 0;
}

.header-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--modal-text);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

.core-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--modal-text);
}

.setting-value {
  color: var(--text-secondary);
  font-size: 13px;
  font-feature-settings: "tnum";
}

.theme-options,
.size-options,
.mode-options,
.anim-options {
  display: flex;
  gap: 8px;
}

.theme-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  font-size: 13px;
  color: var(--modal-text);
}

.theme-btn:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.theme-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.theme-preview {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.theme-preview.theme-light {
  background: #fff;
}
.theme-preview.theme-dark {
  background: #1a1a1a;
}
.theme-preview.theme-sepia {
  background: #f4ecd8;
}

.size-btn {
  flex: 1;
  padding: 10px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  font-size: 14px;
  font-weight: 600;
  color: var(--modal-text);
}

.size-btn:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.size-btn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
}

.mode-btn:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.mode-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.mode-btn span:first-of-type {
  font-size: 14px;
  font-weight: 500;
  color: var(--modal-text);
}

.mode-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Typography button */
.typography-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  margin-top: 20px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated, var(--modal-bg));
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--modal-text);
  transition: all 150ms ease;
  gap: 10px;
}

.typography-btn:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.typography-btn .arrow-icon {
  flex-shrink: 0;
  transition: transform 150ms ease;
}

.typography-btn:hover .arrow-icon {
  transform: translateX(3px);
}

/* Animation options */
.anim-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  font-size: 13px;
  color: var(--modal-text);
}

.anim-btn:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.anim-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
</style>
