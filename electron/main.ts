import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateHash,
  copyItems,
  createFile,
  createFolder,
  deleteItems,
  applyBatchRename,
  applyFolderSync,
  createArchive,
  extractArchive,
  getBootstrap,
  listArchive,
  listDirectory,
  moveItems,
  openTerminal,
  previewBatchRename,
  previewArchiveEntry,
  previewFolderSync,
  previewPath,
  renameItem,
  runQuickLaunch,
  runSvnCommand,
  searchFiles,
  showSystemContextMenu,
  suggestPaths
} from "./fileService.js";
import { WorkspaceStore } from "./workspaceStore.js";
import type {
  CreateItemRequest,
  ArchiveCreateRequest,
  ArchiveExtractRequest,
  ArchiveListRequest,
  ArchivePreviewRequest,
  BatchRenameRequest,
  DeleteRequest,
  FileOperationRequest,
  FolderSyncRequest,
  HashRequest,
  PathSuggestionRequest,
  QuickLaunchRunRequest,
  RenameRequest,
  SearchOptions,
  SvnCommandRequest,
  SystemContextMenuRequest,
  WorkspaceDocument
} from "../src/shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow: BrowserWindow | null = null;
let workspaceStore: WorkspaceStore;

async function verifySmokeWindow(window: BrowserWindow): Promise<void> {
  try {
    const result = (await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const startedAt = Date.now();
        const check = () => {
          const root = document.querySelector("#root");
          const paneCount = document.querySelectorAll("[aria-label^='Pane ']").length;
          const appShell = document.querySelector(".app-shell");
          const bodyText = document.body?.innerText?.trim() ?? "";
          if (appShell && paneCount === 4) {
            const toolbarButtons = Array.from(document.querySelectorAll('.toolbar .icon-button'));
            const toolbarLabels = toolbarButtons.map((button) => ({
              aria: button.getAttribute('aria-label') ?? '',
              text: button.textContent?.trim() ?? ''
            }));
            const retiredButtons = ['批量重命名', '颜色规则', '快速启动', '工作区搜索'].filter((label) =>
              document.querySelector('.toolbar [aria-label="' + label + '"]')
            );
            const breadcrumbCounts = Array.from(document.querySelectorAll('.explorer-pane .breadcrumbs')).map(
              (node) => node.querySelectorAll('button').length
            );
            const newFileButton = document.querySelector('.toolbar [aria-label="新建文件"]');
            newFileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            window.setTimeout(() => {
              const templateText = Array.from(document.querySelectorAll('.new-file-modal .template-list button')).map(
                (button) => button.textContent?.trim() ?? ''
              );
              const requiredTemplates = ['空白文本', 'Markdown 笔记', 'Word 文档', 'Excel 工作簿', 'PowerPoint 演示文稿'];
              const missingTemplates = requiredTemplates.filter((label) => !templateText.some((text) => text.includes(label)));
              const retiredTemplates = ['JSON', 'PowerShell 脚本', 'HTML 页面'].filter((label) =>
                templateText.some((text) => text.includes(label))
              );
              const failures = [
                toolbarLabels.some((button) => !button.text) ? 'toolbar buttons need text labels' : '',
                retiredButtons.length ? 'retired toolbar buttons still visible: ' + retiredButtons.join(', ') : '',
                toolbarLabels.some((button) => button.aria === 'Windows Terminal') ? '' : 'Windows Terminal toolbar button missing',
                breadcrumbCounts.some((count) => count > 3) ? 'breadcrumbs are not compact' : '',
                missingTemplates.length ? 'missing templates: ' + missingTemplates.join(', ') : '',
                retiredTemplates.length ? 'retired templates still visible: ' + retiredTemplates.join(', ') : ''
              ].filter(Boolean);
              resolve({
                ok: failures.length === 0,
                paneCount,
                toolbarLabels,
                breadcrumbCounts,
                templateText,
                failures,
                bodyText: bodyText.slice(0, 240)
              });
            }, 120);
            return;
          }
          if (Date.now() - startedAt > 8000) {
            resolve({
              ok: false,
              paneCount,
              rootChildren: root?.childElementCount ?? -1,
              bodyText: bodyText.slice(0, 500),
              scripts: Array.from(document.scripts).map((script) => script.src)
            });
            return;
          }
          window.setTimeout(check, 100);
        };
        check();
      })`
    )) as { ok: boolean; paneCount: number; rootChildren?: number; bodyText?: string; scripts?: string[]; failures?: string[] };
    if (!result.ok) {
      console.error(`Smoke check failed: ${JSON.stringify(result)}`);
      app.exit(1);
      return;
    }
    console.log(`Smoke check passed: ${result.paneCount} panes rendered.`);
    app.exit(0);
  } catch (error) {
    console.error(`Smoke check failed: ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
  }
}

function createWindow(): void {
  const isSmokeTest = process.env.SPACE_SMOKE_TEST === "1";
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: "Space",
    icon: path.join(__dirname, "../../assets/icon.ico"),
    backgroundColor: "#f6f8fb",
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (!isSmokeTest) mainWindow?.show();
  });
  mainWindow.webContents.once("did-finish-load", () => {
    if (isSmokeTest && mainWindow) void verifySmokeWindow(mainWindow);
  });
  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (!isSmokeTest) return;
    console.error(`Smoke load failed: ${errorCode} ${errorDescription} ${validatedURL}`);
    app.exit(1);
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle("space:bootstrap", () => getBootstrap());
  ipcMain.handle("space:list-directory", (_event, directoryPath: string) => listDirectory(directoryPath));
  ipcMain.handle("space:search-files", (_event, options: SearchOptions) => searchFiles(options));
  ipcMain.handle("space:suggest-paths", (_event, request: PathSuggestionRequest) => suggestPaths(request));
  ipcMain.handle("space:create-folder", (_event, request: CreateItemRequest) => createFolder(request));
  ipcMain.handle("space:create-file", (_event, request: CreateItemRequest) => createFile(request));
  ipcMain.handle("space:rename-item", (_event, request: RenameRequest) => renameItem(request));
  ipcMain.handle("space:delete-items", (_event, request: DeleteRequest) =>
    deleteItems(request, (targetPath) => shell.trashItem(targetPath))
  );
  ipcMain.handle("space:copy-items", (_event, request: FileOperationRequest) => copyItems(request));
  ipcMain.handle("space:move-items", (_event, request: FileOperationRequest) => moveItems(request));
  ipcMain.handle("space:preview", (_event, targetPath: string) => previewPath(targetPath));
  ipcMain.handle("space:calculate-hash", (_event, request: HashRequest) => calculateHash(request));
  ipcMain.handle("space:preview-batch-rename", (_event, request: BatchRenameRequest) => previewBatchRename(request));
  ipcMain.handle("space:apply-batch-rename", (_event, request: BatchRenameRequest) => applyBatchRename(request));
  ipcMain.handle("space:preview-folder-sync", (_event, request: FolderSyncRequest) => previewFolderSync(request));
  ipcMain.handle("space:apply-folder-sync", (_event, request: FolderSyncRequest) => applyFolderSync(request));
  ipcMain.handle("space:list-archive", (_event, request: ArchiveListRequest) => listArchive(request));
  ipcMain.handle("space:preview-archive-entry", (_event, request: ArchivePreviewRequest) => previewArchiveEntry(request));
  ipcMain.handle("space:extract-archive", (_event, request: ArchiveExtractRequest) => extractArchive(request));
  ipcMain.handle("space:create-archive", (_event, request: ArchiveCreateRequest) => createArchive(request));
  ipcMain.handle("space:open-path", async (_event, targetPath: string) => {
    const error = await shell.openPath(targetPath);
    return error ? { ok: false, message: error } : { ok: true, message: "Opened.", affectedPaths: [targetPath] };
  });
  ipcMain.handle("space:reveal-path", (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
    return { ok: true, message: "Revealed.", affectedPaths: [targetPath] };
  });
  ipcMain.handle("space:open-terminal", (_event, directoryPath: string) => openTerminal(directoryPath));
  ipcMain.handle("space:copy-text-to-clipboard", (_event, text: string) => {
    clipboard.writeText(text);
    return { ok: true, message: "Copied to clipboard." };
  });
  ipcMain.handle("space:run-quick-launch", (_event, request: QuickLaunchRunRequest) => runQuickLaunch(request));
  ipcMain.handle("space:svn-command", (_event, request: SvnCommandRequest) => runSvnCommand(request));
  ipcMain.handle("space:show-system-context-menu", (_event, request: SystemContextMenuRequest) => showSystemContextMenu(request));
  ipcMain.handle("space:get-workspace", () => workspaceStore.read());
  ipcMain.handle("space:save-workspace", (_event, snapshot: WorkspaceDocument) => workspaceStore.write(snapshot));
  ipcMain.handle("space:window-minimize", () => {
    BrowserWindow.getFocusedWindow()?.minimize();
    return { ok: true, message: "Window minimized." };
  });
  ipcMain.handle("space:window-toggle-maximize", () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return { ok: false, message: "Window not found." };
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return { ok: true, message: "Window toggled." };
  });
  ipcMain.handle("space:window-close", () => {
    BrowserWindow.getFocusedWindow()?.close();
    return { ok: true, message: "Window closed." };
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("space.file.manager");
  workspaceStore = new WorkspaceStore(app.getPath("userData"));
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
