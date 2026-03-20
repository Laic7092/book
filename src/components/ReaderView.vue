<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { readerCore } from "../core/reader";
import { searchInBook, highlightMatches, removeHighlights } from "../search/engine";
import ReaderModal from "./ReaderModal.vue";
import * as booksStore from "../storage/books";
import type {
  Bookmark,
  SearchResult,
  ReaderSettings,
  Chapter,
  Book,
  BookReadingStats,
} from "../core/types";

// Touch gesture support
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;
// Cooldown timers to prevent rapid repeated triggers
let pageChangeCooldown = false;
const PAGE_CHANGE_COOLDOWN_MS = 300;

function handleTouchStart(e: TouchEvent) {
  // Ignore touch events inside modals
  const target = e.target as HTMLElement;
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) {
    return;
  }
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e: TouchEvent) {
  // Ignore touch events inside modals
  const target = e.target as HTMLElement;
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) {
    return;
  }

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;

  // Check if this is a significant swipe gesture
  const isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD;
  const isVerticalSwipe = Math.abs(diffY) > SWIPE_THRESHOLD;

  if (activeModal.value) {
    // Only close modal if there's a swipe gesture, not on simple tap
    if (isHorizontalSwipe || isVerticalSwipe) {
      closeModal();
    }
    return;
  }

  // In pagination mode, horizontal swipe changes pages
  if (isPaginationMode.value) {
    if (isHorizontalSwipe) {
      // Prevent rapid repeated swipes
      if (pageChangeCooldown) return;

      if (diffX > 0) {
        prevPage();
      } else {
        nextPage();
      }
      return;
    }
  }
  // Vertical mode: no swipe gestures for chapter navigation
  // Horizontal swipes are ignored to allow comfortable reading
}

const props = defineProps<{
  book: Book;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const chapters = ref<Chapter[]>([]);
const currentChapterId = ref<string | null>(null);
const content = ref("");
const bookmarks = ref<Bookmark[]>([]);
const settings = reactive<ReaderSettings>({
  fontSize: 18,
  fontFamily: "Literata, Georgia, serif",
  lineHeight: 1.6,
  theme: "light",
  margin: 24,
  columnWidth: 720,
  letterSpacing: 0,
  paragraphSpacing: 1.2,
  textAlign: "left",
  contrast: "normal",
  scrollMode: "vertical",
  paginationAnimation: "slide",
});
const searchResults = ref<SearchResult[]>([]);
const searchQuery = ref("");
const readingProgress = ref(0);
const isTransitioning = ref(false);
const currentChapterTitle = ref("");
const chapterProgress = ref(0);
const hasHighlights = ref(false);
const currentResultIndex = ref(-1);

// Bookmark editing
const showBookmarkEditor = ref(false);
const editingBookmark = ref<Bookmark | null>(null);

const showControls = ref(false);
const activeModal = ref<"toc" | "search" | "bookmarks" | "settings" | "stats" | null>(null);
const stats = ref<BookReadingStats | null>(null);
let hideControlsTimer: number | null = null;
let saveProgressTimer: number | null = null;

// Pagination mode state
const pages = ref<string[]>([]);
const currentPage = ref(0);
const isPaginating = ref(false);
const containerHeight = ref(0);
const chapterContents = ref<Map<string, string>>(new Map());
// Track last page position to restore after recalculating pages
const lastPageRatio = ref(0);

// Vertical scrolling with multi-chapter preloading
const loadedChapters = ref<Set<string>>(new Set());
const visibleChapterIndex = ref(0);
const isLoadingAdjacent = ref(false);
const PRELOAD_DISTANCE = 2; // Number of chapters to keep loaded ahead/behind

// Computed property for scroll mode
const isPaginationMode = computed(() => (settings.scrollMode || "vertical") === "pagination");

// Computed property for animation class
const paginationAnimationClass = computed(() => {
  const anim = settings.paginationAnimation || "slide";
  return `pagination-${anim}`;
});

function resetHideTimer() {
  showControls.value = true;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  hideControlsTimer = window.setTimeout(() => {
    if (!activeModal.value) {
      showControls.value = false;
    }
  }, 3000);
}

// Set page change cooldown to prevent rapid repeated triggers
function setPageChangeCooldown() {
  if (pageChangeCooldown) return;
  pageChangeCooldown = true;
  setTimeout(() => {
    pageChangeCooldown = false;
  }, PAGE_CHANGE_COOLDOWN_MS);
}

function toggleControls() {
  if (showControls.value && !activeModal.value) {
    // Hide controls if currently visible
    showControls.value = false;
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
  } else {
    // Show controls
    resetHideTimer();
  }
}

function handleTap(e: MouseEvent) {
  const target = e.target as HTMLElement;

  // Ignore clicks inside modals
  if (target.closest(".modal-overlay") || target.closest(".modal-content")) return;

  if (activeModal.value) {
    closeModal();
    return;
  }

  // In pagination mode, tap zones control page navigation
  if (isPaginationMode.value) {
    const x = e.clientX;
    const width = window.innerWidth;
    const leftZone = width * 0.3;
    const rightZone = width * 0.7;

    if (x < leftZone) {
      // Prevent rapid repeated taps
      if (!pageChangeCooldown) {
        prevPage();
      }
    } else if (x > rightZone) {
      // Prevent rapid repeated taps
      if (!pageChangeCooldown) {
        nextPage();
      }
    } else {
      toggleControls();
    }
    return;
  }

  // Vertical mode: tap anywhere to toggle controls (no chapter switching)
  toggleControls();
}

function openModal(type: typeof activeModal.value) {
  activeModal.value = type;
  showControls.value = true;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
}

function closeModal() {
  activeModal.value = null;
  resetHideTimer();
}

async function selectChapter(chapterId: string) {
  isTransitioning.value = true;
  try {
    await readerCore.goToChapter(chapterId);
    // Save progress immediately on chapter switch
    await readerCore.updateProgress(0, 0);
    closeModal();

    // In vertical mode, scroll to the chapter heading
    if (!isPaginationMode.value) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const chapterEl = document.querySelector(
            `[data-chapter-id="${chapterId}"]`,
          ) as HTMLElement;
          if (chapterEl) {
            const main = document.querySelector(".reader-view") as HTMLElement;
            if (main) {
              main.scrollTo({
                top: chapterEl.offsetTop - 20,
                behavior: "smooth",
              });
            }
          }
          isTransitioning.value = false;
        }, 50);
      });
    } else {
      // Allow content to render before fading in for pagination mode
      requestAnimationFrame(() => {
        setTimeout(() => {
          isTransitioning.value = false;
        }, 50);
      });
    }
  } catch {
    // Error handled silently
  }
}

async function prevChapter() {
  const currentIndex = chapters.value.findIndex((c) => c.id === currentChapterId.value);
  if (currentIndex > 0) {
    await selectChapter(chapters.value[currentIndex - 1].id);
  }
}

async function nextChapter() {
  const currentIndex = chapters.value.findIndex((c) => c.id === currentChapterId.value);
  if (currentIndex < chapters.value.length - 1) {
    await selectChapter(chapters.value[currentIndex + 1].id);
  }
}

// Pagination functions
// Based on first principles:
// 1. Measure content height in a container with the same width/font as the actual display
// 2. Split content into pages where each page fits within the available height
// 3. Keep block elements together when possible
function calculatePages(contentHtml: string): string[] {
  const pageContents: string[] = [];

  // Calculate available height for content
  const headerHeight = 60;
  const footerHeight = 60;
  let pageHeight = containerHeight.value;

  // If containerHeight hasn't been set, calculate it now
  if (!pageHeight || pageHeight <= 0) {
    pageHeight = window.innerHeight - headerHeight - footerHeight;
  }

  // Fallback: if pageHeight is still invalid, use a reasonable default
  if (!pageHeight || pageHeight <= 0) {
    pageHeight = 600;
  }

  // Create a temporary container for measurement with exact same styles as actual content
  const tempContainer = document.createElement("div");
  tempContainer.className = "reader-content pagination-content temp-measure";
  tempContainer.style.visibility = "hidden";
  tempContainer.style.position = "absolute";
  tempContainer.style.width = `${settings.columnWidth}px`;
  tempContainer.style.padding = `${settings.margin}px`;
  tempContainer.style.fontSize = `${settings.fontSize}px`;
  tempContainer.style.fontFamily = settings.fontFamily;
  tempContainer.style.lineHeight = String(settings.lineHeight);
  tempContainer.style.left = "-9999px";
  tempContainer.style.top = "0";

  // Add to DOM for accurate measurement
  document.body.appendChild(tempContainer);

  // Simple approach: split by HTML tags and measure incrementally
  // This preserves HTML structure while allowing page breaks

  // First, try to render all content and measure
  tempContainer.innerHTML = contentHtml;
  const totalHeight = tempContainer.scrollHeight;

  // If all content fits in one page, return as-is
  if (totalHeight <= pageHeight) {
    document.body.removeChild(tempContainer);
    console.log("[calculatePages] Content fits in one page");
    return [contentHtml];
  }

  // Need to paginate: split by block elements
  const blockTags = [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "blockquote",
    "pre",
    "figure",
    "figcaption",
    "table",
    "hr",
    "ul",
    "ol",
  ];

  // Parse HTML and extract block elements
  const wrapper = document.createElement("div");
  wrapper.innerHTML = contentHtml;

  const blocks: { html: string; height: number }[] = [];

  // Get direct children (block elements)
  const children = Array.from(wrapper.children);

  for (const child of children) {
    const html = (child as HTMLElement).outerHTML;
    tempContainer.innerHTML = html;
    const height = tempContainer.scrollHeight;
    blocks.push({ html, height });
  }

  // Now paginate: accumulate blocks until height exceeds page
  let currentPageBlocks: string[] = [];
  let currentHeight = 0;

  for (const block of blocks) {
    // If single block is taller than page, it gets its own page
    if (block.height > pageHeight) {
      // Flush current page
      if (currentPageBlocks.length > 0) {
        pageContents.push(currentPageBlocks.join(""));
        currentPageBlocks = [];
        currentHeight = 0;
      }
      // Tall block on its own page
      pageContents.push(block.html);
      continue;
    }

    // Check if adding this block exceeds page height
    if (currentHeight + block.height > pageHeight && currentPageBlocks.length > 0) {
      // Start new page
      pageContents.push(currentPageBlocks.join(""));
      currentPageBlocks = [block.html];
      currentHeight = block.height;
    } else {
      // Add to current page
      currentPageBlocks.push(block.html);
      currentHeight += block.height;
    }
  }

  // Flush remaining content
  if (currentPageBlocks.length > 0) {
    pageContents.push(currentPageBlocks.join(""));
  }

  // Clean up
  document.body.removeChild(tempContainer);

  return pageContents.length > 0 ? pageContents : [contentHtml];
}

async function goToPage(pageIndex: number) {
  if (pageIndex < 0 || pageIndex >= pages.value.length) return;
  if (pageChangeCooldown) return;

  isPaginating.value = true;
  currentPage.value = pageIndex;
  setPageChangeCooldown();

  // Update progress based on page position
  const totalProgress =
    (currentChapterIndex.value / chapters.value.length +
      pageIndex / pages.value.length / chapters.value.length) *
    100;
  readingProgress.value = totalProgress;

  await nextTick();
  setTimeout(() => {
    isPaginating.value = false;
  }, 300);
}

async function nextPage() {
  if (pageChangeCooldown) return;

  if (currentPage.value < pages.value.length - 1) {
    goToPage(currentPage.value + 1);
  } else {
    // Last page, go to next chapter and reset to first page
    const currentIndex = currentChapterIndex.value;
    if (currentIndex < chapters.value.length - 1) {
      await selectChapter(chapters.value[currentIndex + 1].id);
      // Reset to first page of new chapter
      currentPage.value = 0;
    }
  }
}

async function prevPage() {
  if (pageChangeCooldown) return;

  if (currentPage.value > 0) {
    goToPage(currentPage.value - 1);
  } else {
    // First page, go to previous chapter and start from last page
    const currentIndex = currentChapterIndex.value;
    if (currentIndex > 0) {
      await selectChapter(chapters.value[currentIndex - 1].id);
      // Will need to go to last page of previous chapter after pages are recalculated
      await nextTick();
      currentPage.value = pages.value.length - 1;
    }
  }
}

async function doSearch() {
  if (!searchQuery.value) return;
  searchResults.value = await searchInBook(props.book.id, searchQuery.value, chapters.value);
}

async function loadStats() {
  stats.value = await readerCore.getReadingStats(props.book.id);
}

// Watch for modal changes to load stats when opened
watch(
  () => activeModal.value,
  async (newVal) => {
    if (newVal === "stats") {
      await loadStats();
    }
  },
);

async function goToSearchResult(result: SearchResult) {
  const index = searchResults.value.findIndex(
    (r) => r.chapterId === result.chapterId && r.position === result.position,
  );
  currentResultIndex.value = index >= 0 ? index : 0;
  await selectChapter(result.chapterId);
  requestAnimationFrame(() => {
    setTimeout(() => {
      const contentEl = document.querySelector(".chapter-body");
      if (!contentEl) return;

      const marks = contentEl.querySelectorAll("mark.search-mark");
      const mark = marks[currentResultIndex.value] as HTMLElement;
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  });
}

function clearHighlights() {
  const contentEl = document.querySelector(".chapter-body");
  if (!contentEl) return;

  const marks = contentEl.querySelectorAll("mark.search-mark");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent?.insertBefore(mark.firstChild, mark);
    }
    mark.remove();
  });
  hasHighlights.value = false;
  currentResultIndex.value = -1;
}

async function goToNextMatch() {
  if (searchResults.value.length === 0) return;
  currentResultIndex.value = (currentResultIndex.value + 1) % searchResults.value.length;
  await navigateToMatch(currentResultIndex.value);
}

async function goToPreviousMatch() {
  if (searchResults.value.length === 0) return;
  currentResultIndex.value =
    (currentResultIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
  await navigateToMatch(currentResultIndex.value);
}

async function navigateToMatch(index: number) {
  const result = searchResults.value[index];
  if (!result) return;

  await selectChapter(result.chapterId);

  // Wait for content to render, then scroll to the match
  requestAnimationFrame(() => {
    setTimeout(() => {
      const contentEl = document.querySelector(".chapter-body");
      if (!contentEl) return;

      const marks = contentEl.querySelectorAll("mark.search-mark");
      const mark = marks[index] as HTMLElement;
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.style.backgroundColor = "var(--accent)";
        mark.style.color = "#fff";
        setTimeout(() => {
          mark.style.backgroundColor = "";
          mark.style.color = "";
        }, 1500);
      }
    }, 100);
  });
}

async function addBookmark() {
  const chapter = readerCore.getCurrentChapter();
  if (!chapter) return;
  const article = document.querySelector("article");
  const preview = article?.textContent?.slice(0, 100).replace(/\s+/g, " ").trim() || "";
  await readerCore.addBookmark(
    `Reading position - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    preview,
    getScrollPercentage(),
  );
  closeModal();
}

async function deleteBookmark(bookmarkId: string, e: MouseEvent) {
  e.stopPropagation();
  await readerCore.removeBookmark(bookmarkId);
  bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId);
}

function openBookmarkEditor(bookmark: Bookmark) {
  editingBookmark.value = { ...bookmark };
  showBookmarkEditor.value = true;
}

async function saveBookmarkEdit() {
  if (!editingBookmark.value) return;
  await readerCore.updateBookmark(editingBookmark.value.id, editingBookmark.value);
  // Update local list
  const index = bookmarks.value.findIndex((b) => b.id === editingBookmark.value!.id);
  if (index !== -1) {
    bookmarks.value[index] = editingBookmark.value;
  }
  showBookmarkEditor.value = false;
  editingBookmark.value = null;
}

function getScrollPercentage(): number {
  if (isPaginationMode.value) {
    // For pagination mode, calculate based on current page
    const chapterIndex = chapters.value.findIndex((c) => c.id === currentChapterId.value);
    const totalPagesInChapter = pages.value.length;
    const chapterProgress = totalPagesInChapter > 0 ? currentPage.value / totalPagesInChapter : 0;
    return ((chapterIndex + chapterProgress) / chapters.value.length) * 100;
  }

  // Vertical mode: calculate based on all loaded content
  const main = document.querySelector(".reader-view") as HTMLElement;
  if (!main) return 0;
  const { scrollTop, scrollHeight, clientHeight } = main;

  // Account for the fact that scrollHeight includes all loaded chapters
  if (scrollHeight <= clientHeight) return 0;

  const percentage = (scrollTop / (scrollHeight - clientHeight)) * 100;
  return Math.max(0, Math.min(100, percentage));
}

function handleScroll() {
  if (isPaginationMode.value) return; // Don't handle scroll in pagination mode

  const scrollPercentage = getScrollPercentage();
  readingProgress.value = scrollPercentage;
  chapterProgress.value = scrollPercentage;

  // Check if we need to preload adjacent chapters
  checkPreloadThreshold();

  // Debounced progress saving
  if (saveProgressTimer) clearTimeout(saveProgressTimer);
  saveProgressTimer = window.setTimeout(() => {
    // Save the current visible chapter index and scroll position
    const currentVisibleChapter = getCurrentVisibleChapter();
    if (currentVisibleChapter !== null) {
      readerCore.updateProgress(scrollPercentage, scrollPercentage);
    }
  }, 1000);
}

// Check if user is approaching chapter boundaries and preload
function checkPreloadThreshold() {
  if (isLoadingAdjacent.value) return;

  const main = document.querySelector(".reader-view") as HTMLElement;
  if (!main) return;

  const { scrollTop, scrollHeight, clientHeight } = main;

  // Handle edge case where content doesn't overflow
  if (scrollHeight <= clientHeight) return;

  const scrollProgress = scrollTop / (scrollHeight - clientHeight);

  // Preload next chapter when approaching end (70% scrolled)
  if (scrollProgress > 0.7) {
    loadAdjacentChapters(currentChapterIndex.value + 1);
  }
  // Preload previous chapter when near beginning (30% scrolled)
  else if (scrollProgress < 0.3) {
    loadAdjacentChapters(currentChapterIndex.value - 1);
  }
}

// Load adjacent chapters for seamless scrolling
async function loadAdjacentChapters(targetIndex: number) {
  if (targetIndex < 0 || targetIndex >= chapters.value.length) return;
  if (isLoadingAdjacent.value) return;

  const targetChapter = chapters.value[targetIndex];
  if (!targetChapter || loadedChapters.value.has(targetChapter.id)) return;

  isLoadingAdjacent.value = true;

  try {
    const chapterContent = await booksStore.getChapterContent(props.book.id, targetChapter.id);
    if (chapterContent !== undefined) {
      chapterContents.value.set(targetChapter.id, chapterContent);
      loadedChapters.value.add(targetChapter.id);

      // Also preload the next adjacent chapter
      const nextIndex = targetIndex + (targetIndex > currentChapterIndex.value ? 1 : -1);
      if (nextIndex >= 0 && nextIndex < chapters.value.length) {
        const nextChapter = chapters.value[nextIndex];
        if (nextChapter && !loadedChapters.value.has(nextChapter.id)) {
          const nextContent = await booksStore.getChapterContent(props.book.id, nextChapter.id);
          if (nextContent !== undefined) {
            chapterContents.value.set(nextChapter.id, nextContent);
            loadedChapters.value.add(nextChapter.id);
          }
        }
      }
    }
  } catch (err) {
    console.error("[loadAdjacentChapters] Error loading chapter:", err);
  } finally {
    isLoadingAdjacent.value = false;
  }
}

// Load all chapters initially for vertical scroll mode
async function loadAllChapters() {
  if (isPaginationMode.value) return;

  const currentIndex = currentChapterIndex.value;
  if (currentIndex < 0) return;

  // Load current chapter first
  loadedChapters.value.add(chapters.value[currentIndex].id);

  // Then load all other chapters in order of distance from current chapter
  const indices: number[] = [];
  for (let i = 0; i < chapters.value.length; i++) {
    if (i !== currentIndex) {
      indices.push(i);
    }
  }

  // Sort by distance from current chapter
  indices.sort((a, b) => {
    const distA = Math.abs(a - currentIndex);
    const distB = Math.abs(b - currentIndex);
    return distA - distB;
  });

  // Load chapters with small delay to avoid blocking UI
  for (const idx of indices) {
    const chapter = chapters.value[idx];
    if (chapter && !loadedChapters.value.has(chapter.id)) {
      try {
        const chapterContent = await booksStore.getChapterContent(props.book.id, chapter.id);
        if (chapterContent !== undefined) {
          chapterContents.value.set(chapter.id, chapterContent);
          loadedChapters.value.add(chapter.id);
        }
      } catch (err) {
        console.error("[loadAllChapters] Error loading chapter:", err);
      }
    }
    // Yield to main thread periodically
    if (indices.indexOf(idx) % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

// Get the currently visible chapter index based on scroll position
function getCurrentVisibleChapter(): number {
  if (isPaginationMode.value) return currentChapterIndex.value;

  const main = document.querySelector(".reader-view") as HTMLElement;
  if (!main) return currentChapterIndex.value;

  const { scrollTop, clientHeight } = main;
  const midpoint = scrollTop + clientHeight / 2;

  // Find which chapter container contains the midpoint
  const chapterContainers = main.querySelectorAll(".chapter-container");
  for (let i = 0; i < chapterContainers.length; i++) {
    const container = chapterContainers[i] as HTMLElement;
    const top = container.offsetTop;
    const bottom = top + container.offsetHeight;

    if (midpoint >= top && midpoint < bottom) {
      const chapterId = container.getAttribute("data-chapter-id");
      if (chapterId) {
        return chapters.value.findIndex((c) => c.id === chapterId);
      }
    }
  }

  return currentChapterIndex.value;
}

// Get all loaded chapter contents in order
const allLoadedContent = computed(() => {
  if (isPaginationMode.value) return "";

  const contents: string[] = [];
  for (let i = 0; i < chapters.value.length; i++) {
    const chapter = chapters.value[i];
    if (chapter && loadedChapters.value.has(chapter.id)) {
      const chapterContent = chapterContents.value.get(chapter.id);
      if (chapterContent) {
        contents.push(
          `<div class="chapter-container" data-chapter-id="${chapter.id}">` +
            `<h2 class="chapter-heading">${chapter.title}</h2>` +
            `<div class="chapter-body">${chapterContent}</div>` +
            `</div>`,
        );
      }
    }
  }
  return contents.join("");
});

// Watch for scroll mode changes to trigger chapter loading
watch(
  () => settings.scrollMode,
  (newMode) => {
    if (newMode === "vertical" && chapters.value.length > 0) {
      // Switch to vertical mode, load all chapters
      loadAllChapters();
    }
  },
);

async function updateSettings(newSettings: Partial<ReaderSettings>) {
  Object.assign(settings, newSettings);
  await readerCore.updateSettings(settings);
  updateThemeClass();
  updateCSSVariables();

  // Recalculate pages if switching to pagination mode or changing settings
  if (isPaginationMode.value && content.value) {
    await recalculatePages();
  }
}

async function recalculatePages() {
  if (!content.value) return;

  // Wait for next tick to ensure DOM is ready
  await nextTick();

  // Calculate available height for content
  const headerHeight = 60;
  const footerHeight = 60;
  containerHeight.value = window.innerHeight - headerHeight - footerHeight;

  // Store the current page ratio to restore position after recalculating
  const oldPageCount = pages.value.length;
  const oldPageIndex = currentPage.value;
  if (oldPageCount > 0) {
    lastPageRatio.value = (oldPageIndex + 0.5) / oldPageCount;
  }

  // Calculate pages
  pages.value = calculatePages(content.value);

  // Restore position based on ratio instead of resetting to 0
  if (pages.value.length > 0 && lastPageRatio.value > 0) {
    const newIndex = Math.floor(lastPageRatio.value * pages.value.length);
    currentPage.value = Math.min(newIndex, pages.value.length - 1);
  } else {
    currentPage.value = 0;
  }
}

function updateCSSVariables() {
  const contentEl = document.querySelector(".reader-content") as HTMLElement;
  if (contentEl) {
    contentEl.style.setProperty("--paragraph-spacing", String(settings.paragraphSpacing || 1.2));
  }
}

function updateThemeClass() {
  // Apply theme class to html element so it's accessible globally (including Teleport modals)
  document.documentElement.classList.remove("theme-light", "theme-dark", "theme-sepia");
  document.documentElement.classList.add(`theme-${settings.theme}`);
}

// Current chapter index helper
const currentChapterIndex = computed(() => {
  return chapters.value.findIndex((c) => c.id === currentChapterId.value);
});

// Display content for pagination mode
const displayContent = computed(() => {
  if (isPaginationMode.value) {
    return pages.value[currentPage.value] || "";
  }
  return content.value;
});

// Page info for pagination mode
const pageInfo = computed(() => {
  if (!isPaginationMode.value) return "";
  return `Page ${currentPage.value + 1} / ${pages.value.length}`;
});

onMounted(async () => {
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  readerCore.on("book:loaded", async ({ chapters: chs }) => {
    chapters.value = chs;
    if (chs.length > 0 && !currentChapterId.value) {
      // Restore last reading position
      const progress = await readerCore.getCurrentProgress();
      const chapterId = progress?.chapterId || chs[0].id;
      const scrollPos = progress?.scrollPosition || 0;

      await readerCore.goToChapter(chapterId);

      // Restore scroll position with proper timing
      // Wait for content to render and layout to complete
      setTimeout(() => {
        const main = document.querySelector(".reader-view") as HTMLElement;
        if (main && !isPaginationMode.value) {
          main.scrollTop = scrollPos;
        }
      }, 100);
    }
    // Load bookmarks for current book
    bookmarks.value = await readerCore.getBookmarks();
  });

  readerCore.on("chapter:changed", async ({ chapterId, content: text }) => {
    currentChapterId.value = chapterId;

    // Store chapter content
    chapterContents.value.set(chapterId, text);
    loadedChapters.value.add(chapterId);

    // Apply search highlights if there's an active search
    if (searchQuery.value && searchResults.value.length > 0) {
      content.value = highlightMatches(text, searchQuery.value);
      hasHighlights.value = true;
    } else {
      content.value = text;
    }

    const chapter = chapters.value.find((c) => c.id === chapterId);
    currentChapterTitle.value = chapter?.title || "";

    if (isPaginationMode.value) {
      // Calculate pages for pagination mode
      // Wait for content to be set and DOM to update
      await nextTick();
      await recalculatePages();
    } else {
      readingProgress.value = 0;
      chapterProgress.value = 0;

      // Load all chapters for vertical scroll mode
      // This enables seamless scrolling through the entire book
      loadAllChapters();
    }
  });

  readerCore.on("bookmark:added", ({ bookmark }) => {
    bookmarks.value.push(bookmark);
  });

  readerCore.on("bookmark:removed", ({ bookmarkId }) => {
    bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId);
  });

  readerCore.on("bookmark:updated", ({ bookmark }) => {
    const index = bookmarks.value.findIndex((b) => b.id === bookmark.id);
    if (index !== -1) {
      bookmarks.value[index] = bookmark;
    }
  });

  readerCore.on("settings:changed", ({ settings: newSettings }) => {
    Object.assign(settings, newSettings);
  });

  const result = await readerCore.loadBookById(props.book.id);
  readerCore.getSettings().then((s) => {
    Object.assign(settings, s);
    updateThemeClass();
    updateCSSVariables();
  });

  resetHideTimer();
});

onUnmounted(() => {
  document.removeEventListener("touchstart", handleTouchStart);
  document.removeEventListener("touchend", handleTouchEnd);
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  if (saveProgressTimer) clearTimeout(saveProgressTimer);
});
</script>

<template>
  <div class="reader-view-container" @click="handleTap">
    <!-- Top Bar (floating) -->
    <header class="reader-header" :class="{ visible: showControls }">
      <button class="back-btn" @click.stop="emit('close')" aria-label="Back to library">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="header-center">
        <h1 class="book-title">{{ book.title }}</h1>
        <span v-if="currentChapterTitle" class="chapter-title">{{ currentChapterTitle }}</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click.stop="openModal('settings')" aria-label="Settings">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Progress Bar (refined) -->
    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: `${readingProgress}%` }"></div>
    </div>

    <!-- Reader Content -->
    <main
      class="reader-view"
      @scroll="handleScroll"
      :class="{ 'pagination-mode': isPaginationMode }"
    >
      <!-- Pagination Mode -->
      <article
        v-if="isPaginationMode"
        class="reader-content pagination-content"
        :class="[paginationAnimationClass, { paginating: isPaginating }]"
        :style="{
          maxWidth: `${settings.columnWidth}px`,
          margin: '0 auto',
          padding: `${settings.margin}px`,
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: String(settings.lineHeight),
          letterSpacing: `${settings.letterSpacing || 0}em`,
          textAlign: settings.textAlign || 'left',
        }"
        v-html="displayContent"
      ></article>

      <!-- Vertical Scroll Mode with Multi-Chapter Rendering -->
      <article
        v-else
        class="reader-content vertical-content"
        :class="{ transitioning: isTransitioning }"
        :style="{
          maxWidth: `${settings.columnWidth}px`,
          margin: '0 auto',
          padding: `${settings.margin}px`,
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: String(settings.lineHeight),
          letterSpacing: `${settings.letterSpacing || 0}em`,
          textAlign: settings.textAlign || 'left',
        }"
        v-html="allLoadedContent"
      ></article>
    </main>

    <!-- Bottom Bar (floating) -->
    <footer class="reader-footer" :class="{ visible: showControls }">
      <!-- Search Navigation (shown only when highlights are active) -->
      <template v-if="hasHighlights && searchResults.length > 0">
        <button
          class="footer-btn"
          @click.stop="goToPreviousMatch"
          aria-label="Previous match"
          title="Previous match"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div class="progress-info" style="min-width: 60px">
          <span class="progress-text">{{ currentResultIndex + 1 }}/{{ searchResults.length }}</span>
        </div>
        <button
          class="footer-btn"
          @click.stop="goToNextMatch"
          aria-label="Next match"
          title="Next match"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <button
          class="footer-btn"
          @click.stop="clearHighlights"
          aria-label="Exit search"
          title="Exit search"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </template>

      <!-- Normal Navigation (shown when no highlights) -->
      <template v-else>
        <!-- Pagination Mode Controls -->
        <template v-if="isPaginationMode">
          <button
            class="footer-btn"
            @click.stop="prevPage"
            :disabled="currentPage === 0 && currentChapterIndex === 0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            class="footer-btn icon-btn"
            @click.stop="openModal('stats')"
            aria-label="Statistics"
            title="Reading statistics"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
          </button>
          <button
            class="footer-btn icon-btn"
            @click.stop="openModal('bookmarks')"
            aria-label="Bookmarks"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </button>
          <div class="progress-info" @click.stop="openModal('toc')">
            <span class="progress-text">{{ Math.round(readingProgress) }}%</span>
            <span class="chapter-info">{{ currentChapterTitle || "Chapter 1" }}</span>
          </div>
          <button class="footer-btn icon-btn" @click.stop="openModal('search')" aria-label="Search">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <button
            class="footer-btn"
            @click.stop="nextPage"
            :disabled="
              currentPage === pages.length - 1 && currentChapterIndex === chapters.length - 1
            "
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </template>

        <!-- Vertical Mode Controls -->
        <template v-else>
          <button
            class="footer-btn"
            @click.stop="prevChapter"
            :disabled="chapters.findIndex((c) => c.id === currentChapterId) === 0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            class="footer-btn icon-btn"
            @click.stop="openModal('stats')"
            aria-label="Statistics"
            title="Reading statistics"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
          </button>
          <button
            class="footer-btn icon-btn"
            @click.stop="openModal('bookmarks')"
            aria-label="Bookmarks"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </button>
          <div class="progress-info" @click.stop="openModal('toc')">
            <span class="progress-text">{{ Math.round(readingProgress) }}%</span>
            <span class="chapter-info">{{ currentChapterTitle || "Chapter 1" }}</span>
          </div>
          <button class="footer-btn icon-btn" @click.stop="openModal('search')" aria-label="Search">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <button
            class="footer-btn"
            @click.stop="nextChapter"
            :disabled="chapters.findIndex((c) => c.id === currentChapterId) === chapters.length - 1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </template>
      </template>
    </footer>

    <!-- Pagination Page Indicator (floating pill) -->
    <div
      v-if="isPaginationMode && showControls"
      class="page-indicator"
      :class="{ visible: showControls }"
    >
      <span class="page-number">{{ currentPage + 1 }} / {{ pages.length }}</span>
    </div>

    <ReaderModal
      v-model="activeModal"
      :chapters="chapters"
      :current-chapter-id="currentChapterId"
      :bookmarks="bookmarks"
      :search-results="searchResults"
      :search-query="searchQuery"
      :settings="settings"
      :has-highlights="hasHighlights"
      :show-bookmark-editor="showBookmarkEditor"
      :editing-bookmark="editingBookmark"
      :stats="stats"
      :total-chapters="chapters.length"
      @close="closeModal"
      @select-chapter="selectChapter"
      @update-settings="updateSettings"
      @update:search-query="searchQuery = $event"
      @search="doSearch"
      @go-to-search-result="goToSearchResult"
      @clear-highlights="clearHighlights"
      @add-bookmark="addBookmark"
      @delete-bookmark="deleteBookmark"
      @edit-bookmark="openBookmarkEditor"
      @save-bookmark-edit="saveBookmarkEdit"
      @close-bookmark-editor="
        () => {
          showBookmarkEditor = false;
          editingBookmark = null;
        }
      "
    />
  </div>
</template>

<style scoped>
.reader-view-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--reader-bg);
  color: var(--reader-text);
  transition:
    background-color var(--transition-base),
    color var(--transition-base);
  position: relative;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

/* Header */
.reader-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top, 12px));
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 100;
  opacity: 0;
  transform: translateY(-100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  min-height: 52px;
}

.reader-header.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.header-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 80px);
}

.book-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--reader-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.chapter-title {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.back-btn,
.action-btn {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated, var(--reader-bg));
  cursor: pointer;
  color: var(--reader-text);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 36px;
  min-height: 36px;
  -webkit-tap-highlight-color: transparent;
}

.back-btn:hover,
.action-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

.back-btn:active,
.action-btn:active {
  transform: scale(0.95);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Progress Bar */
.progress-bar-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--progress-track);
  z-index: 101;
  pointer-events: none;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 75%, white) 100%
  );
  transition: width 350ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 1.5px 1.5px 0;
}

/* Reader View */
.reader-view {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--reader-bg);
  scroll-behavior: smooth;
  position: relative;
  -webkit-overflow-scrolling: touch;
}

.reader-view.pagination-mode {
  overflow: hidden;
}

.reader-content {
  min-height: 100%;
  transition:
    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 1;
  transform: translateY(0);
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}

/* Vertical scrolling with multi-chapter */
.vertical-content {
  padding-bottom: 40vh; /* Extra space at bottom for comfortable reading */
}

.chapter-container {
  margin-bottom: 3em;
  scroll-margin-top: 2em;
}

.chapter-container:not(:first-child) .chapter-heading {
  margin-top: 3em;
  padding-top: 2em;
  border-top: 1px solid var(--border-subtle);
}

.chapter-heading {
  font-family: var(--font-display);
  font-size: 1.8em;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--reader-text);
  text-align: center;
  padding-bottom: 1.5em;
  margin-bottom: 1em;
  border-bottom: 1px solid var(--border-subtle);
}

.chapter-body {
  padding-top: 0.5em;
  white-space: break-spaces;
}

.reader-content.transitioning {
  opacity: 0;
  transform: translateY(8px);
}

.reader-content :deep(p) {
  margin-bottom: calc(var(--paragraph-spacing, 1.2) * 1em);
  text-rendering: optimizeLegibility;
}

.reader-content :deep(h1),
.reader-content :deep(h2),
.reader-content :deep(h3),
.reader-content :deep(h4),
.reader-content :deep(h5),
.reader-content :deep(h6) {
  margin-top: 1.8em;
  margin-bottom: 0.8em;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  font-family: var(--font-display);
}

.reader-content :deep(h1) {
  font-size: 1.8em;
}

.reader-content :deep(h2) {
  font-size: 1.5em;
}

.reader-content :deep(h3) {
  font-size: 1.25em;
}

.reader-content :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  border-radius: 8px;
}

.reader-content :deep(blockquote) {
  margin: 1.5em 0;
  padding: 1em 1.5em;
  border-left: 3px solid var(--accent);
  background: var(--hover-bg);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}

.reader-content :deep(code) {
  background: var(--hover-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.reader-content :deep(pre) {
  background: var(--hover-bg);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1.5em 0;
}

.reader-content :deep(ul),
.reader-content :deep(ol) {
  margin-bottom: 1.2em;
  padding-left: 1.5em;
}

.reader-content :deep(li) {
  margin-bottom: 0.5em;
}

/* Pagination Mode Styles */
.pagination-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-height: 100%;
  overflow: hidden;
}

.pagination-content.paginating {
  pointer-events: none;
}

/* Slide animation */
.pagination-slide-enter-active,
.pagination-slide-leave-active {
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pagination-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.pagination-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Flip animation */
.pagination-flip-enter-active,
.pagination-flip-leave-active {
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.pagination-flip-enter-from {
  transform: rotateY(-180deg);
  opacity: 0;
}

.pagination-flip-leave-to {
  transform: rotateY(180deg);
  opacity: 0;
}

.pagination-flip-enter-from,
.pagination-flip-leave-to {
  backface-visibility: hidden;
}

/* Fade animation */
.pagination-fade-enter-active,
.pagination-fade-leave-active {
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pagination-fade-enter-from,
.pagination-fade-leave-to {
  opacity: 0;
}

/* Footer */
.reader-footer {
  position: fixed;
  bottom: 0;
  left: env(safe-area-inset-left, 0);
  right: env(safe-area-inset-right, 0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
  background: var(--header-bg);
  border-top: 1px solid var(--border-subtle);
  z-index: 100;
  opacity: 0;
  transform: translateY(100%);
  transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  min-height: 56px;
}

.reader-footer.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated, var(--reader-bg));
  color: var(--reader-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 40px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.footer-btn.icon-btn {
  padding: 10px 10px;
}

.footer-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--border);
}

.footer-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.footer-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 44px;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}

.progress-info:hover {
  background: var(--hover-bg);
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--reader-text);
  line-height: 1.2;
}

.chapter-info {
  font-size: 11px;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

/* Pagination Page Indicator (floating pill) */
.page-indicator {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--bg-elevated, var(--reader-bg));
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  z-index: 99;
  opacity: 0;
  pointer-events: none;
  transition: all var(--transition-base);
}

.page-indicator.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}

.page-number {
  font-size: 13px;
  font-weight: 600;
  color: var(--reader-text);
  white-space: nowrap;
}

/* Scrollbar Styling */
.reader-view::-webkit-scrollbar {
  width: 7px;
}

.reader-view::-webkit-scrollbar-track {
  background: transparent;
}

.reader-view::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.reader-view::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--border) 70%, var(--reader-text));
}

/* Responsive */
@media (max-width: 768px) {
  .reader-header {
    padding: 10px 12px;
    min-height: 48px;
  }

  .book-title {
    font-size: 14px;
  }

  .chapter-title {
    font-size: 11px;
  }

  .reader-footer {
    padding: 8px 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
    gap: 4px;
    min-height: 52px;
  }

  .footer-btn {
    padding: 8px 10px;
    min-width: 36px;
    min-height: 36px;
  }

  .footer-btn.icon-btn {
    padding: 8px 8px;
  }

  .progress-info {
    padding: 6px 8px;
    min-width: 36px;
  }

  .progress-text {
    font-size: 13px;
  }

  .chapter-info {
    font-size: 10px;
    max-width: 80px;
  }

  /* Optimize touch targets for mobile */
  .back-btn,
  .action-btn,
  .footer-btn,
  .progress-info {
    min-width: 44px;
    min-height: 44px;
  }

  /* Prevent text zoom on double tap */
  .reader-content {
    touch-action: pan-y;
  }

  /* Adjust reader content padding on mobile */
  .reader-content {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  /* Ensure modal body is scrollable on mobile */
  .modal-body {
    -webkit-overflow-scrolling: touch;
  }
}

/* Small phones */
@media (max-width: 380px) {
  .reader-header {
    padding: 8px 10px;
  }

  .book-title {
    font-size: 13px;
  }

  .reader-footer {
    padding: 6px 6px;
    gap: 2px;
  }

  .footer-btn {
    padding: 8px;
    min-width: 34px;
    min-height: 34px;
  }

  .progress-info {
    padding: 4px 6px;
  }

  .progress-text {
    font-size: 12px;
  }

  .chapter-info {
    font-size: 9px;
    max-width: 60px;
  }
}

/* Landscape orientation on mobile */
@media (max-height: 500px) and (orientation: landscape) {
  .reader-header {
    padding: 8px 16px;
    min-height: 44px;
  }

  .reader-footer {
    padding: 6px 12px;
    min-height: 44px;
  }

  .book-title,
  .chapter-title {
    font-size: 12px;
  }
}

/* Safe area insets for notched devices */
@supports (padding: max(0px)) {
  .reader-header {
    padding-left: max(16px, env(safe-area-inset-left, 0));
    padding-right: max(16px, env(safe-area-inset-right, 0));
    padding-top: max(12px, env(safe-area-inset-top, 0));
  }

  .reader-footer {
    padding-left: max(12px, env(safe-area-inset-left, 0));
    padding-right: max(12px, env(safe-area-inset-right, 0));
  }
}
</style>
