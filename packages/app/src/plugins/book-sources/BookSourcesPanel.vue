<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import ModalPanel from "../../components/modals/ModalPanel.vue";
import LoadingSpinner from "../../components/ui/LoadingSpinner.vue";
import ProgressBar from "../../components/ui/ProgressBar.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { useBookshelfStore } from "../../stores/bookshelf";
import { useUIStore } from "../../stores/ui";
import { getSourceManager } from "./index";
import type { LegadoSource } from "./sources";
import type { BookSearchItem, BookChapter } from "./rule-parser";

const emit = defineEmits<{ (e: "close"): void }>();

const manager = getSourceManager()!;
const bookshelfStore = useBookshelfStore();
const uiStore = useUIStore();

// ── State ──

type Stage = "sources" | "search" | "results" | "detail" | "importing";

const stage = ref<Stage>("sources");
const keyword = ref("");
const builtInSources = ref<LegadoSource[]>([]);
const importedSources = ref<LegadoSource[]>([]);
const activeSource = ref<LegadoSource | null>(null);
const searchResults = ref<BookSearchItem[]>([]);
const selectedBook = ref<BookSearchItem | null>(null);
const bookInfo = ref<Record<string, string>>({});
const chapters = ref<BookChapter[]>([]);
const isLoading = ref(false);
const error = ref("");
const importingId = ref<string | null>(null);
const importProgress = ref(0);

// Import dialog
const showImport = ref(false);
const importUrl = ref("");
const isImporting = ref(false);

// Delete confirm
const confirmDeleteUrl = ref<string | null>(null);

onMounted(async () => {
  builtInSources.value = manager.getBuiltIn();
  importedSources.value = await manager.getImported();
});

// ✦ Search

async function doSearch() {
  if (!activeSource.value || !keyword.value.trim()) return;
  isLoading.value = true;
  error.value = "";
  searchResults.value = [];
  stage.value = "search";
  try {
    searchResults.value = await manager.search(activeSource.value, keyword.value.trim());
    if (searchResults.value.length === 0) error.value = "没有找到匹配的书籍";
    stage.value = "results";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "搜索失败";
    stage.value = "sources";
  } finally {
    isLoading.value = false;
  }
}

// ✦ Detail

async function showDetail(book: BookSearchItem) {
  if (!activeSource.value) return;
  selectedBook.value = book;
  isLoading.value = true;
  error.value = "";
  bookInfo.value = {};
  chapters.value = [];
  stage.value = "detail";
  try {
    const [info, chs] = await Promise.all([
      manager.getBookInfo(activeSource.value, book.bookUrl).catch(() => ({})),
      manager.getChapters(activeSource.value, book.bookUrl),
    ]);
    bookInfo.value = info;
    chapters.value = chs;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "获取信息失败";
  } finally {
    isLoading.value = false;
  }
}

// ✦ Import

async function importBook() {
  if (!activeSource.value || chapters.value.length === 0) return;
  const src = activeSource.value;
  const book = selectedBook.value!;
  importingId.value = book.bookUrl;
  stage.value = "importing";
  importProgress.value = 0;

  try {
    const parts: string[] = [];
    const title = bookInfo.value.name || book.name;
    const author = bookInfo.value.author || book.author;
    const intro = bookInfo.value.intro || "";
    parts.push(`${title}\n${author}\n${"=".repeat(36)}\n`);
    if (intro) parts.push(`\n${intro}\n\n${"=".repeat(36)}\n`);

    for (let i = 0; i < chapters.value.length; i++) {
      const ch = chapters.value[i];
      try {
        const content = await manager.getChapterContent(src, ch.url);
        parts.push(`\n${ch.name}\n${"-".repeat(20)}\n${content || "(内容为空)"}`);
      } catch {
        parts.push(`\n${ch.name}\n${"-".repeat(20)}\n[章节加载失败]\n`);
      }
      importProgress.value = Math.round(((i + 1) / chapters.value.length) * 100);
    }

    const fullText = parts.join("\n");
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const fileName = `${title.replace(/[/<>:"\\|?*]/g, "_").slice(0, 80)}.txt`;
    const file = new File([blob], fileName, { type: "text/plain" });

    const result = await bookshelfStore.addBookFromFile(file);
    if (!result) return;
    uiStore.triggerToast(`《${result.book.title}》已导入 (${chapters.value.length} 章)`);
    goHome();
  } catch (err) {
    uiStore.triggerToast(`导入失败: ${err instanceof Error ? err.message : "未知错误"}`, true);
    stage.value = "detail";
  } finally {
    importingId.value = null;
  }
}

// ✦ Import book source from URL

async function doImportSource() {
  const url = importUrl.value.trim();
  if (!url) return;
  isImporting.value = true;
  try {
    const sources = await manager.importFromUrl(url);
    importedSources.value = await manager.getImported();
    uiStore.triggerToast(`成功导入 ${sources.length} 个书源`);
    importUrl.value = "";
    showImport.value = false;
  } catch (err) {
    uiStore.triggerToast(`导入失败: ${err instanceof Error ? err.message : "未知错误"}`, true);
  } finally {
    isImporting.value = false;
  }
}

// ✦ Import from local file

function handleFileImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  isImporting.value = true;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const sources: LegadoSource[] = JSON.parse(reader.result as string);
      const arr = Array.isArray(sources) ? sources : [sources];
      for (const src of arr) await manager.save(src);
      importedSources.value = await manager.getImported();
      uiStore.triggerToast(`成功导入 ${arr.length} 个书源`);
      showImport.value = false;
    } catch {
      uiStore.triggerToast("无效的书源 JSON 文件", true);
    } finally {
      isImporting.value = false;
    }
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = "";
}

// ✦ Delete

async function deleteSource(src: LegadoSource) {
  await manager.remove(src.bookSourceUrl);
  importedSources.value = importedSources.value.filter(
    (s) => s.bookSourceUrl !== src.bookSourceUrl,
  );
  confirmDeleteUrl.value = null;
}

// ✦ Select source for search

function selectSource(src: LegadoSource) {
  activeSource.value = src;
  keyword.value = "";
  searchResults.value = [];
  error.value = "";
}

// ✦ Navigation

const stageTitle = computed(() => {
  switch (stage.value) {
    case "sources":
      return "书源导入";
    case "search":
      return `搜索: ${keyword.value}`;
    case "results":
      return `搜索: ${keyword.value}`;
    case "detail":
      return selectedBook.value?.name ?? "书籍详情";
    case "importing":
      return "正在导入...";
  }
});

function goHome() {
  stage.value = "sources";
  activeSource.value = null;
  keyword.value = "";
  searchResults.value = [];
  selectedBook.value = null;
  bookInfo.value = {};
  chapters.value = [];
  error.value = "";
}

function goBack() {
  if (stage.value === "results") goHome();
  else if (stage.value === "detail") {
    stage.value = "results";
    selectedBook.value = null;
  }
}
</script>

<template>
  <ModalPanel :title="stageTitle" body-padding="20px" @close="$emit('close')">
    <template #prefix>
      <button v-if="stage !== 'sources'" class="back-btn" @click="goBack" aria-label="返回">
        <AppIcon name="chevron-left" :size="16" />
      </button>
    </template>
    <!-- ═══════ SOURCE MANAGEMENT ═══════ -->
    <template v-if="stage === 'sources'">
      <!-- Active source picker -->
      <div class="source-section">
        <div class="section-label">选择书源</div>
        <div v-if="!activeSource" class="source-warn">请选择一个书源开始搜索</div>

        <template v-if="builtInSources.length">
          <div class="section-sub">内置书源</div>
          <div
            v-for="src in builtInSources"
            :key="src.bookSourceUrl"
            class="source-card"
            :class="{ active: activeSource?.bookSourceUrl === src.bookSourceUrl }"
            @click="selectSource(src)"
          >
            <div class="source-name">{{ src.bookSourceName }}</div>
            <div class="source-url">{{ src.bookSourceUrl }}</div>
          </div>
        </template>

        <template v-if="importedSources.length">
          <div class="section-sub" style="margin-top: 12px">导入的书源</div>
          <div
            v-for="src in importedSources"
            :key="src.bookSourceUrl"
            class="source-card"
            :class="{ active: activeSource?.bookSourceUrl === src.bookSourceUrl }"
            @click="selectSource(src)"
          >
            <div class="source-row">
              <div class="source-name">{{ src.bookSourceName }}</div>
              <button
                v-if="confirmDeleteUrl === src.bookSourceUrl"
                class="delete-btn"
                @click.stop="deleteSource(src)"
              >
                确认删除
              </button>
              <button
                v-else
                class="delete-btn subtle"
                @click.stop="confirmDeleteUrl = src.bookSourceUrl"
              >
                删除
              </button>
            </div>
            <div class="source-url">{{ src.bookSourceUrl }}</div>
            <div v-if="src.bookSourceGroup" class="source-group">{{ src.bookSourceGroup }}</div>
          </div>
        </template>
      </div>

      <!-- Search bar (shown when a source is selected) -->
      <div v-if="activeSource" class="search-bar">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="输入书名搜索..."
          @keydown.enter="doSearch"
        />
        <button class="search-btn" :disabled="!keyword.trim() || isLoading" @click="doSearch">
          <AppIcon name="search" :size="15" :stroke-width="2.5" />
          搜索
        </button>
      </div>

      <!-- Import controls -->
      <div class="import-section">
        <button class="import-toggle" @click="showImport = !showImport">
          <AppIcon name="plus" :size="14" />
          导入书源
        </button>

        <div v-if="showImport" class="import-panel">
          <div class="import-row">
            <input
              v-model="importUrl"
              class="import-input"
              placeholder="书源 JSON URL（支持 yckceo 等源站）"
              @keydown.enter="doImportSource"
            />
            <button
              class="import-submit"
              :disabled="!importUrl.trim() || isImporting"
              @click="doImportSource"
            >
              导入
            </button>
          </div>
          <div class="import-file-row">
            <label class="file-label">
              从文件导入
              <input type="file" accept=".json" hidden @change="handleFileImport" />
            </label>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════ LOADING ═══════ -->
    <LoadingSpinner v-if="isLoading" size="md" label="正在获取数据..." block />

    <!-- ═══════ SEARCH RESULTS ═══════ -->
    <template v-if="stage === 'results' && !isLoading">
      <p v-if="error" class="error-msg">{{ error }}</p>
      <div v-else class="book-list">
        <div
          v-for="book in searchResults"
          :key="book.bookUrl"
          class="book-row"
          @click="showDetail(book)"
        >
          <div class="book-cover-thumb">
            <img
              v-if="book.coverUrl"
              :src="book.coverUrl"
              :alt="book.name"
              class="thumb-img"
              @error="book.coverUrl = undefined"
            />
            <span v-else class="thumb-placeholder">{{ book.name.charAt(0) }}</span>
          </div>
          <div class="book-meta">
            <span class="book-title">{{ book.name }}</span>
            <span class="book-author">{{ book.author || "未知作者" }}</span>
          </div>
          <AppIcon name="chevron-right" class="chevron" :size="14" />
        </div>
      </div>
    </template>

    <!-- ═══════ BOOK DETAIL ═══════ -->
    <template v-if="stage === 'detail' && !isLoading">
      <p v-if="error" class="error-msg">{{ error }}</p>
      <template v-else>
        <div class="book-detail-header">
          <div class="detail-cover">
            <img
              v-if="bookInfo.coverUrl || selectedBook?.coverUrl"
              :src="bookInfo.coverUrl || selectedBook!.coverUrl"
              :alt="selectedBook?.name"
              @error="(e: any) => (e.target.style.display = 'none')"
            />
            <span v-else class="detail-placeholder">{{ selectedBook?.name.charAt(0) }}</span>
          </div>
          <div class="detail-meta">
            <h3>{{ bookInfo.name || selectedBook?.name }}</h3>
            <p class="detail-author">
              {{ bookInfo.author || selectedBook?.author || "未知作者" }}
            </p>
            <p v-if="bookInfo.kind" class="detail-kind">{{ bookInfo.kind }}</p>
            <button class="import-btn" :disabled="chapters.length === 0" @click="importBook">
              导入全部 ({{ chapters.length }} 章)
            </button>
          </div>
        </div>
        <p v-if="bookInfo.intro" class="detail-intro">{{ bookInfo.intro }}</p>
        <div class="chapter-list">
          <div v-for="(ch, i) in chapters" :key="i" class="chapter-item">
            <span class="chapter-index">{{ i + 1 }}</span>
            <span class="chapter-name">{{ ch.name }}</span>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══════ IMPORTING ═══════ -->
    <div v-if="stage === 'importing'" class="importing-state">
      <LoadingSpinner size="md" bare />
      <p>正在下载并导入...</p>
      <div class="progress-bar">
        <ProgressBar :value="importProgress" size="md" />
      </div>
      <p class="import-hint">{{ importProgress }}% · {{ chapters.length }} 章</p>
    </div>
  </ModalPanel>
</template>

<style scoped>
.back-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
}

.back-btn:hover {
  color: var(--reader-text);
  background: var(--hover-bg);
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.section-sub {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.source-warn {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.source-section {
  margin-bottom: 16px;
}

.source-card {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  margin-bottom: 4px;
  cursor: pointer;
  transition: all 120ms;
}

.source-card:hover {
  background: var(--hover-bg);
  border-color: var(--accent);
}

.source-card.active {
  border-color: var(--accent);
  background: var(--accent-soft, #eef2ff);
}

.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-name {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.source-url {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.source-group {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-block;
  margin-top: 4px;
}

/* Search */
.search-bar {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--reader-text);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

/* Import */
.import-section {
  margin-top: 20px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

.import-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px dashed var(--border);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  width: 100%;
  justify-content: center;
  font-family: var(--font-ui);
}

.import-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.import-panel {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.import-row {
  display: flex;
  gap: 6px;
}

.import-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--reader-text);
}

.import-input:focus {
  outline: none;
  border-color: var(--accent);
}

.import-submit {
  padding: 8px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.import-submit:disabled {
  opacity: 0.5;
}

.file-label {
  display: inline-block;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.file-label:hover {
  border-color: var(--accent);
}

/* Delete */
.delete-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  background: #fee2e2;
  color: #dc2626;
  white-space: nowrap;
}

.delete-btn.subtle {
  background: transparent;
  color: var(--text-secondary);
}

.delete-btn.subtle:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* Loading */
.importing-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  gap: 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.import-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.progress-bar {
  width: 200px;
  height: 6px;
}

.error-msg {
  color: #dc2626;
  font-size: 13px;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
}

.book-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.book-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 120ms;
}

.book-row:hover {
  background: var(--hover-bg);
}

.book-cover-thumb {
  width: 36px;
  height: 48px;
  border-radius: 5px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.book-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.book-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-author {
  font-size: 12px;
  color: var(--text-secondary);
}

.chevron {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.book-detail-header {
  display: flex;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-cover {
  width: 80px;
  height: 106px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-placeholder {
  font-size: 28px;
  font-weight: 600;
  color: #fff;
}

.detail-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
}

.detail-meta h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.detail-author {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-kind {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
  align-self: flex-start;
}

.detail-intro {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 16px;
}

.import-btn {
  margin-top: 8px;
  padding: 8px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  align-self: flex-start;
}

.import-btn:disabled {
  opacity: 0.5;
}

.import-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  overflow-y: auto;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
}

.chapter-item:nth-child(odd) {
  background: var(--bg-secondary);
}

.chapter-index {
  color: var(--text-secondary);
  font-size: 11px;
  width: 28px;
  text-align: right;
  flex-shrink: 0;
}

.chapter-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
