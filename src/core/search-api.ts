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
