<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { getReaderHost } from "./index";

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
  const h = getReaderHost();
  if (!h) return;
  h.nextPage().then((moved) => {
    if (!moved) stop();
  });
}

function start() {
  const h = getReaderHost();
  if (!h || h.getTotalPages() <= 1) return;
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
  position: fixed;
  bottom: 70px;
  right: 20px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.5;
  z-index: 100;
  user-select: none;
}

.auto-read:active .icon {
  transform: scale(0.9);
}

.progress-ring {
  position: absolute;
  width: 48px;
  height: 48px;
  transform: rotate(-90deg);
  pointer-events: none;
}

.icon {
  width: 28px;
  height: 28px;
  color: var(--accent);
  transition: transform 150ms;
}

.auto-read:active .icon {
  transform: scale(0.9);
}

.speed-bars {
  display: flex;
  gap: 3px;
  height: 16px;
  align-items: flex-end;
}

.bar {
  width: 4px;
  background: var(--border);
  border-radius: 2px;
  transition: all 200ms;
}

.bar.active {
  background: var(--accent);
}

.bar:nth-child(1) {
  height: 4px;
}
.bar:nth-child(2) {
  height: 7px;
}
.bar:nth-child(3) {
  height: 10px;
}
.bar:nth-child(4) {
  height: 13px;
}
.bar:nth-child(5) {
  height: 16px;
}

.progress-ring {
  position: absolute;
  top: 0;
  width: 48px;
  height: 48px;
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
