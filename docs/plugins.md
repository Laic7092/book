# 插件系统文档

## 概述

插件系统是 reader 应用的核心架构，所有解析器（epub/txt/pdf/cbz）和功能（搜索、统计、书签、标注、设置、TTS 等）都以插件形式实现。插件在 `src/plugins/` 下按目录组织，每个插件是一个独立目录，包含 `meta.ts`、`index.ts` 和具体实现文件。

## 核心设计理念

- **延迟加载**：插件按场景（scene）按需加载，避免启动时全部加载
- **依赖注入**：通过 `PluginContext` 向插件注入 storage、events、UI 注册等能力
- **自动清理**：`TrackedContext` 追踪所有注册，teardown 时自动清理
- **松耦合**：插件之间不直接引用，通过 capabilities 和 events 通信
- **核心/普通分离**：`core: true` 的插件不可被用户禁用

---

## 一、插件定义

### Plugin 接口 (`types.ts`)

```ts
interface Plugin {
  [PLUGIN_BRAND]?: true; // 品牌标记，用于 duck-typing 身份校验
  id: string; // 唯一标识，如 "search"、"epub"、"stats"
  name: string; // 显示名，如 "Full-Text Search"
  version: string; // 语义化版本号
  enabled?: boolean; // 初始启用状态，默认 true
  core?: boolean; // 核心插件，不可被用户禁用
  dependsOn?: string[]; // 依赖的其他插件 ID，依赖项先初始化

  // 生命周期钩子
  setup?: (context: PluginContext) => void | Promise<void>;
  teardown?: (context: PluginContext) => void | Promise<void>;
}
```

### meta.ts — 插件元数据（构建时扫描）

每个插件目录下的 `meta.ts` 声明插件的加载场景、名称等元数据。Vite 插件在**构建时**扫描所有 `meta.ts`，生成 `src/plugins/plugin-manifest.ts`，运行时不再做 glob 扫描。

```ts
// 普通插件 meta.ts
export const loadOn = "reader" as const;
export const pluginId = "annotations";
export const name = "Annotations";

// 解析器插件 meta.ts（多场景 + 格式声明）
export const loadOn = ["book-import", "reader"] as const;
export const pluginId = "epub";
export const name = "EPUB Parser";
export const formats = ["epub"]; // ← 标记支持的格式，用于按需加载
```

**字段说明**：

| 字段       | 必填 | 说明                                                                    |
| ---------- | ---- | ----------------------------------------------------------------------- |
| `loadOn`   | ✓    | 场景或场景数组，`"app" \| "book-import" \| "bookshelf" \| "reader"`     |
| `pluginId` | ✓    | 插件唯一标识，与目录名一致                                              |
| `name`     | ✓    | 显示名                                                                  |
| `formats`  | ×    | 解析器插件标记支持的格式（如 `["epub"]`），用于按格式按需加载，见第五节 |

| 场景          | 触发时机   | 插件                                                                                                            |
| ------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `app`         | 应用启动时 | last-book                                                                                                       |
| `book-import` | 导入书籍时 | （已移除，解析器改为按格式按需加载）                                                                            |
| `bookshelf`   | 书架界面   | book-sources, manager, opds                                                                                     |
| `reader`      | 进入阅读器 | 9 个功能插件（annotations, auto-read, bookmarks, progress-bar, reading-progress, search, settings, stats, tts） |

> **注意**：解析器插件（epub, cbz-parser, pdf-parser, txt-parser）不再通过场景加载，而是通过 `loadParserForFormat()` 按格式按需加载，见第五节。

### 构建时插件清单

`vite.config.ts` 内置了 `pluginManifest()` 插件，在构建时扫描所有 `src/plugins/*/meta.ts`，生成 `src/plugins/plugin-manifest.ts`：

```ts
// 自动生成的 plugin-manifest.ts
export interface PluginManifestEntry {
  pluginId: string;
  loadOn: string | string[];
  name: string;
  dir: string;
  formats?: string[]; // 解析器插件特有
}

export const pluginManifest: PluginManifestEntry[] = [
  { pluginId: "annotations", name: "Annotations", loadOn: "reader", dir: "annotations" },
  {
    pluginId: "epub",
    name: "EPUB Parser",
    loadOn: ["book-import", "reader"],
    dir: "epub",
    formats: ["epub"],
  },
  // ...
];
```

运行时 `loader.ts` 和 `PluginsPanel.vue` 直接引用该 manifest，不再做 `import.meta.glob` 运行时扫描。

### index.ts — 插件导出

插件模块的默认导出形式，必须导出 `loadOn`（供 loader 使用）和插件实例：

```ts
export const loadOn = "reader" as const;

export const myPlugin: Plugin = {
  [PLUGIN_BRAND]: true as const,
  id: "...",
  name: "...",
  version: "1.0.0",
  setup(ctx) {
    /* ... */
  },
};
```

---

## 二、PluginContext — 插件可用的全部能力

`PluginContext` 是注入给每个插件的上下文对象，`setup(ctx)` 和 `teardown(ctx)` 都接收它。

### storage — 插件专属存储

```ts
interface PluginStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T, createdAt?: number): Promise<void>;
  getAll<T>(): Promise<T[]>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

- 底层使用 IndexedDB 的 `plugin_store` 表
- key 以 `[pluginId, key]` 复合索引隔离，跨插件不冲突
- 适用于持久化插件自身状态（阅读进度、最后打开的书、设置等）
- 示例：`reading-progress` 插件用 `progressKey(bookId)` 存储每本书的阅读位置

### events — 事件总线

```ts
interface IEventBus<T> {
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): () => void;
  emit<K extends keyof T>(event: K, payload: T[K]): Promise<void>;
}
```

**事件列表：**

| 事件               | 载荷                                        | 触发时机         |
| ------------------ | ------------------------------------------- | ---------------- |
| `book:opened`      | `{ bookId }`                                | 打开书籍         |
| `book:closed`      | `{ bookId, chapterId? }`                    | 关闭书籍         |
| `book:deleted`     | `{ bookId }`                                | 删除书籍         |
| `chapter:changed`  | `{ bookId, chapterId, previousChapterId? }` | 切换章节         |
| `page:changed`     | `{ bookId, chapterId, page, totalPages }`   | 翻页             |
| `settings:changed` | `{ changes }`                               | 设置变更         |
| `content:loaded`   | `{ bookId, chapterId }`                     | 章节内容加载完成 |
| `reader:mounted`   | `{ bookId }`                                | 阅读器挂载完成   |
| `reader:unmounted` | `{ bookId }`                                | 阅读器卸载       |

- `on()` 返回 **取消订阅函数**，TrackedContext 会自动收集并在 teardown 时调用
- 错误隔离：单个 handler 失败不影响其他 handler
- 典型用法：stats 插件监听 `book:opened`/`book:closed` 管理阅读会话；reading-progress 插件监听 `page:changed`/`chapter:changed` 自动保存进度

### ui — UI 注册槽位

```ts
interface UISlots {
  registerModal(name: string, component: Component): void;
  registerOverlay(name: string, component: Component): void;
  registerFooterAction(action: FooterAction): void;
  registerBookshelfWidget(component: Component): void;
  registerToolbarItem(item: ToolbarItem): void;
  registerHeaderAction(action: HeaderAction): void;
  openModal(name: string): void;
  setTheme(theme: string): void;
  injectIframeStyle(id: string, css: string): void;
  removeIframeStyle(id: string): void;
}
```

**各槽位说明：**

| 方法                      | UI 位置              | 示例                                            |
| ------------------------- | -------------------- | ----------------------------------------------- |
| `registerModal`           | 全屏模态面板         | search 面板、stats 面板、settings 面板          |
| `registerOverlay`         | 叠加在内容区上方     | progress-bar、search 导航条、annotation overlay |
| `registerFooterAction`    | 阅读器底部工具栏     | 书签(bar)、搜索(menu)、标注(menu)、统计(menu)   |
| `registerBookshelfWidget` | 书架页面             | StatsBar                                        |
| `registerToolbarItem`     | 阅读器右侧边缘工具栏 | auto-read 控件、TTS 控件                        |
| `registerHeaderAction`    | 阅读器顶部标题栏     | settings 齿轮按钮                               |

- `FooterAction.position`：`"bar"` 直接显示在底部栏，`"menu"` 折叠在更多菜单中
- `FooterAction.order` / `ToolbarItem.order` / `HeaderAction.order`：排序权重，升序排列
- TrackedContext 会自动清理：teardown 时移除注册的 modal、overlay、action、widget 等

### capabilities — 动态能力注册

```ts
interface CapabilityMap {
  parsers: BookParser[];
  searchApis: SearchApi[];
}
```

- `parsers`：解析器插件（epub/txt/cbz/pdf）注册 `BookParser` 实例
- `searchApis`：search 插件注册 `SearchApi` 实例（reactive 对象）
- TrackedContext 在 cleanup 时自动 `unregister`

### readerHost — 阅读器桥接

```ts
readerHost: () => ReaderHost | null;
```

返回当前 ReaderView 的 `ReaderHost` 实例（单例），书籍未打开时返回 `null`。

**ReaderHost 暴露的能力：**

| 类别     | 方法                               | 说明                          |
| -------- | ---------------------------------- | ----------------------------- |
| 文档访问 | `getDocument()`                    | 获取阅读器 iframe 的 Document |
| 导航     | `navigateToChapter(id, page?)`     | 跳转到指定章节/页码           |
|          | `navigateToCfi(cfi, chapterId)`    | 跳转到 CFI 位置               |
| 状态查询 | `getCurrentChapter()`              | 当前章节对象                  |
|          | `getChapters()`                    | 全部章节列表                  |
|          | `getCurrentBookId()`               | 当前书籍 ID                   |
|          | `isPaginationMode`                 | 是否为分页模式（ComputedRef） |
| 渲染控制 | `setScrollMode(mode)`              | 切换滚动/分页模式             |
|          | `setPageMargin(margin)`            | 设置页面边距                  |
| 分页状态 | `getCurrentPage()`                 | 当前页码                      |
|          | `getTotalPages()`                  | 总页数                        |
|          | `goToPage(page)`                   | 跳转到指定页                  |
|          | `nextPage()`                       | 下一页/下一章                 |
| 内容管道 | `getChapterContent(id)`            | 获取章节 HTML                 |
|          | `getCurrentChapterRawHtml()`       | 当前章节原始 HTML             |
| 其他     | `openModal(name)` / `closeModal()` | 模态控制                      |
|          | `pushToHistory(chapterId, page)`   | 推入导航历史                  |
|          | `onReady(cb)`                      | 阅读器就绪回调                |
|          | `onChapterChange(handler)`         | 章节切换回调                  |
|          | `registerCleanup(fn)`              | 注册清理函数                  |

### 其他上下文成员

| 成员                         | 类型                                       | 说明                                    |
| ---------------------------- | ------------------------------------------ | --------------------------------------- |
| `pinia`                      | `Pinia`                                    | Pinia 实例，用于在插件内创建/使用 store |
| `registerContentTransformer` | `(t: ContentTransformer) => void`          | 注册内容转换器，TrackedContext 自动清理 |
| `navigate`                   | `(url: string, replace?: boolean) => void` | Vue Router 导航                         |
| `onCleanup`                  | `(fn: () => void) => void`                 | 手动注册清理回调（TrackedContext 特有） |

---

## 三、内容转换器 (ContentTransformer)

```ts
interface ContentTransformer {
  id: string;
  priority: number; // 越小越先执行，默认 100
  transform(html: string, ctx: { bookId: string; chapterId: string }): string | Promise<string>;
}
```

- 在章节 HTML 渲染到 iframe **之前**按 priority 排序执行
- 通过 `ctx.registerContentTransformer()` 注册
- 单个 transformer 失败不影响其他

---

## 四、加载流程

### 1. 构建时扫描 → 运行时 manifest

Vite 插件 `pluginManifest()` 在构建时扫描所有 `src/plugins/*/meta.ts`，生成 `plugin-manifest.ts`。`loader.ts` 直接 import 该 manifest，不做运行时 glob。

```ts
// loader.ts
import { pluginManifest } from "./plugin-manifest";
const pluginLoaders = import.meta.glob("./*/index.ts"); // 仅对 index.ts 做懒加载
```

### 2. 场景触发 + 统一 stub 注册

```ts
await loadPluginsFor("reader");
```

`ensureSceneMap()` 的执行流程：

1. 从 `getAllPluginStates()` 读取所有插件的启用/禁用状态（来自 manager 插件的 entity store）
2. 遍历 manifest 中的每个插件，**先全部注册一个 stub**（含 id、name、enabled 状态），保证插件面板立即可见
3. 对**已禁用的插件**跳过场景加载，保留 loader 以备启用时升级
4. 对**解析器插件**跳过场景加载（改为通过 `loadParserForFormat()` 按格式加载）
5. 其余插件按 `loadOn` 分配到场景任务队列

场景触发时：

```ts
loadPluginsFor("reader");
```

- 每个场景只加载一次（`loaded` Set 去重）
- 场景内所有非解析器插件**并行加载**
- 加载顺序：`import index.ts` → `registerPlugin(真实插件)` → `loadPluginStates()` → `initializePlugins()`

### 3. 解析器按需加载

解析器不再通过场景加载，而是通过 `loadParserForFormat(format)` 按格式按需加载：

```ts
// reader.ts — 打开书籍时只加载匹配的解析器
await loadParserForFormat(book.format); // 如 "epub"
const parser = getParserForFormat(book.format);

// 导入书籍时同理
const format = file.name.split(".").pop()?.toLowerCase();
if (format) await loadParserForFormat(format);
```

这样做避免了打开 `.epub` 时加载 cbz/pdf/txt 解析器（含 pdfjs-dist 等重型依赖）。

### 3. 初始化

`initializePlugins()` 执行：

1. **依赖解析**（Kahn 算法拓扑排序）
   - 检测缺失依赖 → 警告
   - 检测循环依赖 → 警告
   - 同级按字母序确保确定性
2. **跳过已初始化的插件**（幂等）
3. **按拓扑序依次 setup**
   - 检查依赖是否全部启用且无错误，否则跳过
   - 调用 `setupPluginInternal(id)` → 创建 `TrackedContext` → 调用 `plugin.setup(ctx)`
4. **递增 `pluginStateVersion`** 触发 UI 反应式更新

### 4. 启用/禁用

`setPluginEnabled(id, on)`：

- **核心插件**不可禁用
- **启用**：检查依赖是否全部可用 → `setupPlugin(id)` → 更新状态 → 持久化
- **禁用**：检查是否有其他插件依赖它 → `teardownPlugin(id)` → 更新状态 → 持久化
- 持久化通过 `manager/plugin-states.ts` 中的 `createEntityStore`，写入 IndexedDB `plugin_store` 表（`["manager", "plugin-state:<id>"]`）

---

## 五、生命周期

```
registerPlugin()  →  [禁用状态持久化恢复]
                         ↓
                    initializePlugins()
                         ↓
              resolveDepGraph() (Kahn 拓扑排序)
                         ↓
              createTrackedContext(id, bootstrap)
                         ↓
                 plugin.setup(ctx)     ← ctx 中所有注册被追踪
                         ↓
          ┌──────── 运行中 ─────────┐
          │  events.on / storage     │
          │  capabilities.register   │
          │  ui.register*            │
          │  registerContentTransformer │
          └──────────────────────────┘
                         ↓
              setPluginEnabled(id, false)
              或 插件所在的 scene 卸载
                         ↓
                 plugin.teardown(ctx)
                         ↓
               ctx.runCleanup()
               ├── 事件取消订阅
               ├── UI 注销 (modal/overlay/action/widget)
               ├── Capability 注销
               ├── ContentTransformer 注销
               ├── iframe style 移除
               └── 用户注册的 onCleanup 回调
```

---

## 六、TrackedContext vs 原始 PluginContext

`createPluginContext()` 返回**原始上下文**（用于测试/一次性使用），不做任何追踪。

`createTrackedContext()` 是生产环境使用的版本，**自动追踪**所有注册并支持批量清理：

| 追踪项                         | 追踪方式                            |
| ------------------------------ | ----------------------------------- |
| `events.on()`                  | 收集取消订阅函数到 `eventUnsubs[]`  |
| `ui.register*()`               | 注册时记录清理函数到 `cleanupFns[]` |
| `capabilities.register()`      | 记录到 `registeredCapKeys[]`        |
| `registerContentTransformer()` | 记录到 `trackedTransformers[]`      |
| `ui.injectIframeStyle()`       | 记录到 `injectedStyles[]`           |
| `onCleanup(fn)`                | 追加到 `cleanupFns[]`               |

`runCleanup()` 按顺序执行所有清理（均用 `Promise.allSettled` 错误隔离），最后重置所有内部状态。

---

## 七、插件实现模式

### 模式 1：解析器插件

注册 `BookParser` 实例到 `capabilities.parsers`。

```ts
// epub/index.ts
const parser = new EpubParser();
export const epubPlugin: Plugin = {
  id: "epub",
  core: true,
  setup(ctx) {
    ctx.capabilities.register("parsers", parser);
  },
  teardown(ctx) {
    ctx.capabilities.unregister("parsers", parser);
  },
};
```

### 模式 2：功能面板插件

注册 modal + footer action，通过 Pinia store 管理状态。

```ts
// bookmarks/index.ts
export const bookmarksPlugin: Plugin = {
  id: "bookmarks",
  setup(ctx) {
    setBookmarksAdapter(ctx.storage);
    setReaderHost(ctx.readerHost);
    store = useBookmarksStore(ctx.pinia);

    ctx.events.on("book:opened", ({ bookId }) => store?.loadBookmarks(bookId));

    ctx.ui.registerModal("bookmarks", BookmarksPanel);
    ctx.ui.registerFooterAction({
      id: "bookmarks",
      position: "bar",
      label: "Bookmarks",
      icon: "...",
      modal: "bookmarks",
      order: 10,
    });
  },
  teardown() {
    setBookmarksAdapter(null);
    setReaderHost(null);
    store = null;
  },
};
```

### 模式 3：工具栏插件

注册 toolbar item（阅读器右侧边缘按钮）。

```ts
// auto-read/index.ts
export const autoReadPlugin: Plugin = {
  id: "auto-read",
  setup(ctx) {
    _host = ctx.readerHost;
    ctx.ui.registerToolbarItem({ id: "auto-read", order: 10, component: AutoReadControls });
  },
};
```

### 模式 4：后台服务插件

不注册 UI，纯事件驱动 + storage 持久化。

```ts
// reading-progress/index.ts
export const readingProgressPlugin: Plugin = {
  id: "reading-progress",
  setup(ctx) {
    ctx.events.on("reader:mounted", async ({ bookId }) => {
      await restore(bookId);
      // 订阅保存事件
    });
    ctx.events.on("page:changed", ({ bookId }) => {
      void save(bookId);
    });
    ctx.events.on("chapter:changed", ({ bookId }) => {
      void save(bookId);
    });
  },
};
```

### 模式 5：设置驱动插件

通过 watch 响应设置变化，同步到 readerHost 和 iframe CSS。

```ts
// settings/index.ts
import { createEntityStore } from "../store-factory";

// 用一个 entity 存储整个设置对象
type SettingsEntity = { id: string } & ReaderSettings;
const ENTITY_ID = "reader-settings";

export const settingsPlugin: Plugin = {
  id: "settings",
  async setup(ctx) {
    const store = createEntityStore<SettingsEntity>(ctx.storage, "setting");
    // 从 IndexedDB 加载已有设置
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => store.loaded.value,
        (v) => {
          if (v) {
            stop();
            resolve();
          }
        },
      );
    });
    const cached = store.getById(ENTITY_ID);
    const settings = ref<ReaderSettings>(
      cached ? { ...DEFAULT_SETTINGS, ...omitId(cached) } : { ...DEFAULT_SETTINGS },
    );

    // 监听 reader 挂载事件同步设置
    ctx.events.on("reader:mounted", syncToHost);

    // watch 设置变化驱动核心
    watch(
      () => state.settings.value.theme,
      (theme) => {
        ctx.ui.setTheme(theme);
        ctx.ui.injectIframeStyle("typography", buildFullCSS(state.settings.value));
      },
    );
  },
};
```

---

## 八、最佳实践

1. **teardown 必须清理外部状态**：`TrackedContext.runCleanup()` 自动清理追踪注册，但 `setup` 中修改的模块级变量（如 `_host`、`store`）需要在 `teardown` 中手动重置为 `null`
2. **通过 storage adapter 持久化**：不要直接操作 IndexedDB，使用 `ctx.storage`，key 在插件内自动隔离
3. **用 events 解耦通信**：不要在插件间直接 import，通过 `pluginEvents` 收发事件
4. **starup 中的 store 引用要判空**：`ctx.readerHost()` 在书籍打开前返回 `null`
5. **解析器插件应设置 `core: true`**：确保基本解析能力不被意外禁用
6. **事件监听注意竞态**：`reader:mounted` 可能在 `setup` 返回前就触发，因此先注册监听器再做异步初始化

---

## 九、所有已注册插件一览

| 插件 ID            | 名称               | 场景              | 场景标签           | 核心 | 提供能力                                                           |
| ------------------ | ------------------ | ----------------- | ------------------ | ---- | ------------------------------------------------------------------ |
| `epub`             | EPUB Parser        | 按需 (格式: epub) | 书籍解析, 阅读体验 | ✓    | parser (epub)                                                      |
| `txt-parser`       | TXT Parser         | 按需 (格式: txt)  | 书籍解析, 阅读体验 | ✓    | parser (txt)                                                       |
| `cbz-parser`       | CBZ Parser         | 按需 (格式: cbz)  | 书籍解析, 阅读体验 |      | parser (cbz)                                                       |
| `pdf-parser`       | PDF Parser         | 按需 (格式: pdf)  | 书籍解析, 阅读体验 |      | parser (pdf)                                                       |
| `book-sources`     | 书源导入           | bookshelf         | 书架功能           |      | OPDS 书源管理                                                      |
| `manager`          | Manager            | bookshelf         | 书架功能           | ✓    | 插件管理面板 modal                                                 |
| `opds`             | OPDS Catalog       | bookshelf         | 书架功能           |      | OPDS 目录浏览                                                      |
| `search`           | Full-Text Search   | reader            | 阅读体验           |      | searchApi, modal, overlay, footer action                           |
| `stats`            | Reading Statistics | reader            | 阅读体验           |      | modal, bookshelf widget, footer action                             |
| `settings`         | Settings           | reader            | 阅读体验           |      | modal (2个), header action, content transformer, iframe CSS, theme |
| `annotations`      | Annotations        | reader            | 阅读体验           |      | modal, overlay, footer action                                      |
| `bookmarks`        | Bookmarks          | reader            | 阅读体验           |      | modal, footer action                                               |
| `progress-bar`     | Progress Bar       | reader            | 阅读体验           |      | overlay                                                            |
| `auto-read`        | Auto Read          | reader            | 阅读体验           |      | toolbar item                                                       |
| `tts`              | Text to Speech     | reader            | 阅读体验           |      | toolbar item                                                       |
| `reading-progress` | Reading Progress   | reader            | 阅读体验           |      | 自动保存/恢复阅读位置                                              |
| `last-book`        | Last Book Restore  | app               | 启动加载           |      | 自动恢复上次打开的书籍                                             |
