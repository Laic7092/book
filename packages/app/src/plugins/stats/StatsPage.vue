<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { getStatsEngine } from "./engine";
import { useBookshelfStore } from "../../stores/bookshelf";
import { getBookGradient, getInitial } from "../../utils/colors";
import type { BookReadingStats, Book } from "../../core/types";
import { formatDuration, formatRelativeTime, formatHour } from "../../utils/time";
import LoadingSpinner from "../../components/ui/LoadingSpinner.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { navigate } from "../../utils/router";
import { pluginEvents } from "../../core/plugin-runtime/registry";

const bookshelfStore = useBookshelfStore();

interface SummaryStats {
  totalBooks: number;
  totalReadingTime: number;
  totalSessions: number;
  thisWeekReadingTime: number;
}

interface BookStatEntry {
  stats: BookReadingStats;
  book: Book | undefined;
}

const loading = ref(true);
const summary = ref<SummaryStats | null>(null);
const allStats = ref<BookReadingStats[]>([]);
const books = ref<Book[]>([]);

const bookStatEntries = computed<BookStatEntry[]>(() =>
  allStats.value
    .map((s) => ({ stats: s, book: books.value.find((b) => b.id === s.bookId) }))
    .filter((e) => e.book)
    .sort((a, b) => (b.stats.lastReadAt || 0) - (a.stats.lastReadAt || 0)),
);

const totalWordsRead = computed(() => allStats.value.reduce((s, st) => s + st.wordsRead, 0));
const avgSpeed = computed(() => {
  const booksWithSpeed = allStats.value.filter((s) => s.readingSpeed > 0);
  if (!booksWithSpeed.length) return 0;
  return Math.round(
    booksWithSpeed.reduce((s, st) => s + st.readingSpeed, 0) / booksWithSpeed.length,
  );
});

const activeHourTotals = computed(() => {
  const hours = new Map<number, number>();
  for (const stat of allStats.value) {
    // activeHours is indexed by hour (0-23); the values are session counts.
    for (const [hour, count] of (stat.activeHours ?? []).entries()) {
      if (count > 0) hours.set(hour, (hours.get(hour) || 0) + count);
    }
  }
  return hours;
});

const completedBooks = computed(
  () =>
    allStats.value.filter(
      (s) => (s.chaptersTotal ?? 0) > 0 && s.chaptersCompleted >= s.chaptersTotal!,
    ).length,
);

const inProgressBooks = computed(
  () =>
    allStats.value.filter(
      (s) =>
        s.chaptersCompleted > 0 &&
        ((s.chaptersTotal ?? 0) === 0 || s.chaptersCompleted < s.chaptersTotal!),
    ).length,
);

const allHours = Array.from({ length: 24 }, (_, i) => i);
const maxHourCount = computed(() => Math.max(1, ...activeHourTotals.value.values()));

async function load() {
  loading.value = true;
  try {
    const eng = getStatsEngine();
    const [s, stats] = await Promise.all([eng.getSummaryStats(), eng.getAllStats()]);
    summary.value = s;
    allStats.value = stats;
  } catch {
    summary.value = null;
    allStats.value = [];
  }
  books.value = bookshelfStore.books;
  loading.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") navigate("/");
}

const unsubs: (() => void)[] = [];

onMounted(() => {
  load();
  document.addEventListener("keydown", onKeydown);
  // Refresh when reading activity lands while this page is open.
  unsubs.push(pluginEvents.on("book:closed", () => void load()));
  unsubs.push(pluginEvents.on("book:deleted", () => void load()));
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  unsubs.forEach((unsub) => unsub());
});
</script>

<template>
  <div class="stats-page-wrapper">
    <transition name="stats-page-fade">
      <div class="stats-page-backdrop" @click.self="navigate('/')">
        <div class="stats-page">
          <!-- Header -->
          <header class="sp-header">
            <div class="sp-header-left">
              <h1 class="sp-title">Reading Stats</h1>
              <span class="sp-subtitle">Your reading journey at a glance</span>
            </div>
            <button class="sp-close" @click="navigate('/')" aria-label="Close">
              <AppIcon name="close" :size="18" />
            </button>
          </header>

          <!-- Content -->
          <div class="sp-body" v-if="!loading && summary && summary.totalBooks > 0">
            <!-- Overview cards -->
            <section class="sp-overview">
              <div class="ov-card ov-card--primary">
                <div class="ov-value">{{ formatDuration(summary.totalReadingTime) }}</div>
                <div class="ov-label">Total reading time</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">{{ summary.totalSessions }}</div>
                <div class="ov-label">Sessions</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">{{ summary.totalBooks }}</div>
                <div class="ov-label">Books explored</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">{{ completedBooks }}</div>
                <div class="ov-label">Completed</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">{{ inProgressBooks }}</div>
                <div class="ov-label">In progress</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">{{ totalWordsRead.toLocaleString() }}</div>
                <div class="ov-label">Words read</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">{{ formatDuration(summary.thisWeekReadingTime) }}</div>
                <div class="ov-label">This week</div>
              </div>
              <div class="ov-card">
                <div class="ov-value">
                  {{ avgSpeed || "—" }}<span v-if="avgSpeed" class="ov-unit"> wpm</span>
                </div>
                <div class="ov-label">Avg reading speed</div>
              </div>
            </section>

            <!-- Reading activity heatmap -->
            <section class="sp-section" v-if="activeHourTotals.size > 0">
              <h2 class="sp-section-title">Reading Activity</h2>
              <p class="sp-section-desc">When you read most often</p>
              <div class="hour-heatmap">
                <div
                  v-for="hour in allHours"
                  :key="hour"
                  class="hour-cell"
                  :class="{ active: activeHourTotals.has(hour) }"
                  :style="{
                    '--intensity': activeHourTotals.has(hour)
                      ? (activeHourTotals.get(hour)! / maxHourCount).toFixed(2)
                      : '0',
                  }"
                  :title="`${formatHour(hour)}: ${activeHourTotals.get(hour) || 0} sessions`"
                >
                  <span class="hour-cell-label">{{ formatHour(hour) }}</span>
                </div>
              </div>
            </section>

            <!-- Per-book breakdown -->
            <section class="sp-section">
              <h2 class="sp-section-title">Books</h2>
              <p class="sp-section-desc">{{ bookStatEntries.length }} books with reading data</p>
              <div class="book-stats-list">
                <div
                  v-for="entry in bookStatEntries"
                  :key="entry.stats.bookId"
                  class="book-stats-row"
                >
                  <div
                    class="bsr-cover"
                    :style="{ background: getBookGradient(entry.book?.title || '') }"
                  >
                    <span class="bsr-initial">{{ getInitial(entry.book?.title || "") }}</span>
                  </div>
                  <div class="bsr-info">
                    <h3 class="bsr-title">{{ entry.book?.title || entry.stats.bookId }}</h3>
                    <div class="bsr-meta">
                      <span>{{ formatDuration(entry.stats.totalReadingTime) }}</span>
                      <span class="bsr-dot"></span>
                      <span>{{ entry.stats.totalSessions }} sessions</span>
                      <span class="bsr-dot"></span>
                      <span>{{ entry.stats.chaptersCompleted }} ch</span>
                      <template v-if="entry.stats.lastReadAt">
                        <span class="bsr-dot"></span>
                        <span class="bsr-last-read">{{
                          formatRelativeTime(entry.stats.lastReadAt)
                        }}</span>
                      </template>
                    </div>
                  </div>
                  <div class="bsr-gauge">
                    <svg viewBox="0 0 36 36" class="bsr-gauge-svg">
                      <path
                        class="bsr-gauge-bg"
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--border)"
                        stroke-width="3"
                      />
                      <path
                        class="bsr-gauge-fill"
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--accent)"
                        stroke-width="3"
                        stroke-linecap="round"
                        :stroke-dasharray="`${(entry.stats.totalReadingTime / (summary?.totalReadingTime || 1)) * 100}, 100`"
                      />
                    </svg>
                    <span class="bsr-gauge-label"
                      >{{
                        summary?.totalReadingTime
                          ? Math.round(
                              (entry.stats.totalReadingTime / summary.totalReadingTime) * 100,
                            )
                          : 0
                      }}%</span
                    >
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- Loading -->
          <div v-else-if="loading" class="sp-empty">
            <LoadingSpinner size="md" label="Loading statistics…" block />
          </div>

          <!-- Empty -->
          <EmptyState
            v-else
            class="sp-empty"
            icon="chart"
            :icon-size="56"
            :icon-stroke-width="1.2"
            title="No reading data yet"
            description="Open a book and start reading — your statistics will appear here."
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* ── Backdrop ── */
.stats-page-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

/* ── Page shell ── */
.stats-page {
  width: min(720px, calc(100vw - 40px));
  height: min(90vh, 760px);
  background: var(--reader-bg);
  border-radius: 20px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.18),
    0 8px 16px rgba(0, 0, 0, 0.08);
}

/* ── Header ── */
.sp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 28px 28px 0;
  flex-shrink: 0;
}

.sp-header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sp-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 500;
  margin: 0;
  color: var(--reader-text);
  letter-spacing: -0.02em;
  line-height: 1;
}

.sp-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
}

.sp-close {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.sp-close:hover {
  background: var(--bg-secondary);
  color: var(--reader-text);
  border-color: var(--accent-muted);
}

/* ── Body ── */
.sp-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px 32px;
  scroll-behavior: smooth;
}

/* ── Overview cards ── */
.sp-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 28px;
}

.ov-card {
  background: var(--bg-secondary);
  border-radius: 14px;
  padding: 18px 16px;
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ov-card--primary {
  grid-column: span 3;
  text-align: center;
  background: linear-gradient(135deg, var(--accent), var(--accent-muted, #a0454e));
  color: #fff;
  border: none;
}

.ov-card--primary .ov-label {
  color: rgba(255, 255, 255, 0.75);
}

.ov-value {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  color: var(--reader-text);
  letter-spacing: -0.01em;
  line-height: 1.1;
}

.ov-card--primary .ov-value {
  font-size: 30px;
  color: #fff;
}

.ov-unit {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  letter-spacing: 0;
}

.ov-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Section ── */
.sp-section {
  margin-bottom: 28px;
}

.sp-section-title {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 500;
  margin: 0 0 2px;
  color: var(--reader-text);
  letter-spacing: -0.01em;
}

.sp-section-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 16px;
  font-family: var(--font-ui);
}

/* ── Hour heatmap ── */
.hour-heatmap {
  display: flex;
  gap: 3px;
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  overflow-x: auto;
}

.hour-cell {
  flex: 1;
  min-width: 22px;
  aspect-ratio: 1;
  border-radius: 5px;
  background: color-mix(
    in srgb,
    var(--accent) calc(var(--intensity, 0) * 100%),
    var(--bg-elevated) 0%
  );
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 2px;
  transition: transform var(--transition-fast);
  position: relative;
}

.hour-cell:hover {
  transform: scale(1.15);
  z-index: 1;
}

.hour-cell.active {
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent 70%);
}

.hour-cell-label {
  font-size: 8px;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
}

.hour-cell:hover .hour-cell-label {
  opacity: 1;
}

/* ── Book stats list ── */
.book-stats-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.book-stats-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  transition: background var(--transition-fast);
}

.book-stats-row:hover {
  background: var(--bg-elevated);
}

.bsr-cover {
  width: 42px;
  height: 56px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}

.bsr-initial {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.bsr-info {
  flex: 1;
  min-width: 0;
}

.bsr-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--reader-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.bsr-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  flex-wrap: wrap;
}

.bsr-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border);
}

.bsr-last-read {
  color: var(--accent);
  font-weight: 500;
}

.bsr-gauge {
  flex-shrink: 0;
  position: relative;
  width: 48px;
  height: 48px;
}

.bsr-gauge-svg {
  width: 100%;
  height: 100%;
}

.bsr-gauge-bg {
  opacity: 0.5;
}

.bsr-gauge-fill {
  transition: stroke-dasharray 0.6s ease;
}

.bsr-gauge-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--reader-text);
  font-family: var(--font-ui);
}

/* ── Empty / Loading ── */
.sp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-secondary);
}

/* ── Transition ── */
.stats-page-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.stats-page-fade-leave-active {
  transition: all 0.2s ease-in;
}

.stats-page-fade-enter-from {
  opacity: 0;
}

.stats-page-fade-leave-to {
  opacity: 0;
}

.stats-page-fade-enter-from .stats-page {
  transform: scale(0.95) translateY(12px);
  opacity: 0;
}

.stats-page-fade-leave-to .stats-page {
  transform: scale(0.97);
  opacity: 0;
}

/* ── Responsive ── */
@media (max-width: 600px) {
  .stats-page {
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
    border: none;
  }

  .sp-header {
    padding: 20px 20px 0;
  }

  .sp-body {
    padding: 20px;
  }

  .sp-title {
    font-size: 22px;
  }

  .sp-overview {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .ov-card--primary {
    grid-column: span 2;
  }

  .ov-card--primary .ov-value {
    font-size: 26px;
  }

  .ov-value {
    font-size: 18px;
  }

  .book-stats-row {
    padding: 10px;
    gap: 10px;
  }

  .bsr-gauge {
    width: 36px;
    height: 36px;
  }
}
</style>
