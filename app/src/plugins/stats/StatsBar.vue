<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { getStatsEngine } from "./engine";
import { formatDuration } from "../../utils/time";
import { setStatsRefreshHandler } from "./refresh";

interface SummaryStats {
  totalBooks: number;
  totalReadingTime: number;
  totalSessions: number;
  thisWeekReadingTime: number;
}

const stats = ref<SummaryStats | null>(null);

async function load() {
  const eng = getStatsEngine();
  stats.value = await eng.getSummaryStats().catch(() => null);
}

onMounted(() => {
  load();
  setStatsRefreshHandler(load);
});
onUnmounted(() => setStatsRefreshHandler(() => {}));
</script>

<template>
  <div v-if="stats && stats.totalBooks > 0" class="stats-bar">
    <div class="stat-item">
      <span class="stat-value">{{ formatDuration(stats.totalReadingTime) }}</span>
      <span class="stat-label">Total read</span>
    </div>
    <span class="stat-sep"></span>
    <div class="stat-item">
      <span class="stat-value">{{ formatDuration(stats.thisWeekReadingTime) }}</span>
      <span class="stat-label">This week</span>
    </div>
  </div>
</template>

<style>
.stats-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  padding-left: 30px;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.stat-value {
  font-size: 12px;
  font-weight: 550;
  color: var(--reader-text);
  font-family: var(--font-ui);
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
}

.stat-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
}
</style>
