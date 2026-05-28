<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from "vue";
import type { Chapter } from "../../core/types";
import ModalHeader from "./ModalHeader.vue";

const props = defineProps<{
  chapters: Chapter[];
  currentChapterId: string | null;
}>();

const emit = defineEmits<{
  (e: "select-chapter", chapterId: string): void;
  (e: "close"): void;
}>();

const tocListRef = ref<HTMLElement | null>(null);
const activeItemRefs = ref<Record<string, HTMLElement>>({});
const hasScrolledToCurrent = ref(false);
const isMounted = ref(false);

// Filter chapters: show only those in NCX/Nav TOC (with fallback for books without TOC)
const visibleChapters = computed(() => {
  const tocChapters = props.chapters.filter((c) => c.inToc === true);
  // If no chapters have inToc=true (old data or books without NCX), show all chapters
  return tocChapters.length > 0 ? tocChapters : props.chapters;
});

function handleTocClick(chapterId: string) {
  emit("select-chapter", chapterId);
  emit("close");
}

const currentChapterIndex = computed(() => {
  if (!props.currentChapterId) return -1;
  return visibleChapters.value.findIndex((c) => c.id === props.currentChapterId);
});

function scrollToCurrentChapter() {
  if (!props.currentChapterId || hasScrolledToCurrent.value || !isMounted.value) return;

  const activeEl = activeItemRefs.value[props.currentChapterId];
  if (activeEl && tocListRef.value) {
    hasScrolledToCurrent.value = true;
    tocListRef.value.scrollTop =
      activeEl.offsetTop - tocListRef.value.offsetHeight / 2 + activeEl.offsetHeight / 2;
  }
}

// Auto-scroll to current chapter when modal opens
onMounted(async () => {
  isMounted.value = true;
  if (!props.currentChapterId) return;

  await nextTick();
  scrollToCurrentChapter();
});

// Also watch for chapter changes in case modal stays open
watch(
  () => props.currentChapterId,
  (newVal) => {
    if (newVal) {
      hasScrolledToCurrent.value = false;
      nextTick(() => scrollToCurrentChapter());
    }
  },
);

function setRef(el: HTMLElement | null, chapterId: string) {
  if (el) {
    activeItemRefs.value[chapterId] = el;
  } else {
    delete activeItemRefs.value[chapterId];
  }
}
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="Contents" @close="emit('close')" />
    <div ref="tocListRef" class="modal-body scroll-body">
      <div v-if="chapters.length === 0" class="no-chapters">No chapters available</div>
      <ul v-else class="toc-list">
        <li v-for="(ch, index) in visibleChapters" :key="ch.id">
          <button
            :ref="(el: HTMLElement | null) => setRef(el, ch.id)"
            :class="['toc-item', { active: ch.id === currentChapterId }]"
            @click.stop="handleTocClick(ch.id)"
          >
            <!-- <span class="toc-number">{{ index + 1 }}</span> -->
            <span class="toc-title">{{ ch.title }}</span>
          </button>
          <div style="margin: 0 8px; border: 1px solid rgba(0, 0, 0, 0.2)"></div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.no-chapters {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
  font-size: 14px;
}

.toc-list {
  list-style: none;
  padding: 0 14px;
  margin: 0;
}

.toc-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 8px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  color: var(--modal-text);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
  touch-action: manipulation;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.toc-item:hover {
  background: var(--hover-bg);
}

.toc-item.active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 500;
}

.toc-item.active .toc-number {
  color: rgba(255, 255, 255, 0.7);
}

.toc-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 28px;
  font-feature-settings: "tnum";
}

.toc-title {
  flex: 1;
}
</style>
