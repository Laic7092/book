<script setup lang="ts">
import { computed } from "vue";
import { getSearchApis } from "../registry";

const api = computed(() => getSearchApis()[0] ?? null);
</script>

<template>
  <Transition name="fade">
    <button
      v-if="api?.hasJumpState"
      class="search-go-back"
      @click.stop="api?.goBackFromResult()"
      aria-label="Go back to previous position"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.search-go-back {
  position: fixed;
  bottom: calc(80px + env(safe-area-inset-bottom, 20px));
  left: max(16px, env(safe-area-inset-left, 0));
  z-index: 102;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-elevated, #fff);
  color: var(--reader-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  -webkit-tap-highlight-color: transparent;
}
.search-go-back:hover {
  background: var(--hover-bg);
  border-color: var(--accent);
  color: var(--accent);
}
.search-go-back:active {
  transform: scale(0.92);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
