<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { ReaderSession } from "@book/reader-engine";
import AppIcon from "../../components/ui/AppIcon.vue";
import {
  setAutoAdvancing,
  setOnUserPageChange,
  setOnBookClosed,
  loadAutoReadSettings,
  saveAutoReadSettings,
  DEFAULT_AUTO_READ_SETTINGS,
  type AutoReadSettings,
} from "./index";
import { currentSession } from "../../stores/reader-session";

const isPlaying = ref(false);
const progress = ref(0);
const settings = ref<AutoReadSettings>({ ...DEFAULT_AUTO_READ_SETTINGS });
const showSettings = ref(false);
const sleepRemainingSec = ref(0);
const wrapRef = ref<HTMLElement | null>(null);

let timer: number | null = null;
let raf: number | null = null;
let lastTick = 0;
/** Scroll position we set last frame; -1 = no baseline yet. */
let lastTarget = -1;
/** True while a scroll-mode chapter transition is in flight. */
let waitingForChapter = false;
let sleepTick: number | null = null;
let sleepDeadline = 0;

const PRESETS = [2, 3, 4, 5, 7, 10, 15];
const SLEEP_OPTIONS = [0, 15, 30, 45, 60];
const SPEED_OPTIONS: { label: string; value: AutoReadSettings["scrollSpeed"] }[] = [
  { label: "慢", value: "slow" },
  { label: "标准", value: "normal" },
  { label: "快", value: "fast" },
];
/** Screens per interval — how far scroll mode travels per interval tick. */
const SCROLL_FACTOR: Record<AutoReadSettings["scrollSpeed"], number> = {
  slow: 0.5,
  normal: 0.85,
  fast: 1.2,
};

const interval = computed(() => settings.value.intervalSec * 1000);

function prevPreset() {
  const idx = PRESETS.indexOf(settings.value.intervalSec);
  settings.value.intervalSec = PRESETS[(idx - 1 + PRESETS.length) % PRESETS.length];
}

function nextPreset() {
  const idx = PRESETS.indexOf(settings.value.intervalSec);
  settings.value.intervalSec = PRESETS[(idx + 1) % PRESETS.length];
}

function tickPagination(s: ReaderSession) {
  const state = s.getState();
  if (state.status !== "ready") return;

  // Chapter-end policy: stop before turning past the last page of a chapter
  // (NEXT_PAGE would otherwise auto-advance into the next chapter).
  if (
    settings.value.chapterEnd === "stop" &&
    state.page.total > 0 &&
    state.page.current >= state.page.total - 1 &&
    state.currentChapterIndex < state.chapters.length - 1
  ) {
    stop();
    return;
  }

  const prevPage = state.page.current;
  setAutoAdvancing(true);
  s.dispatch({ type: "NEXT_PAGE" });
  requestAnimationFrame(() => {
    setAutoAdvancing(false);
    const newState = s.getState();
    if (newState.status !== "ready") return;
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

  // User intervention: if the actual scroll position drifted from what we set
  // last frame, the user is scrolling manually — pause instead of fighting
  // them for the scrollbar.
  if (lastTarget >= 0 && Math.abs(scrollTop - lastTarget) > 3) {
    stop();
    return;
  }

  if (maxScroll <= 0 || scrollTop >= maxScroll - 1) {
    // End of chapter — continue into the next one (configurable), or stop.
    const state = s.getState();
    const nextChapter = state.chapters[state.currentChapterIndex + 1];
    if (settings.value.chapterEnd === "auto" && nextChapter && state.mode === "scroll") {
      waitingForChapter = true;
      raf = null; // cancel self; resumed by the chapter watch below
      s.dispatch({ type: "GO_TO_CHAPTER", chapterId: nextChapter.id });
      return;
    }
    stop();
    return;
  }

  const speed = (clientHeight * SCROLL_FACTOR[settings.value.scrollSpeed]) / interval.value;
  const target = Math.min(scrollTop + speed * dt, maxScroll);
  // Setting scrollTop fires a scroll event; the host's handleScroll reports
  // the in-chapter progress. Dispatching a whole-document ratio here would
  // clobber the in-chapter anchor and get persisted by reading-progress.
  html.scrollTop = target;
  lastTarget = target;

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

function armSleep() {
  if (settings.value.sleepMinutes > 0) {
    sleepDeadline = Date.now() + settings.value.sleepMinutes * 60_000;
    sleepRemainingSec.value = Math.round((sleepDeadline - Date.now()) / 1000);
    if (sleepTick === null) {
      sleepTick = window.setInterval(() => {
        const remain = Math.round((sleepDeadline - Date.now()) / 1000);
        sleepRemainingSec.value = remain;
        if (remain <= 0) {
          stop();
        }
      }, 1000);
    }
  } else {
    if (sleepTick !== null) {
      clearInterval(sleepTick);
      sleepTick = null;
    }
    sleepRemainingSec.value = 0;
  }
}

function start() {
  if (raf !== null) return;
  const s = currentSession.value;
  if (!s) return;
  isPlaying.value = true;
  lastTick = Date.now();
  progress.value = 0;
  lastTarget = -1;
  armSleep();

  if (s.getState().mode === "scroll") {
    raf = requestAnimationFrame(scrollLoop);
  } else {
    // Wait a full interval before turning the first page (no immediate flip
    // on resume, so pause/play and speed changes don't jump the reader).
    timer = window.setInterval(() => tickPagination(s), interval.value);
    raf = requestAnimationFrame(updateProgress);
  }
}

function stop() {
  isPlaying.value = false;
  progress.value = 0;
  waitingForChapter = false;
  if (sleepTick !== null) {
    clearInterval(sleepTick);
    sleepTick = null;
  }
  sleepRemainingSec.value = 0;
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

watch(settings, (v) => saveAutoReadSettings(v), { deep: true });

watch(
  () => settings.value.intervalSec,
  () => {
    if (isPlaying.value) {
      stop();
      start();
    }
  },
);

// Re-arm the sleep timer while playing (no restart of the reading rhythm).
watch(
  () => settings.value.sleepMinutes,
  () => {
    if (isPlaying.value) armSleep();
  },
);

// Resume scrolling once a scroll-mode chapter transition has finished
// loading (GO_TO_CHAPTER puts the machine into "loading"; ready means the
// new chapter's DOM is in the iframe).
watch(
  () => {
    const s = currentSession.value;
    if (!s) return null;
    const st = s.getState();
    return st.status === "ready" ? st.currentChapterIndex : st.status;
  },
  () => {
    if (!waitingForChapter || !isPlaying.value) return;
    const s = currentSession.value;
    const st = s?.getState();
    if (s && st && st.status === "ready" && st.mode === "scroll") {
      waitingForChapter = false;
      lastTarget = -1;
      lastTick = Date.now();
      raf = requestAnimationFrame(scrollLoop);
    }
  },
);

function onDocPointerDown(e: PointerEvent) {
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) {
    showSettings.value = false;
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") showSettings.value = false;
}

onMounted(() => {
  setOnUserPageChange(() => {
    if (isPlaying.value) {
      stop();
      start();
    }
  });
  setOnBookClosed(() => {
    stop();
  });
  document.addEventListener("pointerdown", onDocPointerDown);
  document.addEventListener("keydown", onDocKeydown);
  void loadAutoReadSettings().then((s) => {
    if (!s) return;
    settings.value = {
      intervalSec: PRESETS.includes(s.intervalSec)
        ? s.intervalSec
        : DEFAULT_AUTO_READ_SETTINGS.intervalSec,
      chapterEnd: s.chapterEnd === "stop" ? "stop" : "auto",
      sleepMinutes: SLEEP_OPTIONS.includes(s.sleepMinutes) ? s.sleepMinutes : 0,
      scrollSpeed: s.scrollSpeed === "slow" || s.scrollSpeed === "fast" ? s.scrollSpeed : "normal",
    };
  });
});

onUnmounted(() => {
  setOnUserPageChange(null);
  setOnBookClosed(null);
  document.removeEventListener("pointerdown", onDocPointerDown);
  document.removeEventListener("keydown", onDocKeydown);
  stop();
});
</script>

<template>
  <div ref="wrapRef" class="auto-read-wrap">
    <div class="auto-read" :class="{ playing: isPlaying }">
      <button class="btn adj" title="Slower" @click="prevPreset">
        <AppIcon name="minus" :size="14" />
      </button>
      <button class="btn display" title="Tap to cycle speed" @click="nextPreset">
        {{ settings.intervalSec }}<span class="unit">s</span>
      </button>
      <button class="btn adj" title="Faster" @click="nextPreset">
        <AppIcon name="plus" :size="14" />
      </button>
      <div class="sep" />
      <button class="btn play" title="Play / Pause" @click="toggle">
        <AppIcon v-if="isPlaying" name="pause" :size="18" />
        <AppIcon v-else name="play" :size="18" />
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
      <div class="sep" />
      <button
        class="btn gear"
        title="Settings"
        :class="{ active: showSettings }"
        @click.stop="showSettings = !showSettings"
      >
        <AppIcon name="sliders" :size="15" />
      </button>
    </div>

    <div v-if="showSettings" class="auto-read-popover" @click.stop>
      <div class="pr-section">
        <div class="pr-label">翻页间隔</div>
        <div class="pr-options">
          <button
            v-for="p in PRESETS"
            :key="p"
            :class="['pr-btn', { active: settings.intervalSec === p }]"
            @click="settings.intervalSec = p"
          >
            {{ p }}s
          </button>
        </div>
      </div>

      <div class="pr-section">
        <div class="pr-label">
          滚动速度
          <span class="pr-hint">仅滚动模式</span>
        </div>
        <div class="pr-options">
          <button
            v-for="sp in SPEED_OPTIONS"
            :key="sp.value"
            :class="['pr-btn', { active: settings.scrollSpeed === sp.value }]"
            @click="settings.scrollSpeed = sp.value"
          >
            {{ sp.label }}
          </button>
        </div>
      </div>

      <div class="pr-section">
        <div class="pr-label">章尾行为</div>
        <div class="pr-options">
          <button
            :class="['pr-btn', { active: settings.chapterEnd === 'auto' }]"
            @click="settings.chapterEnd = 'auto'"
          >
            继续下一章
          </button>
          <button
            :class="['pr-btn', { active: settings.chapterEnd === 'stop' }]"
            @click="settings.chapterEnd = 'stop'"
          >
            读完停止
          </button>
        </div>
      </div>

      <div class="pr-section">
        <div class="pr-label">
          睡眠定时
          <span v-if="sleepRemainingSec > 0" class="pr-remain">
            {{ Math.floor(sleepRemainingSec / 60) }}:{{
              String(sleepRemainingSec % 60).padStart(2, "0")
            }}
          </span>
        </div>
        <div class="pr-options">
          <button
            v-for="m in SLEEP_OPTIONS"
            :key="m"
            :class="['pr-btn', { active: settings.sleepMinutes === m }]"
            @click="settings.sleepMinutes = m"
          >
            {{ m === 0 ? "关" : `${m}分` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auto-read-wrap {
  position: relative;
}

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

.gear {
  width: 26px;
  height: 26px;
  color: var(--text-secondary, #888);
}

.gear svg {
  width: 15px;
  height: 15px;
}

.gear.active {
  color: var(--accent, #5b9aff);
}

.auto-read-popover {
  position: absolute;
  right: 46px;
  bottom: 0;
  width: 248px;
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border, #e0e0e0);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.auto-read-popover::after {
  content: "";
  position: absolute;
  right: -7px;
  top: 50%;
  transform: translateY(-50%);
  border: 7px solid transparent;
  border-left-color: var(--bg-secondary, #fff);
  filter: drop-shadow(1px 0 1px rgba(0, 0, 0, 0.12));
}

.pr-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pr-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #888);
}

.pr-hint {
  font-weight: 400;
  font-size: 10px;
  color: var(--text-secondary, #aaa);
}

.pr-remain {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--accent, #5b9aff);
}

.pr-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pr-btn {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e0e0e0);
  background: transparent;
  color: var(--reader-text, #333);
  font-size: 12px;
  font-family: var(--font-ui);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all 150ms;
}

.pr-btn:hover {
  border-color: var(--accent, #5b9aff);
  color: var(--accent, #5b9aff);
}

.pr-btn.active {
  background: var(--accent, #5b9aff);
  border-color: var(--accent, #5b9aff);
  color: var(--accent-text, #fff);
  font-weight: 600;
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
