import { computed, reactive } from "vue";
import SearchPanel from "./SearchPanel.vue";
import { useReaderSearch } from "./useReaderSearch";
import { useReaderStore } from "../../stores/reader";
import { useSettingsStore } from "../../stores/settings";
import { registerSearchApi } from "../../core/search-api";
import type { Plugin } from "../types";
import type { SearchApi } from "../../core/search-api";

export const searchPlugin: Plugin = {
  id: "search",
  name: "Full-Text Search",
  version: "1.0.0",
  modalComponents: { search: SearchPanel },
  footerActions: [
    {
      id: "search",
      position: "menu",
      label: "Search",
      icon: '<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />',
      modal: "search",
      order: 20,
    },
  ],
  onInit() {
    const readerStore = useReaderStore();
    const settingsStore = useSettingsStore();
    const api = reactive(
      useReaderSearch({
        bookId: computed(() => readerStore.currentBook?.id),
        chapters: computed(() => readerStore.chapters),
        isPaginationMode: computed(() => settingsStore.settings.scrollMode === "pagination"),
      }),
    ) as unknown as SearchApi;
    registerSearchApi(api);
  },
};
