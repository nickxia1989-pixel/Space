# Space

Space 是一个面向 Windows 的四栏文件管理器，灵感来自 QSpace。项目基于 Electron、React、Vite 和 TypeScript 构建，目标是在一个轻量桌面窗口里完成多目录浏览、文件整理、搜索、同步和常用工作区操作。

## 功能概览

- 四栏资源管理器布局，支持紧凑的无边框 Windows 桌面界面。
- 每个栏位都有独立的后退、前进、上级目录、刷新、面包屑路径、地址栏和路径建议。
- 支持详情视图和图标视图、常见文件类型图标、详情列排序、多选、状态栏和当前栏位高亮。
- 侧边栏包含暂存架、Windows 资源管理器快速访问、Space 专属快捷方式和磁盘列表。
- 通过 Electron IPC 执行本地文件操作：新建文件夹、新建模板文件、重命名、删除到回收站、复制、移动、打开、在资源管理器中定位，以及在当前目录打开 Windows Terminal。
- 支持复制选中文件完整路径、按同类文件或文件夹扩展选择。
- 支持跨栏复制、剪切、粘贴、拖放复制、按住 Shift 拖放移动，以及拖拽调整四个栏位的位置。
- 每个栏位可按需打开筛选和递归搜索，递归搜索带结果数量上限。
- 工作区搜索可同时搜索当前四个栏位，自动去重重叠目录结果，并支持打开、定位或加入暂存架。
- 自动保存并恢复栏位路径、历史记录、布局、当前栏位和书签。
- 新建文件模板支持 txt、Markdown、Word、Excel 和 PowerPoint，可编辑模板内容，并在文件名或内容里使用 `$date(...)` 变量。
- 自定义操作支持工作区级工具栏按钮和快捷键，可显示、隐藏、排序、绑定和恢复默认值。
- 右键菜单提供分组后的打开、复制、剪切、粘贴、暂存、书签、定位、SVN Update、SVN Commit 和新建文件操作。
- 检查器默认隐藏，可按需预览文本和图片、查看元数据、定位文件，并计算 SHA-256。
- 哈希比较支持 MD5、SHA-1、SHA-256 和 SHA-512，可按相同哈希分组，用于校验重复文件或复制结果。
- 文件夹同步支持比较两个目录，预览单向或双向同步动作，包含缺失文件和较新文件，可选择包含隐藏项、保存工作区预设并执行同步。
- 工作区标签支持创建、克隆、重命名、删除、切换、自动保存和恢复多个四栏工作区。
- 暂存架可收集任意栏位中的文件或文件夹，也支持拖放加入，之后可整体复制或移动到当前栏位。
- ZIP、TAR、TGZ 和 TAR.GZ 归档工具支持双击浏览、预览文本和图片、提取选中或全部条目，以及从本地选中项创建 ZIP。
- 常用快捷键包括 Tab、Shift+Tab、Ctrl+A/C/X/V、Ctrl+Shift+C、Ctrl+R、Alt+Up、Delete、F2 和 Enter。
- 在非 Electron 浏览器环境中打开时，会使用 mock 文件系统，方便做界面验证。

## 安装与运行

```powershell
npm install
npm run dev
npm start
```

`npm run dev` 启动 Vite 渲染进程和 Electron 开发窗口。

`npm start` 会先构建生产版渲染进程和 Electron 主进程，然后启动 Windows 桌面应用。

## 测试与构建

```powershell
npm test
npm run typecheck
npm run build
npm run package:win
npm run dist:win
npm run smoke:electron
```

`npm test` 运行 Vitest 测试。

`npm run typecheck` 检查渲染进程和 Electron 主进程的 TypeScript 类型。

`npm run package:win` 生成未打包安装器的 Windows x64 构建，输出到 `release/win-unpacked`。

`npm run dist:win` 生成 Windows x64 安装包和便携版，输出到 `release/`：

- `Space-0.1.0-x64-setup.exe`
- `Space-0.1.0-x64-portable.exe`

`npm run smoke:electron` 会构建应用，以 `SPACE_SMOKE_TEST=1` 启动 Electron，确认生产窗口能正常加载后自动退出。

## 项目结构

- `electron/`：Electron 主进程、preload bridge、文件系统服务和工作区持久化逻辑。
- `src/`：React 应用、共享类型、渲染进程 API 适配、路径工具和样式。
- `tests/`：路径工具、文件系统服务和渲染交互的 Vitest 测试。
- `assets/`：应用图标等静态资源。
- `dist/`、`dist-electron/`、`release/`：构建和打包产物，已被 Git 忽略。

## 当前边界

Space 目前聚焦本地 Windows 文件系统。ZIP、TAR、TGZ 和 TAR.GZ 归档可以浏览和解压；7z、rar、加密压缩包、FTP/SFTP、云盘、定时自动同步、系统级全局快捷键，以及提取 Windows 系统图标位图等能力暂未实现。
