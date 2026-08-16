import { useReaderSearch } from "./useReaderSearch";
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND } from "../../core/plugin-runtime/types";

type SearchApi = ReturnType<typeof useReaderSearch>;

let activeApi: SearchApi | null = null;

export function getSearchApi(): SearchApi | null {
  return activeApi;
}

export const searchPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "search",
  name: "Full-Text Search",
  version: "1.0.0",
  setup(ctx) {
    // Keep the raw refs from useReaderSearch — components use .value in scripts
    // and rely on Vue's template ref unwrapping in markup.
    activeApi = useReaderSearch(ctx.readerSession);

    ctx.ui.registerModal("search", () => import("./SearchPanel.vue"));
    ctx.ui.registerOverlay("search-nav", () => import("./SearchFooterContent.vue"));
    ctx.ui.registerFooterAction({
      id: "search",
      position: "menu",
      label: "Search",
      icon: '<circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />',
      modal: "search",
      order: 20,
    });
  },
};
