<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import ProgressBar from "../../components/ui/ProgressBar.vue";
import { currentSession } from "../../core/reader-session";

// ── State ──
type TTSState = "idle" | "playing" | "paused";
const state = ref<TTSState>("idle");
const expanded = ref(false);
const speed = ref(1);
const voices = ref<SpeechSynthesisVoice[]>([]);
const selectedVoice = ref<SpeechSynthesisVoice | null>(null);
const sentences = ref<string[]>([]);
const currentSentenceIndex = ref(0);
const progress = ref(0); // 0–100 of current sentence

const isActive = computed(() => state.value !== "idle");

const MIN_SPEED = 0.5;
const MAX_SPEED = 3;
const SPEED_PERSIST_KEY = "tts_speed";

// ── Text extraction ──

function getChapterText(): string {
  const session = currentSession.value;
  if (!session) return "";
  const article = session.getDocument()?.body;
  if (!article) return "";
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, nav, aside, [aria-hidden]").forEach((el) => el.remove());
  return clone.textContent ?? "";
}

function extractSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const raw = cleaned.split(/(?<=[。！？.!?\n])\s*/).filter((s) => s.trim().length > 0);
  const result: string[] = [];
  for (const s of raw) {
    const t = s.trim();
    if (!t) continue;
    if (result.length > 0 && t.length < 10 && !/[。！？.!?]$/.test(t)) {
      result[result.length - 1] += t;
    } else {
      result.push(t);
    }
  }
  return result;
}

// ── Speech ──

function speakSentence(index: number) {
  if (!window.speechSynthesis || index >= sentences.value.length) {
    stop();
    return;
  }

  window.speechSynthesis.cancel();
  currentSentenceIndex.value = index;
  progress.value = 0;

  const s = sentences.value[index];
  if (!s) {
    advanceChapter();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(s);
  utterance.rate = speed.value;
  if (selectedVoice.value) utterance.voice = selectedVoice.value;

  utterance.onstart = () => {
    state.value = "playing";
  };
  utterance.onend = () => {
    if (index + 1 < sentences.value.length) {
      speakSentence(index + 1);
    } else {
      advanceChapter();
    }
  };
  utterance.onerror = (e) => {
    if (e.error !== "canceled" && e.error !== "interrupted") {
      console.error("[TTS]", e.error);
    }
  };
  utterance.onboundary = (e) => {
    if (e.name === "word" || e.name === "sentence") {
      progress.value = Math.min(100, Math.round((e.charIndex / s.length) * 100));
    }
  };

  window.speechSynthesis.speak(utterance);
}

function advanceChapter() {
  stop();
  const session = currentSession.value;
  if (!session) return;
  const s = session.getState();
  const chapters = s.chapters;
  const current = chapters[s.position.chapterIndex];
  if (!current) return;
  const idx = chapters.findIndex((c) => c.id === current.id);
  if (idx < chapters.length - 1) {
    session.dispatch({ type: "SEEK", chapterIndex: idx + 1 });
    start();
  } else {
    expanded.value = false;
  }
}

// ── Actions ──

function start() {
  if (state.value === "paused") {
    window.speechSynthesis?.resume();
    state.value = "playing";
    expanded.value = true;
    return;
  }
  const text = getChapterText();
  const parsed = extractSentences(text);
  if (parsed.length === 0) return;
  sentences.value = parsed;
  currentSentenceIndex.value = 0;
  speakSentence(0);
  expanded.value = true;
}

function togglePlay() {
  if (state.value === "idle") {
    expanded.value = true;
    start();
  } else if (state.value === "playing") {
    window.speechSynthesis?.pause();
    state.value = "paused";
  } else {
    window.speechSynthesis?.resume();
    state.value = "playing";
  }
}

function stop() {
  window.speechSynthesis?.cancel();
  state.value = "idle";
  currentSentenceIndex.value = 0;
  progress.value = 0;
}

function skipForward() {
  const next = currentSentenceIndex.value + 1;
  if (next < sentences.value.length) {
    speakSentence(next);
  } else {
    advanceChapter();
  }
}

function skipBack() {
  speakSentence(Math.max(0, currentSentenceIndex.value - 1));
}

function setSpeed(delta: number) {
  speed.value = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed.value + delta));
  if (state.value === "playing") {
    speakSentence(currentSentenceIndex.value);
  }
}

/** Voice switched mid-playback — restart the current sentence with the new voice. */
function onVoiceChange() {
  if (state.value === "playing") speakSentence(currentSentenceIndex.value);
}

function toggleExpanded() {
  expanded.value = !expanded.value;
}

// ── Chapter change handler ──

let chapterChangeUnsub: (() => void) | null = null;

function onChapterChange() {
  if (isActive.value) {
    setTimeout(() => start(), 300);
  }
}

// ── Keyboard shortcut ──

function onKeyDown(e: KeyboardEvent) {
  if (e.target !== document.body) return;
  if (e.key === " " && isActive.value) {
    e.preventDefault();
    togglePlay();
  }
}

// ── Lifecycle ──

const loadVoices = () => {
  const available = window.speechSynthesis?.getVoices() ?? [];
  if (available.length > 0) {
    voices.value = available;
    const zh = available.find((v) => v.lang.startsWith("zh"));
    selectedVoice.value = zh ?? available[0];
  }
};

onMounted(() => {
  loadVoices();
  window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);

  const saved = localStorage.getItem(SPEED_PERSIST_KEY);
  if (saved) speed.value = Math.max(MIN_SPEED, Math.min(MAX_SPEED, parseFloat(saved)));

  document.addEventListener("keydown", onKeyDown);

  // Chapter change detection: watch machine state for chapter transitions
  const session = currentSession.value;
  if (session) {
    let lastChapterId = session.getState().chapters[session.getState().position.chapterIndex]?.id;
    chapterChangeUnsub = (() => {
      const s = session.getState();
      const chId = s.chapters[s.position.chapterIndex]?.id;
      if (chId && chId !== lastChapterId) {
        lastChapterId = chId;
        onChapterChange();
      }
    }) as unknown as () => void;
  }
});

onUnmounted(() => {
  stop();
  window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
  document.removeEventListener("keydown", onKeyDown);
  chapterChangeUnsub?.();
});

watch(speed, (val) => {
  localStorage.setItem(SPEED_PERSIST_KEY, String(val));
});
</script>

<template>
  <!-- Toolbar button -->
  <div
    class="tts-btn"
    :class="{ active: isActive || expanded }"
    @click.stop="toggleExpanded"
    :title="isActive ? 'TTS Controls' : 'Text to Speech'"
  >
    <AppIcon name="mic" :size="20" :stroke-width="1.5" />
  </div>

  <!-- Expanded panel -->
  <div v-if="expanded" class="tts-panel" @click.stop>
    <!-- Header -->
    <div class="panel-header">
      <span class="panel-title">Text to Speech</span>
      <button
        class="close-btn"
        @click="
          stop();
          expanded = false;
        "
      >
        <AppIcon name="close" :size="16" />
      </button>
    </div>

    <!-- Voice picker -->
    <div v-if="voices.length > 1" class="voice-row">
      <select v-model="selectedVoice" class="voice-select" @change="onVoiceChange">
        <option v-for="v in voices" :key="v.name" :value="v">{{ v.name }} ({{ v.lang }})</option>
      </select>
    </div>

    <!-- Sentence display -->
    <div v-if="sentences[currentSentenceIndex]" class="sentence-display">
      <p>{{ sentences[currentSentenceIndex] }}</p>
      <div class="progress-track">
        <ProgressBar :value="progress" size="sm" />
      </div>
    </div>
    <div v-else class="sentence-display empty">
      <p>Open a book and press play to start listening</p>
    </div>

    <!-- Controls -->
    <div class="controls-row">
      <!-- Speed -->
      <div class="speed-group">
        <button
          class="ctrl-btn sm"
          @click="setSpeed(-0.25)"
          :disabled="speed <= MIN_SPEED"
          title="Slower"
        >
          <AppIcon name="minus" :size="12" :stroke-width="2.5" />
        </button>
        <span class="speed-label">{{ speed.toFixed(2) }}x</span>
        <button
          class="ctrl-btn sm"
          @click="setSpeed(0.25)"
          :disabled="speed >= MAX_SPEED"
          title="Faster"
        >
          <AppIcon name="plus" :size="12" :stroke-width="2.5" />
        </button>
      </div>

      <!-- Playback -->
      <div class="playback-group">
        <button
          class="ctrl-btn"
          @click="skipBack"
          :disabled="!isActive || currentSentenceIndex <= 0"
          title="Previous sentence"
        >
          <AppIcon name="skip-back" :size="16" />
        </button>

        <button class="play-btn" @click="togglePlay">
          <AppIcon v-if="state === 'playing'" name="pause" :size="18" />
          <AppIcon v-else name="play" :size="18" />
        </button>

        <button
          class="ctrl-btn"
          @click="skipForward"
          :disabled="!isActive || currentSentenceIndex >= sentences.length - 1"
          title="Next sentence"
        >
          <AppIcon name="skip-forward" :size="16" />
        </button>
      </div>

      <!-- Counter -->
      <div class="counter">
        <span v-if="isActive">{{ currentSentenceIndex + 1 }}/{{ sentences.length }}</span>
        <button v-if="isActive" class="ctrl-btn stop-btn" @click="stop" title="Stop">
          <AppIcon name="stop" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Toolbar button ── */
.tts-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  backdrop-filter: blur(4px);
  color: var(--reader-text, #333);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  -webkit-tap-highlight-color: transparent;
}

.tts-btn:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

/* ── Panel ── */
.tts-panel {
  position: fixed;
  right: 72px;
  bottom: calc(env(safe-area-inset-bottom) + 80px);
  z-index: var(--z-chrome);
  background: var(--bg-elevated, #fff);
  border: 1px solid var(--border-subtle, #e0e0e0);
  border-radius: 14px;
  padding: 12px;
  min-width: 340px;
  max-width: calc(100vw - 104px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 8px;
  user-select: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.06));
  color: var(--reader-text, #333);
}

/* ── Voice picker ── */
.voice-row {
  display: flex;
  align-items: center;
}

.voice-select {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle, #e0e0e0);
  background: var(--bg-secondary, #fafafa);
  color: var(--reader-text, #333);
  outline: none;
}

.voice-select:focus {
  border-color: var(--accent);
}

/* ── Sentence display ── */
.sentence-display {
  padding: 8px 10px;
  background: var(--reader-bg, #f5f5f5);
  border-radius: 8px;
  min-height: 36px;
  max-height: 72px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.sentence-display p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--reader-text, #333);
  overflow-wrap: break-word;
  word-break: break-word;
}

.sentence-display.empty p {
  color: var(--text-secondary, #aaa);
  font-style: italic;
}

.progress-track {
  height: 2px;
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

/* ── Controls ── */
.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.speed-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.speed-label {
  font-size: 12px;
  font-weight: 600;
  min-width: 36px;
  text-align: center;
  color: var(--reader-text, #333);
}

.playback-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ctrl-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--reader-text, #333);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms;
}

.ctrl-btn.sm {
  width: 26px;
  height: 26px;
}

.ctrl-btn:hover:not(:disabled) {
  background: var(--hover-bg, rgba(0, 0, 0, 0.06));
}

.ctrl-btn:active:not(:disabled) {
  transform: scale(0.9);
}

.ctrl-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.play-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background: var(--accent, #5b9aff);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    filter 150ms,
    transform 150ms;
}

.play-btn:hover {
  filter: brightness(1.1);
}

.play-btn:active {
  transform: scale(0.92);
}

.stop-btn:hover {
  color: #e74c3c;
}

.counter {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary, #999);
  white-space: nowrap;
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .tts-panel {
    min-width: unset;
    width: calc(100vw - 72px);
    padding: 10px;
    right: 62px;
    bottom: calc(env(safe-area-inset-bottom) + 74px);
  }

  .tts-btn {
    width: 40px;
    height: 40px;
  }

  .sentence-display p {
    font-size: 12px;
  }

  .ctrl-btn.sm {
    width: 22px;
    height: 22px;
  }

  .speed-label {
    min-width: 28px;
    font-size: 11px;
  }

  .ctrl-btn {
    width: 26px;
    height: 26px;
  }

  .controls-row {
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 6px;
  }

  .speed-group {
    gap: 2px;
  }

  .playback-group {
    gap: 2px;
  }

  .play-btn {
    width: 32px;
    height: 32px;
  }
}
</style>
