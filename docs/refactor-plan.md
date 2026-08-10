# 架构梳理与重构计划

> 基线(2026-08-10):`vp test` 11 个测试文件 170 用例全绿;`vp check`(lint + 类型 + 格式)143 文件零告警。
> 本仓库 260 个提交中 185 个是 bugfix/fix,仅 6 个 refactor——功能迭代快、结构性整理少,债务集中在少数"大文件"里。

---

## 一、现状架构梳理

### 1.1 包结构与依赖图

```
┌─────────────────────────────────────────────────────┐
│                    packages/app (Vue 3 PWA)          │
│  components / stores(Pinia) / composables / storage  │
│  plugins/ (12 个插件,懒加载 + 生命周期托管)            │
└──┬──────────┬───────────┬───────────┬───────────────┘
   │          │           │           │
   ▼          ▼           ▼           ▼
reader-engine  parser-core  contracts  (app 自用:storage/composables)
   │              │           │
   ▼              │           ▼
reader-core ──────┘      server (Hono,独立进程)
(纯 reducer,无 Vue 依赖)
```

| 包              | 职责                                  | 规模                | 依赖           |
| --------------- | ------------------------------------- | ------------------- | -------------- |
| `reader-core`   | 阅读状态机(纯 reducer + effect 列表)  | 496 行 + 812 行测试 | 无             |
| `reader-engine` | iframe 渲染引擎(分页/滚动双模式 host) | ~1600 行            | 仅 reader-core |
| `parser-core`   | 解析器注册表 + 7 种格式,懒加载        | ~2400 行            | 无内部耦合     |
| `contracts`     | app↔server 线协议类型                 | 60 行               | 无             |
| `server`        | Hono 本地服务(OPDS/fs/代理)           | 413 行              | contracts      |
| `app`           | 界面 + 插件系统 + IndexedDB 存储      | ~11k 行(vue+ts)     | 其余全部       |

### 1.2 分层质量评估(总体:好)

架构骨架是健康的,以下设计应当**保留并强化**,不要推倒重来:

1. **状态机分层正确** — `reader-core` 是纯 reducer,812 行测试覆盖;effect 列表让 DOM 副作用与状态变更解耦。`Engine.runEffects` 的"双消费者"设计(host 渲染 DOM + app 通过 `onEffect` 观察)有注释说明,是刻意为之。
2. **引擎与解析器解耦** — 引擎通过注入 `fetchChapter` / `extractResource` / `transformContent` 获取能力,对解析器零知识;`resources.ts` 只做 blob URL 改写。
3. **插件系统隔离良好** — `createTrackedContext` 统一托管注册项清理(event unsub / hook unsub / UI 槽位 / 注入样式),启用/禁用不泄漏。
4. **存储层有迁移意识** — v12 把 covers/folders 从 plugin_store 迁出为专库,`migrateLegacyCoversAndFolders` 在 versionchange 事务内原子执行。
5. **滚动模式定位是精细工程** — 锚点 + 视口顶缘 + 校准 ResizeObserver + 补加载链,`scroll-progress.ts` / `layout.ts` 是纯函数且有测试。

---

## 二、问题诊断

### 2.1 可读性(Readability)

| #   | 问题                                                                                                                                    | 证据                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- | --- | ----------------------- | --------------------- |
| R1  | **巨型组件**:`Bookshelf.vue` 1491 行,混杂 10+ 职责(文件夹 CRUD、两个下拉菜单、排序菜单、上传、搜索、封面、上下文菜单、视图切换)         | `Bookshelf.vue`(1491)                                                                           |
| R2  | 同名类型冲突:`app/stores/reader.ts` 自己定义了 `ReaderState`(currentBook),与 `@book/reader-core` 的 `ReaderState` 同名,IDE 跳转极易混淆 | `stores/reader.ts:15`                                                                           |
| R3  | 模式词汇映射("vertical"↔"scroll")散落 4 处,两两对应但无单一来源                                                                         | `useReaderMachine.ts`(computed + initMachine)、`plugins/settings/index.ts`(loadSetting + watch) |
| R4  | `translateEffect` 是纯函数却放在 composable 模块里,`FixedLayoutReader.vue` 反向 import 一个"组件 hook 文件",分层语义错误                | `useReaderMachine.ts:58` / `FixedLayoutReader.vue:31`                                           |
| R5  | 章节对象映射(存储记录→`Chapter`)在 3 处重复手写                                                                                         | `storage/books.ts getChapters`、`stores/reader.ts openBook`、`useReaderMachine.initMachine`     |
| R6  | `any` 泄漏:settings 的 `loadSetting(config: any)`、`rawRect: any`、`FixedLayoutPage.vue` 多处 zip 相关 `any`                            | 见上表 grep 结果                                                                                |
| R7  | `chapterLoading` computed 分支冗余(`isRestoring                                                                                         |                                                                                                 | isTransitioning |     | hasError` 实际只有两态) | `useReaderMachine.ts` |

### 2.2 可维护性(Maintainability)

| #   | 问题                                                                                                                                                                                                                                     | 证据                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M1  | **`ReflowableHost` 685 行,单类承载全部滚动模式子系统**:恢复定位、校准、哨兵、自动补加载、`loadedChapterIds` 状态机——rAF/IntersectionObserver/ResizeObserver 时序纠缠,是全仓库风险最高文件,且零测试                                       | `reflowable-host.ts`                        |
| M2  | **IndexedDB 两层 API 语义不对称**:`dbOperation`(等 request+tx.oncomplete,无 onabort 处理)与 `dbTransaction`(等 tx.oncomplete 且吞掉 operation promise 错误路径)并存;迁移逻辑内联在 `onupgradeneeded`,DB_VERSION 每次 +1 都往一个函数里堆 | `storage/db.ts`                             |
| M3  | **插件模块级单例状态**(`_store`/`_settings`/`_currentBookId`)+ `useXxxStore()` 未初始化即 throw——组件 import 插件状态与插件加载时序隐式耦合,无文档约定                                                                                   | `settings/index.ts`、`annotations/index.ts` |
| M4  | `PluginEventMap` 带 `[key: string]: unknown` 索引签名,事件名拼写错误静默通过类型检查(payload 变 unknown)                                                                                                                                 | `plugins/types.ts:16`                       |
| M5  | `Engine.fetchAndLoadChapter` 基类实现是死代码——两个 host 都 override 了它;`runGenericEffect` 的"无 fetchChapter 转发 onEffect"分支同样不可达                                                                                             | `engine.ts:145`                             |
| M6  | `Bookshelf.vue` 声明 `emit("book:delete")` 但无任何监听方(死代码)                                                                                                                                                                        | `Bookshelf.vue`                             |
| M7  | 插件 loader 的"元数据 stub → 启用时升级真实模块"流程(registry 双 Map + `pluginModuleLoaders`)聪明但难读,无注释说明完整状态机                                                                                                             | `loader.ts` / `registry.ts`                 |
| M8  | 测试空白区集中在**最复杂、最纯的逻辑**上:`epub-cfi.ts`(512 行,零测试)、`resources.ts`(URL 解析/改写,零测试)、`rule-parser.ts`(498 行,零测试)、`opds-parser.ts`、`reader-css.ts`                                                          | 见测试文件清单                              |

### 2.3 健壮性(Robustness)

| #   | 问题                                                                                                                                                                                    | 严重度 | 证据                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------- |
| S1  | **`navigateToCfiLocation` 的 promise 永不 resolve**:`watch(status)` 无超时、无 error 分支——若章节加载失败(status 停在 error),`await new Promise` 永久挂起;组件卸载时 watch 也不停(泄漏) | 高     | `useReaderMachine.ts`                  |
| S2  | **`initMachine` 中 `host!` 非空断言竞态**:`pluginHooks.run()` 是异步的,若在 resolve 前组件已卸载(onUnmounted → `host.destroy()` → host = null),回调里 `host!.init()` 抛 TypeError       | 高     | `useReaderMachine.ts:127`              |
| S3  | iframe 无 `sandbox`、无 CSP:书籍 HTML(不可信输入)以同源权限执行——恶意 EPUB 的脚本可访问父页面 DOM/localStorage                                                                          | 中     | `reflowable-host.ts createIframe`      |
| S4  | IndexedDB 事务 `onabort` 未统一处理(`dbOperation` 缺 abort 分支,静默挂起)                                                                                                               | 中     | `storage/db.ts`                        |
| S5  | `keepalive` 生命周期交互未成文:KeepAlive 下 reader 组件不卸载,`currentSession` 指向后台存活 iframe;插件(如 settings 的 mode watch)会向后台 host dispatch,行为依赖隐式时序               | 中     | `App.vue` + `useReaderMachine`(需审计) |
| S6  | 恢复定位/补加载并发路径(`autoLoadChapter` 与 `nextFetchSignal` 的 abort 交互、`restoreScrollPosition` 的 32 次循环)无任何自动化测试,改动即回归风险                                      | 中     | `reflowable-host.ts`                   |

---

## 三、重构方向(原则)

1. **只拆不改架构**:保留 6 包分层、状态机/effect 模式、插件隔离、注入式依赖。重构目标是"让现有设计清晰化",不是引入新范式。
2. **先测后拆**:任何对 `reflowable-host` / `epub-cfi` / `resources` 的移动,先为纯逻辑补测试,用测试锁行为再重构。
3. **大文件拆分的验收标准**:拆分后每个模块 ≤ 400 行、单一职责、可独立测试;不追求"每个组件都小",追求"每个文件只回答一个问题"。
4. **消除隐式时序**:模块级单例、KeepAlive 生命周期、插件加载顺序,要么写成文档,要么改成显式依赖。
5. **类型即文档**:消灭 `any`,事件表去掉索引签名,存储层返回领域类型(`Chapter[]`)而非裸记录。

---

## 四、分阶段实施计划

### Phase 0 — 快速止血(低风险高收益,1~2 天)

| 项   | 内容                                                                                                                   | 对应问题 |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| P0-1 | 修复 `navigateToCfiLocation` 挂起:`watch` + 超时(如 8s)或同时监听 error 态 resolve,`onUnmounted`/finally 里 stop watch | S1       |
| P0-2 | 修复 `initMachine` 竞态:进入 async 回调前检查 `host` 非空(或取消标记)                                                  | S2       |
| P0-3 | `stores/reader.ts` 的 `ReaderState` 改名为 `ReaderStoreState`,全局替换                                                 | R2       |
| P0-4 | 新增 `utils/reader-mode.ts`:`machineToViewMode` / `viewToMachineMode` 两个纯函数,替换 4 处内联映射                     | R3       |
| P0-5 | `loadSetting(config: any)` → `InitConfig`;`rawRect` 收敛为具体类型或删除                                               | R6       |
| P0-6 | 删除死代码:Engine 基类 `fetchAndLoadChapter` 改 abstract、`runGenericEffect` 简化、Bookshelf 的 `book:delete` emit     | M5/M6    |

### Phase 1 — 可读性重构(1 周)

| 项   | 内容                               | 对应问题 |
| ---- | ---------------------------------- | -------- |
| P1-1 | **拆分 `Bookshelf.vue`(1491 行)**: |

- `composables/useFolders.ts`(文件夹 CRUD + 移动)
- `composables/useBookSorting.ts`(排序/搜索过滤)
- `composables/useUpload.ts`(导入 + 进度 + 去重)
- 子组件:`FolderSidebar.vue`、`SortMenu.vue`、`UploadOverlay.vue`、`BookContextMenu.vue`
- 模板按区块抽 `Section` 级组件,目标主文件 ≤ 400 行 | R1 |
  | P1-2 | `translateEffect` 移入 `plugins/effects.ts`(或并入 `plugins/context.ts`),`useReaderMachine` 与 `FixedLayoutReader` 各自从正确位置 import | R4 |
  | P1-3 | 章节映射收敛:storage 层直接返回 `Chapter[]`(reader-core 类型),删除 `openBook`/`initMachine` 里的手写映射 | R5 |
  | P1-4 | `ReflowableHost` 拆出 `ScrollChapterController`(滚动模式专属:restoreScrollPosition/startScrollCalibration/哨兵/autoLoadChapter/loadedChapterIds),host 保留 iframe/分页/点击/资源管线。**先为滚动模式写行为测试**(用注入的 fake DOM 或把决策函数提纯),再动代码 | M1 |
  | P1-5 | 拆 `FixedLayoutReader.vue`(718 行):PDF 专属状态(outline/zoom)抽 `usePdfOutline.ts` / `usePdfZoom.ts` | — |

### Phase 2 — 可维护性(1~2 周)

| 项   | 内容                                                                                                                                                                                                                     | 对应问题 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| P2-1 | `storage/db.ts` 统一:合并 `dbOperation`/`dbTransaction` 为一个 `withStore` 原语(统一 oncomplete/onerror/onabort 语义);迁移抽成版本化数组 `MIGRATIONS: { version, run(tx) }[]`,`onupgradeneeded` 按序执行,迁移可单测      | M2/S4    |
| P2-2 | 去掉 `PluginEventMap` 索引签名,事件名拼写错误在编译期暴露(逐个插件排查 `events.emit` 自定义事件,若有则补进类型)                                                                                                          | M4       |
| P2-3 | 插件单例状态规范:在 `docs/plugins.md` 成文约定(模块级 ref + `useXxxStore()` 约定 + 加载时序),并给 `createEntityStore` 补"未初始化返回 null 而非 throw"的退化路径;评估把高频状态(settings/annotations)迁入 Pinia 的可行性 | M3       |
| P2-4 | loader/registry 的 stub 升级流程补状态图注释,或简化为"metadata 即 Plugin"模型                                                                                                                                            | M7       |
| P2-5 | 补测试(按优先级):                                                                                                                                                                                                        |

1.  `epub-cfi.ts`(parseCfi/resolveCfiToElement/resolveCfiRange——纯函数,fixture 好造)
2.  `reader-engine/resources.ts`(URL 归一化/改写/blob 生命周期)
3.  `book-sources/rule-parser.ts`、`opds/opds-parser.ts`
4.  `reader-css.ts`(CSS 生成快照) | M8 |
    | P2-6 | 文档:`docs/architecture.md`(依赖图 + 数据流 + 关键决策),把 CLAUDE.md 中"为什么"沉淀为 ADR 风格条目(如 KeepAlive 生命周期、双消费者 effect) | — |

### Phase 3 — 健壮性(1~2 周,可并行)

| 项   | 内容                                                                                                                                                        | 对应问题 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| P3-1 | iframe 加固:创建时加 `sandbox="allow-same-origin"`(禁脚本,书籍内容本不应执行 JS),验证资源注入/样式注入/锚点滚动不受影响;若发现个别合法书籍需要脚本,再加开关 | S3       |
| P3-2 | KeepAlive 生命周期审计:在 `useReaderMachine` 增加 `onActivated`/`onDeactivated` 处理(暂停后台校准、session 绑定刷新),把"读一部书"期间的行为写成文档         | S5       |
| P3-3 | 全局错误面:app 顶层加 `window.onunhandledrejection` 采集(IndexedDB 失败、解析器异常)转 toast + 日志;`dbOperation` 补 abort 分支                             | S4       |
| P3-4 | 滚动模式压力测试:为 `restoreScrollPosition` 的补加载循环、abort 竞态(快速翻章/切模式)写模拟测试(jsdom 或注入 fake iframeDoc)                                | S6       |
| P3-5 | 评审 `resources.ts` 的 blob URL 生命周期:`loadChapter` 开头 revoke 全部旧 URL,但分页模式相邻章节共享 `resourceUrls`——确认无提前 revoke 路径,补注释或测试    | —        |

---

## 五、度量与验收

| 指标                 | 现状                                      | 目标           |
| -------------------- | ----------------------------------------- | -------------- |
| 最大单文件行数       | 1491(Bookshelf.vue)                       | ≤ 500          |
| 1000+ 行文件数       | 2                                         | 0              |
| `any` 数量(app/src)  | ~10 处                                    | 0              |
| 测试文件 / 用例      | 11 / 170                                  | ≥ 16 / ≥ 230   |
| 关键纯逻辑测试覆盖率 | epub-cfi 0%、resources 0%、rule-parser 0% | 核心路径 ≥ 80% |
| `vp check`           | 0 告警                                    | 保持 0         |

每个 Phase 合入前:跑 `vp test` + `vp check`,并保证 diff 中"纯移动"与"行为修改"分开提交(移动用 `git mv` + 无改动重命名提交,便于 review 和 revert)。

## 六、明确不重构(保持现状)

- **`reader-core/machine.ts`** 的扁平 reducer 与 effect 列表 — 已有 812 行测试锁定,单一状态形状(分页+滚动共存)是权衡后的选择。
- **解析器插件注册机制**(`registerParserLoader` 懒加载)— 正确且不可再简。
- **插件系统的 context 清理模型** — 隔离做得最好的一层,不要动。
- **`engine.ts` 的双消费者 effect 分发** — 有注释说明的历史教训(曾经 MODE_CHANGED 被 host 吞掉导致插件事件永不触发),只简化死分支,不动结构。
