<script setup lang="ts">
import { ref } from "vue";
import ModalPanel from "../../components/modals/ModalPanel.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import LoadingSpinner from "../../components/ui/LoadingSpinner.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { useBookshelfStore } from "../../stores/bookshelf";
import { useUIStore } from "../../stores/ui";
import {
  parseOpdsFeed,
  type OpdsEntry,
  type OpdsNavLink,
  type OpdsPagination,
  type OpdsFeed,
} from "./opds-parser";
import { getOpdsServer } from "./index";

const emit = defineEmits<{ (e: "close"): void }>();

const server = getOpdsServer();
const bookshelfStore = useBookshelfStore();
const uiStore = useUIStore();

const inputUrl = ref("");
const navStack = ref<{ url: string; label: string }[]>([]);
const feedTitle = ref("");
const navLinks = ref<OpdsNavLink[]>([]);
const entries = ref<OpdsEntry[]>([]);
const pagination = ref<OpdsPagination>({});
const isLoading = ref(false);
const error = ref("");

const importingIds = ref(new Set<string>());

function hasContent(): boolean {
  return navLinks.value.length > 0 || entries.value.length > 0;
}

async function loadCatalog(url?: string) {
  const target = url ?? inputUrl.value.trim();
  if (!server || !target) return;
  isLoading.value = true;
  error.value = "";
  navLinks.value = [];
  entries.value = [];
  pagination.value = {};
  try {
    const res = await server.net.fetch(target);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const xml = await res.text();
    const feed: OpdsFeed = parseOpdsFeed(xml, target);
    feedTitle.value = feed.title;
    navLinks.value = feed.navLinks;
    entries.value = feed.entries;
    pagination.value = feed.pagination;
    if (
      !feed.navLinks.length &&
      !feed.entries.length &&
      !feed.pagination.next &&
      !feed.pagination.previous
    ) {
      error.value = "No content found in this catalog.";
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load catalog.";
  } finally {
    isLoading.value = false;
  }
}

function doLoad() {
  navStack.value = [{ url: inputUrl.value.trim(), label: inputUrl.value.trim() }];
  loadCatalog();
}

function navigateTo(href: string, label: string) {
  navStack.value.push({ url: href, label });
  loadCatalog(href);
}

function goBack() {
  if (navStack.value.length <= 1) return;
  navStack.value.pop();
  const prev = navStack.value[navStack.value.length - 1];
  inputUrl.value = prev.url;
  loadCatalog(prev.url);
}

async function importBook(entry: OpdsEntry, downloadUrl?: string, mimeType?: string) {
  const url = downloadUrl || entry.downloadUrl;
  const type = mimeType || entry.format;
  if (!server || !url) return;
  const formatId = entry.id + "@" + url;
  importingIds.value.add(formatId);
  try {
    const res = await server.net.fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const ext = type?.includes("epub")
      ? ".epub"
      : type?.includes("pdf")
        ? ".pdf"
        : type?.includes("cbz")
          ? ".cbz"
          : type?.includes("mobipocket")
            ? ".mobi"
            : ".epub";
    const filename = entry.title.replace(/[/<>:"\\|?*]/g, "").slice(0, 60) + ext;
    const file = new File([blob], filename, { type: type || "application/epub+zip" });
    const result = await bookshelfStore.addBookFromFile(file);
    if (!result) return;
    uiStore.triggerToast(`"${result.book.title}" imported`);
  } catch (err) {
    uiStore.triggerToast(
      `Import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      true,
    );
  } finally {
    importingIds.value.delete(formatId);
  }
}

const formatLabel = (type: string, title?: string): string => {
  if (title) return title;
  const m = type.split("/")[1];
  if (!m) return "Download";
  return m.includes("mobipocket") ? "Kindle" : m.toUpperCase();
};
</script>

<template>
  <ModalPanel title="OPDS Catalog" body-padding="20px" @close="emit('close')">
    <!-- URL input -->
    <div class="opds-url-bar">
      <AppIcon name="search" class="opds-url-icon" :size="16" />
      <input
        v-model="inputUrl"
        type="url"
        placeholder="Paste OPDS catalog URL…"
        @keyup.enter="doLoad"
        class="opds-url-input"
      />
      <button class="opds-load-btn" :disabled="isLoading || !inputUrl.trim()" @click="doLoad">
        {{ isLoading ? "Loading…" : "Browse" }}
      </button>
    </div>

    <!-- Breadcrumb -->
    <div v-if="hasContent()" class="opds-breadcrumb">
      <button v-if="navStack.length > 1" class="opds-back-btn" @click="goBack">
        <AppIcon name="arrow-left" :size="14" />
      </button>
      <span class="opds-breadcrumb-label">{{ feedTitle }}</span>
      <span v-if="!isLoading && hasContent()" class="opds-breadcrumb-count"
        >{{ entries.length + navLinks.length }} item{{
          entries.length + navLinks.length !== 1 ? "s" : ""
        }}</span
      >
    </div>

    <!-- Status -->
    <LoadingSpinner v-if="isLoading" size="sm" label="Loading catalog…" />
    <div v-else-if="error" class="opds-error">
      <AppIcon name="alert" :size="16" />
      {{ error }}
    </div>

    <!-- Navigation (sub-catalogs) -->
    <div v-if="navLinks.length" class="opds-section-label">Catalogs</div>
    <div v-if="navLinks.length" class="opds-section">
      <button
        v-for="link in navLinks"
        :key="link.href"
        class="opds-nav-card"
        @click="navigateTo(link.href, link.title)"
      >
        <span class="opds-nav-icon">
          <AppIcon name="folder" :size="18" :stroke-width="1.3" />
        </span>
        <span class="opds-nav-label">{{ link.title }}</span>
        <AppIcon name="chevron-right" class="opds-nav-arrow" :size="14" />
      </button>
    </div>

    <!-- Book entries -->
    <div v-if="entries.length" class="opds-section-label">Books</div>
    <div v-if="entries.length" class="opds-section">
      <div v-for="entry in entries" :key="entry.id" class="opds-book-card">
        <div class="opds-book-cover" :class="{ 'has-cover': entry.coverUrl }">
          <img
            v-if="entry.coverUrl"
            :src="entry.coverUrl"
            :alt="entry.title"
            class="opds-cover-img"
          />
          <span v-else class="opds-cover-fallback">
            <AppIcon name="book" :size="20" :stroke-width="1" />
          </span>
        </div>
        <div class="opds-book-meta">
          <div class="opds-book-title">{{ entry.title }}</div>
          <div v-if="entry.author !== 'Unknown'" class="opds-book-author">{{ entry.author }}</div>
        </div>
        <div class="opds-book-actions">
          <button
            v-for="fmt in entry.formats"
            :key="fmt.url"
            class="opds-format-pill"
            :disabled="importingIds.has(entry.id + '@' + fmt.url)"
            @click="importBook(entry, fmt.url, fmt.type)"
          >
            <AppIcon
              v-if="importingIds.has(entry.id + '@' + fmt.url)"
              name="spinner"
              class="opds-spin"
              :size="12"
              :stroke-width="2.5"
            />
            <span v-else>{{
              formatLabel(fmt.type, fmt.label !== "Download" ? fmt.label : "")
            }}</span>
          </button>
          <button
            v-if="!entry.formats.length && entry.downloadUrl"
            class="opds-format-pill opds-format-pill-single"
            :disabled="importingIds.has(entry.id + '@' + entry.downloadUrl)"
            @click="importBook(entry)"
          >
            {{ importingIds.has(entry.id + "@" + entry.downloadUrl) ? "…" : "Import" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="pagination.previous || pagination.next" class="opds-pagination">
      <button
        v-if="pagination.previous"
        class="opds-page-btn"
        @click="loadCatalog(pagination.previous)"
      >
        <AppIcon name="arrow-left" :size="14" />
        Previous page
      </button>
      <span v-else></span>
      <button v-if="pagination.next" class="opds-page-btn" @click="loadCatalog(pagination.next)">
        Next page
        <AppIcon name="chevron-right" :size="14" />
      </button>
    </div>

    <!-- Empty state (loaded but nothing to show) -->
    <EmptyState
      v-if="!isLoading && !error && !hasContent()"
      icon="search"
      title="Enter an OPDS catalog URL to browse"
    />
  </ModalPanel>
</template>

<style scoped>
/* ── Panel shell ── */
/* (ModalPanel provides .modal-content-inner / .modal-body) */

/* ── URL bar ── */
.opds-url-bar {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.opds-url-bar:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.opds-url-icon {
  flex-shrink: 0;
  margin-left: 12px;
  color: var(--text-secondary);
}
.opds-url-input {
  flex: 1;
  padding: 10px 10px;
  border: none;
  background: transparent;
  color: var(--reader-text);
  font-size: 16px;
  font-family: var(--font-ui);
  outline: none;
}
.opds-url-input::placeholder {
  color: var(--text-secondary);
}
.opds-load-btn {
  flex-shrink: 0;
  padding: 10px 18px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.opds-load-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.opds-load-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── Breadcrumb ── */
.opds-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  min-height: 28px;
}
.opds-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.opds-back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.opds-breadcrumb-label {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 500;
  color: var(--reader-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.opds-breadcrumb-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* ── Status ── */
.opds-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: rgba(210, 60, 40, 0.06);
  border: 1px solid rgba(210, 60, 40, 0.15);
  border-radius: 8px;
  color: #b33a2a;
  font-size: 13px;
  font-family: var(--font-ui);
}

/* ── Section label ── */
.opds-section-label {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding-left: 2px;
}

/* ── Section (shared) ── */
.opds-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}

/* ── Navigation cards ── */
.opds-nav-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--reader-text);
  transition: all var(--transition-fast);
  text-align: left;
}
.opds-nav-card:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateX(2px);
}
.opds-nav-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  display: flex;
}
.opds-nav-card:hover .opds-nav-icon {
  color: var(--accent);
}
.opds-nav-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opds-nav-arrow {
  flex-shrink: 0;
  color: var(--text-secondary);
  transition: transform var(--transition-fast);
}
.opds-nav-card:hover .opds-nav-arrow {
  transform: translateX(2px);
  color: var(--accent);
}

/* ── Book cards ── */
.opds-book-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-elevated);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.opds-book-card:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
}

/* Cover */
.opds-book-cover {
  flex-shrink: 0;
  width: 36px;
  height: 50px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--text-secondary);
}
.opds-book-cover.has-cover {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.opds-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.opds-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Meta */
.opds-book-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.opds-book-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--reader-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opds-book-author {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Format pills */
.opds-book-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
  justify-content: flex-end;
  max-width: 50%;
}
.opds-format-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}
.opds-format-pill:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.opds-format-pill:disabled {
  opacity: 0.5;
  cursor: default;
}
.opds-format-pill-single {
  color: var(--accent);
  border-color: var(--accent-muted);
  background: var(--accent-soft);
}

/* Spinner in pill */
.opds-spin {
  animation: opdsSpin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes opdsSpin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Empty state ── */

/* ── Pagination ── */
.opds-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.opds-page-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.opds-page-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
