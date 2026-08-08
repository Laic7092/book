<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { BookReadingStats } from "../../core/types";
import { formatDuration, formatRelativeTime, formatHour } from "../../utils/time";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { getStatsEngine } from "./engine";

const eng = getStatsEngine();
const getSession = eng.getSession();
const stats = ref<BookReadingStats | null>(null);
const totalChapters = computed(() => getSession?.getState().chapters.length ?? 0);

const maxHourCount = computed(() => Math.max(1, ...(stats.value?.activeHours ?? [0])));
const estimatedRemaining = computed(() => {
  const s = stats.value;
  if (!s || !totalChapters.value || s.chaptersCompleted <= 0) return 0;
  const remaining = totalChapters.value - s.chaptersCompleted;
  if (remaining <= 0) return 0;
  return Math.round((s.totalReadingTime / s.chaptersCompleted) * remaining);
});

onMounted(async () => {
  const bookId = getSession?.getState().bookId;
  if (bookId) {
    stats.value = await eng.getStats(bookId);
  }
});

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="Reading Statistics" @close="emit('close')" />
    <div class="modal-body scroll-body">
      <div v-if="stats" class="stats-content">
        <div class="stats-summary">
          <div class="stat-item primary">
            <div class="stat-value">{{ formatDuration(stats.totalReadingTime) }}</div>
            <div class="stat-label">Total Reading Time</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ stats.totalSessions }}</div>
            <div class="stat-label">Sessions</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ formatDuration(stats.averageSessionTime) }}</div>
            <div class="stat-label">Avg Session</div>
          </div>
        </div>

        <div class="stats-card">
          <h4 class="stats-card-title">Progress</h4>
          <div class="progress-grid">
            <div class="progress-item">
              <div class="progress-number">{{ stats.chaptersCompleted }}</div>
              <div class="progress-label">of {{ totalChapters }} chapters</div>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{
                    width:
                      totalChapters > 0
                        ? `${(stats.chaptersCompleted / totalChapters) * 100}%`
                        : '0%',
                  }"
                ></div>
              </div>
              <div class="progress-percentage">
                {{
                  totalChapters > 0
                    ? Math.round((stats.chaptersCompleted / totalChapters) * 100)
                    : 0
                }}%
              </div>
            </div>
            <div v-if="estimatedRemaining > 0" class="progress-eta">
              ~{{ formatDuration(estimatedRemaining) }} remaining at your pace
            </div>
          </div>
        </div>

        <div class="stats-card">
          <h4 class="stats-card-title">Reading Speed</h4>
          <div class="speed-grid">
            <div class="stat-item">
              <div class="stat-value">{{ stats.readingSpeed }}</div>
              <div class="stat-label">words/min</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ stats.wordsRead.toLocaleString() }}</div>
              <div class="stat-label">words read</div>
            </div>
          </div>
        </div>

        <div class="stats-card" v-if="stats.activeHours.length > 0">
          <h4 class="stats-card-title">Active Hours</h4>
          <div class="hours-grid">
            <div
              v-for="(count, hour) in stats.activeHours"
              :key="hour"
              class="hour-item"
              :title="`${formatHour(hour)}: ${count} sessions`"
            >
              <div
                class="hour-bar"
                :style="{
                  height: `${Math.max(3, (count / maxHourCount) * 24)}px`,
                  opacity: count > 0 ? 0.85 : 0.12,
                }"
              ></div>
              <span class="hour-label">{{ formatHour(hour) }}</span>
            </div>
          </div>
        </div>

        <div class="stats-card">
          <h4 class="stats-card-title">Reading History</h4>
          <div class="history-grid">
            <div class="history-item">
              <span class="history-label">First read</span>
              <span class="history-value">{{
                stats.firstReadAt ? formatRelativeTime(stats.firstReadAt) : "—"
              }}</span>
            </div>
            <div class="history-item">
              <span class="history-label">Last read</span>
              <span class="history-value">{{
                stats.lastReadAt ? formatRelativeTime(stats.lastReadAt) : "—"
              }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="no-stats">
        <div class="no-stats-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M12 20V10M18 20V4M6 20v-4" />
          </svg>
        </div>
        <p>No reading data yet</p>
        <p class="no-stats-hint">Start reading to track your progress</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-body {
  padding: 16px 20px 24px;
}

.modal-stats .stats-content {
  padding: 20px;
}

.stats-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 16px;
}

.stat-item.primary {
  grid-column: span 3;
  text-align: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-display);
}

.stat-item.primary .stat-value {
  font-size: 32px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.stats-card {
  background: var(--hover-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.stats-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 14px;
}

.progress-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.progress-number {
  font-size: 28px;
  font-weight: 600;
  color: var(--reader-text);
  font-family: var(--font-display);
}

.progress-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-percentage {
  font-size: 13px;
  font-weight: 600;
  color: var(--reader-text);
  min-width: 40px;
}

.progress-eta {
  font-size: 12px;
  color: var(--text-secondary);
}

.speed-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.hours-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hour-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border-radius: 8px;
  min-width: 50px;
}

.hour-bar {
  width: 4px;
  height: 24px;
  background: var(--accent);
  border-radius: 2px;
  opacity: 0.8;
}

.hour-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.history-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--reader-text);
}

.no-stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-secondary);
}

.no-stats-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-stats-hint {
  font-size: 13px;
  margin-top: 8px;
  color: var(--text-secondary);
}
</style>
