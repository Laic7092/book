<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { getAutoReadSession } from "./index";

const isPlaying = ref(false);
const speed = ref(1);
const isDragging = ref(false);
const progress = ref(0);

let timer: number | null = null;
let longPressTimer: number | null = null;
let startY = 0;
let lastTick = 0;

const MIN_SPEED = 1;
const MAX_SPEED = 5;
const BASE_INTERVAL = 5000;

const interval = computed(() => Math.round(BASE_INTERVAL / speed.value));

function tick() {
  lastTick = Date.now();
  progress.value = 0;
  const s = getAutoReadSession();
  if (!s) return;
  const prevPage = s.getState().page.current;
  s.dispatch({ type: "NEXT_PAGE" });
  // Stop if we're at the end (state didn't change after dispatch)
  requestAnimationFrame(() => {
    const newState = s.getState();
    if (newState.status === "loading-chapter") return; // still transitioning
    if (
      newState.page.current === prevPage &&
      newState.currentChapterIndex >= newState.chapters.length - 1
    ) {
      stop();
    }
  });
}

function start() {
  const s = getAutoReadSession();
  if (!s) return;
  const st = s.getState();
  if (st.page.total <= 1 && st.currentChapterIndex >= st.chapters.length - 1) return;
  isPlaying.value = true;
  lastTick = Date.now();
  progress.value = 0;
  tick();
  timer = window.setInterval(tick, interval.value);
  requestAnimationFrame(updateProgress);
}

function updateProgress() {
  if (!isPlaying.value) return;
  const now = Date.now();
  const elapsed = now - lastTick;
  progress.value = Math.min(100, (elapsed / interval.value) * 100);
  requestAnimationFrame(updateProgress);
}

function stop() {
  isPlaying.value = false;
  progress.value = 0;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function setSpeed(s: number) {
  speed.value = Math.max(MIN_SPEED, Math.min(MAX_SPEED, s));
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  setSpeed(speed.value + (e.deltaY > 0 ? -1 : 1));
}

function onPointerDown(e: PointerEvent) {
  startY = e.clientY;
  isDragging.value = false;
  longPressTimer = window.setTimeout(() => {
    isDragging.value = true;
  }, 300);
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return;
  const delta = startY - e.clientY;
  if (Math.abs(delta) > 20) {
    setSpeed(speed.value + (delta > 0 ? 1 : -1));
    startY = e.clientY;
  }
}

function onPointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (!isDragging.value) {
    if (isPlaying.value) stop();
    else start();
  }
  isDragging.value = false;
}

watch(speed, () => {
  if (isPlaying.value) {
    stop();
    start();
  }
});

onUnmounted(() => stop());
</script>

<template>
  <div
    class="auto-read"
    :class="{ playing: isPlaying }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="icon">
      <svg v-if="isPlaying" viewBox="0 0 24 24">
        <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
      </svg>
      <svg v-else viewBox="0 0 24 24">
        <path d="M8 5.5v13l10-6.5L8 5.5z" fill="currentColor" />
      </svg>
    </div>
    <svg v-if="isPlaying" class="progress-ring" viewBox="0 0 48 48">
      <circle
        class="ring"
        cx="24"
        cy="24"
        r="21"
        :stroke-dashoffset="131.94 * (1 - progress / 100)"
      />
    </svg>
  </div>
</template>

<style scoped>
.auto-read {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.5;
  border-radius: 50%;
  border: 1px solid var(--border-subtle, #ddd);
  background: var(--bg-elevated, #fff);
  color: var(--reader-text, #333);
  transition:
    opacity 200ms,
    background 200ms,
    box-shadow 200ms;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.auto-read:hover {
  opacity: 1;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.auto-read.playing {
  opacity: 1;
  border-color: var(--accent, #5b9aff);
  color: var(--accent, #5b9aff);
  box-shadow: 0 2px 12px rgba(91, 154, 255, 0.3);
}

.auto-read:active .icon {
  transform: scale(0.9);
}

.icon {
  width: 24px;
  height: 24px;
  color: var(--accent);
  transition: transform 150ms;
}

.progress-ring {
  position: absolute;
  top: 0;
  width: 44px;
  height: 44px;
  transform: rotate(-90deg);
  pointer-events: none;
}

.ring {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-dasharray: 131.94;
  stroke-linecap: round;
  transition: stroke-dashoffset 100ms linear;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
