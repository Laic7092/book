import { ref, computed } from "vue";

export interface NavEntry {
  chapterId: string;
  page: number;
}

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
