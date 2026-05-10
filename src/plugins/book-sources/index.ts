import type { Plugin } from "../types";
import { PLUGIN_BRAND } from "../types";
import { createSourceManager, type SourceManager } from "./sources";

export const loadOn = "bookshelf" as const;

let _manager: SourceManager | null = null;

export function getSourceManager(): SourceManager | null {
  return _manager;
}

export const bookSourcesPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "book-sources",
  name: "书源导入",
  version: "0.1.0",
  canActivate: async () => {
    return false;
    try {
      const res = await fetch("/api/health");
      return res.ok;
    } catch {
      return false;
    }
  },
  activationFailedReason: "需要后端服务（书源通过网络代理获取数据）",
  setup(ctx) {
    _manager = createSourceManager(ctx.server);

    ctx.ui.registerModal("book-sources", () => import("./BookSourcesPanel.vue"));
    ctx.ui.registerBookshelfMenuAction({
      id: "book-sources",
      order: 55,
      label: "书源导入",
      icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M12 11v5"/><path d="M9 14l3 3 3-3"/>',
      modal: "book-sources",
    });
  },
  teardown() {
    _manager = null;
  },
};
