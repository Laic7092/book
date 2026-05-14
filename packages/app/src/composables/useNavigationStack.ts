import { ref, computed } from "vue";

export interface NavEntry {
  chapterId: string;
  page: number;
}

export interface NavSnapshot {
  canGoBack: boolean;
  canGoForward: boolean;
  currentEntry: NavEntry | null;
  stack: readonly NavEntry[];
  idx: number;
}

/**
 * Pure-TS navigation stack. Can be used standalone (no Vue dependency) by
 * calling push/back/forward/reset and reading getSnapshot().
 */
export class NavigationStack {
  private _stack: NavEntry[] = [];
  private _idx = -1;

  push(entry: NavEntry): void {
    const top = this._stack[this._idx];
    if (top && top.chapterId === entry.chapterId && top.page === entry.page) return;
    this._stack = [...this._stack.slice(0, this._idx + 1), entry];
    this._idx = this._stack.length - 1;
  }

  back(): NavEntry | null {
    if (this._idx <= 0) return null;
    this._idx--;
    return this._stack[this._idx];
  }

  forward(): NavEntry | null {
    if (this._idx >= this._stack.length - 1) return null;
    this._idx++;
    return this._stack[this._idx];
  }

  reset(): void {
    this._stack = [];
    this._idx = -1;
  }

  getSnapshot(): NavSnapshot {
    return {
      canGoBack: this._idx > 0,
      canGoForward: this._idx < this._stack.length - 1,
      currentEntry: this._stack[this._idx] ?? null,
      stack: this._stack,
      idx: this._idx,
    };
  }
}

/**
 * Vue composable wrapper around NavigationStack.
 * Returns the same interface as before for backward compatibility.
 */
export function useNavigationStack() {
  const stack = ref<NavEntry[]>([]);
  const idx = ref(-1);

  const canGoBack = computed(() => idx.value > 0);
  const canGoForward = computed(() => idx.value < stack.value.length - 1);
  const currentEntry = computed(() => stack.value[idx.value] ?? null);

  function push(entry: NavEntry) {
    const top = stack.value[idx.value];
    if (top && top.chapterId === entry.chapterId && top.page === entry.page) return;
    stack.value = [...stack.value.slice(0, idx.value + 1), entry];
    idx.value = stack.value.length - 1;
  }

  function back(): NavEntry | null {
    if (idx.value <= 0) return null;
    idx.value--;
    return stack.value[idx.value];
  }

  function forward(): NavEntry | null {
    if (idx.value >= stack.value.length - 1) return null;
    idx.value++;
    return stack.value[idx.value];
  }

  function reset() {
    stack.value = [];
    idx.value = -1;
  }

  return {
    stack,
    idx,
    canGoBack,
    canGoForward,
    currentEntry,
    push,
    back,
    forward,
    reset,
  };
}
