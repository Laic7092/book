<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import type { ReaderSettings } from "../../core/types";
import {
  FONT_OPTIONS,
  THEME_OPTIONS,
  CONTRAST_OPTIONS,
  TEXT_ALIGN_OPTIONS,
  SCROLL_MODE_OPTIONS,
  ANIMATION_OPTIONS,
  FONT_SIZE_PRESETS,
  LINE_HEIGHT_PRESETS,
  MARGIN_PRESETS,
} from "../../utils/settings";

const props = defineProps<{
  settings: ReaderSettings;
}>();

const emit = defineEmits<{
  (e: "update-settings", settings: Partial<ReaderSettings>): void;
  (e: "close"): void;
}>();

const showMore = ref(false);

const previewStyle = computed(() => ({
  fontSize: `${props.settings.fontSize}px`,
  fontFamily: props.settings.fontFamily,
  lineHeight: String(props.settings.lineHeight),
  letterSpacing: `${props.settings.letterSpacing || 0}em`,
}));

function resetSettings() {
  emit("update-settings", {
    fontSize: 18,
    fontFamily: "Literata, Georgia, serif",
    lineHeight: 1.6,
    theme: "light",
    margin: 24,
    letterSpacing: 0,
    paragraphSpacing: 1.2,
    textAlign: "left",
    contrast: "normal",
  });
}

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
      </div>

      <!-- 展开更多 -->
      <button class="expand-btn" @click="showMore = !showMore">
        <svg
          :class="['expand-icon', { open: showMore }]"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span>{{ showMore ? "收起" : "更多设置" }}</span>
      </button>

      <!-- 折叠内容 -->
      <div v-if="showMore" class="expanded-content">
        <!-- 重置 -->
        <button class="reset-btn" @click="resetSettings">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span>重置为默认</span>
        </button>

        <!-- 预览 -->
        <div class="setting-row">
          <label class="setting-label">预览</label>
          <div class="preview-card" :style="previewStyle">
            <p>
              这是预览效果，将根据您的设置进行调整。阅读体验包括段落间距、行距、字体选择等参数的实时展示。
            </p>
            <p>
              第一段文字展示了阅读器的核心显示效果。您可以在这里看到不同设置下的视觉呈现，包括字体大小、行高、边距等参数的组合效果。
            </p>
          </div>
        </div>

        <!-- 字体 -->
        <div class="setting-row">
          <label class="setting-label">字体</label>
          <div class="font-options">
            <button
              v-for="font in FONT_OPTIONS"
              :key="font.value"
              :class="['font-btn', { active: settings.fontFamily.includes(font.value) }]"
              @click="emit('update-settings', { fontFamily: font.value })"
              :style="{ fontFamily: font.preview || font.value }"
            >
              {{ font.label }}
            </button>
          </div>
        </div>

        <!-- 行距 -->
        <div class="setting-row">
          <label class="setting-label">
            <span>行距</span>
            <span class="setting-value">{{ settings.lineHeight.toFixed(1) }}</span>
          </label>
          <div class="lh-options">
            <button
              v-for="height in LINE_HEIGHT_PRESETS"
              :key="height"
              :class="['lh-btn', { active: Math.abs(settings.lineHeight - height) < 0.05 }]"
              @click="emit('update-settings', { lineHeight: height })"
            >
              {{ height }}
            </button>
          </div>
        </div>

        <!-- 边距 -->
        <div class="setting-row">
          <label class="setting-label">
            <span>页边距</span>
            <span class="setting-value">{{ settings.margin }}px</span>
          </label>
          <div class="margin-options">
            <button
              v-for="margin in MARGIN_PRESETS"
              :key="margin"
              :class="['margin-btn', { active: settings.margin === margin }]"
              @click="emit('update-settings', { margin: margin })"
            >
              {{ margin }}
            </button>
          </div>
        </div>

        <!-- 对齐 -->
        <div class="setting-row">
          <label class="setting-label">对齐</label>
          <div class="align-options">
            <button
              v-for="align in TEXT_ALIGN_OPTIONS"
              :key="align.value"
              :class="['align-btn', { active: settings.textAlign === align.value }]"
              @click="emit('update-settings', { textAlign: align.value })"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect v-if="align.value === 'left'" x="3" y="5" width="18" height="2" />
                <rect v-if="align.value === 'left'" x="3" y="9" width="14" height="2" />
                <rect v-if="align.value === 'left'" x="3" y="13" width="16" height="2" />
                <rect v-if="align.value === 'left'" x="3" y="17" width="12" height="2" />
                <rect v-if="align.value === 'center'" x="3" y="5" width="18" height="2" />
                <rect v-if="align.value === 'center'" x="5" y="9" width="14" height="2" />
                <rect v-if="align.value === 'center'" x="4" y="13" width="16" height="2" />
                <rect v-if="align.value === 'center'" x="6" y="17" width="12" height="2" />
                <rect v-if="align.value === 'justify'" x="3" y="5" width="18" height="2" />
                <rect v-if="align.value === 'justify'" x="3" y="9" width="18" height="2" />
                <rect v-if="align.value === 'justify'" x="3" y="13" width="18" height="2" />
                <rect v-if="align.value === 'justify'" x="3" y="17" width="14" height="2" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 暗色对比度 -->
        <div class="setting-row" v-if="settings.theme === 'dark'">
          <label class="setting-label">
            <span>暗色对比度</span>
            <span class="setting-value">{{ settings.contrast || "normal" }}</span>
          </label>
          <div class="contrast-options">
            <button
              v-for="option in CONTRAST_OPTIONS"
              :key="option.value"
              :class="['contrast-btn', { active: settings.contrast === option.value }]"
              @click="emit('update-settings', { contrast: option.value })"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <!-- 字间距 -->
        <div class="setting-row">
          <label class="setting-label">
            <span>字间距</span>
            <span class="setting-value">{{ settings.letterSpacing || 0 }}em</span>
          </label>
          <input
            type="range"
            min="-0.05"
            max="0.2"
            step="0.01"
            :value="settings.letterSpacing || 0"
            @input="
              emit('update-settings', {
                letterSpacing: Number(($event.target as HTMLInputElement).value),
              })
            "
            class="range-input"
          />
        </div>

        <!-- 段落间距 -->
        <div class="setting-row">
          <label class="setting-label">
            <span>段落间距</span>
            <span class="setting-value">{{ settings.paragraphSpacing || 1.2 }}em</span>
          </label>
          <input
            type="range"
            min="0.8"
            max="2.0"
            step="0.1"
            :value="settings.paragraphSpacing || 1.2"
            @input="
              emit('update-settings', {
                paragraphSpacing: Number(($event.target as HTMLInputElement).value),
              })
            "
            class="range-input"
          />
        </div>

        <!-- 翻页动画 -->
        <div class="setting-row" v-if="(settings.scrollMode || 'vertical') === 'pagination'">
          <label class="setting-label">
            <span>翻页效果</span>
            <span class="setting-value">{{ settings.paginationAnimation || "slide" }}</span>
          </label>
          <div class="anim-options">
            <button
              v-for="anim in ANIMATION_OPTIONS"
              :key="anim.value"
              :class="[
                'anim-btn',
                { active: (settings.paginationAnimation || 'slide') === anim.value },
              ]"
              @click="emit('update-settings', { paginationAnimation: anim.value })"
            >
              {{ anim.label }}
            </button>
          </div>
        </div>
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
.font-options,
.lh-options,
.margin-options,
.align-options,
.contrast-options,
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

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.expand-btn:hover {
  border-color: var(--accent);
  color: var(--modal-text);
}

.expand-icon {
  transition: transform 200ms ease;
}

.expand-icon.open {
  transform: rotate(180deg);
}

.expanded-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.reset-btn:hover {
  border-color: var(--accent);
  color: var(--modal-text);
}

.preview-card {
  padding: 16px;
  background: var(--modal-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.preview-card p {
  margin: 0 0 12px;
  color: var(--modal-text);
  line-height: inherit;
}

.preview-card p:last-child {
  margin-bottom: 0;
}

.font-btn {
  flex: 1;
  padding: 10px 8px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-btn:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.font-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.lh-btn,
.margin-btn {
  flex: 1;
  padding: 10px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  font-size: 14px;
  font-weight: 500;
  color: var(--modal-text);
}

.lh-btn:hover,
.margin-btn:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.lh-btn.active,
.margin-btn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.align-btn,
.contrast-btn,
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

.align-btn:hover,
.contrast-btn:hover,
.anim-btn:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.align-btn.active,
.contrast-btn.active,
.anim-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.range-input {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  appearance: none;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--modal-bg);
  border: 2px solid var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
