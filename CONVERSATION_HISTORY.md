# 开发对话历史记录 (Conversation History)

本文档记录了项目开发过程中的关键对话节点、需求变更及技术实现方案。

## 阶段一：基础架构与 UI 适配
**User**: 1.引入i18n，并且以中文为主 \n 2.增加暗色模式支持
**Agent**: 
- 初始化 `i18next` 配置，创建 `zh-CN` 和 `en-US` 语言包。
- 使用 Ant Design `ConfigProvider` 实现暗色主题切换。
- 实现状态持久化。

**User**: 暗色模式还是有一圈白边，再看一下
**Agent**: 
- 创建 `global.css` 重置 `html` 和 `body` 的 margin/padding。
- 动态设置 `document.body` 背景色以匹配主题。

**User**: 滚动条还是亮色的
**Agent**: 
- 在 `global.css` 中添加 `::-webkit-scrollbar` 样式。
- 针对 `[data-theme='dark']` 调整滚动条颜色。

## 阶段二：核心功能开发 (读写与批量处理)
**User**: 继续开发吧 (暗示需要编辑和保存功能)
**Agent**: 
- 实现后端 `EpubWriter` 类，使用 `adm-zip` 修改 EPUB 内的 `content.opf`。
- 前端添加编辑输入框和保存按钮，通过 IPC 通信调用保存接口。

**User**: 右键菜单和自动编号可以做起来了，还需要一个功能：从选定的项往下编号，比如我选定的编号为4.5，再往下就是5、6、...
**Agent**: 
- 添加右键菜单 (`Dropdown`)。
- 实现“自动编号”（从1开始）和“智能续编”（基于首项取整+1递增）逻辑。

**User**: 1.我发现添加系列或者序号，然后再清空，还是会显示有修改 \n 2.底部的批量处理面板我好像没看到
**Agent**: 
- 引入 `originalData` 状态，保存前对比新旧值以准确判断修改状态。
- 增加底部悬浮 `Card` 面板，仅在有选中项时显示。

**User**: 1.统一序列名功能，增加一个按钮，使用父目录名称 \n 2.增加拖拽排序功能 \n 3.智能续编功能好像没用
**Agent**: 
- 在系列名模态框中添加“使用父文件夹名”按钮。
- 引入 `@dnd-kit` 实现列表拖拽排序。
- 修复智能续编逻辑：先对选中项按视觉顺序排序，再应用递增逻辑。

**User**: 再修改一下，不止点击框可以选中，点击这行的任何地方都可以选中，并把拖拽排序改为只能拖拽手柄
**Agent**: 
- 优化 `Row` 组件，隔离拖拽监听器到 `DragHandle` 图标。
- 在 `tr` 上添加 `onClick` 处理选择逻辑。

**User**: 按住shift选择时，还是只能选中单行，并且会选中字
**Agent**: 
- 实现 Shift+Click 范围选择逻辑。
- 添加 CSS `user-select: none` 防止文本被选中。

## 阶段三：视图重构 (资源管理器风格)
**User**: 1.勾选递归搜索子目录后，应该实时更新一次文件夹 \n 2.不应该把递归搜索子目录的放在一起，应该按照文件夹排序
**Agent**: 
- 监听递归复选框变化触发重新加载。
- 增加文件名排序逻辑。

**User**: 我是想在程序里就能直观的看到文件结构，现在这样看不出来啊 \n 我想做成一个文件夹做一个可以展开和收起的列表 \n 此外，顶端的表头最好做成可以调整列宽的
**Agent**: 
- **重大重构**：将数据结构从扁平列表改为树形结构 (`Tree Data`)。
- 引入 `react-resizable` 实现表头列宽拖拽。
- 使用 Ant Design Table 的 `expandable` 属性展示文件夹层级。

## 阶段四：Bug 修复与细节完善
**User**: 打开直接白屏了，什么都没有
**Agent**: 
- 发现缺少依赖，运行 `npm install`。
- 添加 `ErrorBoundary` 组件捕获渲染错误。
- 修复 `useSortable` 在无 ID 时的崩溃问题。

**User**: 报错 `ReferenceError: darkAlgorithm is not defined`
**Agent**: 
- 修复 `App.tsx` 中 Ant Design theme 算法的引用方式 (`theme.darkAlgorithm`)。

**User**: 现在没有比较好的展现出文件夹之间的关系 (提供了 tree /f 的示例)
**Agent**: 
- 重写 `buildTree` 算法。
- 不再仅按文件夹名分组，而是根据文件路径构建真实的嵌套目录树。

**User**: 好像还是有问题，一展开文件夹，epub全显示在最下面了
**Agent**: 
- 发现 `dnd-kit` 的 `SortableContext` 与树形表格渲染冲突。
- **临时禁用拖拽排序功能**，优先保证文件层级显示正确（文件正确显示在文件夹内部）。

**User**: 把之前的对话和需求全部输出到一个md文件中，并完善gitignore文件...
**Agent**: 
- 创建 `DEVELOPMENT_LOG.md`。
- 更新 `.gitignore`。
- 创建本文件 `CONVERSATION_HISTORY.md`。
