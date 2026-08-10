<script setup lang="ts">
import { computed, ref } from "vue";
import type { Annotation } from "../../core/types";
import ModalPanel from "../../components/modals/ModalPanel.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import FilterBar from "../../components/ui/FilterBar.vue";
import type { FilterItem } from "../../components/ui/FilterBar.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { formatRelativeShort } from "../../utils/time";
import { useAnnotationStore, useAnnotationFilters } from "./index";
import { currentSession } from "../../stores/reader-session";

const store = useAnnotationStore();
const session = currentSession.value;
const { currentBookId } = useAnnotationFilters();

const emit = defineEmits<{
  (e: "close"): void;
}>();

function handleNavigate(annotation: Annotation) {
  void session?.navigateToCfi(annotation.startCfi, annotation.chapterId);
  emit("close");
}

function handleDelete(id: string) {
  store.remove(id);
}

type Filter = "all" | "highlight" | "underline";
const filter = ref<Filter>("all");

const FILTER_ITEMS: FilterItem[] = [
  { key: "all", label: "All" },
  { key: "highlight", label: "Highlights" },
  { key: "underline", label: "Underlines" },
];

// Derive book-scoped annotations from the full entity store cache
const annotations = computed(() =>
  store.items.value.filter((a) => a.bookId === currentBookId.value),
);

const filtered = computed(() => {
  if (filter.value === "all") return annotations.value;
  return annotations.value.filter((a) => a.type === filter.value);
});

const groupedByChapter = computed(() => {
  const groups: Array<{
    chapterId: string;
    title: string;
    annotations: Annotation[];
  }> = [];

  for (const ann of filtered.value) {
    let group = groups.find((g) => g.chapterId === ann.chapterId);
    if (!group) {
      group = {
        chapterId: ann.chapterId,
        title:
          session?.getState().chapters.find((c) => c.id === ann.chapterId)?.title ??
          "Unknown Chapter",
        annotations: [],
      };
      groups.push(group);
    }
    group.annotations.push(ann);
  }

  return groups;
});
</script>

<template>
  <ModalPanel title="Annotations" @close="emit('close')">
    <template #toolbar>
      <FilterBar v-model="filter" :items="FILTER_ITEMS" />
    </template>
    <template v-if="groupedByChapter.length > 0">
      <div v-for="group in groupedByChapter" :key="group.chapterId" class="chapter-group">
        <h4 class="chapter-title">{{ group.title }}</h4>
        <ul class="annotations-list">
          <li v-for="ann in group.annotations" :key="ann.id" class="annotation-item">
            <div class="annotation-card" @click.stop="handleNavigate(ann)">
              <div class="annotation-left">
                <span
                  v-if="ann.type === 'highlight'"
                  class="color-dot"
                  :style="{ backgroundColor: ann.color }"
                />
                <span v-else class="underline-icon" :style="{ color: ann.color }">
                  <AppIcon name="underline" :size="14" :stroke-width="2.5" />
                </span>
              </div>
              <div class="annotation-main">
                <p class="annotation-preview">{{ ann.textPreview }}</p>
                <p v-if="ann.note" class="annotation-note">{{ ann.note }}</p>
                <span class="annotation-date">{{ formatRelativeShort(ann.createdAt) }}</span>
              </div>
              <button
                class="delete-btn"
                @click.stop="handleDelete(ann.id)"
                aria-label="Delete annotation"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </li>
        </ul>
      </div>
    </template>
    <EmptyState
      v-if="groupedByChapter.length === 0"
      icon="pencil"
      title="No annotations yet"
      description="Select text in the reader to highlight or underline"
    />
  </ModalPanel>
</template>

<style scoped>
.chapter-group {
  padding: 0 12px;
}

.chapter-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 16px 0 6px 8px;
  margin: 0;
}

.annotations-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.annotation-item {
  margin-bottom: 6px;
}

.annotation-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 120ms ease;
  background: var(--hover-bg, #f9fafb);
}

.annotation-card:hover {
  background: var(--bg-elevated, #fff);
  border-color: var(--border, #d1d5db);
}

.annotation-left {
  display: flex;
  align-items: center;
  padding-top: 2px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex-shrink: 0;
}

.underline-icon {
  flex-shrink: 0;
  display: flex;
}

.annotation-main {
  flex: 1;
  min-width: 0;
}

.annotation-preview {
  font-size: 13px;
  color: var(--reader-text, #111827);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.annotation-note {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
  margin: 4px 0 2px;
  padding-left: 6px;
  border-left: 2px solid var(--border-subtle);
}

.annotation-date {
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
}

.delete-btn {
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  border-radius: 6px;
  display: flex;
  align-self: center;
  flex-shrink: 0;
}

.delete-btn:hover {
  background: #fef2f2;
  color: #dc2626;
}
</style>
