<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { ReaderSession } from "@book/reader-engine";
import { setAutoAdvancing, setOnUserPageChange } from "./index";
import { currentSession } from "../../stores/reader-session";

const isPlaying = ref(false);
const intervalSec = ref(5);
const progress = ref(0);

let timer: number | null = null;
let raf: number | null = null;
let lastTick = 0;

const PRESETS = [2, 3, 4, 5, 7, 10, 15];
const interval = computed(() => intervalSec.value * 1000);

function prevPreset() {
  const idx = PRESETS.indexOf(intervalSec.value);
  intervalSec.value = PRESETS[(idx - 1 + PRESETS.length) % PRESETS.length];
}

function nextPreset() {
  const idx = PRESETS.indexOf(intervalSec.value);
  intervalSec.value = PRESETS[(idx + 1) % PRESETS.length];
}

function tickPagination(s: ReaderSession) {
  const prevPage = s.getState().page.current;
  setAutoAdvancing(true);
  s.dispatch({ type: "NEXT_PAGE" });
  requestAnimationFrame(() => {
    setAutoAdvancing(false);
    const newState = s.getState();
    if (newState.status === "loading") return;
    if (
      newState.page.current === prevPage &&
      newState.currentChapterIndex >= newState.chapters.length - 1
    ) {
      stop();
    }
  });
}

function scrollLoop() {
  if (!isPlaying.value) return;
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;

  const s = currentSession.value;
  if (!s) return stop();

  const doc = s.getDocument();
  if (!doc) return stop();
  const html = doc.documentElement;
  if (!html) return stop();

  const { scrollHeight, clientHeight, scrollTop } = html;
  const maxScroll = scrollHeight - clientHeight;

  if (maxScroll <= 0 || scrollTop >= maxScroll - 1) {
    stop();
    return;
  }

  const speed = (clientHeight * 0.85) / interval.value;
  const target = Math.min(scrollTop + speed * dt, maxScroll);
  html.scrollTop = target;

  s.dispatch({ type: "SCROLL_PROGRESS", bookProgress: target / maxScroll });

  progress.value = ((now % interval.value) / interval.value) * 100;

  raf = requestAnimationFrame(scrollLoop);
}

function updateProgress() {
  if (!isPlaying.value) return;
  const now = Date.now();
  const elapsed = now - lastTick;
  progress.value = Math.min(100, (elapsed / interval.value) * 100);
  raf = requestAnimationFrame(updateProgress);
}

function start() {
  if (raf !== null) return;
  const s = currentSession.value;
  if (!s) return;
  isPlaying.value = true;
  lastTick = Date.now();
  progress.value = 0;

  if (s.getState().mode === "scroll") {
    raf = requestAnimationFrame(scrollLoop);
  } else {
    tickPagination(s);
    timer = window.setInterval(() => tickPagination(s), interval.value);
    raf = requestAnimationFrame(updateProgress);
  }
}

function stop() {
  isPlaying.value = false;
  progress.value = 0;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (raf !== null) {
    cancelAnimationFrame(raf);
    raf = null;
  }
}

function toggle() {
  if (isPlaying.value) stop();
  else start();
}

watch(intervalSec, () => {
  if (isPlaying.value) {
    stop();
    start();
  }
});

onMounted(() => {
  setOnUserPageChange(() => {
    if (isPlaying.value) {
      stop();
      start();
    }
  });
});

onUnmounted(() => {
  setOnUserPageChange(null);
  stop();
});
</script>

<template>
  <div class="auto-read" :class="{ playing: isPlaying }">
    <button class="btn adj" title="Slower" @click="prevPreset">
      <svg viewBox="0 0 16 16">
        <path
          d="M4 8h8"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </button>
    <button class="btn display" title="Tap to cycle speed" @click="nextPreset">
      {{ intervalSec }}<span class="unit">s</span>
    </button>
    <button class="btn adj" title="Faster" @click="nextPreset">
      <svg viewBox="0 0 16 16">
        <path
          d="M8 4v8M4 8h8"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </button>
    <div class="sep" />
    <button class="btn play" title="Play / Pause" @click="toggle">
      <svg v-if="isPlaying" viewBox="0 0 20 20">
        <rect x="5" y="3.5" width="3.5" height="13" rx="1" fill="currentColor" />
        <rect x="11.5" y="3.5" width="3.5" height="13" rx="1" fill="currentColor" />
      </svg>
      <svg v-else viewBox="0 0 20 20">
        <path d="M6 4.5v11l9-5.5L6 4.5z" fill="currentColor" />
      </svg>
      <svg v-if="isPlaying" class="progress-ring" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r="15.5"
          stroke-dasharray="97.4"
          :stroke-dashoffset="97.4 * (1 - progress / 100)"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.auto-read {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 0 4px;
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(4px);
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: none;
}

.auto-read:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.auto-read.playing {
  border-color: var(--accent, #5b9aff);
  box-shadow: 0 2px 12px rgba(91, 154, 255, 0.3);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--reader-text, #333);
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
}

.adj {
  width: 28px;
  height: 28px;
  color: var(--text-secondary, #888);
}

.adj svg {
  width: 14px;
  height: 14px;
}

.display {
  width: 36px;
  height: 28px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}

.unit {
  font-size: 10px;
  font-weight: 400;
  margin-left: 1px;
}

.sep {
  width: 1px;
  height: 20px;
  background: var(--border-subtle, #ddd);
  margin: 0 2px;
}

.play {
  position: relative;
  width: 30px;
  height: 30px;
  color: var(--accent, #5b9aff);
}

.play svg:not(.progress-ring) {
  width: 18px;
  height: 18px;
}

.progress-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 30px;
  height: 30px;
  transform: rotate(-90deg);
  pointer-events: none;
}

.progress-ring circle {
  fill: none;
  stroke: var(--accent, #5b9aff);
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 100ms linear;
}
</style>
