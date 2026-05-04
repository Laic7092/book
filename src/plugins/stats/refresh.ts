let refreshFn: (() => void) | null = null;

export function setStatsRefreshHandler(fn: () => void) {
  refreshFn = fn;
}

export function triggerStatsRefresh() {
  refreshFn?.();
}
