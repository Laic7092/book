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
  COLUMN_WIDTH_PRESETS,
  MARGIN_PRESETS,
} from "../../utils/settings";

const props = defineProps<{
  settings: ReaderSettings;
}>();

const emit = defineEmits<{
  (e: "update-settings", settings: Partial<ReaderSettings>): void;
  (e: "close"): void;
}>();

const settingsTab = ref<"text" | "theme" | "layout">("text");

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
    columnWidth: 720,
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
        <h3>Reading Settings</h3>
        <button class="reset-btn" @click="resetSettings" title="Reset to defaults">
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
        </button>
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
    <div class="modal-body scroll-body">
      <div class="preview-section">
        <div class="preview-label">Live Preview</div>
        <div class="preview-card" :style="previewStyle">
          <p class="preview-text">
            The quick brown fox jumps over the lazy dog. This is how your reading experience will
            look with the current settings.
          </p>
        </div>
      </div>

      <div class="settings-tabs">
        <button :class="['tab', { active: settingsTab === 'text' }]" @click="settingsTab = 'text'">
          Text
        </button>
        <button
          :class="['tab', { active: settingsTab === 'theme' }]"
          @click="settingsTab = 'theme'"
        >
          Theme
        </button>
        <button
          :class="['tab', { active: settingsTab === 'layout' }]"
          @click="settingsTab = 'layout'"
        >
          Layout
        </button>
      </div>

      <div class="settings-content">
        <!-- Text Tab -->
        <div v-if="settingsTab === 'text'" class="tab-content">
          <div class="setting-item">
            <div class="setting-label">
              <span>Font Size</span>
              <span class="setting-value">{{ settings.fontSize }}px</span>
            </div>
            <div class="size-presets">
              <button
                v-for="size in FONT_SIZE_PRESETS"
                :key="size"
                :class="['size-preset', { active: settings.fontSize === size }]"
                @click="emit('update-settings', { fontSize: size })"
              >
                <span :style="{ fontSize: `${Math.max(12, size - 4)}px` }">A</span>
              </button>
            </div>
            <input
              type="range"
              min="12"
              max="32"
              :value="settings.fontSize"
              @input="
                emit('update-settings', {
                  fontSize: Number(($event.target as HTMLInputElement).value),
                })
              "
              class="range-input"
            />
          </div>

          <div class="setting-item">
            <label class="setting-label">Font Family</label>
            <div class="font-options">
              <button
                v-for="font in FONT_OPTIONS"
                :key="font.value"
                :class="['font-option', { active: settings.fontFamily.includes(font.value) }]"
                @click="emit('update-settings', { fontFamily: font.value })"
                :style="{ fontFamily: font.preview || font.value }"
              >
                <span class="font-name">{{ font.label }}</span>
                <span class="font-sample">The quick brown fox</span>
              </button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>Line Height</span>
              <span class="setting-value">{{ settings.lineHeight.toFixed(2) }}</span>
            </div>
            <div class="line-height-presets">
              <button
                v-for="height in LINE_HEIGHT_PRESETS"
                :key="height"
                :class="['lh-preset', { active: Math.abs(settings.lineHeight - height) < 0.05 }]"
                @click="emit('update-settings', { lineHeight: height })"
              >
                <div class="lh-icon" :style="{ lineHeight: String(height) }">
                  <span>A</span><span>A</span>
                </div>
              </button>
            </div>
            <input
              type="range"
              min="1.2"
              max="2.4"
              step="0.05"
              :value="settings.lineHeight"
              @input="
                emit('update-settings', {
                  lineHeight: Number(($event.target as HTMLInputElement).value),
                })
              "
              class="range-input"
            />
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>Letter Spacing</span>
              <span class="setting-value">{{ settings.letterSpacing || 0 }}em</span>
            </div>
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
        </div>

        <!-- Theme Tab -->
        <div v-if="settingsTab === 'theme'" class="tab-content">
          <div class="setting-item">
            <label class="setting-label">Color Theme</label>
            <div class="theme-grid">
              <button
                v-for="theme in THEME_OPTIONS"
                :key="theme.value"
                :class="['theme-card', { active: settings.theme === theme.value }]"
                @click="emit('update-settings', { theme: theme.value })"
              >
                <div class="theme-card-preview" :class="`theme-${theme.value}`">
                  <div class="theme-card-lines"></div>
                </div>
                <span class="theme-card-label">{{ theme.label }}</span>
                <span v-if="theme.desc" class="theme-card-desc">{{ theme.desc }}</span>
              </button>
            </div>
          </div>

          <div class="setting-item" v-if="settings.theme === 'dark'">
            <label class="setting-label">
              <span>Dark Mode Contrast</span>
              <span class="setting-value">{{ settings.contrast || "normal" }}</span>
            </label>
            <div class="contrast-options">
              <button
                v-for="option in CONTRAST_OPTIONS"
                :key="option.value"
                :class="['contrast-option', { active: settings.contrast === option.value }]"
                @click="emit('update-settings', { contrast: option.value })"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Layout Tab -->
        <div v-if="settingsTab === 'layout'" class="tab-content">
          <div class="setting-item">
            <div class="setting-label">
              <span>Column Width</span>
              <span class="setting-value">{{ settings.columnWidth }}px</span>
            </div>
            <div class="width-presets">
              <button
                v-for="width in COLUMN_WIDTH_PRESETS"
                :key="width"
                :class="['width-preset', { active: settings.columnWidth === width }]"
                @click="emit('update-settings', { columnWidth: width })"
                :style="{ width: `${width / 4}px` }"
              >
                <div class="width-lines"></div>
              </button>
            </div>
            <input
              type="range"
              min="500"
              max="1000"
              step="10"
              :value="settings.columnWidth"
              @input="
                emit('update-settings', {
                  columnWidth: Number(($event.target as HTMLInputElement).value),
                })
              "
              class="range-input"
            />
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>Margins</span>
              <span class="setting-value">{{ settings.margin }}px</span>
            </div>
            <div class="margin-presets">
              <button
                v-for="margin in MARGIN_PRESETS"
                :key="margin"
                :class="['margin-preset', { active: settings.margin === margin }]"
                @click="emit('update-settings', { margin: margin })"
              >
                <div class="margin-icon" :style="{ padding: `${margin / 4}px` }">
                  <div class="margin-box"></div>
                </div>
              </button>
            </div>
            <input
              type="range"
              min="8"
              max="64"
              step="4"
              :value="settings.margin"
              @input="
                emit('update-settings', {
                  margin: Number(($event.target as HTMLInputElement).value),
                })
              "
              class="range-input"
            />
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>Paragraph Spacing</span>
              <span class="setting-value">{{ settings.paragraphSpacing || 1.2 }}em</span>
            </div>
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

          <div class="setting-item">
            <label class="setting-label">
              <span>Text Alignment</span>
            </label>
            <div class="align-options">
              <button
                v-for="align in TEXT_ALIGN_OPTIONS"
                :key="align.value"
                :class="['align-option', { active: settings.textAlign === align.value }]"
                @click="emit('update-settings', { textAlign: align.value })"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
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

          <div class="setting-item">
            <label class="setting-label">
              <span>Reading Mode</span>
            </label>
            <div class="mode-grid">
              <button
                v-for="mode in SCROLL_MODE_OPTIONS"
                :key="mode.value"
                :class="[
                  'mode-card',
                  { active: (settings.scrollMode || 'vertical') === mode.value },
                ]"
                @click="emit('update-settings', { scrollMode: mode.value })"
              >
                <div class="mode-card-icon">
                  <svg
                    v-if="mode.value === 'vertical'"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                  <svg
                    v-else
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M9 4v16M4 12h16" />
                  </svg>
                </div>
                <span class="mode-card-label">{{ mode.label }}</span>
                <span class="mode-card-desc">{{ mode.desc }}</span>
              </button>
            </div>
          </div>

          <div class="setting-item" v-if="(settings.scrollMode || 'vertical') === 'pagination'">
            <label class="setting-label">
              <span>Page Transition</span>
              <span class="setting-value">{{ settings.paginationAnimation || "slide" }}</span>
            </label>
            <div class="animation-options">
              <button
                v-for="anim in ANIMATION_OPTIONS"
                :key="anim.value"
                :class="[
                  'animation-option',
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
  </div>
</template>

<style scoped>
.modal-content-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-height: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--modal-bg);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.header-title h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
  color: var(--modal-text);
}

.reset-btn {
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

.reset-btn:hover {
  background: var(--hover-bg);
  color: var(--accent);
}

.modal-close {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--modal-text);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  contain: layout style;
  scrollbar-gutter: stable;
  overscroll-behavior-y: contain;
  min-height: 0;
}

.modal-body.scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.preview-section {
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.preview-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.preview-card {
  padding: 16px;
  background: var(--modal-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.preview-text {
  margin: 0;
  color: var(--modal-text);
  line-height: inherit;
}

.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 20px;
  background: var(--modal-bg);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 150ms ease;
  position: relative;
  font-family: var(--font-ui);
}

.tab::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 100%;
  height: 2px;
  background: var(--accent);
  transition: transform 200ms ease;
}

.tab:hover {
  color: var(--modal-text);
}

.tab.active {
  color: var(--accent);
}

.tab.active::after {
  transform: translateX(-50%) scaleX(1);
}

.tab-content {
  animation: fadeIn 200ms ease;
}

.settings-content {
  padding: 20px 22px 32px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.setting-item {
  margin-bottom: 28px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.setting-value {
  color: var(--text-secondary);
  font-feature-settings: "tnum";
  font-size: 12px;
}

.size-presets {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}

.size-preset {
  flex: 1;
  padding: 14px 0;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.size-preset span {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--modal-text);
}

.size-preset:hover {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.size-preset.active {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 2px 8px rgba(139, 46, 58, 0.25);
}

.size-preset.active span {
  color: white;
}

.font-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.font-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  text-align: left;
}

.font-option:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.font-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.font-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--modal-text);
}

.font-sample {
  font-size: 13px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.line-height-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.lh-preset {
  flex: 1;
  padding: 14px 0;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lh-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--modal-text);
}

.lh-icon span:first-child {
  opacity: 0.5;
}

.lh-preset:hover {
  border-color: var(--accent);
}

.lh-preset.active {
  border-color: var(--accent);
  background: var(--accent);
}

.lh-preset.active .lh-icon {
  color: white;
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
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--modal-bg);
  border: 2px solid var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all var(--transition-fast);
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
}

.theme-card:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.theme-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.theme-card-preview {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;
  overflow: hidden;
}

.theme-card-lines {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-card-lines::before,
.theme-card-lines::after {
  content: "";
  height: 2px;
  border-radius: 1px;
}

.theme-card-lines::before {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
}

.theme-card-lines::after {
  width: 70%;
  background: rgba(0, 0, 0, 0.2);
}

.theme-light .theme-card-preview {
  background: linear-gradient(135deg, #fdfcfb 0%, #f5f3ef 100%);
}

.theme-light .theme-card-lines::before,
.theme-light .theme-card-lines::after {
  background: rgba(31, 26, 23, 0.4);
}

.theme-dark .theme-card-preview {
  background: linear-gradient(135deg, #1a1816 0%, #2a2622 100%);
}

.theme-dark .theme-card-lines::before,
.theme-dark .theme-card-lines::after {
  background: rgba(232, 228, 222, 0.5);
}

.theme-sepia .theme-card-preview {
  background: linear-gradient(135deg, #f5f0e6 0%, #ebe5d5 100%);
}

.theme-sepia .theme-card-lines::before,
.theme-sepia .theme-card-lines::after {
  background: rgba(61, 53, 42, 0.4);
}

.theme-card-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
}

.theme-card-desc {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: lowercase;
}

.contrast-options {
  display: flex;
  gap: 8px;
}

.contrast-option {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
  transition: all 150ms ease;
}

.contrast-option:hover {
  border-color: var(--accent);
}

.contrast-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.width-presets {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
  padding: 12px;
  background: var(--hover-bg);
  border-radius: 10px;
}

.width-preset {
  height: 48px;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.width-preset:hover {
  border-color: var(--accent);
}

.width-preset.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.width-lines {
  width: 60%;
  height: 24px;
  border: 2px solid var(--modal-text);
  border-radius: 2px;
  opacity: 0.5;
}

.margin-presets {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  padding: 12px;
  background: var(--hover-bg);
  border-radius: 10px;
}

.margin-preset {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.margin-preset:hover {
  border-color: var(--accent);
}

.margin-preset.active {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 2px 8px rgba(139, 46, 58, 0.25);
}

.margin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--border-subtle);
  border-radius: 4px;
  width: 32px;
  height: 32px;
}

.margin-box {
  width: 16px;
  height: 16px;
  border: 2px solid var(--modal-text);
  border-radius: 3px;
}

.margin-preset.active .margin-box {
  border-color: white;
}

.align-options {
  display: flex;
  gap: 8px;
}

.align-option {
  flex: 1;
  padding: 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--modal-text);
}

.align-option:hover {
  border-color: var(--accent);
}

.align-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
}

.mode-card:hover {
  border-color: var(--border);
  background: var(--hover-bg);
}

.mode-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mode-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--modal-text);
}

.mode-card.active .mode-card-icon {
  background: var(--accent);
  color: white;
}

.mode-card-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--modal-text);
}

.mode-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.animation-options {
  display: flex;
  gap: 8px;
}

.animation-option {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--modal-text);
  transition: all 150ms ease;
}

.animation-option:hover {
  border-color: var(--accent);
}

.animation-option.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
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
