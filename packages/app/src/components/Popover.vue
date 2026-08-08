<script setup lang="ts">
import { computed, watch, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** Anchor point in viewport coordinates. When omitted, the popover
     * renders without positioning — the caller styles it via `style`/`:deep`. */
    x?: number;
    y?: number;
    /** Expansion direction relative to the anchor. */
    placement?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
    zIndex?: number;
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
  }>(),
  {
    placement: "bottom-left",
    zIndex: 1001,
    closeOnClickOutside: true,
    closeOnEscape: true,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const style = computed(() => {
  const { x, y, placement, zIndex } = props;
  const s: Record<string, string> = { zIndex: String(zIndex) };
  if (x === undefined || y === undefined) return s;
  s.position = "fixed";
  switch (placement) {
    case "bottom-right":
      s.right = `${window.innerWidth - x}px`;
      s.top = `${y}px`;
      break;
    case "top-left":
      s.left = `${x}px`;
      s.bottom = `${window.innerHeight - y}px`;
      break;
    case "top-right":
      s.right = `${window.innerWidth - x}px`;
      s.bottom = `${window.innerHeight - y}px`;
      break;
    case "bottom-left":
    default:
      s.left = `${x}px`;
      s.top = `${y}px`;
      break;
  }
  return s;
});

function onDocClick(): void {
  // Trigger buttons stop propagation, so a click reaching the document is
  // always "outside".
  emit("close");
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") emit("close");
}

function syncListeners(open: boolean): void {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKeydown);
  if (open) {
    if (props.closeOnClickOutside) document.addEventListener("click", onDocClick);
    if (props.closeOnEscape) document.addEventListener("keydown", onKeydown);
  }
}

watch(
  () => props.open,
  (open) => syncListeners(open),
  { immediate: true },
);

onUnmounted(() => syncListeners(false));
</script>

<template>
  <transition name="pop-fade">
    <div v-if="open" class="popover" :style="style" @click.stop>
      <slot />
    </div>
  </transition>
</template>

<style scoped>
/* Popover shell: shared by menus, dropdowns and context menus. Content
   styling stays in the caller's scoped CSS (slot content keeps its scope). */
.popover {
  padding: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
}

.pop-fade-enter-active {
  transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.pop-fade-leave-active {
  transition: all 0.12s ease-in;
}

.pop-fade-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

.pop-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
