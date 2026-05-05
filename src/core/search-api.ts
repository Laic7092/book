import type { SearchResult } from "./types";

export interface SearchApi {
  searchQuery: string;
  searchResults: SearchResult[];
  hasHighlights: boolean;
  currentResultIndex: number;
  hasJumpState: boolean;
  doSearch: () => Promise<void>;
  clearHighlights: () => Promise<void>;
  goToNextMatch: () => number | undefined;
  goToPreviousMatch: () => number | undefined;
  navigateToResult: (result: SearchResult) => Promise<void>;
  goBackFromResult: () => Promise<void>;
  reset: () => void;
}
