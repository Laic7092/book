<script setup lang="ts">
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { THEME_OPTIONS, READING_MODE_OPTIONS, FONT_SIZE_PRESETS } from "./options";
import { getSettingsState } from "./index";
import { useUIStore } from "../../stores/ui";
import { themeRegistry } from "../../core/theme-registry";
import { ref } from "vue";

const state = getSettingsState();
if (!state) throw new Error("SettingsPanel: settings plugin not initialized");
const settings = state.settings;

function themePreviewBg(themeId: string): string {
  return themeRegistry.get(themeId).chrome.bg;
}

const emit = defineEmits<{
  (e: "close"): void;
}>();

const bgImageInputRef = ref<HTMLInputElement | null>(null);
const bgImageUploading = ref(false);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleBgImageUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_IMAGE_SIZE) {
    alert("图片大小不能超过 5MB");
    input.value = "";
    return;
  }
  bgImageUploading.value = true;
  try {
    const data = await fileToBase64(file);
    await state.update({ customBgImage: data });
  } finally {
    bgImageUploading.value = false;
    input.value = "";
  }
}

function removeBgImage() {
  state.update({ customBgImage: undefined });
}
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="阅读设置" @close="emit('close')" />

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
              @click="state.update({ theme: settings.theme === theme.value ? null : theme.value })"
            >
              <div class="theme-preview" :style="{ background: themePreviewBg(theme.value) }"></div>
              <span>{{ theme.label }}</span>
              <span v-if="settings.theme === theme.value" class="theme-check">✓</span>
            </button>
          </div>
        </div>

        <!-- 字号 -->
        <div class="setting-row">
          <label class="setting-label">
            <span>字号</span>
            <span class="setting-value" v-if="settings.fontSize == null">使用原始字号</span>
          </label>
          <div class="size-options">
            <button
              v-for="size in FONT_SIZE_PRESETS"
              :key="size"
              :class="['size-btn', { active: settings.fontSize === size }]"
              @click="state.update({ fontSize: settings.fontSize === size ? null : size })"
            >
              {{ size }}
            </button>
          </div>
        </div>

        <!-- 自定义颜色 -->
        <div class="setting-row">
          <label class="setting-label">自定义颜色</label>
          <div class="color-custom-row">
            <label class="color-field">
              <span class="color-label">背景</span>
              <span class="color-input-wrap">
                <input
                  type="color"
                  :value="settings.customBgColor || '#ffffff'"
                  @input="
                    state.update({
                      customBgColor: ($event.target as HTMLInputElement).value,
                      useCustomColors: true,
                    })
                  "
                  class="color-picker"
                />
                <span class="color-hex">{{ settings.customBgColor }}</span>
              </span>
            </label>
            <label class="color-field">
              <span class="color-label">文字</span>
              <span class="color-input-wrap">
                <input
                  type="color"
                  :value="settings.customTextColor || '#000000'"
                  @input="
                    state.update({
                      customTextColor: ($event.target as HTMLInputElement).value,
                      useCustomColors: true,
                    })
                  "
                  class="color-picker"
                />
                <span class="color-hex">{{ settings.customTextColor }}</span>
              </span>
            </label>
          </div>
          <button
            v-if="settings.useCustomColors"
            class="color-reset-btn"
            @click="state.update({ useCustomColors: false })"
          >
            恢复主题颜色
          </button>
        </div>

        <!-- 自定义背景图片 -->
        <div class="setting-row">
          <label class="setting-label">背景图片</label>
          <div class="bg-image-area">
            <div v-if="settings.customBgImage" class="bg-image-preview-wrap">
              <div
                class="bg-image-preview"
                :style="{ backgroundImage: `url(${settings.customBgImage})` }"
              ></div>
              <button class="bg-image-remove" @click="removeBgImage">
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
            <div v-else class="bg-image-upload">
              <input
                ref="bgImageInputRef"
                type="file"
                accept="image/*"
                style="display: none"
                @change="handleBgImageUpload"
              />
              <button
                class="bg-image-upload-btn"
                :disabled="bgImageUploading"
                @click="bgImageInputRef?.click()"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span>{{ bgImageUploading ? "上传中..." : "选择图片" }}</span>
              </button>
              <p class="bg-image-hint">支持 JPG、PNG、WebP，最大 5MB</p>
            </div>
          </div>
        </div>

        <!-- 阅读模式 -->
        <div class="setting-row">
          <label class="setting-label">阅读模式</label>
          <div class="mode-options">
            <button
              v-for="mode in READING_MODE_OPTIONS"
              :key="mode.value"
              :class="['mode-btn', { active: (settings.readingMode || 'vertical') === mode.value }]"
              @click="state.update({ readingMode: mode.value })"
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

      <!-- 自定义排版按钮 -->
      <button class="typography-btn" @click="useUIStore().openModal('typographySettings')">
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
.modal-body {
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
  position: relative;
  transition: all 150ms ease;
  font-size: 13px;
  color: var(--modal-text);
}

.theme-btn:hover {
  border-color: var(--border);
  background: var(--bg-secondary);
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
  position: relative;
}

.theme-check {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 10px;
  background: var(--accent);
  color: var(--accent-text);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
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
  background: var(--bg-secondary);
}

.size-btn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-text);
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
  background: var(--bg-secondary);
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

/* Custom colors */
.color-custom-row {
  display: flex;
  gap: 12px;
}

.color-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: border-color 150ms ease;
}

.color-field:hover {
  border-color: var(--accent);
}

.color-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.color-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-picker {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  background: none;
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 5px;
}

.color-hex {
  font-size: 13px;
  font-weight: 500;
  font-feature-settings: "tnum";
  color: var(--modal-text);
  font-family: "JetBrains Mono", Consolas, monospace;
}

.color-reset-btn {
  width: 100%;
  padding: 8px;
  margin-top: 4px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 150ms ease;
}

.color-reset-btn:hover {
  border-color: var(--accent);
  border-style: solid;
  color: var(--accent);
  background: var(--accent-soft);
}

/* Background image */
.bg-image-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bg-image-preview-wrap {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.bg-image-preview {
  width: 100%;
  height: 120px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.bg-image-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  cursor: pointer;
  transition: background 150ms ease;
}

.bg-image-remove:hover {
  background: rgba(239, 68, 68, 0.8);
}

.bg-image-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.bg-image-upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 24px 16px;
  border: 1.5px dashed var(--border);
  border-radius: 8px;
  background: var(--modal-bg);
  cursor: pointer;
  transition: all 150ms ease;
  color: var(--text-secondary);
}

.bg-image-upload-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.bg-image-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bg-image-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
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
  background: var(--bg-secondary);
}

.anim-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
</style>
