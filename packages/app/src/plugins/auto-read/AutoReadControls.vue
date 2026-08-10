<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { ReaderSession } from "@book/reader-engine";
import AppIcon from "../../components/ui/AppIcon.vue";
import Popover from "../../components/Popover.vue";
import {
  setAutoAdvancing,
  setOnUserPageChange,
  setOnBookClosed,
  loadAutoReadSettings,
  saveAutoReadSettings,
  DEFAULT_AUTO_READ_SETTINGS,
  isAutoAdvancing,
  type AutoReadSettings,
} from "./index";
import { currentSession } from "../../stores/reader-session";
import { useUIStore } from "../../stores/ui";
import { pluginEvents } from "../../core/plugin-runtime/context";

const isPlaying = ref(false);
const progress = ref(0);
const settings = ref<AutoReadSettings>({ ...DEFAULT_AUTO_READ_SETTINGS });
const showSettings = ref(false);
const sleepRemainingSec = ref(0);
const wrapRef = ref<HTMLElement | null>(null);

// Global reader chrome visibility — the popover must hide/show with the
// header/footer/toolbar (effectiveShowControls), same as any in-toolbar UI.
const uiStore = useUIStore();

let timer: number | null = null;
let raf: number | null = null;
let lastTick = 0;
/** Scroll position we set last frame; -1 = no baseline yet. */
let lastTarget = -1;
/** True while a scroll-mode chapter transition is in flight. */
let waitingForChapter = false;
let sleepTick: number | null = null;
let sleepDeadline = 0;
/** Unsubscriber for the page-turn dismissal (see onMounted). */
let unsubPageTurn: (() => void) | null = null;

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

// ── Popover: controlled via the shared Popover component ──
// placement="center" renders a viewport-centered dialog; outside-click and
// Escape close are handled by Popover itself (emitted as @close).

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
  // Clicks inside the reader iframe never reach the document, so Popover's
  // closeOnClickOutside can't see them — treat a user-initiated page turn
  // (tap on the book) as "clicked outside": dismiss the popover.
  // Auto-read's own page turns are flagged and ignored.
  unsubPageTurn = pluginEvents.on("page:changed", () => {
    if (!isAutoAdvancing()) showSettings.value = false;
  });
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
  unsubPageTurn?.();
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

    <Teleport to="body">
      <Popover
        :open="showSettings && uiStore.effectiveShowControls"
        placement="center"
        style="
          width: min(400px, calc(100vw - 24px));
          max-height: calc(100vh - 48px);
          overflow-y: auto;
        "
        @close="showSettings = false"
      >
        <div class="ar-content">
          <div class="ar-header">
            <span class="ar-title">自动阅读设置</span>
            <button class="ar-close" @click="showSettings = false" aria-label="关闭设置">
              <AppIcon name="close" :size="16" />
            </button>
          </div>

          <div class="ar-section">
            <div class="ar-label">翻页间隔</div>
            <div class="ar-options">
              <button
                v-for="p in PRESETS"
                :key="p"
                :class="['chip', { active: settings.intervalSec === p }]"
                @click="settings.intervalSec = p"
              >
                {{ p }}s
              </button>
            </div>
          </div>

          <div class="ar-section">
            <div class="ar-label">
              滚动速度
              <span class="ar-hint">仅滚动模式</span>
            </div>
            <div class="ar-options">
              <button
                v-for="sp in SPEED_OPTIONS"
                :key="sp.value"
                :class="['chip', { active: settings.scrollSpeed === sp.value }]"
                @click="settings.scrollSpeed = sp.value"
              >
                {{ sp.label }}
              </button>
            </div>
          </div>

          <div class="ar-section">
            <div class="ar-label">章尾行为</div>
            <div class="ar-options">
              <button
                :class="['chip', { active: settings.chapterEnd === 'auto' }]"
                @click="settings.chapterEnd = 'auto'"
              >
                继续下一章
              </button>
              <button
                :class="['chip', { active: settings.chapterEnd === 'stop' }]"
                @click="settings.chapterEnd = 'stop'"
              >
                读完停止
              </button>
            </div>
          </div>

          <div class="ar-section">
            <div class="ar-label">
              睡眠定时
              <span v-if="sleepRemainingSec > 0" class="ar-remain">
                {{ Math.floor(sleepRemainingSec / 60) }}:{{
                  String(sleepRemainingSec % 60).padStart(2, "0")
                }}
              </span>
            </div>
            <div class="ar-options">
              <button
                v-for="m in SLEEP_OPTIONS"
                :key="m"
                :class="['chip', { active: settings.sleepMinutes === m }]"
                @click="settings.sleepMinutes = m"
              >
                {{ m === 0 ? "关" : `${m}分` }}
              </button>
            </div>
          </div>
        </div>
      </Popover>
    </Teleport>
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
  height: 40px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.auto-read:hover {
  box-shadow: var(--shadow-md);
}

.auto-read.playing {
  border-color: var(--accent-muted);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--reader-text);
  cursor: pointer;
  padding: 0;
  border-radius: var(--radius-full);
  font-family: var(--font-ui);
  -webkit-tap-highlight-color: transparent;
}

.btn:hover {
  background: var(--hover-bg);
}

.adj {
  width: 28px;
  height: 28px;
  color: var(--text-secondary);
}

.adj:hover {
  color: var(--reader-text);
}

.adj svg {
  width: 14px;
  height: 14px;
}

.display {
  width: 38px;
  height: 28px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}

.unit {
  font-size: 10px;
  font-weight: var(--weight-normal);
  margin-left: 1px;
  color: var(--text-secondary);
}

.sep {
  width: 1px;
  height: 20px;
  background: var(--border-subtle);
  margin: 0 2px;
}

.gear {
  width: 26px;
  height: 26px;
  color: var(--text-secondary);
}

.gear svg {
  width: 15px;
  height: 15px;
}

.gear.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.play {
  position: relative;
  width: 30px;
  height: 30px;
  color: var(--accent);
}

.play:hover {
  background: var(--accent-soft);
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
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 100ms linear;
}

/* ── Settings popover content (shell styles come from Popover.vue) ── */

.ar-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-2);
}

.ar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.ar-title {
  font-size: 10px;
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-ui);
}

.ar-close {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ar-close:hover {
  background: var(--hover-bg);
  color: var(--reader-text);
}

.ar-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ar-label {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: 10px;
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-ui);
}

.ar-hint {
  font-weight: var(--weight-normal);
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: none;
  letter-spacing: 0;
}

.ar-remain {
  margin-left: auto;
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  text-transform: none;
  letter-spacing: 0;
}

.ar-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

@media (max-width: 480px) {
  .auto-read {
    height: 36px;
  }

  .display {
    width: 34px;
  }
}
</style>
