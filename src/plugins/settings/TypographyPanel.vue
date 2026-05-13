<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import {
  FONT_OPTIONS,
  LINE_HEIGHT_PRESETS,
  MARGIN_PRESETS,
  TEXT_ALIGN_OPTIONS,
  CONTRAST_OPTIONS,
} from "./options";
import { createPreviewIframe, type PreviewIframe } from "./preview-iframe";
import { getSettingsState } from "./index";
import { DEFAULT_SETTINGS } from "./defaults";

const state = getSettingsState();
if (!state) throw new Error("TypographyPanel: settings plugin not initialized");
const settings = state.settings;

const emit = defineEmits<{
  (e: "close"): void;
}>();

const previewContainerRef = ref<HTMLElement | null>(null);
let preview: PreviewIframe | null = null;

onMounted(() => {
  const container = previewContainerRef.value;
  if (!container) return;
  preview = createPreviewIframe(container, settings.value);
});

watch(
  () => [
    settings.value.fontSize,
    settings.value.fontFamily,
    settings.value.lineHeight,
    settings.value.letterSpacing,
    settings.value.textAlign,
    settings.value.paragraphSpacing,
    settings.value.customTypography,
    settings.value.theme,
    settings.value.contrast,
  ],
  () => {
    preview?.updateStyles(settings.value);
  },
);

onUnmounted(() => {
  preview?.destroy();
});

function resetSettings() {
  state.update({
    fontSize: DEFAULT_SETTINGS.fontSize,
    fontFamily: DEFAULT_SETTINGS.fontFamily,
    lineHeight: DEFAULT_SETTINGS.lineHeight,
    theme: DEFAULT_SETTINGS.theme,
    margin: DEFAULT_SETTINGS.margin,
    letterSpacing: DEFAULT_SETTINGS.letterSpacing,
    paragraphSpacing: DEFAULT_SETTINGS.paragraphSpacing,
    textAlign: DEFAULT_SETTINGS.textAlign,
    contrast: DEFAULT_SETTINGS.contrast,
    customTypography: DEFAULT_SETTINGS.customTypography,
  });
}
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="自定义排版" @close="emit('close')">
      <template #extra>
        <div ref="previewContainerRef" class="preview-card"></div>
      </template>
    </ModalHeader>

    <div class="modal-body">
      <!-- 自定义排版开关 -->
      <div class="setting-section">
        <div class="toggle-row">
          <label class="toggle-label">
            <span>启用自定义排版</span>
            <span class="toggle-desc">覆盖书籍原始排版，应用以下自定义设置</span>
          </label>
          <button
            :class="['toggle-switch', { active: settings.customTypography }]"
            @click="state.update({ customTypography: !settings.customTypography })"
            :aria-checked="settings.customTypography"
            role="switch"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
      </div>

      <!-- 排版设置（受开关控制） -->
      <div class="typography-group" v-if="settings.customTypography">
        <!-- 字体 -->
        <div class="setting-row">
          <label class="setting-label">字体</label>
          <div class="font-options">
            <button
              v-for="font in FONT_OPTIONS"
              :key="font.value"
              :class="['font-btn', { active: settings.fontFamily.includes(font.value) }]"
              @click="state.update({ fontFamily: font.value })"
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
              @click="state.update({ lineHeight: height })"
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
              @click="state.update({ margin: margin })"
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
              @click="state.update({ textAlign: align.value })"
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
        <div v-if="settings.theme === 'dark'" class="setting-row">
          <label class="setting-label">
            <span>暗色对比度</span>
            <span class="setting-value">{{ settings.contrast || "normal" }}</span>
          </label>
          <div class="contrast-options">
            <button
              v-for="option in CONTRAST_OPTIONS"
              :key="option.value"
              :class="['contrast-btn', { active: settings.contrast === option.value }]"
              @click="state.update({ contrast: option.value })"
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
              state.update({ letterSpacing: Number(($event.target as HTMLInputElement).value) })
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
              state.update({ paragraphSpacing: Number(($event.target as HTMLInputElement).value) })
            "
            class="range-input"
          />
        </div>
      </div>

      <!-- 重置 -->
      <div class="setting-section">
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-body {
  padding: 16px 20px 24px;
}

.setting-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

/* Toggle switch styles */
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--bg-elevated, var(--modal-bg));
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: border-color 200ms ease;
}

.toggle-row:hover {
  border-color: var(--accent);
}

.toggle-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.toggle-label span:first-child {
  font-size: 14px;
  font-weight: 600;
  color: var(--modal-text);
}

.toggle-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.toggle-switch {
  position: relative;
  width: 44px;
  height: 26px;
  border: none;
  border-radius: 13px;
  background: var(--border);
  cursor: pointer;
  transition: background 200ms ease;
  flex-shrink: 0;
}

.toggle-switch:hover {
  filter: brightness(1.1);
}

.toggle-switch.active {
  background: var(--accent);
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(18px);
}

/* Reset button */
.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.reset-btn:hover {
  border-color: var(--accent);
  border-style: solid;
  color: var(--accent);
  background: var(--accent-soft);
}

/* Preview card */
.preview-card {
  padding: 0;
  background: var(--bg-elevated, var(--modal-bg));
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  overflow: hidden;
  height: 180px;
}

/* Typography settings group */
.typography-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background: var(--bg-elevated, var(--modal-bg));
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  margin-bottom: 20px;
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

/* Font options */
.font-options,
.lh-options,
.margin-options,
.align-options,
.contrast-options {
  display: flex;
  gap: 8px;
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
  background: var(--bg-secondary);
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
  background: var(--bg-secondary);
}

.lh-btn.active,
.margin-btn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.align-btn,
.contrast-btn {
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
.contrast-btn:hover {
  border-color: var(--border);
  background: var(--bg-secondary);
}

.align-btn.active,
.contrast-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

/* Range input */
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
  transition: transform 150ms ease;
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}
</style>
