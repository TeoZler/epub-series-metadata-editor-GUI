# 项目开发日志与需求汇总 (Development Log)

## 1. 项目概述
本项目是一个基于 Electron + React + Ant Design 的 EPUB 电子书元数据编辑器，主要用于批量管理 EPUB 文件的系列名称（Series）和系列序号（Index）。

**核心技术栈：**
- **Electron**: 桌面应用框架 (Main/Renderer IPC通信)
- **React**: 前端 UI 库
- **Ant Design**: UI 组件库 (Table, Tree, Modal, Form)
- **Node.js**:
    - `adm-zip`: 读取和写入 EPUB (ZIP) 文件
    - `fast-xml-parser`: 解析和构建 OPF XML 元数据
- **其他**: `i18next` (国际化), `@dnd-kit` (拖拽，目前暂时禁用), `react-resizable` (列宽调整)

## 2. 目录结构说明
当前有效的工作目录为：`epub-metadata-editor-electron`

*   `src/main/`: Electron 主进程代码
    *   `epub-reader.ts`: 读取 EPUB 元数据
    *   `epub-writer.ts`: 写入 EPUB 元数据 (核心逻辑：修改 content.opf)
*   `src/renderer/src/`: React 渲染进程代码
    *   `App.tsx`: 主界面逻辑 (树形表格、状态管理)
    *   `components/ErrorBoundary.tsx`: 错误捕获组件
    *   `i18n/`: 国际化配置 (zh-CN, en-US)
    *   `assets/`: 样式文件

## 3. 已实现功能 (Features Implemented)

### 3.1 基础功能
*   **打开文件夹**: 支持选择本地文件夹，读取其中的 EPUB 文件。
*   **递归搜索**: 可选是否递归搜索子目录。
*   **元数据读取**: 解析 EPUB 内的 Title, Author, Series, Series Index。
*   **暗色模式 (Dark Mode)**: 
    *   支持跟随系统或手动切换。
    *   适配了滚动条样式和 Ant Design 主题算法。
*   **国际化 (i18n)**: 支持中文（默认）和英文切换。

### 3.2 视图与交互
*   **树形列表视图 (Tree View)**:
    *   模拟资源管理器的文件层级结构。
    *   支持文件夹展开/收起。
    *   显示文件夹内文件数量。
*   **可调整列宽**: 表头支持拖拽调整宽度。
*   **编辑功能**:
    *   直接在表格中点击输入框修改系列名和序号。
    *   修改后会有高亮提示，且左侧有小蓝点标记未保存状态。
*   **批量操作**:
    *   支持多选（Ctrl/Shift+Click）。
    *   底部悬浮工具栏：批量设置系列名、自动编号、智能续编。
    *   **自动编号**: 从 1 开始递增。
    *   **智能续编**: 根据选中项的第一个文件的序号向下递增 (如 4.5 -> 5, 6...)。
    *   **使用父目录名**: 在设置系列名时，可一键填入父文件夹名称。

### 3.3 文件保存
*   **保存机制**: 修改直接写入 EPUB 文件内的 OPF。
*   **备份**: 默认勾选“生成 .bak 备份”，保存前会备份原文件。
*   **错误处理**: 保存失败会有提示，成功后清除修改标记。

## 4. 待解决/优化问题 (Known Issues / TODO)

### 4.1 拖拽排序 (Drag & Drop)
*   **状态**: 目前代码中已**暂时禁用** (`SortableContext` 被注释)。
*   **原因**: 引入树形视图 (`Tree Data`) 后，原本基于扁平列表 (`Flat Data`) 的拖拽库 (`dnd-kit`) 在处理跨层级或折叠状态时会导致渲染错乱。
*   **后续计划**: 需要重写拖拽逻辑，支持树形结构下的节点移动或仅限同级排序。

### 4.2 性能
*   **大文件夹**: 如果加载包含数千本 EPUB 的目录，树形构建和渲染可能存在性能瓶颈，后续可考虑虚拟滚动。

## 5. 环境配置与 Git 说明
*   **有效项目路径**: `.../epub-metadata-editor-electron`
*   **多余文件夹**: `.../epub-metadata-editor-electron react-ts` 是初始化项目时产生的脚手架残留，**不需要**。
*   **Git 建议**: 请在 `epub-metadata-editor-electron` 目录下初始化 git 仓库并提交。

---
*Last Updated: 2026-01-09*
