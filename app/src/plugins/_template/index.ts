/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  插件模板 (Plugin Template)
 * ─────────────────────────────────────────────────────────────────────────────
 *  新插件请复制本目录, 并遵循 docs/plugin-contract.md:
 *    §二 依赖方向: 不得 import 其他插件; 核心不得 import 本插件
 *    §三 API 版本: apiVersion 缺省视为 1, 与 PLUGIN_API_VERSION 不匹配时 setup 被拒绝
 *    §四 能力面:   稳定面放心用, 权力面 (readerSession / injectIframeStyle /
 *                  registerContentTransformer) 不保证兼容
 *    §五 生命周期:  一切注册走 ctx, 禁用即卸载; 高频事件必须节流
 *  完成后在 plugin-metadata.json 登记 (loadOn: app|bookshelf|reader).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Plugin } from "../../core/plugin-runtime/types";
import { PLUGIN_BRAND, PLUGIN_API_VERSION } from "../../core/plugin-runtime/types";
import { createEntityStore, createSingletonStore } from "../../core/plugin-runtime/store-factory";

export const loadOn = "reader" as const;

/** 插件私有类型与常量只留在本目录, 不导出给外部. */
interface ExampleItem {
  id: string;
  value: number;
}

export const examplePlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "example",
  name: "Example Plugin",
  version: "1.0.0",
  apiVersion: PLUGIN_API_VERSION,
  // 默认禁用优先; 稳定后再在 metadata 里改 defaultEnabled: true
  enabled: false,
  // core: true 仅当"缺它产品不成立" (见契约文档 §一), 且 manager 面板不可禁用

  async setup(ctx, { onTeardown }) {
    // ── 数据层: 响应式实体存储 (替代 Pinia + 手动 storage) ──
    const items = createEntityStore<ExampleItem>(ctx.storage, "example", (i) => i.id);
    const prefs = createSingletonStore<{ lastItemId?: string }>(ctx.storage, "example-prefs");
    await prefs.load();

    // ── 跨插件服务 (契约文档 §二.2) ──
    // 有 API 要给别的插件用时 expose (teardown 时自动移除):
    //   ctx.expose("example:api", { items });
    // 需要别的插件的 API 时 require, 拿不到 (undefined) 必须优雅降级:
    //   const other = ctx.require<{ refresh(): void }>("other:api");

    // ── 事件: 核心 emit, 插件 listen; 返回的 unsub 由 TrackedContext 自动清理 ──
    ctx.events.on("book:opened", ({ bookId }) => {
      void items.add({ id: bookId, value: Date.now() });
    });
    ctx.events.on("scroll:progress", () => {
      // 高频事件 (每帧): 必须节流/防抖后再落盘, 见契约文档 §五.3
    });

    // ── UI: 懒加载组件; 注册即自动清理 ──
    ctx.ui.registerModal("example", () => import("./ExamplePanel.vue"));
    ctx.ui.registerFooterAction({
      id: "example",
      position: "menu",
      label: "Example",
      icon: '<path d="M4 6h16M4 12h16M4 18h10" />',
      modal: "example",
      order: 99,
    });

    // ── 额外清理 (定时器/原生监听器/非 ctx 注册的全局): 必须走 onTeardown ──
    const timer = setInterval(() => {}, 60_000);
    onTeardown(() => clearInterval(timer));
  },
};
