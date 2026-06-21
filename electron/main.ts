import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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
  FileEntry,
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
const execFileAsync = promisify(execFile);
let mainWindow: BrowserWindow | null = null;
let workspaceStore: WorkspaceStore;
const systemIconCache = new Map<string, string | null>();
const maxSystemIconCacheEntries = 2500;
const systemIconTimeoutMs = 750;
const genericFolderIconTimeoutMs = 1700;
let genericFolderIconPromise: Promise<string | undefined> | null = null;

function timeout<T>(milliseconds: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), milliseconds);
  });
}

function isWindowsDriveRoot(filePath: string): boolean {
  return /^[A-Za-z]:\\?$/.test(filePath);
}

function getPowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot;
  return systemRoot ? path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
}

async function loadGenericFolderIconDataUrl(): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined;
  const script = `
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName System.Drawing;
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SpaceShellIcon {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
    public string szTypeName;
  }
  [DllImport("Shell32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@;
$info = New-Object SpaceShellIcon+SHFILEINFO;
$flags = 0x000000100 -bor 0x000000001 -bor 0x000000010;
$attrs = 0x00000010;
$infoSize = [Runtime.InteropServices.Marshal]::SizeOf($info);
[void][SpaceShellIcon]::SHGetFileInfo('folder', $attrs, [ref]$info, $infoSize, $flags);
if ($info.hIcon -eq [IntPtr]::Zero) { return; }
$icon = [System.Drawing.Icon]::FromHandle($info.hIcon);
$bitmap = $icon.ToBitmap();
$stream = New-Object System.IO.MemoryStream;
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png);
[SpaceShellIcon]::DestroyIcon($info.hIcon) | Out-Null;
'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray());
`;
  try {
    const { stdout } = await execFileAsync(
      getPowerShellExecutable(),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 1500, maxBuffer: 256 * 1024 }
    );
    const dataUrl = stdout.trim();
    return dataUrl.startsWith("data:image/png;base64,") ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}

function getGenericFolderIconDataUrl(): Promise<string | undefined> {
  genericFolderIconPromise ??= loadGenericFolderIconDataUrl();
  return genericFolderIconPromise;
}

async function getSystemIconDataUrl(entry: FileEntry): Promise<string | undefined> {
  const cacheKey = entry.path.toLowerCase();
  if (systemIconCache.has(cacheKey)) return systemIconCache.get(cacheKey) ?? undefined;
  if (systemIconCache.size > maxSystemIconCacheEntries) systemIconCache.clear();

  if (entry.isDirectory && !isWindowsDriveRoot(entry.path)) {
    const timedOut = "__space_folder_icon_timeout__";
    const folderIcon = await Promise.race([getGenericFolderIconDataUrl(), timeout(genericFolderIconTimeoutMs, timedOut)]);
    if (folderIcon === timedOut) return undefined;
    systemIconCache.set(cacheKey, folderIcon || null);
    return folderIcon || undefined;
  }

  try {
    const iconRequest = app
      .getFileIcon(entry.path, { size: "small" })
      .then((icon) => (icon.isEmpty() ? undefined : icon.toDataURL()))
      .catch(() => undefined);
    const dataUrl = await Promise.race([iconRequest, timeout(systemIconTimeoutMs, undefined)]);
    systemIconCache.set(cacheKey, dataUrl || null);
    return dataUrl || undefined;
  } catch {
    systemIconCache.set(cacheKey, null);
    return undefined;
  }
}

async function attachSystemIcons(entries: FileEntry[]): Promise<FileEntry[]> {
  const withIcons: FileEntry[] = [];
  const batchSize = 32;
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    const enriched = await Promise.all(
      batch.map(async (entry) => ({
        ...entry,
        systemIconDataUrl: await getSystemIconDataUrl(entry)
      }))
    );
    withIcons.push(...enriched);
  }
  return withIcons;
}

async function listDirectoryWithSystemIcons(directoryPath: string) {
  const payload = await listDirectory(directoryPath);
  return {
    ...payload,
    entries: await attachSystemIcons(payload.entries)
  };
}

async function searchFilesWithSystemIcons(options: SearchOptions) {
  return attachSystemIcons(await searchFiles(options));
}

async function verifySmokeWindow(window: BrowserWindow): Promise<void> {
  try {
    const result = (await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const startedAt = Date.now();
        const check = () => {
          const root = document.querySelector("#root");
          const paneCount = document.querySelectorAll("[aria-label^='Pane ']").length;
          const appShell = document.querySelector(".app-shell");
          const loadingCount = document.querySelectorAll('.pane-overlay').length;
          const bodyText = document.body?.innerText?.trim() ?? "";
          if (appShell && paneCount === 4 && loadingCount === 0) {
            const toolbarButtons = Array.from(document.querySelectorAll('.toolbar .icon-button'));
            const toolbarLabels = toolbarButtons.map((button) => ({
              aria: button.getAttribute('aria-label') ?? '',
              text: button.textContent?.trim() ?? ''
            }));
            const retiredButtons = ['批量重命名', '颜色规则', '快速启动', '工作区搜索'].filter((label) =>
              document.querySelector('.toolbar [aria-label="' + label + '"]')
            );
            const breadcrumbAddressCount = document.querySelectorAll('.explorer-pane .breadcrumb-address').length;
            const retiredPathButtons = document.querySelectorAll('.explorer-pane .path-menu-trigger').length;
            const visibleAddressInputs = document.querySelectorAll('.explorer-pane .address-row input').length;
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
                breadcrumbAddressCount === 4 ? '' : 'merged breadcrumb address bars missing',
                retiredPathButtons ? 'retired path dropdown still visible' : '',
                visibleAddressInputs ? 'traditional address input visible by default' : '',
                missingTemplates.length ? 'missing templates: ' + missingTemplates.join(', ') : '',
                retiredTemplates.length ? 'retired templates still visible: ' + retiredTemplates.join(', ') : ''
              ].filter(Boolean);
              resolve({
                ok: failures.length === 0,
                paneCount,
                loadingCount,
                toolbarLabels,
                breadcrumbAddressCount,
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
              loadingCount,
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
  ipcMain.handle("space:list-directory", (_event, directoryPath: string) => listDirectoryWithSystemIcons(directoryPath));
  ipcMain.handle("space:search-files", (_event, options: SearchOptions) => searchFilesWithSystemIcons(options));
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
