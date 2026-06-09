import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateHash,
  copyItems,
  createFile,
  createFolder,
  deleteItems,
  getBootstrap,
  listDirectory,
  moveItems,
  openTerminal,
  previewPath,
  renameItem,
  searchFiles
} from "./fileService.js";
import { WorkspaceStore } from "./workspaceStore.js";
import type {
  CreateItemRequest,
  DeleteRequest,
  FileOperationRequest,
  HashRequest,
  RenameRequest,
  SearchOptions,
  WorkspaceSnapshot
} from "../src/shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow: BrowserWindow | null = null;
let workspaceStore: WorkspaceStore;

function createWindow(): void {
  const isSmokeTest = process.env.SPACE_SMOKE_TEST === "1";
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: "Space",
    backgroundColor: "#101217",
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
    if (isSmokeTest) app.quit();
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
  ipcMain.handle("space:open-path", async (_event, targetPath: string) => {
    const error = await shell.openPath(targetPath);
    return error ? { ok: false, message: error } : { ok: true, message: "Opened.", affectedPaths: [targetPath] };
  });
  ipcMain.handle("space:reveal-path", (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
    return { ok: true, message: "Revealed.", affectedPaths: [targetPath] };
  });
  ipcMain.handle("space:open-terminal", (_event, directoryPath: string) => openTerminal(directoryPath));
  ipcMain.handle("space:get-workspace", () => workspaceStore.read());
  ipcMain.handle("space:save-workspace", (_event, snapshot: WorkspaceSnapshot) => workspaceStore.write(snapshot));
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
