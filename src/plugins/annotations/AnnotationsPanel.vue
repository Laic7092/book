<script setup lang="ts">
import { computed, ref } from "vue";
import type { Annotation } from "../../core/types";
import ModalHeader from "../../components/modals/ModalHeader.vue";
import { getReaderHost, useAnnotationsStore } from "./store";

const annotationsStore = useAnnotationsStore();
const host = getReaderHost();

const emit = defineEmits<{
  (e: "close"): void;
}>();

function handleNavigate(annotation: Annotation) {
  host?.navigateToCfi(annotation.startCfi, annotation.chapterId);
}

function handleDelete(id: string) {
  annotationsStore.removeAnnotation(id);
}

type Filter = "all" | "highlight" | "underline";
const filter = ref<Filter>("all");

const annotations = computed(() => annotationsStore.allAnnotations);

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
        title: host?.getChapters().find((c) => c.id === ann.chapterId)?.title ?? "Unknown Chapter",
        annotations: [],
      };
      groups.push(group);
    }
    group.annotations.push(ann);
  }

  return groups;
});

function formatDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
</script>

<template>
  <div class="modal-content-inner">
    <ModalHeader title="Annotations" @close="emit('close')" />

    <div class="filter-bar">
      <button
        v-for="f in [
          ['all', 'All'],
          ['highlight', 'Highlights'],
          ['underline', 'Underlines'],
        ] as const"
        :key="f[0]"
        class="filter-btn"
        :class="{ active: filter === f[0] }"
        @click="filter = f[0]"
      >
        {{ f[1] }}
      </button>
    </div>

    <div class="modal-body scroll-body">
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
                  <svg
                    v-else
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    :stroke="ann.color"
                    stroke-width="2.5"
                    class="underline-icon"
                  >
                    <path d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3" />
                    <line x1="4" y1="21" x2="20" y2="21" />
                  </svg>
                </div>
                <div class="annotation-main">
                  <p class="annotation-preview">{{ ann.textPreview }}</p>
                  <p v-if="ann.note" class="annotation-note">{{ ann.note }}</p>
                  <span class="annotation-date">{{ formatDate(ann.createdAt) }}</span>
                </div>
                <button
                  class="delete-btn"
                  @click.stop="handleDelete(ann.id)"
                  aria-label="Delete annotation"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                    />
                  </svg>
                </button>
              </div>
            </li>
          </ul>
        </div>
      </template>
      <div v-else class="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        <p>No annotations yet</p>
        <span>Select text in the reader to highlight or underline</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.filter-btn {
  padding: 5px 14px;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 120ms ease;
  font-family: inherit;
}

.filter-btn:hover {
  background: var(--hover-bg, #f3f4f6);
}

.filter-btn.active {
  background: var(--accent-soft, #eef2ff);
  color: var(--accent, #6366f1);
}

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
}

.annotation-main {
  flex: 1;
  min-width: 0;
}

.annotation-preview {
  font-size: 13px;
  color: var(--text-primary, #111827);
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
  gap: 8px;
}

.empty-state svg {
  opacity: 0.4;
}

.empty-state p {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.empty-state span {
  font-size: 12px;
  opacity: 0.7;
}
</style>
