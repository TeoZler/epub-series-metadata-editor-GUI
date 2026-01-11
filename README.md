# EPUB 系列信息编辑器

一款用于批量编辑 EPUB 电子书系列元数据的桌面应用，基于 Electron + React + Ant Design 构建。

![平台](https://img.shields.io/badge/平台-Windows%20|%20macOS%20|%20Linux-blue)
![许可证](https://img.shields.io/badge/许可证-MIT-green)

## 功能特性

- 📁 **批量处理** - 同时编辑多个 EPUB 文件的系列信息
- 🌲 **树形视图** - 按文件夹层级结构浏览文件
- 🔄 **拖拽排序** - 在文件夹内拖拽调整文件顺序
- 🔢 **智能编号** - 自动编号或智能续编
- 🪄 **智能识别** - 从已有项自动识别系列名
- 📂 **父文件夹名** - 使用父文件夹名作为系列名
- ↩️ **撤销支持** - 撤销批量操作
- 🌍 **多语言** - 支持中文和英文
- 🌙 **深色模式** - 支持亮色/深色主题切换
- 💾 **自动备份** - 保存前可选生成 `.bak` 备份文件

## 安装

### 下载安装包

从 [Releases](../../releases) 页面下载最新版本：

| 平台 | 架构 | 文件名 |
|------|------|--------|
| Windows | x64 | `EPUB Metadata Editor-x.x.x-win-x64.exe` |
| Windows | ARM64 | `EPUB Metadata Editor-x.x.x-win-arm64.exe` |
| macOS | Intel | `EPUB Metadata Editor-x.x.x-mac-x64.dmg` |
| macOS | Apple Silicon | `EPUB Metadata Editor-x.x.x-mac-arm64.dmg` |
| Linux | x64 | `EPUB Metadata Editor-x.x.x-linux-x64.AppImage` |
| Linux | ARM64 | `EPUB Metadata Editor-x.x.x-linux-arm64.AppImage` |

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-repo/epub-series-metadata-editor-GUI.git
cd epub-series-metadata-editor-GUI

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 打包当前平台
npm run dist
```

## 使用方法

1. 点击 **打开文件夹** 选择包含 EPUB 文件的目录
2. 勾选 **递归搜索子目录** 以包含子文件夹中的文件
3. 使用复选框选择文件（Shift+点击 可范围选择）
4. 使用批量操作：
   - **统一系列** - 为所选文件设置统一的系列名
   - **自动编号** - 按 1, 2, 3... 顺序编号
   - **智能续编** - 从第一项开始续编
5. 点击 **保存更改** 将元数据写入 EPUB 文件

## 技术栈

- **Electron** - 桌面应用框架
- **React** - UI 库
- **Ant Design** - UI 组件库
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **dnd-kit** - 拖拽功能
- **i18next** - 国际化

## 许可证

MIT License
