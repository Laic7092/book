import { computed, reactive } from "vue";
import SearchPanel from "./SearchPanel.vue";
import { useReaderSearch } from "./useReaderSearch";
import { useReaderStore } from "../../stores/reader";
import { useSettingsStore } from "../../stores/settings";
import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import type { SearchApi } from "../../core/search-api";
import type { ReaderHost } from "../../core/reader-host";

let _readerHost: (() => ReaderHost | null) | null = null;

export function getSearchReaderHost(): ReaderHost | null {
  return _readerHost?.() ?? null;
}

export const searchPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "search",
  name: "Full-Text Search",
  version: "1.0.0",
  setup(ctx) {
    _readerHost = ctx.readerHost;
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();
    const api = reactive(
      useReaderSearch({
        bookId: computed(() => readerStore.currentBook?.id),
        chapters: computed(() => readerStore.chapters),
        isPaginationMode: computed(() => settingsStore.settings.scrollMode === "pagination"),
        readerHost: ctx.readerHost,
      }),
    ) as unknown as SearchApi;
    ctx.capabilities.register("searchApis", api);

    ctx.onCleanup(() => {
      ctx.capabilities.unregister("searchApis", api);
    });

    ctx.ui.registerModal("search", SearchPanel);
    ctx.ui.registerFooterAction({
      id: "search",
      position: "menu",
      label: "Search",
      icon: '<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />',
      modal: "search",
      order: 20,
    });
  },
  teardown() {
    _readerHost = null;
    // Capabilities are auto-cleaned by onCleanup during runCleanup
  },
};
