# 插件契约（Plugin Contract）

> 本文件定义**核心**与**插件**的边界、插件 API 的稳定面与权力面、以及边界变更的流程。
> 目标：核心保持简单，插件被充分赋能。进核心、加能力都是**有意识的行为**，不是自然漂移。
> 基线(2026-08-10)：13 个插件，零跨插件依赖，核心零插件 import。

---

## 一、三分法

| 类别                         | 定义                       | 判定门槛（全部满足）                                                                               | 现状                                                                                                                                                                                               |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **核心**                     | 无它无法"打开一本书并阅读" | ① 基础性：缺它阅读流程断裂 ② 被依赖：核心代码或多个插件依赖它 ③ 无独立 UI 面，或 UI 面就是阅读本身 | reader machine、engine、parser、storage、app 壳（ReaderChrome/Bookshelf/路由）、`core/`（plugin-runtime、theme-registry、reader-settings、reader-settings-store、reader-session、document-marker） |
| **核心插件**（`core: true`） | 永远需要，但保留插件形态   | ① 满足"插件"定义 ② 不可禁用（缺它产品不成立）                                                      | `manager`（插件管理入口）、`settings`（阅读设置）                                                                                                                                                  |
| **插件**                     | 可选的用户可见能力         | ① 可禁用而不破坏其他功能 ② 有独立领域逻辑与 UI 面 ③ 只有一个入口：`setup` + 事件监听               | 其余 11 个（stats、search、tts、annotations、bookmarks、opds、book-sources、auto-read、progress-bar、reading-progress、last-book）                                                                 |

**一句话判定**：_禁用它，阅读还能进行吗？能 → 插件；不能 → 核心或核心插件，且核心不得 import 插件的任何东西。_

> `settings` 已升级为 `core: true` 核心插件：承载阅读设置/排版/主题。核心层持有 `ReaderSettings` 默认值、CSS 构建器与主题注册表；插件只保留场景注册。
> `reading-progress`（书内位置恢复）与 `last-book`（上次阅读恢复）是**普通插件**（`defaultEnabled: true`，可禁用）：**恢复协议在核心**（`core/reader-session.ts` 的 `ReaderPositionSnapshot` / `snapshotFromSession` / `applyPositionSnapshot`，与 `reader:unmounted` 事件、`reader:init-config` hook 共享同一形状），插件只保留**持久化格式与触发策略**（存什么、何时存、存到哪）。禁用 = 不恢复位置/不自动续读，阅读本身不受影响。

---

## 二、依赖方向（硬规则）

1. **核心不得 import 插件**（类型、值、常量都不行）。例外：无——插件是可选代码，核心的编译与运行必须与任何插件无关。
2. **插件不得 import 其他插件**。跨插件通信只能走官方通道：
   - 核心事件总线（`ctx.events`）——单向通知；
   - **服务注册（`ctx.expose` / `ctx.require`）**——服务调用。`expose` 在 teardown 时自动移除；`require` 拿不到时返回 `undefined`，调用方必须优雅降级；
   - 不允许模块级全局（stats 的 `setStatsEngine` 是插件内部单例，未导出给其他插件，属合规）。
3. **插件可以 import 核心**：`@book/engine` 类型、`core/` 下的类型与纯函数、`utils/` 的纯工具（如 `reader-css.ts`）。
4. 插件私有代码（引擎、解析器、组件）一律留在插件目录内。

---

## 三、API 版本

- `PluginContext` 是事实上的插件 API 面，版本号：`PLUGIN_API_VERSION`（见 `plugins/types.ts`）。
- 插件用 `apiVersion` 字段声明其针对的版本；缺省视为 1。版本不匹配时 `setup` 被拒绝并记录错误。
- **契约变更规则**：
  - 新增事件 / hook / UI 注册口 → minor（当前版本不变，文档记录）；
  - 修改或删除现有能力、改变 payload 形状 → major（`PLUGIN_API_VERSION + 1`，全部插件同步升级声明）。

---

## 四、能力面分级

### 稳定面（跨版本保证兼容，放心用）

| 能力                                         | 说明                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ctx.storage`                                | 插件命名空间的 IndexedDB 适配器                                                               |
| `ctx.events`                                 | 类型化事件总线（`PluginEventMap`），核心 emit、插件 listen                                    |
| `ctx.hooks`                                  | filter hook（`HookMap`），按 priority 链式改配置                                              |
| `ctx.ui` 注册类                              | modal / overlay / footer action / bookshelf widget+menu / toolbar item / header action / page |
| `ctx.navigate` / `ctx.themes` / `ctx.server` | 路由、主题注册、Node 能力代理                                                                 |
| `ctx.expose` / `ctx.require`                 | 跨插件服务注册（§二.2）；expose 随 teardown 移除，require 失败返回 `undefined`                |

### 权力面（Power API，随核心演进，不保证兼容；用前读本文件与 CHANGELOG）

| 能力                             | 风险                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `ctx.readerSession()`            | 直达引擎内部状态与 iframe 文档，可破坏阅读状态         |
| `ctx.ui.injectIframeStyle`       | 原始 CSS 注入 iframe，可能与核心样式冲突               |
| `ctx.registerContentTransformer` | 改写章节 HTML，出错会污染渲染（核心已 try/catch 隔离） |
| `ctx.readChapterContent`         | 读取章节 HTML，绕过内容管线直接接触存储/解析细节       |

权力面接口签名变更**不触发** `PLUGIN_API_VERSION` 升级；依赖它们的插件须在 `setup` 失败时优雅降级（`setupError` 只影响该插件）。

---

## 五、生命周期义务（插件作者必读）

1. `setup(ctx, { onTeardown })` 里注册的一切（事件、hook、UI、样式、主题）由 `TrackedContext` 自动清理——**前提是走 ctx 的注册口，不要自己持有全局**。
2. 事件 handler 是 fire-and-forget：不要阻塞、不要抛未捕获异常（总线已 `allSettled` 隔离）。
3. 高频事件（`scroll:progress` 每帧）必须节流/防抖后再写 IndexedDB。
4. 插件内部分享状态用模块级单例（如 `stats/engine.ts`）可以，但**不得导出给其他插件**（见依赖方向 2）。
5. 禁用 = 卸载：`teardownPlugin` 后不得再有代码引用该插件的 UI/状态（懒加载组件由 `defineAsyncComponent` 卸载）。

---

## 六、变更流程

| 动作                      | 前置检查                                                        | 落地                                               |
| ------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| 代码进核心                | 过三分法门槛 ① ② ③；确认无插件 import                           | 放入 `core/`、`storage/`、`utils/` 或 `packages/*` |
| 给 `PluginContext` 加能力 | 先写清稳定面/权力面归属；确认是通用能力而非单一插件私货         | 改 `types.ts` + `context.ts` 实现 + 本文件 §四     |
| 新增事件 / hook           | 在 `PluginEventMap` / `HookMap` 加条目（类型即文档）            | minor，本文件不改                                  |
| 新插件                    | 抄 `plugins/_template/`；过 §五；在 `plugin-metadata.json` 登记 | 默认禁用优先，稳定后再 `defaultEnabled`            |

**回顾点**：每次改动涉及上述任意一行时，回到本文件确认边界没有被静默移动。
