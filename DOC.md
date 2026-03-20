---
项目架构总览

这是一个设计良好的 Web 电子书阅读器，采用分层架构：

┌─────────────────────────────────────────────────────┐
│ App.vue │
│ (UI State + Transitions) │
└─────────────────────────────────────────────────────┘
│
┌─────────────────┼─────────────────┐
▼ ▼ ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Bookshelf.vue │ │ ReaderView.vue│ │ ReaderModal.vue│
└───────────────┘ └───────────────┘ └───────────────┘
│ │
└─────────────────┼─────────────────┐
▼
┌─────────────────────────────────────────────────────┐
│ readerCore │
│ (Central State Machine) │
└─────────────────────────────────────────────────────┘
│
┌─────────────────┼─────────────────┐
▼ ▼ ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ EventBus │ │ Parsers │ │ Search │
└───────────────┘ └───────────────┘ └───────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│ IndexedDB Storage Layer │
│ books │ chapters │ progress │ bookmarks │ stats │
└─────────────────────────────────────────────────────┘
---

架构优势 ✅

1. 清晰的分层设计 - Core/Storage/Parsers/UI 职责分离明确
2. 事件驱动解耦 - EventBus 使组件间松耦合
3. 类型安全 - 完整的 TypeScript 接口定义
4. 可扩展的解析器 - 添加新格式只需实现 BookParser 接口
5. 离线优先 - 所有数据持久化在 IndexedDB
6. 资源管理完善 - EPUB 资源以 ArrayBuffer 存储，Blob URL 动态生成

---

架构问题与建议 🔧

1. God Component 问题 (高优先级)

问题: ReaderView.vue 约 2500 行代码，承担过多职责：

- 分页/滚动逻辑
- 手势处理
- 进度追踪
- 搜索功能
- 书签管理
- 设置面板
- 统计显示

建议: 拆分为更小的组件
components/
├── ReaderView.vue # 协调器 (缩减至 ~500 行)
├── reader/
│ ├── ContentView.vue # 内容渲染 + 分页
│ ├── ProgressBar.vue # 进度条
│ ├── GestureHandler.vue # 触摸手势
│ ├── ChapterPreloader.vue # 章节预加载
│ └── ReaderToolbar.vue # 顶部/底部工具栏

2. 状态管理方案 (中优先级)

问题: readerCore 混合了状态管理、业务逻辑和事件发射，存在：

- 内部状态 \_currentState 手动管理
- 没有单向数据流保证
- 多个组件可能直接修改状态

建议: 引入 Pinia 进行状态管理
// stores/reader.ts
export const useReaderStore = defineStore('reader', {
state: () => ({
currentBook: null as Book | null,
currentChapter: null as Chapter | null,
progress: 0,
// ...
}),
actions: {
loadBook(file: File) { /_ ... _/ },
goToChapter(id: string) { /_ ... _/ },
},
getters: {
currentProgress: (state) => state.progress,
}
})

3. 大文件问题 (中优先级)

问题: ReaderModal.vue 同样约 2500 行，包含所有模态框变体。

建议: 拆分为独立模态组件
components/
├── modals/
│ ├── TableOfContents.vue
│ ├── ReaderSettings.vue
│ ├── SearchPanel.vue
│ ├── BookmarksPanel.vue
│ └── StatsPanel.vue

4. 内存管理优化 (中优先级)

问题: 垂直模式使用 loadAllChapters() 一次性加载所有章节到内存。

建议: 实现虚拟滚动或按需加载
// 只渲染可见章节 + 缓冲
const visibleChapters = computed(() => {
const start = Math.max(0, currentIndex - BUFFER_SIZE);
const end = Math.min(totalChapters, currentIndex + BUFFER_SIZE);
return chapters.slice(start, end);
});

5. 日志系统缺失 (低优先级)

问题: 代码中存在 console.log() 调试语句（reader.ts, books.ts, stats.ts）。

建议: 引入统一的日志工具
// utils/logger.ts
export const logger = {
debug: (msg: string, data?: any) => {
if (import.meta.env.DEV) console.debug(`[DEBUG] ${msg}`, data);
},
error: (msg: string, error?: Error) => {
console.error(`[ERROR] ${msg}`, error);
// 可集成错误上报
}
};

6. 魔法数字 (低优先级)

问题: 硬编码值散落在代码中（如 50000 分块大小、70% 预加载阈值）。

建议: 提取到常量文件
// utils/constants.ts
export const READER_CONFIG = {
CHAPTER_CHUNK_SIZE: 50000,
PRELOAD_THRESHOLD: 0.7,
SCROLL_THROTTLE_MS: 60,
PROGRESS_DEBOUNCE_MS: 1000,
} as const;

7. 搜索功能限制 (低优先级)

问题: 当前搜索仅支持基础正则匹配。

建议: 增强搜索能力

- 添加模糊搜索选项
- 支持大小写敏感切换
- 考虑集成 Web Worker 避免阻塞 UI

8. 统计计算效率 (低优先级)

问题: updateStats() 每次都会重新计算所有会话数据。

建议: 增量更新
// 只在会话结束时增量更新统计数据
async function incrementStats(bookId: string, session: ReadingSession) {
const stats = await getStats(bookId);
stats.totalWords += session.wordsRead;
stats.totalTime += session.endTime - session.startTime;
// ...
}

---

技术债务清单

┌────────┬──────────────────────┬────────────┐
│ 优先级 │ 问题 │ 预估工作量 │
├────────┼──────────────────────┼────────────┤
│ 🔴 高 │ ReaderView.vue 拆分 │ 2-3 天 │
├────────┼──────────────────────┼────────────┤
│ 🟡 中 │ 引入 Pinia 状态管理 │ 1-2 天 │
├────────┼──────────────────────┼────────────┤
│ 🟡 中 │ ReaderModal.vue 拆分 │ 1 天 │
├────────┼──────────────────────┼────────────┤
│ 🟡 中 │ 虚拟滚动优化 │ 2 天 │
├────────┼──────────────────────┼────────────┤
│ 🟢 低 │ 统一日志系统 │ 2 小时 │
├────────┼──────────────────────┼────────────┤
│ 🟢 低 │ 常量提取 │ 1 小时 │
├────────┼──────────────────────┼────────────┤
│ 🟢 低 │ 搜索功能增强 │ 4 小时 │
└────────┴──────────────────────┴────────────┘

---

总结

项目整体架构健康，分层清晰，类型安全做得很好。主要技术债务集中在组件粒度过大和状态管理不够正式。建议优先拆分
ReaderView.vue，这是最影响代码可维护性的问题。
