import type { SearchResult } from "./types";

export interface SearchApi {
  searchQuery: string;
  searchResults: SearchResult[];
  hasHighlights: boolean;
  currentResultIndex: number;
  doSearch: () => Promise<void>;
  clearHighlights: () => Promise<void>;
  goToNextMatch: () => number | undefined;
  goToPreviousMatch: () => number | undefined;
  reset: () => void;
}

let instance: SearchApi | null = null;

export function registerSearchApi(api: SearchApi): void {
  instance = api;
}

export function getSearchApi(): SearchApi | null {
  return instance;
}
